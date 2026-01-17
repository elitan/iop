#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

START_TIME=$(date +%s)
timer() {
  local now=$(date +%s)
  local elapsed=$((now - START_TIME))
  echo -e "${YELLOW}[${elapsed}s]${NC} $1"
}

FROST_DIR="/opt/frost"
FROST_REPO="https://github.com/elitan/frost"
FROST_VERSION=""
FROST_BRANCH=""
USE_TARBALL=true
CREATE_API_KEY=false

# Check for --create-api-key before getopts (getopts doesn't handle long options)
for arg in "$@"; do
  case $arg in
    --create-api-key) CREATE_API_KEY=true ;;
  esac
done

# Filter out --create-api-key for getopts
ARGS=()
for arg in "$@"; do
  if [ "$arg" != "--create-api-key" ]; then
    ARGS+=("$arg")
  fi
done
set -- "${ARGS[@]}"

while getopts "v:b:" opt; do
  case $opt in
    v) FROST_VERSION="$OPTARG" ;;
    b) FROST_BRANCH="$OPTARG"; USE_TARBALL=false ;;
    *) echo "Usage: $0 [-v version] [-b branch] [--create-api-key]"; exit 1 ;;
  esac
done

echo -e "${GREEN}Frost Installation Script${NC}"
if [ -n "$FROST_VERSION" ]; then
  echo -e "Version: ${YELLOW}$FROST_VERSION${NC}"
fi
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

# Check if Linux
if [ "$(uname)" != "Linux" ]; then
  echo -e "${RED}This script only supports Linux${NC}"
  exit 1
fi

# Prompt for admin password
echo -e "${YELLOW}Configuration${NC}"
read -s -p "Admin password (min 8 chars): " FROST_PASSWORD
echo ""

if [ ${#FROST_PASSWORD} -lt 8 ]; then
  echo -e "${RED}Password must be at least 8 characters${NC}"
  exit 1
fi

# Generate JWT secret
FROST_JWT_SECRET=$(openssl rand -base64 32)

echo ""
timer "Installing dependencies..."

# Install build tools if not present
if ! command -v git &> /dev/null || ! command -v unzip &> /dev/null; then
  timer "apt-get update..."
  apt-get update -qq
  timer "apt-get install build tools..."
  apt-get install -y -qq git unzip build-essential > /dev/null
else
  timer "Build tools already installed"
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  timer "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  timer "Docker already installed"
fi

# Install Go if not present (needed for xcaddy)
if ! command -v go &> /dev/null; then
  timer "Installing Go..."
  GO_VERSION="1.22.5"
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm /tmp/go.tar.gz
  export PATH="/usr/local/go/bin:$PATH"
else
  timer "Go already installed"
fi
export PATH="/usr/local/go/bin:$PATH"

# Install/rebuild Caddy with DNS modules if missing
if ! caddy list-modules 2>/dev/null | grep -q "dns.providers.cloudflare"; then
  timer "Building Caddy with DNS modules..."

  systemctl stop caddy 2>/dev/null || true
  rm -f /usr/bin/caddy

  timer "Installing xcaddy..."
  go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
  export PATH="$HOME/go/bin:$PATH"

  cd /tmp
  xcaddy build --with github.com/caddy-dns/cloudflare
  mv caddy /usr/bin/caddy
  chmod +x /usr/bin/caddy
  cd -

  timer "Configuring Caddy service..."
  groupadd --system caddy 2>/dev/null || true
  useradd --system --gid caddy --create-home --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy 2>/dev/null || true

  cat > /etc/systemd/system/caddy.service << 'CADDY_SERVICE'
[Unit]
Description=Caddy
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
CADDY_SERVICE

  mkdir -p /etc/caddy
  systemctl daemon-reload
  systemctl enable caddy
else
  timer "Caddy DNS modules present"
fi

# Configure Caddy to proxy to Frost
timer "Configuring Caddy..."
cat > /etc/caddy/Caddyfile << 'EOF'
:80 {
  reverse_proxy localhost:3000
}
EOF
systemctl restart caddy

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  timer "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_22.x 2>/dev/null | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
else
  timer "Node.js already installed"
fi

# Install Bun if not present (needed for setup script)
if ! command -v bun &> /dev/null; then
  timer "Installing Bun..."
  curl -fsSL https://bun.sh/install 2>/dev/null | bash > /dev/null 2>&1
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
else
  timer "Bun already installed"
fi

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

echo ""
timer "Setting up Frost..."

# Remove existing installation
if [ -d "$FROST_DIR" ]; then
  timer "Removing existing installation..."
  rm -rf "$FROST_DIR"
fi

if [ "$USE_TARBALL" = true ]; then
  # Download release tarball
  if [ -n "$FROST_VERSION" ]; then
    TARBALL_URL="$FROST_REPO/releases/download/$FROST_VERSION/frost-${FROST_VERSION}.tar.gz"
  else
    timer "Fetching latest release..."
    FROST_VERSION=$(curl -sL "$FROST_REPO/releases/latest" -o /dev/null -w '%{url_effective}' | sed 's|.*/||')
    if [ -z "$FROST_VERSION" ] || [ "$FROST_VERSION" = "releases" ]; then
      echo -e "${RED}Failed to get latest release${NC}"
      exit 1
    fi
    TARBALL_URL="$FROST_REPO/releases/download/$FROST_VERSION/frost-${FROST_VERSION}.tar.gz"
  fi

  timer "Downloading Frost $FROST_VERSION..."
  mkdir -p "$FROST_DIR"
  curl -fsSL "$TARBALL_URL" | tar -xz -C "$FROST_DIR"

  cd "$FROST_DIR"

  # Install production deps for scripts (migrate, setup, etc.)
  timer "Installing dependencies (bun)..."
  bun install --production
else
  # Branch mode: clone and build from source (like main branch behavior)
  timer "Cloning Frost (branch: $FROST_BRANCH)..."
  git clone --depth 1 -b "$FROST_BRANCH" "${FROST_REPO}.git" "$FROST_DIR"
  git config --global --add safe.directory "$FROST_DIR"
  cd "$FROST_DIR"

  timer "Installing dependencies (bun)..."
  bun install

  timer "Clearing Next.js cache..."
  rm -rf .next node_modules/.cache

  timer "Building (bun run build)..."
  NEXT_TELEMETRY_DISABLED=1 bun run build
fi

# Create data directory
mkdir -p "$FROST_DIR/data"

# Create .env file
cat > "$FROST_DIR/.env" << EOF
FROST_JWT_SECRET=$FROST_JWT_SECRET
NODE_ENV=production
EOF

timer "Running migrations..."
bun run migrate

# Run setup to set admin password (uses bun:sqlite)
timer "Setting admin password..."
bun run setup "$FROST_PASSWORD" || {
  echo -e "${RED}Failed to set admin password. Check bun installation.${NC}"
  exit 1
}

# Create systemd service
echo ""
timer "Creating systemd service..."

# Tarball mode uses standalone server.js, branch mode uses bun run start
if [ "$USE_TARBALL" = true ]; then
  EXEC_START="/usr/local/bin/bun $FROST_DIR/server.js"
else
  EXEC_START="/usr/local/bin/bun run start"
fi

cat > /etc/systemd/system/frost.service << EOF
[Unit]
Description=Frost
After=network.target docker.service caddy.service

[Service]
Type=simple
WorkingDirectory=$FROST_DIR
TimeoutStartSec=300
ExecStartPre=/bin/bash -c 'test -f $FROST_DIR/data/.update-requested && curl -fsSL https://raw.githubusercontent.com/elitan/frost/main/update.sh | bash -s -- --pre-start || true'
ExecStart=$EXEC_START
Restart=on-failure
EnvironmentFile=$FROST_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/frost-cleanup.service << EOF
[Unit]
Description=Frost Docker Cleanup
After=frost.service

[Service]
Type=oneshot
ExecStart=$FROST_DIR/cleanup.sh
EOF

cat > /etc/systemd/system/frost-cleanup.timer << EOF
[Unit]
Description=Frost Docker Cleanup Timer

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

chmod +x "$FROST_DIR/cleanup.sh"

# Reload systemd and start services
systemctl daemon-reload
systemctl enable frost
systemctl enable frost-cleanup.timer
systemctl start frost-cleanup.timer
systemctl restart frost

# Wait for Frost to start
timer "Waiting for Frost to start..."
sleep 3

# Health check
if curl -s -o /dev/null -w "" http://localhost:3000 2>/dev/null; then
  timer "Frost is running"
else
  echo -e "${YELLOW}Warning: Could not reach Frost. Check: journalctl -u frost -f${NC}"
fi

# Get server IP
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s api.ipify.org 2>/dev/null || echo "YOUR_SERVER_IP")

TOTAL_TIME=$(($(date +%s) - START_TIME))
echo ""
echo -e "${GREEN}Installation complete! (${TOTAL_TIME}s total)${NC}"
echo ""
echo -e "Frost is running at: ${GREEN}http://$SERVER_IP${NC}"

if [ "$CREATE_API_KEY" = true ]; then
  echo ""
  timer "Creating API key..."
  FROST_API_KEY=$(FROST_JWT_SECRET="$FROST_JWT_SECRET" bun run scripts/create-api-key.ts install)
  echo -e "API Key: ${YELLOW}$FROST_API_KEY${NC}"
  echo "(use with X-Frost-Token header)"
fi

echo ""
echo "Next steps:"
echo "  1. Point your domain to $SERVER_IP"
echo "  2. Go to Settings in Frost to configure domain and SSL"
echo ""
echo "Useful commands:"
echo "  systemctl status frost    - check status"
echo "  systemctl restart frost   - restart"
echo "  journalctl -u frost -f    - view logs"
echo "  /opt/frost/update.sh      - update to latest version"
