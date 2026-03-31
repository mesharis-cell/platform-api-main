import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { accessPolicies, companies, users } from "../../../db/schema";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    assertPolicyMatchesRole,
    computeEffectivePermissions,
    DEFAULT_ACCESS_POLICY_CODES,
} from "../../utils/access-policy";
import { permissionChecker, validDateChecker } from "../../utils/checker";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateUserPayload } from "./user.interfaces";
import { userQueryValidationConfig } from "./user.utils";

const TEMP_PASSWORD_LENGTH = 14;
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";

const shuffle = (value: string[]) => {
    for (let i = value.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [value[i], value[j]] = [value[j], value[i]];
    }
    return value.join("");
};

const generateTemporaryPassword = (length: number = TEMP_PASSWORD_LENGTH) => {
    const safeLength = Math.max(10, Math.min(64, Math.floor(length)));
    const required = [
        UPPER[randomInt(0, UPPER.length)],
        LOWER[randomInt(0, LOWER.length)],
        DIGITS[randomInt(0, DIGITS.length)],
        SYMBOLS[randomInt(0, SYMBOLS.length)],
    ];
    const allChars = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`;

    while (required.length < safeLength) {
        required.push(allChars[randomInt(0, allChars.length)]);
    }

    return shuffle(required);
};

const assertPasswordManagementAccess = (
    actor: AuthUser,
    target: { id: string; is_super_admin: boolean }
) => {
    if (target.is_super_admin && !actor.is_super_admin) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only super admins can manage passwords for super admin users"
        );
    }
};

const validateCompany = async (companyId: string, platformId: string) => {
    const [company] = await db
        .select()
        .from(companies)
        .where(
            and(
                eq(companies.id, companyId),
                eq(companies.platform_id, platformId),
                isNull(companies.deleted_at)
            )
        );

    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
    }
};

const getAccessPolicy = async (
    accessPolicyId: string | null | undefined,
    platformId: string,
    role: "ADMIN" | "LOGISTICS" | "CLIENT"
) => {
    if (!accessPolicyId) return null;

    const [policy] = await db
        .select()
        .from(accessPolicies)
        .where(
            and(eq(accessPolicies.id, accessPolicyId), eq(accessPolicies.platform_id, platformId))
        )
        .limit(1);

    if (!policy) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Access policy not found");
    }

    assertPolicyMatchesRole(role, {
        id: policy.id,
        role: policy.role,
        is_active: policy.is_active,
    });

    return policy;
};

const getDefaultAccessPolicy = async (
    platformId: string,
    role: "ADMIN" | "LOGISTICS" | "CLIENT"
) => {
    const [policy] = await db
        .select()
        .from(accessPolicies)
        .where(
            and(
                eq(accessPolicies.platform_id, platformId),
                eq(accessPolicies.code, DEFAULT_ACCESS_POLICY_CODES[role])
            )
        )
        .limit(1);

    return policy ?? null;
};

const projectUser = (user: {
    id: string;
    platform_id: string;
    company_id: string | null;
    name: string;
    email: string;
    role: "ADMIN" | "LOGISTICS" | "CLIENT";
    permissions: string[];
    access_policy_id: string | null;
    permission_grants: string[];
    permission_revokes: string[];
    is_super_admin: boolean;
    is_active: boolean;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
    company?: { id: string; name: string } | null;
    access_policy?: {
        id: string;
        code: string;
        name: string;
        role: "ADMIN" | "LOGISTICS" | "CLIENT";
        permissions: string[];
        is_active: boolean;
    } | null;
}) => {
    const effectivePermissions = computeEffectivePermissions({
        accessPolicyPermissions: user.access_policy?.permissions,
        permissionGrants: user.permission_grants,
        permissionRevokes: user.permission_revokes,
    });

    return {
        ...user,
        permissions: effectivePermissions,
        effective_permissions: effectivePermissions,
        access_policy: user.access_policy
            ? {
                  id: user.access_policy.id,
                  code: user.access_policy.code,
                  name: user.access_policy.name,
                  role: user.access_policy.role,
                  is_active: user.access_policy.is_active,
              }
            : null,
    };
};

const getUserQuery = (platformId: string, conditions: any[] = []) =>
    db.query.users.findMany({
        where: and(eq(users.platform_id, platformId), ...conditions),
        with: {
            company: {
                columns: {
                    id: true,
                    name: true,
                },
            },
            access_policy: {
                columns: {
                    id: true,
                    code: true,
                    name: true,
                    role: true,
                    permissions: true,
                    is_active: true,
                },
            },
        },
        columns: {
            password: false,
        },
    });

const getUserForPasswordManagement = async (id: string, platformId: string) => {
    const [target] = await db
        .select({
            id: users.id,
            platform_id: users.platform_id,
            company_id: users.company_id,
            name: users.name,
            email: users.email,
            password: users.password,
            role: users.role,
            permissions: users.permissions,
            access_policy_id: users.access_policy_id,
            permission_grants: users.permission_grants,
            permission_revokes: users.permission_revokes,
            is_super_admin: users.is_super_admin,
            is_active: users.is_active,
            last_login_at: users.last_login_at,
            created_at: users.created_at,
            updated_at: users.updated_at,
        })
        .from(users)
        .where(and(eq(users.id, id), eq(users.platform_id, platformId)))
        .limit(1);

    if (!target) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
    }

    return target;
};

const createUser = async (data: CreateUserPayload) => {
    try {
        if (data.company_id) {
            await validateCompany(data.company_id, data.platform_id);
        }

        const accessPolicy =
            (await getAccessPolicy(data.access_policy_id, data.platform_id, data.role)) ??
            (await getDefaultAccessPolicy(data.platform_id, data.role));

        const permissionGrants = permissionChecker(data.permission_grants);
        const permissionRevokes = permissionChecker(data.permission_revokes);
        const hashedPassword = await bcrypt.hash(data.password, config.salt_rounds);

        const [result] = await db
            .insert(users)
            .values({
                ...data,
                password: hashedPassword,
                permissions: [],
                access_policy_id: accessPolicy?.id ?? null,
                permission_grants: permissionGrants,
                permission_revokes: permissionRevokes,
            })
            .returning();

        const [created] = await getUserQuery(data.platform_id, [eq(users.id, result.id)]);
        return projectUser(created as any);
    } catch (error: any) {
        const pgError = error.cause || error;

        if (pgError.code === "23505" && pgError.constraint === "user_platform_email_unique") {
            throw new CustomizedError(httpStatus.CONFLICT, "User with this email already exists");
        }

        throw error;
    }
};

const getUsers = async (platformId: string, query: Record<string, any>) => {
    const { search_term, page, limit, sort_by, sort_order, from_date, to_date, ...remainingQuery } =
        query;

    if (sort_by) queryValidator(userQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(userQueryValidationConfig, "sort_order", sort_order);

    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    const conditions: any[] = [eq(users.platform_id, platformId)];

    if (search_term) {
        conditions.push(
            or(
                ilike(users.name, `%${search_term.trim()}%`),
                ilike(users.email, `%${search_term.trim()}%`)
            )
        );
    }
    if (from_date) conditions.push(gte(users.created_at, validDateChecker(from_date, "from_date")));
    if (to_date) conditions.push(lte(users.created_at, validDateChecker(to_date, "to_date")));

    if (Object.keys(remainingQuery).length) {
        for (const [key, value] of Object.entries(remainingQuery)) {
            queryValidator(userQueryValidationConfig, key, value);
            if (key === "role") {
                conditions.push(
                    value.includes(",")
                        ? inArray(users.role, value.split(","))
                        : eq(users.role, value)
                );
            } else if (key === "isActive" || key === "is_active") {
                conditions.push(eq(users.is_active, value === "true"));
            } else if (key === "company" || key === "company_id") {
                conditions.push(eq(users.company_id, value));
            } else if (key === "access_policy_id") {
                conditions.push(eq(users.access_policy_id, value));
            }
        }
    }

    let orderByColumn: any = users.created_at;
    if (sortWith === "id") orderByColumn = users.id;
    else if (sortWith === "name") orderByColumn = users.name;
    else if (sortWith === "email") orderByColumn = users.email;
    else if (sortWith === "role") orderByColumn = users.role;
    else if (sortWith === "created_at" || sortWith === "createdAt")
        orderByColumn = users.created_at;
    else if (sortWith === "updated_at" || sortWith === "updatedAt")
        orderByColumn = users.updated_at;

    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    const [result, total] = await Promise.all([
        db.query.users.findMany({
            where: and(...conditions),
            with: {
                company: {
                    columns: { id: true, name: true },
                },
                access_policy: {
                    columns: {
                        id: true,
                        code: true,
                        name: true,
                        role: true,
                        permissions: true,
                        is_active: true,
                    },
                },
            },
            columns: {
                password: false,
            },
            orderBy: orderDirection,
            limit: limitNumber,
            offset: skip,
        }),
        db
            .select({ count: count() })
            .from(users)
            .where(and(...conditions)),
    ]);

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
        },
        data: result.map((row) => projectUser(row as any)),
    };
};

const getUserById = async (id: string, platformId: string) => {
    const user = await db.query.users.findFirst({
        where: and(eq(users.id, id), eq(users.platform_id, platformId)),
        with: {
            company: {
                columns: { id: true, name: true },
            },
            access_policy: {
                columns: {
                    id: true,
                    code: true,
                    name: true,
                    role: true,
                    permissions: true,
                    is_active: true,
                },
            },
        },
        columns: {
            password: false,
        },
    });

    if (!user) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
    }

    return projectUser(user as any);
};

const updateUser = async (
    id: string,
    platformId: string,
    data: Partial<CreateUserPayload>,
    user: AuthUser
) => {
    const existingUser = await getUserById(id, platformId);

    if ((data as any).email || (data as any).password || (data as any).role) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Only name, access_policy_id, permission_grants, permission_revokes, company_id, and is_active can be updated"
        );
    }

    if (
        !user.is_super_admin &&
        user.id === id &&
        (data.access_policy_id !== undefined ||
            data.permission_grants !== undefined ||
            data.permission_revokes !== undefined)
    ) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "You cannot update your own access policy or permission overrides. Ask another super admin."
        );
    }

    if ((data as any).is_super_admin !== undefined && !user.is_super_admin) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only super admins can grant or revoke super admin status"
        );
    }

    if (data.company_id) {
        await validateCompany(data.company_id, platformId);
    }

    const accessPolicy =
        data.access_policy_id !== undefined
            ? await getAccessPolicy(data.access_policy_id, platformId, existingUser.role)
            : undefined;

    const finalData: any = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.company_id !== undefined && { company_id: data.company_id }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        ...((data as any).is_super_admin !== undefined && {
            is_super_admin: (data as any).is_super_admin,
        }),
        ...(data.access_policy_id !== undefined && { access_policy_id: accessPolicy?.id ?? null }),
        ...(data.permission_grants !== undefined && {
            permission_grants: permissionChecker(data.permission_grants),
        }),
        ...(data.permission_revokes !== undefined && {
            permission_revokes: permissionChecker(data.permission_revokes),
        }),
        updated_at: new Date(),
    };

    await db
        .update(users)
        .set(finalData)
        .where(and(eq(users.id, id), eq(users.platform_id, platformId)));

    return getUserById(id, platformId);
};

const setUserPassword = async (
    id: string,
    platformId: string,
    newPassword: string,
    actor: AuthUser
) => {
    const target = await getUserForPasswordManagement(id, platformId);
    assertPasswordManagementAccess(actor, target);

    const isSamePassword = await bcrypt.compare(newPassword, target.password);
    if (isSamePassword) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "New password cannot be the same as the current password"
        );
    }

    const hashedPassword = await bcrypt.hash(newPassword, config.salt_rounds);
    await db
        .update(users)
        .set({
            password: hashedPassword,
            updated_at: new Date(),
        })
        .where(and(eq(users.id, id), eq(users.platform_id, platformId)));

    return getUserById(id, platformId);
};

const generateUserPassword = async (
    id: string,
    platformId: string,
    length: number | undefined,
    actor: AuthUser
) => {
    const target = await getUserForPasswordManagement(id, platformId);
    assertPasswordManagementAccess(actor, target);

    let temporaryPassword = generateTemporaryPassword(length);
    if (await bcrypt.compare(temporaryPassword, target.password)) {
        temporaryPassword = generateTemporaryPassword(length);
    }

    const hashedPassword = await bcrypt.hash(temporaryPassword, config.salt_rounds);
    await db
        .update(users)
        .set({
            password: hashedPassword,
            updated_at: new Date(),
        })
        .where(and(eq(users.id, id), eq(users.platform_id, platformId)));

    return {
        user: await getUserById(id, platformId),
        temporary_password: temporaryPassword,
    };
};

export const UserServices = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    setUserPassword,
    generateUserPassword,
};
