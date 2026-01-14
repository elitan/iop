#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Env var inheritance ==="

log "Creating project with env vars..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" \
  -d '{"name":"e2e-envtest","envVars":[{"key":"SHARED","value":"from-project"},{"key":"PROJECT_ONLY","value":"proj-val"}]}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
log "Created project: $PROJECT_ID"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"envcheck","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"envVars":[{"key":"SHARED","value":"from-service"},{"key":"SERVICE_ONLY","value":"svc-val"}]}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
log "Created service: $SERVICE_ID"

log "Waiting for deployment..."
sleep 1
DEPLOY_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id')
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

log "Verifying env vars..."
CONTAINER_NAME=$(get_container_name "$SERVICE_ID" "$DEPLOY_ID")
SHARED_VAL=$(remote "docker exec $CONTAINER_NAME printenv SHARED")
PROJECT_ONLY_VAL=$(remote "docker exec $CONTAINER_NAME printenv PROJECT_ONLY")
SERVICE_ONLY_VAL=$(remote "docker exec $CONTAINER_NAME printenv SERVICE_ONLY")

[ "$SHARED_VAL" = "from-service" ] || fail "SHARED should be 'from-service', got '$SHARED_VAL'"
[ "$PROJECT_ONLY_VAL" = "proj-val" ] || fail "PROJECT_ONLY should be 'proj-val'"
[ "$SERVICE_ONLY_VAL" = "svc-val" ] || fail "SERVICE_ONLY should be 'svc-val'"
log "Env var inheritance verified"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
