#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Health Check Config ==="

log "Creating service with HTTP health check..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-healthcheck"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"health-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"healthCheckPath":"/","healthCheckTimeout":30}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
HEALTH_PATH=$(json_get "$SERVICE" '.healthCheckPath')
HEALTH_TIMEOUT=$(json_get "$SERVICE" '.healthCheckTimeout')

[ "$HEALTH_PATH" != "/" ] && fail "healthCheckPath should be '/'"
[ "$HEALTH_TIMEOUT" != "30" ] && fail "healthCheckTimeout should be 30"
log "Created with HTTP health check: path=$HEALTH_PATH, timeout=$HEALTH_TIMEOUT"

log "Waiting for deployment..."
sleep 1
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_ID=$(require_field "$DEPLOYS" '.[0].id' "get deploy") || fail "No deployment: $DEPLOYS"
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

DEPLOY_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY_ID")
BUILD_LOG=$(json_get "$DEPLOY_DATA" '.buildLog')
echo "$BUILD_LOG" | grep -q "Health check (HTTP /)" || fail "Expected 'Health check (HTTP /)' in build log"
log "HTTP health check logged"

log "Updating to TCP health check..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"healthCheckPath":null,"healthCheckTimeout":45}' > /dev/null

SERVICE_UPDATED=$(api "$BASE_URL/api/services/$SERVICE_ID")
HEALTH_PATH_UPDATED=$(json_get "$SERVICE_UPDATED" '.healthCheckPath')
HEALTH_TIMEOUT_UPDATED=$(json_get "$SERVICE_UPDATED" '.healthCheckTimeout')

[ "$HEALTH_PATH_UPDATED" != "null" ] && fail "healthCheckPath should be null"
[ "$HEALTH_TIMEOUT_UPDATED" != "45" ] && fail "healthCheckTimeout should be 45"
log "Updated to TCP health check"

log "Redeploying..."
DEPLOY2=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY2_ID=$(require_field "$DEPLOY2" '.deploymentId' "trigger redeploy") || fail "Failed to trigger redeploy: $DEPLOY2"
wait_for_deployment "$DEPLOY2_ID" || fail "Redeploy failed"

DEPLOY2_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY2_ID")
BUILD_LOG2=$(json_get "$DEPLOY2_DATA" '.buildLog')
echo "$BUILD_LOG2" | grep -q "Health check (TCP)" || fail "Expected 'Health check (TCP)' in build log"
log "TCP health check logged"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
