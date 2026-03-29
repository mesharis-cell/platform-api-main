import { pool } from "..";
import { generateBackfillReport, writeBackfillArtifacts } from "./asset-family-backfill.shared";

async function main() {
    const report = await generateBackfillReport();
    const dir = await writeBackfillArtifacts(report);

    console.log("Asset family backfill report generated");
    console.log(`Database: ${report.database_name}`);
    console.log(`Families: ${report.family_count}`);
    console.log(`Stock records: ${report.stock_record_count}`);
    console.log(`Review required: ${report.review_required_count}`);
    console.log(`Artifacts: ${dir}`);

    await pool.end();
}

main().catch((error) => {
    console.error(
        "Asset family backfill report generation failed:",
        error instanceof Error ? error.message : error
    );
    process.exit(1);
});
