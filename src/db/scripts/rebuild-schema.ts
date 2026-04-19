import { Client } from "pg";
import { assertAppEnv } from "../safety/guards";
import { enforceDestructiveDbGuard } from "./destructive-guard";
import { runCommand } from "./process.utils";

async function wipePublicSchema(connectionString: string): Promise<void> {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    } finally {
        await client.end();
    }
}

async function main(): Promise<void> {
    assertAppEnv(["staging"]);
    await enforceDestructiveDbGuard("rebuild");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is missing");

    console.log("🧹 Dropping and recreating public schema...");
    await wipePublicSchema(databaseUrl);

    console.log("🧱 Applying current schema via drizzle push...");
    await runCommand("bunx", ["drizzle-kit", "push", "--force"]);

    console.log("✅ Schema rebuild complete");
}

main().catch((error) => {
    console.error("❌ db:rebuild failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
