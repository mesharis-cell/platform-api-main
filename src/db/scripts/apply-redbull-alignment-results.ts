import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { assertAppEnv } from "../safety/guards";
import { db, pool } from "../../db";
import { assetCategories, assetFamilies, assets, companies, teams } from "../../db/schema";

assertAppEnv(["staging"]);

type AlignmentWrite = {
    source_item_id?: string;
    company_item_code?: string;
    family_id: string;
    team_id?: string | null;
    team_name?: string | null;
    category_name?: string | null;
    action_type:
        | "match_existing"
        | "create_new_family"
        | "split_required"
        | "merge_candidate"
        | "unresolved";
    provenance?: Record<string, unknown> | null;
};

type AlignmentPayload = {
    metadata?: {
        platform_id?: string;
        company_id?: string;
        update_child_assets_team_id?: boolean;
    };
    writes: AlignmentWrite[];
};

const getArg = (name: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function resolveTeamId(
    platformId: string,
    companyId: string,
    write: AlignmentWrite,
    dryRun: boolean
) {
    if (write.team_id) {
        const team = await db.query.teams.findFirst({
            where: and(
                eq(teams.id, write.team_id),
                eq(teams.platform_id, platformId),
                eq(teams.company_id, companyId)
            ),
            columns: { id: true, name: true },
        });

        if (!team) {
            throw new Error(`Team ${write.team_id} not found for family ${write.family_id}`);
        }

        return team.id;
    }

    if (!write.team_name) return null;

    const existing = await db.query.teams.findFirst({
        where: and(
            eq(teams.platform_id, platformId),
            eq(teams.company_id, companyId),
            eq(teams.name, write.team_name)
        ),
        columns: { id: true, name: true },
    });

    if (existing) return existing.id;

    if (dryRun) return "__dry_run_team__";

    const [created] = await db
        .insert(teams)
        .values({
            platform_id: platformId,
            company_id: companyId,
            name: write.team_name,
            description: `Created by Red Bull alignment apply for ${write.team_name}`,
            can_other_teams_see: true,
            can_other_teams_book: false,
        })
        .returning({ id: teams.id });

    return created.id;
}

// Category color palette for new categories (cycles through these)
const CATEGORY_COLORS = [
    "#2563EB",
    "#7C3AED",
    "#0891B2",
    "#059669",
    "#D97706",
    "#DC2626",
    "#4F46E5",
    "#0D9488",
    "#CA8A04",
    "#BE185D",
    "#6D28D9",
    "#0284C7",
    "#16A34A",
    "#EA580C",
    "#9333EA",
];
let _colorIdx = 0;

async function resolveCategoryId(
    platformId: string,
    categoryName: string | null | undefined,
    dryRun: boolean
): Promise<string | null> {
    if (!categoryName) return null;

    const existing = await db.query.assetCategories.findFirst({
        where: and(
            eq(assetCategories.platform_id, platformId),
            eq(assetCategories.name, categoryName)
        ),
        columns: { id: true },
    });

    if (existing) return existing.id;

    if (dryRun) return "__dry_run_category__";

    const slug = categoryName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const color = CATEGORY_COLORS[_colorIdx % CATEGORY_COLORS.length];
    _colorIdx++;

    const [created] = await db
        .insert(assetCategories)
        .values({
            platform_id: platformId,
            name: categoryName,
            slug,
            color,
            sort_order: 10 + _colorIdx,
            is_active: true,
        })
        .returning({ id: assetCategories.id });

    console.log(`  → Created category: "${categoryName}" (${created.id})`);
    return created.id;
}

async function main() {
    const filePath = getArg("file");
    const platformIdArg = getArg("platform-id");
    const companyIdArg = getArg("company-id");
    const dryRun = hasFlag("dry-run");
    const updateChildAssets = hasFlag("update-child-assets");

    if (!filePath) {
        throw new Error(
            "Usage: bun run db:redbull:apply-alignment -- --file <alignment-json> [--platform-id <uuid> --company-id <uuid>] [--dry-run] [--update-child-assets]"
        );
    }

    const absolutePath = path.resolve(filePath);
    const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as AlignmentPayload;
    const platformId = platformIdArg || payload.metadata?.platform_id;
    const companyId = companyIdArg || payload.metadata?.company_id;

    if (!platformId || !companyId) {
        throw new Error(
            "platform_id and company_id are required either in args or payload.metadata"
        );
    }

    const company = await db.query.companies.findFirst({
        where: and(eq(companies.id, companyId), eq(companies.platform_id, platformId)),
        columns: { id: true, name: true },
    });

    if (!company) {
        throw new Error("Target company not found");
    }

    const actionableWrites = payload.writes.filter(
        (write) => write.action_type === "match_existing" && write.family_id
    );

    const preview: Array<Record<string, unknown>> = [];

    if (dryRun) {
        for (const write of actionableWrites) {
            const teamId = await resolveTeamId(platformId, companyId, write, true);
            const categoryId = await resolveCategoryId(platformId, write.category_name, true);
            preview.push({
                family_id: write.family_id,
                source_item_id: write.source_item_id ?? null,
                company_item_code: write.company_item_code ?? null,
                team_id: teamId === "__dry_run_team__" ? null : teamId,
                team_name: write.team_name ?? null,
                category_name: write.category_name ?? null,
                category_id: categoryId === "__dry_run_category__" ? "(new)" : categoryId,
                update_child_assets:
                    updateChildAssets || payload.metadata?.update_child_assets_team_id === true,
            });
        }

        console.log(
            JSON.stringify(
                {
                    dry_run: true,
                    company: company.name,
                    writes_count: preview.length,
                    preview,
                },
                null,
                2
            )
        );
        return;
    }

    const applied = await db.transaction(async (tx) => {
        const results: Array<Record<string, unknown>> = [];

        for (const write of actionableWrites) {
            const family = await tx.query.assetFamilies.findFirst({
                where: and(
                    eq(assetFamilies.id, write.family_id),
                    eq(assetFamilies.platform_id, platformId),
                    eq(assetFamilies.company_id, companyId),
                    isNull(assetFamilies.deleted_at)
                ),
                columns: {
                    id: true,
                    company_item_code: true,
                    team_id: true,
                },
            });

            if (!family) {
                throw new Error(
                    `Family ${write.family_id} not found for source item ${write.source_item_id}`
                );
            }

            const resolvedTeamId = await resolveTeamId(platformId, companyId, write, false);
            const resolvedCategoryId = await resolveCategoryId(
                platformId,
                write.category_name,
                false
            );

            const updateSet: Record<string, unknown> = { updated_at: new Date() };
            if (write.company_item_code) updateSet.company_item_code = write.company_item_code;
            if (resolvedTeamId !== undefined && resolvedTeamId !== null)
                updateSet.team_id = resolvedTeamId;
            if (resolvedCategoryId) updateSet.category_id = resolvedCategoryId;

            await tx.update(assetFamilies).set(updateSet).where(eq(assetFamilies.id, family.id));

            let childAssetsUpdated = 0;

            if (
                (updateChildAssets || payload.metadata?.update_child_assets_team_id === true) &&
                resolvedTeamId
            ) {
                const updatedAssets = await tx
                    .update(assets)
                    .set({
                        team_id: resolvedTeamId,
                        updated_at: new Date(),
                    })
                    .where(and(eq(assets.family_id, family.id), isNull(assets.deleted_at)))
                    .returning({ id: assets.id });
                childAssetsUpdated = updatedAssets.length;
            }

            results.push({
                family_id: family.id,
                source_item_id: write.source_item_id ?? null,
                old_company_item_code: family.company_item_code,
                new_company_item_code: write.company_item_code ?? null,
                old_team_id: family.team_id,
                new_team_id: resolvedTeamId,
                new_category_name: write.category_name ?? null,
                new_category_id: resolvedCategoryId,
                child_assets_updated: childAssetsUpdated,
            });
        }

        return results;
    });

    console.log(
        JSON.stringify(
            {
                dry_run: false,
                company: company.name,
                writes_count: applied.length,
                applied,
            },
            null,
            2
        )
    );
    await pool.end();
}

main().catch((error) => {
    console.error(
        "❌ Red Bull alignment apply failed:",
        error instanceof Error ? error.message : error
    );
    void pool.end();
    process.exit(1);
});
