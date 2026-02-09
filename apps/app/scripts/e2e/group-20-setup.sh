#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== Web-based setup flow ==="

log "Checking if setup is already complete (e.g. upgrade scenario)..."
SETUP_STATUS=$(curl -s "$BASE_URL/api/setup" 2>/dev/null || echo '{}')
SETUP_COMPLETE=$(echo "$SETUP_STATUS" | jq -r '.setupComplete // empty')
if [ "$SETUP_COMPLETE" = "true" ]; then
  log "Setup already complete (via API), skipping test"
  pass
  exit 0
fi

ROOT_HEADERS=$(curl -s -D - -o /dev/null "$BASE_URL/" 2>/dev/null || true)
ROOT_STATUS=$(echo "$ROOT_HEADERS" | head -n1 | awk '{print $2}')
LOCATION=$(echo "$ROOT_HEADERS" | grep -i "^location:" | tr -d '\r' | cut -d' ' -f2 || echo "")
if [[ "$LOCATION" == *"/login"* ]]; then
  log "Redirects to /login (setup already complete), skipping test"
  pass
  exit 0
fi

log "Verifying API works with API key (even before web setup)..."
HEALTH=$(api "$BASE_URL/api/health")
OK=$(json_get "$HEALTH" '.ok')
if [ "$OK" != "true" ]; then
  fail "Health check failed: $HEALTH"
fi
log "API key auth works before setup"

log "Verifying session access redirects to /setup..."
REDIRECT_HEADERS=$(curl -s -D - -o /dev/null "$BASE_URL/" 2>/dev/null || true)
HTTP_CODE=$(echo "$REDIRECT_HEADERS" | head -n1 | awk '{print $2}')
if [ "$HTTP_CODE" != "302" ] && [ "$HTTP_CODE" != "307" ]; then
  fail "Expected redirect (302/307), got $HTTP_CODE"
fi

LOCATION=$(echo "$REDIRECT_HEADERS" | grep -i "^location:" | tr -d '\r' | cut -d' ' -f2)
if [[ "$LOCATION" != *"/setup"* ]]; then
  fail "Expected redirect to /setup, got $LOCATION"
fi
log "Session access correctly redirects to /setup"

log "Checking setup status via GET /api/setup..."
SETUP_STATUS=$(curl -s "$BASE_URL/api/setup")
SETUP_COMPLETE=$(echo "$SETUP_STATUS" | jq -r '.setupComplete')
if [ "$SETUP_COMPLETE" != "false" ]; then
  fail "Expected setupComplete=false, got $SETUP_COMPLETE"
fi
log "Setup not complete as expected"

log "Completing setup via POST /api/setup..."
SETUP_RESULT=$(curl -s -X POST "$BASE_URL/api/setup" \
  -H "Content-Type: application/json" \
  -d '{"password":"e2eTestPassword123"}')
SUCCESS=$(echo "$SETUP_RESULT" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  fail "Setup failed: $SETUP_RESULT"
fi
log "Setup completed successfully"

log "Verifying setup status changed..."
SETUP_STATUS=$(curl -s "$BASE_URL/api/setup")
SETUP_COMPLETE=$(echo "$SETUP_STATUS" | jq -r '.setupComplete')
if [ "$SETUP_COMPLETE" != "true" ]; then
  fail "Expected setupComplete=true after setup, got $SETUP_COMPLETE"
fi
log "Setup status confirmed as complete"

log "Verifying second setup attempt fails..."
SETUP_RESULT=$(curl -s -X POST "$BASE_URL/api/setup" \
  -H "Content-Type: application/json" \
  -d '{"password":"anotherPassword123"}')
ERROR=$(echo "$SETUP_RESULT" | jq -r '.error')
if [ "$ERROR" != "setup already complete" ]; then
  fail "Expected 'setup already complete' error, got: $SETUP_RESULT"
fi
log "Second setup correctly rejected"

log "Verifying session login now works..."
LOGIN_RESULT=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"e2eTestPassword123"}' \
  -c /tmp/frost-cookies.txt)
SUCCESS=$(echo "$LOGIN_RESULT" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  fail "Login failed: $LOGIN_RESULT"
fi
log "Session login works with new password"

log "Verifying session-based access no longer redirects..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/frost-cookies.txt "$BASE_URL/")
if [ "$HTTP_CODE" != "200" ]; then
  fail "Expected 200 with valid session, got $HTTP_CODE"
fi
log "Session-based access works"

rm -f /tmp/frost-cookies.txt

pass
