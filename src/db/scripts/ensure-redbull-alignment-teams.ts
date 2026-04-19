import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { assertAppEnv } from "../safety/guards";
import { db, pool } from "../../db";
import { companies, teams } from "../../db/schema";

assertAppEnv(["staging"]);

const DEFAULT_TEAM_NAMES = ["EVENTS", "EXTRA", "CONSUMER COLLECTING", "SPORTS"] as const;

const getArg = (name: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (flag: string) => process.argv.includes(`--${flag}`);

async function main() {
    const companyId = getArg("company-id");
    const platformId = getArg("platform-id");
    const companyName = getArg("company-name");
    const dryRun = hasFlag("dry-run");

    if ((!companyId && !companyName) || !platformId) {
        throw new Error(
            "Usage: bun run db:redbull:ensure-teams -- --platform-id <uuid> (--company-id <uuid> | --company-name <name>) [--dry-run]"
        );
    }

    const company = companyId
        ? await db.query.companies.findFirst({
              where: and(eq(companies.id, companyId), eq(companies.platform_id, platformId)),
              columns: { id: true, name: true, platform_id: true },
          })
        : await db.query.companies.findFirst({
              where: and(eq(companies.name, companyName!), eq(companies.platform_id, platformId)),
              columns: { id: true, name: true, platform_id: true },
          });

    if (!company) {
        throw new Error("Target company not found");
    }

    const existingTeams = await db.query.teams.findMany({
        where: and(eq(teams.platform_id, platformId), eq(teams.company_id, company.id)),
        columns: {
            id: true,
            name: true,
        },
    });

    const existingNames = new Set(existingTeams.map((team) => team.name.trim().toUpperCase()));
    const missingNames = DEFAULT_TEAM_NAMES.filter((name) => !existingNames.has(name));

    if (dryRun) {
        console.log(
            JSON.stringify(
                {
                    company: company.name,
                    existing_teams: existingTeams.map((team) => team.name),
                    missing_teams: missingNames,
                    would_create_count: missingNames.length,
                },
                null,
                2
            )
        );
        return;
    }

    const created: Array<{ id: string; name: string }> = [];

    for (const name of missingNames) {
        const [team] = await db
            .insert(teams)
            .values({
                platform_id: platformId,
                company_id: company.id,
                name,
                description: `Imported Red Bull department team for ${name}`,
                can_other_teams_see: true,
                can_other_teams_book: false,
            })
            .returning({ id: teams.id, name: teams.name });
        created.push(team);
    }

    console.log(
        JSON.stringify(
            {
                company: company.name,
                created_count: created.length,
                created,
                existing_count: existingTeams.length,
            },
            null,
            2
        )
    );
    await pool.end();
}

main().catch((error) => {
    console.error(
        "❌ Red Bull alignment team bootstrap failed:",
        error instanceof Error ? error.message : error
    );
    void pool.end();
    process.exit(1);
});
