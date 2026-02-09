#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"

OUT_DIR="${1:-/tmp/frost-e2e-week1/soak-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR/logs"

FULL_RUN_COUNT="${E2E_SOAK_FULL_RUN_COUNT:-3}"
TOP_GROUPS="${E2E_SOAK_TOP_GROUPS:-19-templates,16-concurrent,20-setup,26-replicas,27-replica-logs,28-oauth}"
TOP_GROUP_REPEAT="${E2E_SOAK_TOP_GROUP_REPEAT:-3}"
FULL_BATCH_SIZE="${E2E_SOAK_FULL_BATCH_SIZE:-4}"
STAGGER_SEC="${E2E_SOAK_STAGGER_SEC:-1}"

RESULTS_NDJSON="$OUT_DIR/results.ndjson"
: > "$RESULTS_NDJSON"

record_result() {
  local group="$1"
  local mode="$2"
  local status="$3"
  local duration="$4"
  local run_index="$5"

  jq -nc \
    --arg group "$group" \
    --arg mode "$mode" \
    --arg status "$status" \
    --argjson durationSec "$duration" \
    --argjson run "$run_index" \
    '{group: $group, mode: $mode, status: $status, durationSec: $durationSec, run: $run}' \
    >> "$RESULTS_NDJSON"
}

run_managed() {
  local mode="$1"
  local label="$2"
  local run_index="$3"
  local log_file="$4"
  shift 4

  local start_ts
  local end_ts
  local exit_code
  local status
  local duration

  start_ts=$(date +%s)
  set +e
  "$@" > "$log_file" 2>&1
  exit_code=$?
  set -e
  end_ts=$(date +%s)
  duration=$((end_ts - start_ts))

  if [ "$exit_code" -eq 0 ]; then
    status="passed"
  else
    status="failed"
  fi

  record_result "$label" "$mode" "$status" "$duration" "$run_index"
}

echo "Output directory: $OUT_DIR"
echo "Running full-suite soak ($FULL_RUN_COUNT runs)..."
for run in $(seq 1 "$FULL_RUN_COUNT"); do
  report_path="$OUT_DIR/full-run-${run}.json"
  log_path="$OUT_DIR/logs/full-run-${run}.log"
  run_managed "full" "all-groups" "$run" "$log_path" \
    env \
      E2E_REPORT_PATH="$report_path" \
      E2E_START_STAGGER_SEC="$STAGGER_SEC" \
      E2E_RETRY_FAILED=0 \
      bash "$SCRIPT_DIR/e2e-local-managed.sh" "$FULL_BATCH_SIZE"
done

echo "Running individual sweep (all groups once)..."
run=1
for group_path in "$E2E_DIR"/group-*.sh; do
  group_name="$(basename "$group_path" .sh)"
  group_id="${group_name#group-}"
  report_path="$OUT_DIR/logs/${group_name}-individual.json"
  log_path="$OUT_DIR/logs/${group_name}-individual.log"
  run_managed "individual" "$group_name" "$run" "$log_path" \
    env \
      E2E_GROUPS="$group_id" \
      E2E_REPORT_PATH="$report_path" \
      E2E_START_STAGGER_SEC=0 \
      E2E_RETRY_FAILED=0 \
      bash "$SCRIPT_DIR/e2e-local-managed.sh" 1
done

echo "Running top slow groups ($TOP_GROUP_REPEAT repeats each)..."
TOP_GROUPS_NORMALIZED=$(echo "$TOP_GROUPS" | tr ',\n\t' '   ')
for group in $TOP_GROUPS_NORMALIZED; do
  for run in $(seq 1 "$TOP_GROUP_REPEAT"); do
    report_path="$OUT_DIR/logs/group-${group}-top-${run}.json"
    log_path="$OUT_DIR/logs/group-${group}-top-${run}.log"
    run_managed "top-repeat" "group-${group}" "$run" "$log_path" \
      env \
        E2E_GROUPS="$group" \
        E2E_REPORT_PATH="$report_path" \
        E2E_START_STAGGER_SEC=0 \
        E2E_RETRY_FAILED=0 \
        bash "$SCRIPT_DIR/e2e-local-managed.sh" 1
  done
done

jq -s '.' "$RESULTS_NDJSON" > "$OUT_DIR/results.json"
jq -r '.[] | [.group, .mode, .run, .status, .durationSec] | @tsv' "$OUT_DIR/results.json" > "$OUT_DIR/results.tsv"

echo "Soak artifacts:"
echo "  $OUT_DIR/results.json"
echo "  $OUT_DIR/results.tsv"
