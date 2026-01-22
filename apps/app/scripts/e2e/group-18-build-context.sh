#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Build context (monorepo support) ==="

TEST_BRANCH="${E2E_BRANCH:-main}"
log "Using branch: $TEST_BRANCH"

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-buildctx"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"
log "Created project: $PROJECT_ID"

log "Creating monorepo service..."
SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d "{
    \"name\":\"monorepo-api\",
    \"deployType\":\"repo\",
    \"repoUrl\":\"https://github.com/elitan/frost.git\",
    \"branch\":\"$TEST_BRANCH\",
    \"dockerfilePath\":\"apps/app/test/fixtures/monorepo/apps/api/Dockerfile\",
    \"containerPort\":8080
  }")
SERVICE_ID=$(require_field "$SERVICE" '.id' "create monorepo service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

log "Getting auto-deployment..."
sleep 2
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOYMENT_ID=$(json_get "$DEPLOYS" '.[0].id // empty')
if [ -z "$DEPLOYMENT_ID" ] || [ "$DEPLOYMENT_ID" = "null" ]; then
  log "No auto-deployment, triggering manual..."
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOYMENT_ID=$(require_field "$DEPLOY" '.deploymentId' "trigger deploy") || fail "Failed to trigger deploy: $DEPLOY"
fi
log "Using deployment: $DEPLOYMENT_ID"

log "Waiting for deployment..."
wait_for_deployment "$DEPLOYMENT_ID" 120 || fail "Deployment failed"

log "Verifying service responds with shared content..."
DEPLOY_DATA=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID")
HOST_PORT=$(require_field "$DEPLOY_DATA" '.hostPort' "get hostPort") || fail "No hostPort: $DEPLOY_DATA"
RESPONSE=$(curl -sf "http://$SERVER_IP:$HOST_PORT" || echo "FAILED")
echo "$RESPONSE" | grep -q "monorepo-test" || fail "Response missing shared content: $RESPONSE"
log "Service responding with shared content on port $HOST_PORT"

log "Testing buildContext update..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"buildContext": "."}' > /dev/null

UPDATED_SERVICE=$(api "$BASE_URL/api/services/$SERVICE_ID")
BUILD_CTX=$(json_get "$UPDATED_SERVICE" '.buildContext')
[ "$BUILD_CTX" = "." ] || fail "buildContext not updated: $BUILD_CTX"
log "buildContext updated successfully"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
