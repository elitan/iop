#!/bin/bash
set -e

SERVER_IP=$1
API_KEY=$2

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ]; then
  echo "Usage: $0 <server-ip> <api-key>"
  exit 1
fi

export SERVER_IP
export API_KEY

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"

echo "========================================"
echo "Running E2E tests against http://$SERVER_IP:3000"
echo "========================================"
echo ""
echo "SCRIPT_DIR: $SCRIPT_DIR"
echo "E2E_DIR: $E2E_DIR"
echo "Files in E2E_DIR:"
ls -la "$E2E_DIR" 2>&1 || echo "E2E_DIR does not exist!"
echo ""

chmod +x "$E2E_DIR"/*.sh

FAILED=0
PIDS=()
GROUPS=()

for group in "$E2E_DIR"/group-*.sh; do
  GROUP_NAME=$(basename "$group" .sh)
  GROUPS+=("$GROUP_NAME")
  "$group" &
  PIDS+=($!)
done

echo "Started ${#PIDS[@]} test groups in parallel"
echo ""

for i in "${!PIDS[@]}"; do
  PID=${PIDS[$i]}
  GROUP=${GROUPS[$i]}
  if wait "$PID"; then
    echo "✓ $GROUP passed"
  else
    echo "✗ $GROUP FAILED"
    FAILED=1
  fi
done

echo ""
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
