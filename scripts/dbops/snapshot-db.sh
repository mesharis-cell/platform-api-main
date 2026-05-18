#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"

usage() {
    cat >&2 <<EOF
Usage: $0 staging|prod [label]

Creates a read-only pg_dump custom-format snapshot for the selected DB.
The dump includes public + drizzle schemas, writes a checksum, captures a
connection fingerprint, and verifies that pg_restore can read the archive.
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
PG_DUMP_BIN="$(resolve_pg_tool PG_DUMP_BIN pg_dump)"
PG_RESTORE_BIN="$(resolve_pg_tool PG_RESTORE_BIN pg_restore)"
add_pg_tool_lib_path "$PSQL_BIN"
add_pg_tool_lib_path "$PG_DUMP_BIN"
add_pg_tool_lib_path "$PG_RESTORE_BIN"

if ! command -v sha256sum >/dev/null 2>&1; then
    echo "Missing required command: sha256sum" >&2
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

TARGET="${1:-}"
LABEL="${2:-manual}"

case "$TARGET" in
    staging)
        DB_URL="${STAGING_DATABASE_URL:-}"
        ;;
    prod)
        DB_URL="${PROD_DATABASE_URL:-}"
        if [[ "${SNAPSHOT_PROD_CONFIRM:-}" != "SNAPSHOT PROD" ]]; then
            echo "Refusing prod snapshot without SNAPSHOT_PROD_CONFIRM=\"SNAPSHOT PROD\"." >&2
            echo "This is read-only, but can still add load to production." >&2
            exit 1
        fi
        ;;
    *)
        usage
        exit 1
        ;;
esac

if [[ -z "$DB_URL" ]]; then
    echo "Missing database URL for target: $TARGET" >&2
    exit 1
fi

SAFE_LABEL="$(printf "%s" "$LABEL" | tr -cs '[:alnum:]_.-' '-' | sed 's/^-//;s/-$//')"
if [[ -z "$SAFE_LABEL" ]]; then
    SAFE_LABEL="manual"
fi

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
SNAPSHOT_ROOT="$API_ROOT/.dbops/snapshots"
RUN_DIR="$SNAPSHOT_ROOT/$TARGET-$SAFE_LABEL-$TIMESTAMP"
mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"
umask 077

DUMP_PATH="$RUN_DIR/$TARGET-$SAFE_LABEL-$TIMESTAMP.dump"
FINGERPRINT_PATH="$RUN_DIR/fingerprint-before.tsv"
TOC_PATH="$RUN_DIR/pg-restore-list.txt"
CHECKSUM_PATH="$RUN_DIR/sha256sum.txt"
MANIFEST_PATH="$RUN_DIR/manifest.txt"

echo "Snapshot target: $TARGET"
echo "Artifacts: $RUN_DIR"

SERVER_VERSION_NUM="$(PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -At -c "show server_version_num")"
SERVER_MAJOR="$((SERVER_VERSION_NUM / 10000))"
PG_DUMP_MAJOR="$(pg_major "$PG_DUMP_BIN")"

if (( PG_DUMP_MAJOR < SERVER_MAJOR )); then
    cat >&2 <<EOF
pg_dump is too old for this database.
Server major: $SERVER_MAJOR
pg_dump: $("$PG_DUMP_BIN" --version)

Install/use PostgreSQL client $SERVER_MAJOR+ or set PG_DUMP_BIN=/path/to/pg_dump.
EOF
    exit 1
fi

PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -At -F $'\t' <<'SQL' > "$FINGERPRINT_PATH"
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
select 'drizzle_table_count',
       count(*)::text
from information_schema.tables
where table_schema = 'drizzle'
  and table_type = 'BASE TABLE';
select 'asset_count', count(*)::text from public.assets;
select 'drizzle_migration_table',
       coalesce(to_regclass('drizzle.__drizzle_migrations')::text, 'missing');
SQL

echo "Running pg_dump..."
PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PG_DUMP_BIN" "$DB_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --schema=public \
    --schema=drizzle \
    --file "$DUMP_PATH"

echo "Verifying dump archive..."
"$PG_RESTORE_BIN" --list "$DUMP_PATH" > "$TOC_PATH"
sha256sum "$DUMP_PATH" > "$CHECKSUM_PATH"

SIZE_BYTES="$(wc -c < "$DUMP_PATH" | tr -d ' ')"
SHA256="$(cut -d' ' -f1 "$CHECKSUM_PATH")"

cat > "$MANIFEST_PATH" <<EOF
target=$TARGET
label=$SAFE_LABEL
created_at_utc=$TIMESTAMP
dump_path=$DUMP_PATH
size_bytes=$SIZE_BYTES
sha256=$SHA256
psql_version=$("$PSQL_BIN" --version)
pg_dump_version=$("$PG_DUMP_BIN" --version)
pg_restore_version=$("$PG_RESTORE_BIN" --version)
fingerprint_file=$FINGERPRINT_PATH
toc_file=$TOC_PATH
checksum_file=$CHECKSUM_PATH
schemas=public,drizzle
restore_command=APP_ENV=staging DB_RESTORE_CONFIRM="RESTORE STAGING $(basename "$DUMP_PATH")" bash scripts/dbops/restore-db-snapshot.sh staging "$DUMP_PATH"
EOF

echo "Snapshot complete."
echo "Dump: $DUMP_PATH"
echo "SHA256: $SHA256"
echo "Manifest: $MANIFEST_PATH"
