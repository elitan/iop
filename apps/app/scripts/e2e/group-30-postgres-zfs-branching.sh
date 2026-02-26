#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Postgres ZFS branching ==="

if [ "${E2E_LOCAL:-}" = "1" ]; then
  log "Skipping: remote Linux ZFS group"
  pass
  exit 0
fi

provider_ref_field() {
  local provider_ref_json="$1"
  local field="$2"
  echo "$provider_ref_json" | jq -r --arg field "$field" '
    def decode:
      if type=="string" then (try (fromjson | decode) catch .) else . end;
    (decode[$field] // empty)
  '
}

run_target_sql() {
  local target_id="$1"
  local sql="$2"
  local body
  body=$(jq -nc --arg sql "$sql" '{sql: $sql}')
  api -X POST "$BASE_URL/api/database-targets/$target_id/sql" -d "$body"
}

ZFS_POOL=$(remote '. /opt/frost/.env; echo ${FROST_POSTGRES_ZFS_POOL:-}')
ZFS_DATASET_BASE=$(remote '. /opt/frost/.env; echo ${FROST_POSTGRES_ZFS_DATASET_BASE:-}')
[ -z "$ZFS_POOL" ] && fail "FROST_POSTGRES_ZFS_POOL is missing"
[ -z "$ZFS_DATASET_BASE" ] && fail "FROST_POSTGRES_ZFS_DATASET_BASE is missing"

PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-postgres-zfs-branching"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

DB_CREATE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/databases" \
  -d '{"name":"postgreszfs","engine":"postgres"}')
DB_ID=$(require_field "$DB_CREATE" '.database.id' "create database") || fail "Failed to create database: $DB_CREATE"
MAIN_TARGET_ID=$(require_field "$DB_CREATE" '.target.id' "main target") || fail "Missing main target: $DB_CREATE"

MAIN_RUNTIME=$(api "$BASE_URL/api/database-targets/$MAIN_TARGET_ID/runtime")
MAIN_BACKEND=$(json_get "$MAIN_RUNTIME" '.storageBackend')
[ "$MAIN_BACKEND" = "zfs" ] || fail "Expected zfs backend for main, got: $MAIN_BACKEND"

MAIN_PROVIDER_REF_JSON=$(json_get "$DB_CREATE" '.target.providerRefJson')
MAIN_STORAGE_BACKEND=$(provider_ref_field "$MAIN_PROVIDER_REF_JSON" "storageBackend")
MAIN_STORAGE_REF=$(provider_ref_field "$MAIN_PROVIDER_REF_JSON" "storageRef")
[ "$MAIN_STORAGE_BACKEND" = "zfs" ] || fail "Expected zfs provider storage backend, got: $MAIN_STORAGE_BACKEND"
[ -z "$MAIN_STORAGE_REF" ] && fail "Missing main storageRef"

run_target_sql "$MAIN_TARGET_ID" "CREATE TABLE IF NOT EXISTS frost_branch_test (id SERIAL PRIMARY KEY, value TEXT NOT NULL);" > /dev/null
run_target_sql "$MAIN_TARGET_ID" "INSERT INTO frost_branch_test (value) VALUES ('seed');" > /dev/null

BRANCH_TARGET=$(api -X POST "$BASE_URL/api/databases/$DB_ID/targets" \
  -d '{"name":"dev","sourceTargetName":"main"}')
BRANCH_TARGET_ID=$(require_field "$BRANCH_TARGET" '.id' "branch target") || fail "Failed to create branch: $BRANCH_TARGET"

BRANCH_RUNTIME=$(api "$BASE_URL/api/database-targets/$BRANCH_TARGET_ID/runtime")
BRANCH_BACKEND=$(json_get "$BRANCH_RUNTIME" '.storageBackend')
[ "$BRANCH_BACKEND" = "zfs" ] || fail "Expected zfs backend for branch, got: $BRANCH_BACKEND"

BRANCH_PROVIDER_REF_JSON=$(json_get "$BRANCH_TARGET" '.providerRefJson')
BRANCH_CONTAINER_NAME=$(provider_ref_field "$BRANCH_PROVIDER_REF_JSON" "containerName")
BRANCH_STORAGE_BACKEND=$(provider_ref_field "$BRANCH_PROVIDER_REF_JSON" "storageBackend")
BRANCH_STORAGE_REF=$(provider_ref_field "$BRANCH_PROVIDER_REF_JSON" "storageRef")
[ "$BRANCH_STORAGE_BACKEND" = "zfs" ] || fail "Expected zfs branch storage backend, got: $BRANCH_STORAGE_BACKEND"
[ -z "$BRANCH_STORAGE_REF" ] && fail "Missing branch storageRef"
[ -z "$BRANCH_CONTAINER_NAME" ] && fail "Missing branch container name"

run_target_sql "$BRANCH_TARGET_ID" "INSERT INTO frost_branch_test (value) VALUES ('branch-only');" > /dev/null
run_target_sql "$MAIN_TARGET_ID" "INSERT INTO frost_branch_test (value) VALUES ('main-only');" > /dev/null

MAIN_COUNT=$(json_get "$(run_target_sql "$MAIN_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test;")" '.rows[0][0]')
BRANCH_COUNT=$(json_get "$(run_target_sql "$BRANCH_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test;")" '.rows[0][0]')
BRANCH_HAS_MAIN_ONLY=$(json_get "$(run_target_sql "$BRANCH_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test WHERE value = 'main-only';")" '.rows[0][0]')

[ "$MAIN_COUNT" = "2" ] || fail "Expected main count 2, got: $MAIN_COUNT"
[ "$BRANCH_COUNT" = "2" ] || fail "Expected branch count 2, got: $BRANCH_COUNT"
[ "$BRANCH_HAS_MAIN_ONLY" = "0" ] || fail "Branch should not include main-only row before reset"

api -X POST "$BASE_URL/api/databases/$DB_ID/targets/$BRANCH_TARGET_ID/reset" \
  -d '{"sourceTargetName":"main"}' > /dev/null

BRANCH_AFTER_RESET_COUNT=$(json_get "$(run_target_sql "$BRANCH_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test;")" '.rows[0][0]')
BRANCH_HAS_MAIN_ONLY=$(json_get "$(run_target_sql "$BRANCH_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test WHERE value = 'main-only';")" '.rows[0][0]')
BRANCH_HAS_BRANCH_ONLY=$(json_get "$(run_target_sql "$BRANCH_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test WHERE value = 'branch-only';")" '.rows[0][0]')

[ "$BRANCH_AFTER_RESET_COUNT" = "2" ] || fail "Expected branch count 2 after reset, got: $BRANCH_AFTER_RESET_COUNT"
[ "$BRANCH_HAS_MAIN_ONLY" = "1" ] || fail "Expected main-only row after reset"
[ "$BRANCH_HAS_BRANCH_ONLY" = "0" ] || fail "branch-only row should be removed after reset"

api -X POST "$BASE_URL/api/databases/$DB_ID/targets/$BRANCH_TARGET_ID/stop" -d '{}' > /dev/null
api -X POST "$BASE_URL/api/databases/$DB_ID/targets/$BRANCH_TARGET_ID/start" -d '{}' > /dev/null

BRANCH_AFTER_START_COUNT=$(json_get "$(run_target_sql "$BRANCH_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test;")" '.rows[0][0]')
[ "$BRANCH_AFTER_START_COUNT" = "2" ] || fail "Expected branch count 2 after start, got: $BRANCH_AFTER_START_COUNT"

DEPLOY_RESULT=$(api -X POST "$BASE_URL/api/database-targets/$BRANCH_TARGET_ID/deploy" -d '{}')
DEPLOY_STATUS=$(json_get "$DEPLOY_RESULT" '.status')
[ "$DEPLOY_STATUS" = "running" ] || fail "Expected deploy status running, got: $DEPLOY_STATUS"

BRANCH_AFTER_DEPLOY_COUNT=$(json_get "$(run_target_sql "$BRANCH_TARGET_ID" "SELECT COUNT(*) FROM frost_branch_test;")" '.rows[0][0]')
[ "$BRANCH_AFTER_DEPLOY_COUNT" = "2" ] || fail "Expected branch count 2 after deploy, got: $BRANCH_AFTER_DEPLOY_COUNT"

api -X DELETE "$BASE_URL/api/databases/$DB_ID/targets/$BRANCH_TARGET_ID" > /dev/null

TARGETS_AFTER_DELETE=$(api "$BASE_URL/api/databases/$DB_ID/targets")
TARGET_EXISTS=$(json_get "$TARGETS_AFTER_DELETE" '.[] | select(.id == "'"$BRANCH_TARGET_ID"'") | .id')
[ -n "$TARGET_EXISTS" ] && fail "Branch target still exists after delete"

CONTAINER_EXISTS=$(remote "docker ps -a --format '{{.Names}}' | grep -x '$BRANCH_CONTAINER_NAME' >/dev/null && echo yes || echo no")
[ "$CONTAINER_EXISTS" = "no" ] || fail "Branch container still exists after delete"

BRANCH_DATASET="$ZFS_POOL/$ZFS_DATASET_BASE/$BRANCH_STORAGE_REF"
DATASET_EXISTS=$(remote "zfs list -H '$BRANCH_DATASET' >/dev/null 2>&1 && echo yes || echo no")
[ "$DATASET_EXISTS" = "no" ] || fail "Branch dataset still exists after delete: $BRANCH_DATASET"

api -X DELETE "$BASE_URL/api/databases/$DB_ID" > /dev/null
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
