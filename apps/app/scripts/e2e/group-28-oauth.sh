#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

SETTINGS_LOCK="settings"
acquire_e2e_lock "$SETTINGS_LOCK" || fail "Could not acquire settings lock"
trap 'release_e2e_lock "$SETTINGS_LOCK"' EXIT

log "=== OAuth 2.1 flow ==="

log "Step 1: Check well-known metadata..."
RESOURCE_META=$(curl -s "$BASE_URL/.well-known/oauth-protected-resource")
RESOURCE=$(echo "$RESOURCE_META" | jq -r '.resource')
if [ -z "$RESOURCE" ] || [ "$RESOURCE" = "null" ]; then
  fail "Missing resource in protected-resource metadata"
fi
log "Resource: $RESOURCE"

AUTH_META=$(curl -s "$BASE_URL/.well-known/oauth-authorization-server")
ISSUER=$(echo "$AUTH_META" | jq -r '.issuer')
TOKEN_ENDPOINT=$(echo "$AUTH_META" | jq -r '.token_endpoint')
REG_ENDPOINT=$(echo "$AUTH_META" | jq -r '.registration_endpoint')
if [ -z "$ISSUER" ] || [ "$ISSUER" = "null" ]; then
  fail "Missing issuer in auth server metadata"
fi
log "Auth server metadata OK"

log "Step 2: Register client..."
CLIENT=$(curl -s -X POST "$REG_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"e2e-test","redirect_uris":["http://localhost:9999/callback"]}')
CLIENT_ID=$(echo "$CLIENT" | jq -r '.client_id')
if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "null" ]; then
  fail "Client registration failed: $CLIENT"
fi
log "Client registered: $CLIENT_ID"

ADMIN_PASSWORD="${ADMIN_PASSWORD:-e2eTestPassword123}"

log "Step 3: Login to get session cookie..."
LOGIN_RESULT=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" \
  -c /tmp/frost-oauth-cookies.txt)
LOGIN_OK=$(echo "$LOGIN_RESULT" | jq -r '.success')
if [ "$LOGIN_OK" != "true" ]; then
  fail "Login failed: $LOGIN_RESULT"
fi
log "Logged in"

log "Step 4: Generate PKCE challenge..."
CODE_VERIFIER=$(openssl rand -hex 32)
CODE_CHALLENGE=$(printf '%s' "$CODE_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
log "PKCE verifier generated"

log "Step 5: Authorize (POST approval with session cookie)..."
AUTHORIZE_URL="$BASE_URL/api/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=http://localhost:9999/callback&state=test-state&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256"

REDIRECT_RESPONSE=$(curl -s -D - -o /dev/null -X POST \
  -b /tmp/frost-oauth-cookies.txt \
  -d "action=approve" \
  "$AUTHORIZE_URL" 2>/dev/null)

LOCATION=$(echo "$REDIRECT_RESPONSE" | grep -i "^location:" | tr -d '\r' | cut -d' ' -f2)
if [ -z "$LOCATION" ]; then
  fail "No redirect after authorization"
fi

CODE=$(echo "$LOCATION" | sed -n 's/.*code=\([^&]*\).*/\1/p')
STATE=$(echo "$LOCATION" | sed -n 's/.*state=\([^&]*\).*/\1/p')
if [ -z "$CODE" ]; then
  fail "No authorization code in redirect: $LOCATION"
fi
if [ "$STATE" != "test-state" ]; then
  fail "State mismatch: expected test-state, got $STATE"
fi
log "Got authorization code"

log "Step 6: Exchange code for token..."
TOKEN_RESULT=$(curl -s -X POST "$TOKEN_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE\",\"redirect_uri\":\"http://localhost:9999/callback\",\"client_id\":\"$CLIENT_ID\",\"code_verifier\":\"$CODE_VERIFIER\"}")
ACCESS_TOKEN=$(echo "$TOKEN_RESULT" | jq -r '.access_token')
REFRESH_TOKEN=$(echo "$TOKEN_RESULT" | jq -r '.refresh_token')
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  fail "Token exchange failed: $TOKEN_RESULT"
fi
log "Got access token: ${ACCESS_TOKEN:0:20}..."

log "Step 7: Verify Bearer token works..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/api/projects")
if [ "$HTTP_CODE" != "200" ]; then
  fail "Bearer token auth failed: got $HTTP_CODE"
fi
log "Bearer token auth works"

log "Step 8: Verify invalid token rejected..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer frost_at_invalid_token" \
  "$BASE_URL/api/projects")
if [ "$HTTP_CODE" != "401" ]; then
  fail "Expected 401 for invalid token, got $HTTP_CODE"
fi
log "Invalid token correctly rejected"

log "Step 9: Refresh token..."
REFRESH_RESULT=$(curl -s -X POST "$TOKEN_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$REFRESH_TOKEN\",\"client_id\":\"$CLIENT_ID\"}")
NEW_ACCESS_TOKEN=$(echo "$REFRESH_RESULT" | jq -r '.access_token')
NEW_REFRESH_TOKEN=$(echo "$REFRESH_RESULT" | jq -r '.refresh_token')
if [ -z "$NEW_ACCESS_TOKEN" ] || [ "$NEW_ACCESS_TOKEN" = "null" ]; then
  fail "Token refresh failed: $REFRESH_RESULT"
fi
log "Token refreshed"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN" \
  "$BASE_URL/api/projects")
if [ "$HTTP_CODE" != "200" ]; then
  fail "New access token doesn't work: got $HTTP_CODE"
fi
log "New access token works"

log "Step 10: Old access token should fail after refresh..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/api/projects")
if [ "$HTTP_CODE" != "401" ]; then
  fail "Old access token should be invalid after refresh, got $HTTP_CODE"
fi
log "Old token correctly invalidated"

log "Step 11: Revoke token..."
curl -s -X POST "$BASE_URL/api/oauth/revoke" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$NEW_ACCESS_TOKEN\"}" > /dev/null

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN" \
  "$BASE_URL/api/projects")
if [ "$HTTP_CODE" != "401" ]; then
  fail "Revoked token should be invalid, got $HTTP_CODE"
fi
log "Token revocation works"

log "Step 12: Authorization code replay rejected..."
REPLAY_RESULT=$(curl -s -X POST "$TOKEN_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE\",\"redirect_uri\":\"http://localhost:9999/callback\",\"client_id\":\"$CLIENT_ID\",\"code_verifier\":\"$CODE_VERIFIER\"}")
REPLAY_ERROR=$(echo "$REPLAY_RESULT" | jq -r '.error')
if [ "$REPLAY_ERROR" != "invalid_grant" ]; then
  fail "Code replay should fail with invalid_grant, got: $REPLAY_RESULT"
fi
log "Code replay correctly rejected"

rm -f /tmp/frost-oauth-cookies.txt

pass
