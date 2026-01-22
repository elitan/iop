#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Basic project/service/deployment ==="

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-basic"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"
log "Created project: $PROJECT_ID"

log "Getting default environment..."
ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

log "Creating service (auto-deploys)..."
SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"test-nginx","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

log "Getting auto-deployment..."
sleep 1
DEPLOYMENTS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOYMENT_ID=$(json_get "$DEPLOYMENTS" '.[0].id // empty')
if [ -z "$DEPLOYMENT_ID" ] || [ "$DEPLOYMENT_ID" = "null" ]; then
  log "No auto-deployment, triggering manual..."
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOYMENT_ID=$(require_field "$DEPLOY" '.deploymentId' "trigger deploy") || fail "Failed to trigger deploy: $DEPLOY"
fi
log "Using deployment: $DEPLOYMENT_ID"

log "Waiting for deployment..."
wait_for_deployment "$DEPLOYMENT_ID" || fail "Deployment failed"

log "Verifying service responds..."
DEPLOYMENT_DATA=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID")
HOST_PORT=$(require_field "$DEPLOYMENT_DATA" '.hostPort' "get hostPort") || fail "Failed to get hostPort: $DEPLOYMENT_DATA"
curl -sf "http://$SERVER_IP:$HOST_PORT" > /dev/null || fail "Service not responding on port $HOST_PORT"
log "Service responding on port $HOST_PORT"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
