#!/usr/bin/env bash
# One-screen deploy dashboard for Kadence — API pipelines, EB envs, Amplify apps.
#
# Usage:
#   bash scripts/deploy/check-all.sh

set -eu

AWS_PROFILE="${AWS_PROFILE:-kadence}"
export AWS_PROFILE
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "██████████████████████████████████████████████████████████████"
echo "  KADENCE DEPLOY STATUS  —  $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "██████████████████████████████████████████████████████████████"

echo ""
echo "▶ API CodePipelines (us-east-1)"
echo "────────────────────────────────────────────────────────"
aws codepipeline list-pipeline-executions --region us-east-1 --pipeline-name kadence-api-staging-pipeline --max-results 1 \
    --query 'pipelineExecutionSummaries[0].[status,startTime,sourceRevisions[0].revisionSummary]' --output table 2>&1 | head -8
echo "(staging pipeline — watches Bitbucket staging branch)"

echo ""
aws codepipeline list-pipeline-executions --region us-east-1 --pipeline-name kadence-api-production-pipeline --max-results 1 \
    --query 'pipelineExecutionSummaries[0].[status,startTime,sourceRevisions[0].revisionSummary]' --output table 2>&1 | head -8
echo "(production pipeline — watches Bitbucket main branch)"

echo ""
echo "▶ API EB environments (ap-south-1)"
echo "────────────────────────────────────────────────────────"
aws elasticbeanstalk describe-environments --region ap-south-1 \
    --environment-names kadence-api-env-staging kadence-api-env-production \
    --query 'Environments[*].[EnvironmentName,Status,Health,VersionLabel,DateUpdated]' \
    --output table 2>&1 | head -8

echo ""
echo "▶ Amplify apps (ap-south-1) — LATEST job per main branch"
echo "────────────────────────────────────────────────────────"
for app in "admin:d3uxg263ljjkn" "warehouse:dlqzh1t64i0in" "client-redbull:d12ui6oezoziso" "client-pernod:d20fj4f9z87yys"; do
    label="${app%%:*}"
    app_id="${app##*:}"
    printf "\n  %s (app %s)\n" "$label" "$app_id"
    aws amplify list-jobs --region ap-south-1 --app-id "$app_id" --branch-name main --max-results 1 \
        --query 'jobSummaries[0].[status,jobType,startTime,commitMessage]' \
        --output table 2>&1 | head -6
done

echo ""
echo "──────────────────────────────────────────────────────────────"
echo "Tip: this dashboard shows what CodePipeline / Amplify SAY. For"
echo "prod-functional signal, also probe https://api.kadence.ae/ and"
echo "https://redbull.kadence.ae/catalog."
