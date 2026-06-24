#!/bin/bash

run_e2e_group_pool() {
  if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [ "$BATCH_SIZE" -lt 1 ]; then
    echo "Error: batch size must be a positive integer, got '$BATCH_SIZE'"
    exit 1
  fi

  local total=${#ALL_GROUPS[@]}
  local poll_sec="${E2E_SCHEDULER_POLL_SEC:-0.2}"
  local next_group=0
  local pids=()
  local group_paths=()
  local group_names=()
  local start_times=()

  FAILED=0
  FAILED_GROUP_PATHS=()
  FAILED_GROUP_NAMES=()

  echo "Scheduling with max concurrency: $BATCH_SIZE"
  echo ""

  while [ "$next_group" -lt "$total" ] || [ "${#pids[@]}" -gt 0 ]; do
    while [ "${#pids[@]}" -lt "$BATCH_SIZE" ] && [ "$next_group" -lt "$total" ]; do
      local group_path="${ALL_GROUPS[$next_group]}"
      local group_name
      group_name=$(basename "$group_path" .sh)

      echo "--- Starting $group_name ($((next_group + 1))/$total, running $((${#pids[@]} + 1))/$BATCH_SIZE) ---"
      group_paths+=("$group_path")
      group_names+=("$group_name")
      start_times+=("$(date +%s)")
      "$group_path" &
      pids+=($!)
      next_group=$((next_group + 1))

      if [ "$START_STAGGER_SEC" -gt 0 ] && [ "$next_group" -lt "$total" ] && [ "${#pids[@]}" -lt "$BATCH_SIZE" ]; then
        sleep "$START_STAGGER_SEC"
      fi
    done

    [ "${#pids[@]}" -eq 0 ] && continue

    sleep "$poll_sec"

    local old_pids=("${pids[@]}")
    local old_group_paths=("${group_paths[@]}")
    local old_group_names=("${group_names[@]}")
    local old_start_times=("${start_times[@]}")

    pids=()
    group_paths=()
    group_names=()
    start_times=()

    local index
    for index in "${!old_pids[@]}"; do
      local pid="${old_pids[$index]}"
      local finished_group_path="${old_group_paths[$index]}"
      local finished_group="${old_group_names[$index]}"
      local started_at="${old_start_times[$index]}"

      if kill -0 "$pid" 2>/dev/null; then
        pids+=("$pid")
        group_paths+=("$finished_group_path")
        group_names+=("$finished_group")
        start_times+=("$started_at")
        continue
      fi

      local ended_at
      local duration
      ended_at=$(date +%s)
      duration=$((ended_at - started_at))

      if wait "$pid"; then
        echo "✓ $finished_group passed"
        if declare -F record_result > /dev/null; then
          record_result "$finished_group" "passed" "$duration" 1
        fi
      else
        echo "✗ $finished_group FAILED"
        if declare -F record_result > /dev/null; then
          record_result "$finished_group" "failed" "$duration" 1
        fi
        FAILED=1
        FAILED_GROUP_PATHS+=("$finished_group_path")
        FAILED_GROUP_NAMES+=("$finished_group")
      fi
    done
  done
}
