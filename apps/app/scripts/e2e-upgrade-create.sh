#!/bin/bash
set -e

SERVER_IP=$1
API_KEY=$2
BASE_URL="http://$SERVER_IP"

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ]; then
  echo "Usage: $0 <server-ip> <api-key>"
  exit 1
fi

echo "Creating pre-upgrade test data on $BASE_URL"

api() {
  curl -sS --max-time 30 -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" "$@"
}

wait_for_deployment() {
  local DEPLOYMENT_ID=$1
  local MAX=${2:-30}
  for i in $(seq 1 $MAX); do
    STATUS=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq -r '.status')
    echo "  Status: $STATUS"
    if [ "$STATUS" = "running" ]; then
      return 0
    elif [ "$STATUS" = "failed" ]; then
      echo "Deployment failed!"
      api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq
      return 1
    fi
    sleep 5
  done
  echo "Deployment timed out"
  return 1
}

echo ""
echo "=== Creating project with env var ==="
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{
  "name": "upgrade-test",
  "envVars": [{"key": "PRE_UPGRADE", "value": "data"}]
}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

if [ "$PROJECT_ID" = "null" ] || [ -z "$PROJECT_ID" ]; then
  echo "Failed to create project:"
  echo "$PROJECT" | jq
  exit 1
fi
echo "Created project: $PROJECT_ID"

echo ""
echo "=== Creating service (auto-deploys) ==="
SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"upgrade-svc","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')

if [ "$SERVICE_ID" = "null" ] || [ -z "$SERVICE_ID" ]; then
  echo "Failed to create service:"
  echo "$SERVICE" | jq
  exit 1
fi
echo "Created service: $SERVICE_ID"

echo ""
echo "=== Waiting for deployment ==="
sleep 2
DEPLOYMENT_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id // empty')

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "No auto-deployment found, triggering manual deploy..."
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOYMENT_ID=$(echo "$DEPLOY" | jq -r '.deploymentId')
fi

if [ "$DEPLOYMENT_ID" = "null" ] || [ -z "$DEPLOYMENT_ID" ]; then
  echo "Failed to get deployment"
  exit 1
fi
echo "Deployment: $DEPLOYMENT_ID"

wait_for_deployment "$DEPLOYMENT_ID"

echo ""
echo "=== Verifying container responds ==="
HOST_PORT=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq -r '.hostPort')
if curl -sf "http://$SERVER_IP:$HOST_PORT" > /dev/null; then
  echo "Container responding on port $HOST_PORT"
else
  echo "Container not responding"
  exit 1
fi

echo ""
echo "=== Pre-upgrade data created ==="
echo "project_id=$PROJECT_ID"
echo "service_id=$SERVICE_ID"
echo "deployment_id=$DEPLOYMENT_ID"

if [ -n "$GITHUB_OUTPUT" ]; then
  echo "project_id=$PROJECT_ID" >> $GITHUB_OUTPUT
  echo "service_id=$SERVICE_ID" >> $GITHUB_OUTPUT
  echo "deployment_id=$DEPLOYMENT_ID" >> $GITHUB_OUTPUT
fi
