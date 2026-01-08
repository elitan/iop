#!/bin/bash
set -e

SERVER_IP=$1
API_KEY=$2
BASE_URL="http://$SERVER_IP"

if [ -z "$SERVER_IP" ] || [ -z "$API_KEY" ]; then
  echo "Usage: $0 <server-ip> <api-key>"
  exit 1
fi

echo "Running E2E tests against $BASE_URL"

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

wait_for_ssl() {
  local DOMAIN_ID=$1
  local MAX=${2:-24}
  for i in $(seq 1 $MAX); do
    RESULT=$(api -X POST "$BASE_URL/api/domains/$DOMAIN_ID/verify-ssl")
    SSL_STATUS=$(echo "$RESULT" | jq -r '.status // .working')
    echo "  SSL status: $SSL_STATUS"
    if [ "$SSL_STATUS" = "active" ] || [ "$SSL_STATUS" = "true" ]; then
      return 0
    fi
    sleep 5
  done
  echo "SSL verification timed out"
  return 1
}

remote() {
  ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR root@$SERVER_IP "$@"
}

echo ""
echo "=== Test 1: Create project ==="
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-test"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

if [ "$PROJECT_ID" = "null" ] || [ -z "$PROJECT_ID" ]; then
  echo "Failed to create project:"
  echo "$PROJECT" | jq
  exit 1
fi

echo "Created project: $PROJECT_ID"

echo ""
echo "=== Test 2: Create service ==="
SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"test-nginx","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')

if [ "$SERVICE_ID" = "null" ] || [ -z "$SERVICE_ID" ]; then
  echo "Failed to create service:"
  echo "$SERVICE" | jq
  exit 1
fi

echo "Created service: $SERVICE_ID"

echo ""
echo "=== Test 3: Deploy service ==="
DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
DEPLOYMENT_ID=$(echo "$DEPLOY" | jq -r '.deployment_id')

if [ "$DEPLOYMENT_ID" = "null" ] || [ -z "$DEPLOYMENT_ID" ]; then
  echo "Failed to deploy:"
  echo "$DEPLOY" | jq
  exit 1
fi

echo "Started deployment: $DEPLOYMENT_ID"

echo ""
echo "=== Test 4: Wait for deployment ==="
for i in {1..24}; do
  DEPLOYMENT=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID")
  STATUS=$(echo "$DEPLOYMENT" | jq -r '.status')
  echo "Deployment status: $STATUS"

  if [ "$STATUS" = "running" ]; then
    echo "Deployment successful!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Deployment failed!"
    echo "$DEPLOYMENT" | jq
    exit 1
  fi

  if [ "$i" -eq 24 ]; then
    echo "Deployment timed out"
    exit 1
  fi

  sleep 5
done

echo ""
echo "=== Test 5: Verify service responds ==="
HOST_PORT=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq -r '.hostPort')
echo "Service running on port: $HOST_PORT"

if curl -sf "http://$SERVER_IP:$HOST_PORT" > /dev/null; then
  echo "Service is responding!"
else
  echo "Service failed to respond"
  exit 1
fi

echo ""
echo "=== Test 6: Cleanup - delete project ==="
DELETE_RESULT=$(api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID")
echo "Deleted project"

echo ""
echo "########################################"
echo "# Test Group 2: Multi-service networking"
echo "########################################"

echo ""
echo "=== Test 7: Create project with two services ==="
PROJECT2=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-multiservice"}')
PROJECT2_ID=$(echo "$PROJECT2" | jq -r '.id')
echo "Created project: $PROJECT2_ID"

BACKEND=$(api -X POST "$BASE_URL/api/projects/$PROJECT2_ID/services" \
  -d '{"name":"backend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
BACKEND_ID=$(echo "$BACKEND" | jq -r '.id')
echo "Created backend service: $BACKEND_ID"

FRONTEND=$(api -X POST "$BASE_URL/api/projects/$PROJECT2_ID/services" \
  -d '{"name":"frontend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
FRONTEND_ID=$(echo "$FRONTEND" | jq -r '.id')
echo "Created frontend service: $FRONTEND_ID"

echo ""
echo "=== Test 8: Deploy both services (sequentially to avoid port collision) ==="
DEPLOY_BACKEND=$(api -X POST "$BASE_URL/api/services/$BACKEND_ID/deploy")
DEPLOY_BACKEND_ID=$(echo "$DEPLOY_BACKEND" | jq -r '.deployment_id')
echo "Started backend deployment: $DEPLOY_BACKEND_ID"
wait_for_deployment "$DEPLOY_BACKEND_ID"

DEPLOY_FRONTEND=$(api -X POST "$BASE_URL/api/services/$FRONTEND_ID/deploy")
DEPLOY_FRONTEND_ID=$(echo "$DEPLOY_FRONTEND" | jq -r '.deployment_id')
echo "Started frontend deployment: $DEPLOY_FRONTEND_ID"
wait_for_deployment "$DEPLOY_FRONTEND_ID"

echo ""
echo "=== Test 9: Verify inter-service communication ==="
NETWORK_NAME="frost-net-$(echo $PROJECT2_ID | tr '[:upper:]' '[:lower:]')"
CURL_RESULT=$(remote "docker run --rm --network $NETWORK_NAME curlimages/curl -sf http://backend:80")
if echo "$CURL_RESULT" | grep -q "nginx"; then
  echo "Inter-service communication works!"
else
  echo "Inter-service communication failed"
  echo "Result: $CURL_RESULT"
  exit 1
fi

echo ""
echo "=== Test 10: Cleanup multi-service project ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT2_ID" > /dev/null
echo "Deleted project"

echo ""
echo "########################################"
echo "# Test Group 3: Env var inheritance"
echo "########################################"

echo ""
echo "=== Test 11: Create project with env vars ==="
PROJECT3=$(api -X POST "$BASE_URL/api/projects" \
  -d '{"name":"e2e-envtest","envVars":[{"key":"SHARED","value":"from-project"},{"key":"PROJECT_ONLY","value":"proj-val"}]}')
PROJECT3_ID=$(echo "$PROJECT3" | jq -r '.id')
echo "Created project with env vars: $PROJECT3_ID"

SERVICE3=$(api -X POST "$BASE_URL/api/projects/$PROJECT3_ID/services" \
  -d '{"name":"envcheck","deployType":"image","imageUrl":"nginx:alpine","containerPort":80,"envVars":[{"key":"SHARED","value":"from-service"},{"key":"SERVICE_ONLY","value":"svc-val"}]}')
SERVICE3_ID=$(echo "$SERVICE3" | jq -r '.id')
echo "Created service with env vars: $SERVICE3_ID"

echo ""
echo "=== Test 12: Deploy and verify env vars ==="
DEPLOY3=$(api -X POST "$BASE_URL/api/services/$SERVICE3_ID/deploy")
DEPLOY3_ID=$(echo "$DEPLOY3" | jq -r '.deployment_id')
wait_for_deployment "$DEPLOY3_ID"

CONTAINER_NAME="frost-${PROJECT3_ID}-envcheck"
CONTAINER_NAME=$(echo "$CONTAINER_NAME" | tr '[:upper:]' '[:lower:]')
SHARED_VAL=$(remote "docker exec $CONTAINER_NAME printenv SHARED")
PROJECT_ONLY_VAL=$(remote "docker exec $CONTAINER_NAME printenv PROJECT_ONLY")
SERVICE_ONLY_VAL=$(remote "docker exec $CONTAINER_NAME printenv SERVICE_ONLY")

echo "SHARED=$SHARED_VAL (expected: from-service)"
echo "PROJECT_ONLY=$PROJECT_ONLY_VAL (expected: proj-val)"
echo "SERVICE_ONLY=$SERVICE_ONLY_VAL (expected: svc-val)"

if [ "$SHARED_VAL" != "from-service" ]; then
  echo "FAILED: SHARED should be 'from-service' (service overrides project)"
  exit 1
fi
if [ "$PROJECT_ONLY_VAL" != "proj-val" ]; then
  echo "FAILED: PROJECT_ONLY should be 'proj-val'"
  exit 1
fi
if [ "$SERVICE_ONLY_VAL" != "svc-val" ]; then
  echo "FAILED: SERVICE_ONLY should be 'svc-val'"
  exit 1
fi
echo "Env var inheritance works!"

echo ""
echo "=== Test 13: Cleanup env test project ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT3_ID" > /dev/null
echo "Deleted project"

echo ""
echo "########################################"
echo "# Test Group 4: Service update + redeploy"
echo "########################################"

echo ""
echo "=== Test 14: Create service, deploy, update, redeploy ==="
PROJECT4=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-update"}')
PROJECT4_ID=$(echo "$PROJECT4" | jq -r '.id')
echo "Created project: $PROJECT4_ID"

SERVICE4=$(api -X POST "$BASE_URL/api/projects/$PROJECT4_ID/services" \
  -d '{"name":"updatetest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE4_ID=$(echo "$SERVICE4" | jq -r '.id')
echo "Created service: $SERVICE4_ID"

DEPLOY4=$(api -X POST "$BASE_URL/api/services/$SERVICE4_ID/deploy")
DEPLOY4_ID=$(echo "$DEPLOY4" | jq -r '.deployment_id')
wait_for_deployment "$DEPLOY4_ID"

HOST_PORT4=$(api "$BASE_URL/api/deployments/$DEPLOY4_ID" | jq -r '.hostPort')
RESPONSE1=$(curl -sf "http://$SERVER_IP:$HOST_PORT4")
if echo "$RESPONSE1" | grep -q "nginx"; then
  echo "v1 (nginx) deployed successfully"
else
  echo "v1 deployment check failed"
  exit 1
fi

echo ""
echo "=== Test 15: Update service to httpd and redeploy ==="
api -X PATCH "$BASE_URL/api/services/$SERVICE4_ID" \
  -d '{"imageUrl":"httpd:alpine","containerPort":80}' > /dev/null

DEPLOY4B=$(api -X POST "$BASE_URL/api/services/$SERVICE4_ID/deploy")
DEPLOY4B_ID=$(echo "$DEPLOY4B" | jq -r '.deployment_id')
wait_for_deployment "$DEPLOY4B_ID"

HOST_PORT4B=$(api "$BASE_URL/api/deployments/$DEPLOY4B_ID" | jq -r '.hostPort')
RESPONSE2=$(curl -sf "http://$SERVER_IP:$HOST_PORT4B")
if echo "$RESPONSE2" | grep -q "It works"; then
  echo "v2 (httpd) deployed successfully"
else
  echo "v2 deployment check failed"
  echo "Response: $RESPONSE2"
  exit 1
fi

OLD_STATUS=$(api "$BASE_URL/api/deployments/$DEPLOY4_ID" | jq -r '.status')
if [ "$OLD_STATUS" != "running" ]; then
  echo "Old deployment correctly stopped (status: $OLD_STATUS)"
else
  echo "WARNING: Old deployment still running"
fi

echo ""
echo "=== Test 16: Cleanup update test project ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT4_ID" > /dev/null
echo "Deleted project"

echo ""
echo "########################################"
echo "# Test Group 5: Domain & SSL"
echo "########################################"

echo ""
echo "=== Test 17: Enable SSL with staging certs ==="
FROST_DOMAIN="frost.$SERVER_IP.sslip.io"
SSL_RESULT=$(api -X POST "$BASE_URL/api/settings/enable-ssl" \
  -d "{\"domain\":\"$FROST_DOMAIN\",\"email\":\"frost-e2e@j4labs.se\",\"staging\":true}")
SSL_SUCCESS=$(echo "$SSL_RESULT" | jq -r '.success // .error')
echo "SSL enable result: $SSL_SUCCESS"
echo "Waiting for Caddy to stabilize..."
sleep 10

# After SSL is enabled, Caddy redirects HTTP to HTTPS on port 80
# Use port 3000 directly for remaining tests to bypass the redirect
BASE_URL="http://$SERVER_IP:3000"
echo "Switched to direct port 3000 for API calls"

echo ""
echo "=== Test 18: Create service and check system domain ==="
PROJECT5=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-domain"}')
PROJECT5_ID=$(echo "$PROJECT5" | jq -r '.id')
echo "Created project: $PROJECT5_ID"

SERVICE5=$(api -X POST "$BASE_URL/api/projects/$PROJECT5_ID/services" \
  -d '{"name":"domaintest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE5_ID=$(echo "$SERVICE5" | jq -r '.id')
echo "Created service: $SERVICE5_ID"

echo "Calling deploy API for service $SERVICE5_ID..."
DEPLOY5=$(api -X POST "$BASE_URL/api/services/$SERVICE5_ID/deploy")
echo "Deploy response: $DEPLOY5"
DEPLOY5_ID=$(echo "$DEPLOY5" | jq -r '.deployment_id')
if [ "$DEPLOY5_ID" = "null" ] || [ -z "$DEPLOY5_ID" ]; then
  echo "Deploy failed - deployment_id is null or empty"
  exit 1
fi
echo "Started deployment: $DEPLOY5_ID"
wait_for_deployment "$DEPLOY5_ID"

DOMAINS=$(api "$BASE_URL/api/services/$SERVICE5_ID/domains")
SYSTEM_DOMAIN=$(echo "$DOMAINS" | jq -r '.[0].domain')
DOMAIN_ID=$(echo "$DOMAINS" | jq -r '.[0].id')
echo "System domain: $SYSTEM_DOMAIN"

if [ "$SYSTEM_DOMAIN" = "null" ] || [ -z "$SYSTEM_DOMAIN" ]; then
  echo "No system domain found, skipping SSL tests"
else
  echo ""
  echo "=== Test 19: Verify DNS ==="
  DNS_RESULT=$(api -X POST "$BASE_URL/api/domains/$DOMAIN_ID/verify-dns")
  DNS_VALID=$(echo "$DNS_RESULT" | jq -r '.valid')
  echo "DNS valid: $DNS_VALID"

  if [ "$DNS_VALID" = "true" ]; then
    echo ""
    echo "=== Test 20: Wait for SSL ==="
    if wait_for_ssl "$DOMAIN_ID"; then
      echo ""
      echo "=== Test 21: Verify HTTPS works ==="
      if curl -sfk "https://$SYSTEM_DOMAIN" > /dev/null; then
        echo "HTTPS proxy works!"
      else
        echo "HTTPS request failed (non-fatal, cert may still be provisioning)"
      fi
    else
      echo "SSL verification timed out (non-fatal)"
    fi
  else
    echo "DNS not valid, skipping SSL tests"
  fi
fi

echo ""
echo "=== Test 22: Cleanup domain test project ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT5_ID" > /dev/null
echo "Deleted project"

echo ""
echo "########################################"
echo "# Test Group 6: GitHub Webhook"
echo "########################################"

echo ""
echo "=== Test 23: Webhook endpoint is public ==="
WEBHOOK_RESPONSE=$(curl -sS -X POST "$BASE_URL/api/github/webhook" 2>&1)
if echo "$WEBHOOK_RESPONSE" | grep -q '"error":"unauthorized"'; then
  echo "FAIL: Webhook endpoint blocked by auth middleware"
  exit 1
fi
echo "Webhook endpoint is public (returned: $(echo "$WEBHOOK_RESPONSE" | jq -r '.error // .message'))"

echo ""
echo "=== Test 24: Repo service has autoDeploy enabled by default ==="
PROJECT6=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-webhook"}')
PROJECT6_ID=$(echo "$PROJECT6" | jq -r '.id')
echo "Created project: $PROJECT6_ID"

SERVICE6=$(api -X POST "$BASE_URL/api/projects/$PROJECT6_ID/services" \
  -d '{"name":"webhook-test","repoUrl":"https://github.com/test/repo.git"}')
SERVICE6_ID=$(echo "$SERVICE6" | jq -r '.id')
AUTO_DEPLOY=$(echo "$SERVICE6" | jq -r '.autoDeploy')

if [ "$AUTO_DEPLOY" != "1" ]; then
  echo "FAIL: autoDeploy should be 1 for repo services, got: $AUTO_DEPLOY"
  exit 1
fi
echo "autoDeploy is enabled by default for repo services"

echo ""
echo "=== Test 25: autoDeploy toggle works ==="
api -X PATCH "$BASE_URL/api/services/$SERVICE6_ID" -d '{"autoDeployEnabled":false}' > /dev/null
SERVICE6_UPDATED=$(api "$BASE_URL/api/services/$SERVICE6_ID")
AUTO_DEPLOY_OFF=$(echo "$SERVICE6_UPDATED" | jq -r '.autoDeploy')

if [ "$AUTO_DEPLOY_OFF" != "0" ]; then
  echo "FAIL: autoDeploy should be 0 after disabling, got: $AUTO_DEPLOY_OFF"
  exit 1
fi
echo "autoDeploy toggle works"

echo ""
echo "=== Test 26: Cleanup webhook test project ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT6_ID" > /dev/null
echo "Deleted project"

echo ""
echo "=== Test 27: Webhook triggers deployment (full e2e) ==="
TEST_WEBHOOK_SECRET="e2e-test-webhook-secret-$(date +%s)"
echo "Installing sqlite3 if needed..."
remote "which sqlite3 || apt-get update && apt-get install -y sqlite3" > /dev/null 2>&1
echo "Setting up test GitHub App credentials..."
remote "sqlite3 /opt/frost/data/frost.db \"
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_id', 'test-app-id');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_slug', 'test-app');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_name', 'Test App');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_private_key', 'test-private-key');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_webhook_secret', '$TEST_WEBHOOK_SECRET');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_client_id', 'test-client-id');
INSERT OR REPLACE INTO settings (key, value) VALUES ('github_app_client_secret', 'test-client-secret');
\""
echo "Inserted test GitHub App credentials"

PROJECT7=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-webhook-deploy"}')
PROJECT7_ID=$(echo "$PROJECT7" | jq -r '.id')
echo "Created project: $PROJECT7_ID"

SERVICE7=$(api -X POST "$BASE_URL/api/projects/$PROJECT7_ID/services" \
  -d '{"name":"webhook-deploy-test","repoUrl":"https://github.com/elitan/frost.git","dockerfilePath":"test/fixtures/simple-node/Dockerfile"}')
SERVICE7_ID=$(echo "$SERVICE7" | jq -r '.id')
echo "Created service: $SERVICE7_ID"

COMMIT_SHA="e2etest$(date +%s)"
WEBHOOK_PAYLOAD=$(cat <<PAYLOAD
{"ref":"refs/heads/main","after":"$COMMIT_SHA","repository":{"default_branch":"main","clone_url":"https://github.com/elitan/frost.git","html_url":"https://github.com/elitan/frost"},"head_commit":{"message":"e2e test commit"}}
PAYLOAD
)
WEBHOOK_SIGNATURE="sha256=$(echo -n "$WEBHOOK_PAYLOAD" | openssl dgst -sha256 -hmac "$TEST_WEBHOOK_SECRET" | awk '{print $2}')"

echo "Sending webhook..."
WEBHOOK_RESULT=$(curl -sS -X POST "$BASE_URL/api/github/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $WEBHOOK_SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -d "$WEBHOOK_PAYLOAD")
echo "Webhook response: $WEBHOOK_RESULT"

TRIGGERED=$(echo "$WEBHOOK_RESULT" | jq -r '.deployments[0] // empty')
if [ -z "$TRIGGERED" ]; then
  echo "FAIL: Webhook did not trigger deployment"
  echo "Response: $WEBHOOK_RESULT"
  exit 1
fi
echo "Webhook triggered deployment: $TRIGGERED"

echo ""
echo "=== Test 28: Wait for webhook-triggered deployment ==="
wait_for_deployment "$TRIGGERED" 60

echo ""
echo "=== Test 29: Verify webhook-deployed service responds ==="
HOST_PORT7=$(api "$BASE_URL/api/deployments/$TRIGGERED" | jq -r '.hostPort')
echo "Service running on port: $HOST_PORT7"

RESPONSE7=$(curl -sf "http://$SERVER_IP:$HOST_PORT7" 2>&1 || true)
if echo "$RESPONSE7" | grep -q "Hello from simple-node"; then
  echo "Webhook-deployed service responds correctly!"
else
  echo "FAIL: Service response unexpected: $RESPONSE7"
  exit 1
fi

echo ""
echo "=== Test 30: Cleanup webhook deploy test ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT7_ID" > /dev/null
remote "sqlite3 /opt/frost/data/frost.db \"
DELETE FROM settings WHERE key LIKE 'github_app_%';
\""
echo "Deleted project and cleaned up test GitHub App credentials"

echo ""
echo "========================================="
echo "All E2E tests passed!"
echo "========================================="
