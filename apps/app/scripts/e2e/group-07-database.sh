#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Database Services ==="

provider_ref_field() {
  local provider_ref_json="$1"
  local field="$2"
  echo "$provider_ref_json" | jq -r --arg field "$field" '
    def decode:
      if type=="string" then (try (fromjson | decode) catch .) else . end;
    (decode[$field] // empty)
  '
}

wait_for_branch_status() {
  local target_id="$1"
  local expected_status="$2"
  local attempts="$3"
  local sleep_seconds="$4"
  local current_status=""

  for _ in $(seq 1 "$attempts"); do
    local runtime_state
    runtime_state=$(api "$BASE_URL/api/databases/$DB_ID/branches/$target_id/runtime")
    current_status=$(json_get "$runtime_state" '.lifecycleStatus')
    if [ "$current_status" = "$expected_status" ]; then
      echo "$current_status"
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "$current_status"
  return 1
}

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

PROVIDER_REF_JSON=$(json_get "$DB_CREATE" '.target.providerRefJson')
POSTGRES_USER=$(provider_ref_field "$PROVIDER_REF_JSON" "username")
POSTGRES_PASSWORD=$(provider_ref_field "$PROVIDER_REF_JSON" "password")
POSTGRES_DB=$(provider_ref_field "$PROVIDER_REF_JSON" "database")
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

DEV_PROVIDER_REF_JSON=$(json_get "$DEV_TARGET" '.providerRefJson')
DEV_POSTGRES_USER=$(provider_ref_field "$DEV_PROVIDER_REF_JSON" "username")
DEV_POSTGRES_PASSWORD=$(provider_ref_field "$DEV_PROVIDER_REF_JSON" "password")
DEV_POSTGRES_DB=$(provider_ref_field "$DEV_PROVIDER_REF_JSON" "database")
[ -z "$DEV_POSTGRES_USER" ] && fail "dev username missing"
[ -z "$DEV_POSTGRES_PASSWORD" ] && fail "dev password missing"
[ -z "$DEV_POSTGRES_DB" ] && fail "dev database missing"

log "Resetting branch from parent..."
api -X POST "$BASE_URL/api/databases/$DB_ID/targets/$DEV_TARGET_ID/reset" \
  -d '{"sourceTargetName":"main"}' > /dev/null
log "Branch reset complete"

DEV_RUNTIME_BEFORE=$(api "$BASE_URL/api/databases/$DB_ID/branches/$DEV_TARGET_ID/runtime")
DEV_HOST_PORT_BEFORE=$(require_field "$DEV_RUNTIME_BEFORE" '.hostPort' "get dev hostPort before scale-to-zero") || fail "No branch host port before: $DEV_RUNTIME_BEFORE"

log "Enabling scale-to-zero for branch..."
api -X PATCH "$BASE_URL/api/databases/$DB_ID/branches/$DEV_TARGET_ID" \
  -d '{"scaleToZeroMinutes":1}' > /dev/null

DEV_RUNTIME_AFTER=$(api "$BASE_URL/api/databases/$DB_ID/branches/$DEV_TARGET_ID/runtime")
DEV_HOST_PORT_AFTER=$(require_field "$DEV_RUNTIME_AFTER" '.hostPort' "get dev hostPort after scale-to-zero") || fail "No branch host port after: $DEV_RUNTIME_AFTER"
DEV_RUNTIME_HOST_PORT=$(require_field "$DEV_RUNTIME_AFTER" '.runtimeHostPort' "get dev runtimeHostPort") || fail "No branch runtime host port after: $DEV_RUNTIME_AFTER"
DEV_GATEWAY_ENABLED=$(json_get "$DEV_RUNTIME_AFTER" '.gatewayEnabled')
[ "$DEV_HOST_PORT_BEFORE" = "$DEV_HOST_PORT_AFTER" ] || fail "Expected stable host port, before=$DEV_HOST_PORT_BEFORE after=$DEV_HOST_PORT_AFTER"
[ "$DEV_GATEWAY_ENABLED" = "true" ] || fail "Expected gateway enabled, got: $DEV_GATEWAY_ENABLED"
[ "$DEV_RUNTIME_HOST_PORT" != "$DEV_HOST_PORT_AFTER" ] || fail "Expected hidden runtime port to differ from stable host port"
log "Scale-to-zero enabled on stable host port: $DEV_HOST_PORT_AFTER"

log "Waiting for idle auto-stop..."
DEV_STATUS=$(wait_for_branch_status "$DEV_TARGET_ID" "stopped" 36 5 || true)
[ "$DEV_STATUS" = "stopped" ] || fail "Expected branch to auto-stop, last status: $DEV_STATUS"
log "Branch auto-stopped after idle timeout"

log "Connecting on same host port to auto-wake..."
WAKE_RESULT=$(remote "timeout 90 docker run --rm --network host -e PGPASSWORD='$DEV_POSTGRES_PASSWORD' postgres:17 psql \"host=127.0.0.1 port=$DEV_HOST_PORT_AFTER user=$DEV_POSTGRES_USER dbname=$DEV_POSTGRES_DB sslmode=disable connect_timeout=70\" -tAc 'select 1'" 2>&1 || true)
WAKE_VALUE=$(echo "$WAKE_RESULT" | tr -d '[:space:]')
[ "$WAKE_VALUE" = "1" ] || fail "Expected wake query result 1, got: $WAKE_RESULT"
log "Wake query succeeded on same host port"

DEV_STATUS_AFTER_WAKE=$(wait_for_branch_status "$DEV_TARGET_ID" "active" 20 1 || true)
[ "$DEV_STATUS_AFTER_WAKE" = "active" ] || fail "Expected branch active after wake, got: $DEV_STATUS_AFTER_WAKE"
log "Branch woke after incoming connection"

log "Creating detached branch for TTL delete..."
TTL_TARGET=$(api -X POST "$BASE_URL/api/databases/$DB_ID/targets" \
  -d '{"name":"ttl-dev","sourceTargetName":"main"}')
TTL_TARGET_ID=$(require_field "$TTL_TARGET" '.id' "create ttl target") || fail "Failed to create ttl target: $TTL_TARGET"

log "Enabling TTL on detached branch..."
api -X PATCH "$BASE_URL/api/databases/$DB_ID/branches/$TTL_TARGET_ID" \
  -d '{"ttlValue":1,"ttlUnit":"hours"}' > /dev/null

TTL_CREATED_AT=$(( $(date +%s) * 1000 - 2 * 60 * 60 * 1000 ))
remote "FROST_DB_PATH=\"$FROST_DATA_DIR/frost.db\" TTL_CREATED_AT=\"$TTL_CREATED_AT\" TTL_TARGET_ID=\"$TTL_TARGET_ID\" bun -e \"import { Database } from 'bun:sqlite'; const db = new Database(process.env.FROST_DB_PATH); db.query('UPDATE database_targets SET created_at = ? WHERE id = ?').run(Number(process.env.TTL_CREATED_AT), process.env.TTL_TARGET_ID); db.close();\""

log "Waiting for TTL auto-delete..."
TTL_EXISTS="$TTL_TARGET_ID"
for _ in $(seq 1 36); do
  TARGETS_NOW=$(api "$BASE_URL/api/databases/$DB_ID/targets")
  TTL_EXISTS=$(json_get "$TARGETS_NOW" '.[] | select(.id == "'"$TTL_TARGET_ID"'") | .id')
  if [ -z "$TTL_EXISTS" ] || [ "$TTL_EXISTS" = "null" ]; then
    TTL_EXISTS=""
    break
  fi
  sleep 5
done
[ -z "$TTL_EXISTS" ] || fail "Expected TTL target to be auto-deleted"
log "TTL auto-delete verified"

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
