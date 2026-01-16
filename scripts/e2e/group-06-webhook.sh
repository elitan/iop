#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== GitHub Webhook ==="

log "Checking webhook endpoint is public..."
WEBHOOK_RESPONSE=$(curl -sS -X POST "$BASE_URL/api/github/webhook" 2>&1)
echo "$WEBHOOK_RESPONSE" | grep -q '"error":"unauthorized"' && fail "Webhook blocked by auth"
log "Webhook endpoint is public"

log "Testing autoDeploy default..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-webhook"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"webhook-test","repoUrl":"https://github.com/test/repo.git"}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
AUTO_DEPLOY=$(echo "$SERVICE" | jq -r '.autoDeploy')
[ "$AUTO_DEPLOY" != "1" ] && fail "autoDeploy should be 1, got: $AUTO_DEPLOY"
log "autoDeploy enabled by default"

log "Testing autoDeploy toggle..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" -d '{"autoDeployEnabled":false}' > /dev/null
SERVICE_UPDATED=$(api "$BASE_URL/api/services/$SERVICE_ID")
AUTO_DEPLOY_OFF=$(echo "$SERVICE_UPDATED" | jq -r '.autoDeploy')
[ "$AUTO_DEPLOY_OFF" != "0" ] && fail "autoDeploy should be 0, got: $AUTO_DEPLOY_OFF"
log "autoDeploy toggle works"

api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

log "Testing webhook triggers deployment..."
TEST_WEBHOOK_SECRET="e2e-test-webhook-secret-$(date +%s)"
remote "which sqlite3 || (apt-get update && apt-get install -y sqlite3)"
remote "sqlite3 /opt/frost/data/frost.db \"
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_id', 'test-app-id');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_slug', 'test-app');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_name', 'Test App');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_private_key', 'test-private-key');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_webhook_secret', '$TEST_WEBHOOK_SECRET');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_client_id', 'test-client-id');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_client_secret', 'test-client-secret');
\"" || fail "Failed to insert GitHub app settings"

SETTING_CHECK=$(remote "sqlite3 /opt/frost/data/frost.db \"SELECT COUNT(*) FROM settings WHERE key = 'github_app_webhook_secret';\"")
[ "$SETTING_CHECK" != "1" ] && fail "Webhook secret not written to database"

PROJECT2=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-webhook-deploy"}')
PROJECT2_ID=$(echo "$PROJECT2" | jq -r '.id')

SERVICE2=$(api -X POST "$BASE_URL/api/projects/$PROJECT2_ID/services" \
  -d '{"name":"webhook-deploy-test","repoUrl":"https://github.com/elitan/frost.git","dockerfilePath":"test/fixtures/simple-node/Dockerfile"}')
SERVICE2_ID=$(echo "$SERVICE2" | jq -r '.id')
log "Created service: $SERVICE2_ID"

sleep 1
DEPLOY_INITIAL=$(api "$BASE_URL/api/services/$SERVICE2_ID/deployments" | jq -r '.[0].id')
log "Waiting for initial deployment: $DEPLOY_INITIAL"
wait_for_deployment "$DEPLOY_INITIAL" 90 || fail "Initial deployment failed"

COMMIT_SHA="e2etest$(date +%s)"
WEBHOOK_PAYLOAD="{\"ref\":\"refs/heads/main\",\"after\":\"$COMMIT_SHA\",\"repository\":{\"default_branch\":\"main\",\"clone_url\":\"https://github.com/elitan/frost.git\",\"html_url\":\"https://github.com/elitan/frost\"},\"head_commit\":{\"message\":\"e2e test commit\"}}"
WEBHOOK_SIGNATURE="sha256=$(echo -n "$WEBHOOK_PAYLOAD" | openssl dgst -sha256 -hmac "$TEST_WEBHOOK_SECRET" | awk '{print $2}')"

log "Sending webhook..."
WEBHOOK_RESULT=$(curl -sS -X POST "$BASE_URL/api/github/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $WEBHOOK_SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -d "$WEBHOOK_PAYLOAD")

log "Webhook response: $WEBHOOK_RESULT"
ERROR=$(echo "$WEBHOOK_RESULT" | jq -r '.error // empty')
[ -n "$ERROR" ] && fail "Webhook error: $ERROR"
TRIGGERED=$(echo "$WEBHOOK_RESULT" | jq -r '.deployments[0] // empty')
[ -z "$TRIGGERED" ] && fail "Webhook did not trigger deployment"
log "Webhook triggered deployment: $TRIGGERED"

wait_for_deployment "$TRIGGERED" 90 || fail "Webhook deployment failed"

HOST_PORT=$(api "$BASE_URL/api/deployments/$TRIGGERED" | jq -r '.hostPort')
RESPONSE=$(curl -sf "http://$SERVER_IP:$HOST_PORT" 2>&1 || true)
echo "$RESPONSE" | grep -q "Hello from simple-node" || fail "Service response unexpected: $RESPONSE"
log "Webhook-deployed service responds correctly"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT2_ID" > /dev/null
remote "sqlite3 /opt/frost/data/frost.db \"DELETE FROM settings WHERE key LIKE 'github_app_%';\"" || log "Warning: cleanup of settings failed"

pass
