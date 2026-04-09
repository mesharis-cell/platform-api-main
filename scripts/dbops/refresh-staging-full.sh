#!/usr/bin/env bash
#
# refresh-staging-full.sh
#
# One-shot wrapper that refreshes staging from prod AND re-seeds the demo
# orders with truck evidence, scans, and a pending-approval quote.
#
# Usage:
#   ./refresh-staging-full.sh apply      # full: refresh prod → staging + seed
#   ./refresh-staging-full.sh dry-run    # inspect only; no DB writes
#
# Called by package.json scripts:
#   bun run dbops:refresh-staging        -> apply
#   bun run dbops:refresh-staging:dry    -> dry-run
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

MODE="${1:-apply}"
if [[ "$MODE" != "apply" && "$MODE" != "dry-run" ]]; then
    echo "Usage: $0 [dry-run|apply]" >&2
    exit 1
fi

# ----------------------------------------------------------------------------
# Step 1 — Refresh staging from prod (schema check, truncate+copy, rewrites)
# ----------------------------------------------------------------------------
echo ""
echo "====================================================================="
echo " Step 1/2: Refresh staging from prod"
echo "====================================================================="
bash "$SCRIPT_DIR/refresh-staging-from-prod.sh" "$MODE"

# ----------------------------------------------------------------------------
# Step 2 — Re-seed demo orders (skipped in dry-run since it writes to staging)
# ----------------------------------------------------------------------------
echo ""
echo "====================================================================="
echo " Step 2/2: Re-seed demo orders"
echo "====================================================================="

if [[ "$MODE" == "dry-run" ]]; then
    cat <<EOF
[dry-run] SKIPPED — would run: bun run tsx scripts/seed-demo-orders.ts

On apply, this step creates 4 demo orders in staging for Red Bull:
  1. DELIVERED        — outbound truck photos, scans, delivered state
  2. DERIG            — onsite + derig captures, mid-lifecycle
  3. CLOSED           — full lifecycle incl. return truck, condition reports
  4. PENDING_APPROVAL — fresh quote awaiting client review (3 Barrel Tents)

All demo assets are verified to exist in prod, so the re-seed will always
succeed after a refresh.
EOF
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

echo ""
echo "====================================================================="
echo " Full staging refresh complete"
echo "====================================================================="
