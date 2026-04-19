#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
    echo "Usage: $0 prod|staging" >&2
    exit 1
fi

case "$TARGET" in
    prod)
        DB_URL="${PROD_DATABASE_URL:-}"
        ;;
    staging)
        DB_URL="${STAGING_DATABASE_URL:-}"
        ;;
    *)
        echo "Invalid target: $TARGET" >&2
        exit 1
        ;;
esac

if [[ -z "$DB_URL" ]]; then
    echo "Missing database URL for target: $TARGET" >&2
    exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
select
    current_database() as database_name,
    current_user as db_user,
    version() as server_version;

select
    md5(
        current_database() || '|' ||
        current_user || '|' ||
        coalesce(inet_server_addr()::text, 'local') || '|' ||
        inet_server_port()::text
    ) as connection_fingerprint;

select
    count(*) as public_table_count
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';

select
    count(*) as asset_count
from public.assets;
SQL
