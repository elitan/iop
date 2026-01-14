#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Container Resource Limits ==="

log "Creating service with resource limits..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-limits"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"limits-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"memoryLimit":"256m","cpuLimit":0.5,"shutdownTimeout":15}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')

MEMORY_LIMIT=$(echo "$SERVICE" | jq -r '.memoryLimit')
CPU_LIMIT=$(echo "$SERVICE" | jq -r '.cpuLimit')
SHUTDOWN_TIMEOUT=$(echo "$SERVICE" | jq -r '.shutdownTimeout')

[ "$MEMORY_LIMIT" != "256m" ] && fail "memoryLimit should be 256m"
[ "$CPU_LIMIT" != "0.5" ] && fail "cpuLimit should be 0.5"
[ "$SHUTDOWN_TIMEOUT" != "15" ] && fail "shutdownTimeout should be 15"
log "Resource limits stored correctly"

log "Waiting for deployment..."
sleep 1
DEPLOY_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id')
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

log "Verifying docker flags applied..."
CONTAINER_ID=$(api "$BASE_URL/api/deployments/$DEPLOY_ID" | jq -r '.containerId')
INSPECT=$(remote "docker inspect $CONTAINER_ID")
MEMORY=$(echo "$INSPECT" | jq -r '.[0].HostConfig.Memory')
NANO_CPUS=$(echo "$INSPECT" | jq -r '.[0].HostConfig.NanoCpus')

[ "$MEMORY" != "268435456" ] && fail "Memory not set correctly (got: $MEMORY)"
[ "$NANO_CPUS" != "500000000" ] && fail "CPU not set correctly (got: $NANO_CPUS)"
log "Docker flags applied correctly"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
