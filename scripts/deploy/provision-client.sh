#!/usr/bin/env bash
#
# provision-client.sh — Provision a NEW Kadence client-tenant AWS Amplify app
# by cloning configuration from a live reference tenant (default: client-redbull).
#
# Replicates the redbull / pernod / bacardi tenants: one Amplify WEB_COMPUTE app per
# client, all from the SAME repo https://bitbucket.org/homeofpmg/kadence-client, branch
# main, + a per-tenant custom subdomain on kadence.ae and per-tenant env vars. Branding,
# company name, and host->platform/company resolution are DB/API-driven, NOT per-build.
#
# SAFETY:
#   * DRY-RUN IS THE DEFAULT. No AWS state is mutated unless --apply is passed.
#     In dry-run, every mutating call is printed verbatim (with the Bitbucket token redacted).
#   * AWS reads are used to clone config from the reference app at run time; nothing
#     un-readable is hardcoded.
#   * The DB section is READ-ONLY verification only; any INSERT is flagged as a separate,
#     human-guarded step (production = no ad-hoc SQL mutation from a provisioning script).
#   * Secrets (Bitbucket token) are never printed.
#
# Account 609230521830 ("Kadence platform"), profile kadence, region ap-south-1.
#
# The on-disk principal (user kadence-api-staging) CANNOT run --apply: it lacks
# amplify:CreateApp/CreateBranch/CreateDomainAssociation/GetApp + iam:PassRole. Attach
# amplify-provisioner-iam-policy.json (this folder) to the run profile first. See PROVISION-PLAN.md.

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
COMPANY=""                 # slug, e.g. penfolds  (used for the app name + subdomain prefix default)
DISPLAY=""                 # human name, e.g. "Penfolds" (informational; branding lives in DB)
SUBDOMAIN=""               # full host, e.g. penfolds.kadence.ae (defaults to <company>.kadence.ae)
TEMPLATE="client-redbull"  # reference app to clone from (name substring or appId)
TEMPLATE_APP_ID_DEFAULT="d12ui6oezoziso"   # client-redbull
BRANCH="main"
REGION="ap-south-1"
PROFILE="kadence"
ROOT_DOMAIN="kadence.ae"
ZONE_ID="Z08196763MAPSYVZNMTWE"
REPO_URL="https://bitbucket.org/homeofpmg/kadence-client"
EXPECTED_ACCOUNT="609230521830"
IAM_SERVICE_ROLE_ARN=""    # override; otherwise cloned from template get-app
APPLY=0                    # 0 = dry-run (default), 1 = mutate
INCLUDE_WWW=0              # also map www.<subdomain> if set
ACCEPT_MINIMAL_ENV=0       # 1 = proceed even if template get-app couldn't be read (UNSAFE: degraded env clone)
POLL_INTERVAL="${POLL_INTERVAL:-15}"   # seconds between build/domain status polls (real wait, not a sub-second probe)

# --- Bitbucket credential (app passwords DEAD 2026-06-09; Amplify oauthToken hard-capped at 1000 chars) ---
# WORKING PATH (verified): a GRANDFATHERED Bitbucket OAuth consumer (created before Atlassian's JWT switch)
# mints a short ~92-char opaque token via client_credentials that Amplify accepts. NEW consumers mint >1000
# JWTs (rejected, 2 data points), and Repository/Workspace ACCESS TOKENs (ATCTT) were REJECTED by Amplify
# ("This API is not accessible by this authentication mechanism"). So --bb-oauth-consumer-secret pointed at a
# GRANDFATHERED consumer is the only way — default below reads the Kadence-owned secret holding one.
BB_OAUTH_CONSUMER_SECRET="kadence/bitbucket-consumer"  # DEFAULT. SM id of {"key","secret"} for a GRANDFATHERED
                             # consumer -> client_credentials mint (~92 chars). The >1000 guard rejects JWT consumers.
BB_TOKEN_SECRET=""           # SM id of a RAW oauthToken (e.g. ATCTT). NOTE: Amplify REJECTED ATCTT in testing;
                             # kept only as an escape hatch if AWS/Atlassian behavior changes.
OAUTH_TOKEN=""               # resolved at --apply time by acquire_oauth_token()

# Env keys we KNOW how to clone safely. Anything else on the template is surfaced for operator review.
# VERIFIED against the live redbull template (get-app, 2026-06-30): app-level env is ONLY NEXT_PUBLIC_API_URL.
# Server-side S3 access comes from the SSR service role (iamServiceRoleArn), NOT static AWS_* env vars.
REQUIRED_APP_ENV_KEYS=( NEXT_PUBLIC_API_URL )
KNOWN_APP_ENV_KEYS=( NEXT_PUBLIC_API_URL NEXT_PUBLIC_BASE_URL NEXT_PUBLIC_DEV_HOST_OVERRIDE AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_S3_BUCKET )

# BITBUCKET_TOKEN (env) is a manual OVERRIDE: a raw oauthToken passed directly for a one-off run (never a
# flag — keeps it out of shell history/ps). Prefer --bb-oauth-consumer-secret so nobody handles a per-run token.

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
c_reset=$'\033[0m'; c_bold=$'\033[1m'; c_dim=$'\033[2m'
c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'
log()   { printf '%s[*]%s %s\n' "$c_blue"  "$c_reset" "$*"; }
ok()    { printf '%s[+]%s %s\n' "$c_green" "$c_reset" "$*"; }
warn()  { printf '%s[!]%s %s\n' "$c_yellow" "$c_reset" "$*" >&2; }
err()   { printf '%s[x]%s %s\n' "$c_red"   "$c_reset" "$*" >&2; }
step()  { printf '\n%s== %s ==%s\n' "$c_bold" "$*" "$c_reset"; }
die()   { err "$*"; exit 1; }

# Redact any Bitbucket secret (env override, the minted/loaded oauthToken) from printed commands.
redact() {
  local s; s="$(cat)"
  [[ -n "${BITBUCKET_TOKEN:-}" ]] && s="${s//"$BITBUCKET_TOKEN"/<BITBUCKET_TOKEN>}"
  [[ -n "${OAUTH_TOKEN:-}" ]]     && s="${s//"$OAUTH_TOKEN"/<OAUTH_TOKEN>}"
  printf '%s' "$s"
}

# Run-or-print an AWS mutating command. In dry-run, print exactly what WOULD run.
# Usage: guarded "human description" aws amplify create-app ...
guarded() {
  local desc="$1"; shift
  if [[ "$APPLY" -eq 1 ]]; then
    log "APPLY: $desc"
    printf '   %s$%s ' "$c_dim" "$c_reset"; printf '%q ' "$@" | redact; printf '\n'
    "$@"
  else
    warn "DRY-RUN (would run): $desc"
    printf '   %s$%s ' "$c_dim" "$c_reset"; printf '%q ' "$@" | redact; printf '\n'
    return 0
  fi
}

aws_ro() { aws --profile "$PROFILE" --region "$REGION" --output json "$@"; }

# Resolve a Bitbucket oauthToken WITHOUT the operator handling a secret per run. Order: env override ->
# OAuth consumer in Secrets Manager (client_credentials, short-lived) -> raw token in Secrets Manager.
# Bitbucket APP PASSWORDS are gone (Atlassian disabled them 2026-06-09). An OAuth consumer (OAuth 2.0) is
# the supported, non-deprecated path and is what AWS's own Amplify+Bitbucket guidance uses. Amplify uses the
# token ONCE to install a read-only SSH deploy key + push webhook; it does not store it, so ~2h is plenty.
acquire_oauth_token() {
  if [[ -n "${BITBUCKET_TOKEN:-}" ]]; then
    OAUTH_TOKEN="$BITBUCKET_TOKEN"; ok "Bitbucket cred: BITBUCKET_TOKEN env (manual override)."; return
  fi
  if [[ -n "$BB_OAUTH_CONSUMER_SECRET" ]]; then
    command -v curl >/dev/null || die "curl required to mint the Bitbucket OAuth token."
    log "Reading Bitbucket OAuth consumer key/secret from Secrets Manager '$BB_OAUTH_CONSUMER_SECRET' ..."
    local sec ckey csec
    sec="$(aws_ro secretsmanager get-secret-value --secret-id "$BB_OAUTH_CONSUMER_SECRET" --query SecretString --output text)" \
      || die "get-secret-value failed for '$BB_OAUTH_CONSUMER_SECRET' (need secretsmanager:GetSecretValue on that ARN; secret must live in $REGION)."
    ckey="$(jq -r '.key // .client_id // .CONSUMER_KEY // empty' <<<"$sec")"
    csec="$(jq -r '.secret // .client_secret // .CONSUMER_SECRET // empty' <<<"$sec")"
    [[ -n "$ckey" && -n "$csec" ]] || die "Secret '$BB_OAUTH_CONSUMER_SECRET' must be JSON like {\"key\":\"...\",\"secret\":\"...\"}."
    log "Minting a short-lived Bitbucket OAuth token (client_credentials grant) ..."
    OAUTH_TOKEN="$(curl -fsS -X POST -u "$ckey:$csec" https://bitbucket.org/site/oauth2/access_token -d grant_type=client_credentials | jq -r '.access_token // empty')" \
      || die "Bitbucket client_credentials request failed — check the consumer key/secret and that the consumer has Repositories + Webhooks scopes."
    [[ -n "$OAUTH_TOKEN" ]] || die "Bitbucket returned no access_token (consumer misconfigured?)."
    ok "Minted a short-lived (~2h) Bitbucket OAuth token — never written to disk."; return
  fi
  if [[ -n "$BB_TOKEN_SECRET" ]]; then
    log "Reading a raw Bitbucket access token from Secrets Manager '$BB_TOKEN_SECRET' ..."
    OAUTH_TOKEN="$(aws_ro secretsmanager get-secret-value --secret-id "$BB_TOKEN_SECRET" --query SecretString --output text)" \
      || die "get-secret-value failed for '$BB_TOKEN_SECRET'."
    [[ -n "$OAUTH_TOKEN" && "$OAUTH_TOKEN" != "None" ]] || die "Secret '$BB_TOKEN_SECRET' is empty."
    ok "Loaded a Bitbucket access token from Secrets Manager."; return
  fi
  die "No Bitbucket credential source. Set --bb-oauth-consumer-secret <id> (recommended), --bb-token-secret <id>, or BITBUCKET_TOKEN env."
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
${c_bold}provision-client.sh${c_reset} — provision a new Kadence client-tenant Amplify app
by cloning a live reference tenant.

${c_bold}USAGE${c_reset}
  BITBUCKET_TOKEN=<app-password> ./provision-client.sh --company penfolds [--apply]

${c_bold}OPTIONS${c_reset} (all have sane defaults; dry-run unless --apply)
  --company SLUG          Tenant slug, e.g. penfolds. App named kadence-client-<slug>. (required)
  --display "Name"        Human display name, e.g. "Penfolds". Informational only (branding is in DB).
  --subdomain HOST        Full custom host. Default: <company>.${ROOT_DOMAIN}
                          NOTE: fleet labels are NOT uniform (pernod -> pernod-ricard.kadence.ae);
                          pass --subdomain explicitly if the label differs from the slug.
  --template REF          Reference app to clone (name substring or appId). Default: ${TEMPLATE}
  --branch NAME           Production branch. Default: ${BRANCH}
  --iam-service-role-arn  Override the SSR service role ARN (else cloned from template get-app).
  --include-www           Also map www.<subdomain> to the branch.
  --region REGION         Default: ${REGION}
  --profile NAME          AWS profile. Default: ${PROFILE}
  --apply                 Actually mutate AWS. WITHOUT THIS, the script only prints what it would do.
  --i-accept-minimal-env  UNSAFE escape hatch: allow --apply to proceed even if the template get-app
                          could not be read (so the full env/customRules could NOT be cloned). Without
                          this flag, an unreadable template ABORTS --apply (a degraded clone would drop
                          server-side AWS_* creds and silently break S3 upload routes). Only use if you
                          are supplying a complete env another way (e.g. --iam-service-role-arn + a known
                          env). Default: refuse.
  --help                  This help.

${c_bold}BITBUCKET CREDENTIAL${c_reset} (pick ONE; needed only for --apply. App passwords are DEAD — Atlassian
disabled them 2026-06-09. Amplify uses the token ONCE to install a read-only SSH deploy key + push webhook,
then discards it; --access-token is GitHub-only and does NOT bind Bitbucket. Amplify caps oauthToken at 1000
chars — the script fails fast if the resolved token is longer.)
  --bb-oauth-consumer-secret ID  ${c_bold}RECOMMENDED + DEFAULT${c_reset} (default: kadence/bitbucket-consumer). SM secret-id
                   holding {"key","secret"} for a ${c_bold}GRANDFATHERED${c_reset} Bitbucket OAuth consumer (created before
                   Atlassian's JWT switch). Mints a short ~92-char opaque token via client_credentials that
                   Amplify accepts. ${c_bold}A NEWLY-created consumer mints a >1000-char JWT that Amplify REJECTS${c_reset}
                   (verified, 2 data points) — you MUST use a grandfathered one. The >1000 guard aborts JWTs.
  --bb-token-secret ID           SM secret-id whose PLAINTEXT is a raw oauthToken (e.g. a Bitbucket ACCESS TOKEN,
                   ATCTT...). ${c_bold}NOTE: Amplify REJECTED ATCTT tokens in testing${c_reset} ("not accessible by this auth
                   mechanism") — kept only as an escape hatch if that behavior changes.
  BITBUCKET_TOKEN  (env) Manual override: a raw oauthToken for a one-off run. Never printed.
${c_bold}ENV${c_reset}
  POLL_INTERVAL    Seconds between build/domain status polls (default 15). The poll loops wait this long
                   per iteration (build ~20 min, domain ~15 min budget).

${c_bold}WHAT IT DOES${c_reset}
  preflight (sts + perms + template + zone) -> idempotency check -> clone config from reference
  -> create-app (WEB_COMPUTE, repo+token, env vars, custom rules, SSR role) -> create-branch
  -> create-domain-association (Amplify-managed cert, same-account auto-DNS) -> start RELEASE
  -> poll build + domain -> print URL + DB-resolution checklist.

${c_bold}PREREQS${c_reset}
  * Run profile must carry amplify-provisioner-iam-policy.json (CreateApp/Branch/DomainAssociation,
    GetApp, iam:PassRole on the Amplify SSR service role). The default kadence-api-staging principal
    CANNOT. NOTE: amplify:GetApp is MANDATORY for --apply — it is how the template's full env
    (incl. server-side AWS_* creds) + customRules + SSR role ARN are cloned. Running --apply under a
    principal that lacks GetApp ABORTS (override only with --i-accept-minimal-env, which is unsafe).
  * A Bitbucket credential source (see BITBUCKET CREDENTIAL above): --bb-oauth-consumer-secret (recommended)
    needs a one-time OAuth consumer in the homeofpmg workspace + its key/secret in Secrets Manager, and the
    provisioner principal needs secretsmanager:GetSecretValue on that secret ARN.
  See PROVISION-PLAN.md for the full prerequisite + gap list.
EOF
}

# ---------------------------------------------------------------------------
# Arg parse
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --company)             COMPANY="${2:?}"; shift 2;;
    --display)             DISPLAY="${2:?}"; shift 2;;
    --subdomain)           SUBDOMAIN="${2:?}"; shift 2;;
    --template)            TEMPLATE="${2:?}"; shift 2;;
    --branch)              BRANCH="${2:?}"; shift 2;;
    --iam-service-role-arn) IAM_SERVICE_ROLE_ARN="${2:?}"; shift 2;;
    --bb-oauth-consumer-secret) BB_OAUTH_CONSUMER_SECRET="${2:?}"; shift 2;;
    --bb-token-secret)     BB_TOKEN_SECRET="${2:?}"; shift 2;;
    --include-www)         INCLUDE_WWW=1; shift;;
    --region)              REGION="${2:?}"; shift 2;;
    --profile)             PROFILE="${2:?}"; shift 2;;
    --apply)               APPLY=1; shift;;
    --i-accept-minimal-env) ACCEPT_MINIMAL_ENV=1; shift;;
    -h|--help)             usage; exit 0;;
    *) die "Unknown arg: $1 (use --help)";;
  esac
done

command -v aws >/dev/null || die "aws CLI not found."
command -v jq  >/dev/null || die "jq not found."

[[ -n "$COMPANY" ]] || { usage; die "--company is required."; }
[[ "$COMPANY" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "--company must be a lowercase slug [a-z0-9-]."
[[ -z "$DISPLAY" ]] && DISPLAY="$(tr '[:lower:]' '[:upper:]' <<<"${COMPANY:0:1}")${COMPANY:1}"
[[ -z "$SUBDOMAIN" ]] && SUBDOMAIN="${COMPANY}.${ROOT_DOMAIN}"
SUBDOMAIN="$(tr '[:upper:]' '[:lower:]' <<<"$SUBDOMAIN")"
APP_NAME="kadence-client-${COMPANY}"

# Subdomain must be a label under ROOT_DOMAIN; derive the prefix for Amplify's subDomainSetting.
[[ "$SUBDOMAIN" == *".${ROOT_DOMAIN}" ]] || die "--subdomain '$SUBDOMAIN' must end in .${ROOT_DOMAIN}"
SUBDOMAIN_PREFIX="${SUBDOMAIN%.${ROOT_DOMAIN}}"
[[ "$SUBDOMAIN_PREFIX" != "$SUBDOMAIN" && -n "$SUBDOMAIN_PREFIX" ]] || die "Could not derive subdomain prefix from '$SUBDOMAIN'."
BASE_URL="https://${SUBDOMAIN}"

step "Configuration"
cat <<EOF
  company / app name : ${COMPANY}  ->  ${APP_NAME}
  display name       : ${DISPLAY}
  prod domain        : ${SUBDOMAIN}          (root -> main)
  staging domain     : staging.${SUBDOMAIN}  (root -> staging)
  template (clone)   : ${TEMPLATE}
  branches           : main + staging
  region / profile   : ${REGION} / ${PROFILE}
  repo               : ${REPO_URL}
  mode               : $([[ $APPLY -eq 1 ]] && echo 'APPLY (will mutate AWS)' || echo 'DRY-RUN (no mutation)')
EOF

# ===========================================================================
step "1. Preflight"
# ===========================================================================

log "sts get-caller-identity ..."
CALLER="$(aws_ro sts get-caller-identity)" || die "STS failed — check the '$PROFILE' profile."
ACCT="$(jq -r '.Account' <<<"$CALLER")"
ARN="$(jq -r '.Arn' <<<"$CALLER")"
echo "    account: $ACCT"
echo "    arn    : $ARN"
[[ "$ACCT" == "$EXPECTED_ACCOUNT" ]] || die "Wrong account $ACCT (expected $EXPECTED_ACCOUNT). Use --profile kadence."
if [[ "$ARN" == *"user/kadence-api-staging"* && "$APPLY" -eq 1 ]]; then
  warn "Caller is kadence-api-staging — this principal is DENIED CreateApp/CreateBranch/CreateDomainAssociation/GetApp/PassRole."
  warn "Attach amplify-provisioner-iam-policy.json (or assume a provisioner role) before --apply. Continuing; AWS will reject writes."
fi

log "Resolving template app '$TEMPLATE' ..."
APPS_JSON="$(aws_ro amplify list-apps --max-results 100 || die "amplify list-apps denied — need amplify:ListApps.")"
# Try by appId first, then by name substring (case-insensitive).
TEMPLATE_APP="$(jq -r --arg t "$TEMPLATE" '
  .apps[] | select(.appId==$t)' <<<"$APPS_JSON")"
if [[ -z "$TEMPLATE_APP" ]]; then
  TEMPLATE_APP="$(jq -r --arg t "$(tr '[:upper:]' '[:lower:]' <<<"$TEMPLATE")" '
    .apps[] | select((.name|ascii_downcase)|contains($t))' <<<"$APPS_JSON" | jq -s '.[0] // empty')"
fi
if [[ -z "$TEMPLATE_APP" || "$TEMPLATE_APP" == "null" ]]; then
  warn "Could not find template by '$TEMPLATE' in list-apps; falling back to default appId $TEMPLATE_APP_ID_DEFAULT."
  TEMPLATE_APP_ID="$TEMPLATE_APP_ID_DEFAULT"
else
  TEMPLATE_APP_ID="$(jq -r '.appId' <<<"$TEMPLATE_APP")"
fi
echo "    template appId: $TEMPLATE_APP_ID"

log "Reading full template config via get-app (needs amplify:GetApp) ..."
if TPL_FULL="$(aws_ro amplify get-app --app-id "$TEMPLATE_APP_ID" 2>/dev/null)"; then
  TPL=".app" ; TPL_APP="$(jq '.app' <<<"$TPL_FULL")"
  ok "Read template app config."
else
  TPL_APP=""
  if [[ "$APPLY" -eq 1 && "$ACCEPT_MINIMAL_ENV" -ne 1 ]]; then
    err "get-app on template '$TEMPLATE_APP_ID' DENIED or failed."
    err "Cannot faithfully clone the reference: env, customRules, and the SSR service role ARN"
    err "(iamServiceRoleArn — required for a WEB_COMPUTE create-app) are all unreadable."
    err "Without the SSR role ARN, create-app cannot stand up SSR compute correctly."
    die "Refusing --apply. Re-run under a principal that has amplify:GetApp (attach amplify-provisioner-iam-policy.json), or pass --i-accept-minimal-env to override (UNSAFE)."
  fi
  warn "get-app on template DENIED or failed. Cannot clone platform/env/customRules/role from the reference."
  if [[ "$APPLY" -eq 1 ]]; then
    warn "--i-accept-minimal-env set: proceeding with a MINIMAL env (NEXT_PUBLIC_* only). Server-side AWS_* will be MISSING — set them via update-app post-create or S3 routes will 500."
  else
    warn "DRY-RUN: showing minimal fallback config. The real clone requires amplify:GetApp at --apply time."
  fi
  warn "You MUST also pass --iam-service-role-arn (cannot read the template's SSR role)."
fi

# Pull values from the template (fall back to known fleet invariants if get-app was denied).
if [[ -n "$TPL_APP" ]]; then
  TPL_PLATFORM="$(jq -r '.platform // "WEB_COMPUTE"' <<<"$TPL_APP")"
  TPL_ROLE="$(jq -r '.iamServiceRoleArn // ""' <<<"$TPL_APP")"
  TPL_REPO="$(jq -r '.repository // ""' <<<"$TPL_APP")"
  TPL_ENV_JSON="$(jq -c '.environmentVariables // {}' <<<"$TPL_APP")"
  TPL_RULES_JSON="$(jq -c '.customRules // []' <<<"$TPL_APP")"
  TPL_BUILDSPEC="$(jq -r '.buildSpec // ""' <<<"$TPL_APP")"
  TPL_ENABLE_BRANCH_AUTOBUILD="$(jq -r '.enableBranchAutoBuild // false' <<<"$TPL_APP")"
else
  TPL_PLATFORM="WEB_COMPUTE"
  TPL_ROLE=""
  TPL_REPO="$REPO_URL"
  TPL_ENV_JSON='{"NEXT_PUBLIC_API_URL":"https://api.kadence.ae"}'   # known fleet invariant
  TPL_RULES_JSON='[]'                                               # WEB_COMPUTE auto-generates SSR routing; none needed
  TPL_BUILDSPEC=""                                                  # rely on in-repo amplify.yml
  TPL_ENABLE_BRANCH_AUTOBUILD="false"
fi

# Read the template's PRODUCTION branch env (issue: branch-level vars override app-level — must be
# cloned too, else a reference whose prod branch overrides e.g. NEXT_PUBLIC_API_URL silently drops it).
# For the verified redbull clone this is {} (all vars live at app level), so the merge is usually a no-op.
TPL_BRANCH_ENV_JSON="{}"
if [[ -n "$TPL_APP" ]]; then
  if TPL_BRANCH_FULL="$(aws_ro amplify get-branch --app-id "$TEMPLATE_APP_ID" --branch-name "$BRANCH" 2>/dev/null)"; then
    TPL_BRANCH_ENV_JSON="$(jq -c '.branch.environmentVariables // {}' <<<"$TPL_BRANCH_FULL")"
    if [[ "$TPL_BRANCH_ENV_JSON" != "{}" ]]; then
      warn "Template branch '$BRANCH' carries BRANCH-LEVEL env overrides — these will be cloned onto the new branch (with the same per-tenant transforms). Review the diff below."
    fi
  else
    warn "Could not read template branch '$BRANCH' env (get-branch denied/missing). Assuming no branch-level overrides; app-level inheritance only."
  fi
fi

[[ "$TPL_PLATFORM" == "WEB_COMPUTE" ]] || warn "Template platform is '$TPL_PLATFORM', expected WEB_COMPUTE. Forcing WEB_COMPUTE for the new app (SSR app: middleware + /api routes + server actions + S3)."
PLATFORM="WEB_COMPUTE"

# SSR service role: explicit override > template > error.
if [[ -n "$IAM_SERVICE_ROLE_ARN" ]]; then
  ROLE_ARN="$IAM_SERVICE_ROLE_ARN"
elif [[ -n "$TPL_ROLE" ]]; then
  ROLE_ARN="$TPL_ROLE"
else
  ROLE_ARN=""
  warn "No SSR service role resolved (template get-app denied and no --iam-service-role-arn)."
  warn "WEB_COMPUTE create-app needs iamServiceRoleArn for SSR log delivery. Provide --iam-service-role-arn."
fi

[[ -n "$TPL_REPO" && "$TPL_REPO" != "$REPO_URL" ]] && warn "Template repo '$TPL_REPO' != expected '$REPO_URL'. Using '$REPO_URL'."

log "Verifying Route53 zone $ZONE_ID ($ROOT_DOMAIN) [read-only] ..."
if ZONE_JSON="$(aws_ro route53 get-hosted-zone --id "$ZONE_ID" 2>/dev/null)"; then
  ZONE_NAME="$(jq -r '.HostedZone.Name' <<<"$ZONE_JSON")"
  ZONE_PRIVATE="$(jq -r '.HostedZone.Config.PrivateZone' <<<"$ZONE_JSON")"
  echo "    zone: $ZONE_NAME private=$ZONE_PRIVATE"
  [[ "$ZONE_NAME" == "${ROOT_DOMAIN}." ]] || warn "Zone name '$ZONE_NAME' != '${ROOT_DOMAIN}.'"
  [[ "$ZONE_PRIVATE" == "false" ]] || die "Zone is PRIVATE — Amplify-managed public DNS won't work."
  # Collision check: any existing record for the target subdomain?
  if aws_ro route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
        --query "ResourceRecordSets[?starts_with(Name, '${SUBDOMAIN}.')]" 2>/dev/null \
        | jq -e 'length>0' >/dev/null 2>&1; then
    warn "A DNS record for ${SUBDOMAIN} already exists in the zone — Amplify will reuse/contend. Inspect before --apply."
  else
    ok "No existing ${SUBDOMAIN} record — clean to provision."
  fi
else
  warn "route53 get-hosted-zone denied/failed (need route53:GetHostedZone). Skipping zone verification."
fi

# Bitbucket credential: decide the method now; only FETCH/mint under --apply (dry-run stays read-only).
if [[ -n "${BITBUCKET_TOKEN:-}" ]]; then BB_METHOD="BITBUCKET_TOKEN env (manual override)";
elif [[ -n "$BB_OAUTH_CONSUMER_SECRET" ]]; then BB_METHOD="OAuth consumer via Secrets Manager '$BB_OAUTH_CONSUMER_SECRET' (mints a ~2h token)";
elif [[ -n "$BB_TOKEN_SECRET" ]]; then BB_METHOD="raw access-token via Secrets Manager '$BB_TOKEN_SECRET'";
else BB_METHOD=""; fi
if [[ "$APPLY" -eq 1 ]]; then
  [[ -n "$BB_METHOD" ]] || die "--apply needs a Bitbucket credential source: --bb-token-secret <id> (RECOMMENDED — a Bitbucket Repository/Workspace ACCESS TOKEN, ATCTT...), --bb-oauth-consumer-secret <id>, or BITBUCKET_TOKEN env. (App passwords were disabled 2026-06-09.)"
  acquire_oauth_token   # sets OAUTH_TOKEN (registered for redaction)
  # Amplify's oauthToken field is hard-capped at 1000 chars. A Bitbucket OAuth client_credentials JWT blows
  # past it (verified live); an ATCTT access token is ~200 and fits. Fail fast with a clear message instead of
  # Amplify's cryptic ValidationException.
  if [[ "${#OAUTH_TOKEN}" -gt 1000 ]]; then
    die "Resolved Bitbucket token is ${#OAUTH_TOKEN} chars — Amplify's oauthToken max is 1000. An OAuth-consumer client_credentials JWT is too long; use a Bitbucket Repository/Workspace ACCESS TOKEN (ATCTT, ~200 chars) via --bb-token-secret instead."
  fi
else
  warn "Bitbucket credential for create-app: ${BB_METHOD:-<none set — configure one before --apply>}. (Not fetched in dry-run.)"
fi

# ===========================================================================
step "2. Idempotency"
# ===========================================================================
EXISTING_ID="$(jq -r --arg n "$APP_NAME" '.apps[] | select(.name==$n) | .appId' <<<"$APPS_JSON" | head -n1)"
if [[ -n "$EXISTING_ID" ]]; then
  warn "An Amplify app named '$APP_NAME' already exists (appId $EXISTING_ID)."
  warn "Reusing it — create-app will be SKIPPED. Branch + domain + build steps remain re-runnable/idempotent."
  NEW_APP_ID="$EXISTING_ID"
  SKIP_CREATE_APP=1
else
  ok "No existing app named '$APP_NAME'. Will create."
  NEW_APP_ID=""
  SKIP_CREATE_APP=0
fi

# ===========================================================================
step "3. Clone-from-reference: planned config diff (template -> new)"
# ===========================================================================
# VERIFIED (get-app, 2026-06-30): the fleet sets NO per-tenant Amplify env var. The whole app-level env is
# { NEXT_PUBLIC_API_URL } (the shared backend), IDENTICAL across redbull/pernod/bacardi. Per-tenant
# differentiation is the DOMAIN + the DB rows (company_domains / branding), NOT env. So clone the template
# env VERBATIM and only strip NEXT_PUBLIC_DEV_HOST_OVERRIDE (must never be set in prod — it would pin the
# deploy to one tenant). We deliberately do NOT inject NEXT_PUBLIC_BASE_URL: redbull doesn't set it (Better
# Auth is vestigial; the client derives its origin from the request host), so adding it would deviate from
# the working reference. ($base is still passed to jq but unused — harmless.)
ENV_TRANSFORM='
    del(.NEXT_PUBLIC_DEV_HOST_OVERRIDE)
    | if (.NEXT_PUBLIC_API_URL // "") == "" then .NEXT_PUBLIC_API_URL = "https://api.kadence.ae" else . end
'
NEW_ENV_JSON="$(jq -c --arg base "$BASE_URL" "$ENV_TRANSFORM" <<<"$TPL_ENV_JSON")"
# Branch-level env (issue: must be cloned too). Empty {} for the verified redbull template -> no-op.
if [[ "$TPL_BRANCH_ENV_JSON" == "{}" ]]; then
  NEW_BRANCH_ENV_JSON="{}"
else
  NEW_BRANCH_ENV_JSON="$(jq -c --arg base "$BASE_URL" "$ENV_TRANSFORM" <<<"$TPL_BRANCH_ENV_JSON")"
fi

echo "  platform            : $PLATFORM"
echo "  repository          : $REPO_URL"
echo "  iamServiceRoleArn   : ${ROLE_ARN:-<UNRESOLVED — must provide>}"
echo "  enableBranchAutoBuild: $TPL_ENABLE_BRANCH_AUTOBUILD (branch '$BRANCH' will have enableAutoBuild=true)"
echo "  buildSpec           : $([[ -n "$TPL_BUILDSPEC" ]] && echo '(cloned from template — overrides in-repo amplify.yml)' || echo '<none> — relying on in-repo amplify.yml (preferred)')"
echo "  customRules         : $(jq -c '.' <<<"$TPL_RULES_JSON")  $([[ "$TPL_RULES_JSON" == '[]' ]] && echo '(empty — correct for WEB_COMPUTE SSR)')"
printf "  environment vars (diff):\n"
echo "    TEMPLATE app-env : $(echo "$TPL_ENV_JSON" | jq -c 'with_entries(if (.key|test("SECRET|ACCESS_KEY")) then .value="***" else . end)')"
echo "    NEW app-env      : $(echo "$NEW_ENV_JSON" | jq -c 'with_entries(if (.key|test("SECRET|ACCESS_KEY")) then .value="***" else . end)')"
echo "    NEW branch-env   : $(echo "$NEW_BRANCH_ENV_JSON" | jq -c 'with_entries(if (.key|test("SECRET|ACCESS_KEY")) then .value="***" else . end)')  $([[ "$NEW_BRANCH_ENV_JSON" == '{}' ]] && echo '(empty — branch inherits app-level)')"
echo "    changed          : none injected; stripped NEXT_PUBLIC_DEV_HOST_OVERRIDE only. Env cloned verbatim (per-tenant differentiation is the DOMAIN + DB rows, not env)."

# --- Unknown-key review (issue: app env is cloned verbatim minus 2 keys; surface anything we don't model). ---
KNOWN_RE="$(IFS='|'; echo "${KNOWN_APP_ENV_KEYS[*]}")"
UNKNOWN_KEYS="$(jq -r --arg re "^($KNOWN_RE)\$" 'keys[] | select(test($re)|not)' <<<"$NEW_ENV_JSON" | paste -sd, - || true)"
if [[ -n "$UNKNOWN_KEYS" ]]; then
  warn "Template carries app-env keys this script does NOT model: [$UNKNOWN_KEYS]."
  warn "They are cloned VERBATIM onto '$COMPANY' — confirm none are tenant-pinned (analytics/Sentry DSN/tenant slug) before --apply, or they'll mis-attribute ${COMPANY} telemetry to the template tenant."
fi

# --- Required-key assertion (issue: a degraded clone drops server-side AWS_* and silently 500s uploads). ---
MISSING_REQ=()
for k in "${REQUIRED_APP_ENV_KEYS[@]}"; do
  jq -e --arg k "$k" 'has($k) and (.[$k] != null) and (.[$k] != "")' <<<"$NEW_ENV_JSON" >/dev/null 2>&1 \
    || MISSING_REQ+=( "$k" )
done
if [[ "${#MISSING_REQ[@]}" -gt 0 ]]; then
  if [[ "$APPLY" -eq 1 && "$ACCEPT_MINIMAL_ENV" -ne 1 ]]; then
    err "Resolved env for the new app is MISSING required key(s): ${MISSING_REQ[*]}."
    err "NEXT_PUBLIC_API_URL is build-time inlined and required for the portal to reach the backend at all."
    die "Refusing create-app — the template get-app should have cloned it. Override with --i-accept-minimal-env (UNSAFE) only if you are supplying it another way."
  else
    warn "Resolved env is MISSING required key(s): ${MISSING_REQ[*]} (get-app could not read it or --i-accept-minimal-env)."
    warn "NEXT_PUBLIC_API_URL must resolve (the shared backend origin). Server-side S3 access is via the SSR role, not env. (Hard-aborts under a real --apply without the override flag.)"
  fi
fi

# Build the create-app args.
ENV_ARG="$NEW_ENV_JSON"
RULES_ARG="$TPL_RULES_JSON"

# ===========================================================================
step "4. create-app"
# ===========================================================================
if [[ "$SKIP_CREATE_APP" -eq 1 ]]; then
  warn "Skipping create-app (reusing existing $NEW_APP_ID)."
else
  [[ -n "$ROLE_ARN" || "$APPLY" -eq 0 ]] || die "Refusing to create WEB_COMPUTE app without iamServiceRoleArn. Pass --iam-service-role-arn."
  # Assemble args array so dry-run prints exactly what apply runs.
  CREATE_ARGS=( amplify create-app
    --profile "$PROFILE" --region "$REGION"
    --name "$APP_NAME"
    --repository "$REPO_URL"
    --platform "$PLATFORM"
    --environment-variables "$ENV_ARG"
    --custom-rules "$RULES_ARG"
    --tags "kadence-tenant=${COMPANY},managed-by=provision-client.sh,template=${TEMPLATE_APP_ID}"
  )
  # App-level branch-auto-build MIRRORS the template (redbull=false; the main branch sets its OWN
  # enableAutoBuild=true at create-branch). Faithful clone, not a hardcoded flag.
  if [[ "$TPL_ENABLE_BRANCH_AUTOBUILD" == "true" ]]; then CREATE_ARGS+=( --enable-branch-auto-build ); else CREATE_ARGS+=( --no-enable-branch-auto-build ); fi
  [[ -n "$ROLE_ARN" ]]    && CREATE_ARGS+=( --iam-service-role-arn "$ROLE_ARN" )
  [[ -n "$TPL_BUILDSPEC" ]] && CREATE_ARGS+=( --build-spec "$TPL_BUILDSPEC" )
  # Bitbucket repo is bound via --oauth-token (Amplify installs a read-only SSH deploy key + push webhook
  # -> repositoryCloneMethod=SSH, matching the live fleet). OAUTH_TOKEN was resolved by acquire_oauth_token()
  # under --apply (env override / OAuth-consumer mint / Secrets-Manager token); empty in dry-run. Never
  # printed (redact()). --access-token is the GitHub-App-only path and does NOT bind a Bitbucket repo.
  [[ -n "$OAUTH_TOKEN" ]] && CREATE_ARGS+=( --oauth-token "$OAUTH_TOKEN" )

  if [[ "$APPLY" -eq 1 ]]; then
    # Print the redacted command for visibility, then run aws with stdout captured SEPARATELY so the JSON
    # fed to jq is clean. (Routing create-app through guarded() mixed its log/command lines into the temp
    # file and broke `jq .app.appId` AFTER the app was already created.)
    log "APPLY: create Amplify app $APP_NAME from $REPO_URL (WEB_COMPUTE)"
    printf '   %s$%s ' "$c_dim" "$c_reset"; printf '%q ' aws "${CREATE_ARGS[@]}" | redact; printf '\n'
    if aws "${CREATE_ARGS[@]}" > /tmp/.amp_create.$$ 2>/tmp/.amp_err.$$; then
      NEW_APP_ID="$(jq -r '.app.appId' < /tmp/.amp_create.$$)"
      ok "Created app $APP_NAME -> appId $NEW_APP_ID"
    else
      redact < /tmp/.amp_err.$$ >&2 || true; redact < /tmp/.amp_create.$$ >&2 || true
      rm -f /tmp/.amp_create.$$ /tmp/.amp_err.$$
      die "create-app failed (see above). Common: missing iam:PassRole on the SSR role; Bitbucket token lacking repository:admin + webhook + pullrequest; oauthToken >1000 chars (a NEW Bitbucket OAuth consumer emits a long JWT — use one that returns a SHORT opaque token); --access-token instead of --oauth-token; or region mismatch."
    fi
    rm -f /tmp/.amp_create.$$ /tmp/.amp_err.$$
  else
    # Dry-run: PRINT the exact create-app command to the terminal.
    guarded "create Amplify app $APP_NAME from $REPO_URL (WEB_COMPUTE)" aws "${CREATE_ARGS[@]}"
    NEW_APP_ID="<new-app-id>"
  fi
fi

# ===========================================================================
step "5. create branches (main + staging)"
# ===========================================================================
# FLEET SHAPE (verified across redbull/pernod/bacardi): TWO branches per app —
#   main    : stage PRODUCTION, framework Next.js-SSR, inherits app-level env
#   staging : stage NONE, env override NEXT_PUBLIC_API_URL=https://staging.api.kadence.ae
# The staging override is CLONED from the TEMPLATE's staging branch (faithful, not hardcoded).
TPL_STAGING_ENV_JSON="{}"
if [[ -n "$TPL_APP" ]] && TPL_STG="$(aws_ro amplify get-branch --app-id "$TEMPLATE_APP_ID" --branch-name staging 2>/dev/null)"; then
  TPL_STAGING_ENV_JSON="$(jq -c '.branch.environmentVariables // {}' <<<"$TPL_STG")"
fi
# staging env = template staging env minus DEV_HOST_OVERRIDE (same per-tenant transform; no injection).
NEW_STAGING_ENV_JSON="$(jq -c 'del(.NEXT_PUBLIC_DEV_HOST_OVERRIDE)' <<<"$TPL_STAGING_ENV_JSON" 2>/dev/null || echo '{}')"
[[ "$NEW_STAGING_ENV_JSON" == "null" || -z "$NEW_STAGING_ENV_JSON" || "$NEW_STAGING_ENV_JSON" == "{}" ]] \
  && NEW_STAGING_ENV_JSON='{"NEXT_PUBLIC_API_URL":"https://staging.api.kadence.ae"}'

ensure_branch() { # $1 branch  $2 stage(""=omit->NONE)  $3 env-json  $4 set-framework(1/0)
  local br="$1" st="$2" env="$3" fw="$4"
  if [[ "$APPLY" -eq 1 && "$NEW_APP_ID" != "<new-app-id>" ]] \
     && aws_ro amplify get-branch --app-id "$NEW_APP_ID" --branch-name "$br" >/dev/null 2>&1; then
    warn "Branch '$br' already exists — skipping."; return; fi
  local a=( amplify create-branch --profile "$PROFILE" --region "$REGION"
            --app-id "$NEW_APP_ID" --branch-name "$br" --enable-auto-build )
  [[ -n "$st" ]] && a+=( --stage "$st" )
  [[ "$fw" == "1" ]] && a+=( --framework "Next.js - SSR" )
  if [[ -n "$env" && "$env" != "{}" ]]; then
    a+=( --environment-variables "$env" )
    warn "  '$br' env: $(jq -c 'with_entries(if (.key|test("SECRET|ACCESS_KEY")) then .value="***" else . end)' <<<"$env")"
  fi
  guarded "create branch $br" aws "${a[@]}"
}
ensure_branch "main"    "PRODUCTION" "$NEW_BRANCH_ENV_JSON"  "1"
ensure_branch "staging" ""           "$NEW_STAGING_ENV_JSON" "0"

# ===========================================================================
step "6. create domain associations (prod + staging)"
# ===========================================================================
# FLEET SHAPE: the domainName is the FULL subdomain with an EMPTY (root) prefix — NOT kadence.ae + prefix.
#   prod    : <company>.kadence.ae          root -> main    (+ www if --include-www)
#   staging : staging.<company>.kadence.ae  root -> staging
# Cert defaults to AMPLIFY_MANAGED (--certificate-settings omitted for aws-cli 2.7.29 compat). NOTE: Amplify
# writes the ACM-validation CNAME + record into the zone AS THE CALLER, so the principal needs
# route53:ChangeResourceRecordSets on the kadence.ae zone (in the policy) — else domainStatus=FAILED.
PROD_DOMAIN="$SUBDOMAIN"
STAGING_DOMAIN="staging.${SUBDOMAIN}"
PROD_SUBS='[{"prefix":"","branchName":"main"}]'
[[ "$INCLUDE_WWW" -eq 1 ]] && PROD_SUBS='[{"prefix":"","branchName":"main"},{"prefix":"www","branchName":"main"}]'

ensure_domain() { # $1 domainName  $2 sub-domain-settings JSON  $3 human-branch
  local dn="$1" subs="$2" br="$3"
  if [[ "$APPLY" -eq 1 && "$NEW_APP_ID" != "<new-app-id>" ]] \
     && aws_ro amplify get-domain-association --app-id "$NEW_APP_ID" --domain-name "$dn" >/dev/null 2>&1; then
    warn "Domain '$dn' already associated — skipping."; return; fi
  guarded "associate $dn (root) -> $br (Amplify-managed cert, auto-DNS)" \
    aws amplify create-domain-association --profile "$PROFILE" --region "$REGION" \
      --app-id "$NEW_APP_ID" --domain-name "$dn" --no-enable-auto-sub-domain \
      --sub-domain-settings "$subs"
}
ensure_domain "$PROD_DOMAIN"    "$PROD_SUBS"                              "main"
ensure_domain "$STAGING_DOMAIN" '[{"prefix":"","branchName":"staging"}]'  "staging"

# ===========================================================================
step "7. start builds (main + staging)"
# ===========================================================================
# create-branch on a connected repo usually auto-triggers a build; belt-and-braces RELEASE per branch.
for _br in main staging; do
  guarded "start RELEASE build on $_br" \
    aws amplify start-job --profile "$PROFILE" --region "$REGION" \
      --app-id "$NEW_APP_ID" --branch-name "$_br" --job-type RELEASE
done

# ===========================================================================
step "8. Poll builds + domains"
# ===========================================================================
if [[ "$APPLY" -eq 1 && "$NEW_APP_ID" != "<new-app-id>" ]]; then
  poll_build() { # $1 branch — ~20 min budget
    local br="$1" done=0 st jid j
    log "Polling '$br' build (budget ~$((80 * POLL_INTERVAL / 60)) min) ..."
    for _ in $(seq 1 80); do
      j="$(aws_ro amplify list-jobs --app-id "$NEW_APP_ID" --branch-name "$br" --max-results 1 2>/dev/null || true)"
      st="$(jq -r '.jobSummaries[0].status // "UNKNOWN"' <<<"$j" 2>/dev/null || echo UNKNOWN)"
      jid="$(jq -r '.jobSummaries[0].jobId // "?"' <<<"$j" 2>/dev/null || echo '?')"
      printf '\r    %-7s build %s: %-18s' "$br" "$jid" "$st"
      case "$st" in
        SUCCEED) printf '\n'; ok "$br build succeeded (job $jid)."; done=1; break;;
        FAILED|CANCELLED) printf '\n'; err "$br build $st (job $jid). Inspect: aws amplify get-job --app-id $NEW_APP_ID --branch-name $br --job-id $jid"; done=1; break;;
      esac
      sleep "$POLL_INTERVAL"
    done
    [[ "$done" -eq 0 ]] && { printf '\n'; warn "$br build not terminal after budget — NOT a failure, continues async."; }
  }
  poll_domain() { # $1 domainName — ~15 min budget
    local dn="$1" done=0 st
    log "Polling domain '$dn' (budget ~$((60 * POLL_INTERVAL / 60)) min) ..."
    for _ in $(seq 1 60); do
      st="$(aws_ro amplify get-domain-association --app-id "$NEW_APP_ID" --domain-name "$dn" 2>/dev/null | jq -r '.domainAssociation.domainStatus // "UNKNOWN"' 2>/dev/null || echo UNKNOWN)"
      printf '\r    domain %s: %-24s' "$dn" "$st"
      case "$st" in
        AVAILABLE) printf '\n'; ok "$dn AVAILABLE."; done=1; break;;
        FAILED) printf '\n'; err "$dn FAILED: $(aws_ro amplify get-domain-association --app-id "$NEW_APP_ID" --domain-name "$dn" 2>/dev/null | jq -r '.domainAssociation.statusReason // ""')"; done=1; break;;
      esac
      sleep "$POLL_INTERVAL"
    done
    [[ "$done" -eq 0 ]] && { printf '\n'; warn "$dn still settling after budget — NOT a failure; ACM+DNS continues async. Re-check: aws amplify get-domain-association --app-id $NEW_APP_ID --domain-name $dn"; }
  }
  poll_build main; poll_build staging
  poll_domain "$PROD_DOMAIN"; poll_domain "$STAGING_DOMAIN"
  echo
else
  warn "DRY-RUN — skipping live polling. With --apply, the script polls both builds + both domains to terminal state."
fi

# ===========================================================================
step "9. DB / tenant-resolution checklist (READ-ONLY; mutation is a SEPARATE guarded step)"
# ===========================================================================
cat <<EOF
The Amplify app + domain only make the host REACHABLE. The API resolves the tenant purely from
DB rows (host -> platform/company via getConfigByHostname, exact match on company_domains.hostname
+ is_active=true). Prefer creating these via the platform admin / company-create flow, NOT raw SQL.

REQUIRED rows on platform 'kadence.ae':
  * platforms     : domain='kadence.ae', is_active=true, not in maintenance  (shared, already present).
                    Pin its id (expected 852e6d14-...) and assert company_domains.platform points at IT.
  * companies     : name='${DISPLAY}', is_active=true, deleted_at NULL,
                    settings.branding.{logo_url,primary_color,secondary_color,title} POPULATED.
  * company_domains: hostname='${SUBDOMAIN}', is_active=true (REQUIRED), is_primary=true (recommended),
                    type=VANITY|CUSTOM, is_verified ignored by resolver,
                    platform=<kadence.ae platform id> (resolver inner-joins on it — wrong FK silently
                    serves a DIFFERENT platform's config/features for ${SUBDOMAIN}).

GO-LIVE GATES (a reachable+logging-in portal is NOT enough — the deliverable is a BRANDED portal):
  [G1] resolution : the JOIN below returns exactly one row, company is_active + not deleted, domain is_active.
  [G2] platform   : cd.platform == the kadence.ae platform id (NOT some other platform).
  [G3] branding   : settings.branding.logo_url + primary_color (+ title) must be set. secondary_color is
                    OPTIONAL (the live Bacardi tenant runs without it — verified 2026-06-30). If logo_url or
                    primary_color is NULL, getConfigByHostname returns no branding => portal renders the
                    DEFAULT unbranded shell (no logo, default colors, generic <title>) while everything
                    "looks" up — treat THAT as a HARD pre-go-live BLOCKER. Seed via the company/company-
                    settings service (NOT raw SQL) before declaring live.

READ-ONLY verification (run from api/ with PROD creds sourced; NEVER print the connection string):
  -- companies + its resolving domain row + platform FK + branding (G1/G2/G3):
  SELECT c.id, c.name, c.is_active, c.deleted_at,
         cd.hostname, cd.is_active AS domain_active, cd.is_primary, cd.platform AS domain_platform,
         c.settings->'branding'->>'logo_url'        AS logo_url,
         c.settings->'branding'->>'primary_color'   AS primary_color,
         c.settings->'branding'->>'secondary_color' AS secondary_color,
         c.settings->'branding'->>'title'           AS title
    FROM companies c
    JOIN company_domains cd ON cd.company = c.id
   WHERE cd.hostname = '${SUBDOMAIN}';
  -- FAIL go-live if: 0 rows, domain_platform != kadence.ae platform id, or logo_url/primary_color is NULL
  --                  (secondary_color is OPTIONAL — a live tenant runs without it).

  Or end-to-end through the live API (proves resolution + platform + branding in one shot):
    curl -s 'https://api.kadence.ae/auth/context' \\
      -H 'x-forwarded-host: ${SUBDOMAIN}' | jq '{platform_id,company_name,logo_url,primary_color}'
  -- A null logo_url/primary_color here is a FAILING result (unbranded), not informational.

If the row is MISSING or branding is NULL (separate, human-guarded action — do NOT run from this script):
  Preferred: create/patch via admin company-create + company-settings (auto-makes the VANITY
  company_domains row + sets branding). Raw INSERT/UPDATE only as a reviewed last resort, in a window.
EOF

# ===========================================================================
step "Summary"
# ===========================================================================
cat <<EOF
  app name      : ${APP_NAME}
  app id        : ${NEW_APP_ID}
  default URL   : https://${BRANCH}.${NEW_APP_ID}.amplifyapp.com
  custom URL    : ${BASE_URL}
  repo / branch : ${REPO_URL} @ ${BRANCH}
  mode          : $([[ $APPLY -eq 1 ]] && echo 'APPLIED' || echo 'DRY-RUN (nothing changed) — re-run with --apply')

Next:
  * Confirm build SUCCEED + domain AVAILABLE (polled above with --apply; a non-terminal poll is
    "still settling async", NOT a failure — re-check with the commands printed above).
  * Run the section-9 verification SELECT and PASS go-live gates G1 (resolution), G2 (platform FK),
    G3 (branding non-null). NULL branding => unbranded portal => NOT live, even though it loads.
  * Set the tenant's feature flags (e.g. enable_self_pickup) on company/platform features as needed.
  * Verify in a browser: ${BASE_URL} -> branded title + colors (NOT the default shell), login works.

Rollback notes:
  * create-app failed                 : nothing to undo; fix perms/token/region and re-run.
  * partial (app made, later step died): re-run — idempotency reuses the app + skips existing branch/domain.
  * tear down a wrongly-created app    : 'aws amplify delete-app' — deliberately NOT in the provisioner's
                                         IAM policy (so it cannot destroy live apps); a separate admin action.
  * domain stuck PENDING_VERIFICATION  : confirm Amplify wrote the _<hash> ACM CNAME (read-only
                                         list-resource-record-sets); same-account auto-DNS usually clears fast.
  * NEXT_PUBLIC_* wrong                : update-app/update-branch then start-job RELEASE (inlined at build time).
EOF
