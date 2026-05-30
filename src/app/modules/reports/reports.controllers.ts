/**
 * Reports module controllers — the single generic runner + the registry list.
 * Mounted twice (operations + client); the isClientMount flag drives audience
 * filtering, company-scope forcing, and the client column contract.
 */
import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { PERMISSIONS } from "../../constants/permissions";
import { resolveCompanyContext, reportFilename, sendWorkbook } from "../../utils/report-workbook";
import { reportRegistry, getReport } from "./registry";
import { ReportDefinition, ReportRunContext, toCardMeta } from "./types";

/** Effective-permission any-of check with module:* wildcard support. user.permissions
 *  is already the computed effective set (auth → computeEffectivePermissions). */
function hasAnyPermission(user: AuthUser, perms: string[]): boolean {
    if (user.is_super_admin) return true;
    const granted = new Set(user.permissions || []);
    return perms.some((p) => {
        if (granted.has(p)) return true;
        const mod = p.split(":")[0];
        return granted.has(`${mod}:*`);
    });
}

function canRunOnOps(user: AuthUser, def: ReportDefinition): boolean {
    const roles = def.operationsRoles ?? ["ADMIN", "LOGISTICS"];
    if (user.is_super_admin || user.role === "ADMIN") return true;
    return (roles as string[]).includes(user.role);
}

function visibleReports(user: AuthUser, isClientMount: boolean): ReportDefinition[] {
    return reportRegistry.filter((def) => {
        if (isClientMount && def.audience !== "ADMIN_CLIENT") return false;
        if (!isClientMount && !canRunOnOps(user, def)) return false;
        return hasAnyPermission(user, def.permissions);
    });
}

const listReports = (isClientMount: boolean) =>
    catchAsync(async (req: Request, res: Response) => {
        const user = (req as any).user as AuthUser;
        const reports = visibleReports(user, isClientMount).map(toCardMeta);
        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Reports retrieved successfully",
            data: { reports },
        });
    });

const runReport = (isClientMount: boolean) =>
    catchAsync(async (req: Request, res: Response) => {
        const user = (req as any).user as AuthUser;
        const platformId = ((req as any).platformId as string) || user.platform_id;

        const def = getReport(req.params.key);
        if (!def) throw new CustomizedError(httpStatus.NOT_FOUND, "Report not found.");
        if (isClientMount && def.audience !== "ADMIN_CLIENT")
            throw new CustomizedError(httpStatus.NOT_FOUND, "Report not found.");
        if (!isClientMount && !canRunOnOps(user, def))
            throw new CustomizedError(httpStatus.FORBIDDEN, "You cannot run this report.");
        if (!hasAnyPermission(user, def.permissions))
            throw new CustomizedError(httpStatus.FORBIDDEN, "You cannot run this report.");

        // CLIENT callers are forced to their own company; never trust a client-supplied company_id.
        const rawParams: Record<string, any> = { ...req.query };
        if (isClientMount) {
            if (!user.company_id)
                throw new CustomizedError(
                    httpStatus.FORBIDDEN,
                    "No company is linked to this account."
                );
            rawParams.company_id = user.company_id;
        }

        const parsed = def.paramsSchema.safeParse(rawParams);
        if (!parsed.success) {
            const msg = parsed.error.issues
                .map((i) => `${i.path.join(".") || "param"}: ${i.message}`)
                .join("; ");
            throw new CustomizedError(httpStatus.BAD_REQUEST, `Invalid report parameters — ${msg}`);
        }
        const params = parsed.data as Record<string, any>;

        const companyId = String(params.company_id);
        const company = await resolveCompanyContext(companyId);
        // Tenant isolation — the company must live under the caller's platform.
        if (company.platformId !== platformId)
            throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found.");

        const ctx: ReportRunContext = {
            platformId,
            companyId,
            companyName: company.companyName,
            role: user.role as ReportRunContext["role"],
            canSeeMargin: hasAnyPermission(user, [PERMISSIONS.ANALYTICS_TRACK_MARGIN]),
            isClientMount,
            now: new Date(),
        };

        const result = await def.run(params, ctx);
        const filename = reportFilename(ctx.companyName, def.key, ctx.now);
        await sendWorkbook(res, result.wb, filename, result.rowCount);
    });

export const ReportsControllers = {
    listReportsOps: listReports(false),
    listReportsClient: listReports(true),
    runReportOps: runReport(false),
    runReportClient: runReport(true),
};
