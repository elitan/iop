#!/bin/bash
set -e

VPS="root@65.21.180.49"
REMOTE_DIR="/opt/frost"

echo "Syncing app files to VPS..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'data' \
  --exclude '.next' \
  --exclude '.env' \
  apps/app/ "$VPS:$REMOTE_DIR/"

echo "Syncing root scripts..."
rsync -avz install.sh update.sh cleanup.sh "$VPS:$REMOTE_DIR/"

echo "Building and restarting..."
ssh "$VPS" "cd $REMOTE_DIR && /root/.bun/bin/bun install && /root/.bun/bin/bun run build && systemctl restart frost"

echo "Waiting for service to start..."
sleep 3

echo "Verifying deploy..."
HEALTH=$(curl -sfk "https://frost.j4labs.se/api/health" || echo "FAILED")
if echo "$HEALTH" | grep -q '"ok":true'; then
  VERSION=$(echo "$HEALTH" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
  echo "Deploy successful! Version: $VERSION"
else
  echo "Deploy verification failed!"
  echo "Response: $HEALTH"
  exit 1
fi
