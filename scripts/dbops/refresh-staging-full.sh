#!/usr/bin/env bash
#
# refresh-staging-full.sh
#
# One-shot wrapper around the DRESS-REHEARSAL prod -> staging refresh.
#
# MODEL (2026-07-14): the heavy lifting lives in refresh-staging-from-prod.sh,
# which now SNAPSHOTs prod, RESTOREs it wholesale into staging (schema + data +
# prod's drizzle journal), SANITIZEs outbound contacts, then runs
# `drizzle-kit migrate` so the prod-head -> local-head migrations REPLAY on
# prod-shaped data — the cutover, rehearsed. See that script's header for the
# full model + safety contract.
#
# This wrapper adds:
#   Step 2 — re-seed the demo orders (truck evidence, scans, pending quote).
#   Step 3 — re-run sanitize so demo-seed contact emails are neutralised too
#            (the seed writes placeholder addresses at real domains).
#
# Usage:
#   ./refresh-staging-full.sh apply      # snapshot->restore->sanitize->migrate->seed->sanitize
#   ./refresh-staging-full.sh dry-run    # inspect only; no DB writes
#
# Called by package.json scripts:
#   bun run dbops:refresh-staging        -> apply
#   bun run dbops:refresh-staging:dry    -> dry-run
#
# apply mode still requires the typed confirmation the bare script enforces:
#   APP_ENV=staging DBOPS_REFRESH_CONFIRM="REFRESH STAGING <ref>" \
#       bun run dbops:refresh-staging
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Safety: wrapper requires APP_ENV=staging (same as the script it calls).
# Package.json scripts set this prefix inline.
if [[ "${APP_ENV:-}" != "staging" ]]; then
    echo "ERROR: refresh-staging-full.sh requires APP_ENV=staging (got: \"${APP_ENV:-<unset>}\")" >&2
    exit 1
fi

MODE="${1:-apply}"
if [[ "$MODE" != "apply" && "$MODE" != "dry-run" ]]; then
    echo "Usage: $0 [dry-run|apply]" >&2
    exit 1
fi

# ----------------------------------------------------------------------------
# Step 1 — Dress-rehearsal refresh (snapshot -> restore -> sanitize -> migrate)
# ----------------------------------------------------------------------------
echo ""
echo "====================================================================="
echo " Step 1/3: Refresh staging from prod (dress rehearsal)"
echo "====================================================================="
bash "$SCRIPT_DIR/refresh-staging-from-prod.sh" "$MODE"

# ----------------------------------------------------------------------------
# Step 2 — Re-seed demo orders (skipped in dry-run since it writes to staging)
# ----------------------------------------------------------------------------
echo ""
echo "====================================================================="
echo " Step 2/3: Re-seed demo orders"
echo "====================================================================="

if [[ "$MODE" == "dry-run" ]]; then
    cat <<EOF
[dry-run] SKIPPED — would run: bun run tsx scripts/seed-demo-orders.ts

On apply, this step creates demo orders in staging (delivered / derig / closed /
pending-approval) for lifecycle testing. It runs AFTER the migrate replay, so
the demo rows land on the post-cutover schema.
EOF
    echo ""
    echo "[dry-run] Step 3 (post-seed sanitize) would then re-run to neutralise"
    echo "          any demo-seed contact emails."
    echo ""
    echo "Full dry run complete."
    exit 0
fi

cd "$API_ROOT"
if command -v bun >/dev/null 2>&1; then
    bun run tsx scripts/seed-demo-orders.ts
else
    npx tsx scripts/seed-demo-orders.ts
fi

# ----------------------------------------------------------------------------
# Step 3 — Re-run sanitize so demo-seed contact emails are neutralised too.
#          Idempotent: already-staging addresses are skipped.
# ----------------------------------------------------------------------------
echo ""
echo "====================================================================="
echo " Step 3/3: Re-sanitize (catch demo-seed contacts)"
echo "====================================================================="
APP_ENV=staging bash "$SCRIPT_DIR/sanitize-staging.sh" apply

echo ""
echo "====================================================================="
echo " Full staging refresh complete"
echo "====================================================================="
echo " Fidelity gate (recommended): APP_ENV=staging bun run db:ops:pricing-tieout"
