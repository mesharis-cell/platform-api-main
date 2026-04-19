#!/usr/bin/env bash
# Report latest Amplify build jobs for one of the 4 Kadence frontends.
#
# Usage:
#   bash scripts/deploy/check-amplify.sh admin
#   bash scripts/deploy/check-amplify.sh warehouse
#   bash scripts/deploy/check-amplify.sh client-redbull
#   bash scripts/deploy/check-amplify.sh client-pernod
#   bash scripts/deploy/check-amplify.sh                 # all four
#
# Requires AWS_PROFILE=kadence + amplify:ListBranches + amplify:ListJobs perms.
# Apps live in ap-south-1.

set -eu

AWS_PROFILE="${AWS_PROFILE:-kadence}"
export AWS_PROFILE
REGION="ap-south-1"
TARGET="${1:-all}"

declare -A APPS=(
    [admin]="d3uxg263ljjkn"
    [warehouse]="dlqzh1t64i0in"
    [client-redbull]="d12ui6oezoziso"
    [client-pernod]="d20fj4f9z87yys"
)

report_app() {
    local label="$1"
    local app_id="$2"

    echo ""
    echo "══════════════════════════════════════════════════════════"
    echo "  $label  (app $app_id)"
    echo "══════════════════════════════════════════════════════════"

    # List branches to find which ones have builds
    local branches
    branches=$(aws amplify list-branches --region "$REGION" --app-id "$app_id" \
        --query 'branches[*].branchName' --output text 2>/dev/null || echo "")

    if [[ -z "$branches" ]]; then
        echo "  (no branches or amplify:ListBranches perm missing)"
        return
    fi

    for br in $branches; do
        echo ""
        echo "  — branch: $br —"
        aws amplify list-jobs --region "$REGION" --app-id "$app_id" --branch-name "$br" --max-results 5 \
            --query 'jobSummaries[*].[jobId,status,jobType,commitMessage,startTime]' \
            --output table 2>&1 | head -12
    done
}

case "$TARGET" in
    admin|warehouse|client-redbull|client-pernod)
        report_app "$TARGET" "${APPS[$TARGET]}"
        ;;
    all|"")
        for k in admin warehouse client-redbull client-pernod; do
            report_app "$k" "${APPS[$k]}"
        done
        ;;
    *)
        echo "Usage: $0 [admin|warehouse|client-redbull|client-pernod|all]" >&2
        exit 1
        ;;
esac
