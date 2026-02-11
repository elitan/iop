#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

function usage() {
  echo "usage: $0 <command> [args]"
  echo ""
  echo "commands:"
  echo "  bootstrap"
  echo "  configure [server_ip] [install_api_key]"
  echo "  install-timer [server_ip]"
  echo "  reset-now [server_ip]"
  echo "  delete [--server-id <id>]"
}

function parse_value() {
  local key="$1"
  local input="$2"
  echo "$input" | awk -F= -v k="$key" '$1==k {print $2}' | tail -n1
}

function require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" > /dev/null 2>&1; then
    echo "missing command: $cmd"
    exit 1
  fi
}

function bootstrap() {
  local provision_output
  provision_output="$("$SCRIPT_DIR/provision-demo-hetzner.sh")"
  echo "$provision_output"

  local server_ip
  server_ip="$(parse_value server_ip "$provision_output")"
  local install_api_key
  install_api_key="$(parse_value install_api_key "$provision_output")"
  local server_id
  server_id="$(parse_value server_id "$provision_output")"

  if [ -z "$server_ip" ] || [ -z "$install_api_key" ] || [ -z "$server_id" ]; then
    echo "failed to parse provision output"
    exit 1
  fi

  SERVER_IP="$server_ip" INSTALL_API_KEY="$install_api_key" "$SCRIPT_DIR/configure-demo-instance.sh"
  SERVER_IP="$server_ip" "$SCRIPT_DIR/install-demo-reset-timer.sh"

  echo ""
  echo "done"
  echo "server_id=$server_id"
  echo "server_ip=$server_ip"
  echo "install_api_key=$install_api_key"
  echo "demo_url=https://${DEMO_DOMAIN:-demo.frost.build}"
}

function configure_existing() {
  local server_ip="${SERVER_IP:-${1:-}}"
  local install_api_key="${INSTALL_API_KEY:-${2:-}}"

  if [ -z "$server_ip" ] || [ -z "$install_api_key" ]; then
    echo "configure requires server_ip and install_api_key"
    exit 1
  fi

  SERVER_IP="$server_ip" INSTALL_API_KEY="$install_api_key" "$SCRIPT_DIR/configure-demo-instance.sh"
}

function install_timer_existing() {
  local server_ip="${SERVER_IP:-${1:-}}"

  if [ -z "$server_ip" ]; then
    echo "install-timer requires server_ip"
    exit 1
  fi

  SERVER_IP="$server_ip" "$SCRIPT_DIR/install-demo-reset-timer.sh"
}

function reset_now() {
  local server_ip="${SERVER_IP:-${1:-}}"
  local ssh_user="${DEMO_SSH_USER:-root}"

  if [ -z "$server_ip" ]; then
    echo "reset-now requires server_ip"
    exit 1
  fi

  require_cmd ssh
  ssh -o StrictHostKeyChecking=no "$ssh_user@$server_ip" "systemctl start frost-demo-reset.service && systemctl --no-pager status frost-demo-reset.service --lines=40"
}

function delete_server() {
  "$SCRIPT_DIR/delete-demo-hetzner-server.sh" "$@"
}

command="${1:-}"
if [ -z "$command" ]; then
  usage
  exit 1
fi
shift || true

case "$command" in
  bootstrap)
    bootstrap
    ;;
  configure)
    configure_existing "$@"
    ;;
  install-timer)
    install_timer_existing "$@"
    ;;
  reset-now)
    reset_now "$@"
    ;;
  delete)
    delete_server "$@"
    ;;
  *)
    usage
    exit 1
    ;;
esac
