/**
 * Report registry contract. One ReportDefinition per report; the registry
 * (registry.ts) is the single source of truth the routes, the admin/client
 * cards, and the CLI wrappers all derive from. See docs/reports-system-direction.md §3.
 */
import ExcelJS from "exceljs";
import { z } from "zod";

export type ReportSection = "INVENTORY" | "OPERATIONS" | "FINANCIAL";
export type ReportAudience = "ADMIN" | "ADMIN_CLIENT";
export type ReportRole = "ADMIN" | "LOGISTICS" | "CLIENT";

export interface ReportRowCap {
    max: number;
    dimension: "rows" | "pivot-columns";
    /** the exact "narrow your filter (…)" suffix naming the filters that shrink THIS report. */
    narrowHint: string;
}

export type ReportFilterType =
    | "company"
    | "date"
    | "category-include-exclude"
    | "group"
    | "status"
    | "team";

export interface ReportFilter {
    key: string;
    label: string;
    type: ReportFilterType;
    required: boolean;
    /** order-grain category/group is coarse EXISTS(items) — UI shows a "coarse" hint. */
    scope?: "document" | "item";
    /** pivots take include-only (exclude-into-a-pivot is unbounded column width). */
    mode?: "include-only" | "include-exclude";
    options?: Array<{ value: string; label: string }>;
    /** status-filter only: overrides the default "All" option label (e.g. "Summary"). */
    allLabel?: string;
    default?: unknown;
}

export interface ReportRunContext {
    platformId: string;
    companyId: string;
    companyName: string;
    role: ReportRole;
    /**
     * Caller may see cost/margin columns (holds ANALYTICS_TRACK_MARGIN). ADMIN-only
     * in practice — LOGISTICS + CLIENT are false. run() MUST gate every buy/cost/margin
     * column on this; sell columns are always allowed.
     */
    canSeeMargin: boolean;
    /** true on the /client/v1 mount → run() must additionally drop any non-client column. */
    isClientMount: boolean;
    now: Date;
}

export interface ReportResult {
    wb: ExcelJS.Workbook;
    /** data-row count — drives stream-vs-buffer + the empty-state scaffold. */
    rowCount: number;
}

export interface ReportDefinition {
    key: string; // kebab — stable id, URL segment, registry key
    label: string; // Title Case card title
    description: string;
    section: ReportSection;
    audience: ReportAudience;
    /** roles allowed on the operations mount; default ["ADMIN","LOGISTICS"]. */
    operationsRoles?: Array<"ADMIN" | "LOGISTICS">;
    /** any-of permissions gating both the card and the run endpoint. */
    permissions: string[];
    filters: ReportFilter[];
    /** validates the RESOLVED query params (company_id, dates, category arrays, …). */
    paramsSchema: z.ZodTypeAny;
    rowCap: ReportRowCap;
    /** optional feature flag; card hidden + run blocked when off for the company. */
    requiredFeature?: string;
    /**
     * Build the workbook. Responsible for: enforcing rowCap (throw BAD_REQUEST with
     * narrowHint when over), honoring ctx.canSeeMargin + ctx.isClientMount when choosing
     * columns, and using the report-workbook toolkit for all styling.
     */
    run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult>;
}

/** Metadata shape returned by GET /reports (no run fn, no zod schema). */
export interface ReportCardMeta {
    key: string;
    label: string;
    description: string;
    section: ReportSection;
    audience: ReportAudience;
    filters: ReportFilter[];
}

export function toCardMeta(def: ReportDefinition): ReportCardMeta {
    return {
        key: def.key,
        label: def.label,
        description: def.description,
        section: def.section,
        audience: def.audience,
        filters: def.filters,
    };
}
