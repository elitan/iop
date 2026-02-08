#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Domain & SSL ==="

log "Enabling SSL with staging certs..."
FROST_DOMAIN="frost.$SERVER_IP.sslip.io"
SSL_RESULT=$(api -X POST "$BASE_URL/api/settings/enable-ssl" \
  -d "{\"domain\":\"$FROST_DOMAIN\",\"email\":\"frost-e2e@j4labs.se\",\"staging\":true}" || true)
SSL_SUCCESS=$(json_get "$SSL_RESULT" '.success // empty')
SSL_ERROR=$(json_get "$SSL_RESULT" '.message // .error // empty')

if [ "$SSL_SUCCESS" = "true" ]; then
  log "SSL enable result: success"
elif [ "${E2E_LOCAL:-}" = "1" ] && echo "$SSL_ERROR" | grep -qi "caddy is not running"; then
  log "SSL enable skipped locally (no caddy): $SSL_ERROR"
else
  fail "SSL enable failed: $SSL_RESULT"
fi

log "Creating service to test custom domain..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-domain"}')
PROJECT_ID=$(require_field "$PROJECT" '.id' "create project") || fail "Failed to create project: $PROJECT"

ENV_ID=$(get_default_environment "$PROJECT_ID") || fail "Failed to get environment"
log "Using environment: $ENV_ID"
log "Created project: $PROJECT_ID"

SERVICE=$(api -X POST "$BASE_URL/api/environments/$ENV_ID/services" \
  -d '{"name":"domaintest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create service") || fail "Failed to create service: $SERVICE"
log "Created service: $SERVICE_ID"

sleep 1
DEPLOYS=$(api "$BASE_URL/api/services/$SERVICE_ID/deployments")
DEPLOY_ID=$(json_get "$DEPLOYS" '.[0].id')
if [ "$DEPLOY_ID" = "null" ] || [ -z "$DEPLOY_ID" ]; then
  DEPLOY=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/deploy")
  DEPLOY_ID=$(require_field "$DEPLOY" '.deploymentId' "trigger deploy") || fail "Failed to trigger deploy: $DEPLOY"
fi
log "Using deployment: $DEPLOY_ID"
wait_for_deployment "$DEPLOY_ID" || fail "Deployment failed"

log "Checking domains (no wildcard configured, should be empty)..."
DOMAINS=$(api "$BASE_URL/api/services/$SERVICE_ID/domains")
DOMAIN_COUNT=$(json_get "$DOMAINS" 'length') || DOMAIN_COUNT=0
log "Domain count: $DOMAIN_COUNT"

if [ "$DOMAIN_COUNT" -eq 0 ]; then
  log "No auto-generated domain (expected without wildcard config)"
fi

log "Testing custom domain addition..."
CUSTOM_DOMAIN="test-custom.$SERVER_IP.sslip.io"
ADD_RESULT=$(api -X POST "$BASE_URL/api/services/$SERVICE_ID/domains" \
  -d "{\"domain\":\"$CUSTOM_DOMAIN\",\"type\":\"proxy\"}")
ADD_DOMAIN_ID=$(json_get "$ADD_RESULT" '.id')
log "Added custom domain with id: $ADD_DOMAIN_ID"

if [ "$ADD_DOMAIN_ID" != "null" ] && [ -n "$ADD_DOMAIN_ID" ]; then
  log "Verifying DNS for custom domain..."
  DNS_RESULT=$(api -X POST "$BASE_URL/api/domains/$ADD_DOMAIN_ID/verify-dns")
  DNS_VALID=$(json_get "$DNS_RESULT" '.valid')
  log "DNS valid: $DNS_VALID"

  log "Deleting custom domain..."
  api -X DELETE "$BASE_URL/api/domains/$ADD_DOMAIN_ID" > /dev/null
fi

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null

pass
