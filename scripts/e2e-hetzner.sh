#!/bin/bash
set -e

HETZNER_API_KEY="${HETZNER_API_KEY:-$(grep HETZNER_API_KEY .env 2>/dev/null | cut -d= -f2)}"
if [ -z "$HETZNER_API_KEY" ]; then
  echo "Error: HETZNER_API_KEY not set"
  exit 1
fi

SERVER_NAME="frost-e2e-$(date +%s)"
SERVER_TYPE="cax21"
IMAGE="ubuntu-24.04"
LOCATION="fsn1"
INSTALL_PASSWORD="e2e-test-$(openssl rand -hex 8)"

cleanup() {
  if [ -n "$SERVER_ID" ]; then
    echo "Cleaning up server $SERVER_ID..."
    curl -sf -X DELETE "https://api.hetzner.cloud/v1/servers/$SERVER_ID" \
      -H "Authorization: Bearer $HETZNER_API_KEY" || true
  fi
}
trap cleanup EXIT

echo "Creating Hetzner server: $SERVER_NAME..."
CREATE_RESP=$(curl -sf -X POST "https://api.hetzner.cloud/v1/servers" \
  -H "Authorization: Bearer $HETZNER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$SERVER_NAME\",
    \"server_type\": \"$SERVER_TYPE\",
    \"image\": \"$IMAGE\",
    \"location\": \"$LOCATION\",
    \"start_after_create\": true
  }")

SERVER_ID=$(echo "$CREATE_RESP" | jq -r '.server.id')
SERVER_IP=$(echo "$CREATE_RESP" | jq -r '.server.public_net.ipv4.ip')
ROOT_PASSWORD=$(echo "$CREATE_RESP" | jq -r '.root_password')

if [ -z "$SERVER_IP" ] || [ "$SERVER_IP" = "null" ]; then
  echo "Failed to create server: $CREATE_RESP"
  exit 1
fi

echo "Server created: $SERVER_IP (ID: $SERVER_ID)"
echo "Waiting for server to be ready..."

for i in {1..60}; do
  if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes root@"$SERVER_IP" "echo ready" 2>/dev/null; then
    break
  fi
  echo "  Waiting... ($i/60)"
  sleep 5
done

BRANCH="${1:-feat/unified-templates}"
echo "Installing Frost from branch: $BRANCH..."
INSTALL_OUTPUT=$(ssh -o StrictHostKeyChecking=no root@"$SERVER_IP" "curl -fsSL https://raw.githubusercontent.com/elitan/frost/$BRANCH/install.sh -o /tmp/install.sh && chmod +x /tmp/install.sh && echo '$INSTALL_PASSWORD' | /tmp/install.sh" 2>&1)
echo "$INSTALL_OUTPUT"

echo "Waiting for Frost to start..."
sleep 10

echo "Getting API key..."
API_KEY=$(echo "$INSTALL_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g' | grep "API Key:" | awk '{print $3}')

if [ -z "$API_KEY" ]; then
  echo "Could not extract API key. Check server manually: ssh root@$SERVER_IP"
  echo "Server will be cleaned up in 5 minutes..."
  sleep 300
  exit 1
fi

echo ""
echo "========================================"
echo "Server ready!"
echo "IP: $SERVER_IP"
echo "API Key: $API_KEY"
echo "========================================"
echo ""

echo "Running e2e tests..."
./scripts/e2e-test.sh "$SERVER_IP" "$API_KEY"

echo ""
echo "Tests complete! Server will be deleted."
