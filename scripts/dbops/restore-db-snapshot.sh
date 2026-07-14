#!/usr/bin/env bash
set -euo pipefail
# ============================================================================
# restore-db-snapshot.sh  —  DESTRUCTIVE wholesale restore into staging
#
# Restores a custom-format dump (from snapshot-db.sh) into staging. This DROPS +
# recreates app objects in the dumped schemas, so it is the single most
# destructive step in the staging-refresh flow.
#
# EXECUTION MODEL (changed 2026-07-14; hardened 2026-07-14b — MATERIALISE-FIRST):
#   The restore runs in TWO phases so a partial COMMIT is STRUCTURALLY impossible:
#
#     Phase A — MATERIALISE. pg_restore EMITS the whole dump as plain SQL to a
#       file in the run dir (`pg_restore --clean --if-exists --no-owner --no-acl
#       -f <run-dir>/restore.sql`) — no DB connection, no transaction of its own.
#       Its exit code is checked EXPLICITLY. If pg_restore dies mid-stream (incl.
#       mid-COPY), psql is NEVER invoked, so a truncated COPY stream can never be
#       COMMITted. (This replaced the old pg_restore|psql live pipe + poison
#       DO-block: on a narrow path — single-column text table, well-formed partial
#       rows, clean EOF-inside-COPY — the poison block was consumable AS COPY data
#       and psql could COMMIT a partial restore. Materialising first removes that
#       path entirely; the poison mechanism is deleted.)
#     Phase B — EXECUTE. ONLY on pg_restore exit 0, the materialised SQL (with any
#       DB_RESTORE_APPEND_SQL appended as its final statements) is fed to
#       `psql --single-transaction -v ON_ERROR_STOP=1 -f <run-dir>/restore.sql`.
#       psql wraps the SINGLE -f file in ONE BEGIN/COMMIT, so every restored object
#       AND the appended statements share one transaction:
#         * all-or-nothing atomicity (equivalent to the old
#           `pg_restore --single-transaction`), and
#         * ON_ERROR_STOP rolls the ENTIRE transaction back on any error — incl. a
#           failure in the appended SQL — so a mid-restore failure leaves staging
#           unchanged and the whole refresh stays re-runnable.
#       A finite lock_timeout is forced into the materialised SQL (pg_dump's own
#       preamble emits `SET lock_timeout = 0;` = wait forever; we rewrite it) so a
#       lock wait ABORTS + rolls back (re-runnable) instead of hanging.
#
#   DB_RESTORE_APPEND_SQL (optional env/arg): SQL appended to the materialised
#   file INSIDE the transaction — it runs ATOMICALLY WITH THE RESTORE and commits
#   (or rolls back) with it. The staging-refresh orchestrator uses this to
#   neutralise prod's restored outbound notification queue (flip pending
#   notification_logs -> SKIPPED) in the SAME commit as the restore, so at the
#   commit-instant the DB never, at any visible instant, contains a claimable
#   queue row — the notification worker can never see prod's queue even for a
#   sub-second window.
#
# PRE-RESTORE CONNECTION SWEEP (apply only): immediately before the restore
#   transaction, other client connections to the staging DB are terminated
#   (pg_terminate_backend over pg_stat_activity for current_database(), self
#   excluded) so the --clean drops can take ACCESS EXCLUSIVE locks without
#   waiting on the staging API/worker. Connected clients reconnect and may see
#   brief connection errors. Best-effort: a sweep failure is non-fatal. NOTE: on a
#   Supabase TRANSACTION-pooler URL the sweep is best-effort only — the pooler
#   multiplexes many client sessions onto a shared set of backends, so terminating
#   a backend does not map 1:1 to a client and some sessions may survive; a direct
#   `db.<ref>.supabase.co` URL gives the strongest sweep guarantee. The forced
#   lock_timeout (Phase B) is the backstop either way: a surviving client that
#   holds a conflicting lock makes the restore fail fast + re-runnable, not hang.
#
# SAFETY GATES (all enforced before the first destructive statement):
#   - APP_ENV=staging hard-gate.
#   - Typed confirmation: DB_RESTORE_CONFIRM="RESTORE STAGING <dump-basename>".
#   - Anti-prod guard (own defence — does NOT trust the caller): sources
#     lib-dbops-guard.sh and calls dbops_assert_write_target_safe on the write
#     target (STAGING_DATABASE_URL) vs PROD_DATABASE_URL. Resolves the write
#     target's Supabase ref + live fingerprint and HARD-REFUSES if it is (or
#     resolves to) prod. Runs standalone: if PROD_DATABASE_URL is absent it
#     falls back to a write-target reachability check. This guard is why the
#     script is safe even when invoked directly, not only via the orchestrator.
#     The guard + all gates run BEFORE the connection sweep and the restore.
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"

# shellcheck source=scripts/dbops/lib-dbops-guard.sh
source "$SCRIPT_DIR/lib-dbops-guard.sh"

usage() {
    cat >&2 <<EOF
Usage: APP_ENV=staging $0 staging /path/to/snapshot.dump [--dry-run]

Restores a custom-format dump created by snapshot-db.sh.
This is destructive: pg_restore runs with --clean --if-exists and can drop
objects in the dumped schemas before recreating them from the snapshot.
EOF
}

resolve_pg_tool() {
    local env_var="$1"
    local tool="$2"
    local configured="${!env_var:-}"
    if [[ -n "$configured" ]]; then
        if [[ ! -x "$configured" ]]; then
            echo "$env_var is set but is not executable: $configured" >&2
            exit 1
        fi
        printf "%s" "$configured"
        return
    fi

    local search_root discovered
    for search_root in "$API_ROOT/.dbops/tools" /tmp /usr/lib/postgresql; do
        discovered="$(
            find "$search_root" \
                -type f \( -path "*/usr/lib/postgresql/*/bin/$tool" -o -path "*/bin/$tool" \) \
                2>/dev/null | sort -V | tail -n 1 || true
        )"
        if [[ -n "$discovered" ]]; then
            printf "%s" "$discovered"
            return
        fi
    done

    if command -v "$tool" >/dev/null 2>&1; then
        command -v "$tool"
        return
    fi

    echo "Missing required command: $tool" >&2
    exit 1
}

pg_major() {
    "$1" --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/'
}

add_pg_tool_lib_path() {
    local bin_path="$1"
    local root="${bin_path%%/usr/lib/postgresql/*}"
    local lib_path="$root/usr/lib/x86_64-linux-gnu"
    if [[ "$root" != "$bin_path" && -d "$lib_path" ]]; then
        export LD_LIBRARY_PATH="$lib_path${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    fi
}

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
fi

PSQL_BIN="$(resolve_pg_tool PSQL_BIN psql)"
PG_RESTORE_BIN="$(resolve_pg_tool PG_RESTORE_BIN pg_restore)"
add_pg_tool_lib_path "$PSQL_BIN"
add_pg_tool_lib_path "$PG_RESTORE_BIN"

if ! command -v sha256sum >/dev/null 2>&1; then
    echo "Missing required command: sha256sum" >&2
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

TARGET="${1:-}"
DUMP_PATH="${2:-}"
MODE="${3:-apply}"

if [[ "$TARGET" != "staging" || -z "$DUMP_PATH" ]]; then
    usage
    exit 1
fi

if [[ "$MODE" != "apply" && "$MODE" != "--dry-run" && "$MODE" != "dry-run" ]]; then
    usage
    exit 1
fi

if [[ "${APP_ENV:-}" != "staging" ]]; then
    echo "ERROR: restore-db-snapshot.sh requires APP_ENV=staging (got: \"${APP_ENV:-<unset>}\")." >&2
    exit 1
fi

DB_URL="${STAGING_DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
    echo "Missing STAGING_DATABASE_URL" >&2
    exit 1
fi

if [[ ! -f "$DUMP_PATH" ]]; then
    echo "Dump not found: $DUMP_PATH" >&2
    exit 1
fi

# Read-only identity + coarse row-count fingerprint of the connected DB. Captured
# BEFORE the restore and again AFTER (on BOTH the success and failure paths): on
# failure, before==after proves a clean rollback, before!=after flags a partial
# commit / anomaly. Never prints a URL. Requires $PSQL_BIN + $DB_URL (set above).
capture_db_fingerprint() {
    local out="$1"
    PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" \
        -v ON_ERROR_STOP=1 -At -F $'\t' <<'SQL' > "$out"
select 'database_name', current_database();
select 'db_user', current_user;
select 'server_version', version();
select 'connection_fingerprint',
       md5(
           current_database() || '|' ||
           current_user || '|' ||
           coalesce(inet_server_addr()::text, 'local') || '|' ||
           inet_server_port()::text
       );
select 'public_table_count',
       count(*)::text
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';
select 'asset_count', count(*)::text from public.assets;
SQL
}

# ----------------------------------------------------------------------------
# Anti-prod guard (own defence, before ANY read or destructive statement on the
# write target). Does not trust the caller: resolves the write target's Supabase
# ref + live fingerprint and hard-refuses if it is (or resolves to) prod. A
# ref/host match refuses at parse-level before any connection, so a swapped
# .env.dbops (STAGING_DATABASE_URL pointing at prod) dies here. Standalone-safe:
# if PROD_DATABASE_URL is absent, fall back to a write-target reachability check.
# ----------------------------------------------------------------------------
echo "=== Anti-prod guard: confirm write target is staging, not prod ==="
if [[ -n "${PROD_DATABASE_URL:-}" ]]; then
    dbops_assert_write_target_safe "$DB_URL" "$PROD_DATABASE_URL" 0
else
    echo "  [guard] PROD_DATABASE_URL not set — running write-target reachability check only." >&2
    dbops_live_fingerprint "$DB_URL" >/dev/null || {
        echo "ERROR: [guard] write target unreachable. Refusing." >&2
        exit 1
    }
fi

RUN_TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
RUN_DIR="$API_ROOT/.dbops/restores/staging-restore-$RUN_TIMESTAMP"
mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"
umask 077

FINGERPRINT_BEFORE="$RUN_DIR/fingerprint-before.tsv"
FINGERPRINT_AFTER="$RUN_DIR/fingerprint-after.tsv"
TOC_PATH="$RUN_DIR/pg-restore-list.txt"
CHECKSUM_PATH="$RUN_DIR/sha256sum.txt"
LOG_PATH="$RUN_DIR/restore.log"
PG_RESTORE_ERR_LOG="$RUN_DIR/pg-restore-stderr.log"
CONN_SWEEP_LOG="$RUN_DIR/conn-sweep.log"

echo "Restore target: staging"
echo "Dump: $DUMP_PATH"
echo "Artifacts: $RUN_DIR"

SERVER_VERSION_NUM="$(PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -At -c "show server_version_num")"
SERVER_MAJOR="$((SERVER_VERSION_NUM / 10000))"
PG_RESTORE_MAJOR="$(pg_major "$PG_RESTORE_BIN")"

# Version guard — PRIMARY check: a custom-format archive can only be read by a
# pg_restore whose major >= the pg_dump that PRODUCED it. The snapshot manifest
# (written by snapshot-db.sh as a sibling of the dump) records that exact pg_dump
# version, so prefer it when present. The server-major floor below is SECONDARY.
DUMP_MANIFEST_PATH="$(dirname "$DUMP_PATH")/manifest.txt"
DUMP_PG_DUMP_MAJOR=""
if [[ -f "$DUMP_MANIFEST_PATH" ]]; then
    DUMP_PG_DUMP_MAJOR="$(sed -nE 's/^pg_dump_version=.*PostgreSQL\)[[:space:]]+([0-9]+).*/\1/p' "$DUMP_MANIFEST_PATH" | head -n1)"
fi
if [[ -n "$DUMP_PG_DUMP_MAJOR" ]] && (( PG_RESTORE_MAJOR < DUMP_PG_DUMP_MAJOR )); then
    cat >&2 <<EOF
pg_restore is older than the pg_dump that created this dump.
Dump produced by pg_dump major: $DUMP_PG_DUMP_MAJOR  (per $DUMP_MANIFEST_PATH)
pg_restore: $("$PG_RESTORE_BIN" --version)

A custom-format archive cannot be read by an older pg_restore.
Install/use PostgreSQL client $DUMP_PG_DUMP_MAJOR+ or set PG_RESTORE_BIN=/path/to/pg_restore.
EOF
    exit 1
fi

# SECONDARY check: pg_restore should also not be older than the target SERVER.
if (( PG_RESTORE_MAJOR < SERVER_MAJOR )); then
    cat >&2 <<EOF
pg_restore is too old for this database.
Server major: $SERVER_MAJOR
pg_restore: $("$PG_RESTORE_BIN" --version)

Install/use PostgreSQL client $SERVER_MAJOR+ or set PG_RESTORE_BIN=/path/to/pg_restore.
EOF
    exit 1
fi

capture_db_fingerprint "$FINGERPRINT_BEFORE"

echo "Verifying dump archive..."
"$PG_RESTORE_BIN" --list "$DUMP_PATH" > "$TOC_PATH"
sha256sum "$DUMP_PATH" > "$CHECKSUM_PATH"

if [[ "$MODE" == "--dry-run" || "$MODE" == "dry-run" ]]; then
    echo "Dry run complete. Dump is readable; no DB writes were made."
    echo "On apply this would (in order): sweep other connections, then MATERIALISE the"
    echo "  dump to <run-dir>/restore.sql via 'pg_restore --clean --if-exists --no-owner"
    echo "  --no-acl -f <file>' (exit checked BEFORE psql is invoked), then execute it as"
    echo "  ONE transaction: 'psql --single-transaction -v ON_ERROR_STOP=1 -f <file>'."
    if [[ -n "${DB_RESTORE_APPEND_SQL:-}" ]]; then
        echo "  with DB_RESTORE_APPEND_SQL appended INSIDE that single transaction (atomic with the restore):"
        printf '%s\n' "$DB_RESTORE_APPEND_SQL" | sed 's/^/      | /'
    else
        echo "  (no DB_RESTORE_APPEND_SQL set — plain restore)"
    fi
    echo "Review artifacts in $RUN_DIR"
    exit 0
fi

REQUIRED_CONFIRM="RESTORE STAGING $(basename "$DUMP_PATH")"
if [[ "${DB_RESTORE_CONFIRM:-}" != "$REQUIRED_CONFIRM" ]]; then
    cat >&2 <<EOF
Refusing destructive restore without exact confirmation.

Required:
  DB_RESTORE_CONFIRM="$REQUIRED_CONFIRM"

Example:
  APP_ENV=staging DB_RESTORE_CONFIRM="$REQUIRED_CONFIRM" bash scripts/dbops/restore-db-snapshot.sh staging "$DUMP_PATH"
EOF
    exit 1
fi

# ----------------------------------------------------------------------------
# Pre-restore connection sweep (best-effort). Terminate other client connections
# to the staging DB so the --clean drops can take ACCESS EXCLUSIVE locks without
# waiting on the staging API/worker. Self is excluded (pg_backend_pid()); only
# client backends are targeted (background workers/autovacuum can't be signalled
# this way and are irrelevant to table locks). Connected clients reconnect and
# may see brief connection errors. A sweep failure is NON-FATAL: the restore
# still proceeds (the forced lock_timeout below then bounds any lock wait).
# CAVEAT: over a Supabase TRANSACTION-pooler URL this sweep is best-effort — the
# pooler multiplexes many client sessions across a shared backend pool, so a
# terminated backend does not map 1:1 to a client and some sessions may persist.
# A direct db.<ref>.supabase.co URL gives the strongest sweep. Either way the
# Phase-B lock_timeout is the backstop (fail-fast + re-runnable, never a hang).
# ----------------------------------------------------------------------------
echo "Pre-restore connection sweep: terminating other client connections to staging."
CONN_SWEEP_SQL="select count(*) as terminated_client_backends from (
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and backend_type = 'client backend'
) s;"
if ! PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" -P pager=off -c "$CONN_SWEEP_SQL" | tee "$CONN_SWEEP_LOG"; then
    echo "  [sweep] warning: could not terminate other connections (continuing; the restore may wait on locks)." >&2
fi

# ----------------------------------------------------------------------------
# Phase A — MATERIALISE. pg_restore EMITS the dump as SQL to a file in the run dir
# (no DB connection, no transaction). Its exit code is checked EXPLICITLY: if
# pg_restore dies mid-stream (incl. mid-COPY), psql is NEVER invoked, so a
# truncated COPY stream can never be COMMITted. This structurally removes the
# partial-commit path the old pg_restore|psql pipe + poison-DO-block only hoped to
# cover. The materialised file is ~dump size; it lives in the run dir (700/umask
# 077), is removed on success, and is kept on failure for inspection.
# ----------------------------------------------------------------------------
RESTORE_SQL_PATH="$RUN_DIR/restore.sql"
RESTORE_LOCK_TIMEOUT="${RESTORE_LOCK_TIMEOUT:-30s}"

echo "Phase A: materialising dump as SQL -> $RESTORE_SQL_PATH"
pg_restore_rc=0
PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PG_RESTORE_BIN" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    -f "$RESTORE_SQL_PATH" \
    "$DUMP_PATH" 2>"$PG_RESTORE_ERR_LOG" || pg_restore_rc=$?

if (( pg_restore_rc != 0 )); then
    echo "ERROR: pg_restore failed while materialising the dump (exit $pg_restore_rc)." >&2
    echo "       psql was NOT invoked — staging is byte-unchanged; no partial restore is possible." >&2
    if [[ -s "$PG_RESTORE_ERR_LOG" ]]; then
        echo "       pg_restore stderr (last lines):" >&2
        tail -5 "$PG_RESTORE_ERR_LOG" | sed 's/^/         /' >&2
    fi
    echo "       Partial materialised SQL kept for inspection: $RESTORE_SQL_PATH" >&2
    exit 1
fi

# Force a finite lock_timeout for the restore transaction. pg_dump's own preamble
# emits `SET lock_timeout = 0;` (wait forever); rewrite it in place so the --clean
# DROP/CREATE statements FAIL FAST (abort + roll back, leaving the refresh
# re-runnable) if a reconnecting client still holds a conflicting lock, instead of
# hanging. Best-effort: if the preamble format ever changes and the rewrite
# matches nothing, the restore still runs with the default (0) lock_timeout.
if sed -i "s/^SET lock_timeout = 0;\$/SET lock_timeout = '$RESTORE_LOCK_TIMEOUT';/" "$RESTORE_SQL_PATH" \
    && grep -qF "SET lock_timeout = '$RESTORE_LOCK_TIMEOUT';" "$RESTORE_SQL_PATH"; then
    echo "  lock_timeout forced to $RESTORE_LOCK_TIMEOUT inside the restore transaction."
else
    echo "  [warn] could not force lock_timeout (pg_dump preamble not matched); restore uses the default (may wait on locks)." >&2
fi

# Append the queue-neutralisation (any DB_RESTORE_APPEND_SQL) as the FINAL
# statements of the SAME file, so psql --single-transaction wraps the restore AND
# the append in ONE BEGIN/COMMIT — they commit or roll back together.
if [[ -n "${DB_RESTORE_APPEND_SQL:-}" ]]; then
    {
        printf '\n-- ===== DB_RESTORE_APPEND_SQL: runs ATOMICALLY within the restore transaction =====\n'
        printf '%s\n' "$DB_RESTORE_APPEND_SQL"
    } >> "$RESTORE_SQL_PATH"
fi

# ----------------------------------------------------------------------------
# Phase B — EXECUTE. Feed the complete materialised file to a single psql
# --single-transaction. The pipeline is only `psql | tee`, so PIPESTATUS[0] is
# psql's OWN exit — the verdict keys on THAT, not on the aggregate pipeline
# status (a tee failure must not be misread as a restore failure, and vice versa).
# ----------------------------------------------------------------------------
echo "Phase B: executing restore as ONE psql transaction (pg_restore SQL${DB_RESTORE_APPEND_SQL:+ + appended neutralisation})."
set +e
PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" \
    -v ON_ERROR_STOP=1 --single-transaction -f "$RESTORE_SQL_PATH" 2>&1 | tee "$LOG_PATH"
RESTORE_PIPE_STATUS=("${PIPESTATUS[@]}")
set -e
PSQL_RC="${RESTORE_PIPE_STATUS[0]:-1}"
TEE_RC="${RESTORE_PIPE_STATUS[1]:-0}"

# Capture the AFTER-fingerprint on BOTH paths. On failure it is the ONLY sound way
# to distinguish a clean rollback (after == before) from a partial commit or a
# tee/pipeline anomaly (after != before). Non-fatal: a fingerprint hiccup must not
# mask the restore verdict.
capture_db_fingerprint "$FINGERPRINT_AFTER" 2>/dev/null \
    || echo "  [warn] could not capture fingerprint-after." >&2

if (( PSQL_RC == 0 )); then
    echo "Restore committed atomically (psql exit 0; tee exit $TEE_RC)."
    rm -f "$RESTORE_SQL_PATH" # large derived artifact; the DB is now the record
else
    echo "ERROR: restore transaction failed (psql exit $PSQL_RC; tee exit $TEE_RC)." >&2
    echo "       psql --single-transaction + ON_ERROR_STOP rolls back on any error." >&2
    if [[ -s "$FINGERPRINT_BEFORE" && -s "$FINGERPRINT_AFTER" ]] \
        && diff -q "$FINGERPRINT_BEFORE" "$FINGERPRINT_AFTER" >/dev/null 2>&1; then
        echo "       Rolled back cleanly: staging fingerprint (identity + public table/asset counts) is UNCHANGED vs before. Re-run from the top." >&2
    else
        echo "       WARNING: TARGET CHANGED (or unverifiable) — fingerprint-after differs from / is missing vs fingerprint-before." >&2
        echo "                DO NOT blindly re-run: investigate staging first." >&2
        if [[ -s "$FINGERPRINT_BEFORE" && -s "$FINGERPRINT_AFTER" ]]; then
            echo "                fingerprint diff (< before / > after):" >&2
            diff "$FINGERPRINT_BEFORE" "$FINGERPRINT_AFTER" | sed 's/^/                  /' >&2 || true
        fi
    fi
    if [[ -s "$PG_RESTORE_ERR_LOG" ]]; then
        echo "       pg_restore stderr (last lines):" >&2
        tail -5 "$PG_RESTORE_ERR_LOG" | sed 's/^/         /' >&2
    fi
    echo "       Materialised SQL kept for inspection: $RESTORE_SQL_PATH" >&2
    exit 1
fi

echo "Restore complete."
echo "Log: $LOG_PATH"
echo "pg_restore stderr: $PG_RESTORE_ERR_LOG"
echo "Connection sweep: $CONN_SWEEP_LOG"
echo "Fingerprint before: $FINGERPRINT_BEFORE"
echo "Fingerprint after: $FINGERPRINT_AFTER"
