#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"

OUT_DIR="${1:-/tmp/frost-e2e-week1}"
FULL_REPORT="$OUT_DIR/full-run.json"
FULL_LOG="$OUT_DIR/full-run.log"
INDIVIDUAL_REPORT="$OUT_DIR/individual-runs.json"
BASELINE_TABLE_JSON="$OUT_DIR/baseline-table.json"
BASELINE_TABLE_TSV="$OUT_DIR/baseline-table.tsv"
CI_STEP_DURATIONS="$OUT_DIR/ci-step-durations.json"
LOG_DIR="$OUT_DIR/logs"

FULL_BATCH_SIZE="${E2E_PROFILE_FULL_BATCH_SIZE:-4}"
INDIVIDUAL_BATCH_SIZE="${E2E_PROFILE_INDIVIDUAL_BATCH_SIZE:-1}"
STAGGER_SEC="${E2E_PROFILE_STAGGER_SEC:-1}"

mkdir -p "$OUT_DIR" "$LOG_DIR"

classify_failure() {
  local log_file="$1"
  if grep -Eiq "context deadline exceeded|i/o timeout|tls handshake timeout|proxyconnect tcp|dial tcp|connection timed out" "$log_file"; then
    echo "infra/transient-network"
    return
  fi
  if grep -Eiq "toomanyrequests|rate limit|429" "$log_file"; then
    echo "infra/rate-limit"
    return
  fi
  if grep -Eiq "unauthorized|authentication required|pull access denied|denied" "$log_file"; then
    echo "registry/auth"
    return
  fi
  if grep -Eiq "manifest unknown|name unknown|not found" "$log_file"; then
    echo "image/not-found"
    return
  fi
  echo "assertion-or-unknown"
}

echo "Output directory: $OUT_DIR"
echo "Running full E2E suite profile..."

set +e
E2E_REPORT_PATH="$FULL_REPORT" \
E2E_START_STAGGER_SEC="$STAGGER_SEC" \
E2E_RETRY_FAILED=0 \
  bash "$SCRIPT_DIR/e2e-local-managed.sh" "$FULL_BATCH_SIZE" 2>&1 | tee "$FULL_LOG"
FULL_EXIT=${PIPESTATUS[0]}
set -e

if [ ! -f "$FULL_REPORT" ]; then
  echo "[]" > "$FULL_REPORT"
fi

echo "Running individual group profiles..."
INDIVIDUAL_NDJSON="$OUT_DIR/individual-runs.ndjson"
: > "$INDIVIDUAL_NDJSON"

for group_path in "$E2E_DIR"/group-*.sh; do
  group_name="$(basename "$group_path" .sh)"
  group_id="${group_name#group-}"
  group_log="$LOG_DIR/${group_name}.log"
  group_report="$LOG_DIR/${group_name}.json"

  start_ts=$(date +%s)
  set +e
  E2E_GROUPS="$group_id" \
  E2E_REPORT_PATH="$group_report" \
  E2E_START_STAGGER_SEC=0 \
  E2E_RETRY_FAILED=0 \
    bash "$SCRIPT_DIR/e2e-local-managed.sh" "$INDIVIDUAL_BATCH_SIZE" > "$group_log" 2>&1
  group_exit=$?
  set -e
  end_ts=$(date +%s)

  if [ "$group_exit" -eq 0 ]; then
    status="passed"
    failure_class="none"
  else
    status="failed"
    failure_class="$(classify_failure "$group_log")"
  fi

  duration_sec=$((end_ts - start_ts))

  jq -nc \
    --arg group "$group_name" \
    --arg mode "individual" \
    --arg status "$status" \
    --argjson durationSec "$duration_sec" \
    --arg failureClass "$failure_class" \
    '{group: $group, mode: $mode, status: $status, durationSec: $durationSec, failureClass: $failureClass}' \
    >> "$INDIVIDUAL_NDJSON"
done

jq -s '.' "$INDIVIDUAL_NDJSON" > "$INDIVIDUAL_REPORT"

jq -n \
  --slurpfile full "$FULL_REPORT" \
  --slurpfile individual "$INDIVIDUAL_REPORT" '
    (
      ($full[0] // [])
      | map({
          group: .group,
          mode: "full",
          status: .status,
          durationSec: .durationSec,
          failureClass: (if .status == "failed" then "unknown" else "none" end)
        })
    )
    + (($individual[0] // []))
  ' > "$BASELINE_TABLE_JSON"

jq -r '.[] | [.group, .mode, .status, .durationSec, .failureClass] | @tsv' \
  "$BASELINE_TABLE_JSON" > "$BASELINE_TABLE_TSV"

set +e
bash "$SCRIPT_DIR/e2e-ci-step-durations.sh" "$CI_STEP_DURATIONS"
set -e

echo ""
echo "Artifacts written:"
echo "  $FULL_REPORT"
echo "  $INDIVIDUAL_REPORT"
echo "  $BASELINE_TABLE_JSON"
echo "  $BASELINE_TABLE_TSV"
echo "  $CI_STEP_DURATIONS"

if [ "$FULL_EXIT" -ne 0 ]; then
  echo "Full suite profile run had failures (exit $FULL_EXIT). Artifacts still captured."
fi
