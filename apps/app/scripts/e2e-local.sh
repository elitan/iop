#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"

BATCH_SIZE=${2:-4}
PORT=${FROST_PORT:-3000}

echo "========================================"
echo "Local E2E Tests"
echo "========================================"
echo ""

cd "$APP_DIR"

if ! curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
  echo "Error: Frost not running on localhost:$PORT"
  echo "Start with: bun run dev"
  exit 1
fi
echo "✓ Frost running on port $PORT"

API_KEY="${1:-${FROST_API_KEY:-}}"
if [ -z "$API_KEY" ]; then
  echo "Usage: $0 <api-key>"
  echo "Or set FROST_API_KEY environment variable"
  exit 1
fi
echo "✓ API key provided"

for dir in "$APP_DIR/test/fixtures"/*/; do
  if [ -d "$dir" ] && [ ! -d "$dir/.git" ]; then
    echo "Initializing git in $(basename "$dir")..."
    (cd "$dir" && git init -b main && git add -A && git commit -m "init" --allow-empty) > /dev/null 2>&1
  fi
done
echo "✓ Test fixtures ready"

echo "Cleaning up Docker resources from previous runs..."
docker rm -f $(docker ps -aq --filter "label=frost.managed=true") 2>/dev/null || true
docker network prune -f > /dev/null 2>&1
echo "✓ Docker cleanup done"

export SERVER_IP="localhost"
export API_KEY
export E2E_LOCAL=1
export FROST_DATA_DIR="$APP_DIR/data"

chmod +x "$E2E_DIR"/*.sh

FAILED=0
ALL_GROUPS=("$E2E_DIR"/group-*.sh)
TOTAL=${#ALL_GROUPS[@]}
BATCH=0

echo ""
echo "Running $TOTAL test groups (batch size: $BATCH_SIZE)"
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
    sleep 2
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
