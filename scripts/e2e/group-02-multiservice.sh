#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Multi-service networking ==="

log "Creating project with two services..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-multiservice"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
log "Created project: $PROJECT_ID"

BACKEND=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"backend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
BACKEND_ID=$(echo "$BACKEND" | jq -r '.id')
log "Created backend: $BACKEND_ID"

FRONTEND=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"frontend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
FRONTEND_ID=$(echo "$FRONTEND" | jq -r '.id')
log "Created frontend: $FRONTEND_ID"

log "Waiting for deployments..."
sleep 1
DEPLOY_BACKEND_ID=$(api "$BASE_URL/api/services/$BACKEND_ID/deployments" | jq -r '.[0].id')
DEPLOY_FRONTEND_ID=$(api "$BASE_URL/api/services/$FRONTEND_ID/deployments" | jq -r '.[0].id')
wait_for_deployment "$DEPLOY_BACKEND_ID" || fail "Backend deployment failed"
wait_for_deployment "$DEPLOY_FRONTEND_ID" || fail "Frontend deployment failed"

log "Verifying inter-service communication..."
NETWORK_NAME=$(sanitize_name "frost-net-$PROJECT_ID")
CURL_RESULT=$(remote "docker run --rm --network $NETWORK_NAME curlimages/curl -sf http://backend:80")
echo "$CURL_RESULT" | grep -q "nginx" || fail "Inter-service communication failed"
log "Inter-service communication works"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
