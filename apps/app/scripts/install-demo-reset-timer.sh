#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

function require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" > /dev/null 2>&1; then
    echo "missing command: $cmd"
    exit 1
  fi
}

function require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "missing env: $key"
    exit 1
  fi
}

for cmd in ssh scp mktemp; do
  require_cmd "$cmd"
done

SERVER_IP="${SERVER_IP:-${1:-}}"
if [ -z "$SERVER_IP" ]; then
  echo "missing server ip: set SERVER_IP or pass as arg1"
  exit 1
fi

DEMO_DOMAIN="${DEMO_DOMAIN:-demo.frost.build}"
SSH_USER="${DEMO_SSH_USER:-root}"
SSH_TARGET="$SSH_USER@$SERVER_IP"

require_env DEMO_EMAIL
require_env DEMO_PASSWORD

reset_script_local="$SCRIPT_DIR/demo-hourly-reset.sh"
if [ ! -f "$reset_script_local" ]; then
  echo "missing reset script: $reset_script_local"
  exit 1
fi

tmp_env="$(mktemp)"
tmp_service="$(mktemp)"
tmp_timer="$(mktemp)"

printf 'DEMO_ENV=demo\nDEMO_DOMAIN=%s\nDEMO_EMAIL=%s\nDEMO_PASSWORD=%s\n' "$DEMO_DOMAIN" "$DEMO_EMAIL" "$DEMO_PASSWORD" > "$tmp_env"

cat > "$tmp_service" <<'SERVICE'
[Unit]
Description=Frost Demo Reset
After=frost.service

[Service]
Type=oneshot
WorkingDirectory=/opt/frost
EnvironmentFile=/opt/frost/.env
EnvironmentFile=/etc/frost-demo.env
ExecStart=/opt/frost/scripts/demo-hourly-reset.sh
SERVICE

cat > "$tmp_timer" <<'TIMER'
[Unit]
Description=Frost Demo Reset Timer

[Timer]
OnCalendar=hourly
Persistent=true
Unit=frost-demo-reset.service

[Install]
WantedBy=timers.target
TIMER

scp -o StrictHostKeyChecking=no "$reset_script_local" "$SSH_TARGET:/tmp/demo-hourly-reset.sh"
scp -o StrictHostKeyChecking=no "$tmp_env" "$SSH_TARGET:/tmp/frost-demo.env"
scp -o StrictHostKeyChecking=no "$tmp_service" "$SSH_TARGET:/tmp/frost-demo-reset.service"
scp -o StrictHostKeyChecking=no "$tmp_timer" "$SSH_TARGET:/tmp/frost-demo-reset.timer"

ssh -o StrictHostKeyChecking=no "$SSH_TARGET" "
set -e
mkdir -p /opt/frost/scripts
install -m 755 /tmp/demo-hourly-reset.sh /opt/frost/scripts/demo-hourly-reset.sh
install -m 600 /tmp/frost-demo.env /etc/frost-demo.env
install -m 644 /tmp/frost-demo-reset.service /etc/systemd/system/frost-demo-reset.service
install -m 644 /tmp/frost-demo-reset.timer /etc/systemd/system/frost-demo-reset.timer
if grep -q '^FROST_DEMO_MODE=' /opt/frost/.env; then
  sed -i 's/^FROST_DEMO_MODE=.*/FROST_DEMO_MODE=true/' /opt/frost/.env
else
  printf '\nFROST_DEMO_MODE=true\n' >> /opt/frost/.env
fi
rm -f /tmp/demo-hourly-reset.sh /tmp/frost-demo.env /tmp/frost-demo-reset.service /tmp/frost-demo-reset.timer
systemctl daemon-reload
systemctl restart frost
systemctl enable --now frost-demo-reset.timer
systemctl start frost-demo-reset.service
"

rm -f "$tmp_env" "$tmp_service" "$tmp_timer"

echo "installed_timer_server_ip=$SERVER_IP"
