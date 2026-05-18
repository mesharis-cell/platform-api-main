#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"

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

echo "Starting destructive restore. This may drop and recreate public/drizzle objects."
PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PG_RESTORE_BIN" \
    --dbname "$DB_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --single-transaction \
    "$DUMP_PATH" 2>&1 | tee "$LOG_PATH"

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
echo "Fingerprint before: $FINGERPRINT_BEFORE"
echo "Fingerprint after: $FINGERPRINT_AFTER"
