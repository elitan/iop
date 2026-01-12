#!/bin/bash
set -e

SERVER_IP=$1
API_KEY=$2
PROJECT_ID=$3
SERVICE_ID=$4
DEPLOYMENT_ID=$5
BASE_URL="http://$SERVER_IP"

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ] || [ -z "$PROJECT_ID" ] || [ -z "$SERVICE_ID" ] || [ -z "$DEPLOYMENT_ID" ]; then
  echo "Usage: $0 <server-ip> <api-key> <project-id> <service-id> <deployment-id>"
  exit 1
fi

echo "Verifying pre-upgrade data survived on $BASE_URL"

api() {
  curl -sS --max-time 30 -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" "$@"
}

FAILED=0

echo ""
echo "=== Verifying project ==="
PROJECT=$(api "$BASE_URL/api/projects/$PROJECT_ID")
PROJECT_NAME=$(echo "$PROJECT" | jq -r '.name')

if [ "$PROJECT_NAME" = "upgrade-test" ]; then
  echo "PASS: Project name intact"
else
  echo "FAIL: Project name changed (expected 'upgrade-test', got '$PROJECT_NAME')"
  FAILED=1
fi

echo ""
echo "=== Verifying env var ==="
ENV_VARS=$(echo "$PROJECT" | jq -r '.envVars')
ENV_VAR=$(echo "$ENV_VARS" | jq -r '.[] | select(.key=="PRE_UPGRADE") | .value')

if [ "$ENV_VAR" = "data" ]; then
  echo "PASS: Env var PRE_UPGRADE=data intact"
else
  echo "FAIL: Env var lost or changed (expected 'data', got '$ENV_VAR')"
  FAILED=1
fi

echo ""
echo "=== Verifying service ==="
SERVICE=$(api "$BASE_URL/api/services/$SERVICE_ID")
SERVICE_NAME=$(echo "$SERVICE" | jq -r '.name')

if [ "$SERVICE_NAME" = "upgrade-svc" ]; then
  echo "PASS: Service exists"
else
  echo "FAIL: Service missing or changed (expected 'upgrade-svc', got '$SERVICE_NAME')"
  FAILED=1
fi

echo ""
echo "=== Verifying deployment status ==="
DEPLOYMENT=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID")
DEPLOYMENT_STATUS=$(echo "$DEPLOYMENT" | jq -r '.status')

if [ "$DEPLOYMENT_STATUS" = "running" ]; then
  echo "PASS: Deployment still running"
else
  echo "FAIL: Deployment not running (status: $DEPLOYMENT_STATUS)"
  FAILED=1
fi

echo ""
echo "=== Verifying container responds ==="
HOST_PORT=$(echo "$DEPLOYMENT" | jq -r '.hostPort')

if curl -sf "http://$SERVER_IP:$HOST_PORT" > /dev/null; then
  echo "PASS: Container responding on port $HOST_PORT"
else
  echo "FAIL: Container not responding on port $HOST_PORT"
  FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
  echo "=== All pre-upgrade data verified ==="
  exit 0
else
  echo "=== VERIFICATION FAILED ==="
  exit 1
fi
