import bcrypt from "bcrypt";
import { and, eq, inArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import { accessPolicies, users } from "../../db/schema";
import config from "../config";
import CustomizedError from "../error/customized-error";
import { DEFAULT_ACCESS_POLICIES, DEFAULT_ACCESS_POLICY_CODES } from "../utils/access-policy";

type InitialAdminInput = {
    name: string;
    email: string;
    password: string;
};

const listDefaultAccessPolicies = async (platformId: string) =>
    db
        .select()
        .from(accessPolicies)
        .where(
            and(
                eq(accessPolicies.platform_id, platformId),
                inArray(
                    accessPolicies.code,
                    DEFAULT_ACCESS_POLICIES.map((policy) => policy.code)
                )
            )
        );

const createDefaultAccessPolicies = async (platformId: string) => {
    const existing = await db
        .select({ code: accessPolicies.code })
        .from(accessPolicies)
        .where(eq(accessPolicies.platform_id, platformId));

    const existingCodes = new Set(existing.map((row) => row.code));
    const missing = DEFAULT_ACCESS_POLICIES.filter((policy) => !existingCodes.has(policy.code));

    if (missing.length > 0) {
        await db.insert(accessPolicies).values(
            missing.map((policy) => ({
                platform_id: platformId,
                code: policy.code,
                role: policy.role,
                name: policy.name,
                description: policy.description,
                permissions: policy.permissions,
            }))
        );
    }

    return listDefaultAccessPolicies(platformId);
};

const getAdminDefaultPolicy = async (platformId: string) => {
    const [policy] = await db
        .select()
        .from(accessPolicies)
        .where(
            and(
                eq(accessPolicies.platform_id, platformId),
                eq(accessPolicies.code, DEFAULT_ACCESS_POLICY_CODES.ADMIN)
            )
        )
        .limit(1);

    if (!policy) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Admin default access policy is missing for this platform"
        );
    }

    return policy;
};

const ensureSystemUser = async (platformId: string) => {
    const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.platform_id, platformId), eq(users.email, config.system_user_email)))
        .limit(1);

    if (existing) {
        return existing;
    }

    const adminPolicy = await getAdminDefaultPolicy(platformId);
    const hashedPassword = await bcrypt.hash(config.system_user_password, config.salt_rounds);

    const [created] = await db
        .insert(users)
        .values({
            platform_id: platformId,
            name: "System User",
            email: config.system_user_email,
            password: hashedPassword,
            role: "ADMIN",
            permissions: [],
            access_policy_id: adminPolicy.id,
        })
        .returning();

    return created;
};

const createInitialAdminUser = async (platformId: string, input: InitialAdminInput) => {
    const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.platform_id, platformId), eq(users.email, input.email)))
        .limit(1);

    if (existing) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "A user with this email already exists on the platform"
        );
    }

    const adminPolicy = await getAdminDefaultPolicy(platformId);
    const hashedPassword = await bcrypt.hash(input.password, config.salt_rounds);

    const [created] = await db
        .insert(users)
        .values({
            platform_id: platformId,
            name: input.name.trim(),
            email: input.email.trim().toLowerCase(),
            password: hashedPassword,
            role: "ADMIN",
            permissions: [],
            access_policy_id: adminPolicy.id,
        })
        .returning();

    return created;
};

const bootstrapPlatform = async ({
    platformId,
    createSystemUser = true,
    initialAdmin,
}: {
    platformId: string;
    createSystemUser?: boolean;
    initialAdmin?: InitialAdminInput;
}) => {
    const policies = await createDefaultAccessPolicies(platformId);
    const systemUser = createSystemUser ? await ensureSystemUser(platformId) : null;
    const adminUser = initialAdmin ? await createInitialAdminUser(platformId, initialAdmin) : null;

    return {
        policies,
        systemUser,
        adminUser,
    };
};

export const PlatformBootstrapService = {
    bootstrapPlatform,
    createDefaultAccessPolicies,
    ensureSystemUser,
    createInitialAdminUser,
};
