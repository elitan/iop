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

log "Creating service BEFORE wildcard config..."
PRE_PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-backfill"}')
PRE_PROJECT_ID=$(echo "$PRE_PROJECT" | jq -r '.id')
log "Created pre-wildcard project: $PRE_PROJECT_ID"

PRE_SERVICE=$(api -X POST "$BASE_URL/api/projects/$PRE_PROJECT_ID/services" \
  -d '{"name":"backfilltest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
PRE_SERVICE_ID=$(echo "$PRE_SERVICE" | jq -r '.id')
log "Created pre-wildcard service: $PRE_SERVICE_ID"

sleep 1

log "Verifying no domain before wildcard..."
PRE_DOMAINS=$(api "$BASE_URL/api/services/$PRE_SERVICE_ID/domains")
PRE_COUNT=$(echo "$PRE_DOMAINS" | jq 'length')
log "Domain count before wildcard: $PRE_COUNT"

if [ "$PRE_COUNT" -ne 0 ]; then
  fail "Expected no domains before wildcard enabled"
fi

log "Configuring wildcard domain..."
WILDCARD_RESULT=$(api -X POST "$BASE_URL/api/settings/wildcard" \
  -d "{\"wildcardDomain\":\"$WILDCARD_DOMAIN\",\"dnsProvider\":\"cloudflare\",\"dnsApiToken\":\"$CLOUDFLARE_TOKEN\"}")
WILDCARD_SUCCESS=$(echo "$WILDCARD_RESULT" | jq -r '.success // .error')
DNS_WARNING=$(echo "$WILDCARD_RESULT" | jq -r '.dnsWarning // empty')
BACKFILLED=$(echo "$WILDCARD_RESULT" | jq -r '.backfilledCount // 0')
log "Wildcard config result: $WILDCARD_SUCCESS"
log "Backfilled count: $BACKFILLED"
if [ -n "$DNS_WARNING" ]; then
  log "DNS warning: $DNS_WARNING"
else
  log "DNS A record created successfully"
fi

log "Verifying wildcard is configured..."
WILDCARD_STATUS=$(api "$BASE_URL/api/settings/wildcard")
WILDCARD_CONFIGURED=$(echo "$WILDCARD_STATUS" | jq -r '.configured')
log "Wildcard configured: $WILDCARD_CONFIGURED"

if [ "$WILDCARD_CONFIGURED" != "true" ]; then
  fail "Failed to configure wildcard domain"
fi

log "Verifying backfill created domain for existing service..."
BACKFILL_DOMAINS=$(api "$BASE_URL/api/services/$PRE_SERVICE_ID/domains")
BACKFILL_COUNT=$(echo "$BACKFILL_DOMAINS" | jq 'length')
BACKFILL_DOMAIN=$(echo "$BACKFILL_DOMAINS" | jq -r '.[0].domain // empty')
log "Domain count after backfill: $BACKFILL_COUNT"
log "Backfilled domain: $BACKFILL_DOMAIN"

if [ "$BACKFILL_COUNT" -eq 0 ]; then
  fail "Expected backfilled domain for existing service"
fi

if [[ "$BACKFILL_DOMAIN" != *"$WILDCARD_DOMAIN" ]]; then
  fail "Backfilled domain doesn't match wildcard pattern"
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

if [[ "$SYSTEM_DOMAIN" != *"$WILDCARD_DOMAIN" ]]; then
  fail "System domain doesn't match wildcard pattern"
fi
log "Domain matches expected pattern"

log "Cleanup..."
api -X DELETE "$BASE_URL/api/projects/$PRE_PROJECT_ID" > /dev/null
api -X DELETE "$BASE_URL/api/projects/$PROJECT_ID" > /dev/null
api -X DELETE "$BASE_URL/api/settings/wildcard" > /dev/null

pass
