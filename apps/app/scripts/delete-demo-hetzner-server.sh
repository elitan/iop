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
  curl -sS -X "$method" "https://api.hetzner.cloud/v1$path" \
    -H "Authorization: Bearer $HETZNER_API_KEY"
}

require_cmd curl
require_cmd jq
require_env HETZNER_API_KEY

SERVER_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --server-id)
      SERVER_ID="${2:-}"
      shift 2
      ;;
    *)
      echo "usage: $0 [--server-id <id>]"
      exit 1
      ;;
  esac
done

if [ -n "$SERVER_ID" ]; then
  api_request DELETE "/servers/$SERVER_ID" > /dev/null
  echo "deleted_server_id=$SERVER_ID"
  exit 0
fi

servers_resp="$(api_request GET "/servers?label_selector=purpose=frost-demo")"
server_ids="$(echo "$servers_resp" | jq -r '.servers[].id // empty')"

count=0
if [ -n "$server_ids" ]; then
  while IFS= read -r id; do
    if [ -n "$id" ]; then
      api_request DELETE "/servers/$id" > /dev/null
      count=$((count + 1))
    fi
  done <<< "$server_ids"
fi

echo "deleted_servers=$count"
