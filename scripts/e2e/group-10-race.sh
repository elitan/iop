#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Deployment Race Conditions ==="

log "Creating service..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-race"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"race-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
[ "$SERVICE_ID" = "null" ] || [ -z "$SERVICE_ID" ] && fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

sleep 1
DEPLOY_INITIAL=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id')
log "Waiting for initial deployment: $DEPLOY_INITIAL"
wait_for_deployment "$DEPLOY_INITIAL" || fail "Initial deployment failed"

log "Rapid double-deploy..."
DEPLOY_A=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_A_ID=$(echo "$DEPLOY_A" | jq -r '.deploymentId')
log "First deploy: $DEPLOY_A_ID"

DEPLOY_B=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_B_ID=$(echo "$DEPLOY_B" | jq -r '.deploymentId')
log "Second deploy: $DEPLOY_B_ID"

wait_for_deployment "$DEPLOY_B_ID" || fail "Second deployment failed"

STATUS_A=$(api "$BASE_URL/api/deployments/$DEPLOY_A_ID" | jq -r '.status')
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
