/**
 * Unified env loader — the single choke point for env loading across every
 * entrypoint (deployed server, CLI scripts, dev, tests).
 *
 * Two ways this module gets loaded:
 *   1. `bun --preload ./src/bootstrap/env-preload.ts` for scripts + dev
 *   2. `import "./bootstrap/env"` as the first line in src/server.ts (deployed)
 *
 * Layered env-file load order (highest-to-lowest precedence):
 *   1. EB-injected env vars       — deployed prod/staging only
 *   2. .env.{APP_ENV}             — env-specific (staging/testing/production) — OVERRIDE
 *   3. .env                       — shared fallback defaults
 *
 * Why override:true on .env.{APP_ENV}:
 *   Bun auto-loads `.env` BEFORE our `--preload` runs (bun built-in behavior).
 *   Without override, `.env.{APP_ENV}` can't replace what bun just loaded.
 *   With override:true, env-specific always wins locally. Deployed EB has no
 *   .env files shipped, so the override is a no-op there — EB env properties
 *   stay authoritative.
 *
 * APP_ENV must be set externally (package.json script prefix or EB env
 * properties). No fallback — missing APP_ENV fails loud at boot, catching
 * misconfiguration before any request processes.
 *
 * In deployed containers (EB) neither .env file ships, so both dotenv.config
 * calls are silent no-ops; process.env comes from EB env-property injection.
 */

import dotenv from "dotenv";
import path from "path";
import { getAppEnv, type AppEnv } from "../app/constants/app-env";

const REQUIRED_SECRETS = [
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "RESEND_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
    "AWS_BUCKET_NAME",
] as const;

let _loaded = false;

export const loadEnv = (): AppEnv => {
    if (_loaded) return getAppEnv();

    const appEnv = getAppEnv();

    dotenv.config({ path: path.join(process.cwd(), `.env.${appEnv}`), override: true });
    dotenv.config({ path: path.join(process.cwd(), ".env") });

    const missing = REQUIRED_SECRETS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(
            `[env] Missing required secrets for APP_ENV=${appEnv}: ${missing.join(", ")}. ` +
                `For deployed envs, check AWS EB environment properties. ` +
                `For local dev, check .env and .env.${appEnv}.`
        );
    }

    _loaded = true;
    return appEnv;
};

loadEnv();
