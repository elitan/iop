#!/bin/bash
set -euo pipefail

SERVER_IP="${1:-}"
API_KEY="${2:-}"
BATCH_SIZE="${3:-${E2E_BATCH_SIZE:-4}}"
START_STAGGER_SEC="${E2E_START_STAGGER_SEC:-1}"
GROUP_GLOB="${E2E_GROUP_GLOB:-group-*.sh}"
GROUP_LIST="${E2E_GROUPS:-}"

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ]; then
  echo "Usage: $0 <server-ip> <api-key> [batch-size]"
  echo "Optional env: E2E_GROUPS='01-basic,04-update' E2E_GROUP_GLOB='group-0*.sh' E2E_START_STAGGER_SEC=1"
  exit 1
fi

export SERVER_IP
export API_KEY

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"

echo "========================================"
echo "Running E2E tests against http://$SERVER_IP:3000"
echo "Batch size: $BATCH_SIZE groups at a time"
echo "Start stagger: ${START_STAGGER_SEC}s"
echo "========================================"
echo ""

echo "Pre-pulling base images to avoid concurrent pull contention..."
PREPULL_RETRIES="${E2E_PREPULL_RETRIES:-3}"
PREPULL_BACKOFF_SEC="${E2E_PREPULL_BACKOFF_SEC:-2}"
if [ -n "${E2E_PREPULL_IMAGES:-}" ]; then
  read -r -a PREPULL_IMAGES <<< "${E2E_PREPULL_IMAGES}"
else
  PREPULL_IMAGES=("nginx:alpine" "httpd:alpine" "postgres:17" "node:20-alpine" "mariadb:11")
fi

for image in "${PREPULL_IMAGES[@]}"; do
  if ! ssh -o StrictHostKeyChecking=no root@"$SERVER_IP" \
    "for attempt in \$(seq 1 $PREPULL_RETRIES); do docker pull '$image' >/dev/null 2>&1 && exit 0; sleep $PREPULL_BACKOFF_SEC; done; exit 1"
  then
    echo "Warning: failed to pre-pull $image after $PREPULL_RETRIES attempts (continuing)"
  fi
done
echo "Base images ready"
echo ""

chmod +x "$E2E_DIR"/*.sh

FAILED=0
ALL_GROUPS=()

if [ -n "$GROUP_LIST" ]; then
  MISSING_GROUP=0
  GROUP_LIST_NORMALIZED=$(echo "$GROUP_LIST" | tr ',\n\t' '   ')
  for group in $GROUP_LIST_NORMALIZED; do
    group="${group%.sh}"
    case "$group" in
      */*) GROUP_PATH="$group" ;;
      group-*) GROUP_PATH="$E2E_DIR/$group.sh" ;;
      *) GROUP_PATH="$E2E_DIR/group-$group.sh" ;;
    esac

    if [ -f "$GROUP_PATH" ]; then
      ALL_GROUPS+=("$GROUP_PATH")
    else
      echo "Error: requested E2E group not found: $group"
      MISSING_GROUP=1
    fi
  done
  [ "$MISSING_GROUP" -eq 0 ] || exit 1
else
  shopt -s nullglob
  ALL_GROUPS=("$E2E_DIR"/$GROUP_GLOB)
  shopt -u nullglob
fi

TOTAL=${#ALL_GROUPS[@]}
BATCH=0

if [ "$TOTAL" -eq 0 ]; then
  if [ -n "$GROUP_LIST" ]; then
    echo "No E2E groups selected from E2E_GROUPS='$GROUP_LIST'"
  else
    echo "No E2E groups matched E2E_GROUP_GLOB='$GROUP_GLOB'"
  fi
  exit 1
fi

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
    if [ "$START_STAGGER_SEC" -gt 0 ] && [ "$j" -lt $((END - 1)) ]; then
      sleep "$START_STAGGER_SEC"
    fi
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
