#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Database Services ==="

log "Getting database templates..."
TEMPLATES=$(api "$BASE_URL/api/templates/databases")
POSTGRES_FOUND=$(json_get "$TEMPLATES" '.[] | select(.id == "postgres") | .id')
[ "$POSTGRES_FOUND" != "postgres" ] && fail "postgres template not found. Response: $TEMPLATES"
log "Templates available"

log "Creating postgres database..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-database"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

DB_CREATE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/databases" \
  -d '{"name":"postgres","engine":"postgres"}')
DB_ID=$(require_field "$DB_CREATE" '.database.id' "create database") || fail "Failed to create database: $DB_CREATE"
TARGET_ID=$(require_field "$DB_CREATE" '.target.id' "create database target") || fail "Failed to create target: $DB_CREATE"
TARGET_NAME=$(json_get "$DB_CREATE" '.target.name')

[ "$TARGET_NAME" != "main" ] && fail "Expected main target, got: $TARGET_NAME"
log "Created database: $DB_ID"

log "Verifying database target exists..."
TARGETS=$(api "$BASE_URL/api/databases/$DB_ID/targets")
TARGET_FOUND=$(json_get "$TARGETS" '.[] | select(.id == "'"$TARGET_ID"'") | .id')
[ "$TARGET_FOUND" != "$TARGET_ID" ] && fail "Target not found: $TARGETS"
log "Main target exists"

log "Verifying environment attachment..."
ATTACHMENTS=$(api "$BASE_URL/api/environments/$ENV_ID/database-attachments")
ATTACHED_TARGET_ID=$(json_get "$ATTACHMENTS" '.[] | select(.databaseId == "'"$DB_ID"'") | .targetId')
[ "$ATTACHED_TARGET_ID" != "$TARGET_ID" ] && fail "Expected target attachment $TARGET_ID, got: $ATTACHED_TARGET_ID"
log "Environment attached to main target"

PROVIDER_REF_JSON=$(json_get "$DB_CREATE" '.target.providerRefJson')
POSTGRES_USER=$(echo "$PROVIDER_REF_JSON" | jq -r 'def decode: if type=="string" then (try (fromjson | decode) catch .) else . end; (decode.username // empty)')
POSTGRES_PASSWORD=$(echo "$PROVIDER_REF_JSON" | jq -r 'def decode: if type=="string" then (try (fromjson | decode) catch .) else . end; (decode.password // empty)')
POSTGRES_DB=$(echo "$PROVIDER_REF_JSON" | jq -r 'def decode: if type=="string" then (try (fromjson | decode) catch .) else . end; (decode.database // empty)')
[ -z "$POSTGRES_USER" ] && fail "username missing"
[ -z "$POSTGRES_PASSWORD" ] && fail "password missing"
[ -z "$POSTGRES_DB" ] && fail "database missing"

RUNTIME=$(api "$BASE_URL/api/databases/$DB_ID/targets/$TARGET_ID/runtime")
HOST_PORT=$(require_field "$RUNTIME" '.hostPort' "get runtime hostPort") || fail "No host port: $RUNTIME"

log "Verifying database is accepting connections..."
PG_READY=$(remote "timeout 30 bash -c 'until pg_isready -h localhost -p $HOST_PORT -U $POSTGRES_USER -d $POSTGRES_DB; do sleep 1; done' && echo 'ready'" 2>&1 || echo "not ready")
echo "$PG_READY" | grep -q "ready" || fail "Postgres not ready: $PG_READY"
log "Postgres accepting connections on $HOST_PORT"

log "Creating branch from main..."
DEV_TARGET=$(api -X POST "$BASE_URL/api/databases/$DB_ID/targets" \
  -d '{"name":"dev","sourceTargetName":"main"}')
DEV_TARGET_ID=$(require_field "$DEV_TARGET" '.id' "create dev target") || fail "Failed to create dev target: $DEV_TARGET"
log "Created branch: $DEV_TARGET_ID"

log "Resetting branch from parent..."
api -X POST "$BASE_URL/api/databases/$DB_ID/targets/$DEV_TARGET_ID/reset" \
  -d '{"sourceTargetName":"main"}' > /dev/null
log "Branch reset complete"

log "Deleting branch..."
api -X DELETE "$BASE_URL/api/databases/$DB_ID/targets/$DEV_TARGET_ID" > /dev/null
log "Branch deleted"

log "Deleting database..."
api -X DELETE "$BASE_URL/api/databases/$DB_ID" > /dev/null
log "Database deleted"

DB_LIST=$(api "$BASE_URL/api/projects/$PROJECT_ID/databases")
DB_COUNT=$(json_get "$DB_LIST" 'length')
[ "$DB_COUNT" != "0" ] && fail "Expected 0 databases after delete, got: $DB_COUNT"
log "Database cleanup verified"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
