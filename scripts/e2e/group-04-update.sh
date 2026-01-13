#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Service update + redeploy ==="

log "Creating project and service..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-update"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
log "Created project: $PROJECT_ID"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"updatetest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
log "Created service: $SERVICE_ID"

log "Waiting for v1 deployment..."
sleep 1
DEPLOY_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id')
wait_for_deployment "$DEPLOY_ID" || fail "v1 deployment failed"

HOST_PORT=$(api "$BASE_URL/api/deployments/$DEPLOY_ID" | jq -r '.hostPort')
RESPONSE1=$(curl -sf "http://$SERVER_IP:$HOST_PORT")
echo "$RESPONSE1" | grep -q "nginx" || fail "v1 not responding correctly"
log "v1 (nginx) deployed"

log "Updating to httpd and redeploying..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"imageUrl":"httpd:alpine","containerPort":80}' > /dev/null

DEPLOY2=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY2_ID=$(echo "$DEPLOY2" | jq -r '.deploymentId')
wait_for_deployment "$DEPLOY2_ID" || fail "v2 deployment failed"

HOST_PORT2=$(api "$BASE_URL/api/deployments/$DEPLOY2_ID" | jq -r '.hostPort')
RESPONSE2=$(curl -sf "http://$SERVER_IP:$HOST_PORT2")
echo "$RESPONSE2" | grep -q "It works" || fail "v2 not responding correctly"
log "v2 (httpd) deployed"

OLD_STATUS=$(api "$BASE_URL/api/deployments/$DEPLOY_ID" | jq -r '.status')
[ "$OLD_STATUS" != "running" ] && log "Old deployment stopped (status: $OLD_STATUS)"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
