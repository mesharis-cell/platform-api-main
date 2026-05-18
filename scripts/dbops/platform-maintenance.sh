#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"

DEFAULT_MESSAGE="Kadence is temporarily unavailable for scheduled maintenance. Please try again shortly."

usage() {
    cat >&2 <<EOF
Usage:
  $0 staging|prod status
  $0 staging|prod enable [minutes] [message...]
  $0 staging|prod enable --dry-run [minutes] [message...]
  $0 staging|prod disable [message...]
  $0 staging|prod disable --dry-run [message...]

Examples:
  bash scripts/dbops/platform-maintenance.sh prod status
  MAINTENANCE_CONFIRM="ENABLE PROD MAINTENANCE" bash scripts/dbops/platform-maintenance.sh prod enable 30
  MAINTENANCE_CONFIRM="DISABLE PROD MAINTENANCE" bash scripts/dbops/platform-maintenance.sh prod disable

Notes:
  - enable/disable applies to all active platforms.
  - prod writes require MAINTENANCE_CONFIRM with the exact phrase printed above.
  - status and --dry-run never write.
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
add_pg_tool_lib_path "$PSQL_BIN"

set -a
source "$ENV_FILE"
set +a

TARGET="${1:-}"
ACTION="${2:-status}"
if [[ $# -ge 2 ]]; then
    shift 2
else
    usage
    exit 1
fi

case "$TARGET" in
    staging)
        DB_URL="${STAGING_DATABASE_URL:-}"
        ;;
    prod)
        DB_URL="${PROD_DATABASE_URL:-}"
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

MODE="apply"
if [[ "${1:-}" == "--dry-run" || "${1:-}" == "dry-run" ]]; then
    MODE="dry-run"
    shift
fi

run_status() {
    PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" -q "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
\pset null '<null>'
SELECT
    name,
    domain,
    is_active,
    maintenance_mode AS raw_enabled,
    CASE
        WHEN maintenance_mode AND (maintenance_until IS NULL OR maintenance_until > now())
            THEN true
        ELSE false
    END AS effective_enabled,
    maintenance_until,
    maintenance_message
FROM platforms
ORDER BY name;
SQL
}

ensure_prod_confirm() {
    local expected="$1"
    if [[ "$TARGET" != "prod" || "$MODE" == "dry-run" ]]; then
        return
    fi

    if [[ "${MAINTENANCE_CONFIRM:-}" != "$expected" ]]; then
        cat >&2 <<EOF
Refusing prod maintenance write without exact confirmation.

Required:
  MAINTENANCE_CONFIRM="$expected"
EOF
        exit 1
    fi
}

case "$ACTION" in
    status)
        run_status
        ;;

    enable)
        DURATION_MINUTES=30
        if [[ $# -gt 0 && "$1" =~ ^[0-9]+$ ]]; then
            DURATION_MINUTES="$1"
            shift
        fi

        if (( DURATION_MINUTES < 1 || DURATION_MINUTES > 240 )); then
            echo "Duration must be between 1 and 240 minutes." >&2
            exit 1
        fi

        MESSAGE="${*:-$DEFAULT_MESSAGE}"

        if [[ "$MODE" == "dry-run" ]]; then
            PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" -q "$DB_URL" \
                -v ON_ERROR_STOP=1 \
                -v minutes="$DURATION_MINUTES" \
                -v message="$MESSAGE" <<'SQL'
\pset pager off
\pset null '<null>'
WITH params AS (
    SELECT
        now() + make_interval(mins => (:minutes)::int) AS until_at,
        :'message'::text AS msg
)
SELECT
    p.name,
    p.domain,
    CASE
        WHEN p.maintenance_mode AND (p.maintenance_until IS NULL OR p.maintenance_until > now())
            THEN 'UPDATED'
        ELSE 'ENABLED'
    END AS would_audit_action,
    params.until_at AS would_maintenance_until,
    params.msg AS would_message
FROM platforms p
CROSS JOIN params
WHERE p.is_active = true
ORDER BY p.name;
SQL
            exit 0
        fi

        ensure_prod_confirm "ENABLE PROD MAINTENANCE"

        PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" -q "$DB_URL" \
            -v ON_ERROR_STOP=1 \
            -v minutes="$DURATION_MINUTES" \
            -v message="$MESSAGE" <<'SQL'
\pset pager off
\pset null '<null>'
WITH params AS (
    SELECT
        now() + make_interval(mins => (:minutes)::int) AS until_at,
        :'message'::text AS msg
),
target_platforms AS (
    SELECT
        p.id,
        p.maintenance_mode,
        p.maintenance_until
    FROM platforms p
    WHERE p.is_active = true
),
updated AS (
    UPDATE platforms p
    SET
        maintenance_mode = true,
        maintenance_message = params.msg,
        maintenance_until = params.until_at,
        maintenance_updated_at = now(),
        maintenance_updated_by = NULL,
        updated_at = now()
    FROM target_platforms tp, params
    WHERE p.id = tp.id
    RETURNING
        p.id,
        p.name,
        p.domain,
        p.maintenance_until,
        params.msg,
        CASE
            WHEN tp.maintenance_mode AND (tp.maintenance_until IS NULL OR tp.maintenance_until > now())
                THEN 'UPDATED'
            ELSE 'ENABLED'
        END AS audit_action
),
audit AS (
    INSERT INTO platform_maintenance_audit (platform_id, action, message, until, actor_id)
    SELECT id, audit_action, msg, maintenance_until, NULL
    FROM updated
    RETURNING platform_id
)
SELECT
    u.name,
    u.domain,
    u.audit_action,
    u.maintenance_until
FROM updated u
ORDER BY u.name;
SQL
        ;;

    disable)
        MESSAGE="${*:-Maintenance disabled via dbops script.}"

        if [[ "$MODE" == "dry-run" ]]; then
            PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" -q "$DB_URL" \
                -v ON_ERROR_STOP=1 <<'SQL'
\pset pager off
\pset null '<null>'
SELECT
    name,
    domain,
    'DISABLED' AS would_audit_action,
    maintenance_mode AS current_raw_enabled,
    maintenance_until AS current_until
FROM platforms
WHERE is_active = true
ORDER BY name;
SQL
            exit 0
        fi

        ensure_prod_confirm "DISABLE PROD MAINTENANCE"

        PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$PSQL_BIN" -q "$DB_URL" \
            -v ON_ERROR_STOP=1 \
            -v message="$MESSAGE" <<'SQL'
\pset pager off
\pset null '<null>'
WITH target_platforms AS (
    SELECT id
    FROM platforms
    WHERE is_active = true
),
updated AS (
    UPDATE platforms p
    SET
        maintenance_mode = false,
        maintenance_message = NULL,
        maintenance_until = NULL,
        maintenance_updated_at = now(),
        maintenance_updated_by = NULL,
        updated_at = now()
    FROM target_platforms tp
    WHERE p.id = tp.id
    RETURNING p.id, p.name, p.domain
),
audit AS (
    INSERT INTO platform_maintenance_audit (platform_id, action, message, until, actor_id)
    SELECT id, 'DISABLED', :'message'::text, NULL, NULL
    FROM updated
    RETURNING platform_id
)
SELECT
    name,
    domain,
    'DISABLED' AS audit_action
FROM updated
ORDER BY name;
SQL
        ;;

    *)
        usage
        exit 1
        ;;
esac
