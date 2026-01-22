#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Database Services ==="

log "Getting database templates..."
TEMPLATES=$(api "$BASE_URL/api/db-templates")
POSTGRES_FOUND=$(json_get "$TEMPLATES" '.[] | select(.id == "postgres") | .id')
[ "$POSTGRES_FOUND" != "postgres" ] && fail "postgres template not found. Response: $TEMPLATES"
log "Templates available"

log "Creating database service..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-database"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"postgres","deployType":"database","templateId":"postgres"}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create db service") || fail "Failed to create database service: $SERVICE"
SERVICE_TYPE=$(json_get "$SERVICE" '.serviceType')

[ "$SERVICE_TYPE" != "database" ] && fail "Service type should be 'database', got: $SERVICE_TYPE"
log "Created database service: $SERVICE_ID"

log "Verifying no system domain for database..."
DOMAINS=$(api "$BASE_URL/api/services/$SERVICE_ID/domains")
DOMAIN_COUNT=$(json_get "$DOMAINS" 'length') || DOMAIN_COUNT=0
[ "$DOMAIN_COUNT" != "0" ] && fail "Database should have no domains, got: $DOMAIN_COUNT"
log "No system domain (correct)"

log "Verifying database env vars..."
SERVICE_ENVVARS=$(json_get "$SERVICE" '.envVars')
POSTGRES_USER=$(echo "$SERVICE_ENVVARS" | jq -r '.[] | select(.key == "POSTGRES_USER") | .value')
POSTGRES_PASSWORD=$(echo "$SERVICE_ENVVARS" | jq -r '.[] | select(.key == "POSTGRES_PASSWORD") | .value')
[ -z "$POSTGRES_USER" ] && fail "POSTGRES_USER not set"
[ -z "$POSTGRES_PASSWORD" ] || [ ${#POSTGRES_PASSWORD} -lt 16 ] && fail "POSTGRES_PASSWORD not generated"
log "Credentials auto-generated (pw length: ${#POSTGRES_PASSWORD})"

log "Verifying SSL cert generated..."
SSL_CERT_EXISTS=$(remote "test -f /opt/frost/data/ssl/$SERVICE_ID/server.crt && echo 'exists'" 2>&1)
SSL_KEY_EXISTS=$(remote "test -f /opt/frost/data/ssl/$SERVICE_ID/server.key && echo 'exists'" 2>&1)
[ "$SSL_CERT_EXISTS" != "exists" ] || [ "$SSL_KEY_EXISTS" != "exists" ] && fail "SSL cert/key not generated"
log "SSL certificate generated"

log "Waiting for deployment..."
sleep 2
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_ID=$(require_field "$DEPLOYS" '.[0].id' "get db deploy") || fail "No db deployment: $DEPLOYS"
wait_for_deployment "$DEPLOY_ID" 60 || fail "Database deployment failed"

log "Verifying database is accepting connections..."
DEPLOY_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY_ID")
HOST_PORT=$(require_field "$DEPLOY_DATA" '.hostPort' "get db hostPort") || fail "No db hostPort: $DEPLOY_DATA"
PG_READY=$(remote "timeout 10 bash -c 'until pg_isready -h localhost -p $HOST_PORT; do sleep 1; done' && echo 'ready'" 2>&1 || echo "not ready")
echo "$PG_READY" | grep -q "ready" && log "PostgreSQL accepting connections"

log "Verifying SSL in build log..."
BUILD_LOG=$(json_get "$DEPLOY_DATA" '.buildLog')
echo "$BUILD_LOG" | grep -q "SSL enabled for postgres" || fail "SSL enabled message not in build log"
log "SSL enabled in deployment"

log "Verifying volume created..."
EXPECTED_VOLUME="frost-${SERVICE_ID}-data"
VOLUME_EXISTS=$(remote "docker volume ls --filter name=$EXPECTED_VOLUME --format '{{.Name}}'" 2>&1)
echo "$VOLUME_EXISTS" | grep -q "$EXPECTED_VOLUME" || fail "Volume not found"
log "Volume created: $EXPECTED_VOLUME"

log "Deleting service and verifying cleanup..."
api -X DELETE "$BASE_URL/api/services/$SERVICE_ID" > /dev/null
sleep 2

VOLUME_AFTER=$(remote "docker volume ls --filter name=$EXPECTED_VOLUME --format '{{.Name}}'" 2>&1)
echo "$VOLUME_AFTER" | grep -q "$EXPECTED_VOLUME" && fail "Volume should have been deleted"
log "Volume deleted"

SSL_CERT_AFTER=$(remote "test -f /opt/frost/data/ssl/$SERVICE_ID/server.crt && echo 'exists' || echo 'deleted'" 2>&1)
[ "$SSL_CERT_AFTER" = "exists" ] && fail "SSL cert should have been deleted"
log "SSL cert deleted"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
