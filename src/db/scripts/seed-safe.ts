import { enforceDestructiveDbGuard } from "./destructive-guard";
import { runCommand } from "./process.utils";

async function main(): Promise<void> {
    await enforceDestructiveDbGuard("seed");
    await runCommand("bunx", ["tsx", "src/db/seed.ts"]);
}

main().catch((error) => {
    console.error("❌ db:seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
