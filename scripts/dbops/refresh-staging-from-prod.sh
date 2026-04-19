#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"

# Safety: refresh ops target staging writes. Require APP_ENV=staging so this
# never runs in a context expecting another env. Package.json scripts set
# this prefix inline (see `dbops:refresh-staging*` in package.json).
if [[ "${APP_ENV:-}" != "staging" ]]; then
    echo "ERROR: refresh-staging-from-prod.sh requires APP_ENV=staging (got: \"${APP_ENV:-<unset>}\")" >&2
    echo "  Run via: APP_ENV=staging bash scripts/dbops/refresh-staging-from-prod.sh ..." >&2
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${PROD_DATABASE_URL:?PROD_DATABASE_URL is required}"
: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is required}"

MODE="${1:-apply}"
if [[ "$MODE" != "apply" && "$MODE" != "dry-run" ]]; then
    echo "Usage: $0 [dry-run|apply]" >&2
    exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_ROOT="$API_ROOT/.dbops"
RUN_DIR="$ARTIFACT_ROOT/staging-refresh-$TIMESTAMP"
DATA_DIR="$RUN_DIR/data"
mkdir -p "$DATA_DIR"

echo "Artifacts: $RUN_DIR"

prod_psql() {
    psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off "$@"
}

staging_psql() {
    psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off "$@"
}

capture_fingerprint() {
    local target="$1"
    local output="$2"
    local url
    if [[ "$target" == "prod" ]]; then
        url="$PROD_DATABASE_URL"
    else
        url="$STAGING_DATABASE_URL"
    fi

    psql "$url" -v ON_ERROR_STOP=1 -At -F $'\t' <<'SQL' > "$output"
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

TABLE_SQL="
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
"

COLUMN_SQL="
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
"

prod_psql -At -c "$TABLE_SQL" > "$RUN_DIR/prod-tables.txt"
staging_psql -At -c "$TABLE_SQL" > "$RUN_DIR/staging-tables.txt"

# Table-set asymmetry: prod must be a SUBSET of staging.
# - Tables on prod but not staging → abort (can't synthesize missing targets).
# - Tables on staging but not prod → allowed, but note the CASCADE caveat:
#   the TRUNCATE list is derived from prod-tables.txt so staging-only tables
#   aren't truncated explicitly, HOWEVER `TRUNCATE ... CASCADE` on prod-known
#   parent tables propagates through FK references into staging-only tables.
#   Their schema is preserved, but their ROWS may be wiped if any column
#   FK-references a prod-known table (e.g. self_pickups.platform_id → platforms).
#   If you need staging-only row data to survive a refresh, snapshot it first
#   and re-apply afterwards.
diff -u "$RUN_DIR/prod-tables.txt" "$RUN_DIR/staging-tables.txt" > "$RUN_DIR/table-diff.txt" || true
comm -23 <(sort "$RUN_DIR/prod-tables.txt") <(sort "$RUN_DIR/staging-tables.txt") > "$RUN_DIR/only-in-prod-tables.txt"
if [[ -s "$RUN_DIR/only-in-prod-tables.txt" ]]; then
    echo "ERROR: prod has tables staging doesn't — refresh cannot synthesize missing tables. See $RUN_DIR/only-in-prod-tables.txt" >&2
    exit 1
fi

prod_psql -At -F $'\t' -c "$COLUMN_SQL" > "$RUN_DIR/prod-columns.tsv"
staging_psql -At -F $'\t' -c "$COLUMN_SQL" > "$RUN_DIR/staging-columns.tsv"

comm -23 <(sort "$RUN_DIR/prod-columns.tsv") <(sort "$RUN_DIR/staging-columns.tsv") > "$RUN_DIR/only-in-prod-columns.tsv"
comm -13 <(sort "$RUN_DIR/prod-columns.tsv") <(sort "$RUN_DIR/staging-columns.tsv") > "$RUN_DIR/only-in-staging-columns.tsv"

capture_fingerprint "prod" "$RUN_DIR/prod-fingerprint-before.tsv"
capture_fingerprint "staging" "$RUN_DIR/staging-fingerprint-before.tsv"

mapfile -t TABLES < "$RUN_DIR/prod-tables.txt"

printf "table\tprod_rows_before\tstaging_rows_before\n" > "$RUN_DIR/row-counts-before.tsv"
for table in "${TABLES[@]}"; do
    prod_count="$(prod_psql -At -c "select count(*) from public.\"$table\";")"
    staging_count="$(staging_psql -At -c "select count(*) from public.\"$table\";")"
    printf "%s\t%s\t%s\n" "$table" "$prod_count" "$staging_count" >> "$RUN_DIR/row-counts-before.tsv"
done

python3 - "$RUN_DIR" <<'PY'
import sys
from pathlib import Path

run_dir = Path(sys.argv[1])
prod_cols = {}
staging_cols = {}

for name, target in [("prod-columns.tsv", prod_cols), ("staging-columns.tsv", staging_cols)]:
    for line in (run_dir / name).read_text().splitlines():
        table, col = line.split("\t")
        target.setdefault(table, []).append(col)

shared_path = run_dir / "shared-columns.tsv"
with shared_path.open("w") as out:
    for table in sorted(prod_cols):
        shared = [col for col in prod_cols[table] if col in set(staging_cols.get(table, []))]
        quoted = ",".join(f'"{col}"' for col in shared)
        out.write(f"{table}\t{quoted}\t{quoted}\n")
PY

if [[ "$MODE" == "dry-run" ]]; then
    echo "Dry run complete. Review artifacts in $RUN_DIR"
    exit 0
fi

TRUNCATE_SQL="$RUN_DIR/truncate.sql"
{
    printf "TRUNCATE TABLE\n"
    for ((i = 0; i < ${#TABLES[@]}; i++)); do
        suffix=","
        if [[ $i -eq $((${#TABLES[@]} - 1)) ]]; then
            suffix=" RESTART IDENTITY CASCADE;"
        fi
        printf "    public.\"%s\"%s\n" "${TABLES[$i]}" "$suffix"
    done
} > "$TRUNCATE_SQL"

FK_METADATA_SQL="
select tc.table_name, tc.constraint_name, tc.is_deferrable, tc.initially_deferred
from information_schema.table_constraints tc
where tc.table_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
order by tc.table_name, tc.constraint_name;
"

staging_psql -At -F $'\t' -c "$FK_METADATA_SQL" > "$RUN_DIR/fk-metadata.tsv"

MAKE_DEFERRABLE_SQL="$RUN_DIR/make-fks-deferrable.sql"
RESTORE_DEFERRABILITY_SQL="$RUN_DIR/restore-fk-deferrability.sql"

python3 - "$RUN_DIR/fk-metadata.tsv" "$MAKE_DEFERRABLE_SQL" "$RESTORE_DEFERRABILITY_SQL" <<'PY'
import sys
from pathlib import Path

metadata_path = Path(sys.argv[1])
make_path = Path(sys.argv[2])
restore_path = Path(sys.argv[3])

make_lines = []
restore_lines = []

for line in metadata_path.read_text().splitlines():
    table_name, constraint_name, is_deferrable, initially_deferred = line.split("\t")
    make_lines.append(
        f'ALTER TABLE public."{table_name}" ALTER CONSTRAINT "{constraint_name}" DEFERRABLE INITIALLY DEFERRED;'
    )

    if is_deferrable == "YES":
        timing = "INITIALLY DEFERRED" if initially_deferred == "YES" else "INITIALLY IMMEDIATE"
        restore_lines.append(
            f'ALTER TABLE public."{table_name}" ALTER CONSTRAINT "{constraint_name}" DEFERRABLE {timing};'
        )
    else:
        restore_lines.append(
            f'ALTER TABLE public."{table_name}" ALTER CONSTRAINT "{constraint_name}" NOT DEFERRABLE;'
        )

make_path.write_text("\n".join(make_lines) + "\n")
restore_path.write_text("\n".join(restore_lines) + "\n")
PY

restore_fk_deferrability() {
    if [[ -f "$RESTORE_DEFERRABILITY_SQL" ]]; then
        staging_psql -f "$RESTORE_DEFERRABILITY_SQL" >/dev/null
    fi
}

trap restore_fk_deferrability EXIT

staging_psql -f "$MAKE_DEFERRABLE_SQL" >/dev/null

IMPORT_SQL="$RUN_DIR/import-staging.sql"
{
    printf "BEGIN;\n"
    printf "SET CONSTRAINTS ALL DEFERRED;\n"
    cat "$TRUNCATE_SQL"
    while IFS=$'\t' read -r table select_columns copy_columns; do
        if [[ -z "$table" || -z "$select_columns" || -z "$copy_columns" ]]; then
            continue
        fi

        csv_path="$DATA_DIR/$table.csv"
        prod_psql -q -c "\\copy (select $select_columns from public.\"$table\") to '$csv_path' with (format csv, header false, null '\\N')" >/dev/null
        printf "\\copy public.\"%s\" (%s) from '%s' with (format csv, header false, null '\\\\N')\n" "$table" "$copy_columns" "$csv_path"
    done < "$RUN_DIR/shared-columns.tsv"

    cat <<'SQL'
DO $$
DECLARE
    rec record;
    seq_name text;
BEGIN
    FOR rec IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_default LIKE 'nextval(%'
    LOOP
        seq_name := pg_get_serial_sequence(format('public.%I', rec.table_name), rec.column_name);
        IF seq_name IS NOT NULL THEN
            EXECUTE format(
                'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM public.%I), 1), true)',
                seq_name,
                rec.column_name,
                rec.table_name
            );
        END IF;
    END LOOP;
END $$;
COMMIT;
SQL
} > "$IMPORT_SQL"

staging_psql -f "$IMPORT_SQL" >/dev/null
restore_fk_deferrability
trap - EXIT

# ----------------------------------------------------------------------------
# Staging rewrites: sanitize emails and platform settings so staging is safe
# to operate without leaking into prod channels.
#
# - Users: append "-staging" before @ (excluding well-known seed accounts).
# - Companies: same treatment on contact_email.
# - Platform from_email: inject "staging." into the domain so outbound mail
#   obviously comes from a staging environment.
#
# All transforms are idempotent: re-running them on an already-rewritten
# database is a no-op. Exclusions are hardcoded below — edit if seed accounts
# change.
# ----------------------------------------------------------------------------
STAGING_REWRITES_SQL="$RUN_DIR/staging-rewrites.sql"
cat > "$STAGING_REWRITES_SQL" <<'SQL'
BEGIN;

-- Report state before rewrites
\echo '--- BEFORE staging rewrites ---'
select 'users_total' as label, count(*) from public.users;
select 'users_with_staging_suffix' as label, count(*) from public.users where email like '%-staging@%';
select 'companies_with_staging_suffix' as label, count(*) from public.companies where contact_email like '%-staging@%';

-- 1) User emails -> append "-staging" before @, except seed/test accounts.
--    Idempotent: already-staging emails are skipped.
update public.users
set email = regexp_replace(email, '^([^@]+)@(.+)$', '\1-staging@\2')
where email is not null
  and email not like '%-staging@%'
  and email not in (
      'admin@test.com',
      'sarah.admin@platform.com',
      'logistics@test.com',
      'ahmed.logistics@a2logistics.com',
      'client@pernod-ricard.com',
      'client@diageo.com'
  );

-- 2) Company contact_email -> same -staging suffix. No exclusions.
update public.companies
set contact_email = regexp_replace(contact_email, '^([^@]+)@(.+)$', '\1-staging@\2')
where contact_email is not null
  and contact_email not like '%-staging@%';

-- 3) Platform config.from_email -> inject "staging." into domain.
--    e.g. no-reply@kadence.ae -> no-reply@staging.kadence.ae
--    Idempotent: domains already starting with "staging." are skipped.
update public.platforms
set config = jsonb_set(
    config,
    '{from_email}',
    to_jsonb(regexp_replace(config->>'from_email', '^([^@]+)@(.+)$', '\1@staging.\2'))
)
where config is not null
  and config ? 'from_email'
  and config->>'from_email' is not null
  and (config->>'from_email') !~ '@staging\.';

-- Report state after rewrites
\echo '--- AFTER staging rewrites ---'
select 'users_with_staging_suffix' as label, count(*) from public.users where email like '%-staging@%';
select 'companies_with_staging_suffix' as label, count(*) from public.companies where contact_email like '%-staging@%';
select 'platforms_from_email' as label, id::text as platform_id, config->>'from_email' as from_email from public.platforms where config ? 'from_email';

COMMIT;
SQL

echo "Applying staging rewrites from $STAGING_REWRITES_SQL"
staging_psql -f "$STAGING_REWRITES_SQL" | tee "$RUN_DIR/staging-rewrites.log"

capture_fingerprint "staging" "$RUN_DIR/staging-fingerprint-after.tsv"

printf "table\tprod_rows_after_source\tstaging_rows_after_refresh\n" > "$RUN_DIR/row-counts-after.tsv"
while IFS= read -r table; do
    prod_count="$(prod_psql -At -c "select count(*) from public.\"$table\";")"
    staging_count="$(staging_psql -At -c "select count(*) from public.\"$table\";")"
    printf "%s\t%s\t%s\n" "$table" "$prod_count" "$staging_count" >> "$RUN_DIR/row-counts-after.tsv"
done < "$RUN_DIR/prod-tables.txt"

echo "Staging refresh complete. Review artifacts in $RUN_DIR"
