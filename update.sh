#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FROST_DIR="/opt/frost"
UPDATE_MARKER="$FROST_DIR/data/.update-requested"
UPDATE_LOG="$FROST_DIR/data/.update-log"
UPDATE_RESULT="$FROST_DIR/data/.update-result"
BACKUP_DIR="$FROST_DIR/.backup"
PRE_START=false

if [ "$1" = "--pre-start" ]; then
  PRE_START=true
fi

log() {
  echo -e "${YELLOW}$1${NC}"
}

error() {
  echo -e "${RED}$1${NC}"
}

success() {
  echo -e "${GREEN}$1${NC}"
}

cleanup_on_failure() {
  error "Update failed!"
  echo "failed" > "$UPDATE_RESULT"

  if [ -d "$BACKUP_DIR/.next" ]; then
    log "Restoring previous build..."
    rm -rf "$FROST_DIR/.next"
    mv "$BACKUP_DIR/.next" "$FROST_DIR/.next"
  fi

  rm -rf "$BACKUP_DIR"

  if [ "$PRE_START" = false ]; then
    log "Attempting to start Frost with previous version..."
    systemctl start frost 2>/dev/null || true
  fi

  exit 1
}

trap cleanup_on_failure ERR

success "Frost Update Script"
echo ""

if [ "$EUID" -ne 0 ]; then
  error "Please run as root (sudo)"
  exit 1
fi

if [ ! -d "$FROST_DIR" ]; then
  error "Frost not found at $FROST_DIR"
  echo "Run install.sh first"
  exit 1
fi

> "$UPDATE_LOG"
exec > >(tee -a "$UPDATE_LOG") 2>&1

if [ -f "$UPDATE_MARKER" ]; then
  rm "$UPDATE_MARKER"
  log "Update triggered from UI"
fi

cd "$FROST_DIR"

git config --global --add safe.directory "$FROST_DIR" 2>/dev/null || true

# Ensure bun is in PATH - critical for npm subscripts
export HOME="${HOME:-/root}"
export BUN_INSTALL="$HOME/.bun"
export PATH="/usr/local/bin:$BUN_INSTALL/bin:$PATH"

log "Upgrading bun..."
curl -fsSL https://bun.sh/install 2>/dev/null | bash > /dev/null 2>&1 || true

# Create symlink so npm's sh subprocess can find bun
mkdir -p /usr/local/bin
if [ -f "$BUN_INSTALL/bin/bun" ]; then
  ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bun
  log "Bun linked to /usr/local/bin/bun"
else
  error "Bun not found at $BUN_INSTALL/bin/bun"
  exit 1
fi

CURRENT_VERSION=$(cat package.json | grep '"version"' | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
log "Current version: $CURRENT_VERSION"

if [ "$PRE_START" = false ]; then
  log "Stopping Frost..."
  systemctl stop frost 2>/dev/null || true
fi

log "Backing up current build..."
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
if [ -d "$FROST_DIR/.next" ]; then
  cp -r "$FROST_DIR/.next" "$BACKUP_DIR/.next"
fi

log "Fetching latest changes..."
git fetch origin main --quiet

LATEST_COMMIT=$(git rev-parse origin/main)
CURRENT_COMMIT=$(git rev-parse HEAD)

if [ "$LATEST_COMMIT" = "$CURRENT_COMMIT" ]; then
  log "Already up to date"
  rm -rf "$BACKUP_DIR"

  if [ "$PRE_START" = false ]; then
    systemctl start frost
  fi
  exit 0
fi

log "Updating from $(git rev-parse --short HEAD) to $(git rev-parse --short origin/main)..."
git reset --hard origin/main

NEW_VERSION=$(cat package.json | grep '"version"' | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
log "New version: $NEW_VERSION"

log "Cleaning node_modules..."
rm -rf node_modules package-lock.json

log "Installing dependencies..."
NODE_ENV=development npm install --legacy-peer-deps --silent 2>&1

log "Building..."
npm run build 2>&1

log "Running migrations..."
bun run migrate 2>&1

rm -rf "$BACKUP_DIR"

echo "success:$NEW_VERSION" > "$UPDATE_RESULT"

if [ "$PRE_START" = false ]; then
  log "Starting Frost..."
  systemctl start frost
fi

echo ""
success "Update complete! $CURRENT_VERSION → $NEW_VERSION"
echo ""
if [ "$PRE_START" = true ]; then
  echo "Frost will start automatically"
else
  echo "Check status: systemctl status frost"
fi
