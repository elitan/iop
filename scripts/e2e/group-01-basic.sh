#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Basic project/service/deployment ==="

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-basic"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
[ "$PROJECT_ID" = "null" ] || [ -z "$PROJECT_ID" ] && fail "Failed to create project"
log "Created project: $PROJECT_ID"

log "Creating service (auto-deploys)..."
SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"test-nginx","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
[ "$SERVICE_ID" = "null" ] || [ -z "$SERVICE_ID" ] && fail "Failed to create service"
log "Created service: $SERVICE_ID"

log "Getting auto-deployment..."
sleep 1
DEPLOYMENT_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id // empty')
if [ -z "$DEPLOYMENT_ID" ]; then
  log "No auto-deployment, triggering manual..."
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOYMENT_ID=$(echo "$DEPLOY" | jq -r '.deploymentId')
fi
[ "$DEPLOYMENT_ID" = "null" ] || [ -z "$DEPLOYMENT_ID" ] && fail "Failed to get deployment"
log "Using deployment: $DEPLOYMENT_ID"

log "Waiting for deployment..."
wait_for_deployment "$DEPLOYMENT_ID" || fail "Deployment failed"

log "Verifying service responds..."
HOST_PORT=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq -r '.hostPort')
curl -sf "http://$SERVER_IP:$HOST_PORT" > /dev/null || fail "Service not responding"
log "Service responding on port $HOST_PORT"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
