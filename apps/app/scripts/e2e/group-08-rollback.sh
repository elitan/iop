#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Rollback ==="

log "Creating service and deploying twice..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-rollback"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"rollback-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

sleep 1
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_A_ID=$(require_field "$DEPLOYS" '.[0].id' "get first deploy") || fail "No first deployment: $DEPLOYS"
log "First deployment: $DEPLOY_A_ID"
wait_for_deployment "$DEPLOY_A_ID" || fail "First deployment failed"

DEPLOY_B=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_B_ID=$(require_field "$DEPLOY_B" '.deploymentId' "trigger second deploy") || fail "Failed to trigger second deploy: $DEPLOY_B"
log "Second deployment: $DEPLOY_B_ID"
wait_for_deployment "$DEPLOY_B_ID" || fail "Second deployment failed"

log "Verifying snapshot data..."
DEPLOY_B_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY_B_ID")
IMAGE_NAME=$(json_get "$DEPLOY_B_DATA" '.imageName')
ROLLBACK_ELIGIBLE=$(json_get "$DEPLOY_B_DATA" '.rollbackEligible')

[ "$IMAGE_NAME" = "null" ] || [ -z "$IMAGE_NAME" ] && fail "Deployment should have imageName. Data: $DEPLOY_B_DATA"
[ "$ROLLBACK_ELIGIBLE" != "1" ] && [ "$ROLLBACK_ELIGIBLE" != "true" ] && fail "Deployment should be rollback-eligible"
log "Deployment has snapshot data"

log "Rolling back to first deployment..."
ROLLBACK_RESULT=$(api -X POST "$BASE_URL/api/deployments/$DEPLOY_A_ID/rollback")
ROLLBACK_DEPLOY_ID=$(require_field "$ROLLBACK_RESULT" '.deploymentId' "rollback") || fail "Rollback failed: $ROLLBACK_RESULT"
[ "$ROLLBACK_DEPLOY_ID" != "$DEPLOY_A_ID" ] && fail "Rollback should reactivate same deployment"
log "Rollback reactivating: $ROLLBACK_DEPLOY_ID"

wait_for_deployment "$ROLLBACK_DEPLOY_ID" || fail "Rollback deployment failed"

SERVICE_UPDATED=$(api "$BASE_URL/api/services/$SERVICE_ID")
CURRENT_DEPLOY_ID=$(json_get "$SERVICE_UPDATED" '.currentDeploymentId')
[ "$CURRENT_DEPLOY_ID" != "$DEPLOY_A_ID" ] && fail "currentDeploymentId should be $DEPLOY_A_ID"
log "Service currentDeploymentId updated"

log "Verifying rollback service responds..."
ROLLBACK_DATA=$(api "$BASE_URL/api/deployments/$ROLLBACK_DEPLOY_ID")
HOST_PORT=$(require_field "$ROLLBACK_DATA" '.hostPort' "get rollback hostPort") || fail "No rollback hostPort: $ROLLBACK_DATA"
curl -sf "http://$SERVER_IP:$HOST_PORT" > /dev/null || fail "Rollback service not responding on port $HOST_PORT"
log "Rollback service responding"

log "Verifying rollback blocked for database services..."
SERVICE_DB=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"db-rollback-test","deployType":"database","templateId":"postgres"}')
SERVICE_DB_ID=$(require_field "$SERVICE_DB" '.id' "create db service") || fail "Failed to create db service: $SERVICE_DB"

sleep 2
DB_DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_DB_ID/deployments")
DEPLOY_DB_ID=$(require_field "$DB_DEPLOYS" '.[0].id' "get db deploy") || fail "No db deployment: $DB_DEPLOYS"
wait_for_deployment "$DEPLOY_DB_ID" 60 || fail "Database deployment failed"

ROLLBACK_DB_RESULT=$(curl -sS -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/deployments/$DEPLOY_DB_ID/rollback" -w "\n%{http_code}")
ROLLBACK_DB_STATUS=$(echo "$ROLLBACK_DB_RESULT" | tail -1)
[ "$ROLLBACK_DB_STATUS" != "400" ] && fail "Rollback should return 400 for database services"
log "Rollback correctly blocked for database"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
