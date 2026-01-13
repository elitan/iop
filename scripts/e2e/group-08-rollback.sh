#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Rollback ==="

log "Creating service and deploying twice..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-rollback"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"rollback-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
log "Created service: $SERVICE_ID"

sleep 1
DEPLOY_A_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id')
log "First deployment: $DEPLOY_A_ID"
wait_for_deployment "$DEPLOY_A_ID" || fail "First deployment failed"

DEPLOY_B=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_B_ID=$(echo "$DEPLOY_B" | jq -r '.deploymentId')
log "Second deployment: $DEPLOY_B_ID"
wait_for_deployment "$DEPLOY_B_ID" || fail "Second deployment failed"

log "Verifying snapshot data..."
DEPLOY_B_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY_B_ID")
IMAGE_NAME=$(echo "$DEPLOY_B_DATA" | jq -r '.imageName')
ROLLBACK_ELIGIBLE=$(echo "$DEPLOY_B_DATA" | jq -r '.rollbackEligible')

[ "$IMAGE_NAME" = "null" ] || [ -z "$IMAGE_NAME" ] && fail "Deployment should have imageName"
[ "$ROLLBACK_ELIGIBLE" != "1" ] && fail "Deployment should be rollback-eligible"
log "Deployment has snapshot data"

log "Rolling back to first deployment..."
ROLLBACK_RESULT=$(api -X POST "$BASE_URL/api/deployments/$DEPLOY_A_ID/rollback")
ROLLBACK_DEPLOY_ID=$(echo "$ROLLBACK_RESULT" | jq -r '.deploymentId')
[ "$ROLLBACK_DEPLOY_ID" = "null" ] || [ -z "$ROLLBACK_DEPLOY_ID" ] && fail "Rollback did not return deploymentId"
[ "$ROLLBACK_DEPLOY_ID" != "$DEPLOY_A_ID" ] && fail "Rollback should reactivate same deployment"
log "Rollback reactivating: $ROLLBACK_DEPLOY_ID"

wait_for_deployment "$ROLLBACK_DEPLOY_ID" || fail "Rollback deployment failed"

SERVICE_UPDATED=$(api "$BASE_URL/api/services/$SERVICE_ID")
CURRENT_DEPLOY_ID=$(echo "$SERVICE_UPDATED" | jq -r '.currentDeploymentId')
[ "$CURRENT_DEPLOY_ID" != "$DEPLOY_A_ID" ] && fail "currentDeploymentId should be $DEPLOY_A_ID"
log "Service currentDeploymentId updated"

log "Verifying rollback service responds..."
HOST_PORT=$(api "$BASE_URL/api/deployments/$ROLLBACK_DEPLOY_ID" | jq -r '.hostPort')
curl -sf "http://$SERVER_IP:$HOST_PORT" > /dev/null || fail "Rollback service not responding"
log "Rollback service responding"

log "Verifying rollback blocked for database services..."
SERVICE_DB=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"db-rollback-test","deployType":"database","templateId":"postgres-17"}')
SERVICE_DB_ID=$(echo "$SERVICE_DB" | jq -r '.id')

sleep 2
DEPLOY_DB_ID=$(api "$BASE_URL/api/services/$SERVICE_DB_ID/deployments" | jq -r '.[0].id')
wait_for_deployment "$DEPLOY_DB_ID" 60 || fail "Database deployment failed"

ROLLBACK_DB_RESULT=$(curl -sS -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/deployments/$DEPLOY_DB_ID/rollback" -w "\n%{http_code}")
ROLLBACK_DB_STATUS=$(echo "$ROLLBACK_DB_RESULT" | tail -1)
[ "$ROLLBACK_DB_STATUS" != "400" ] && fail "Rollback should return 400 for database services"
log "Rollback correctly blocked for database"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
