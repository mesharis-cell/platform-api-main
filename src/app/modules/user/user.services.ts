import bcrypt from "bcrypt";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import config from "../../config";
import { validDateChecker } from "../../utils/checker";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateUserPayload } from "./user.interfaces";
import { userQueryValidationConfig } from "./user.utils";

// ----------------------------------- CREATE USER ------------------------------------
const createUser = async (data: CreateUserPayload) => {
  // Hash the password
  const hashedPassword = await bcrypt.hash(data.password, config.salt_rounds);

  // Prepare user data with hashed password
  const userData = {
    ...data,
    password: hashedPassword,
  };

  const result = await db.insert(users).values(userData).returning();
  return result[0];
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

  // Build WHERE conditions
  const conditions: any[] = [eq(users.platform, platformId)];

  // Search term - case insensitive search on name and email
  if (search_term) {
    conditions.push(
      or(
        ilike(users.name, `%${search_term.trim()}%`),
        ilike(users.email, `%${search_term.trim()}%`)
      )
    );
  }

  // Date range filtering
  if (from_date) {
    const date = validDateChecker(from_date, "from_date");
    conditions.push(gte(users.createdAt, date));
  }

  if (to_date) {
    const date = validDateChecker(to_date, "to_date");
    conditions.push(lte(users.createdAt, date));
  }

  // Handle remaining query parameters (role, isActive, etc.)
  if (Object.keys(remainingQuery).length) {
    for (const [key, value] of Object.entries(remainingQuery)) {
      queryValidator(userQueryValidationConfig, key, value);
      
      // Map query keys to schema fields
      if (key === "role") {
        if (value.includes(",")) {
          conditions.push(inArray(users.role, value.split(",")));
        } else {
          conditions.push(eq(users.role, value));
        }
      } else if (key === "isActive" || key === "is_active") {
        const boolValue = value === "true";
        conditions.push(eq(users.isActive, boolValue));
      } else if (key === "platform") {
        conditions.push(eq(users.platform, value));
      } else if (key === "company") {
        conditions.push(eq(users.company, value));
      }
    }
  }

  // Determine sort order
  let orderByColumn: any = users.createdAt; // default
  if (sortWith === "id") orderByColumn = users.id;
  else if (sortWith === "name") orderByColumn = users.name;
  else if (sortWith === "email") orderByColumn = users.email;
  else if (sortWith === "role") orderByColumn = users.role;
  else if (sortWith === "created_at" || sortWith === "createdAt") orderByColumn = users.createdAt;
  else if (sortWith === "updated_at" || sortWith === "updatedAt") orderByColumn = users.updatedAt;

  const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

  // Execute queries in parallel
  const [result, total] = await Promise.all([
    // Get paginated users
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        platform: users.platform,
        company: users.company,
        permissions: users.permissions,
        permission_template: users.permission_template,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(orderDirection)
      .limit(limitNumber)
      .offset(skip),

    // Get count by role
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

export const UserServices = {
  createUser,
  getUsers,
};
