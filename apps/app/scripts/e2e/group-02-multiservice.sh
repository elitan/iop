#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Multi-service networking ==="

log "Creating project with two services..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-multiservice"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"
log "Created project: $PROJECT_ID"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

BACKEND=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"backend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
BACKEND_ID=$(require_field "$BACKEND" '.id' "create backend") || fail "Failed to create backend: $BACKEND"
log "Created backend: $BACKEND_ID"

FRONTEND=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"frontend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
FRONTEND_ID=$(require_field "$FRONTEND" '.id' "create frontend") || fail "Failed to create frontend: $FRONTEND"
log "Created frontend: $FRONTEND_ID"

log "Waiting for deployments..."
sleep 1
BACKEND_DEPLOYS=$(api "$BASE_URL/api/services/$BACKEND_ID/deployments")
DEPLOY_BACKEND_ID=$(require_field "$BACKEND_DEPLOYS" '.[0].id' "get backend deploy") || fail "No backend deployment: $BACKEND_DEPLOYS"
FRONTEND_DEPLOYS=$(api "$BASE_URL/api/services/$FRONTEND_ID/deployments")
DEPLOY_FRONTEND_ID=$(require_field "$FRONTEND_DEPLOYS" '.[0].id' "get frontend deploy") || fail "No frontend deployment: $FRONTEND_DEPLOYS"
wait_for_deployment "$DEPLOY_BACKEND_ID" || fail "Backend deployment failed"
wait_for_deployment "$DEPLOY_FRONTEND_ID" || fail "Frontend deployment failed"

log "Verifying inter-service communication..."
NETWORK_NAME=$(sanitize_name "frost-net-$PROJECT_ID-$ENV_ID")
CURL_RESULT=$(remote "docker run --rm --network $NETWORK_NAME curlimages/curl -sf http://backend:80")
echo "$CURL_RESULT" | grep -q "nginx" || fail "Inter-service communication failed"
log "Inter-service communication works"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
