#!/bin/bash
set -e

SERVER_IP=$1
API_KEY=$2
BROKEN_BRANCH=$3
REPO=$4
BASE_URL="http://$SERVER_IP:3000"

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ] || [ -z "$BROKEN_BRANCH" ] || [ -z "$REPO" ]; then
  echo "Usage: $0 <server-ip> <api-key> <broken-branch> <repo>"
  echo "Example: $0 1.2.3.4 abc123 frost-e2e-broken-123 elitan/frost"
  exit 1
fi

echo "Testing update rollback on $BASE_URL"
echo "Broken branch: $BROKEN_BRANCH"

api() {
  curl -sS --max-time 30 -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" "$@"
}

remote() {
  ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR root@$SERVER_IP "$@"
}

echo ""
echo "=== Recording current version ==="
CURRENT_VERSION=$(api "$BASE_URL/api/health" | jq -r '.version')
echo "Current version: $CURRENT_VERSION"

if [ "$CURRENT_VERSION" = "null" ] || [ -z "$CURRENT_VERSION" ]; then
  echo "Failed to get current version"
  exit 1
fi

echo ""
echo "=== Preparing repo to pull from broken branch ==="
remote "cd /opt/frost && \
  git remote set-url origin https://github.com/${REPO}.git && \
  git fetch origin ${BROKEN_BRANCH}:refs/remotes/origin/main -f"

echo ""
echo "=== Updating systemd service to use broken branch update.sh ==="
remote "sed -i 's|https://raw.githubusercontent.com/.*/update.sh|https://raw.githubusercontent.com/${REPO}/${BROKEN_BRANCH}/update.sh|g' /etc/systemd/system/frost.service && \
  grep -q 'TimeoutStartSec' /etc/systemd/system/frost.service || sed -i '/\\[Service\\]/a TimeoutStartSec=300' /etc/systemd/system/frost.service && \
  systemctl daemon-reload"

echo ""
echo "=== Faking available update in settings ==="
remote "sqlite3 /opt/frost/data/frost.db \"INSERT OR REPLACE INTO settings (key, value) VALUES ('update_available', '99.99.99');\""

echo ""
echo "=== Clearing any previous update result ==="
remote "rm -f /opt/frost/data/.update-result /opt/frost/data/.update-log"

echo ""
echo "=== Triggering update (expecting failure) ==="
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

    echo ""
    echo "Update completed!"
    echo "  Success: $RESULT_SUCCESS"

    if [ "$RESULT_SUCCESS" != "false" ]; then
      echo ""
      echo "FAIL: Update should have FAILED (broken build)"
      echo "Expected success=false, got success=$RESULT_SUCCESS"
      exit 1
    fi

    echo "Rollback confirmed - update failed as expected"
    break
  fi

  if [ $i -eq 60 ]; then
    echo ""
    echo "FAIL: Timed out waiting for result"
    remote "journalctl -u frost --no-pager -n 100" || true
    exit 1
  fi

  sleep 5
done

echo ""
echo "=== Waiting for service to stabilize after rollback ==="
sleep 5

echo ""
echo "=== Verifying version unchanged ==="
AFTER_VERSION=$(api "$BASE_URL/api/health" | jq -r '.version')
echo "Version after failed update: $AFTER_VERSION"

if [ "$AFTER_VERSION" != "$CURRENT_VERSION" ]; then
  echo "FAIL: Version should NOT have changed after rollback"
  echo "Expected: $CURRENT_VERSION"
  echo "Got: $AFTER_VERSION"
  exit 1
fi
echo "PASS: Version correctly unchanged ($CURRENT_VERSION)"

echo ""
echo "=== Verifying service is healthy ==="
HEALTH=$(api "$BASE_URL/api/health")
if echo "$HEALTH" | jq -e '.ok == true' > /dev/null; then
  echo "PASS: Service is healthy after rollback"
else
  echo "FAIL: Service not healthy after rollback"
  echo "$HEALTH"
  exit 1
fi

echo ""
echo "=== Rollback test PASSED ==="
