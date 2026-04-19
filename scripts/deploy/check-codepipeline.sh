#!/usr/bin/env bash
# Report state of Kadence API CodePipelines (staging + prod).
#
# Usage:
#   bash scripts/deploy/check-codepipeline.sh                # both
#   bash scripts/deploy/check-codepipeline.sh staging        # just staging
#   bash scripts/deploy/check-codepipeline.sh production     # just prod
#
# Requires AWS_PROFILE=kadence (or inline AWS_ACCESS_KEY_ID/SECRET).
# Pipelines live in us-east-1.

set -eu

AWS_PROFILE="${AWS_PROFILE:-kadence}"
export AWS_PROFILE
REGION="us-east-1"
TARGET="${1:-both}"

report_pipeline() {
    local name="$1"
    echo ""
    echo "══════════════════════════════════════════════════════════"
    echo "  $name"
    echo "══════════════════════════════════════════════════════════"

    # Latest execution across all stages
    aws codepipeline get-pipeline-state --region "$REGION" --name "$name" \
        --query 'stageStates[*].[stageName,latestExecution.status,latestExecution.lastStatusChange,actionStates[0].latestExecution.summary]' \
        --output table 2>&1 | head -20

    # Source branch + revision
    local src
    src=$(aws codepipeline get-pipeline-state --region "$REGION" --name "$name" \
        --query 'stageStates[?stageName==`Source`].actionStates[0].currentRevision' \
        --output json 2>&1)
    echo "  Source revision: $src"

    # Most recent pipeline execution overall
    echo ""
    echo "  Recent executions:"
    aws codepipeline list-pipeline-executions --region "$REGION" --pipeline-name "$name" --max-results 3 \
        --query 'pipelineExecutionSummaries[*].[status,startTime,sourceRevisions[0].revisionSummary]' \
        --output table 2>&1 | head -15
}

case "$TARGET" in
    staging)
        report_pipeline "kadence-api-staging-pipeline"
        ;;
    production|prod)
        report_pipeline "kadence-api-production-pipeline"
        ;;
    both|"")
        report_pipeline "kadence-api-staging-pipeline"
        report_pipeline "kadence-api-production-pipeline"
        ;;
    *)
        echo "Usage: $0 [staging|production|both]" >&2
        exit 1
        ;;
esac
