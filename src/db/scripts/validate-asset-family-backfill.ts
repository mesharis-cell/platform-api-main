import { sql } from "drizzle-orm";
import { db, pool } from "..";

async function singleValue(query: any) {
    const result = await db.execute(query);
    const row = Array.isArray(result) ? result[0] : (result as any)?.rows?.[0];
    return Number(Object.values(row as Record<string, unknown>)[0] || 0);
}

async function main() {
    const nonDeletedWithoutFamily = await singleValue(
        sql`select count(*) from assets where family_id is null and deleted_at is null`
    );
    const orphanedAssignments = await singleValue(
        sql`select count(*) from assets where family_id is not null and family_id not in (select id from asset_families)`
    );
    const orphanedFamilies = await singleValue(
        sql`select count(*) from asset_families where deleted_at is null and id not in (select distinct family_id from assets where family_id is not null)`
    );
    const serializedQuantityMismatch = await singleValue(sql`
        select count(*)
        from assets a
        join asset_families f on a.family_id = f.id
        where f.stock_mode = 'SERIALIZED'
          and a.total_quantity != 1
          and a.deleted_at is null
    `);

    console.log(`non_deleted_without_family=${nonDeletedWithoutFamily}`);
    console.log(`orphaned_assignments=${orphanedAssignments}`);
    console.log(`orphaned_families=${orphanedFamilies}`);
    console.log(`serialized_quantity_mismatch=${serializedQuantityMismatch}`);

    await pool.end();
}

main().catch((error) => {
    console.error(
        "Asset family backfill validation failed:",
        error instanceof Error ? error.message : error
    );
    process.exit(1);
});
