#!/usr/bin/env bash
set -euo pipefail
# ============================================================================
# refresh-staging-from-prod.sh  —  DRESS-REHEARSAL prod -> staging refresh
#
# MODEL (changed 2026-07-14; supersedes the old data-only column-intersection
# import). The old flow copied prod DATA into staging's ALREADY-MIGRATED schema
# and kept staging's drizzle journal — so every migration between prod's head
# and staging's head was already marked applied and its DATA BACKFILL never ran
# against the imported rows (0072's sell-rate stamp being the live example:
# imported prod lines stayed unstamped). That did NOT reproduce "prod data as it
# will look AFTER cutover".
#
# The new flow is a cutover DRESS REHEARSAL:
#
#   1. SNAPSHOT prod            read-only pg_dump of the app-owned schemas
#                               (public + drizzle) via snapshot-db.sh. This
#                               captures prod's schema, data AND its
#                               drizzle.__drizzle_migrations journal. Supabase-
#                               managed schemas are excluded exactly as
#                               snapshot-db.sh already scopes them.
#   2. RESTORE wholesale        pg_restore --clean --if-exists --single-transaction
#                               --no-owner --no-acl into staging via
#                               restore-db-snapshot.sh. Every app object incl.
#                               the journal is dropped + recreated from the dump,
#                               so staging's drizzle journal becomes PROD's. This
#                               ALSO restores prod's live outbound notification
#                               queue (notification_logs with status QUEUED /
#                               PROCESSING / RETRYING) into staging.
#   3. KILL QUEUE (autocommit)  IMMEDIATELY after restore succeeds and BEFORE the
#                               full sanitize, flip every pending notification_logs
#                               row (QUEUED/PROCESSING/RETRYING → SKIPPED) in ONE
#                               autocommit psql statement (no BEGIN/COMMIT). This
#                               can never be rolled back by a later failure, so
#                               the staging worker can never dispatch prod's
#                               restored queue to real customers. (Sanitize's own
#                               step-0 repeats this — belt-and-suspenders.)
#   4. SANITIZE                 sanitize-staging.sh: re-neutralise the queue
#                               (idempotent), then rewrite every email-bearing /
#                               outbound-contact column so staging cannot mail
#                               real customers.
#   5. MIGRATE (the rehearsal)  APP_ENV=staging bunx drizzle-kit migrate against
#                               staging. With prod's journal restored, drizzle
#                               replays EXACTLY the migrations prod has not run
#                               yet — DDL + data backfills, in order — which is
#                               the cutover itself, rehearsed on prod-shaped data.
#
#   (The demo-order seed is a further step, run by the refresh-staging-full.sh
#    wrapper, which then re-runs the sanitize once more to catch seed contacts.)
#
# SAFETY (non-negotiable):
#   - APP_ENV=staging hard-gate at entry.
#   - dry-run is default-safe: it READS both DBs to print the full plan (guard
#     result, snapshot/restore intent, the exact migrations that would replay,
#     the sanitize plan) but issues ZERO writes.
#   - apply mode requires TWO typed acknowledgments BEFORE the first write:
#       (a) DBOPS_REFRESH_CONFIRM="REFRESH STAGING <ref>" — names the target.
#       (b) DBOPS_WORKER_ACK="WORKER STOPPED" — a HARD GATE affirming the staging
#           notification worker is stopped. The restore copies prod's live
#           outbound queue into staging; the staging worker polls every 1s and
#           sends QUEUED/RETRYING rows via Resend to recipient_email, so a running
#           worker can leak prod mail to real customers in the window before the
#           queue is neutralised. Stop/scale the staging API (or its worker) to
#           zero BEFORE refreshing, restart it AFTER.
#     Plus the shared FIFTH GUARD (write target must not be prod).
#   - PROD_DATABASE_URL is consumed for DATA in exactly ONE place — the dump
#     (snapshot-db.sh). It is NEVER exported into a write-capable step; the
#     migrate step is run with `env -u PROD_DATABASE_URL`.
#   - Mid-failure re-runnable: restore is a single transaction (atomic rollback),
#     the queue-kill + migrate/sanitize are idempotent, and an existing dump can
#     be reused via DBOPS_REFRESH_DUMP=/path/to.dump to avoid re-hitting prod.
#
# Usage:
#   APP_ENV=staging bash scripts/dbops/refresh-staging-from-prod.sh dry-run
#   APP_ENV=staging DBOPS_REFRESH_CONFIRM="REFRESH STAGING <ref>" \
#       DBOPS_WORKER_ACK="WORKER STOPPED" \
#       bash scripts/dbops/refresh-staging-from-prod.sh apply
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"
export DBOPS_ENV_FILE="$ENV_FILE" # ensure sub-scripts read the SAME env file

# shellcheck source=scripts/dbops/lib-dbops-guard.sh
source "$SCRIPT_DIR/lib-dbops-guard.sh"

if [[ "${APP_ENV:-}" != "staging" ]]; then
    echo "ERROR: refresh-staging-from-prod.sh requires APP_ENV=staging (got: \"${APP_ENV:-<unset>}\")" >&2
    echo "  Run via: APP_ENV=staging bash scripts/dbops/refresh-staging-from-prod.sh ..." >&2
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
fi

# Source WITHOUT `set -a`: URLs stay shell-local and are NOT exported to child
# processes. Sub-scripts (snapshot/restore/sanitize) self-source $DBOPS_ENV_FILE;
# the migrate step gets STAGING passed explicitly with PROD stripped.
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${PROD_DATABASE_URL:?PROD_DATABASE_URL is required}"
: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is required}"

MODE="${1:-apply}"
if [[ "$MODE" != "apply" && "$MODE" != "dry-run" ]]; then
    echo "Usage: $0 [dry-run|apply]" >&2
    exit 1
fi

PSQL_BIN="$(dbops_resolve_psql)"
dbops_add_pg_lib_path "$PSQL_BIN" # subshell export above is lost; set it here too
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
RUN_DIR="$API_ROOT/.dbops/staging-refresh-$TIMESTAMP"
mkdir -p "$RUN_DIR"
echo "Artifacts: $RUN_DIR"

STAGING_REF="$(dbops_url_field "$STAGING_DATABASE_URL" ref)"
STAGING_HOST="$(dbops_url_field "$STAGING_DATABASE_URL" host)"
CONFIRM_TOKEN="${STAGING_REF:-$STAGING_HOST}"
REQUIRED_CONFIRM="REFRESH STAGING $CONFIRM_TOKEN"

# ----------------------------------------------------------------------------
# Migration-replay plan: how many migrations prod has applied vs the local
# journal — i.e. what `drizzle-kit migrate` would replay after the restore.
# Read-only; used by both dry-run (plan) and apply (report).
# ----------------------------------------------------------------------------
prod_applied_count() {
    "$PSQL_BIN" "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -At \
        -c "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null || echo "0"
}

print_replay_plan() {
    local applied="$1"
    python3 - "$API_ROOT/drizzle/meta/_journal.json" "$applied" <<'PY'
import json, sys
journal = json.load(open(sys.argv[1]))
applied = int(sys.argv[2])
entries = sorted(journal["entries"], key=lambda e: e["idx"])
total = len(entries)
replay = [e for e in entries if e["idx"] >= applied]
print(f"  prod has applied : {applied} migration(s)")
print(f"  local journal has: {total} migration(s)")
if not replay:
    print("  -> nothing to replay (prod is already at local journal head)")
else:
    print(f"  -> {len(replay)} migration(s) would replay on staging after restore:")
    for e in replay:
        print(f"       [{e['idx']:>3}] {e['tag']}")
PY
}

# ============================================================================
# DRY RUN — read-only plan, ZERO writes.
# ============================================================================
if [[ "$MODE" == "dry-run" ]]; then
    echo ""
    echo "=== [dry-run] Fifth guard (read-only) ==="
    dbops_assert_write_target_safe "$STAGING_DATABASE_URL" "$PROD_DATABASE_URL" 1

    echo ""
    echo "=== [dry-run] Plan ==="
    echo "  1. SNAPSHOT prod  -> pg_dump (public + drizzle) via snapshot-db.sh"
    echo "  2. RESTORE        -> wholesale pg_restore into staging ($CONFIRM_TOKEN)"
    echo "  3. KILL QUEUE     -> autocommit UPDATE: pending notification_logs -> SKIPPED"
    echo "  4. SANITIZE       -> sanitize-staging.sh (re-neutralise queue + email columns)"
    echo "  5. MIGRATE        -> APP_ENV=staging bunx drizzle-kit migrate (replay)"
    echo ""
    echo "  Apply requires: DBOPS_REFRESH_CONFIRM=\"$REQUIRED_CONFIRM\""
    echo "                  DBOPS_WORKER_ACK=\"WORKER STOPPED\" (staging worker must be stopped)"

    echo ""
    echo "=== [dry-run] Migration-replay plan (the dress rehearsal) ==="
    APPLIED="$(prod_applied_count)"
    print_replay_plan "$APPLIED"

    echo ""
    echo "=== [dry-run] Sanitize plan (staging current state) ==="
    APP_ENV=staging bash "$SCRIPT_DIR/sanitize-staging.sh" dry-run || true

    echo ""
    echo "[dry-run] Complete. No DB writes were made. Artifacts: $RUN_DIR"
    exit 0
fi

# ============================================================================
# APPLY — destructive.
# ============================================================================
echo ""
echo "=== Typed confirmation ==="
if [[ "${DBOPS_REFRESH_CONFIRM:-}" != "$REQUIRED_CONFIRM" ]]; then
    cat >&2 <<EOF
Refusing destructive refresh without exact confirmation.

Required:
  DBOPS_REFRESH_CONFIRM="$REQUIRED_CONFIRM"

Example:
  APP_ENV=staging DBOPS_REFRESH_CONFIRM="$REQUIRED_CONFIRM" \\
      bash scripts/dbops/refresh-staging-from-prod.sh apply
EOF
    exit 1
fi
echo "  Confirmation accepted for target: $CONFIRM_TOKEN"

# ----------------------------------------------------------------------------
# HARD WORKER GATE (before any write). The restore copies prod's live outbound
# notification queue into staging; the staging notification worker polls every
# 1 second, claims rows with status IN ('QUEUED','RETRYING') and sends them via
# Resend to recipient_email. A worker running during the refresh can dispatch
# prod's restored queue to REAL CUSTOMERS in the window before it is neutralised.
# This gate refuses unless the operator has affirmed the worker is stopped.
# ----------------------------------------------------------------------------
echo ""
echo "=== Worker-stop acknowledgment (hard gate, before any write) ==="
if [[ "${DBOPS_WORKER_ACK:-}" != "WORKER STOPPED" ]]; then
    cat >&2 <<'EOF'
Refusing destructive refresh: staging notification worker not acknowledged as stopped.

WHY THIS GATE EXISTS
  The restore copies prod's notification_logs wholesale into staging — including
  its in-flight OUTBOUND QUEUE (rows with status QUEUED / PROCESSING / RETRYING).
  The staging API's notification worker polls every 1 second, claims rows with
  status IN ('QUEUED','RETRYING'), and sends them via Resend to recipient_email.
  If that worker is running during the refresh it can dispatch prod's restored
  queue to REAL CUSTOMERS in the window before the queue is neutralised.

HOW TO SATISFY IT
  1. STOP the staging notification worker first — stop or scale the staging API
     (or its dedicated worker process) to zero so nothing polls the queue.
  2. Re-run this refresh with the acknowledgment set:
         DBOPS_WORKER_ACK="WORKER STOPPED"
  3. RESTART the staging API / worker AFTER the refresh completes. The queue is
     neutralised immediately after restore (autocommit) and again by sanitize,
     so the worker starts against a clean, SKIPPED queue.
EOF
    exit 1
fi
echo "  Worker-stop acknowledged (DBOPS_WORKER_ACK)."

# Optional allowlist (honoured if present in the sourced env): staging ref must
# be explicitly allow-listed. Absent => rely on typed confirm + the fifth guard.
if [[ -n "${DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS:-}" && -n "$STAGING_REF" ]]; then
    if [[ ",${DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS//[[:space:]]/}," != *",$STAGING_REF,"* ]]; then
        echo "ERROR: staging ref '$STAGING_REF' not in DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS. Refusing." >&2
        exit 1
    fi
    echo "  Allowlist: staging ref '$STAGING_REF' is allow-listed."
fi

echo ""
echo "=== Fifth guard (before first write) ==="
dbops_assert_write_target_safe "$STAGING_DATABASE_URL" "$PROD_DATABASE_URL" 1

# ----------------------------------------------------------------------------
# Step 1 — SNAPSHOT prod (read-only). PROD_DATABASE_URL is consumed ONLY here.
#          Reuse an existing dump via DBOPS_REFRESH_DUMP for cheap retries.
# ----------------------------------------------------------------------------
echo ""
echo "=== Step 1/5: Snapshot prod (read-only) ==="
if [[ -n "${DBOPS_REFRESH_DUMP:-}" ]]; then
    if [[ ! -f "$DBOPS_REFRESH_DUMP" ]]; then
        echo "DBOPS_REFRESH_DUMP set but file not found: $DBOPS_REFRESH_DUMP" >&2
        exit 1
    fi
    DUMP_PATH="$DBOPS_REFRESH_DUMP"
    echo "  Reusing provided dump: $DUMP_PATH"
else
    SNAP_LOG="$RUN_DIR/snapshot.log"
    SNAPSHOT_PROD_CONFIRM="SNAPSHOT PROD" \
        bash "$SCRIPT_DIR/snapshot-db.sh" prod refresh-replay | tee "$SNAP_LOG"
    DUMP_PATH="$(grep -E '^Dump: ' "$SNAP_LOG" | tail -1 | sed 's/^Dump: //')"
    if [[ -z "$DUMP_PATH" || ! -f "$DUMP_PATH" ]]; then
        echo "ERROR: could not determine dump path from snapshot output." >&2
        exit 1
    fi
fi
echo "  Dump: $DUMP_PATH"

# Record the replay plan NOW (prod journal, pre-restore) for the final report.
APPLIED_BEFORE="$(prod_applied_count)"
print_replay_plan "$APPLIED_BEFORE" | tee "$RUN_DIR/replay-plan.txt"

# ----------------------------------------------------------------------------
# Step 2 — RESTORE wholesale into staging. Atomic (--single-transaction); a
#          mid-restore failure rolls back and the whole refresh is re-runnable.
# ----------------------------------------------------------------------------
echo ""
echo "=== Step 2/5: Restore wholesale into staging ==="
DB_RESTORE_CONFIRM="RESTORE STAGING $(basename "$DUMP_PATH")" \
    APP_ENV=staging bash "$SCRIPT_DIR/restore-db-snapshot.sh" staging "$DUMP_PATH" apply

# ----------------------------------------------------------------------------
# Step 3 — KILL QUEUE (time-critical, own autocommit statement). The restore
#          just brought prod's live outbound queue into staging. Neutralise it
#          NOW, in a SINGLE autocommit psql -c (NO BEGIN/COMMIT), so it can never
#          be rolled back by a later failure in the multi-statement sanitize
#          transaction. This is the one write that MUST land before anything else
#          can fail. Sanitize's own step-0 repeats it (idempotent).
# ----------------------------------------------------------------------------
echo ""
echo "=== Step 3/5: Neutralise outbound queue (immediate, autocommit) ==="
"$PSQL_BIN" "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off -c \
    "update public.notification_logs set status = 'SKIPPED', next_attempt_at = null, error_message = coalesce(error_message, '') || ' [staging-refresh: queue neutralised immediately post-restore]' where status in ('QUEUED','PROCESSING','RETRYING');" \
    | tee "$RUN_DIR/queue-kill.log"
echo "  Outbound queue neutralised (pending notification_logs -> SKIPPED)."

# ----------------------------------------------------------------------------
# Step 4 — SANITIZE (re-neutralise queue, then rewrite contact columns).
# ----------------------------------------------------------------------------
echo ""
echo "=== Step 4/5: Sanitize staging ==="
APP_ENV=staging bash "$SCRIPT_DIR/sanitize-staging.sh" apply | tee "$RUN_DIR/sanitize.log"

# ----------------------------------------------------------------------------
# Step 5 — MIGRATE (the dress rehearsal). Replays prod-head -> local-head:
#          DDL + data backfills, in journal order, against prod-shaped data.
#          PROD_DATABASE_URL is stripped from this write-capable step.
# ----------------------------------------------------------------------------
echo ""
echo "=== Step 5/5: Migrate staging (replay) ==="
(
    cd "$API_ROOT"
    env -u PROD_DATABASE_URL DATABASE_URL="$STAGING_DATABASE_URL" APP_ENV=staging \
        bunx drizzle-kit migrate
) | tee "$RUN_DIR/migrate.log"

# ----------------------------------------------------------------------------
# Report
# ----------------------------------------------------------------------------
APPLIED_AFTER="$(
    "$PSQL_BIN" "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -At \
        -c "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null || echo "?"
)"

echo ""
echo "====================================================================="
echo " Staging refresh (dress rehearsal) complete"
echo "====================================================================="
echo "  Dump                : $DUMP_PATH"
echo "  Prod journal (before): $APPLIED_BEFORE migration(s)"
echo "  Staging journal (after migrate): $APPLIED_AFTER migration(s)"
echo "  Replay plan         : $RUN_DIR/replay-plan.txt"
echo "  Queue-kill log      : $RUN_DIR/queue-kill.log"
echo "  Sanitize log        : $RUN_DIR/sanitize.log"
echo "  Migrate log         : $RUN_DIR/migrate.log"
echo ""
echo "  Fidelity gate (recommended, not run here):"
echo "      APP_ENV=staging bun run db:ops:pricing-tieout"
echo "      -> recomputes every priced entity's totals with the current engine"
echo "         and diffs vs the stored snapshot; must be clean apart from the"
echo "         documented terminal-entity deltas."
