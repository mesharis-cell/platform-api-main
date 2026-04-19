#!/usr/bin/env bash
# Manually trigger an Amplify build+deploy for an app's branch (latest commit).
#
# Usage:
#   bash scripts/deploy/trigger-amplify.sh admin main
#   bash scripts/deploy/trigger-amplify.sh client-redbull main
#
# Requires AWS_PROFILE=kadence + amplify:StartJob perm.

set -eu

AWS_PROFILE="${AWS_PROFILE:-kadence}"
export AWS_PROFILE
REGION="ap-south-1"

declare -A APPS=(
    [admin]="d3uxg263ljjkn"
    [warehouse]="dlqzh1t64i0in"
    [client-redbull]="d12ui6oezoziso"
    [client-pernod]="d20fj4f9z87yys"
)

TARGET="${1:-}"
BRANCH="${2:-main}"

if [[ -z "$TARGET" || -z "${APPS[$TARGET]:-}" ]]; then
    echo "Usage: $0 <admin|warehouse|client-redbull|client-pernod> [branch=main]" >&2
    exit 1
fi

APP_ID="${APPS[$TARGET]}"

echo "Starting job on Amplify app $TARGET ($APP_ID) branch $BRANCH..."
aws amplify start-job --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --job-type RELEASE \
    --query 'jobSummary.[jobId,status,startTime]' --output table
