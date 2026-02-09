#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

TEST_BRANCH="${E2E_BRANCH:-main}"

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

log "=== Service Template (nginx) ==="

log "Creating nginx from service template..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-svc-template"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"nginx","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create nginx") || fail "Failed: $SERVICE"

log "Waiting for nginx deployment..."
DEPLOY_ID=$(wait_for_service_deployment_id "$SERVICE_ID" 30 1) || fail "No deployment found for nginx service"
wait_for_deployment "$DEPLOY_ID" 60 || fail "nginx deployment failed"

log "Verifying nginx responds..."
DEPLOY_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY_ID")
HOST_PORT=$(require_field "$DEPLOY_DATA" '.hostPort' "get hostPort") || fail "No hostPort"
NGINX_RESP=$(remote "curl -sf http://localhost:$HOST_PORT/" 2>&1 || echo "failed")
echo "$NGINX_RESP" | grep -qi "nginx\|welcome\|DOCTYPE" || fail "nginx not responding: $NGINX_RESP"
log "nginx responding on port $HOST_PORT"

api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null
log "Cleaned up nginx test"

log "=== Database + App Integration ==="

log "Creating project with postgres + app..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-db-app"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

log "Adding postgres from template..."
DB_SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"postgres","deployType":"database","templateId":"postgres"}')
DB_SERVICE_ID=$(require_field "$DB_SERVICE" '.id' "create postgres") || fail "Failed: $DB_SERVICE"

log "Extracting postgres credentials..."
DB_ENVVARS=$(json_get "$DB_SERVICE" '.envVars')
PG_USER=$(echo "$DB_ENVVARS" | jq -r '.[] | select(.key == "POSTGRES_USER") | .value')
PG_PASS=$(echo "$DB_ENVVARS" | jq -r '.[] | select(.key == "POSTGRES_PASSWORD") | .value')
PG_DB=$(echo "$DB_ENVVARS" | jq -r '.[] | select(.key == "POSTGRES_DB") | .value')
[ -z "$PG_PASS" ] && fail "POSTGRES_PASSWORD not generated"
log "Credentials generated (pw length: ${#PG_PASS})"

log "Waiting for postgres..."
DB_DEPLOY_ID=$(wait_for_service_deployment_id "$DB_SERVICE_ID" 45 1) || fail "No deployment found for postgres service"
wait_for_deployment "$DB_DEPLOY_ID" 90 || fail "postgres deployment failed"

log "Verifying postgres is ready..."
DB_DEPLOY=$(api "$BASE_URL/api/deployments/$DB_DEPLOY_ID")
DB_HOST_PORT=$(require_field "$DB_DEPLOY" '.hostPort' "get db hostPort") || fail "No hostPort"
DB_CONTAINER_ID=$(json_get "$DB_DEPLOY" '.containerId')
log "Postgres container: $DB_CONTAINER_ID"
PG_READY=$(remote "timeout 30 bash -c 'until pg_isready -h localhost -p $DB_HOST_PORT; do sleep 1; done' && echo 'ready'" 2>&1 || echo "not ready")
echo "$PG_READY" | grep -q "ready" || fail "postgres not ready"
log "postgres ready on port $DB_HOST_PORT"

log "Checking postgres container state..."
PG_STATE=$(remote "docker inspect $DB_CONTAINER_ID --format '{{.State.Status}}'" 2>&1 || echo "unknown")
log "Postgres state: $PG_STATE"
if [ "$PG_STATE" != "running" ]; then
  log "Postgres container is not running! Logs:"
  remote "docker logs $DB_CONTAINER_ID 2>&1 | tail -30" || true
  fail "Postgres container exited unexpectedly"
fi
log "Checking postgres network aliases..."
remote "docker inspect $DB_CONTAINER_ID --format '{{json .NetworkSettings.Networks}}'" || true

log "Adding app service from test fixture..."
APP_SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d "{\"name\":\"app\",\"deployType\":\"repo\",\"repoUrl\":\"https://github.com/elitan/frost.git\",\"branch\":\"$TEST_BRANCH\",\"dockerfilePath\":\"apps/app/test/fixtures/db-health-check/Dockerfile.repo\",\"containerPort\":8080,\"envVars\":[{\"key\":\"DATABASE_URL\",\"value\":\"postgresql://$PG_USER:$PG_PASS@postgres:5432/$PG_DB\"}]}")
APP_SERVICE_ID=$(require_field "$APP_SERVICE" '.id' "create app") || fail "Failed: $APP_SERVICE"

log "Waiting for app deployment..."
APP_DEPLOY_ID=$(wait_for_service_deployment_id "$APP_SERVICE_ID" 45 1) || fail "No deployment found for app service"
wait_for_deployment "$APP_DEPLOY_ID" 120 || fail "app deployment failed"

log "Verifying app can connect to database..."
APP_DEPLOY=$(api "$BASE_URL/api/deployments/$APP_DEPLOY_ID")
APP_HOST_PORT=$(require_field "$APP_DEPLOY" '.hostPort' "get app hostPort") || fail "No hostPort"
APP_CONTAINER_ID=$(json_get "$APP_DEPLOY" '.containerId')
log "App container: $APP_CONTAINER_ID on port $APP_HOST_PORT"

CONTAINER_STATUS=$(remote "docker inspect $APP_CONTAINER_ID --format '{{.State.Status}}'" 2>&1 || echo "unknown")
log "Container status: $CONTAINER_STATUS"

if [ "$CONTAINER_STATUS" != "running" ]; then
  log "Container logs:"
  remote "docker logs $APP_CONTAINER_ID 2>&1 | tail -20" || true
  fail "App container not running: $CONTAINER_STATUS"
fi

log "Checking root endpoint first..."
ROOT_RESP=$(remote "curl -sf --max-time 5 http://localhost:$APP_HOST_PORT/" 2>&1 || echo "curl failed")
log "Root response: $ROOT_RESP"

log "Checking health endpoint..."
HEALTH_RESP="{}"
HEALTH_STATUS="error"
for _ in $(seq 1 12); do
  HEALTH_RESP=$(remote "curl -sf --max-time 5 http://localhost:$APP_HOST_PORT/health" 2>&1 || echo "{}")
  HEALTH_STATUS=$(echo "$HEALTH_RESP" | jq -r '.status' 2>/dev/null || echo "error")
  if [ "$HEALTH_STATUS" = "ok" ]; then
    break
  fi
  sleep 1
done
if [ "$HEALTH_STATUS" != "ok" ]; then
  log "Health check failed, container logs:"
  remote "docker logs $APP_CONTAINER_ID 2>&1 | tail -30" || true
  log "Checking app network..."
  remote "docker inspect $APP_CONTAINER_ID --format '{{json .NetworkSettings.Networks}}'" || true
  log "Checking postgres state..."
  remote "docker inspect $DB_CONTAINER_ID --format '{{.State.Status}} {{.State.Running}}'" || true
  log "Checking postgres network..."
  remote "docker inspect $DB_CONTAINER_ID --format '{{json .NetworkSettings.Networks}}'" || true
  log "Listing all containers on network..."
  SANITIZED_NET=$(echo "frost-net-$PROJECT_ID-$ENV_ID" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9.-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g')
  remote "docker network inspect $SANITIZED_NET --format '{{json .Containers}}'" || true
  log "Testing DNS resolution from app to postgres..."
  remote "docker exec $APP_CONTAINER_ID getent hosts postgres" || log "DNS resolution failed"
  log "Testing direct connection from app to postgres..."
  remote "docker exec $APP_CONTAINER_ID nc -zv postgres 5432 2>&1" || log "Direct connection failed"
  fail "App health check failed: $HEALTH_RESP"
fi
log "App connected to database successfully!"

log "Verifying cross-service communication via hostname..."
NETWORK_NAME=$(sanitize_name "frost-net-$PROJECT_ID-$ENV_ID")
log "Looking for network: $NETWORK_NAME"
log "All frost networks:"
remote "docker network ls --filter name=frost-net --format '{{.Name}}'" || true
NETWORK_EXISTS=$(remote "docker network ls --filter name=$NETWORK_NAME --format '{{.Name}}'" 2>&1)
log "Filter result: $NETWORK_EXISTS"
echo "$NETWORK_EXISTS" | grep -q "$NETWORK_NAME" || fail "Project network not found"
log "Services on shared network: $NETWORK_NAME"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

log "=== Project Template with Wildcard Domains ==="

log "Creating project from wordpress template..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-proj-template","templateId":"wordpress"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

log "Fetching services created by template..."
SERVICES=$(api "$BASE_URL/api/environments/$ENV_ID")
SERVICE_COUNT=$(json_get "$SERVICES" '.services | length')
[ "$SERVICE_COUNT" -lt 1 ] && fail "Expected at least 1 service from template, got: $SERVICE_COUNT"
log "Template created $SERVICE_COUNT services"

log "Checking wildcard domains for app services..."
WORDPRESS_SERVICE_ID=$(json_get "$SERVICES" '.services[] | select(.name == "wordpress") | .id')
[ -z "$WORDPRESS_SERVICE_ID" ] && fail "wordpress service not found"
log "Found wordpress service: $WORDPRESS_SERVICE_ID"

DOMAINS=$(api "$BASE_URL/api/services/$WORDPRESS_SERVICE_ID/domains")
DOMAIN_COUNT=$(echo "$DOMAINS" | jq 'length')
log "Wordpress service has $DOMAIN_COUNT domains"

if [ "$DOMAIN_COUNT" -lt 1 ]; then
  log "WARNING: No wildcard domain created for wordpress service"
  log "This may be expected in development mode (NODE_ENV=development)"
else
  WILDCARD_DOMAIN=$(echo "$DOMAINS" | jq -r '.[0].domain')
  log "Wildcard domain created: $WILDCARD_DOMAIN"
  echo "$WILDCARD_DOMAIN" | grep -q "wordpress" || fail "Expected domain to contain 'wordpress': $WILDCARD_DOMAIN"
fi

log "Verifying database service does NOT have wildcard domain..."
MARIADB_SERVICE_ID=$(json_get "$SERVICES" '.services[] | select(.name == "mariadb") | .id')
if [ -n "$MARIADB_SERVICE_ID" ] && [ "$MARIADB_SERVICE_ID" != "null" ]; then
  DB_DOMAINS=$(api "$BASE_URL/api/services/$MARIADB_SERVICE_ID/domains")
  DB_DOMAIN_COUNT=$(echo "$DB_DOMAINS" | jq 'length')
  [ "$DB_DOMAIN_COUNT" -gt 0 ] && fail "Database service should not have wildcard domain, found: $DB_DOMAIN_COUNT"
  log "Database service correctly has no wildcard domain"
fi

log "Cleanup project template test..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

log "=== Edge Cases ==="

log "Testing invalid template ID..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-invalid-template"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

INVALID_RESP=$(curl -sf -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"name":"test","deployType":"database","templateId":"nonexistent"}' 2>&1 || echo '{"error":"expected"}')
echo "$INVALID_RESP" | grep -qi "unknown\|error\|not found" || fail "Expected error for invalid template: $INVALID_RESP"
log "Invalid template correctly rejected"

api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
