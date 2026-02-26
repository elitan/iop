#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FROST_DIR="/opt/frost"
FROST_REPO="https://github.com/elitan/frost"
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

get_env_value() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi
  local line
  line=$(grep -E "^${key}=" "$file" | tail -n 1 || true)
  if [ -z "$line" ]; then
    return 0
  fi
  echo "${line#*=}"
}

ensure_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  if [ ! -f "$file" ]; then
    touch "$file"
  fi
  if grep -qE "^${key}=" "$file"; then
    return 0
  fi
  echo "${key}=${value}" >> "$file"
}

detect_single_zfs_pool() {
  if ! command -v zpool > /dev/null 2>&1; then
    return 0
  fi
  local pools
  local count
  pools=$(zpool list -H -o name 2>/dev/null | awk 'NF {print}')
  count=$(echo "$pools" | awk 'NF {c++} END {print c+0}')
  if [ "$count" -eq 1 ]; then
    echo "$pools"
  fi
}

ensure_zfs_branching_setup() {
  if ! command -v zfs > /dev/null 2>&1 || ! command -v zpool > /dev/null 2>&1; then
    log "Installing zfsutils-linux..."
    apt-get update -qq || true
    apt-get install -y -qq zfsutils-linux > /dev/null || true
  fi

  local env_file="$FROST_DIR/.env"
  local detected_pool
  local pool
  local dataset_base
  local mount_base
  local base_dataset

  detected_pool=$(detect_single_zfs_pool || true)
  pool=$(get_env_value "$env_file" "FROST_POSTGRES_ZFS_POOL")
  if [ -z "$pool" ]; then
    pool="$detected_pool"
  fi

  ensure_env_value "$env_file" "FROST_POSTGRES_ZFS_POOL" "$pool"
  ensure_env_value "$env_file" "FROST_POSTGRES_ZFS_DATASET_BASE" "frost/databases"
  ensure_env_value "$env_file" "FROST_POSTGRES_ZFS_MOUNT_BASE" "/opt/frost/data/postgres/zfs"

  dataset_base=$(get_env_value "$env_file" "FROST_POSTGRES_ZFS_DATASET_BASE")
  mount_base=$(get_env_value "$env_file" "FROST_POSTGRES_ZFS_MOUNT_BASE")

  if [ -n "$mount_base" ]; then
    mkdir -p "$mount_base"
  fi

  if [ -z "$pool" ] || ! command -v zfs > /dev/null 2>&1 || ! command -v zpool > /dev/null 2>&1; then
    return 0
  fi

  if ! zpool list -H -o name "$pool" > /dev/null 2>&1; then
    return 0
  fi

  base_dataset="$pool/$dataset_base"
  if ! zfs list -H "$base_dataset" > /dev/null 2>&1; then
    zfs create -p "$base_dataset" > /dev/null 2>&1 || true
  fi
}

cleanup_on_failure() {
  error "Update failed!"
  echo "failed" > "$UPDATE_RESULT"

  if [ -f "$BACKUP_DIR/commit" ]; then
    # Git mode: restore to previous commit
    log "Restoring previous commit..."
    PREV_COMMIT=$(cat "$BACKUP_DIR/commit")
    cd "$FROST_DIR"
    git reset --hard "$PREV_COMMIT" 2>/dev/null || true
    rm -rf "$BACKUP_DIR"
  elif [ -d "$BACKUP_DIR" ]; then
    # Tarball mode: full backup
    log "Restoring previous version..."
    mv "$FROST_DIR/data" /tmp/frost-data-restore 2>/dev/null || true
    mv "$FROST_DIR/.env" /tmp/frost-env-restore 2>/dev/null || true
    rm -rf "$FROST_DIR"
    mv "$BACKUP_DIR" "$FROST_DIR"
    mv /tmp/frost-data-restore "$FROST_DIR/data" 2>/dev/null || true
    mv /tmp/frost-env-restore "$FROST_DIR/.env" 2>/dev/null || true
  fi

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

# Ensure FROST_DATA_DIR is set (required since v0.8.0 monorepo)
if [ -f "$FROST_DIR/.env" ]; then
  grep -q FROST_DATA_DIR "$FROST_DIR/.env" || echo "FROST_DATA_DIR=$FROST_DIR/data" >> "$FROST_DIR/.env"
fi

# Ensure .env symlink exists for monorepo (apps/app needs access to root .env)
if [ -d "$FROST_DIR/apps/app" ] && [ ! -L "$FROST_DIR/apps/app/.env" ]; then
  ln -sf "$FROST_DIR/.env" "$FROST_DIR/apps/app/.env"
fi

ensure_zfs_branching_setup

# Ensure bun is in PATH
export HOME="${HOME:-/root}"
export BUN_INSTALL="$HOME/.bun"
export PATH="/usr/local/bin:$BUN_INSTALL/bin:$PATH"

log "Upgrading bun..."
curl -fsSL https://bun.sh/install 2>/dev/null | bash > /dev/null 2>&1 || true

mkdir -p /usr/local/bin

# Install Caddy with DNS modules if missing (pinned; update when upgrading Caddy)
CADDY_VERSION="v2.10.2"

if ! caddy list-modules 2>/dev/null | grep -q "dns.providers.cloudflare"; then
  log "Downloading Caddy ${CADDY_VERSION} with DNS modules..."
  systemctl stop caddy 2>/dev/null || true
  rm -f /usr/bin/caddy

  ARCH=$(uname -m)
  case $ARCH in
    x86_64) CADDY_ARCH="amd64" ;;
    aarch64|arm64) CADDY_ARCH="arm64" ;;
    *) log "Unsupported architecture: $ARCH"; exit 1 ;;
  esac

  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=${CADDY_ARCH}&p=github.com/caddy-dns/cloudflare&version=${CADDY_VERSION}" -o /usr/bin/caddy
  chmod +x /usr/bin/caddy

  systemctl start caddy 2>/dev/null || true
fi

# Configure Docker network pools for existing installs
DOCKER_POOLS='[{"base":"10.0.0.0/8","size":24},{"base":"172.17.0.0/12","size":24},{"base":"192.168.0.0/16","size":24}]'
DAEMON_JSON="/etc/docker/daemon.json"

if [ -f "$DAEMON_JSON" ] && grep -q "default-address-pools" "$DAEMON_JSON"; then
  : # already configured
elif command -v jq &> /dev/null; then
  log "Configuring Docker network pools..."
  if [ -f "$DAEMON_JSON" ]; then
    jq --argjson pools "$DOCKER_POOLS" '. + {"default-address-pools": $pools}' "$DAEMON_JSON" > "$DAEMON_JSON.tmp"
    mv "$DAEMON_JSON.tmp" "$DAEMON_JSON"
  else
    echo "{\"default-address-pools\": $DOCKER_POOLS}" | jq '.' > "$DAEMON_JSON"
  fi
  RUNNING_CONTAINERS=$(docker ps -q 2>/dev/null || true)
  log "Restarting Docker to apply network config..."
  systemctl restart docker
  if [ -n "$RUNNING_CONTAINERS" ]; then
    log "Restarting containers stopped by Docker restart..."
    echo "$RUNNING_CONTAINERS" | xargs -r docker start 2>/dev/null || true
  fi
fi

if [ -f "$BUN_INSTALL/bin/bun" ]; then
  ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bun
else
  error "Bun not found at $BUN_INSTALL/bin/bun"
  exit 1
fi

# Detect mode: git-based (dev/CI) or tarball (production)
# A valid git repo has .git AND a valid HEAD commit
GIT_MODE=false
CONVERTED_FROM_TARBALL=false
if [ -d "$FROST_DIR/.git" ]; then
  git config --global --add safe.directory "$FROST_DIR" 2>/dev/null || true
  if git rev-parse HEAD >/dev/null 2>&1; then
    GIT_MODE=true
  else
    # .git exists but no HEAD - transitioning from tarball to git
    # Check if origin/main exists and do initial checkout
    if git rev-parse origin/main >/dev/null 2>&1; then
      log "Converting tarball install to git mode..."
      git checkout -f origin/main 2>/dev/null || git reset --hard origin/main
      GIT_MODE=true
      CONVERTED_FROM_TARBALL=true
    fi
  fi
fi

if [ "$GIT_MODE" = true ]; then
  CURRENT_VERSION=$(cat apps/app/package.json | grep '"version"' | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
else
  CURRENT_VERSION=$(cat package.json | grep '"version"' | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
fi
log "Current version: $CURRENT_VERSION"

if [ "$GIT_MODE" = true ]; then
  # Git mode: pull and rebuild (for dev installs and CI testing)
  log "Git mode detected"

  log "Checking for updates..."
  git fetch origin main 2>/dev/null
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse @{u} 2>/dev/null || git rev-parse origin/main)

  if [ "$LOCAL" = "$REMOTE" ] && [ "$CONVERTED_FROM_TARBALL" = false ]; then
    log "Already up to date (v$CURRENT_VERSION)"
    if [ "$PRE_START" = false ]; then
      systemctl start frost 2>/dev/null || true
    fi
    exit 0
  fi

  if [ "$CONVERTED_FROM_TARBALL" = true ]; then
    log "Running rebuild for tarball-to-git conversion..."
  else
    log "Updates available"
  fi

  if [ "$PRE_START" = false ]; then
    log "Stopping Frost..."
    systemctl stop frost 2>/dev/null || true
  fi

  log "Backing up current commit..."
  rm -rf "$BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  echo "$LOCAL" > "$BACKUP_DIR/commit"

  log "Pulling updates..."
  git reset --hard origin/main 2>/dev/null || git reset --hard @{u}

  if [ "$CONVERTED_FROM_TARBALL" = true ]; then
    log "Cleaning old node_modules..."
    rm -rf node_modules apps/*/node_modules
    log "Creating .env symlink for monorepo..."
    ln -sf "$FROST_DIR/.env" "$FROST_DIR/apps/app/.env"
    log "Updating systemd service for git mode..."
    sed -i 's|ExecStart=.*|ExecStart=/usr/local/bin/bun run start|' /etc/systemd/system/frost.service
    systemctl daemon-reload
  fi

  log "Installing dependencies..."
  bun install 2>&1

  log "Building..."
  BUILD_OK=false
  for attempt in 1 2 3; do
    if NEXT_TELEMETRY_DISABLED=1 bun run build 2>&1; then
      BUILD_OK=true
      break
    fi
    log "Build failed (attempt $attempt/3), retrying..."
    rm -rf apps/app/.next
    sleep 2
  done
  if [ "$BUILD_OK" = false ]; then
    error "Build failed after 3 attempts"
    exit 1
  fi

  log "Running migrations..."
  bun run migrate 2>&1

  NEW_VERSION=$(cat apps/app/package.json | grep '"version"' | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
  rm -rf "$BACKUP_DIR"

  echo "success:$NEW_VERSION" > "$UPDATE_RESULT"

  if [ "$PRE_START" = false ]; then
    log "Starting Frost..."
    systemctl start frost
  fi

  echo ""
  success "Update complete! v$CURRENT_VERSION → v$NEW_VERSION"
else
  # Tarball mode: download prebuilt release
  log "Checking for updates..."
  LATEST_VERSION=$(curl -sL "$FROST_REPO/releases/latest" -o /dev/null -w '%{url_effective}' | sed 's|.*/v||')
  if [ -z "$LATEST_VERSION" ]; then
    error "Failed to fetch latest release"
    exit 1
  fi

  if [ "v$CURRENT_VERSION" = "v$LATEST_VERSION" ]; then
    log "Already up to date (v$CURRENT_VERSION)"
    if [ "$PRE_START" = false ]; then
      systemctl start frost 2>/dev/null || true
    fi
    exit 0
  fi

  log "New version available: v$LATEST_VERSION"

  if [ "$PRE_START" = false ]; then
    log "Stopping Frost..."
    systemctl stop frost 2>/dev/null || true
  fi

  log "Backing up current installation..."
  rm -rf "$BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  for item in "$FROST_DIR"/*; do
    base=$(basename "$item")
    if [ "$base" != "data" ] && [ "$base" != ".backup" ]; then
      cp -r "$item" "$BACKUP_DIR/"
    fi
  done
  cp "$FROST_DIR/.env" "$BACKUP_DIR/.env" 2>/dev/null || true

  log "Downloading Frost v$LATEST_VERSION..."
  TARBALL_URL="$FROST_REPO/releases/download/v$LATEST_VERSION/frost-v${LATEST_VERSION}.tar.gz"
  curl -fsSL "$TARBALL_URL" -o /tmp/frost-update.tar.gz

  for item in "$FROST_DIR"/*; do
    base=$(basename "$item")
    if [ "$base" != "data" ] && [ "$base" != ".backup" ]; then
      rm -rf "$item"
    fi
  done

  tar -xzf /tmp/frost-update.tar.gz -C "$FROST_DIR"
  rm /tmp/frost-update.tar.gz

  log "Installing dependencies..."
  bun install --production 2>&1

  log "Running migrations..."
  bun run migrate 2>&1

  rm -rf "$BACKUP_DIR"

  echo "success:$LATEST_VERSION" > "$UPDATE_RESULT"

  if [ "$PRE_START" = false ]; then
    log "Starting Frost..."
    systemctl start frost
  fi

  echo ""
  success "Update complete! v$CURRENT_VERSION → v$LATEST_VERSION"
fi

echo ""
if [ "$PRE_START" = true ]; then
  echo "Frost will start automatically"
else
  echo "Check status: systemctl status frost"
fi
