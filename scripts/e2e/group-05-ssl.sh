#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Domain & SSL ==="

log "Enabling SSL with staging certs..."
FROST_DOMAIN="frost.$SERVER_IP.sslip.io"
SSL_RESULT=$(api -X POST "$BASE_URL/api/settings/enable-ssl" \
  -d "{\"domain\":\"$FROST_DOMAIN\",\"email\":\"frost-e2e@j4labs.se\",\"staging\":true}")
SSL_SUCCESS=$(echo "$SSL_RESULT" | jq -r '.success // .error')
log "SSL enable result: $SSL_SUCCESS"

log "Creating service to test custom domain..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-domain"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
log "Created project: $PROJECT_ID"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"domaintest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
log "Created service: $SERVICE_ID"

sleep 1
DEPLOY_ID=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments" | jq -r '.[0].id')
if [ "$DEPLOY_ID" = "null" ] || [ -z "$DEPLOY_ID" ]; then
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOY_ID=$(echo "$DEPLOY" | jq -r '.deploymentId')
fi
log "Using deployment: $DEPLOY_ID"
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

log "Checking domains (no wildcard configured, should be empty)..."
DOMAINS=$(api "$BASE_URL/api/services/$SERVICE_ID/domains")
DOMAIN_COUNT=$(echo "$DOMAINS" | jq 'length')
log "Domain count: $DOMAIN_COUNT"

if [ "$DOMAIN_COUNT" -eq 0 ]; then
  log "No auto-generated domain (expected without wildcard config)"
fi

log "Testing custom domain addition..."
CUSTOM_DOMAIN="test-custom.$SERVER_IP.sslip.io"
ADD_RESULT=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/domains" \
  -d "{\"domain\":\"$CUSTOM_DOMAIN\",\"type\":\"proxy\"}")
ADD_DOMAIN_ID=$(echo "$ADD_RESULT" | jq -r '.id')
log "Added custom domain with id: $ADD_DOMAIN_ID"

if [ "$ADD_DOMAIN_ID" != "null" ] && [ -n "$ADD_DOMAIN_ID" ]; then
  log "Verifying DNS for custom domain..."
  DNS_RESULT=$(api -X POST "$BASE_URL/api/domains/$ADD_DOMAIN_ID/verify-dns")
  DNS_VALID=$(echo "$DNS_RESULT" | jq -r '.valid')
  log "DNS valid: $DNS_VALID"

  log "Deleting custom domain..."
  api -X DELETE "$BASE_URL/api/domains/$ADD_DOMAIN_ID" > /dev/null
fi

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
