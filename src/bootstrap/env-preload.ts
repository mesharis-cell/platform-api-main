/**
 * `bun --preload` target. Wire via package.json scripts:
 *
 *   "dev":       "APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts --hot ./src/server.ts"
 *   "dev:test":  "APP_ENV=testing bun --preload ./src/bootstrap/env-preload.ts --hot ./src/server.ts"
 *   "db:<op>":   "bun --preload ./src/bootstrap/env-preload.ts ./src/db/scripts/<op>.ts"
 *
 * Why --preload: ES module imports are hoisted — setting process.env inside
 * a script's body runs AFTER its imports have already resolved, which is
 * too late to affect the shared db pool's connection string. This preload
 * runs before any other module loads, so env is fully populated + validated
 * by the time config/index.ts or db/index.ts first reads process.env.
 */
import "./env";
