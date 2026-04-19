#!/usr/bin/env bash
#
# login-report.sh
#
# Read-only: exports client user login activity to a CSV file.
# Strictly SELECT — no writes, no side-effects.
#
# Usage:
#   bash scripts/dbops/login-report.sh prod
#   bash scripts/dbops/login-report.sh staging
#
# Called by package.json scripts:
#   bun run dbops:login-report:prod
#   bun run dbops:login-report:staging
#

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
    prod)    DB_URL="${PROD_DATABASE_URL:-}" ;;
    staging) DB_URL="${STAGING_DATABASE_URL:-}" ;;
    *)       echo "Invalid target: $TARGET" >&2; exit 1 ;;
esac

if [[ -z "$DB_URL" ]]; then
    echo "Missing database URL for target: $TARGET" >&2
    exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="$API_ROOT/.dbops"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/login-report-$TARGET-$TIMESTAMP.csv"

psql "$DB_URL" -v ON_ERROR_STOP=1 --csv -c "
SELECT
    u.name                                          AS \"Name\",
    u.email                                         AS \"Email\",
    u.role                                          AS \"Role\",
    COALESCE(c.name, 'Platform-wide')               AS \"Company\",
    CASE WHEN u.is_active THEN 'Active'
         ELSE 'Inactive' END                        AS \"Status\",
    CASE WHEN u.last_login_at IS NULL THEN 'Never logged in'
         ELSE to_char(u.last_login_at AT TIME ZONE 'Asia/Dubai',
                      'DD Mon YYYY, HH12:MI AM')
    END                                             AS \"Last Login\",
    to_char(u.created_at AT TIME ZONE 'Asia/Dubai',
            'DD Mon YYYY')                          AS \"Created\"
FROM users u
LEFT JOIN companies c ON u.company = c.id
WHERE u.role = 'CLIENT'
ORDER BY u.last_login_at DESC NULLS LAST, u.name ASC;
" > "$OUTPUT_FILE"

ROW_COUNT=$(tail -n +2 "$OUTPUT_FILE" | wc -l)
echo "✓ $ROW_COUNT client user(s) → $OUTPUT_FILE"
