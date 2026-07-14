#!/usr/bin/env bash
set -euo pipefail
# ============================================================================
# restore-db-snapshot.sh  —  DESTRUCTIVE wholesale restore into staging
#
# Restores a custom-format dump (from snapshot-db.sh) into staging. This DROPS +
# recreates app objects in the dumped schemas, so it is the single most
# destructive step in the staging-refresh flow.
#
# EXECUTION MODEL (changed 2026-07-14 — see DB_RESTORE_APPEND_SQL below):
#   pg_restore no longer opens its own connection/transaction. Instead it EMITS
#   plain SQL to stdout (`pg_restore --clean --if-exists --no-owner --no-acl
#   -f -`, which writes NO transaction control of its own), that stream is
#   concatenated with any DB_RESTORE_APPEND_SQL, and the WHOLE stream is fed to
#   `psql --single-transaction -v ON_ERROR_STOP=1`. psql therefore wraps every
#   restored object AND the appended statements in ONE BEGIN/COMMIT:
#     * all-or-nothing atomicity is preserved (equivalent to the old
#       `pg_restore --single-transaction`), and
#     * ON_ERROR_STOP rolls the ENTIRE transaction back on any failure — incl.
#       a failure in the appended SQL — so a mid-restore failure leaves staging
#       byte-unchanged and the whole refresh stays re-runnable.
#   If pg_restore itself dies mid-emit, the emitter appends a poison
#   `RAISE EXCEPTION`, so psql aborts + rolls back instead of COMMITting a
#   partial restore at EOF.
#
#   DB_RESTORE_APPEND_SQL (optional env/arg): SQL appended to the stream INSIDE
#   the transaction — it runs ATOMICALLY WITH THE RESTORE and commits (or rolls
#   back) with it. The staging-refresh orchestrator uses this to neutralise
#   prod's restored outbound notification queue (flip pending notification_logs
#   -> SKIPPED) in the SAME commit as the restore, so at the commit-instant the
#   DB never, at any visible instant, contains a claimable queue row — the
#   notification worker can never see prod's queue even for a sub-second window.
#
# PRE-RESTORE CONNECTION SWEEP (apply only): immediately before the restore
#   transaction, other client connections to the staging DB are terminated
#   (pg_terminate_backend over pg_stat_activity for current_database(), self
#   excluded) so the --clean drops can take ACCESS EXCLUSIVE locks without
#   waiting on the staging API/worker. Connected clients reconnect and may see
#   brief connection errors. Best-effort: a sweep failure is non-fatal.
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

if (( PG_RESTORE_MAJOR < SERVER_MAJOR )); then
    cat >&2 <<EOF
pg_restore is too old for this database.
Server major: $SERVER_MAJOR
pg_restore: $("$PG_RESTORE_BIN" --version)

Install/use PostgreSQL client $SERVER_MAJOR+ or set PG_RESTORE_BIN=/path/to/pg_restore.
EOF
    exit 1
fi

PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -At -F $'\t' <<'SQL' > "$FINGERPRINT_BEFORE"
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

echo "Verifying dump archive..."
"$PG_RESTORE_BIN" --list "$DUMP_PATH" > "$TOC_PATH"
sha256sum "$DUMP_PATH" > "$CHECKSUM_PATH"

if [[ "$MODE" == "--dry-run" || "$MODE" == "dry-run" ]]; then
    echo "Dry run complete. Dump is readable; no DB writes were made."
    echo "On apply this would (in order): sweep other connections, then run"
    echo "  pg_restore --clean --if-exists --no-owner --no-acl -f -  ==pipe==>  psql --single-transaction -v ON_ERROR_STOP=1"
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
# still proceeds (it may then wait on a lock).
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
# Restore as ONE psql transaction. pg_restore only EMITS SQL (-f -, no self
# transaction); we concatenate DB_RESTORE_APPEND_SQL after it; psql wraps the
# whole stream in a single BEGIN/COMMIT (--single-transaction) with ON_ERROR_STOP
# so it is all-or-nothing. If pg_restore dies mid-emit, emit_restore_sql appends
# a poison RAISE EXCEPTION so psql ROLLS BACK rather than COMMITting a partial
# restore at EOF.
# ----------------------------------------------------------------------------
emit_restore_sql() {
    local rc
    PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PG_RESTORE_BIN" \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        -f - \
        "$DUMP_PATH" 2>"$PG_RESTORE_ERR_LOG" && rc=0 || rc=$?
    if (( rc != 0 )); then
        # pg_restore failed mid-stream. Poison the transaction so psql
        # (ON_ERROR_STOP=1 + --single-transaction) rolls back everything it has
        # already applied instead of COMMITting a partial restore at EOF.
        printf "\nDO \$poison\$ BEGIN RAISE EXCEPTION 'pg_restore failed mid-stream (exit %s) — aborting restore transaction'; END \$poison\$;\n" "$rc"
        return "$rc"
    fi
    if [[ -n "${DB_RESTORE_APPEND_SQL:-}" ]]; then
        printf '\n-- ===== DB_RESTORE_APPEND_SQL: runs ATOMICALLY within the restore transaction =====\n'
        printf '%s\n' "$DB_RESTORE_APPEND_SQL"
    fi
    return 0
}

echo "Starting destructive restore (single psql transaction: pg_restore SQL${DB_RESTORE_APPEND_SQL:+ + appended neutralisation})."
if emit_restore_sql \
    | PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" \
        -v ON_ERROR_STOP=1 --single-transaction -f - 2>&1 | tee "$LOG_PATH"; then
    RESTORE_PIPE_STATUS=("${PIPESTATUS[@]}")
    echo "Restore committed atomically (emit|psql|tee exit: ${RESTORE_PIPE_STATUS[*]})."
else
    RESTORE_PIPE_STATUS=("${PIPESTATUS[@]}")
    echo "ERROR: restore stream failed (emit|psql|tee exit: ${RESTORE_PIPE_STATUS[*]})." >&2
    echo "       psql --single-transaction + ON_ERROR_STOP rolled the ENTIRE transaction back:" >&2
    echo "       staging is byte-unchanged (no partial restore, no claimable queue rows). Re-run from the top." >&2
    if [[ -s "$PG_RESTORE_ERR_LOG" ]]; then
        echo "       pg_restore stderr (last lines):" >&2
        tail -5 "$PG_RESTORE_ERR_LOG" | sed 's/^/         /' >&2
    fi
    exit 1
fi

PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -At -F $'\t' <<'SQL' > "$FINGERPRINT_AFTER"
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

echo "Restore complete."
echo "Log: $LOG_PATH"
echo "pg_restore stderr: $PG_RESTORE_ERR_LOG"
echo "Connection sweep: $CONN_SWEEP_LOG"
echo "Fingerprint before: $FINGERPRINT_BEFORE"
echo "Fingerprint after: $FINGERPRINT_AFTER"
