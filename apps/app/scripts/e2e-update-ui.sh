#!/bin/bash
set -e

SERVER_IP=$1
API_KEY=$2
TARGET_BRANCH=$3
REPO=$4
BASE_URL="http://$SERVER_IP:3000"

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ] || [ -z "$TARGET_BRANCH" ] || [ -z "$REPO" ]; then
  echo "Usage: $0 <server-ip> <api-key> <target-branch> <repo>"
  echo "Example: $0 1.2.3.4 abc123 main elitan/frost"
  exit 1
fi

error_handler() {
  echo ""
  echo "!!! ERROR at line $1 !!!"
  echo "Last command exited with status $2"
  echo ""
  echo "=== Debug: Frost health ==="
  curl -sS --max-time 5 "$BASE_URL/api/health" 2>&1 || echo "(health check failed)"
  echo ""
  echo "=== Debug: Recent Frost logs ==="
  ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@$SERVER_IP "journalctl -u frost --no-pager -n 50" 2>&1 || echo "(failed to get logs)"
  echo ""
  echo "=== Debug: Update log ==="
  ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@$SERVER_IP "cat /opt/frost/data/.update-log 2>/dev/null" || echo "(no update log)"
}
trap 'error_handler $LINENO $?' ERR

echo "Testing UI-triggered update flow on $BASE_URL"
echo "Target branch: $TARGET_BRANCH"

api() {
  local RESPONSE
  local HTTP_CODE
  local CURL_EXIT

  RESPONSE=$(curl -sS --max-time 30 -w "\n%{http_code}" -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" "$@" 2>&1) || CURL_EXIT=$?

  if [ -n "$CURL_EXIT" ]; then
    echo "CURL FAILED (exit $CURL_EXIT):" >&2
    echo "$RESPONSE" >&2
    return 1
  fi

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  RESPONSE=$(echo "$RESPONSE" | sed '$d')

  if ! [[ "$HTTP_CODE" =~ ^[0-9]+$ ]]; then
    echo "INVALID HTTP CODE: '$HTTP_CODE'" >&2
    echo "Response: $RESPONSE" >&2
    return 1
  fi

  if [ "$HTTP_CODE" -ge 400 ]; then
    echo "API ERROR (HTTP $HTTP_CODE):" >&2
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE" >&2
    return 1
  fi
  echo "$RESPONSE"
}

remote() {
  ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR root@$SERVER_IP "$@"
}

echo ""
echo "=== Recording current state ==="
CURRENT_VERSION=$(api "$BASE_URL/api/health" | jq -r '.version')
CURRENT_COMMIT=$(remote "cd /opt/frost && git rev-parse HEAD")
echo "Current version: $CURRENT_VERSION"
echo "Current commit: $CURRENT_COMMIT"

if [ "$CURRENT_VERSION" = "null" ] || [ -z "$CURRENT_VERSION" ]; then
  echo "Failed to get current version"
  exit 1
fi

echo ""
echo "=== Preparing repo to pull from target branch ==="
remote "cd /opt/frost && \
  git remote set-url origin https://github.com/${REPO}.git && \
  git fetch origin ${TARGET_BRANCH}:refs/remotes/origin/main -f"

echo ""
echo "=== Disabling git fetch in update.sh to preserve our fake origin/main ==="
remote "sed -i 's|git fetch origin main.*|:|' /opt/frost/update.sh"

echo ""
echo "=== Updating systemd service to use local update.sh ==="
remote "sed -i 's|curl -fsSL https://raw.githubusercontent.com/.*/update.sh.*bash -s -- --pre-start|/opt/frost/update.sh --pre-start|' /etc/systemd/system/frost.service && \
  grep -q 'TimeoutStartSec' /etc/systemd/system/frost.service || sed -i '/\\[Service\\]/a TimeoutStartSec=300' /etc/systemd/system/frost.service && \
  systemctl daemon-reload"

echo ""
echo "=== Ensuring sqlite3 is installed ==="
remote "which sqlite3 > /dev/null 2>&1 || (apt-get update && apt-get install -y sqlite3)"

echo ""
echo "=== Faking available update in settings ==="
remote "sqlite3 /opt/frost/data/frost.db \"INSERT OR REPLACE INTO settings (key, value) VALUES ('update_available', '99.99.99');\""

echo ""
echo "=== Clearing any previous update result ==="
remote "rm -f /opt/frost/data/.update-result /opt/frost/data/.update-log"

echo ""
echo "=== Triggering update via API ==="
APPLY_RESULT=$(api -X POST "$BASE_URL/api/updates/apply")
echo "Apply result: $APPLY_RESULT"

echo ""
echo "=== Waiting for service to restart ==="
sleep 5

echo ""
echo "=== Polling for update result ==="
for i in $(seq 1 60); do
  RESULT=$(curl -sS --max-time 10 "$BASE_URL/api/updates/result" \
    -H "X-Frost-Token: $API_KEY" 2>/dev/null || echo '{"completed":false}')
  COMPLETED=$(echo "$RESULT" | jq -r '.completed')

  echo "Attempt $i: completed=$COMPLETED"

  if [ "$COMPLETED" = "true" ]; then
    RESULT_SUCCESS=$(echo "$RESULT" | jq -r '.success')
    NEW_VERSION=$(echo "$RESULT" | jq -r '.newVersion')

    echo ""
    echo "Update completed!"
    echo "  Success: $RESULT_SUCCESS"
    echo "  New version: $NEW_VERSION"

    if [ "$RESULT_SUCCESS" != "true" ]; then
      echo ""
      echo "FAIL: Update should have succeeded"
      echo "Log:"
      echo "$RESULT" | jq -r '.log // "No log available"'
      exit 1
    fi

    break
  fi

  if [ $i -eq 60 ]; then
    echo ""
    echo "FAIL: Update timed out after 5 minutes"
    remote "journalctl -u frost --no-pager -n 100" || true
    exit 1
  fi

  sleep 5
done

echo ""
echo "=== Verifying code was updated ==="
AFTER_COMMIT=$(remote "cd /opt/frost && git rev-parse HEAD")
echo "Commit after update: $AFTER_COMMIT"

if [ "$AFTER_COMMIT" = "$CURRENT_COMMIT" ]; then
  echo "FAIL: Git commit should have changed"
  echo "Before: $CURRENT_COMMIT"
  echo "After: $AFTER_COMMIT"
  exit 1
fi
echo "PASS: Code updated from $CURRENT_COMMIT to $AFTER_COMMIT"

echo ""
echo "=== Verifying service is healthy ==="
HEALTH=$(api "$BASE_URL/api/health")
if echo "$HEALTH" | jq -e '.ok == true' > /dev/null; then
  echo "PASS: Service is healthy"
else
  echo "FAIL: Service not healthy"
  echo "$HEALTH"
  exit 1
fi

echo ""
echo "=== UI update flow test PASSED ==="
