#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Container Resource Limits ==="

log "Creating service with resource limits..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-limits"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"limits-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"memoryLimit":"256m","cpuLimit":0.5,"shutdownTimeout":15}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"

MEMORY_LIMIT=$(json_get "$SERVICE" '.memoryLimit')
CPU_LIMIT=$(json_get "$SERVICE" '.cpuLimit')
SHUTDOWN_TIMEOUT=$(json_get "$SERVICE" '.shutdownTimeout')

[ "$MEMORY_LIMIT" != "256m" ] && fail "memoryLimit should be 256m"
[ "$CPU_LIMIT" != "0.5" ] && fail "cpuLimit should be 0.5"
[ "$SHUTDOWN_TIMEOUT" != "15" ] && fail "shutdownTimeout should be 15"
log "Resource limits stored correctly"

log "Waiting for deployment..."
sleep 1
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_ID=$(require_field "$DEPLOYS" '.[0].id' "get deploy") || fail "No deployment: $DEPLOYS"
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

log "Verifying docker flags applied..."
DEPLOY_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY_ID")
CONTAINER_ID=$(require_field "$DEPLOY_DATA" '.containerId' "get containerId") || fail "No containerId: $DEPLOY_DATA"
INSPECT=$(remote "docker inspect $CONTAINER_ID")
MEMORY=$(echo "$INSPECT" | jq -r '.[0].HostConfig.Memory')
NANO_CPUS=$(echo "$INSPECT" | jq -r '.[0].HostConfig.NanoCpus')

[ "$MEMORY" != "268435456" ] && fail "Memory not set correctly (got: $MEMORY)"
[ "$NANO_CPUS" != "500000000" ] && fail "CPU not set correctly (got: $NANO_CPUS)"
log "Docker flags applied correctly"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
