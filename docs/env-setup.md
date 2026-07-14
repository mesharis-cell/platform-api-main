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
2. **Restore wholesale + neutralise queue in ONE transaction** via
   `restore-db-snapshot.sh`, using a **materialise-first** two-phase model with a
   **wholesale schema reset** (replaces `pg_restore --clean`; 2026-07-14c).
   _Phase A:_ `pg_restore --no-owner --no-acl -f <run-dir>/restore.sql` (**no
   `--clean`**) **materialises** the dump to a file (no DB connection), and its exit
   code is checked **explicitly**. If `pg_restore` dies mid-stream (incl.
   mid-`COPY`), **psql is never invoked** — so a truncated `COPY` stream can never
   be committed. The file is then prepared in place (still no DB): the preamble
   `lock_timeout` is bounded, a **wholesale-reset block is prepended**, and a tail
   of best-effort public-schema grants + any `DB_RESTORE_APPEND_SQL` (the
   queue-neutralise `UPDATE`) is **appended**. _Phase B (only on `pg_restore` exit
   0):_ the whole file runs as **one** `psql --single-transaction -v
ON_ERROR_STOP=1 -f <file>`. So the reset, every app object (incl. prod's drizzle
   journal — staging's journal becomes **prod's**) **and** the flip of prod's
   restored outbound queue (`notification_logs` rows with status
   `QUEUED`/`PROCESSING`/`RETRYING` → `SKIPPED`) **commit together, atomically**.
   This is **structurally zero-window**: at the commit-instant the DB never, at
   any visible instant, contains a claimable queue row, so the staging worker can
   never observe prod's queue — not even for the old sub-second autocommit gap.
   `ON_ERROR_STOP` rolls the **entire** transaction back on any failure (incl. a
   failure in the appended SQL), so a mid-restore failure leaves staging unchanged
   and the refresh is re-runnable (the script confirms this by diffing an
   identity/row-count fingerprint captured before vs after).

    **Why wholesale, not `--clean`:** `pg_restore --clean` emits per-object `DROP`s
    derived from the **dump's (prod's)** schema and runs them against **staging's**
    schema, so **any** drift between the two aborts the whole transaction. The first
    live run failed exactly here — `DROP INDEX workflow_definitions_platform_code_unique`
    (a plain `UNIQUE INDEX` on prod) hit a same-named **`UNIQUE CONSTRAINT`** on
    staging (`cannot drop index … constraint requires it`) and rolled the txn back
    (cleanly — the machinery worked). Rather than reconcile object-by-object forever,
    the reset drops the whole drift class: the prepended block runs as the first
    statements of the txn —

    ```sql
    SET lock_timeout = '<RESTORE_LOCK_TIMEOUT>';
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    ```

    — and the **dump body itself recreates both schemas** (verified: the emission
    contains `CREATE SCHEMA drizzle;` **and** `CREATE SCHEMA public;`) plus every
    object, so the reset does **not** recreate them (a duplicate `CREATE` would abort
    the txn). Staging-only objects in `public`/`drizzle` are dropped **by design**
    (wholesale replace); other schemas (`extensions`/`vault`/`pg_catalog`/…) are
    **untouched** — staging has no extensions in `public`, so the `CASCADE` is safe.
    Supabase `public`-schema grants (stripped by `--no-acl`) are re-granted
    **best-effort** in the tail (`GRANT USAGE ON SCHEMA public TO anon, authenticated,
   service_role`, `DO`-wrapped so a missing role can't abort the restore).

    A **connection sweep** (`pg_terminate_backend` over other client backends on the
    staging DB, self excluded) runs **between materialise and execute** (adjacent to
    the transaction — materialisation can take minutes, so sweeping earlier would
    just let clients reconnect) so the `DROP SCHEMA CASCADE` doesn't wait on staging
    API/worker locks; connected clients reconnect and see brief errors. A finite
    `lock_timeout` is forced into the restore transaction (reset block + rewritten
    dump preamble) so a lock wait fails fast (re-runnable) instead of hanging. (Over
    a Supabase **transaction** pooler URL the sweep is best-effort — a direct
    `db.<ref>` URL sweeps hardest; the `lock_timeout` is the backstop either way.)

3. **Kill queue (autocommit, belt-and-suspenders)** — the orchestrator re-runs
   the same flip in a single autocommit `psql -c` immediately after the restore.
   This is now **provably redundant** (step 2 already neutralised the queue in
   the restore transaction) but cheap; kept as defence in depth. Sanitize repeats
   it a third time.
4. **Sanitize** (`sanitize-staging.sh`) — re-neutralise the outbound queue
   (idempotent belt-and-suspenders; also covers standalone sanitize runs), then
   rewrite every email-bearing / outbound-contact column so staging cannot mail
   real customers. Idempotent.
5. **Migrate** — `APP_ENV=staging bunx drizzle-kit migrate`. With prod's journal
   restored, drizzle replays **exactly** the migrations prod has not run yet
   (DDL + data backfills) = the cutover, rehearsed.
6. **Seed** demo orders, then **re-sanitize** (wrapper only).

**Stopping the staging worker is now OPTIONAL, not a safety requirement.** Email
safety no longer depends on it: the queue is neutralised **in the same
transaction** as the restore (step 2), the pre-restore connection sweep clears
worker locks, and sanitize rewrites every outbound address. The staging
notification worker polls every 1 second and claims `status IN
('QUEUED','RETRYING')`, but after the restore commits there are **zero** such
rows, so there is nothing for it to send. The restore does briefly drop +
recreate staging's tables, so the **live staging API will error for the duration
of the restore** and swept clients must reconnect — that hiccup is why `apply`
requires the informational ack `DBOPS_REFRESH_ACK="STAGING WILL HICCUP"`. You
**may** still stop/scale the staging API to zero for a quieter run, but it is no
longer required for correctness.

Safety: `APP_ENV=staging` gate; `dry-run` reads both DBs but writes nothing;
`apply` requires **both** `DBOPS_REFRESH_CONFIRM="REFRESH STAGING <ref>"` **and**
`DBOPS_REFRESH_ACK="STAGING WILL HICCUP"` (checked before the first write), plus a
fifth guard (`lib-dbops-guard.sh`) that resolves the write target's Supabase ref +
live fingerprint and hard-refuses if it is (or resolves to) prod. That same guard
also runs **inside `restore-db-snapshot.sh` itself** before its first destructive
statement (and before the connection sweep), so the restore refuses a prod write
target even when invoked standalone (not just via the orchestrator). The restore
executes as one `psql --single-transaction`, so a mid-refresh failure rolls back
and is safely re-runnable from the top; reuse an existing dump on retry with
`DBOPS_REFRESH_DUMP=/path/to.dump`. `PROD_DATABASE_URL` supplies data in exactly
one place (the dump) and is never exported into a write-capable step.

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
