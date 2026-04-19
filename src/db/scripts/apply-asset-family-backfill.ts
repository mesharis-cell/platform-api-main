import { assertAppEnv } from "../safety/guards";
import { db, pool } from "..";
import { assetFamilies } from "../schema";
import {
    BackfillOverrides,
    FamilyProposal,
    findExistingFamily,
    hasFlag,
    parseFlag,
    readJsonFile,
    resolveFamilyProposal,
    updateAssetFamilyIds,
} from "./asset-family-backfill.shared";

assertAppEnv(["staging"]);

async function main() {
    const reportDir = parseFlag("--report-dir");
    if (!reportDir) {
        throw new Error("Missing --report-dir");
    }

    const apply = hasFlag("--apply");
    const overridesPath = parseFlag("--overrides");

    const families = await readJsonFile<FamilyProposal[]>(`${reportDir}/families.json`);
    const overrides = overridesPath
        ? await readJsonFile<BackfillOverrides>(overridesPath)
        : undefined;

    const resolved = families.map((family) => resolveFamilyProposal(family, overrides));
    const unresolved = resolved.filter((family) => !family.final_stock_mode);

    console.log(`Families loaded: ${resolved.length}`);
    console.log(`Unresolved review groups: ${unresolved.length}`);

    if (!apply) {
        console.log("Dry run only. Use --apply to insert families and assign assets.");
        return;
    }

    if (unresolved.length > 0) {
        throw new Error(
            `Cannot apply backfill with unresolved groups. Provide overrides for ${unresolved.length} group(s).`
        );
    }

    let createdFamilies = 0;
    let reusedFamilies = 0;
    let assignedAssets = 0;

    await db.transaction(async (tx) => {
        for (const family of resolved) {
            const existing = await findExistingFamily(tx, {
                platform_id: family.platform_id,
                company_id: family.company_id,
                name: family.final_family_name,
            });

            if (existing.length > 1) {
                throw new Error(
                    `Multiple matching asset families found for group ${family.group_key}. Resolve duplicates first.`
                );
            }

            let familyId = existing[0]?.id;
            if (!familyId) {
                const [created] = await tx
                    .insert(assetFamilies)
                    .values({
                        platform_id: family.platform_id,
                        company_id: family.company_id,
                        brand_id: family.brand_id,
                        team_id: family.representative_fields.team_id,
                        name: family.final_family_name,
                        description: family.representative_fields.description,
                        // category_id must be resolved from asset_categories table
                        // at runtime. This script is a legacy one-time backfill.
                        category_id: (family as any).resolved_category_id,
                        images: family.representative_fields.images,
                        on_display_image: family.representative_fields.on_display_image,
                        stock_mode: family.final_stock_mode!,
                        packaging: family.representative_fields.packaging,
                        weight_per_unit: family.representative_fields.weight_per_unit,
                        dimensions: family.representative_fields.dimensions,
                        volume_per_unit: family.representative_fields.volume_per_unit,
                        handling_tags: family.representative_fields.handling_tags,
                    })
                    .returning({ id: assetFamilies.id });

                familyId = created.id;
                createdFamilies += 1;
            } else {
                reusedFamilies += 1;
            }

            assignedAssets += await updateAssetFamilyIds(tx, family.asset_ids, familyId);
        }
    });

    console.log(`Created families: ${createdFamilies}`);
    console.log(`Reused families: ${reusedFamilies}`);
    console.log(`Assets assigned: ${assignedAssets}`);

    await pool.end();
}

main().catch((error) => {
    console.error(
        "Asset family backfill apply failed:",
        error instanceof Error ? error.message : error
    );
    process.exit(1);
});
