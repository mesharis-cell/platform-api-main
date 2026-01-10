import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import config from "../config";

// -------------------------------- GET SYSTEM USER ----------------------------------
export const getSystemUser = async (platformId: string) => {
    const systemUser = await db.query.users.findFirst({
        where: and(eq(users.platform_id, platformId), eq(users.email, config.system_user_email)),
    });
    return systemUser;
};

// -------------------------------- GET PLATFORM ADMIN EMAILS ------------------------
export const getPlatformAdminEmails = async (platformId: string): Promise<string[]> => {
    const platformAdmins = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(eq(users.platform_id, platformId),
                eq(users.role, 'ADMIN'),
                sql`${users.permission_template} = 'PLATFORM_ADMIN' AND ${users.email} NOT LIKE '%@system.internal'`)
        )

    const platformAdminEmails = platformAdmins.map(admin => admin.email);
    return platformAdminEmails;
};

// -------------------------------- GET PLATFORM LOGISTICS STAFF EMAILS --------------
export const getPlatformLogisticsStaffEmails = async (platformId: string): Promise<string[]> => {
    const platformLogisticsStaff = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(eq(users.platform_id, platformId),
                eq(users.role, 'LOGISTICS'),
                sql`(
                    ${users.permission_template} = 'LOGISTICS_STAFF'
                    OR 'orders:receive_notifications' = ANY(${users.permissions})
                ) AND ${users.email} NOT LIKE '%@system.internal'`
            )
        )

    const platformLogisticsStaffEmails = platformLogisticsStaff.map(logisticsStaff => logisticsStaff.email);
    return platformLogisticsStaffEmails;
};
