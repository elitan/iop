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
TOKEN_VALID=$(json_get "$TEST_RESULT" '.valid')
log "Token valid: $TOKEN_VALID"

if [ "$TOKEN_VALID" != "true" ]; then
  log "Invalid Cloudflare token, skipping wildcard tests"
  pass
  exit 0
fi

log "Creating service BEFORE wildcard config..."
PRE_PROJECT=$(api -X POST "$BASE_URL/api/projects" -d '{"name":"e2e-backfill"}')
PRE_PROJECT_ID=$(require_field "$PRE_PROJECT" '.id' "create pre-wildcard project") || fail "Failed to create pre-wildcard project: $PRE_PROJECT"
log "Created pre-wildcard project: $PRE_PROJECT_ID"

PRE_SERVICE=$(api -X POST "$BASE_URL/api/projects/$PRE_PROJECT_ID/services" \
  -d '{"name":"backfilltest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
PRE_SERVICE_ID=$(require_field "$PRE_SERVICE" '.id' "create pre-wildcard service") || fail "Failed to create pre-wildcard service: $PRE_SERVICE"
log "Created pre-wildcard service: $PRE_SERVICE_ID"

sleep 1

log "Verifying no domain before wildcard..."
PRE_DOMAINS=$(api "$BASE_URL/api/services/$PRE_SERVICE_ID/domains")
PRE_COUNT=$(json_get "$PRE_DOMAINS" 'length') || PRE_COUNT=0
log "Domain count before wildcard: $PRE_COUNT"

if [ "$PRE_COUNT" -ne 0 ]; then
  fail "Expected no domains before wildcard enabled"
fi

log "Configuring wildcard domain..."
WILDCARD_RESULT=$(api -X POST "$BASE_URL/api/settings/wildcard" \
  -d "{\"wildcardDomain\":\"$WILDCARD_DOMAIN\",\"dnsProvider\":\"cloudflare\",\"dnsApiToken\":\"$CLOUDFLARE_TOKEN\"}")
WILDCARD_SUCCESS=$(json_get "$WILDCARD_RESULT" '.success // .error')
DNS_WARNING=$(json_get "$WILDCARD_RESULT" '.dnsWarning // empty')
BACKFILLED=$(json_get "$WILDCARD_RESULT" '.backfilledCount // 0')
log "Wildcard config result: $WILDCARD_SUCCESS"
log "Backfilled count: $BACKFILLED"
if [ -n "$DNS_WARNING" ] && [ "$DNS_WARNING" != "null" ]; then
  log "DNS warning: $DNS_WARNING"
else
  log "DNS A record created successfully"
fi

log "Verifying wildcard is configured..."
WILDCARD_STATUS=$(api "$BASE_URL/api/settings/wildcard")
WILDCARD_CONFIGURED=$(json_get "$WILDCARD_STATUS" '.configured')
log "Wildcard configured: $WILDCARD_CONFIGURED"

if [ "$WILDCARD_CONFIGURED" != "true" ]; then
  fail "Failed to configure wildcard domain. Response: $WILDCARD_STATUS"
fi

log "Verifying backfill created domain for existing service..."
BACKFILL_DOMAINS=$(api "$BASE_URL/api/services/$PRE_SERVICE_ID/domains")
BACKFILL_COUNT=$(json_get "$BACKFILL_DOMAINS" 'length') || BACKFILL_COUNT=0
BACKFILL_DOMAIN=$(json_get "$BACKFILL_DOMAINS" '.[0].domain // empty')
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
PROJECT_ID=$(require_field "$PROJECT" '.id' "create wildcard project") || fail "Failed to create wildcard project: $PROJECT"
log "Created project: $PROJECT_ID"

SERVICE=$(api -X POST "$BASE_URL/api/projects/$PROJECT_ID/services" \
  -d '{"name":"wildcardtest","deployType":"image","imageUrl":"nginx:alpine","containerPort":80}')
SERVICE_ID=$(require_field "$SERVICE" '.id' "create wildcard service") || fail "Failed to create wildcard service: $SERVICE"
log "Created service: $SERVICE_ID"

sleep 2

log "Checking auto-generated domain..."
DOMAINS=$(api "$BASE_URL/api/services/$SERVICE_ID/domains")
DOMAIN_COUNT=$(json_get "$DOMAINS" 'length') || DOMAIN_COUNT=0
SYSTEM_DOMAIN=$(json_get "$DOMAINS" '.[0].domain // empty')
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
