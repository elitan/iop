#!/bin/bash

export SERVER_IP="${SERVER_IP:?SERVER_IP required}"
export API_KEY="${API_KEY:?API_KEY required}"
export BASE_URL="http://$SERVER_IP:3000"

api() {
  curl -sS --max-time 30 -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" "$@"
}

wait_for_deployment() {
  local DEPLOYMENT_ID=$1
  local MAX=${2:-60}
  for i in $(seq 1 $MAX); do
    STATUS=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq -r '.status')
    if [ "$STATUS" = "running" ]; then
      return 0
    elif [ "$STATUS" = "failed" ]; then
      echo "  Deployment $DEPLOYMENT_ID failed"
      api "$BASE_URL/api/deployments/$DEPLOYMENT_ID" | jq
      return 1
    fi
    sleep 2
  done
  echo "  Deployment $DEPLOYMENT_ID timed out"
  return 1
}

remote() {
  ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR -o ConnectTimeout=10 root@$SERVER_IP "$@"
}

sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9.-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g'
}

get_container_name() {
  local SERVICE_ID=$1
  local DEPLOY_ID=$2
  sanitize_name "frost-${SERVICE_ID}-${DEPLOY_ID}"
}

log() {
  local GROUP=$(basename "$0" .sh | sed 's/group-/G/')
  echo "[$GROUP] $*"
}

fail() {
  log "FAIL: $*"
  exit 1
}

pass() {
  log "PASS"
}
