#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Replica support ==="

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-replicas"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

log "Getting default environment..."
ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"

# --- Test 1: Default single replica (backward compat) ---
log "Test 1: Default single replica"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"replica-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"drainTimeout":0}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"

DEPLOY_ID=$(wait_for_service_deployment_id "$SERVICE_ID" 30 1 || true)
if [ -z "$DEPLOY_ID" ] || [ "$DEPLOY_ID" = "null" ]; then
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOY_ID=$(require_field "$DEPLOY" '.deploymentId' "trigger deploy") || fail "Failed: $DEPLOY"
fi
wait_for_deployment "$DEPLOY_ID" || fail "Default deployment failed"

REPLICAS=$(api "$BASE_URL/api/deployments/$DEPLOY_ID/replicas")
REPLICA_COUNT=$(echo "$REPLICAS" | jq 'length')
[ "$REPLICA_COUNT" = "1" ] || fail "Expected 1 replica, got $REPLICA_COUNT"

R0_STATUS=$(json_get "$REPLICAS" '.[0].status')
R0_PORT=$(json_get "$REPLICAS" '.[0].hostPort')
R0_CONTAINER=$(json_get "$REPLICAS" '.[0].containerId')
[ "$R0_STATUS" = "running" ] || fail "Replica 0 status: $R0_STATUS"
[ "$R0_PORT" != "null" ] && [ -n "$R0_PORT" ] || fail "Replica 0 missing hostPort"
[ "$R0_CONTAINER" != "null" ] && [ -n "$R0_CONTAINER" ] || fail "Replica 0 missing containerId"

curl -sf "http://$SERVER_IP:$R0_PORT" > /dev/null || fail "Replica 0 not responding on port $R0_PORT"
log "Test 1 passed: single replica running on port $R0_PORT"

# --- Test 2: Deploy with 3 replicas ---
log "Test 2: Deploy with 3 replicas"

api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" -d '{"replicaCount":3}' > /dev/null
DEPLOY2=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY2_ID=$(require_field "$DEPLOY2" '.deploymentId' "trigger deploy") || fail "Failed: $DEPLOY2"
wait_for_deployment "$DEPLOY2_ID" || fail "3-replica deployment failed"

REPLICAS2=$(api "$BASE_URL/api/deployments/$DEPLOY2_ID/replicas")
REPLICA_COUNT2=$(echo "$REPLICAS2" | jq 'length')
[ "$REPLICA_COUNT2" = "3" ] || fail "Expected 3 replicas, got $REPLICA_COUNT2"

PORTS=$(echo "$REPLICAS2" | jq '[.[].hostPort] | unique | length')
[ "$PORTS" = "3" ] || fail "Expected 3 unique ports, got $PORTS"

CONTAINERS=$(echo "$REPLICAS2" | jq '[.[].containerId] | unique | length')
[ "$CONTAINERS" = "3" ] || fail "Expected 3 unique containers, got $CONTAINERS"

for i in 0 1 2; do
  STATUS=$(json_get "$REPLICAS2" ".[$i].status")
  PORT=$(json_get "$REPLICAS2" ".[$i].hostPort")
  [ "$STATUS" = "running" ] || fail "Replica $i status: $STATUS"
  curl -sf "http://$SERVER_IP:$PORT" > /dev/null || fail "Replica $i not responding on port $PORT"
done

SANITIZED_PREFIX=$(sanitize_name "frost-${SERVICE_ID}")
DOCKER_COUNT=""
for _ in $(seq 1 10); do
  DOCKER_COUNT=$(remote "docker ps --filter name=${SANITIZED_PREFIX} --format '{{.Names}}' | wc -l" | tr -d ' ')
  if [ "$DOCKER_COUNT" = "3" ]; then
    break
  fi
  sleep 1
done
[ "$DOCKER_COUNT" = "3" ] || fail "Expected 3 docker containers, got $DOCKER_COUNT"
log "Test 2 passed: 3 replicas running"

# --- Test 3: Redeploy preserves replica count ---
log "Test 3: Redeploy preserves replica count"

api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" -d '{"imageUrl":"httpd:alpine","containerPort":80}' > /dev/null
DEPLOY3=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY3_ID=$(require_field "$DEPLOY3" '.deploymentId' "trigger deploy") || fail "Failed: $DEPLOY3"
wait_for_deployment "$DEPLOY3_ID" || fail "Redeploy failed"

REPLICAS3=$(api "$BASE_URL/api/deployments/$DEPLOY3_ID/replicas")
REPLICA_COUNT3=$(echo "$REPLICAS3" | jq 'length')
[ "$REPLICA_COUNT3" = "3" ] || fail "Expected 3 replicas after redeploy, got $REPLICA_COUNT3"

for i in 0 1 2; do
  STATUS=$(json_get "$REPLICAS3" ".[$i].status")
  [ "$STATUS" = "running" ] || fail "Replica $i after redeploy status: $STATUS"
done

DOCKER_COUNT=""
for _ in $(seq 1 10); do
  DOCKER_COUNT=$(remote "docker ps --filter name=${SANITIZED_PREFIX} --format '{{.Names}}' | wc -l" | tr -d ' ')
  if [ "$DOCKER_COUNT" = "3" ]; then
    break
  fi
  sleep 1
done
[ "$DOCKER_COUNT" = "3" ] || fail "Expected 3 containers after redeploy (not 6), got $DOCKER_COUNT"
log "Test 3 passed: redeploy preserved 3 replicas, old ones stopped"

# --- Test 4: Scale down to 1 ---
log "Test 4: Scale down to 1"

api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" -d '{"replicaCount":1}' > /dev/null
DEPLOY4=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY4_ID=$(require_field "$DEPLOY4" '.deploymentId' "trigger deploy") || fail "Failed: $DEPLOY4"
wait_for_deployment "$DEPLOY4_ID" || fail "Scale-down deployment failed"

REPLICAS4=$(api "$BASE_URL/api/deployments/$DEPLOY4_ID/replicas")
REPLICA_COUNT4=$(echo "$REPLICAS4" | jq 'length')
[ "$REPLICA_COUNT4" = "1" ] || fail "Expected 1 replica after scale-down, got $REPLICA_COUNT4"

DOCKER_COUNT=""
for i in $(seq 1 20); do
  DOCKER_COUNT=$(remote "docker ps --filter name=${SANITIZED_PREFIX} --format '{{.Names}}' | wc -l" | tr -d ' ')
  if [ "$DOCKER_COUNT" = "1" ]; then
    break
  fi
  sleep 1
done
[ "$DOCKER_COUNT" = "1" ] || fail "Expected 1 container after scale-down, got $DOCKER_COUNT"
log "Test 4 passed: scaled down to 1 replica"

# --- Test 5: Replicas blocked with volumes ---
log "Test 5: Replicas blocked with volumes"

SERVICE2=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"vol-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"volumes":[{"name":"data","mountPath":"/data"}]}')
SERVICE2_ID=$(require_field "$SERVICE2" '.id' "create vol service") || fail "Failed: $SERVICE2"

PATCH_RESULT=$(api -X PATCH "$BASE_URL/api/services/$SERVICE2_ID" -d '{"replicaCount":2}' 2>&1)
if echo "$PATCH_RESULT" | grep -qi "error\|cannot\|volumes"; then
  log "Test 5 passed: replicas blocked for volume service"
else
  fail "Expected error when setting replicas on volume service, got: $PATCH_RESULT"
fi

# --- Cleanup ---
log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
