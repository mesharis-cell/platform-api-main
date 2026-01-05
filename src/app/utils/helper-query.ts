import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import config from "../config";

export const getSystemUser = async (platformId: string) => {
    const systemUser = await db.query.users.findFirst({
        where: and(eq(users.platform_id, platformId), eq(users.email, config.system_user_email)),
    });
    return systemUser;
};