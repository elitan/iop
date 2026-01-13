#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== FROST_* Environment Variables ==="

log "Creating service..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-frost-env"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"frost-env-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
log "Created service: $SERVICE_ID"

sleep 1
DEPLOY_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id')
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

CONTAINER_NAME=$(get_container_name "$SERVICE_ID" "$DEPLOY_ID")

log "Verifying FROST_* vars..."
FROST_VAL=$(remote "docker exec $CONTAINER_NAME printenv FROST")
FROST_SERVICE_NAME=$(remote "docker exec $CONTAINER_NAME printenv FROST_SERVICE_NAME")
FROST_SERVICE_ID=$(remote "docker exec $CONTAINER_NAME printenv FROST_SERVICE_ID")
FROST_PROJECT_NAME=$(remote "docker exec $CONTAINER_NAME printenv FROST_PROJECT_NAME")
FROST_PROJECT_ID=$(remote "docker exec $CONTAINER_NAME printenv FROST_PROJECT_ID")
FROST_DEPLOYMENT_ID=$(remote "docker exec $CONTAINER_NAME printenv FROST_DEPLOYMENT_ID")
FROST_INTERNAL_HOSTNAME=$(remote "docker exec $CONTAINER_NAME printenv FROST_INTERNAL_HOSTNAME")

[ "$FROST_VAL" != "1" ] && fail "FROST should be '1'"
[ "$FROST_SERVICE_NAME" != "frost-env-test" ] && fail "FROST_SERVICE_NAME wrong"
[ "$FROST_SERVICE_ID" != "$SERVICE_ID" ] && fail "FROST_SERVICE_ID wrong"
[ "$FROST_PROJECT_NAME" != "e2e-frost-env" ] && fail "FROST_PROJECT_NAME wrong"
[ "$FROST_PROJECT_ID" != "$PROJECT_ID" ] && fail "FROST_PROJECT_ID wrong"
[ "$FROST_DEPLOYMENT_ID" != "$DEPLOY_ID" ] && fail "FROST_DEPLOYMENT_ID wrong"
[ "$FROST_INTERNAL_HOSTNAME" != "frost-env-test" ] && fail "FROST_INTERNAL_HOSTNAME wrong"
log "Core FROST_* vars verified"

log "Verifying git vars NOT present for image deploys..."
FROST_GIT_SHA=$(remote "docker exec $CONTAINER_NAME printenv FROST_GIT_COMMIT_SHA" 2>&1 || echo "")
FROST_GIT_BRANCH=$(remote "docker exec $CONTAINER_NAME printenv FROST_GIT_BRANCH" 2>&1 || echo "")
[ -n "$FROST_GIT_SHA" ] && fail "FROST_GIT_COMMIT_SHA should not exist"
[ -n "$FROST_GIT_BRANCH" ] && fail "FROST_GIT_BRANCH should not exist"
log "Git vars correctly absent"

log "Verifying user env vars can override FROST_*..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"envVars":[{"key":"FROST_SERVICE_NAME","value":"custom-name"}]}' > /dev/null
DEPLOY2=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY2_ID=$(echo "$DEPLOY2" | jq -r '.deploymentId')
wait_for_deployment "$DEPLOY2_ID" || fail "Redeploy failed"

CONTAINER2_NAME=$(get_container_name "$SERVICE_ID" "$DEPLOY2_ID")
CUSTOM_NAME=$(remote "docker exec $CONTAINER2_NAME printenv FROST_SERVICE_NAME")
[ "$CUSTOM_NAME" != "custom-name" ] && fail "User should be able to override FROST_* vars"
log "User env var override works"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
