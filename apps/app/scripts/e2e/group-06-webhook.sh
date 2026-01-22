#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== GitHub Webhook ==="

TEST_BRANCH="${E2E_BRANCH:-main}"
log "Using branch: $TEST_BRANCH"

log "Checking webhook endpoint is public..."
WEBHOOK_RESPONSE=$(curl -sS -X POST "$BASE_URL/api/github/webhook" 2>&1)
echo "$WEBHOOK_RESPONSE" | grep -q '"error":"unauthorized"' && fail "Webhook blocked by auth"
log "Webhook endpoint is public"

log "Testing autoDeploy default..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-webhook"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"webhook-test","repoUrl":"https://github.com/test/repo.git"}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
AUTO_DEPLOY=$(json_get "$SERVICE" '.autoDeploy')
[ "$AUTO_DEPLOY" != "1" ] && [ "$AUTO_DEPLOY" != "true" ] && fail "autoDeploy should be 1/true, got: $AUTO_DEPLOY"
log "autoDeploy enabled by default"

log "Testing autoDeploy toggle..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" -d '{"autoDeployEnabled":false}' > /dev/null
SERVICE_UPDATED=$(api "$BASE_URL/api/services/$SERVICE_ID")
AUTO_DEPLOY_OFF=$(json_get "$SERVICE_UPDATED" '.autoDeploy')
[ "$AUTO_DEPLOY_OFF" != "0" ] && [ "$AUTO_DEPLOY_OFF" != "false" ] && fail "autoDeploy should be 0/false, got: $AUTO_DEPLOY_OFF"
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
PROJECT2_ID=$(require_field "$PROJECT2" '.id' "create project2") || fail "Failed to create project2: $PROJECT2"

ENV2_ID=$(get_default_environment "$PROJECT2_ID") || fail "Failed to get environment"
log "Using environment: $ENV2_ID"

SERVICE2=$(api -X POST "$BASE_URL/api/environments/$ENV2_ID/services" \
  -d "{\"name\":\"webhook-deploy-test\",\"repoUrl\":\"https://github.com/elitan/frost.git\",\"branch\":\"$TEST_BRANCH\",\"dockerfilePath\":\"apps/app/test/fixtures/simple-node/Dockerfile.repo\"}")
SERVICE2_ID=$(require_field "$SERVICE2" '.id' "create service2") || fail "Failed to create service2: $SERVICE2"
log "Created service: $SERVICE2_ID"

sleep 1
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE2_ID/deployments")
DEPLOY_INITIAL=$(require_field "$DEPLOYS" '.[0].id' "get initial deploy") || fail "No initial deployment: $DEPLOYS"
log "Waiting for initial deployment: $DEPLOY_INITIAL"
wait_for_deployment "$DEPLOY_INITIAL" 90 || fail "Initial deployment failed"

COMMIT_SHA="e2etest$(date +%s)"
WEBHOOK_PAYLOAD="{\"ref\":\"refs/heads/$TEST_BRANCH\",\"after\":\"$COMMIT_SHA\",\"repository\":{\"default_branch\":\"$TEST_BRANCH\",\"clone_url\":\"https://github.com/elitan/frost.git\",\"html_url\":\"https://github.com/elitan/frost\"},\"head_commit\":{\"message\":\"e2e test commit\"}}"
WEBHOOK_SIGNATURE="sha256=$(echo -n "$WEBHOOK_PAYLOAD" | openssl dgst -sha256 -hmac "$TEST_WEBHOOK_SECRET" | awk '{print $2}')"

log "Sending webhook..."
WEBHOOK_RESULT=$(curl -sS -X POST "$BASE_URL/api/github/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $WEBHOOK_SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -d "$WEBHOOK_PAYLOAD")

log "Webhook response: $WEBHOOK_RESULT"
ERROR=$(json_get "$WEBHOOK_RESULT" '.error // empty')
[ -n "$ERROR" ] && [ "$ERROR" != "null" ] && fail "Webhook error: $ERROR"
TRIGGERED=$(json_get "$WEBHOOK_RESULT" '.deployments[0] // empty')
[ -z "$TRIGGERED" ] || [ "$TRIGGERED" = "null" ] && fail "Webhook did not trigger deployment. Response: $WEBHOOK_RESULT"
log "Webhook triggered deployment: $TRIGGERED"

wait_for_deployment "$TRIGGERED" 90 || fail "Webhook deployment failed"

DEPLOY_DATA=$(api "$BASE_URL/api/deployments/$TRIGGERED")
HOST_PORT=$(require_field "$DEPLOY_DATA" '.hostPort' "get webhook deploy port") || fail "No hostPort: $DEPLOY_DATA"
RESPONSE=$(curl -sf "http://$SERVER_IP:$HOST_PORT" 2>&1 || true)
echo "$RESPONSE" | grep -q "Hello from simple-node" || fail "Service response unexpected: $RESPONSE"
log "Webhook-deployed service responds correctly"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT2_ID" > /dev/null
remote "sqlite3 /opt/frost/data/frost.db \"DELETE FROM settings WHERE key LIKE 'github_app_%';\"" || log "Warning: cleanup of settings failed"

pass
