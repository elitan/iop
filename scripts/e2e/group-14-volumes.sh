#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== User-Configurable Volumes ==="

log "Creating service..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-volumes"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"volume-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
log "Created service: $SERVICE_ID"

log "Adding volume..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"volumes":[{"name":"data","path":"/data"}]}' > /dev/null

SERVICE_UPDATED=$(api "$BASE_URL/api/services/$SERVICE_ID")
VOLUMES_JSON=$(echo "$SERVICE_UPDATED" | jq -r '.volumes')
echo "$VOLUMES_JSON" | grep -q '"path":"/data"' || fail "Volume not added"
log "Volume added"

log "Deploying and verifying volume created..."
DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_ID=$(echo "$DEPLOY" | jq -r '.deploymentId')
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

EXPECTED_VOLUME="frost-${SERVICE_ID}-data"
VOLUME_EXISTS=$(remote "docker volume ls --filter name=$EXPECTED_VOLUME --format '{{.Name}}'" 2>&1)
echo "$VOLUME_EXISTS" | grep -q "$EXPECTED_VOLUME" || fail "Volume not created"
log "Volume created: $EXPECTED_VOLUME"

BUILD_LOG=$(api "$BASE_URL/api/deployments/$DEPLOY_ID" | jq -r '.buildLog')
echo "$BUILD_LOG" | grep -q "Created 1 volume(s)" || fail "Volume creation not logged"
log "Volume creation logged"

log "Writing file and verifying persistence..."
CONTAINER_NAME=$(get_container_name "$SERVICE_ID" "$DEPLOY_ID")
remote "docker exec $CONTAINER_NAME sh -c 'echo test-content > /data/test.txt'"
FILE_CONTENT=$(remote "docker exec $CONTAINER_NAME cat /data/test.txt")
[ "$FILE_CONTENT" != "test-content" ] && fail "Could not write to volume"
log "File written"

DEPLOY2=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY2_ID=$(echo "$DEPLOY2" | jq -r '.deploymentId')
wait_for_deployment "$DEPLOY2_ID" || fail "Second deployment failed"

CONTAINER2_NAME=$(get_container_name "$SERVICE_ID" "$DEPLOY2_ID")
FILE_AFTER=$(remote "docker exec $CONTAINER2_NAME cat /data/test.txt")
[ "$FILE_AFTER" != "test-content" ] && fail "File did not persist"
log "File persisted across redeploy"

log "Testing getVolumes API..."
VOLUMES_INFO=$(api "$BASE_URL/api/services/$SERVICE_ID/volumes")
VOLUME_PATH=$(echo "$VOLUMES_INFO" | jq -r '.[0].path')
[ "$VOLUME_PATH" != "/data" ] && fail "getVolumes returned wrong path"
log "getVolumes endpoint works"

log "Deleting service and verifying volume cleanup..."
api -X DELETE "$BASE_URL/api/services/$SERVICE_ID" > /dev/null
sleep 2

VOLUME_AFTER=$(remote "docker volume ls --filter name=$EXPECTED_VOLUME --format '{{.Name}}'" 2>&1)
echo "$VOLUME_AFTER" | grep -q "$EXPECTED_VOLUME" && fail "Volume should have been deleted"
log "Volume deleted with service"

api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
