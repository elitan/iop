#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

OUTPUT_PATH="${1:-/tmp/frost-e2e-week1/ci-step-durations.json}"
RUN_ID="${E2E_CI_RUN_ID:-}"
REPO="${E2E_CI_REPO:-elitan/frost}"

cd "$REPO_ROOT"

mkdir -p "$(dirname "$OUTPUT_PATH")"

if ! command -v gh > /dev/null 2>&1; then
  echo "[]" > "$OUTPUT_PATH"
  echo "gh CLI not found, wrote empty CI step durations to $OUTPUT_PATH"
  exit 0
fi

if [ -z "$RUN_ID" ]; then
  BRANCH="${E2E_CI_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
  RUN_ID="$(
    gh run list \
      --repo "$REPO" \
      --workflow ci.yml \
      --branch "$BRANCH" \
      --limit 1 \
      --json databaseId \
      --jq '.[0].databaseId // empty'
  )"
fi

if [ -z "$RUN_ID" ]; then
  echo "[]" > "$OUTPUT_PATH"
  echo "No CI run found, wrote empty CI step durations to $OUTPUT_PATH"
  exit 0
fi

gh run view "$RUN_ID" --repo "$REPO" --json jobs \
  | jq --argjson runId "$RUN_ID" '
      [
        .jobs[] as $job
        | .steps[]?
        | select(.startedAt != null and .completedAt != null)
        | {
            runId: $runId,
            job: $job.name,
            step: .name,
            status: .status,
            conclusion: .conclusion,
            startedAt: .startedAt,
            completedAt: .completedAt,
            durationSec: ((.completedAt | fromdateiso8601) - (.startedAt | fromdateiso8601))
          }
      ]
    ' > "$OUTPUT_PATH"

echo "Wrote CI step durations for run $RUN_ID to $OUTPUT_PATH"
