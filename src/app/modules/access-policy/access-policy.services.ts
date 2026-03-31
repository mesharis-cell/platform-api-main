import { and, asc, count, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { accessPolicies, users } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { permissionChecker } from "../../utils/checker";
import { CreateAccessPolicyPayload, UpdateAccessPolicyPayload } from "./access-policy.interfaces";

const listAccessPolicies = async (platformId: string, role?: string) => {
    const rows = await db
        .select({
            id: accessPolicies.id,
            platform_id: accessPolicies.platform_id,
            code: accessPolicies.code,
            name: accessPolicies.name,
            description: accessPolicies.description,
            role: accessPolicies.role,
            permissions: accessPolicies.permissions,
            is_active: accessPolicies.is_active,
            created_at: accessPolicies.created_at,
            updated_at: accessPolicies.updated_at,
            assigned_user_count: count(users.id),
        })
        .from(accessPolicies)
        .leftJoin(users, eq(users.access_policy_id, accessPolicies.id))
        .where(
            role
                ? and(
                      eq(accessPolicies.platform_id, platformId),
                      eq(accessPolicies.role, role as any)
                  )
                : eq(accessPolicies.platform_id, platformId)
        )
        .groupBy(
            accessPolicies.id,
            accessPolicies.platform_id,
            accessPolicies.code,
            accessPolicies.name,
            accessPolicies.description,
            accessPolicies.role,
            accessPolicies.permissions,
            accessPolicies.is_active,
            accessPolicies.created_at,
            accessPolicies.updated_at
        )
        .orderBy(asc(accessPolicies.role), asc(accessPolicies.name));

    return rows;
};

const getAccessPolicyById = async (id: string, platformId: string) => {
    const [policy] = await db
        .select()
        .from(accessPolicies)
        .where(and(eq(accessPolicies.id, id), eq(accessPolicies.platform_id, platformId)))
        .limit(1);

    if (!policy) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Access policy not found");
    }

    return policy;
};

const createAccessPolicy = async (platformId: string, payload: CreateAccessPolicyPayload) => {
    const permissions = permissionChecker(payload.permissions);
    const [created] = await db
        .insert(accessPolicies)
        .values({
            platform_id: platformId,
            code: payload.code.trim().toUpperCase(),
            name: payload.name.trim(),
            description: payload.description?.trim() || null,
            role: payload.role,
            permissions,
            is_active: payload.is_active ?? true,
        })
        .returning();

    return created;
};

const updateAccessPolicy = async (
    id: string,
    platformId: string,
    payload: UpdateAccessPolicyPayload
) => {
    await getAccessPolicyById(id, platformId);

    const [updated] = await db
        .update(accessPolicies)
        .set({
            ...(payload.code !== undefined && { code: payload.code.trim().toUpperCase() }),
            ...(payload.name !== undefined && { name: payload.name.trim() }),
            ...(payload.description !== undefined && {
                description: payload.description?.trim() || null,
            }),
            ...(payload.role !== undefined && { role: payload.role }),
            ...(payload.permissions !== undefined && {
                permissions: permissionChecker(payload.permissions),
            }),
            ...(payload.is_active !== undefined && { is_active: payload.is_active }),
            updated_at: new Date(),
        })
        .where(and(eq(accessPolicies.id, id), eq(accessPolicies.platform_id, platformId)))
        .returning();

    return updated;
};

const deleteAccessPolicy = async (id: string, platformId: string) => {
    const [assigned] = await db
        .select({ count: count(users.id) })
        .from(users)
        .where(and(eq(users.platform_id, platformId), eq(users.access_policy_id, id)));

    if ((assigned?.count ?? 0) > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Cannot delete an access policy assigned to users"
        );
    }

    await getAccessPolicyById(id, platformId);
    await db
        .delete(accessPolicies)
        .where(and(eq(accessPolicies.id, id), eq(accessPolicies.platform_id, platformId)));

    return { id };
};

export const AccessPolicyServices = {
    listAccessPolicies,
    getAccessPolicyById,
    createAccessPolicy,
    updateAccessPolicy,
    deleteAccessPolicy,
};
