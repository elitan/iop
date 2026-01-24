#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Hostname uniqueness ==="

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-hostname"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"
log "Created project: $PROJECT_ID"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

log "Creating first service 'My App'..."
SERVICE1=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"My App","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE1_ID=$(require_field "$SERVICE1" '.id' "create service1") || fail "Failed to create service1: $SERVICE1"
SERVICE1_HOSTNAME=$(require_field "$SERVICE1" '.hostname' "get hostname1") || fail "No hostname: $SERVICE1"
log "Created service1: $SERVICE1_ID (hostname: $SERVICE1_HOSTNAME)"

[ "$SERVICE1_HOSTNAME" = "my-app" ] || fail "Expected hostname 'my-app', got '$SERVICE1_HOSTNAME'"

log "Creating second service with conflicting name 'my-app' (should fail)..."
SERVICE2=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"my-app","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}' 2>&1)
if echo "$SERVICE2" | grep -qi "conflict\|already exists"; then
  log "Correctly rejected conflicting hostname"
else
  fail "Should have rejected conflicting hostname: $SERVICE2"
fi

log "Creating service with explicit hostname..."
SERVICE3=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"my-app","hostname":"my-app-2","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE3_ID=$(require_field "$SERVICE3" '.id' "create service3") || fail "Failed to create service3: $SERVICE3"
SERVICE3_HOSTNAME=$(require_field "$SERVICE3" '.hostname' "get hostname3") || fail "No hostname: $SERVICE3"
log "Created service3: $SERVICE3_ID (hostname: $SERVICE3_HOSTNAME)"

[ "$SERVICE3_HOSTNAME" = "my-app-2" ] || fail "Expected hostname 'my-app-2', got '$SERVICE3_HOSTNAME'"

log "Updating service3 hostname to conflict (should fail)..."
UPDATE=$(api -X PATCH "$BASE_URL/api/services/$SERVICE3_ID" \
  -d '{"hostname":"my-app"}' 2>&1)
if echo "$UPDATE" | grep -qi "conflict\|already exists"; then
  log "Correctly rejected conflicting hostname update"
else
  fail "Should have rejected conflicting hostname update: $UPDATE"
fi

log "Waiting for deployments..."
sleep 1
DEPLOYS1=$(api "$BASE_URL/api/services/$SERVICE1_ID/deployments")
DEPLOY1_ID=$(require_field "$DEPLOYS1" '.[0].id' "get deploy1") || fail "No deployment: $DEPLOYS1"
DEPLOYS3=$(api "$BASE_URL/api/services/$SERVICE3_ID/deployments")
DEPLOY3_ID=$(require_field "$DEPLOYS3" '.[0].id' "get deploy3") || fail "No deployment: $DEPLOYS3"
wait_for_deployment "$DEPLOY1_ID" || fail "Deployment 1 failed"
wait_for_deployment "$DEPLOY3_ID" || fail "Deployment 3 failed"

log "Verifying inter-service communication with both hostnames..."
NETWORK_NAME=$(sanitize_name "frost-net-$PROJECT_ID-$ENV_ID")
CURL1=$(remote "docker run --rm --network $NETWORK_NAME curlimages/curl -sf http://my-app:80")
echo "$CURL1" | grep -q "nginx" || fail "Cannot reach my-app"
CURL2=$(remote "docker run --rm --network $NETWORK_NAME curlimages/curl -sf http://my-app-2:80")
echo "$CURL2" | grep -q "nginx" || fail "Cannot reach my-app-2"
log "Both hostnames resolve correctly"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
