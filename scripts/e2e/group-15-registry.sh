#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Registry Tests ==="

log "Creating registry with invalid creds (should fail)..."
REGISTRY_FAIL_RESPONSE=$(curl -sS -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/registries" \
  -d '{"name":"bad-test","type":"dockerhub","username":"invalid-user-xyz-e2e","password":"invalid"}' \
  -w "\n%{http_code}")
REGISTRY_STATUS=$(echo "$REGISTRY_FAIL_RESPONSE" | tail -1)
[ "$REGISTRY_STATUS" != "400" ] && fail "Invalid creds should return 400, got: $REGISTRY_STATUS"
log "Invalid credentials correctly rejected"

log "Listing registries (should be empty)..."
REGISTRIES=$(api "$BASE_URL/api/registries")
REGISTRIES_COUNT=$(echo "$REGISTRIES" | jq 'length')
[ "$REGISTRIES_COUNT" != "0" ] && fail "Expected empty registries list, got $REGISTRIES_COUNT"
log "Registries list empty"

log "Creating service with registryId field..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-registry"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
[ "$PROJECT_ID" = "null" ] || [ -z "$PROJECT_ID" ] && fail "Failed to create project"
log "Created project: $PROJECT_ID"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"reg-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
[ "$SERVICE_ID" = "null" ] || [ -z "$SERVICE_ID" ] && fail "Failed to create service"
REGISTRY_ID=$(echo "$SERVICE" | jq -r '.registryId')
[ "$REGISTRY_ID" != "null" ] && fail "registryId should be null, got: $REGISTRY_ID"
log "Service registryId field exists and is null"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
