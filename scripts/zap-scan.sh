#!/bin/bash
# ==============================================================================
# OWASP ZAP Baseline Security Scan
# ==============================================================================
# Runs OWASP ZAP (Zed Attack Proxy) against Kadence staging environments.
# Produces formal HTML reports suitable for sharing with enterprise clients.
#
# Requirements: Docker installed and running
# Usage: ./scripts/zap-scan.sh [api|admin|client|all]
# Reports saved to: ./reports/
#
# IMPORTANT: Only run against staging. Never against production.
# ==============================================================================

set -e

STAGING_API="https://staging.api.kadence.ae"
STAGING_ADMIN="https://staging.admin.kadence.ae"
STAGING_CLIENT="https://staging.pernod-ricard.kadence.ae"
REPORT_DIR="$(cd "$(dirname "$0")/.." && pwd)/reports"
DATE=$(date +%Y-%m-%d)
ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:stable"

mkdir -p "$REPORT_DIR"

scan_target() {
    local name=$1
    local url=$2
    local report_name="kadence-${name}-zap-report-${DATE}"

    echo ""
    echo "============================================================"
    echo "  Scanning: ${name} (${url})"
    echo "  Report:   ${report_name}.html"
    echo "============================================================"
    echo ""

    docker run --rm \
        -v "$REPORT_DIR:/zap/wrk:rw" \
        "$ZAP_IMAGE" \
        zap-baseline.py \
        -t "$url" \
        -r "${report_name}.html" \
        -x "${report_name}.xml" \
        -I \
        -d

    echo ""
    echo "  ✓ ${name} scan complete → reports/${report_name}.html"
}

TARGET=${1:-all}

echo "============================================================"
echo "  OWASP ZAP Security Scan — Kadence Platform"
echo "  Date: ${DATE}"
echo "  Target: ${TARGET}"
echo "============================================================"

case $TARGET in
    api)
        scan_target "api" "$STAGING_API"
        ;;
    admin)
        scan_target "admin" "$STAGING_ADMIN"
        ;;
    client)
        scan_target "client" "$STAGING_CLIENT"
        ;;
    all)
        scan_target "api" "$STAGING_API"
        scan_target "admin" "$STAGING_ADMIN"
        scan_target "client" "$STAGING_CLIENT"
        ;;
    *)
        echo "Usage: $0 [api|admin|client|all]"
        exit 1
        ;;
esac

echo ""
echo "============================================================"
echo "  All scans complete. Reports saved to:"
echo "  ${REPORT_DIR}/"
echo "============================================================"
ls -la "$REPORT_DIR"/kadence-*-${DATE}* 2>/dev/null || echo "  (no reports found)"
