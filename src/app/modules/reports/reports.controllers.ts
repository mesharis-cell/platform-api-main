/**
 * Reports module controllers — the single generic runner + the registry list.
 * Mounted twice (operations + client); the isClientMount flag drives audience
 * filtering, company-scope forcing, and the client column contract.
 */
import { Request, Response } from "express";
import httpStatus from "http-status";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { companies, platforms } from "../../../db/schema";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { PERMISSIONS } from "../../constants/permissions";
import { featureRegistry, resolveEffectiveFeature } from "../../constants/common";
import { resolveCompanyContext, reportFilename, sendWorkbook } from "../../utils/report-workbook";
import { reportRegistry, getReport } from "./registry";
import { ReportDefinition, ReportRunContext, toCardMeta } from "./types";

type FeatureMap = Record<string, unknown> | null;

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

/** Load platform features (always) + company features (when a company is known)
 *  so requiredFeature gating uses the canonical resolveEffectiveFeature chain. */
async function loadFeatureContext(
    platformId: string,
    companyId: string | null
): Promise<{ platformFeatures: FeatureMap; companyFeatures: FeatureMap }> {
    const [platform] = await db
        .select({ features: platforms.features })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);
    let companyFeatures: FeatureMap = null;
    if (companyId) {
        const [company] = await db
            .select({ features: companies.features })
            .from(companies)
            .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)))
            .limit(1);
        companyFeatures = (company?.features as FeatureMap) ?? null;
    }
    return {
        platformFeatures: (platform?.features as FeatureMap) ?? null,
        companyFeatures,
    };
}

/** A definition's requiredFeature (if any) resolves to ON for this feature ctx.
 *  No requiredFeature → always allowed. */
function isFeatureOn(
    def: ReportDefinition,
    featureCtx: { platformFeatures: FeatureMap; companyFeatures: FeatureMap }
): boolean {
    if (!def.requiredFeature) return true;
    if (!(def.requiredFeature in featureRegistry)) return true; // unknown key → treat as no gate
    return resolveEffectiveFeature(def.requiredFeature as keyof typeof featureRegistry, featureCtx);
}

function visibleReports(
    user: AuthUser,
    isClientMount: boolean,
    featureCtx: { platformFeatures: FeatureMap; companyFeatures: FeatureMap }
): ReportDefinition[] {
    return reportRegistry.filter((def) => {
        if (isClientMount && def.audience !== "ADMIN_CLIENT") return false;
        if (!isClientMount && !canRunOnOps(user, def)) return false;
        if (!hasAnyPermission(user, def.permissions)) return false;
        // Hide a report whose required feature is off (CLIENT: company override →
        // platform → default; ADMIN/LOGISTICS: platform → default, since the list
        // is not scoped to a company yet).
        return isFeatureOn(def, featureCtx);
    });
}

const listReports = (isClientMount: boolean) =>
    catchAsync(async (req: Request, res: Response) => {
        const user = (req as any).user as AuthUser;
        const platformId = ((req as any).platformId as string) || user.platform_id;
        // CLIENT list is scoped to the caller's own company; ops list is not
        // company-scoped, so requiredFeature resolves at platform level there.
        const companyId = isClientMount ? user.company_id : null;
        const featureCtx = await loadFeatureContext(platformId, companyId);
        const reports = visibleReports(user, isClientMount, featureCtx).map(toCardMeta);
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

        // A report whose company_id filter is OPTIONAL may run platform-wide (all
        // companies). company_id is REQUIRED in every other report's schema, so only
        // an all-companies-capable report can reach the null branch here. CLIENT
        // callers always have company_id force-set above, so they can never trigger it.
        const rawCompanyId = params.company_id ? String(params.company_id) : null;
        let companyId = "";
        let companyName = "All companies";
        let allCompanies = true;
        if (rawCompanyId) {
            const company = await resolveCompanyContext(rawCompanyId);
            // Tenant isolation — the company must live under the caller's platform.
            if (company.platformId !== platformId)
                throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found.");
            companyId = rawCompanyId;
            companyName = company.companyName;
            allCompanies = false;
        }
        // In all-companies mode the per-query platform_id filter is the tenant
        // boundary — there is no single company to isolate against.

        // requiredFeature gate — company-scoped when a company is selected, else
        // platform-level (canonical company-override → platform → default chain).
        const featureCtx = await loadFeatureContext(platformId, rawCompanyId);
        if (!isFeatureOn(def, featureCtx))
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                allCompanies
                    ? "This report is not available on this platform."
                    : "This report is not available for the selected company."
            );

        const ctx: ReportRunContext = {
            platformId,
            companyId,
            companyName,
            allCompanies,
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
