#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Deployment Race Conditions ==="

log "Creating service..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-race"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"race-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

sleep 1
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_INITIAL=$(require_field "$DEPLOYS" '.[0].id' "get initial deploy") || fail "No initial deployment: $DEPLOYS"
log "Waiting for initial deployment: $DEPLOY_INITIAL"
wait_for_deployment "$DEPLOY_INITIAL" || fail "Initial deployment failed"

log "Rapid double-deploy..."
DEPLOY_A=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_A_ID=$(require_field "$DEPLOY_A" '.deploymentId' "trigger deploy A") || fail "Failed to trigger deploy A: $DEPLOY_A"
log "First deploy: $DEPLOY_A_ID"

DEPLOY_B=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_B_ID=$(require_field "$DEPLOY_B" '.deploymentId' "trigger deploy B") || fail "Failed to trigger deploy B: $DEPLOY_B"
log "Second deploy: $DEPLOY_B_ID"

wait_for_deployment "$DEPLOY_B_ID" || fail "Second deployment failed"

DEPLOY_A_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY_A_ID")
STATUS_A=$(json_get "$DEPLOY_A_DATA" '.status')
[ "$STATUS_A" != "cancelled" ] && fail "First deployment should be cancelled, got: $STATUS_A"
log "First deployment correctly cancelled"

log "Verifying only one container running..."
CONTAINER_COUNT=$(remote "docker ps --filter 'label=frost.service.id=$SERVICE_ID' --format '{{.Names}}' | wc -l")
CONTAINER_COUNT=$(echo "$CONTAINER_COUNT" | tr -d ' ')
[ "$CONTAINER_COUNT" != "1" ] && fail "Expected 1 container, found: $CONTAINER_COUNT"
log "Exactly 1 container running"

log "Verifying container name format..."
CONTAINER_NAME=$(remote "docker ps --filter 'label=frost.service.id=$SERVICE_ID' --format '{{.Names}}'")
SERVICE_ID_SANITIZED=$(sanitize_name "$SERVICE_ID")
EXPECTED_PREFIX="frost-${SERVICE_ID_SANITIZED}-"
[[ "$CONTAINER_NAME" != $EXPECTED_PREFIX* ]] && fail "Container name should start with $EXPECTED_PREFIX, got: $CONTAINER_NAME"
log "Container name format correct"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
