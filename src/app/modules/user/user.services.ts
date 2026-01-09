import bcrypt from "bcrypt";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, users } from "../../../db/schema";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { permissionChecker, validDateChecker } from "../../utils/checker";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateUserPayload } from "./user.interfaces";
import { userQueryValidationConfig } from "./user.utils";

// ----------------------------------- CREATE USER ------------------------------------
const createUser = async (data: CreateUserPayload) => {
  try {
    // Step 1: If company_id is provided, validate it exists and is not deleted
    if (data.company_id) {
      const [company] = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.id, data.company_id),
            eq(companies.platform_id, data.platform_id),
            isNull(companies.deleted_at)
          )
        );

      if (!company) {
        throw new CustomizedError(
          httpStatus.NOT_FOUND,
          "Company not found or is archived"
        );
      }
    }

    // Step 2: Validate permissions
    const permissions = permissionChecker(data.role, data.permissions, data.permission_template);

    // Step 3: Hash the password
    const hashedPassword = await bcrypt.hash(data.password, config.salt_rounds);

    // Step 4: Prepare user data with hashed password
    const userData = {
      ...data,
      password: hashedPassword,
      permissions,
    };

    // Step 5: Insert user into database
    const [result] = await db.insert(users).values(userData).returning();
    return result;
  } catch (error: any) {
    const pgError = error.cause || error;

    if (pgError.code === "23505") {
      if (pgError.constraint === "user_platform_email_unique") {
        throw new CustomizedError(
          httpStatus.CONFLICT,
          "User with this email already exists"
        );
      }
    }
    throw error;
  }
};

// ----------------------------------- GET USERS ------------------------------------
const getUsers = async (platformId: string, query: Record<string, any>) => {
  const {
    search_term,
    page,
    limit,
    sort_by,
    sort_order,
    from_date,
    to_date,
    ...remainingQuery
  } = query;

  // Step 1: Validate query parameters
  if (sort_by) queryValidator(userQueryValidationConfig, "sort_by", sort_by);
  if (sort_order)
    queryValidator(userQueryValidationConfig, "sort_order", sort_order);

  const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
    paginationMaker({
      page,
      limit,
      sort_by,
      sort_order,
    });

  // Step 2: Build WHERE conditions
  const conditions: any[] = [eq(users.platform_id, platformId)];

  // Step 3: Add date range and search filters
  if (search_term) {
    conditions.push(
      or(
        ilike(users.name, `%${search_term.trim()}%`),
        ilike(users.email, `%${search_term.trim()}%`)
      )
    );
  }
  if (from_date) {
    const date = validDateChecker(from_date, "from_date");
    conditions.push(gte(users.created_at, date));
  }

  if (to_date) {
    const date = validDateChecker(to_date, "to_date");
    conditions.push(lte(users.created_at, date));
  }

  // Step 4: Handle remaining query parameters (role, isActive, etc.)
  if (Object.keys(remainingQuery).length) {
    for (const [key, value] of Object.entries(remainingQuery)) {
      queryValidator(userQueryValidationConfig, key, value);

      if (key === "role") {
        if (value.includes(",")) {
          conditions.push(inArray(users.role, value.split(",")));
        } else {
          conditions.push(eq(users.role, value));
        }
      } else if (key === "isActive" || key === "is_active") {
        const boolValue = value === "true";
        conditions.push(eq(users.is_active, boolValue));
      } else if (key === "platform" || key === "platform_id") {
        conditions.push(eq(users.platform_id, value));
      } else if (key === "company" || key === "company_id") {
        conditions.push(eq(users.company_id, value));
      } else if (key === "permission_template") {
        conditions.push(eq(users.permission_template, value));
      }
    }
  }

  // Step 5: Determine sort order
  let orderByColumn: any = users.created_at;
  if (sortWith === "id") orderByColumn = users.id;
  else if (sortWith === "name") orderByColumn = users.name;
  else if (sortWith === "email") orderByColumn = users.email;
  else if (sortWith === "role") orderByColumn = users.role;
  else if (sortWith === "created_at" || sortWith === "createdAt") orderByColumn = users.created_at;
  else if (sortWith === "updated_at" || sortWith === "updatedAt") orderByColumn = users.updated_at;

  const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

  // Step 6: Execute queries in parallel
  const [result, total] = await Promise.all([
    db.query.users.findMany({
      where: and(...conditions),
      with: {
        company: true,
      },
      columns: {
        company_id: false,
      },
      orderBy: orderDirection,
      limit: limitNumber,
      offset: skip,
    }),

    db
      .select({
        count: count(),
      })
      .from(users)
      .where(and(...conditions)),
  ]);

  return {
    meta: {
      page: pageNumber,
      limit: limitNumber,
      total: total[0].count,
    },
    data: result,
  };
};

// ----------------------------------- GET USER BY ID ---------------------------------
const getUserById = async (id: string, platformId: string) => {
  // Step 1: Build WHERE conditions
  const conditions: any[] = [
    eq(users.id, id),
    eq(users.platform_id, platformId),
  ];

  // Step 2: Fetch user
  const user = await db.query.users.findFirst({
    where: and(...conditions),
    with: {
      company: true,
    },
    columns: {
      company_id: false,
    },
  });

  // Step 3: Handle not found
  if (!user) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
  }

  return user;
};

// ----------------------------------- UPDATE USER ------------------------------------
const updateUser = async (
  id: string,
  platformId: string,
  data: Partial<CreateUserPayload>
) => {
  // Step 1: Check if user exists
  const existingUser = await getUserById(id, platformId);

  // Only name, permission_template, permissions, company_id, and is_active can be updated
  if (
    data.email ||
    data.password ||
    data.role
  ) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      "Only name, permission_template, permissions, company_id, and is_active can be updated"
    );
  }

  // Handle activation/deactivation side effects
  let finalData: any = { ...data };

  // Validate company_id if provided
  if (data.company_id) {
    const [company] = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.id, data.company_id),
          eq(companies.platform_id, platformId),
          isNull(companies.deleted_at)
        )
      );

    if (!company) {
      throw new CustomizedError(
        httpStatus.NOT_FOUND,
        "Company not found or is archived"
      );
    }
  }
  if (data.is_active !== undefined) {
    if (data.is_active === false) {
      finalData.deleted_at = new Date();
    } else {
      finalData.deleted_at = null;
    }
  }


  // Step 2: Validate permissions
  if ((data.permissions && data.permissions.length > 0) || data.permission_template) {
    finalData.permissions = permissionChecker(data.role || existingUser.role, data.permissions, data.permission_template)
  }

  // Step 3: Update user
  const [result] = await db
    .update(users)
    .set({
      ...finalData,
      updated_at: new Date(),
    })
    .where(and(eq(users.id, id), eq(users.platform_id, platformId)))
    .returning();

  return result;
};

export const UserServices = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
};
