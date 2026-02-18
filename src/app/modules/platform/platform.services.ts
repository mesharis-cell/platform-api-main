import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { platforms, users } from "../../../db/schema";
import config from "../../config";
import { permissionChecker } from "../../utils/checker";
import { CreatePlatformPayload } from "./platform.interfaces";
import bcrypt from "bcrypt";

// ----------------------------------- CREATE PLATFORM --------------------------------
const createPlatform = async (data: CreatePlatformPayload) => {
    const result = await db.transaction(async (tx) => {
        const [platform] = await tx.insert(platforms).values(data).returning();

        if (platform?.id) {
            const hashedPassword = await bcrypt.hash(
                config.system_user_password,
                config.salt_rounds
            );

            const permissions = permissionChecker("ADMIN", undefined, "PLATFORM_ADMIN");

            await tx.insert(users).values({
                platform_id: platform.id,
                name: "System User",
                email: config.system_user_email,
                password: hashedPassword,
                role: "ADMIN",
                permissions,
                permission_template: "PLATFORM_ADMIN",
            });
        }

        return platform;
    });

    return result;
};

const getPlatform = async (platformId: string) => {
    const [platform] = await db.select().from(platforms).where(eq(platforms.id, platformId));
    return platform ?? null;
};

const updatePlatformConfig = async (platformId: string, patch: Record<string, unknown>) => {
    const [existing] = await db
        .select({ config: platforms.config })
        .from(platforms)
        .where(eq(platforms.id, platformId));
    const merged = { ...((existing?.config as object) ?? {}), ...patch };
    const [updated] = await db
        .update(platforms)
        .set({ config: merged })
        .where(eq(platforms.id, platformId))
        .returning();
    return updated;
};

const updatePlatformFeatures = async (platformId: string, patch: Record<string, boolean>) => {
    const [existing] = await db
        .select({ features: platforms.features })
        .from(platforms)
        .where(eq(platforms.id, platformId));
    const merged = { ...((existing?.features as object) ?? {}), ...patch };
    const [updated] = await db
        .update(platforms)
        .set({ features: merged })
        .where(eq(platforms.id, platformId))
        .returning();
    return updated;
};

export const PlatformServices = {
    createPlatform,
    getPlatform,
    updatePlatformConfig,
    updatePlatformFeatures,
};
