#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Zero-downtime deployment ==="

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-zero-downtime"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

log "Getting default environment..."
ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"

log "Creating service with nginx:alpine..."
SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"zd-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"drainTimeout":0}')
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
wait_for_deployment "$DEPLOY1_ID" || fail "v1 deployment failed"

log "Verifying v1 responds..."
DEPLOY1_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY1_ID")
HOST_PORT1=$(require_field "$DEPLOY1_DATA" '.hostPort' "get hostPort") || fail "Failed: $DEPLOY1_DATA"
curl -sf "http://$SERVER_IP:$HOST_PORT1" > /dev/null || fail "v1 not responding on port $HOST_PORT1"
log "v1 responding on port $HOST_PORT1"

log "Updating to httpd:alpine and deploying v2..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" -d '{"imageUrl":"httpd:alpine","containerPort":80}' > /dev/null
DEPLOY2=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY2_ID=$(require_field "$DEPLOY2" '.deploymentId' "trigger v2 deploy") || fail "Failed: $DEPLOY2"
wait_for_deployment "$DEPLOY2_ID" || fail "v2 deployment failed"

log "Verifying v2 responds..."
DEPLOY2_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY2_ID")
HOST_PORT2=$(require_field "$DEPLOY2_DATA" '.hostPort' "get hostPort") || fail "Failed: $DEPLOY2_DATA"
curl -sf "http://$SERVER_IP:$HOST_PORT2" > /dev/null || fail "v2 not responding on port $HOST_PORT2"
log "v2 responding on port $HOST_PORT2"

log "Verifying v1 deployment is stopped..."
sleep 2
DEPLOY1_STATUS=$(api "$BASE_URL/api/deployments/$DEPLOY1_ID")
V1_STATUS=$(json_get "$DEPLOY1_STATUS" '.status')
[ "$V1_STATUS" = "stopped" ] || fail "Expected v1 status 'stopped', got '$V1_STATUS'"
log "v1 status: $V1_STATUS"

log "Verifying v1 port no longer responds..."
if curl -sf --max-time 3 "http://$SERVER_IP:$HOST_PORT1" > /dev/null 2>&1; then
  fail "v1 port $HOST_PORT1 still responding (container should be stopped)"
fi
log "v1 port $HOST_PORT1 no longer responds"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
