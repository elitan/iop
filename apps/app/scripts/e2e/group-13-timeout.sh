#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Request Timeout ==="

log "Creating service..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-timeout"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"timeout-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

log "Updating with request timeout..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"requestTimeout":300}' > /dev/null

SERVICE_UPDATED=$(api "$BASE_URL/api/services/$SERVICE_ID")
REQUEST_TIMEOUT=$(json_get "$SERVICE_UPDATED" '.requestTimeout')
[ "$REQUEST_TIMEOUT" != "300" ] && fail "requestTimeout should be 300, got: $REQUEST_TIMEOUT"
log "Request timeout stored: $REQUEST_TIMEOUT"

log "Clearing request timeout..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" \
  -d '{"requestTimeout":null}' > /dev/null

SERVICE_CLEARED=$(api "$BASE_URL/api/services/$SERVICE_ID")
REQUEST_TIMEOUT_CLEARED=$(json_get "$SERVICE_CLEARED" '.requestTimeout')
[ "$REQUEST_TIMEOUT_CLEARED" != "null" ] && fail "requestTimeout should be null after clearing"
log "Request timeout cleared"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
