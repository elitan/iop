#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Graceful shutdown on redeploy ==="

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-graceful"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

log "Getting default environment..."
ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"

log "Creating service with graceful-app fixture..."
SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d "{\"name\":\"graceful-test\",\"deployType\":\"repo\",\"repoUrl\":\"./test/fixtures/graceful-app\",\"containerPort\":8080,\"drainTimeout\":0,\"shutdownTimeout\":10}")
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

log "Waiting for v1 deployment..."
sleep 1
DEPLOYMENTS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY1_ID=$(json_get "$DEPLOYMENTS" '.[0].id // empty')
if [ -z "$DEPLOY1_ID" ] || [ "$DEPLOY1_ID" = "null" ]; then
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOY1_ID=$(require_field "$DEPLOY" '.deploymentId' "trigger deploy") || fail "Failed: $DEPLOY"
fi
wait_for_deployment "$DEPLOY1_ID" 120 || fail "v1 deployment failed"

log "Getting v1 container ID..."
DEPLOY1_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY1_ID")
CONTAINER1_ID=$(require_field "$DEPLOY1_DATA" '.containerId' "get containerId") || fail "Failed: $DEPLOY1_DATA"
log "v1 container: ${CONTAINER1_ID:0:12}"

log "Redeploying..."
DEPLOY2=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY2_ID=$(require_field "$DEPLOY2" '.deploymentId' "trigger v2 deploy") || fail "Failed: $DEPLOY2"
wait_for_deployment "$DEPLOY2_ID" 120 || fail "v2 deployment failed"

log "Checking old container logs for SIGTERM..."
sleep 2
LOGS=$(remote "docker logs $CONTAINER1_ID 2>&1" 2>/dev/null || echo "")
if echo "$LOGS" | grep -q "SIGTERM received"; then
  log "Found 'SIGTERM received' in old container logs"
else
  fail "Expected 'SIGTERM received' in container logs, got: $LOGS"
fi

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
