#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Preview Environments (PR-only) ==="

DEFAULT_BRANCH="main"
PR_BRANCH="main"
TEST_WEBHOOK_SECRET="e2e-preview-secret-$(date +%s)"

if [ "${E2E_LOCAL:-}" != "1" ]; then
  remote "which sqlite3 || (apt-get update && apt-get install -y sqlite3)"
fi
remote "sqlite3 $FROST_DATA_DIR/frost.db \"
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_id', 'test-app-id');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_slug', 'test-app');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_name', 'Test App');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_private_key', 'test-private-key');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_webhook_secret', '$TEST_WEBHOOK_SECRET');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_client_id', 'test-client-id');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_client_secret', 'test-client-secret');
\"" || fail "Failed to insert GitHub app settings"

PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-preview-test"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"
log "Created project: $PROJECT_ID"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using production environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d "{\"name\":\"preview-test\",\"repoUrl\":\"https://github.com/elitan/frost.git\",\"branch\":\"main\",\"dockerfilePath\":\"apps/app/test/fixtures/simple-node/Dockerfile.repo\"}")
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

sleep 1
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_INITIAL=$(require_field "$DEPLOYS" '.[0].id' "get initial deploy") || fail "No initial deployment"
log "Waiting for initial deployment: $DEPLOY_INITIAL"
wait_for_deployment "$DEPLOY_INITIAL" 90 || fail "Initial deployment failed"

sign_webhook() {
  local PAYLOAD="$1"
  echo "sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$TEST_WEBHOOK_SECRET" | awk '{print $2}')"
}

send_webhook() {
  local EVENT="$1"
  local PAYLOAD="$2"
  local SIGNATURE=$(sign_webhook "$PAYLOAD")
  curl -sS -X POST "$BASE_URL/api/github/webhook" \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: $SIGNATURE" \
    -H "X-GitHub-Event: $EVENT" \
    -d "$PAYLOAD"
}

log "Testing branch push to non-default branch returns no-op..."
BRANCH_PUSH_PAYLOAD="{\"ref\":\"refs/heads/some-feature-branch\",\"after\":\"abc123\",\"repository\":{\"default_branch\":\"$DEFAULT_BRANCH\",\"clone_url\":\"https://github.com/elitan/frost.git\",\"html_url\":\"https://github.com/elitan/frost\"},\"head_commit\":{\"message\":\"test commit\"},\"sender\":{\"login\":\"e2e-test\",\"avatar_url\":\"https://example.com/avatar.png\"}}"
BRANCH_RESULT=$(send_webhook "push" "$BRANCH_PUSH_PAYLOAD")
echo "$BRANCH_RESULT" | grep -q "do not create previews" || fail "Branch push should return no-op message. Got: $BRANCH_RESULT"
log "Branch push correctly returns no-op"

log "Testing PR opened creates preview environment..."
PR_NUMBER=$((RANDOM + 1000))
PR_TITLE="Add User Authentication"
PR_SHA="def456$(date +%s)"
PR_OPENED_PAYLOAD="{\"action\":\"opened\",\"number\":$PR_NUMBER,\"pull_request\":{\"title\":\"$PR_TITLE\",\"head\":{\"ref\":\"$PR_BRANCH\",\"sha\":\"$PR_SHA\"}},\"repository\":{\"clone_url\":\"https://github.com/elitan/frost.git\"},\"sender\":{\"login\":\"e2e-test\",\"avatar_url\":\"https://example.com/avatar.png\"}}"
PR_OPENED_RESULT=$(send_webhook "pull_request" "$PR_OPENED_PAYLOAD")
echo "$PR_OPENED_RESULT" | grep -q "Created preview environment" || fail "PR opened should create preview. Got: $PR_OPENED_RESULT"
PREVIEW_ENV_ID=$(echo "$PR_OPENED_RESULT" | jq -r '.environmentId')
[ -z "$PREVIEW_ENV_ID" ] || [ "$PREVIEW_ENV_ID" = "null" ] && fail "No environment ID returned"
log "Created preview environment: $PREVIEW_ENV_ID"

log "Verifying environment name is slugified PR title..."
ENV_DATA=$(api "$BASE_URL/api/environments/$PREVIEW_ENV_ID")
ENV_NAME=$(json_get "$ENV_DATA" '.name')
[ "$ENV_NAME" = "add-user-authentication" ] || fail "Expected env name 'add-user-authentication', got: $ENV_NAME"
log "Environment name correct: $ENV_NAME"

log "Waiting for preview deployment..."
PREVIEW_DEPLOYS=$(echo "$PR_OPENED_RESULT" | jq -r '.deployments[0]')
[ -z "$PREVIEW_DEPLOYS" ] || [ "$PREVIEW_DEPLOYS" = "null" ] && fail "No deployment triggered"
wait_for_deployment "$PREVIEW_DEPLOYS" 90 || fail "Preview deployment failed"
log "Preview deployment running"

log "Testing PR synchronize updates environment name..."
NEW_PR_TITLE="Add OAuth Authentication"
NEW_PR_SHA="ghi789$(date +%s)"
PR_SYNC_PAYLOAD="{\"action\":\"synchronize\",\"number\":$PR_NUMBER,\"pull_request\":{\"title\":\"$NEW_PR_TITLE\",\"head\":{\"ref\":\"$PR_BRANCH\",\"sha\":\"$NEW_PR_SHA\"}},\"repository\":{\"clone_url\":\"https://github.com/elitan/frost.git\"},\"sender\":{\"login\":\"e2e-test\",\"avatar_url\":\"https://example.com/avatar.png\"}}"
PR_SYNC_RESULT=$(send_webhook "pull_request" "$PR_SYNC_PAYLOAD")
echo "$PR_SYNC_RESULT" | grep -q "Updated preview environment" || fail "PR sync should update preview. Got: $PR_SYNC_RESULT"

ENV_DATA_UPDATED=$(api "$BASE_URL/api/environments/$PREVIEW_ENV_ID")
ENV_NAME_UPDATED=$(json_get "$ENV_DATA_UPDATED" '.name')
[ "$ENV_NAME_UPDATED" = "add-oauth-authentication" ] || fail "Expected updated env name 'add-oauth-authentication', got: $ENV_NAME_UPDATED"
log "Environment name updated: $ENV_NAME_UPDATED"

log "Testing PR closed deletes environment..."
PR_CLOSED_PAYLOAD="{\"action\":\"closed\",\"number\":$PR_NUMBER,\"pull_request\":{\"title\":\"$NEW_PR_TITLE\",\"head\":{\"ref\":\"$PR_BRANCH\",\"sha\":\"$NEW_PR_SHA\"}},\"repository\":{\"clone_url\":\"https://github.com/elitan/frost.git\"},\"sender\":{\"login\":\"e2e-test\",\"avatar_url\":\"https://example.com/avatar.png\"}}"
PR_CLOSED_RESULT=$(send_webhook "pull_request" "$PR_CLOSED_PAYLOAD")
echo "$PR_CLOSED_RESULT" | grep -q "Deleted preview environment" || fail "PR closed should delete preview. Got: $PR_CLOSED_RESULT"
log "Preview environment deleted"

log "Verifying environment no longer exists..."
ENV_CHECK=$(api "$BASE_URL/api/environments/$PREVIEW_ENV_ID" 2>&1 || true)
echo "$ENV_CHECK" | grep -qE "(not found|NOT_FOUND|404)" || [ "$(echo "$ENV_CHECK" | jq -r '.id // empty')" = "" ] || fail "Environment should be deleted"
log "Environment correctly removed"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null
remote "sqlite3 $FROST_DATA_DIR/frost.db \"DELETE FROM settings WHERE key LIKE 'github_app_%';\"" || log "Warning: cleanup of settings failed"

pass
