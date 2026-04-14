# Env & Safety Model

Single source of truth for how env files are loaded, which scripts target
which env, and where the safety guards live.

## Env files

| File | Loaded when | Contents | Git |
|---|---|---|---|
| `.env` | Always (shared fallback) | Truly-shared defaults only: SALT_ROUNDS, JWT expiry, APP_NAME, SYSTEM_USER_*, EMAIL_FROM | gitignored |
| `.env.staging` | `APP_ENV=staging` | Staging DB URL, JWT secrets, RESEND key, AWS creds, destructive-guard allowlist for staging ref | gitignored |
| `.env.testing` | `APP_ENV=testing` | Test DB URL, JWT secrets, RESEND key, AWS creds, destructive-guard allowlist for test ref, `PORT=9100` | gitignored |
| `.env.production` | `APP_ENV=production` | **FAKE values only** — safety net for local. Real prod secrets live ONLY in AWS EB env properties | gitignored |
| `.env.dbops` | Sourced by `scripts/dbops/*.sh` only | `STAGING_DATABASE_URL` + `PROD_DATABASE_URL` for cross-env operations (refresh-staging, fingerprint-db) | gitignored |
| `.env.test.example` | N/A | Template copy-from-for-new-devs | committed |

**Hard rule:** real prod secrets never touch a developer machine. `.env.production`
locally holds dead DB URL + fake keys. Anything connecting with
`APP_ENV=production` from a dev machine hits fakes, not real prod data.

## Loader

`src/bootstrap/env.ts` is the single choke point. It:
1. Reads `APP_ENV` from `process.env` (throws if unset or invalid)
2. Loads `.env.{APP_ENV}` with `override: true` — wins over bun's auto-loaded `.env`
3. Loads `.env` as fallback — fills any gaps
4. Validates 8 required secrets are present — throws if any missing

Loaded via two paths:
- **Deployed server** (`node dist/server.js` / `bun run dist/server.js`):
  `src/server.ts` first line is `import "./bootstrap/env"` — runs at module load.
- **CLI + dev**: `bun --preload ./src/bootstrap/env-preload.ts <script>` —
  runs before any other import evaluates.

## Required secrets (8)

Validated at boot in `bootstrap/env.ts`. Missing any = fail-fast crash:

```
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
RESEND_API_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_BUCKET_NAME
```

These MUST be set in every EB environment (staging + prod) as Environment
properties. Plus `APP_ENV=staging` or `APP_ENV=production` respectively.

## Safety guards

Single module: `src/db/safety/guards.ts`. Three functions:

- `assertAppEnv(allowed)` — throws if current APP_ENV isn't in the allowed list.
  Called at module load in every destructive script.
- `assertIsTestDatabase()` — checks `_e2e_test_db_marker` row exists on
  connected DB. Only test DB has this; wiping any other DB blocked.
- `assertDestructiveOpAllowed("SEED" | "REBUILD")` — runs the Supabase-ref
  allowlist + env-block + typed-confirmation flow for staging-class destructive ops.

Scripts that wipe data call `assertAppEnv(["staging"])` + either
`assertIsTestDatabase()` (test scripts) or `assertDestructiveOpAllowed(...)`
(staging scripts). Read-only scripts call only `assertAppEnv([...])`.

## Script → APP_ENV mapping

| Script | APP_ENV | Required guards |
|---|---|---|
| `test:e2e`, `dev:test`, `db:seed:test`, `db:bootstrap:test` | `testing` (hardcoded) | assertAppEnv + assertIsTestDatabase |
| `dev` | `staging` (hardcoded) | N/A (not destructive) |
| `start` | whatever EB injects | boot-time validation only |
| `db:seed`, `db:seed:pr`, `db:seed:demo:pr`, `db:rebuild`, `db:reset*` | operator sets | assertAppEnv(["staging"]) + destructive-guard |
| `db:platform:*`, `db:redbull:*`, `asset-family:*`, `import:*` | operator sets | assertAppEnv (varies) |
| `dbops:*` | `staging` (hardcoded in package.json) | shell-side APP_ENV check |

Risky scripts that require `APP_ENV` to be set explicitly by the operator
fail-fast with a helpful message if it's missing.

## Fail-fast examples

```
$ bun run db:seed
error: APP_ENV must be set to one of: production, staging, testing. Got: "<unset>".

$ APP_ENV=production bun run db:rebuild
❌ db:rebuild failed: [guard] APP_ENV=production is not allowed for this
   operation. Allowed: [staging]. Run with `APP_ENV=staging bun run <script>`
   if appropriate.

$ APP_ENV=testing bun run db:seed
❌ db:seed failed: [guard] APP_ENV=testing is not allowed for this operation.
   Allowed: [staging].
```

## Deployed env (AWS EB)

- Docker image built from `Dockerfile`. ENTRYPOINT is `bun run dist/server.js`.
- `.env.*` files are excluded from the image via `.dockerignore` — the
  container has no env files on disk.
- `process.env` is populated by EB environment properties (Configuration →
  Software → Environment properties).
- `bootstrap/env` calls dotenv.config on files that don't exist → silent no-ops.
- Validator throws if any of the 8 required secrets is missing → EB marks
  instance unhealthy → Immutable deploy rolls back automatically.

**Critical:** Before deploying, verify in EB console:
1. `APP_ENV` is set (`=staging` for staging EB, `=production` for prod EB)
2. All 8 required secrets are present
3. Deploy policy is `Immutable` (so a bad boot auto-rolls-back)
