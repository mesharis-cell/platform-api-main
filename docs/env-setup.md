# Env & Safety Model

Single source of truth for how env files are loaded, which scripts target
which env, and where the safety guards live.

## Env files

| File                | Loaded when                          | Contents                                                                                                                            | Git        |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `.env`              | Always (shared fallback)             | Truly-shared defaults only: SALT*ROUNDS, JWT expiry, APP_NAME, SYSTEM_USER*\*, EMAIL_FROM                                           | gitignored |
| `.env.staging`      | `APP_ENV=staging`                    | Staging DB URL, JWT secrets, RESEND key, AWS creds, destructive-guard allowlist for staging ref                                     | gitignored |
| `.env.testing`      | `APP_ENV=testing`                    | Test DB URL, JWT secrets, RESEND key, AWS creds, destructive-guard allowlist for test ref, `PORT=9100`                              | gitignored |
| `.env.production`   | `APP_ENV=production`                 | **FAKE values only** — safety net for local. Real prod secrets live ONLY in AWS EB env properties                                   | gitignored |
| `.env.dbops`        | Sourced by `scripts/dbops/*.sh` only | `STAGING_DATABASE_URL` + `PROD_DATABASE_URL` for cross-env operations (refresh-staging, snapshot/restore, sanitize, fingerprint-db) | gitignored |
| `.env.test.example` | N/A                                  | Template copy-from-for-new-devs                                                                                                     | committed  |

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

| Script                                                                | APP_ENV                               | Required guards                               |
| --------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| `test:e2e`, `dev:test`, `db:seed:test`, `db:bootstrap:test`           | `testing` (hardcoded)                 | assertAppEnv + assertIsTestDatabase           |
| `dev`                                                                 | `staging` (hardcoded)                 | N/A (not destructive)                         |
| `start`                                                               | whatever EB injects                   | boot-time validation only                     |
| `db:seed`, `db:seed:pr`, `db:seed:demo:pr`, `db:rebuild`, `db:reset*` | operator sets                         | assertAppEnv(["staging"]) + destructive-guard |
| `db:platform:*`, `db:redbull:*`, `asset-family:*`, `import:*`         | operator sets                         | assertAppEnv (varies)                         |
| `dbops:*`                                                             | `staging` (hardcoded in package.json) | shell-side APP_ENV check                      |

Risky scripts that require `APP_ENV` to be set explicitly by the operator
fail-fast with a helpful message if it's missing.

## Staging refresh (dress-rehearsal model)

`dbops:refresh-staging` reproduces "prod data as it will look **after** the next
cutover", so it can be used to rehearse the migration + backfill and gate it with
`db:ops:pricing-tieout`. It is NOT a data-only copy.

Flow (`scripts/dbops/refresh-staging-from-prod.sh` + `refresh-staging-full.sh`):

1. **Snapshot prod** — read-only `pg_dump` of the app-owned schemas (`public` +
   `drizzle`) via `snapshot-db.sh`; captures schema, data, and prod's
   `drizzle.__drizzle_migrations` journal. Supabase-managed schemas are excluded.
2. **Restore wholesale** into staging via `restore-db-snapshot.sh`
   (`pg_restore --clean --if-exists --single-transaction --no-owner --no-acl`) —
   staging's drizzle journal becomes **prod's**. This also restores prod's live
   outbound notification queue (`notification_logs` rows with status
   `QUEUED`/`PROCESSING`/`RETRYING`) into staging.
3. **Kill queue (immediate, autocommit)** — the orchestrator runs a **single
   autocommit `psql -c`** (no `BEGIN`/`COMMIT`) flipping every pending
   `notification_logs` row → `SKIPPED`, immediately after the restore succeeds
   and **before** the full sanitize. Because it is its own committed statement it
   can never be rolled back by a later failure in sanitize's multi-statement
   transaction — the one write that must land first so the staging worker can
   never dispatch prod's restored queue to real customers.
4. **Sanitize** (`sanitize-staging.sh`) — re-neutralise the outbound queue
   (idempotent belt-and-suspenders; also covers standalone sanitize runs), then
   rewrite every email-bearing / outbound-contact column so staging cannot mail
   real customers. Idempotent.
5. **Migrate** — `APP_ENV=staging bunx drizzle-kit migrate`. With prod's journal
   restored, drizzle replays **exactly** the migrations prod has not run yet
   (DDL + data backfills) = the cutover, rehearsed.
6. **Seed** demo orders, then **re-sanitize** (wrapper only).

**Stop the staging worker first (hard gate).** The restore brings prod's live
outbound queue into staging, and the staging notification worker polls **every
1 second**, claims `status IN ('QUEUED','RETRYING')` and sends via Resend to
`recipient_email`. A worker running during the refresh can leak prod mail to
**real customers** in the window before the queue is neutralised. Therefore
`apply` is a **hard gate**: stop or scale the staging API (or its worker) to zero
**before** refreshing, then affirm it with `DBOPS_WORKER_ACK="WORKER STOPPED"`.
Restart the worker **after** the refresh completes — the queue is neutralised
immediately post-restore (step 3, autocommit) and again by sanitize (step 4), so
it starts against a clean, `SKIPPED` queue.

Safety: `APP_ENV=staging` gate; `dry-run` reads both DBs but writes nothing;
`apply` requires **both** `DBOPS_REFRESH_CONFIRM="REFRESH STAGING <ref>"` **and**
`DBOPS_WORKER_ACK="WORKER STOPPED"` (checked before the first write), plus a fifth
guard (`lib-dbops-guard.sh`) that resolves the write target's Supabase ref +
live fingerprint and hard-refuses if it is (or resolves to) prod. That same guard
now also runs **inside `restore-db-snapshot.sh` itself** before its first
destructive statement, so the restore refuses a prod write target even when
invoked standalone (not just via the orchestrator). Restore is a single
transaction, so a mid-refresh failure is safely re-runnable from the top; reuse
an existing dump on retry with `DBOPS_REFRESH_DUMP=/path/to.dump`.
`PROD_DATABASE_URL` supplies data in exactly one place (the dump) and is never
exported into a write-capable step.

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
