import dotenv from "dotenv";
import path from "path";
import readline from "node:readline";

type DestructiveAction = "seed" | "rebuild";

type DbTarget = {
    host: string;
    port: string;
    database: string;
    username: string;
    supabaseProjectRef: string | null;
};

const DEFAULT_BLOCKED_ENVS = ["production", "prod"];
const ACTION_LABEL: Record<DestructiveAction, string> = {
    seed: "data wipe + seed data",
    rebuild: "drop schema + rebuild schema",
};
const ACTION_PREFIX: Record<DestructiveAction, string> = {
    seed: "SEED",
    rebuild: "REBUILD",
};
const GUARDRAIL_DOC_PATH = "api/README.md (Destructive DB guardrails)";

const parseCsv = (value?: string) =>
    (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const parseSupabaseProjectRef = (username: string): string | null => {
    if (!username.startsWith("postgres.")) return null;
    const ref = username.slice("postgres.".length).trim();
    return ref ? ref : null;
};

const parseDbTarget = (databaseUrl: string): DbTarget => {
    let parsed: URL;
    try {
        parsed = new URL(databaseUrl);
    } catch {
        throw new Error("Invalid DATABASE_URL");
    }

    return {
        host: parsed.hostname,
        port: parsed.port || "5432",
        database: parsed.pathname.replace(/^\//, "") || "postgres",
        username: decodeURIComponent(parsed.username || ""),
        supabaseProjectRef: parseSupabaseProjectRef(decodeURIComponent(parsed.username || "")),
    };
};

const targetToken = (target: DbTarget) =>
    target.supabaseProjectRef || `${target.host}:${target.port}/${target.database}`;

const ask = async (question: string): Promise<string> => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    rl.close();
    return answer.trim();
};

const protectionBlockMessage = (context: string) =>
    [
        "🚫 Production protection is active for destructive DB commands.",
        context,
        `This is blocked by design to prevent accidental data/schema wipe on the wrong environment.`,
        `If this target is a safe non-production DB, follow the approved steps in ${GUARDRAIL_DOC_PATH}.`,
    ].join(" ");

function assertSafeTarget(target: DbTarget): void {
    const allowedRefs = parseCsv(process.env.DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS);
    const allowedHosts = parseCsv(process.env.DB_DESTRUCTIVE_ALLOWED_HOSTS);

    if (target.supabaseProjectRef) {
        if (allowedRefs.includes(target.supabaseProjectRef)) return;
        throw new Error(
            protectionBlockMessage(
                `Blocked target: Supabase project ref "${target.supabaseProjectRef}" is not allow-listed.`
            )
        );
    }

    if (allowedHosts.includes(target.host)) return;
    throw new Error(protectionBlockMessage(`Blocked target: host "${target.host}" is not allow-listed.`));
}

function assertEnvNotBlocked(): void {
    const blockedEnvs = parseCsv(process.env.DB_DESTRUCTIVE_BLOCKED_ENVS);
    const effectiveBlocked = blockedEnvs.length > 0 ? blockedEnvs : DEFAULT_BLOCKED_ENVS;
    const currentEnv = (process.env.APP_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
    if (!currentEnv) return;
    if (!effectiveBlocked.includes(currentEnv)) return;
    throw new Error(
        protectionBlockMessage(`Blocked runtime env: "${currentEnv}" is in DB_DESTRUCTIVE_BLOCKED_ENVS.`)
    );
}

export function loadDbEnv(): void {
    dotenv.config({ path: path.join(process.cwd(), ".env") });
}

export async function enforceDestructiveDbGuard(action: DestructiveAction): Promise<void> {
    loadDbEnv();

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is missing in .env");

    assertEnvNotBlocked();

    const target = parseDbTarget(databaseUrl);
    assertSafeTarget(target);

    const token = targetToken(target);
    const requiredPhrase = `${ACTION_PREFIX[action]} ${token}`;
    const universalPhrase = `ALL ${token}`;
    const providedConfirmation = (process.env.DB_DESTRUCTIVE_CONFIRM || "").trim();
    if (providedConfirmation === requiredPhrase || providedConfirmation === universalPhrase) return;

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error(
            [
                "Non-interactive terminal: destructive command requires explicit confirmation.",
                `Set DB_DESTRUCTIVE_CONFIRM="${requiredPhrase}" (or "${universalPhrase}") for this run.`,
            ].join(" ")
        );
    }

    console.log("\n⚠️  Destructive database command");
    console.log(`Action: ${ACTION_LABEL[action]}`);
    console.log(`Target host: ${target.host}`);
    if (target.supabaseProjectRef) console.log(`Supabase project ref: ${target.supabaseProjectRef}`);
    console.log(`Database: ${target.database}`);
    console.log(`\nType "${requiredPhrase}" to continue.`);

    const answer = await ask("> ");
    if (answer !== requiredPhrase) throw new Error("Confirmation phrase mismatch. Command cancelled.");
}
