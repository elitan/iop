#!/bin/bash
set -e

HETZNER_TOKEN="${HETZNER_API_KEY:?HETZNER_API_KEY required}"
SSH_KEY_NAME="${SSH_KEY_NAME:-frost-e2e-ci}"

usage() {
  echo "Usage: $0 <arch>"
  echo "  arch: arm64 or amd64"
  echo ""
  echo "Creates a Hetzner snapshot for e2e testing."
  echo "Requires HETZNER_API_KEY env var."
  exit 1
}

[ -z "$1" ] && usage
ARCH="$1"

case "$ARCH" in
  arm64) SERVER_TYPE="cax21" ;;
  amd64) SERVER_TYPE="cx23" ;;
  *) echo "Invalid arch: $ARCH"; usage ;;
esac

echo "Creating $ARCH server ($SERVER_TYPE)..."
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $HETZNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"frost-snapshot-$ARCH\",\"server_type\":\"$SERVER_TYPE\",\"image\":\"ubuntu-24.04\",\"location\":\"hel1\",\"ssh_keys\":[\"$SSH_KEY_NAME\"],\"start_after_create\":true}" \
  "https://api.hetzner.cloud/v1/servers")

SERVER_ID=$(echo "$RESPONSE" | jq -r '.server.id')
SERVER_IP=$(echo "$RESPONSE" | jq -r '.server.public_net.ipv4.ip')

if [ "$SERVER_ID" = "null" ]; then
  echo "Failed to create server:"
  echo "$RESPONSE" | jq
  exit 1
fi

echo "Server created: ID=$SERVER_ID, IP=$SERVER_IP"
echo "Waiting for server to be ready..."
sleep 60

echo "Setting up server..."
ssh -o StrictHostKeyChecking=no root@$SERVER_IP bash << 'SETUP'
set -e
apt-get update
apt-get install -y docker.io git curl unzip

systemctl enable docker
systemctl start docker

echo "Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun --version

echo "Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node --version

echo "Pre-pulling Docker images..."
docker pull node:20-alpine
docker pull postgres:17-alpine
docker pull nginx:alpine

echo "Setup complete"
SETUP

echo "Creating snapshot..."
SNAP_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $HETZNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"description\":\"frost-e2e-$ARCH\",\"type\":\"snapshot\"}" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID/actions/create_image")

SNAPSHOT_ID=$(echo "$SNAP_RESPONSE" | jq -r '.image.id')
echo "Snapshot creating: $SNAPSHOT_ID"

echo "Waiting for snapshot..."
for i in {1..60}; do
  STATUS=$(curl -s -H "Authorization: Bearer $HETZNER_TOKEN" \
    "https://api.hetzner.cloud/v1/images/$SNAPSHOT_ID" | jq -r '.image.status')
  [ "$STATUS" = "available" ] && break
  echo "  Status: $STATUS"
  sleep 10
done

echo "Deleting server..."
curl -s -X DELETE -H "Authorization: Bearer $HETZNER_TOKEN" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID" > /dev/null

echo ""
echo "========================================="
echo "Snapshot created: $SNAPSHOT_ID"
echo "Update .github/workflows/e2e-*.yml with:"
echo "  snapshot_id: \"$SNAPSHOT_ID\""
echo "========================================="
