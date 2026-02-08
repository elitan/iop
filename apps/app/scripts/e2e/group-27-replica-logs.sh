#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Replica logs ==="

log "Creating project..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-replica-logs"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

log "Getting default environment..."
ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"

log "Creating service..."
SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"log-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"

sleep 1
DEPLOYMENTS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_INIT_ID=$(json_get "$DEPLOYMENTS" '.[0].id // empty')
if [ -n "$DEPLOY_INIT_ID" ] && [ "$DEPLOY_INIT_ID" != "null" ]; then
  wait_for_deployment "$DEPLOY_INIT_ID" || fail "Initial deployment failed"
fi

log "Setting replicaCount=2 and redeploying..."
api -X PATCH "$BASE_URL/api/services/$SERVICE_ID" -d '{"replicaCount":2}' > /dev/null
DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOY_ID=$(require_field "$DEPLOY" '.deploymentId' "trigger deploy") || fail "Failed: $DEPLOY"
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

REPLICAS=$(api "$BASE_URL/api/deployments/$DEPLOY_ID/replicas")
REPLICA_COUNT=$(echo "$REPLICAS" | jq 'length')
[ "$REPLICA_COUNT" = "2" ] || fail "Expected 2 replicas, got $REPLICA_COUNT"

# Hit each replica to generate access logs
for i in 0 1; do
  PORT=$(json_get "$REPLICAS" ".[$i].hostPort")
  curl -sf "http://$SERVER_IP:$PORT/replica-log-test" > /dev/null 2>&1 || true
done
sleep 2

# --- Test 1: Runtime logs stream from all replicas ---
log "Test 1: Runtime logs from all replicas"

LOG_OUTPUT=$(curl -sf --max-time 5 "$BASE_URL/api/deployments/$DEPLOY_ID/logs?tail=20" \
  -H "X-Frost-Token: $API_KEY" 2>/dev/null || true)

HAS_R0=$(echo "$LOG_OUTPUT" | grep -c '\[replica-0\]' || true)
HAS_R1=$(echo "$LOG_OUTPUT" | grep -c '\[replica-1\]' || true)

[ "$HAS_R0" -gt 0 ] || fail "No [replica-0] lines in merged logs"
[ "$HAS_R1" -gt 0 ] || fail "No [replica-1] lines in merged logs"
log "Test 1 passed: logs contain both [replica-0] and [replica-1]"

# --- Test 2: Runtime logs filter by replica ---
log "Test 2: Runtime logs filter by replica"

LOG_FILTERED=$(curl -sf --max-time 5 "$BASE_URL/api/deployments/$DEPLOY_ID/logs?tail=20&replica=0" \
  -H "X-Frost-Token: $API_KEY" 2>/dev/null || true)

HAS_R1_FILTERED=$(echo "$LOG_FILTERED" | grep -c '\[replica-1\]' || true)
[ "$HAS_R1_FILTERED" = "0" ] || fail "Filtered logs should not contain [replica-1], found $HAS_R1_FILTERED lines"
log "Test 2 passed: filtered logs only show requested replica"

# --- Cleanup ---
log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
