#!/usr/bin/env bash
set -euo pipefail
# ============================================================================
# sanitize-staging.sh
#
# Idempotent outbound-safety sanitize for the staging database. Run as the
# final step of a prod->staging refresh (and re-run after the demo seed), or
# standalone any time you suspect prod contact data leaked into staging.
#
# WHY: a prod->staging refresh copies REAL prod rows into staging. Staging runs
# a live notification worker + real Resend key, so any prod email address that
# survives into an outbound path can send real mail to real customers. This
# script neutralises every such path.
#
# WHAT IT DOES (all idempotent — re-running is a no-op):
#   0. NEUTRALISE THE QUEUE (time-critical, runs first): flip any pending
#      notification_logs (QUEUED / PROCESSING / RETRYING) to SKIPPED so the live
#      staging worker never sends prod's in-flight mail.
#   1. Rewrite every email-bearing / outbound-contact column to "<local>-staging@<domain>"
#      (bogus mailbox at the real domain → bounces instead of reaching a person).
#   2. Inject "staging." into the platform sender/support mail domains.
#
# COLUMN AUDIT (kept in sync with src/db/schema.ts — see the refresh report):
#   users.email                         rewrite  (seed accounts excluded)
#   companies.contact_email             rewrite
#   orders.contact_email                rewrite  (execution contact)
#   orders.venue_contact_email          rewrite  (on-site coordinator)
#   self_pickups.collector_email        rewrite
#   notification_rules.recipient_value  rewrite  (only recipient_type='EMAIL')
#   notification_logs.recipient_email   rewrite  + queue neutralised in step 0
#   notification_logs.recipient_value   rewrite  (only recipient_type='EMAIL')
#   email_suppressions.email            rewrite  (keeps unsubscribes matching)
#   otp.email                           rewrite  (ephemeral; kept for consistency)
#   platforms.config->>'from_email'     domain -> staging.<domain>
#   platforms.config->>'support_email'  domain -> staging.<domain>
#
#   Deliberately NOT touched (documented in the refresh report):
#   *.contact_phone / collector_phone / venue_contact_phone  — no SMS/telephony
#       egress in the platform; display-only PII; kept for data fidelity.
#   platforms.domain / companies.domain / company_domains.hostname — routing
#       identity, not an outbound contact.
#   *_pdf_url / file_url / logo_url — S3 object URLs, not mail targets.
#   Client-portal Better Auth tables — the client portal uses a client-side
#       Better Auth pointed at this API (no server-side adapter / separate auth
#       DB in this database); the API's users + otp tables are the real store.
#
# SAFETY: APP_ENV=staging hard-gate + the shared fifth guard (write target must
# not be prod) before any write. Never connects to prod.
#
# Usage:
#   APP_ENV=staging bash scripts/dbops/sanitize-staging.sh [apply|dry-run]
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${DBOPS_ENV_FILE:-$API_ROOT/.env.dbops}"

# shellcheck source=scripts/dbops/lib-dbops-guard.sh
source "$SCRIPT_DIR/lib-dbops-guard.sh"

if [[ "${APP_ENV:-}" != "staging" ]]; then
    echo "ERROR: sanitize-staging.sh requires APP_ENV=staging (got: \"${APP_ENV:-<unset>}\")" >&2
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
fi

MODE="${1:-apply}"
if [[ "$MODE" != "apply" && "$MODE" != "dry-run" ]]; then
    echo "Usage: $0 [apply|dry-run]" >&2
    exit 1
fi

# Source WITHOUT `set -a` — vars stay shell-local and are NOT exported into any
# child process. PROD_DATABASE_URL is only ever read as a STRING here (for the
# anti-prod parse guard); this write-capable step never connects to prod.
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is required}"
PROD_DATABASE_URL="${PROD_DATABASE_URL:-}"

PSQL_BIN="$(dbops_resolve_psql)"
dbops_add_pg_lib_path "$PSQL_BIN" # subshell export above is lost; set it here too

staging_psql() {
    "$PSQL_BIN" "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off "$@"
}

echo "=== Fifth guard: confirm write target is staging, not prod ==="
if [[ -n "$PROD_DATABASE_URL" ]]; then
    dbops_assert_write_target_safe "$STAGING_DATABASE_URL" "$PROD_DATABASE_URL" 0
else
    echo "  [guard] PROD_DATABASE_URL not set — running write-target reachability check only." >&2
    dbops_live_fingerprint "$STAGING_DATABASE_URL" >/dev/null || {
        echo "ERROR: [guard] write target unreachable. Refusing." >&2
        exit 1
    }
fi

REPORT_SQL="$(cat <<'SQL'
select 'users.email'                       as col, count(*) as would_rewrite from public.users              where email is not null and email like '%@%' and email not like '%-staging@%'
union all select 'companies.contact_email',            count(*) from public.companies            where contact_email is not null and contact_email like '%@%' and contact_email not like '%-staging@%'
union all select 'orders.contact_email',               count(*) from public.orders               where contact_email is not null and contact_email like '%@%' and contact_email not like '%-staging@%'
union all select 'orders.venue_contact_email',         count(*) from public.orders               where venue_contact_email is not null and venue_contact_email like '%@%' and venue_contact_email not like '%-staging@%'
union all select 'self_pickups.collector_email',       count(*) from public.self_pickups         where collector_email is not null and collector_email like '%@%' and collector_email not like '%-staging@%'
union all select 'notification_rules.recipient_value', count(*) from public.notification_rules   where recipient_type = 'EMAIL' and recipient_value like '%@%' and recipient_value not like '%-staging@%'
union all select 'notification_logs.recipient_email',  count(*) from public.notification_logs    where recipient_email is not null and recipient_email like '%@%' and recipient_email not like '%-staging@%'
union all select 'email_suppressions.email',           count(*) from public.email_suppressions   where email like '%@%' and email not like '%-staging@%'
union all select 'otp.email',                          count(*) from public.otp                  where email like '%@%' and email not like '%-staging@%'
union all select 'notification_logs pending queue',    count(*) from public.notification_logs    where status in ('QUEUED','PROCESSING','RETRYING')
union all select 'platforms non-staging from/support', count(*) from public.platforms            where config ? 'from_email' and (config->>'from_email') ~ '@' and (config->>'from_email') !~ '@staging\.'
order by 1;
SQL
)"

if [[ "$MODE" == "dry-run" ]]; then
    echo ""
    echo "=== [dry-run] sanitize plan — rows that WOULD be rewritten (no writes) ==="
    staging_psql -c "$REPORT_SQL"
    echo ""
    echo "[dry-run] No writes performed."
    exit 0
fi

SANITIZE_SQL="$(cat <<'SQL'
BEGIN;

\echo --- BEFORE sanitize ---
select 'users_with_staging_suffix'  as label, count(*) from public.users     where email like '%-staging@%';
select 'pending_notification_logs'  as label, count(*) from public.notification_logs where status in ('QUEUED','PROCESSING','RETRYING');

-- 0) TIME-CRITICAL: neutralise the outbound queue so the live staging worker
--    never sends prod's in-flight mail. Runs first, before any rewrite.
update public.notification_logs
set status = 'SKIPPED',
    next_attempt_at = null,
    error_message = coalesce(error_message, '') || ' [staging-sanitized: queue neutralised]'
where status in ('QUEUED','PROCESSING','RETRYING');

-- 1) User emails -> "<local>-staging@<domain>", except seed/test accounts.
update public.users
set email = regexp_replace(email, '^([^@]+)@(.+)$', '\1-staging@\2')
where email is not null
  and email like '%@%'
  and email not like '%-staging@%'
  and email not in (
      'admin@test.com',
      'sarah.admin@platform.com',
      'logistics@test.com',
      'ahmed.logistics@a2logistics.com',
      'client@pernod-ricard.com',
      'client@diageo.com',
      'system@kadence.ae'
  );

-- 2) Company contact email.
update public.companies
set contact_email = regexp_replace(contact_email, '^([^@]+)@(.+)$', '\1-staging@\2')
where contact_email is not null and contact_email like '%@%' and contact_email not like '%-staging@%';

-- 3) Order execution contact + venue contact emails.
update public.orders
set contact_email = regexp_replace(contact_email, '^([^@]+)@(.+)$', '\1-staging@\2')
where contact_email is not null and contact_email like '%@%' and contact_email not like '%-staging@%';

update public.orders
set venue_contact_email = regexp_replace(venue_contact_email, '^([^@]+)@(.+)$', '\1-staging@\2')
where venue_contact_email is not null and venue_contact_email like '%@%' and venue_contact_email not like '%-staging@%';

-- 4) Self-pickup collector email.
update public.self_pickups
set collector_email = regexp_replace(collector_email, '^([^@]+)@(.+)$', '\1-staging@\2')
where collector_email is not null and collector_email like '%@%' and collector_email not like '%-staging@%';

-- 5) Direct-email notification RULE targets (recipient_type='EMAIL' only; ROLE /
--    ENTITY_OWNER rows carry a role name in recipient_value — never touch those).
update public.notification_rules
set recipient_value = regexp_replace(recipient_value, '^([^@]+)@(.+)$', '\1-staging@\2')
where recipient_type = 'EMAIL'
  and recipient_value is not null and recipient_value like '%@%' and recipient_value not like '%-staging@%';

-- 6) Notification LOG history — defence in depth (queue already neutralised in
--    step 0; this keeps the address bogus if a row is ever re-queued + scrubs PII).
update public.notification_logs
set recipient_email = regexp_replace(recipient_email, '^([^@]+)@(.+)$', '\1-staging@\2')
where recipient_email is not null and recipient_email like '%@%' and recipient_email not like '%-staging@%';

update public.notification_logs
set recipient_value = regexp_replace(recipient_value, '^([^@]+)@(.+)$', '\1-staging@\2')
where recipient_type = 'EMAIL'
  and recipient_value is not null and recipient_value like '%@%' and recipient_value not like '%-staging@%';

-- 7) Unsubscribe suppression list — rewrite so an unsubscribe still matches its
--    now-rewritten user (an unsubscribe left un-rewritten would silently stop
--    suppressing that user on staging).
update public.email_suppressions
set email = regexp_replace(email, '^([^@]+)@(.+)$', '\1-staging@\2')
where email like '%@%' and email not like '%-staging@%';

-- 8) OTP rows are ephemeral (short expiry); rewrite for consistency + PII.
update public.otp
set email = regexp_replace(email, '^([^@]+)@(.+)$', '\1-staging@\2')
where email like '%@%' and email not like '%-staging@%';

-- 9) Platform sender + support mail domains -> staging.<domain>.
update public.platforms
set config = jsonb_set(config, '{from_email}',
    to_jsonb(regexp_replace(config->>'from_email', '^([^@]+)@(.+)$', '\1@staging.\2')))
where config is not null and config ? 'from_email'
  and config->>'from_email' is not null and (config->>'from_email') ~ '@' and (config->>'from_email') !~ '@staging\.';

update public.platforms
set config = jsonb_set(config, '{support_email}',
    to_jsonb(regexp_replace(config->>'support_email', '^([^@]+)@(.+)$', '\1@staging.\2')))
where config is not null and config ? 'support_email'
  and config->>'support_email' is not null and (config->>'support_email') ~ '@' and (config->>'support_email') !~ '@staging\.';

\echo --- AFTER sanitize ---
select 'users_with_staging_suffix'  as label, count(*) from public.users     where email like '%-staging@%';
select 'pending_notification_logs'  as label, count(*) from public.notification_logs where status in ('QUEUED','PROCESSING','RETRYING');
select 'platforms_from_email' as label, id::text as platform_id, config->>'from_email' as from_email, config->>'support_email' as support_email from public.platforms where config ? 'from_email';

COMMIT;
SQL
)"

echo ""
echo "=== Applying staging sanitize ==="
staging_psql -f <(printf '%s' "$SANITIZE_SQL")
echo "Staging sanitize complete."
