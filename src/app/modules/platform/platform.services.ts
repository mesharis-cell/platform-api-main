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

export const PlatformServices = {
    createPlatform,
};
