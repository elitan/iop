#!/bin/bash
set -e

SERVER_IP=$1
API_KEY=$2
BATCH_SIZE=${3:-1}  # Run 1 group at a time (sequential) to avoid port conflicts

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ]; then
  echo "Usage: $0 <server-ip> <api-key> [batch-size]"
  exit 1
fi

export SERVER_IP
export API_KEY

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"

echo "========================================"
echo "Running E2E tests against http://$SERVER_IP:3000"
echo "Batch size: $BATCH_SIZE groups at a time"
echo "========================================"
echo ""

chmod +x "$E2E_DIR"/*.sh

FAILED=0
ALL_GROUPS=("$E2E_DIR"/group-*.sh)
TOTAL=${#ALL_GROUPS[@]}
BATCH=0

echo "Total test groups: $TOTAL"
echo ""

for ((i=0; i<TOTAL; i+=BATCH_SIZE)); do
  BATCH=$((BATCH+1))
  PIDS=()
  GROUP_NAMES=()

  END=$((i + BATCH_SIZE))
  [ $END -gt $TOTAL ] && END=$TOTAL

  echo "--- Batch $BATCH: groups $((i+1))-$END ---"

  for ((j=i; j<END; j++)); do
    group="${ALL_GROUPS[$j]}"
    GROUP_NAME=$(basename "$group" .sh)
    GROUP_NAMES+=("$GROUP_NAME")
    "$group" &
    PIDS+=($!)
    sleep 5  # Stagger starts to avoid port allocation race
  done

  for k in "${!PIDS[@]}"; do
    PID=${PIDS[$k]}
    GROUP=${GROUP_NAMES[$k]}
    if wait "$PID"; then
      echo "✓ $GROUP passed"
    else
      echo "✗ $GROUP FAILED"
      FAILED=1
    fi
  done
  echo ""
done

if [ "$FAILED" -eq 0 ]; then
  echo "========================================"
  echo "All E2E tests passed!"
  echo "========================================"
  exit 0
else
  echo "========================================"
  echo "Some E2E tests FAILED"
  echo "========================================"
  exit 1
fi
