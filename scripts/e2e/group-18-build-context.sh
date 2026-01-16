#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Build context (monorepo support) ==="

TEST_BRANCH="${E2E_BRANCH:-main}"
log "Using branch: $TEST_BRANCH"

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-buildctx"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
[ "$PROJECT_ID" = "null" ] || [ -z "$PROJECT_ID" ] && fail "Failed to create project"
log "Created project: $PROJECT_ID"

log "Creating monorepo service..."
SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d "{
    \"name\":\"monorepo-api\",
    \"deployType\":\"repo\",
    \"repoUrl\":\"https://github.com/elitan/frost.git\",
    \"branch\":\"$TEST_BRANCH\",
    \"dockerfilePath\":\"test/fixtures/monorepo/apps/api/Dockerfile\",
    \"containerPort\":8080
  }")
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
[ "$SERVICE_ID" = "null" ] || [ -z "$SERVICE_ID" ] && fail "Failed to create service"
log "Created service: $SERVICE_ID"

log "Getting auto-deployment..."
sleep 2
DEPLOYMENT_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id // empty')
if [ -z "$DEPLOYMENT_ID" ]; then
  log "No auto-deployment, triggering manual..."
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOYMENT_ID=$(echo "$DEPLOY" | jq -r '.deploymentId')
fi
[ "$DEPLOYMENT_ID" = "null" ] || [ -z "$DEPLOYMENT_ID" ] && fail "Failed to get deployment"
log "Using deployment: $DEPLOYMENT_ID"

log "Waiting for deployment..."
wait_for_deployment "$DEPLOYMENT_ID" 120 || fail "Deployment failed"

log "Verifying service responds with shared content..."
HOST_PORT=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq -r '.hostPort')
RESPONSE=$(curl -sf "http://$SERVER_IP:$HOST_PORT" || echo "FAILED")
echo "$RESPONSE" | grep -q "monorepo-test" || fail "Response missing shared content: $RESPONSE"
log "Service responding with shared content on port $HOST_PORT"

log "Testing buildContext update..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"buildContext": "."}' > /dev/null

UPDATED_SERVICE=$(api "$BASE_URL/api/services/$SERVICE_ID")
BUILD_CTX=$(echo "$UPDATED_SERVICE" | jq -r '.buildContext')
[ "$BUILD_CTX" = "." ] || fail "buildContext not updated: $BUILD_CTX"
log "buildContext updated successfully"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
