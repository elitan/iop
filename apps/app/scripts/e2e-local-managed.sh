#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

PORT="${FROST_PORT:-3301}"
BATCH_SIZE="${1:-2}"
DEV_LOG="${E2E_DEV_LOG:-/tmp/frost-dev.log}"
JWT_SECRET="${FROST_JWT_SECRET:-frost-e2e-$(openssl rand -hex 24)}"
KEEP_DATA="${E2E_KEEP_DATA:-0}"
KEEP_REPOS="${E2E_KEEP_REPOS:-0}"

TEMP_DATA_DIR=0
if [ -n "${FROST_DATA_DIR:-}" ]; then
  DATA_DIR="$FROST_DATA_DIR"
else
  DATA_DIR="$(mktemp -d /tmp/frost-e2e.XXXXXX)"
  TEMP_DATA_DIR=1
fi

cleanup() {
  local STATUS=$?

  if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" > /dev/null 2>&1; then
    kill "$DEV_PID" > /dev/null 2>&1 || true
    wait "$DEV_PID" > /dev/null 2>&1 || true
  fi

  if [ "$TEMP_DATA_DIR" -eq 1 ] && [ "$KEEP_DATA" != "1" ] && [ -d "$DATA_DIR" ]; then
    rm -rf "$DATA_DIR"
  fi

  if [ "$KEEP_REPOS" != "1" ] && [ -d "$APP_DIR/repos" ]; then
    rm -rf "$APP_DIR/repos"
  fi

  exit "$STATUS"
}
trap cleanup EXIT

for cmd in curl docker git jq openssl bun; do
  if ! command -v "$cmd" > /dev/null 2>&1; then
    echo "Error: required command '$cmd' not found"
    exit 1
  fi
done

if ! (cd "$APP_DIR" && bun --bun next --version > /dev/null 2>&1); then
  echo "Installing dependencies (bun install)..."
  (cd "$REPO_ROOT" && bun install)
fi

mkdir -p "$DATA_DIR"
rm -f "$DEV_LOG"

echo "========================================"
echo "Managed Local E2E"
echo "========================================"
echo "Port: $PORT"
echo "Data dir: $DATA_DIR"
echo "Batch size: $BATCH_SIZE"
echo "Retry failed groups: ${E2E_RETRY_FAILED:-0}"
if [ -n "${E2E_GROUPS:-}" ]; then
  echo "Groups: $E2E_GROUPS"
else
  echo "Group glob: ${E2E_GROUP_GLOB:-group-*.sh}"
fi
if [ -n "${E2E_REPORT_PATH:-}" ]; then
  echo "Report path: $E2E_REPORT_PATH"
fi
echo ""

echo "Starting local Frost dev server..."
(
  cd "$APP_DIR"
  NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=development \
    FROST_DATA_DIR="$DATA_DIR" \
    FROST_JWT_SECRET="$JWT_SECRET" \
    bun --bun next dev -p "$PORT"
) > "$DEV_LOG" 2>&1 &
DEV_PID=$!

READY=0
for i in $(seq 1 90); do
  if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    READY=1
    break
  fi

  if ! kill -0 "$DEV_PID" > /dev/null 2>&1; then
    echo "Dev server exited early. Logs:"
    tail -n 80 "$DEV_LOG" || true
    exit 1
  fi

  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "Frost dev server did not become healthy on port $PORT"
  tail -n 80 "$DEV_LOG" || true
  exit 1
fi
echo "✓ Frost dev server is healthy"

echo "Creating API key for test run..."
API_KEY=""
for i in $(seq 1 30); do
  API_KEY="$(
    cd "$APP_DIR"
    FROST_JWT_SECRET="$JWT_SECRET" \
      FROST_DATA_DIR="$DATA_DIR" \
      bun scripts/create-api-key.ts "e2e-local-$(date +%s)" 2>/dev/null || true
  )"
  API_KEY="$(echo "$API_KEY" | tr -d '\r\n')"
  if [ -n "$API_KEY" ]; then
    break
  fi
  sleep 1
done

if [ -z "$API_KEY" ]; then
  echo "Failed to create API key (db may not be ready)"
  exit 1
fi

AUTH_CODE="$(
  curl -s -o /dev/null -w "%{http_code}" \
    -H "X-Frost-Token: $API_KEY" \
    "http://localhost:$PORT/api/projects"
)"
if [ "$AUTH_CODE" != "200" ]; then
  echo "Generated API key failed auth check (HTTP $AUTH_CODE)"
  exit 1
fi
echo "✓ API key created and verified"

echo ""
echo "Running E2E tests..."
FROST_PORT="$PORT" \
FROST_DATA_DIR="$DATA_DIR" \
ADMIN_PASSWORD="e2eTestPassword123" \
  "$SCRIPT_DIR/e2e-local.sh" "$API_KEY" "$BATCH_SIZE"

if [ "$KEEP_DATA" = "1" ] && [ -d "$DATA_DIR" ]; then
  echo "Kept local E2E data at $DATA_DIR"
fi
