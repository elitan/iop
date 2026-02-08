#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"

BATCH_SIZE=${2:-2}
PORT=${FROST_PORT:-3000}
GROUP_GLOB="${E2E_GROUP_GLOB:-group-*.sh}"
GROUP_LIST="${E2E_GROUPS:-}"

echo "========================================"
echo "Local E2E Tests"
echo "========================================"
echo ""

cd "$APP_DIR"

for cmd in curl docker git jq openssl bun; do
  if ! command -v "$cmd" > /dev/null 2>&1; then
    echo "Error: required command '$cmd' not found"
    exit 1
  fi
done

if ! curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
  echo "Error: Frost not running on localhost:$PORT"
  echo "Start with: bun run dev"
  exit 1
fi
echo "✓ Frost running on port $PORT"

API_KEY="${1:-${FROST_API_KEY:-}}"
if [ -z "$API_KEY" ]; then
  if [ -n "${FROST_JWT_SECRET:-}" ]; then
    echo "No API key provided, attempting to create one from local DB..."
    GENERATED_KEY=$(FROST_JWT_SECRET="$FROST_JWT_SECRET" \
      FROST_DATA_DIR="${FROST_DATA_DIR:-$APP_DIR/data}" \
      bun scripts/create-api-key.ts "e2e-local-$(date +%s)" 2>/dev/null || true)

    if [ -n "$GENERATED_KEY" ]; then
      AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-Frost-Token: $GENERATED_KEY" \
        "http://localhost:$PORT/api/projects")
      if [ "$AUTH_CODE" = "200" ]; then
        API_KEY="$GENERATED_KEY"
        echo "✓ Created API key automatically"
      fi
    fi
  fi
fi

if [ -z "$API_KEY" ]; then
  echo "Usage: $0 <api-key>"
  echo "Or set FROST_API_KEY environment variable"
  echo "Tip: use ./apps/app/scripts/e2e-local-managed.sh for fully managed local E2E"
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

if [ "${E2E_SKIP_PREPULL:-0}" != "1" ]; then
  if [ -n "${E2E_PREPULL_IMAGES:-}" ]; then
    read -r -a PREPULL_IMAGES <<< "$E2E_PREPULL_IMAGES"
  else
    PREPULL_IMAGES=("nginx:alpine" "httpd:alpine" "postgres:17" "node:20-alpine" "mariadb:11")
  fi

  if [ "${#PREPULL_IMAGES[@]}" -gt 0 ]; then
    echo "Pre-pulling common images..."
    for image in "${PREPULL_IMAGES[@]}"; do
      pulled=0
      for attempt in 1 2 3; do
        if docker pull "$image" > /dev/null 2>&1; then
          pulled=1
          break
        fi
        sleep 2
      done
      if [ "$pulled" -ne 1 ]; then
        echo "Error: failed to pull image '$image' after 3 attempts"
        exit 1
      fi
    done
    echo "✓ Image pre-pull complete"
  fi
fi

export SERVER_IP="localhost"
export API_KEY
export E2E_LOCAL=1
export FROST_DATA_DIR="${FROST_DATA_DIR:-$APP_DIR/data}"
export FROST_PORT="$PORT"

chmod +x "$E2E_DIR"/*.sh

FAILED=0
ALL_GROUPS=()
GROUP_KEYS="|"

add_group_path() {
  local path="$1"
  [ -f "$path" ] || return 1
  local key
  key="$(basename "$path")"
  case "$GROUP_KEYS" in
    *"|$key|"*) return 0 ;;
  esac
  ALL_GROUPS+=("$path")
  GROUP_KEYS="${GROUP_KEYS}${key}|"
  return 0
}

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

    if ! add_group_path "$GROUP_PATH"; then
      echo "Error: requested E2E group not found: $group"
      MISSING_GROUP=1
    fi
  done
  [ "$MISSING_GROUP" -eq 0 ] || exit 1
else
  shopt -s nullglob
  MATCHED_GROUPS=("$E2E_DIR"/$GROUP_GLOB)
  shopt -u nullglob

  for group in "${MATCHED_GROUPS[@]}"; do
    add_group_path "$group" || true
  done
fi

if [ "${#ALL_GROUPS[@]}" -eq 0 ]; then
  if [ -n "$GROUP_LIST" ]; then
    echo "No E2E groups selected from E2E_GROUPS='$GROUP_LIST'"
  else
    echo "No E2E groups matched E2E_GROUP_GLOB='$GROUP_GLOB'"
  fi
  exit 1
fi

TOTAL=${#ALL_GROUPS[@]}
BATCH=0

echo ""
if [ -n "$GROUP_LIST" ]; then
  echo "Running $TOTAL test groups (batch size: $BATCH_SIZE, groups: $GROUP_LIST)"
else
  echo "Running $TOTAL test groups (batch size: $BATCH_SIZE, glob: $GROUP_GLOB)"
fi
echo "Data dir: $FROST_DATA_DIR"
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
