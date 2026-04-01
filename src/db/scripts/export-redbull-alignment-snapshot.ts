import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../../db";
import { assets, brands, companies, teams, warehouses, zones } from "../../db/schema";

const getArg = (name: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
    const platformId = getArg("platform-id");
    const companyId = getArg("company-id");
    const brandId = getArg("brand-id");
    const outPath =
        getArg("out") ||
        path.join(
            process.cwd(),
            "..",
            "redbull-asset-alignment-task",
            "input",
            `redbull-kadence-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
        );

    if (!platformId || !companyId) {
        throw new Error(
            "Usage: bun run db:redbull:export-snapshot -- --platform-id <uuid> --company-id <uuid> [--brand-id <uuid>] [--out <path>]"
        );
    }

    const company = await db.query.companies.findFirst({
        where: and(eq(companies.id, companyId), eq(companies.platform_id, platformId)),
        columns: { id: true, name: true, platform_id: true },
    });

    if (!company) {
        throw new Error("Target company not found");
    }

    const brand = brandId
        ? await db.query.brands.findFirst({
              where: and(eq(brands.id, brandId), eq(brands.company_id, companyId)),
              columns: { id: true, name: true },
          })
        : null;

    const companyItemCodeColumnExists =
        ((await pool.query(
            `
            select 1
            from information_schema.columns
            where table_name = 'asset_families'
              and column_name = 'company_item_code'
            limit 1
            `
        )).rowCount ?? 0) > 0;

    const familySelectSql = `
        select
            id,
            platform_id,
            company_id,
            brand_id,
            team_id,
            name,
            ${companyItemCodeColumnExists ? "company_item_code" : "null::varchar as company_item_code"},
            description,
            category,
            stock_mode,
            packaging,
            weight_per_unit,
            dimensions,
            volume_per_unit,
            handling_tags,
            is_active,
            created_at,
            updated_at
        from asset_families
        where platform_id = $1
          and company_id = $2
          and deleted_at is null
          ${brandId ? "and brand_id = $3" : ""}
        order by name asc
    `;

    const families = (
        await pool.query(familySelectSql, brandId ? [platformId, companyId, brandId] : [platformId, companyId])
    ).rows;

    const familyIds = new Set(families.map((family) => family.id));

    const stockAssets = await db
        .select({
            id: assets.id,
            platform_id: assets.platform_id,
            company_id: assets.company_id,
            family_id: assets.family_id,
            warehouse_id: assets.warehouse_id,
            warehouse_name: warehouses.name,
            zone_id: assets.zone_id,
            zone_name: zones.name,
            team_id: assets.team_id,
            brand_id: assets.brand_id,
            name: assets.name,
            description: assets.description,
            category: assets.category,
            qr_code: assets.qr_code,
            total_quantity: assets.total_quantity,
            available_quantity: assets.available_quantity,
            status: assets.status,
            condition: assets.condition,
            deleted_at: assets.deleted_at,
        })
        .from(assets)
        .leftJoin(warehouses, eq(warehouses.id, assets.warehouse_id))
        .leftJoin(zones, eq(zones.id, assets.zone_id))
        .where(
            and(
                eq(assets.platform_id, platformId),
                eq(assets.company_id, companyId),
                isNull(assets.deleted_at),
                brandId ? eq(assets.brand_id, brandId) : undefined
            )
        );

    const assetsForFamilies = stockAssets.filter((asset) => asset.family_id && familyIds.has(asset.family_id));

    const teamRows = await db.query.teams.findMany({
        where: and(eq(teams.platform_id, platformId), eq(teams.company_id, companyId)),
        columns: {
            id: true,
            platform_id: true,
            company_id: true,
            name: true,
            description: true,
            can_other_teams_see: true,
            can_other_teams_book: true,
            created_at: true,
            updated_at: true,
        },
    });

    const payload = {
        metadata: {
            exported_at: new Date().toISOString(),
            platform_id: platformId,
            company_id: company.id,
            company_name: company.name,
            brand_id: brand?.id ?? null,
            brand_name: brand?.name ?? null,
            families_count: families.length,
            assets_count: assetsForFamilies.length,
            teams_count: teamRows.length,
        },
        teams: teamRows,
        families,
        assets: assetsForFamilies,
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log(
        JSON.stringify(
            {
                out: outPath,
                metadata: payload.metadata,
            },
            null,
            2
        )
    );
    await pool.end();
}

main().catch((error) => {
    console.error(
        "❌ Red Bull alignment snapshot export failed:",
        error instanceof Error ? error.message : error
    );
    void pool.end();
    process.exit(1);
});
