import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "..";
import { assetFamilies, assets } from "../schema";

export type StockModeSuggestion = "SERIALIZED" | "POOLED" | "REVIEW_REQUIRED";

export type MappingRow = {
    stock_record_id: string;
    current_name: string;
    proposed_family_name: string;
    brand_id: string | null;
    category: string;
    tracking_method: "INDIVIDUAL" | "BATCH";
    status: string;
    group_key: string;
    suggested_stock_mode: StockModeSuggestion;
    review_required: boolean;
    deleted_at: string | null;
    company_id: string;
    platform_id: string;
};

export type FamilyProposal = {
    group_key: string;
    platform_id: string;
    company_id: string;
    brand_id: string | null;
    category: string;
    normalized_category: string;
    proposed_family_name: string;
    stock_mode_suggestion: StockModeSuggestion;
    review_required: boolean;
    review_reasons: string[];
    total_stock_records: number;
    active_stock_records: number;
    representative_asset_id: string;
    representative_asset_name: string;
    representative_fields: {
        team_id: string | null;
        description: string | null;
        images: unknown;
        on_display_image: string | null;
        packaging: string | null;
        weight_per_unit: string | null;
        dimensions: unknown;
        volume_per_unit: string | null;
        handling_tags: string[];
    };
    asset_ids: string[];
    tracking_methods: string[];
    statuses: string[];
    team_ids: string[];
    warehouse_ids: string[];
    zone_ids: string[];
};

export type BackfillReport = {
    generated_at: string;
    database_name: string;
    family_count: number;
    stock_record_count: number;
    review_required_count: number;
    families: FamilyProposal[];
    mappings: MappingRow[];
};

type AssetRow = {
    id: string;
    platform_id: string;
    company_id: string;
    brand_id: string | null;
    team_id: string | null;
    warehouse_id: string;
    zone_id: string;
    name: string;
    description: string | null;
    category: string;
    images: unknown;
    on_display_image: string | null;
    tracking_method: "INDIVIDUAL" | "BATCH";
    packaging: string | null;
    weight_per_unit: string;
    dimensions: unknown;
    volume_per_unit: string;
    handling_tags: string[];
    status: string;
    deleted_at: Date | null;
    created_at: Date;
};

export type BackfillOverrides = {
    groups?: Record<
        string,
        {
            family_name?: string;
            stock_mode?: "SERIALIZED" | "POOLED";
        }
    >;
};

type Executor = any;

export const parseFlag = (flag: string): string | undefined => {
    const index = process.argv.indexOf(flag);
    if (index === -1) return undefined;
    return process.argv[index + 1];
};

export const hasFlag = (flag: string): boolean => process.argv.includes(flag);

export const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

export const normalizeCategory = (value: string) => normalizeWhitespace(value).toLowerCase();

export const normalizeFamilyBaseName = (name: string) => {
    const trimmed = normalizeWhitespace(name);
    const stripped = normalizeWhitespace(trimmed.replace(/\s*[#-]\s*\d+\s*$/, ""));

    if (!stripped) return trimmed;
    if (/^\d+$/.test(stripped)) return trimmed;
    return stripped;
};

const databaseName = async () => {
    const result = await db.execute(sql`select current_database() as database_name`);
    const row = Array.isArray(result) ? result[0] : (result as any)?.rows?.[0];
    return String((row as any)?.database_name || "unknown");
};

const loadAssetsForBackfill = async (): Promise<AssetRow[]> =>
    db
        .select({
            id: assets.id,
            platform_id: assets.platform_id,
            company_id: assets.company_id,
            brand_id: assets.brand_id,
            team_id: assets.team_id,
            warehouse_id: assets.warehouse_id,
            zone_id: assets.zone_id,
            name: assets.name,
            description: assets.description,
            category: assets.category,
            images: assets.images,
            on_display_image: assets.on_display_image,
            tracking_method: assets.tracking_method,
            packaging: assets.packaging,
            weight_per_unit: assets.weight_per_unit,
            dimensions: assets.dimensions,
            volume_per_unit: assets.volume_per_unit,
            handling_tags: assets.handling_tags,
            status: assets.status,
            deleted_at: assets.deleted_at,
            created_at: assets.created_at,
        })
        .from(assets)
        .orderBy(
            asc(assets.platform_id),
            asc(assets.company_id),
            asc(assets.created_at),
            asc(assets.id)
        );

const representativeRank = (row: AssetRow) => {
    const isDeleted = row.deleted_at ? 1 : 0;
    const isTransformed = row.status === "TRANSFORMED" ? 1 : 0;
    return `${isDeleted}${isTransformed}${row.created_at.toISOString()}${row.id}`;
};

export const generateBackfillReport = async (): Promise<BackfillReport> => {
    const rows = await loadAssetsForBackfill();
    const groups = new Map<string, AssetRow[]>();

    for (const row of rows) {
        const familyBaseName = normalizeFamilyBaseName(row.name);
        const groupKey = [
            row.platform_id,
            row.company_id,
            row.brand_id || "null",
            normalizeCategory(row.category),
            familyBaseName,
        ].join("|");

        const group = groups.get(groupKey) || [];
        group.push(row);
        groups.set(groupKey, group);
    }

    const families: FamilyProposal[] = [];
    const mappings: MappingRow[] = [];

    for (const [groupKey, groupRows] of groups.entries()) {
        const representative = [...groupRows].sort((a, b) =>
            representativeRank(a).localeCompare(representativeRank(b))
        )[0];
        const trackingMethods = [...new Set(groupRows.map((row) => row.tracking_method))];
        const teamIds = [...new Set(groupRows.map((row) => row.team_id || "null"))];
        const statuses = [...new Set(groupRows.map((row) => row.status))];
        const warehouseIds = [...new Set(groupRows.map((row) => row.warehouse_id))];
        const zoneIds = [...new Set(groupRows.map((row) => row.zone_id))];
        const activeRows = groupRows.filter(
            (row) => !row.deleted_at && row.status !== "TRANSFORMED"
        );

        let stockModeSuggestion: StockModeSuggestion = "REVIEW_REQUIRED";
        const reviewReasons: string[] = [];

        if (trackingMethods.length === 1) {
            stockModeSuggestion = trackingMethods[0] === "INDIVIDUAL" ? "SERIALIZED" : "POOLED";
        } else {
            reviewReasons.push("mixed_tracking_method");
        }

        if (teamIds.length > 1) reviewReasons.push("mixed_team_id");
        if (warehouseIds.length > 1) reviewReasons.push("multiple_warehouses");
        if (zoneIds.length > 1) reviewReasons.push("multiple_zones");

        const family: FamilyProposal = {
            group_key: groupKey,
            platform_id: representative.platform_id,
            company_id: representative.company_id,
            brand_id: representative.brand_id,
            category: representative.category,
            normalized_category: normalizeCategory(representative.category),
            proposed_family_name: normalizeFamilyBaseName(representative.name),
            stock_mode_suggestion: stockModeSuggestion,
            review_required: reviewReasons.length > 0,
            review_reasons: reviewReasons,
            total_stock_records: groupRows.length,
            active_stock_records: activeRows.length,
            representative_asset_id: representative.id,
            representative_asset_name: representative.name,
            representative_fields: {
                team_id: representative.team_id,
                description: representative.description,
                images: representative.images,
                on_display_image: representative.on_display_image,
                packaging: representative.packaging,
                weight_per_unit: representative.weight_per_unit,
                dimensions: representative.dimensions,
                volume_per_unit: representative.volume_per_unit,
                handling_tags: representative.handling_tags || [],
            },
            asset_ids: groupRows.map((row) => row.id),
            tracking_methods: trackingMethods,
            statuses,
            team_ids: teamIds,
            warehouse_ids: warehouseIds,
            zone_ids: zoneIds,
        };

        families.push(family);

        for (const row of groupRows) {
            mappings.push({
                stock_record_id: row.id,
                current_name: row.name,
                proposed_family_name: family.proposed_family_name,
                brand_id: row.brand_id,
                category: row.category,
                tracking_method: row.tracking_method,
                status: row.status,
                group_key: groupKey,
                suggested_stock_mode: family.stock_mode_suggestion,
                review_required: family.review_required,
                deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
                company_id: row.company_id,
                platform_id: row.platform_id,
            });
        }
    }

    const dbName = await databaseName();

    return {
        generated_at: new Date().toISOString(),
        database_name: dbName,
        family_count: families.length,
        stock_record_count: rows.length,
        review_required_count: families.filter((item) => item.review_required).length,
        families: families.sort((a, b) =>
            a.proposed_family_name.localeCompare(b.proposed_family_name)
        ),
        mappings,
    };
};

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
};

export const writeBackfillArtifacts = async (
    report: BackfillReport,
    prefix = "asset-family-backfill"
) => {
    const dir = path.join(process.cwd(), ".dbops", `${prefix}-${Date.now()}`);
    await mkdir(dir, { recursive: true });

    await writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
    await writeFile(path.join(dir, "families.json"), JSON.stringify(report.families, null, 2));
    await writeFile(path.join(dir, "mappings.json"), JSON.stringify(report.mappings, null, 2));

    const csvHeaders = [
        "stock_record_id",
        "current_name",
        "proposed_family_name",
        "brand_id",
        "category",
        "tracking_method",
        "status",
        "group_key",
        "suggested_stock_mode",
        "review_required",
    ];

    const csvLines = [
        csvHeaders.join(","),
        ...report.mappings.map((row) =>
            [
                row.stock_record_id,
                row.current_name,
                row.proposed_family_name,
                row.brand_id,
                row.category,
                row.tracking_method,
                row.status,
                row.group_key,
                row.suggested_stock_mode,
                row.review_required,
            ]
                .map(csvEscape)
                .join(",")
        ),
    ];

    await writeFile(path.join(dir, "mapping-report.csv"), csvLines.join("\n"));
    return dir;
};

export const readJsonFile = async <T>(filePath: string): Promise<T> =>
    JSON.parse(await (await import("node:fs/promises")).readFile(filePath, "utf8")) as T;

export const resolveFamilyProposal = (
    family: FamilyProposal,
    overrides?: BackfillOverrides
): FamilyProposal & {
    final_family_name: string;
    final_stock_mode: "SERIALIZED" | "POOLED" | null;
} => {
    const override = overrides?.groups?.[family.group_key];
    const finalFamilyName = normalizeWhitespace(
        override?.family_name || family.proposed_family_name
    );
    const finalStockMode =
        override?.stock_mode ||
        (family.stock_mode_suggestion === "REVIEW_REQUIRED" ? null : family.stock_mode_suggestion);

    return {
        ...family,
        final_family_name: finalFamilyName,
        final_stock_mode: finalStockMode,
    };
};

export const findExistingFamily = async (
    executor: Executor,
    proposal: {
        platform_id: string;
        company_id: string;
        name: string;
    }
) =>
    executor
        .select({
            id: assetFamilies.id,
            name: assetFamilies.name,
        })
        .from(assetFamilies)
        .where(
            and(
                eq(assetFamilies.platform_id, proposal.platform_id),
                eq(assetFamilies.company_id, proposal.company_id),
                eq(assetFamilies.name, proposal.name),
                isNull(assetFamilies.deleted_at)
            )
        );

export const updateAssetFamilyIds = async (
    executor: Executor,
    assetIds: string[],
    familyId: string
) => {
    if (assetIds.length === 0) return 0;

    const result = await executor
        .update(assets)
        .set({
            family_id: familyId,
            updated_at: new Date(),
        })
        .where(and(inArray(assets.id, assetIds), isNull(assets.family_id)))
        .returning({ id: assets.id });

    return result.length;
};
