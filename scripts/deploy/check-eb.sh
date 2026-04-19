#!/usr/bin/env bash
# Report EB environment state for Kadence API (staging + prod).
#
# Usage:
#   bash scripts/deploy/check-eb.sh            # both envs
#   bash scripts/deploy/check-eb.sh staging    # just staging
#   bash scripts/deploy/check-eb.sh prod       # just prod
#
# Requires AWS_PROFILE=kadence. EB envs live in ap-south-1.

set -eu

AWS_PROFILE="${AWS_PROFILE:-kadence}"
export AWS_PROFILE
REGION="ap-south-1"
TARGET="${1:-both}"

report_env() {
    local name="$1"
    echo ""
    echo "══════════════════════════════════════════════════════════"
    echo "  $name"
    echo "══════════════════════════════════════════════════════════"
    aws elasticbeanstalk describe-environments --region "$REGION" --environment-names "$name" \
        --query 'Environments[0].[EnvironmentName,Status,Health,HealthStatus,VersionLabel,DateUpdated]' \
        --output table 2>&1 | head -10

    echo ""
    echo "  Recent events:"
    aws elasticbeanstalk describe-events --region "$REGION" --environment-name "$name" --max-records 8 \
        --query 'Events[*].[EventDate,Severity,Message]' --output text 2>&1 | head -15
}

case "$TARGET" in
    staging)
        report_env "kadence-api-env-staging"
        ;;
    production|prod)
        report_env "kadence-api-env-production"
        ;;
    both|"")
        report_env "kadence-api-env-staging"
        report_env "kadence-api-env-production"
        ;;
    *)
        echo "Usage: $0 [staging|prod|both]" >&2
        exit 1
        ;;
esac
