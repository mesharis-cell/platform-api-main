import bcrypt from "bcrypt";
import { and, count, desc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import { db } from "../../../db";
import { companies, platformMaintenanceAudit, platforms, users } from "../../../db/schema";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { tokenGenerator, tokenVerifier } from "../../utils/jwt-helpers";
import { PlatformMaintenanceService } from "../../services/platform-maintenance.service";

const getDefaultMaintenanceUntil = () => {
    const date = new Date();
    date.setHours(date.getHours() + 1);
    return date;
};

const buildTokenPayload = (user: {
    id: string;
    name: string;
    email: string;
    role: string;
    company_id: string | null;
    platform_id: string;
    is_super_admin: boolean;
}) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company_id: user.company_id,
    platform_id: user.platform_id,
    is_super_admin: user.is_super_admin,
});

const login = async (credential: { email: string; password: string }) => {
    const matches = await db.query.users.findMany({
        where: and(eq(users.email, credential.email), eq(users.is_super_admin, true)),
        with: {
            access_policy: {
                columns: {
                    permissions: true,
                },
            },
        },
    });

    if (matches.length === 0) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Super admin not found");
    }

    if (matches.length > 1) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "Multiple super admin accounts share this email. Resolve duplicates before using the control plane."
        );
    }

    const user = matches[0];

    if (!user.is_active) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Super admin account is not active");
    }

    const passwordMatches = await bcrypt.compare(credential.password, user.password);
    if (!passwordMatches) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid password");
    }

    const jwtPayload = buildTokenPayload(user);
    const accessToken = tokenGenerator(
        jwtPayload,
        config.jwt_access_secret as Secret,
        config.jwt_access_expires_in
    );
    const refreshToken = tokenGenerator(
        jwtPayload,
        config.jwt_refresh_secret as Secret,
        config.jwt_refresh_expires_in
    );

    await db
        .update(users)
        .set({
            last_login_at: new Date(),
        })
        .where(eq(users.id, user.id));

    const { password: _password, access_policy: _accessPolicy, ...safeUser } = user as any;

    return {
        ...safeUser,
        access_token: accessToken,
        refresh_token: refreshToken,
    };
};

const refresh = async (payload: { refresh_token: string }) => {
    let verifiedUser: ReturnType<typeof tokenVerifier> & { id?: string };
    try {
        verifiedUser = tokenVerifier(
            payload.refresh_token,
            config.jwt_refresh_secret as Secret
        ) as typeof verifiedUser;
    } catch {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
    }

    if (!verifiedUser?.id) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid refresh token payload");
    }

    const user = await db.query.users.findFirst({
        where: and(
            eq(users.id, verifiedUser.id),
            eq(users.is_super_admin, true),
            eq(users.is_active, true)
        ),
    });

    if (!user) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Super admin not found or inactive");
    }

    const jwtPayload = buildTokenPayload(user);
    return {
        access_token: tokenGenerator(
            jwtPayload,
            config.jwt_access_secret as Secret,
            config.jwt_access_expires_in
        ),
        refresh_token: tokenGenerator(
            jwtPayload,
            config.jwt_refresh_secret as Secret,
            config.jwt_refresh_expires_in
        ),
    };
};

const getMe = async (userId: string) => {
    const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.is_super_admin, true), eq(users.is_active, true)),
    });

    if (!user) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Super admin not found");
    }

    const { password: _password, ...safeUser } = user as any;
    return safeUser;
};

const listPlatforms = async () => {
    const rows = await db
        .select({
            id: platforms.id,
            name: platforms.name,
            domain: platforms.domain,
            config: platforms.config,
            features: platforms.features,
            vat_percent: platforms.vat_percent,
            is_active: platforms.is_active,
            maintenance_mode: platforms.maintenance_mode,
            maintenance_message: platforms.maintenance_message,
            maintenance_until: platforms.maintenance_until,
            maintenance_updated_at: platforms.maintenance_updated_at,
            maintenance_updated_by: platforms.maintenance_updated_by,
            created_at: platforms.created_at,
            updated_at: platforms.updated_at,
        })
        .from(platforms)
        .orderBy(desc(platforms.updated_at));

    const companyCounts = await db
        .select({
            platform_id: companies.platform_id,
            count: count(companies.id),
        })
        .from(companies)
        .groupBy(companies.platform_id);

    const userCounts = await db
        .select({
            platform_id: users.platform_id,
            count: count(users.id),
        })
        .from(users)
        .groupBy(users.platform_id);

    const companyCountMap = new Map(
        companyCounts.map((row) => [row.platform_id, Number(row.count)])
    );
    const userCountMap = new Map(userCounts.map((row) => [row.platform_id, Number(row.count)]));

    return rows.map((row) => ({
        ...row,
        company_count: companyCountMap.get(row.id) ?? 0,
        user_count: userCountMap.get(row.id) ?? 0,
        maintenance: PlatformMaintenanceService.projectMaintenance(row),
    }));
};

const getPlatformDetail = async (platformId: string) => {
    const [platform] = await db
        .select({
            id: platforms.id,
            name: platforms.name,
            domain: platforms.domain,
            config: platforms.config,
            features: platforms.features,
            vat_percent: platforms.vat_percent,
            is_active: platforms.is_active,
            maintenance_mode: platforms.maintenance_mode,
            maintenance_message: platforms.maintenance_message,
            maintenance_until: platforms.maintenance_until,
            maintenance_updated_at: platforms.maintenance_updated_at,
            maintenance_updated_by: platforms.maintenance_updated_by,
            created_at: platforms.created_at,
            updated_at: platforms.updated_at,
        })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    if (!platform) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Platform not found");
    }

    return {
        ...platform,
        maintenance: PlatformMaintenanceService.projectMaintenance(platform),
    };
};

const updatePlatformMaintenance = async (
    platformId: string,
    actorId: string,
    payload: { enabled: boolean; message?: string | null; until?: string | null }
) => {
    const [platform] = await db
        .select({
            id: platforms.id,
            maintenance_mode: platforms.maintenance_mode,
            maintenance_message: platforms.maintenance_message,
            maintenance_until: platforms.maintenance_until,
        })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    if (!platform) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Platform not found");
    }

    // Validate until when enabling. Reject past timestamps — an already-past
    // until means maintenance is off the moment it's written, producing a
    // DB state of (mode=true, until=past) that the middleware treats as off.
    // Confusing + a wasted write. Accept null (→ default) or future ISO.
    let maintenanceUntil: Date | null = null;
    if (payload.enabled) {
        if (payload.until) {
            const parsed = new Date(payload.until);
            if (Number.isNaN(parsed.getTime())) {
                throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid until timestamp");
            }
            if (parsed.getTime() <= Date.now()) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "Maintenance window must end in the future"
                );
            }
            maintenanceUntil = parsed;
        } else {
            maintenanceUntil = getDefaultMaintenanceUntil();
        }
    }

    const wasActive = PlatformMaintenanceService.isMaintenanceActive(platform);
    const willBeActive = payload.enabled;
    const action: "ENABLED" | "UPDATED" | "DISABLED" = !willBeActive
        ? "DISABLED"
        : wasActive
          ? "UPDATED"
          : "ENABLED";

    const finalMessage = payload.enabled ? payload.message?.trim() || null : null;

    const updated = await db.transaction(async (tx) => {
        const [row] = await tx
            .update(platforms)
            .set({
                maintenance_mode: payload.enabled,
                maintenance_message: finalMessage,
                maintenance_until: maintenanceUntil,
                maintenance_updated_at: new Date(),
                maintenance_updated_by: actorId,
            })
            .where(eq(platforms.id, platformId))
            .returning();

        await tx.insert(platformMaintenanceAudit).values({
            platform_id: platformId,
            action,
            message: finalMessage,
            until: maintenanceUntil,
            actor_id: actorId,
        });

        return row;
    });

    return {
        ...updated,
        maintenance: PlatformMaintenanceService.projectMaintenance(updated),
    };
};

const getPlatformMaintenanceHistory = async (platformId: string, limit: number = 50) => {
    const rows = await db
        .select({
            id: platformMaintenanceAudit.id,
            action: platformMaintenanceAudit.action,
            message: platformMaintenanceAudit.message,
            until: platformMaintenanceAudit.until,
            actor_id: platformMaintenanceAudit.actor_id,
            actor_name: users.name,
            actor_email: users.email,
            created_at: platformMaintenanceAudit.created_at,
        })
        .from(platformMaintenanceAudit)
        .leftJoin(users, eq(platformMaintenanceAudit.actor_id, users.id))
        .where(eq(platformMaintenanceAudit.platform_id, platformId))
        .orderBy(desc(platformMaintenanceAudit.created_at))
        .limit(limit);
    return rows;
};

export const SuperAdminServices = {
    login,
    refresh,
    getMe,
    listPlatforms,
    getPlatformDetail,
    getPlatformMaintenanceHistory,
    updatePlatformMaintenance,
};
