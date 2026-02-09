#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Concurrent Deployments (Port Allocation) ==="

NUM_SERVICES=5
PROJECT_IDS=()
SERVICE_IDS=()
DEPLOY_IDS=()

log "Creating $NUM_SERVICES projects with services..."
for i in $(seq 1 $NUM_SERVICES); do
  PROJECT=$(api -X POST "$BASE_URL/api/projects" -d "{\"name\":\"e2e-concurrent-$i\"}")
  PROJECT_ID=$(require_field "$PROJECT" '.id' "create project $i") || fail "Failed to create project $i: $PROJECT"
  PROJECT_IDS+=("$PROJECT_ID")

  ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment for project $i"

  SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
    -d "{\"name\":\"svc-$i\",\"deployType\":\"image\",\"imageUrl\":\"nginx:alpine\",\"containerPort\":80}")
  SERVICE_ID=$(require_field "$SERVICE" '.id' "create service $i") || fail "Failed to create service $i: $SERVICE"
  SERVICE_IDS+=("$SERVICE_ID")
  log "Created project $i: $PROJECT_ID, service: $SERVICE_ID"
done

log "Waiting for initial deployments..."
for i in $(seq 0 $((NUM_SERVICES - 1))); do
  SERVICE_ID=${SERVICE_IDS[$i]}
  DEPLOY_ID=$(wait_for_service_deployment_id "$SERVICE_ID" 30 1) || fail "No initial deployment for service $i"
  wait_for_deployment "$DEPLOY_ID" || fail "Initial deployment for service $i failed"
  log "Service $i initial deployment complete"
done

log "Triggering $NUM_SERVICES concurrent deployments..."
for i in $(seq 0 $((NUM_SERVICES - 1))); do
  SERVICE_ID=${SERVICE_IDS[$i]}
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOY_ID=$(require_field "$DEPLOY" '.deploymentId' "trigger deploy $i") || fail "Failed to trigger deployment for service $i: $DEPLOY"
  DEPLOY_IDS+=("$DEPLOY_ID")
  log "Triggered deployment $DEPLOY_ID for service $i"
done

log "Waiting for all concurrent deployments..."
FAILED_COUNT=0
for i in $(seq 0 $((NUM_SERVICES - 1))); do
  DEPLOY_ID=${DEPLOY_IDS[$i]}
  if ! wait_for_deployment "$DEPLOY_ID" 120; then
    log "Deployment $DEPLOY_ID failed"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  else
    log "Deployment $DEPLOY_ID succeeded"
  fi
done

[ "$FAILED_COUNT" -gt 0 ] && fail "$FAILED_COUNT of $NUM_SERVICES concurrent deployments failed"

log "Verifying all containers running with unique ports..."
PORTS=$(remote "docker ps --filter 'label=frost.managed=true' --format '{{.Ports}}' | grep -oE '0\.0\.0\.0:[0-9]+' | cut -d: -f2 | sort")
UNIQUE_PORTS=$(echo "$PORTS" | sort -u | wc -l)
TOTAL_PORTS=$(echo "$PORTS" | wc -l)

log "Found $TOTAL_PORTS ports, $UNIQUE_PORTS unique"
[ "$UNIQUE_PORTS" -lt "$NUM_SERVICES" ] && fail "Expected at least $NUM_SERVICES unique ports for our services"

log "Cleanup..."
for PROJECT_ID in "${PROJECT_IDS[@]}"; do
  api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null
done

pass
