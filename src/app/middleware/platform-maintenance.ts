import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { db } from "../../db";
import { platforms } from "../../db/schema";
import { uuidRegex } from "../constants/common";
import { PlatformMaintenanceService } from "../services/platform-maintenance.service";

const MAINTENANCE_ALLOWLIST = ["/", "/api-docs", "/auth/context", "/auth/unsubscribe"];

const isBypassedPath = (path: string) =>
    path.startsWith("/super-admin") ||
    MAINTENANCE_ALLOWLIST.some(
        (allowed) => path === allowed || (allowed !== "/" && path.startsWith(`${allowed}/`))
    );

const platformMaintenanceGuard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (isBypassedPath(req.path)) {
            return next();
        }

        const platformId = req.headers["x-platform"] as string | undefined;
        if (!platformId || !uuidRegex.test(platformId)) {
            return next();
        }

        const [platform] = await db
            .select({
                id: platforms.id,
                name: platforms.name,
                maintenance_mode: platforms.maintenance_mode,
                maintenance_message: platforms.maintenance_message,
                maintenance_until: platforms.maintenance_until,
                maintenance_updated_at: platforms.maintenance_updated_at,
                maintenance_updated_by: platforms.maintenance_updated_by,
            })
            .from(platforms)
            .where(eq(platforms.id, platformId))
            .limit(1);

        if (!platform || !PlatformMaintenanceService.isMaintenanceActive(platform)) {
            return next();
        }

        return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
            success: false,
            message:
                platform.maintenance_message ||
                `${platform.name} is temporarily unavailable for maintenance.`,
            data: {
                maintenance_mode: true,
                maintenance: PlatformMaintenanceService.projectMaintenance(platform),
            },
        });
    } catch (error) {
        next(error);
    }
};

export default platformMaintenanceGuard;
