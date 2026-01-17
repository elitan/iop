#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Template APIs ==="

log "Fetching all templates..."
ALL_TEMPLATES=$(api "$BASE_URL/api/templates")
TEMPLATE_COUNT=$(json_get "$ALL_TEMPLATES" 'length')
[ "$TEMPLATE_COUNT" -lt 1 ] && fail "Expected at least 1 template, got: $TEMPLATE_COUNT"
log "Total templates: $TEMPLATE_COUNT"

log "Fetching database templates..."
DB_TEMPLATES=$(api "$BASE_URL/api/templates/databases")
POSTGRES=$(json_get "$DB_TEMPLATES" '.[] | select(.id == "postgres") | .id')
[ "$POSTGRES" != "postgres" ] && fail "postgres template not found in database templates"
log "Database templates working"

log "Fetching service templates..."
SVC_TEMPLATES=$(api "$BASE_URL/api/templates/services")
NGINX=$(json_get "$SVC_TEMPLATES" '.[] | select(.id == "nginx") | .id')
[ "$NGINX" != "nginx" ] && fail "nginx template not found in service templates"
log "Service templates working"

log "Fetching project templates..."
PROJ_TEMPLATES=$(api "$BASE_URL/api/templates/projects")
PLAUSIBLE=$(json_get "$PROJ_TEMPLATES" '.[] | select(.id == "plausible") | .id')
[ "$PLAUSIBLE" != "plausible" ] && fail "plausible template not found in project templates"
log "Project templates working"

log "Verifying template structure..."
POSTGRES_TEMPLATE=$(json_get "$DB_TEMPLATES" '.[] | select(.id == "postgres")')
TEMPLATE_TYPE=$(echo "$POSTGRES_TEMPLATE" | jq -r '.type')
TEMPLATE_NAME=$(echo "$POSTGRES_TEMPLATE" | jq -r '.name')
SERVICES=$(echo "$POSTGRES_TEMPLATE" | jq -r '.services | keys | length')

[ "$TEMPLATE_TYPE" != "database" ] && fail "Expected type 'database', got: $TEMPLATE_TYPE"
[ "$TEMPLATE_NAME" != "PostgreSQL 17" ] && fail "Expected name 'PostgreSQL 17', got: $TEMPLATE_NAME"
[ "$SERVICES" != "1" ] && fail "Expected 1 service definition, got: $SERVICES"
log "Template structure valid"

log "Creating service from database template..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-template-test"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"testdb","deployType":"database","templateId":"redis"}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"

SERVICE_TYPE=$(json_get "$SERVICE" '.serviceType')
IMAGE_URL=$(json_get "$SERVICE" '.imageUrl')

[ "$SERVICE_TYPE" != "database" ] && fail "Service type should be 'database', got: $SERVICE_TYPE"
echo "$IMAGE_URL" | grep -q "redis" || fail "Image should contain 'redis', got: $IMAGE_URL"
log "Database template service created correctly"

log "Waiting for deployment..."
sleep 2
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_ID=$(require_field "$DEPLOYS" '.[0].id' "get deploy") || fail "No deployment: $DEPLOYS"
wait_for_deployment "$DEPLOY_ID" 60 || fail "Deployment failed"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
