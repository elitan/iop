#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Wildcard Domain ==="

if [ -z "$CLOUDFLARE_TOKEN" ] || [ -z "$WILDCARD_DOMAIN" ]; then
  log "Skipping wildcard tests: CLOUDFLARE_TOKEN and WILDCARD_DOMAIN not set"
  pass
  exit 0
fi

log "Testing Cloudflare token..."
TEST_RESULT=$(api -X POST "$BASE_URL/api/settings/wildcard/test" \
  -d "{\"dnsProvider\":\"cloudflare\",\"dnsApiToken\":\"$CLOUDFLARE_TOKEN\"}")
TOKEN_VALID=$(echo "$TEST_RESULT" | jq -r '.valid')
log "Token valid: $TOKEN_VALID"

if [ "$TOKEN_VALID" != "true" ]; then
  log "Invalid Cloudflare token, skipping wildcard tests"
  pass
  exit 0
fi

log "Configuring wildcard domain..."
WILDCARD_RESULT=$(api -X POST "$BASE_URL/api/settings/wildcard" \
  -d "{\"wildcardDomain\":\"$WILDCARD_DOMAIN\",\"dnsProvider\":\"cloudflare\",\"dnsApiToken\":\"$CLOUDFLARE_TOKEN\"}")
WILDCARD_SUCCESS=$(echo "$WILDCARD_RESULT" | jq -r '.success // .error')
log "Wildcard config result: $WILDCARD_SUCCESS"

log "Verifying wildcard is configured..."
WILDCARD_STATUS=$(api "$BASE_URL/api/settings/wildcard")
WILDCARD_CONFIGURED=$(echo "$WILDCARD_STATUS" | jq -r '.configured')
log "Wildcard configured: $WILDCARD_CONFIGURED"

if [ "$WILDCARD_CONFIGURED" != "true" ]; then
  fail "Failed to configure wildcard domain"
fi

log "Creating service to test auto-domain..."
PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-wildcard"}')
PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
log "Created project: $PROJECT_ID"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"wildcardtest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(echo "$SERVICE" | jq -r '.id')
log "Created service: $SERVICE_ID"

sleep 2

log "Checking auto-generated domain..."
DOMAINS=$(api "$BASE_URL/api/services/$SERVICE_ID/domains")
DOMAIN_COUNT=$(echo "$DOMAINS" | jq 'length')
SYSTEM_DOMAIN=$(echo "$DOMAINS" | jq -r '.[0].domain // empty')
log "Domain count: $DOMAIN_COUNT"
log "System domain: $SYSTEM_DOMAIN"

if [ "$DOMAIN_COUNT" -eq 0 ]; then
  fail "Expected auto-generated wildcard domain"
fi

EXPECTED_PATTERN="wildcardtest-e2e-wildcard.$WILDCARD_DOMAIN"
if [[ "$SYSTEM_DOMAIN" != *"$WILDCARD_DOMAIN" ]]; then
  fail "System domain doesn't match wildcard pattern"
fi
log "Domain matches expected pattern"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null
api -X DELETE "$BASE_URL/api/settings/wildcard" > /dev/null

pass
