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

function api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "https://api.hetzner.cloud/v1$path" \
      -H "Authorization: Bearer $HETZNER_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$body"
    return
  fi
  curl -sS -X "$method" "https://api.hetzner.cloud/v1$path" \
    -H "Authorization: Bearer $HETZNER_API_KEY"
}

for cmd in curl jq ssh sed awk; do
  require_cmd "$cmd"
done

require_env HETZNER_API_KEY
require_env CLOUDFLARE_API_TOKEN
require_env DEMO_EMAIL
require_env DEMO_PASSWORD

DEMO_DOMAIN="${DEMO_DOMAIN:-demo.frost.build}"
SERVER_NAME="${DEMO_SERVER_NAME:-frost-demo-$(date +%s)}"
SERVER_TYPE="${DEMO_SERVER_TYPE:-cax21}"
SERVER_LOCATION="${DEMO_SERVER_LOCATION:-hel1}"
SERVER_IMAGE="${DEMO_SERVER_IMAGE:-ubuntu-24.04}"
SSH_KEY_NAME="${DEMO_HETZNER_SSH_KEY_NAME:-frost-demo-key}"
SSH_PUBLIC_KEY_PATH="${SSH_PUBLIC_KEY_PATH:-$HOME/.ssh/id_rsa.pub}"
SSH_USER="${DEMO_SSH_USER:-root}"

if [ ! -f "$SSH_PUBLIC_KEY_PATH" ]; then
  echo "ssh public key not found: $SSH_PUBLIC_KEY_PATH"
  exit 1
fi

SSH_PUBLIC_KEY="$(cat "$SSH_PUBLIC_KEY_PATH")"

echo "finding or creating hetzner ssh key"
ssh_key_resp="$(api_request GET "/ssh_keys?name=$SSH_KEY_NAME")"
ssh_key_id="$(echo "$ssh_key_resp" | jq -r '.ssh_keys[0].id // empty')"

if [ -z "$ssh_key_id" ]; then
  create_key_body="$(jq -nc \
    --arg name "$SSH_KEY_NAME" \
    --arg pub "$SSH_PUBLIC_KEY" \
    '{name:$name,public_key:$pub}')"
  create_key_resp="$(api_request POST "/ssh_keys" "$create_key_body")"
  ssh_key_id="$(echo "$create_key_resp" | jq -r '.ssh_key.id // empty')"
  if [ -z "$ssh_key_id" ]; then
    echo "failed to create ssh key"
    echo "$create_key_resp"
    exit 1
  fi
fi

echo "creating demo server"
create_server_body="$(jq -nc \
  --arg name "$SERVER_NAME" \
  --arg server_type "$SERVER_TYPE" \
  --arg image "$SERVER_IMAGE" \
  --arg location "$SERVER_LOCATION" \
  --argjson ssh_key_id "$ssh_key_id" \
  '{name:$name,server_type:$server_type,image:$image,location:$location,ssh_keys:[$ssh_key_id],start_after_create:true,labels:{purpose:"frost-demo"}}')"

create_server_resp="$(api_request POST "/servers" "$create_server_body")"
server_id="$(echo "$create_server_resp" | jq -r '.server.id // empty')"
server_ip="$(echo "$create_server_resp" | jq -r '.server.public_net.ipv4.ip // empty')"

if [ -z "$server_id" ] || [ -z "$server_ip" ]; then
  echo "failed to create server"
  echo "$create_server_resp"
  exit 1
fi

echo "waiting for server running"
for _ in $(seq 1 60); do
  server_resp="$(api_request GET "/servers/$server_id")"
  status="$(echo "$server_resp" | jq -r '.server.status // empty')"
  if [ "$status" = "running" ]; then
    break
  fi
  sleep 5
done

echo "waiting for ssh"
for _ in $(seq 1 60); do
  if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SSH_USER@$server_ip" "echo ready" > /dev/null 2>&1; then
    break
  fi
  sleep 5
done

echo "installing frost"
install_output="$(ssh -o ServerAliveInterval=30 -o StrictHostKeyChecking=no "$SSH_USER@$server_ip" "curl -fsSL https://raw.githubusercontent.com/elitan/frost/main/install.sh -o /tmp/install.sh && chmod +x /tmp/install.sh && /tmp/install.sh --create-api-key" 2>&1)"
install_api_key="$(printf '%s\n' "$install_output" | sed 's/\x1b\[[0-9;]*m//g' | awk '/API Key:/ {print $3; exit}')"

if [ -z "$install_api_key" ]; then
  echo "failed to parse install api key"
  echo "$install_output"
  exit 1
fi

echo "demo_domain=$DEMO_DOMAIN"
echo "server_id=$server_id"
echo "server_ip=$server_ip"
echo "install_api_key=$install_api_key"
