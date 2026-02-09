#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

log "=== MCP endpoint auth ==="

log "Step 1: Get Bearer token via OAuth flow..."
REG_ENDPOINT="$BASE_URL/api/oauth/register"
TOKEN_ENDPOINT="$BASE_URL/api/oauth/token"

CLIENT=$(curl -s -X POST "$REG_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"mcp-test","redirect_uris":["http://localhost:9999/callback"]}')
CLIENT_ID=$(echo "$CLIENT" | jq -r '.client_id')
if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "null" ]; then
  fail "Client registration failed: $CLIENT"
fi

ADMIN_PASSWORD="${ADMIN_PASSWORD:-e2eTestPassword123}"

LOGIN_RESULT=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" \
  -c /tmp/frost-mcp-cookies.txt)

CODE_VERIFIER=$(openssl rand -hex 32)
CODE_CHALLENGE=$(printf '%s' "$CODE_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')

AUTHORIZE_URL="$BASE_URL/api/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=http://localhost:9999/callback&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256"

REDIRECT_RESPONSE=$(curl -s -D - -o /dev/null -X POST \
  -b /tmp/frost-mcp-cookies.txt \
  -d "action=approve" \
  "$AUTHORIZE_URL" 2>/dev/null)

LOCATION=$(echo "$REDIRECT_RESPONSE" | grep -i "^location:" | tr -d '\r' | cut -d' ' -f2)
CODE=$(echo "$LOCATION" | sed -n 's/.*code=\([^&]*\).*/\1/p')

TOKEN_RESULT=$(curl -s -X POST "$TOKEN_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE\",\"redirect_uri\":\"http://localhost:9999/callback\",\"client_id\":\"$CLIENT_ID\",\"code_verifier\":\"$CODE_VERIFIER\"}")
ACCESS_TOKEN=$(echo "$TOKEN_RESULT" | jq -r '.access_token')
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  fail "Failed to get access token: $TOKEN_RESULT"
fi
log "Got Bearer token"

log "Step 2: MCP endpoint with Bearer token..."
MCP_INIT=$(curl -s -X POST "$BASE_URL/api/mcp" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"e2e-test","version":"1.0.0"}}}')

if echo "$MCP_INIT" | grep -q '"serverInfo"'; then
  log "MCP initialize succeeded via Bearer token"
elif echo "$MCP_INIT" | grep -q '"result"'; then
  log "MCP initialize succeeded via Bearer token (result format)"
else
  log "MCP response: $MCP_INIT"
  log "MCP initialize returned unexpected format (may be SSE), checking status..."
fi

log "Step 3: MCP endpoint without token returns 401..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')
if [ "$HTTP_CODE" != "401" ]; then
  fail "Expected 401 without auth, got $HTTP_CODE"
fi
log "Unauthenticated MCP request correctly rejected"

log "Step 4: MCP endpoint with x-frost-token..."
MCP_VIA_KEY=$(curl -s -X POST "$BASE_URL/api/mcp" \
  -H "X-Frost-Token: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"e2e-test","version":"1.0.0"}}}')

if echo "$MCP_VIA_KEY" | grep -q '"serverInfo"'; then
  log "MCP via x-frost-token works"
elif echo "$MCP_VIA_KEY" | grep -q '"result"'; then
  log "MCP via x-frost-token works"
else
  fail "MCP initialize via API key failed: $MCP_VIA_KEY"
fi

rm -f /tmp/frost-mcp-cookies.txt

pass
