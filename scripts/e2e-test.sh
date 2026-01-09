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
echo "=== Test 2: Create service (auto-deploys) ==="
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
echo "=== Test 3: Get auto-deployment ==="
sleep 2
DEPLOYMENT_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id // empty')

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "No auto-deployment found, triggering manual deploy..."
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOYMENT_ID=$(echo "$DEPLOY" | jq -r '.deployment_id')
fi

if [ "$DEPLOYMENT_ID" = "null" ] || [ -z "$DEPLOYMENT_ID" ]; then
  echo "Failed to get deployment"
  exit 1
fi

echo "Using deployment: $DEPLOYMENT_ID"

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
echo "=== Test 7: Create project with two services (auto-deploys) ==="
PROJECT2=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-multiservice"}')
PROJECT2_ID=$(echo "$PROJECT2" | jq -r '.id')
echo "Created project: $PROJECT2_ID"

BACKEND=$(api -X POST "$BASE_URL/api/projects/$PROJECT2_ID/services" \
  -d '{"name":"backend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
BACKEND_ID=$(echo "$BACKEND" | jq -r '.id')
echo "Created backend service: $BACKEND_ID"

sleep 1

FRONTEND=$(api -X POST "$BASE_URL/api/projects/$PROJECT2_ID/services" \
  -d '{"name":"frontend","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
FRONTEND_ID=$(echo "$FRONTEND" | jq -r '.id')
echo "Created frontend service: $FRONTEND_ID"

echo ""
echo "=== Test 8: Wait for auto-deployments ==="
sleep 2
DEPLOY_BACKEND_ID=$(api "$BASE_URL/api/services/$BACKEND_ID/deployments" | jq -r '.[0].id')
echo "Backend deployment: $DEPLOY_BACKEND_ID"
wait_for_deployment "$DEPLOY_BACKEND_ID"

DEPLOY_FRONTEND_ID=$(api "$BASE_URL/api/services/$FRONTEND_ID/deployments" | jq -r '.[0].id')
echo "Frontend deployment: $DEPLOY_FRONTEND_ID"
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
echo "=== Test 12: Wait for auto-deployment and verify env vars ==="
sleep 2
DEPLOY3_ID=$(api "$BASE_URL/api/services/$SERVICE3_ID/deployments" | jq -r '.[0].id')
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
echo "=== Test 14: Create service and wait for auto-deployment ==="
PROJECT4=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-update"}')
PROJECT4_ID=$(echo "$PROJECT4" | jq -r '.id')
echo "Created project: $PROJECT4_ID"

SERVICE4=$(api -X POST "$BASE_URL/api/projects/$PROJECT4_ID/services" \
  -d '{"name":"updatetest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE4_ID=$(echo "$SERVICE4" | jq -r '.id')
echo "Created service: $SERVICE4_ID"

sleep 2
DEPLOY4_ID=$(api "$BASE_URL/api/services/$SERVICE4_ID/deployments" | jq -r '.[0].id')
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

sleep 2
DEPLOY5_ID=$(api "$BASE_URL/api/services/$SERVICE5_ID/deployments" | jq -r '.[0].id')
if [ "$DEPLOY5_ID" = "null" ] || [ -z "$DEPLOY5_ID" ]; then
  echo "No auto-deployment found - triggering manual deploy"
  DEPLOY5=$(api -X POST "$BASE_URL/api/services/$SERVICE5_ID/deploy")
  DEPLOY5_ID=$(echo "$DEPLOY5" | jq -r '.deployment_id')
fi
echo "Using deployment: $DEPLOY5_ID"
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

sleep 2
DEPLOY7_INITIAL=$(api "$BASE_URL/api/services/$SERVICE7_ID/deployments" | jq -r '.[0].id')
echo "Waiting for initial auto-deployment: $DEPLOY7_INITIAL"
wait_for_deployment "$DEPLOY7_INITIAL" 60

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
echo "########################################"
echo "# Test Group 7: Database Services"
echo "########################################"

echo ""
echo "=== Test 31: Get database templates ==="
TEMPLATES=$(api "$BASE_URL/api/db-templates")
POSTGRES_FOUND=$(echo "$TEMPLATES" | jq -r '.[] | select(.id == "postgres-17") | .id')
if [ "$POSTGRES_FOUND" != "postgres-17" ]; then
  echo "FAIL: postgres-17 template not found"
  exit 1
fi
echo "Database templates available (postgres-17 found)"

echo ""
echo "=== Test 32: Create database service ==="
PROJECT8=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-database"}')
PROJECT8_ID=$(echo "$PROJECT8" | jq -r '.id')
echo "Created project: $PROJECT8_ID"

SERVICE8=$(api -X POST "$BASE_URL/api/projects/$PROJECT8_ID/services" \
  -d '{"name":"postgres","deployType":"database","templateId":"postgres-17"}')
SERVICE8_ID=$(echo "$SERVICE8" | jq -r '.id')
SERVICE8_TYPE=$(echo "$SERVICE8" | jq -r '.serviceType')

if [ "$SERVICE8_ID" = "null" ] || [ -z "$SERVICE8_ID" ]; then
  echo "FAIL: Failed to create database service"
  echo "$SERVICE8" | jq
  exit 1
fi

if [ "$SERVICE8_TYPE" != "database" ]; then
  echo "FAIL: Service type should be 'database', got: $SERVICE8_TYPE"
  exit 1
fi
echo "Created database service: $SERVICE8_ID (type: $SERVICE8_TYPE)"

echo ""
echo "=== Test 32b: Verify database service has no system domain ==="
DOMAINS8=$(api "$BASE_URL/api/services/$SERVICE8_ID/domains")
DOMAIN_COUNT=$(echo "$DOMAINS8" | jq 'length')
if [ "$DOMAIN_COUNT" != "0" ]; then
  echo "FAIL: Database service should not have domains, got: $DOMAIN_COUNT"
  exit 1
fi
echo "Database service has no system domain (correct!)"

echo ""
echo "=== Test 33: Verify database env vars ==="
SERVICE8_ENVVARS=$(echo "$SERVICE8" | jq -r '.envVars')
POSTGRES_USER=$(echo "$SERVICE8_ENVVARS" | jq -r '.[] | select(.key == "POSTGRES_USER") | .value')
POSTGRES_PASSWORD=$(echo "$SERVICE8_ENVVARS" | jq -r '.[] | select(.key == "POSTGRES_PASSWORD") | .value')

if [ -z "$POSTGRES_USER" ]; then
  echo "FAIL: POSTGRES_USER not set"
  exit 1
fi
if [ -z "$POSTGRES_PASSWORD" ] || [ ${#POSTGRES_PASSWORD} -lt 16 ]; then
  echo "FAIL: POSTGRES_PASSWORD not generated or too short"
  exit 1
fi
echo "Database credentials auto-generated (password length: ${#POSTGRES_PASSWORD})"

echo ""
echo "=== Test 33b: Verify SSL cert generated for postgres ==="
SSL_CERT_EXISTS=$(remote "test -f /opt/frost/data/ssl/$SERVICE8_ID/server.crt && echo 'exists'" 2>&1)
SSL_KEY_EXISTS=$(remote "test -f /opt/frost/data/ssl/$SERVICE8_ID/server.key && echo 'exists'" 2>&1)
if [ "$SSL_CERT_EXISTS" != "exists" ] || [ "$SSL_KEY_EXISTS" != "exists" ]; then
  echo "FAIL: SSL cert/key not generated for postgres service"
  exit 1
fi
echo "SSL certificate generated for postgres service"

echo ""
echo "=== Test 34: Wait for database auto-deployment ==="
sleep 3
DEPLOY8_ID=$(api "$BASE_URL/api/services/$SERVICE8_ID/deployments" | jq -r '.[0].id')
echo "Using deployment: $DEPLOY8_ID"
wait_for_deployment "$DEPLOY8_ID" 45

echo ""
echo "=== Test 35: Verify database is accepting connections ==="
HOST_PORT8=$(api "$BASE_URL/api/deployments/$DEPLOY8_ID" | jq -r '.hostPort')
echo "Database running on port: $HOST_PORT8"

PG_READY=$(remote "timeout 10 bash -c 'until pg_isready -h localhost -p $HOST_PORT8; do sleep 1; done' && echo 'ready'" 2>&1 || echo "not ready")
if echo "$PG_READY" | grep -q "ready"; then
  echo "PostgreSQL is accepting connections!"
else
  echo "PostgreSQL connection check (non-fatal): $PG_READY"
fi

echo ""
echo "=== Test 35b: Verify SSL is enabled in build log ==="
BUILD_LOG=$(api "$BASE_URL/api/deployments/$DEPLOY8_ID" | jq -r '.buildLog')
if echo "$BUILD_LOG" | grep -q "SSL enabled for postgres"; then
  echo "SSL enabled in postgres deployment"
else
  echo "FAIL: SSL enabled message not found in build log"
  exit 1
fi

echo ""
echo "=== Test 36: Verify volume was created ==="
EXPECTED_VOLUME="frost-${SERVICE8_ID}-data"
VOLUME_EXISTS=$(remote "docker volume ls --filter name=$EXPECTED_VOLUME --format '{{.Name}}'" 2>&1)
if echo "$VOLUME_EXISTS" | grep -q "$EXPECTED_VOLUME"; then
  echo "Volume created: $EXPECTED_VOLUME"
else
  echo "FAIL: Volume $EXPECTED_VOLUME not found"
  exit 1
fi

echo ""
echo "=== Test 37: Delete database service and verify cleanup ==="
api -X DELETE "$BASE_URL/api/services/$SERVICE8_ID" > /dev/null
sleep 2

VOLUME_AFTER=$(remote "docker volume ls --filter name=$EXPECTED_VOLUME --format '{{.Name}}'" 2>&1)
if echo "$VOLUME_AFTER" | grep -q "$EXPECTED_VOLUME"; then
  echo "FAIL: Volume should have been deleted"
  exit 1
fi
echo "Volume deleted with service"

echo ""
echo "=== Test 37b: Verify SSL cert deleted with service ==="
SSL_CERT_AFTER=$(remote "test -f /opt/frost/data/ssl/$SERVICE8_ID/server.crt && echo 'exists' || echo 'deleted'" 2>&1)
if [ "$SSL_CERT_AFTER" = "exists" ]; then
  echo "FAIL: SSL cert should have been deleted"
  exit 1
fi
echo "SSL certificate deleted with service"

echo ""
echo "=== Test 38: Cleanup database test project ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT8_ID" > /dev/null
echo "Deleted project"

echo ""
echo "########################################"
echo "# Test Group 8: Rollback"
echo "########################################"

echo ""
echo "=== Test 39: Create service (auto-deploys) and deploy again ==="
PROJECT9=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-rollback"}')
PROJECT9_ID=$(echo "$PROJECT9" | jq -r '.id')
echo "Created project: $PROJECT9_ID"

SERVICE9=$(api -X POST "$BASE_URL/api/projects/$PROJECT9_ID/services" \
  -d '{"name":"rollback-test","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE9_ID=$(echo "$SERVICE9" | jq -r '.id')
echo "Created service: $SERVICE9_ID"

sleep 2
DEPLOY9A_ID=$(api "$BASE_URL/api/services/$SERVICE9_ID/deployments" | jq -r '.[0].id')
echo "First deployment (auto): $DEPLOY9A_ID"
wait_for_deployment "$DEPLOY9A_ID"

DEPLOY9B=$(api -X POST "$BASE_URL/api/services/$SERVICE9_ID/deploy")
DEPLOY9B_ID=$(echo "$DEPLOY9B" | jq -r '.deployment_id')
echo "Second deployment (manual): $DEPLOY9B_ID"
wait_for_deployment "$DEPLOY9B_ID"

echo ""
echo "=== Test 40: Verify deployment has snapshot data ==="
DEPLOY9B_DATA=$(api "$BASE_URL/api/deployments/$DEPLOY9B_ID")
IMAGE_NAME=$(echo "$DEPLOY9B_DATA" | jq -r '.imageName')
ROLLBACK_ELIGIBLE=$(echo "$DEPLOY9B_DATA" | jq -r '.rollbackEligible')

if [ "$IMAGE_NAME" = "null" ] || [ -z "$IMAGE_NAME" ]; then
  echo "FAIL: Deployment should have imageName snapshot"
  exit 1
fi
echo "Deployment has imageName: $IMAGE_NAME"

if [ "$ROLLBACK_ELIGIBLE" != "1" ]; then
  echo "FAIL: Deployment should be rollback-eligible (got: $ROLLBACK_ELIGIBLE)"
  exit 1
fi
echo "Deployment is rollback-eligible"

echo ""
echo "=== Test 41: Rollback to first deployment ==="
DEPLOY9A_UPDATED=$(api "$BASE_URL/api/deployments/$DEPLOY9A_ID")
DEPLOY9A_IMAGE=$(echo "$DEPLOY9A_UPDATED" | jq -r '.imageName')
DEPLOY9A_ELIGIBLE=$(echo "$DEPLOY9A_UPDATED" | jq -r '.rollbackEligible')
echo "First deployment image: $DEPLOY9A_IMAGE, eligible: $DEPLOY9A_ELIGIBLE"

ROLLBACK_RESULT=$(api -X POST "$BASE_URL/api/deployments/$DEPLOY9A_ID/rollback")
ROLLBACK_DEPLOY_ID=$(echo "$ROLLBACK_RESULT" | jq -r '.deployment_id')

if [ "$ROLLBACK_DEPLOY_ID" = "null" ] || [ -z "$ROLLBACK_DEPLOY_ID" ]; then
  echo "FAIL: Rollback did not return deployment_id"
  echo "Response: $ROLLBACK_RESULT"
  exit 1
fi
if [ "$ROLLBACK_DEPLOY_ID" != "$DEPLOY9A_ID" ]; then
  echo "FAIL: Rollback should reactivate same deployment (expected $DEPLOY9A_ID, got $ROLLBACK_DEPLOY_ID)"
  exit 1
fi
echo "Rollback reactivating deployment: $ROLLBACK_DEPLOY_ID"

echo ""
echo "=== Test 42: Wait for rollback deployment ==="
wait_for_deployment "$ROLLBACK_DEPLOY_ID"

SERVICE9_UPDATED=$(api "$BASE_URL/api/services/$SERVICE9_ID")
CURRENT_DEPLOY_ID=$(echo "$SERVICE9_UPDATED" | jq -r '.currentDeploymentId')
if [ "$CURRENT_DEPLOY_ID" != "$DEPLOY9A_ID" ]; then
  echo "FAIL: Service currentDeploymentId should be $DEPLOY9A_ID (got: $CURRENT_DEPLOY_ID)"
  exit 1
fi
echo "Service currentDeploymentId correctly updated to rolled-back deployment"

echo ""
echo "=== Test 43: Verify rollback service responds ==="
HOST_PORT9=$(api "$BASE_URL/api/deployments/$ROLLBACK_DEPLOY_ID" | jq -r '.hostPort')
echo "Service running on port: $HOST_PORT9"

if curl -sf "http://$SERVER_IP:$HOST_PORT9" > /dev/null; then
  echo "Rollback service is responding!"
else
  echo "FAIL: Rollback service failed to respond"
  exit 1
fi

echo ""
echo "=== Test 44: Verify rollback blocked for database services ==="
SERVICE9_DB=$(api -X POST "$BASE_URL/api/projects/$PROJECT9_ID/services" \
  -d '{"name":"db-rollback-test","deployType":"database","templateId":"postgres-17"}')
SERVICE9_DB_ID=$(echo "$SERVICE9_DB" | jq -r '.id')
echo "Created database service: $SERVICE9_DB_ID"

sleep 3
DEPLOY9_DB_ID=$(api "$BASE_URL/api/services/$SERVICE9_DB_ID/deployments" | jq -r '.[0].id')
echo "Using database deployment: $DEPLOY9_DB_ID"
wait_for_deployment "$DEPLOY9_DB_ID" 45

ROLLBACK_DB_RESULT=$(curl -sS -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" \
  -X POST "$BASE_URL/api/deployments/$DEPLOY9_DB_ID/rollback" -w "\n%{http_code}")
ROLLBACK_DB_STATUS=$(echo "$ROLLBACK_DB_RESULT" | tail -1)
ROLLBACK_DB_BODY=$(echo "$ROLLBACK_DB_RESULT" | head -n -1)

if [ "$ROLLBACK_DB_STATUS" = "400" ]; then
  echo "Rollback correctly blocked for database service (400)"
else
  echo "FAIL: Rollback should return 400 for database services (got: $ROLLBACK_DB_STATUS)"
  echo "Body: $ROLLBACK_DB_BODY"
  exit 1
fi

echo ""
echo "=== Test 45: Cleanup rollback test project ==="
api -X DELETE "$BASE_URL/api/projects/$PROJECT9_ID" > /dev/null
echo "Deleted project"

echo ""
echo "========================================="
echo "All E2E tests passed!"
echo "========================================="
