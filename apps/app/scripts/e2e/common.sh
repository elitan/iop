#!/bin/bash

export SERVER_IP="${SERVER_IP:?SERVER_IP required}"
export API_KEY="${API_KEY:?API_KEY required}"
E2E_PORT="${FROST_PORT:-3000}"
export BASE_URL="http://$SERVER_IP:$E2E_PORT"
export E2E_FAIL_ON_5XX="${E2E_FAIL_ON_5XX:-1}"

if [ -z "${FROST_DATA_DIR:-}" ]; then
  if [ "${E2E_LOCAL:-}" = "1" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    export FROST_DATA_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/data"
  else
    export FROST_DATA_DIR="/opt/frost/data"
  fi
fi

api() {
  local FULL_RESPONSE
  local RESPONSE
  local HTTP_CODE
  local REQUEST_ID
  local CURL_EXIT
  local HEADER_FILE=$(mktemp)

  FULL_RESPONSE=$(curl -sS --max-time 30 -D "$HEADER_FILE" -w "\n%{http_code}" -H "X-Frost-Token: $API_KEY" -H "Content-Type: application/json" "$@" 2>&1)
  CURL_EXIT=$?

  REQUEST_ID=$(grep -i "x-request-id:" "$HEADER_FILE" 2>/dev/null | tr -d '\r' | cut -d' ' -f2)
  rm -f "$HEADER_FILE"

  if [ $CURL_EXIT -ne 0 ]; then
    echo "curl failed (exit $CURL_EXIT): $FULL_RESPONSE" >&2
    echo "{}"
    return 1
  fi

  HTTP_CODE=$(echo "$FULL_RESPONSE" | tail -n1)
  RESPONSE=$(echo "$FULL_RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -ge 400 ] 2>/dev/null; then
    echo "API error (HTTP $HTTP_CODE): $RESPONSE" >&2
    if [ "$HTTP_CODE" = "500" ] && [ -n "$REQUEST_ID" ]; then
      echo "Request ID: $REQUEST_ID" >&2
      echo "--- Server logs for request $REQUEST_ID ---" >&2
      if [ "${E2E_LOCAL:-}" = "1" ]; then
        grep -A 20 "\[$REQUEST_ID\]" /tmp/frost-dev.log 2>/dev/null | head -30 >&2 || echo "(no local log found)" >&2
      else
        ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR -o ConnectTimeout=5 root@$SERVER_IP \
          "journalctl -u frost --no-pager -n 50 2>/dev/null | grep -A 20 '\[$REQUEST_ID\]'" 2>&1 | head -30 >&2
      fi
      echo "--- End server logs ---" >&2
    fi
  fi
  echo "$RESPONSE"

  if [ "$HTTP_CODE" -ge 500 ] 2>/dev/null && [ "$E2E_FAIL_ON_5XX" = "1" ]; then
    return 1
  fi
}

json_get() {
  local JSON="$1"
  local FIELD="$2"
  local RESULT

  if [ -z "$JSON" ]; then
    echo "json_get: empty input for field '$FIELD'" >&2
    return 1
  fi

  RESULT=$(echo "$JSON" | jq -r "$FIELD" 2>&1)
  if [ $? -ne 0 ]; then
    echo "json_get: jq parse error for '$FIELD'" >&2
    echo "Input was: ${JSON:0:500}" >&2
    return 1
  fi

  echo "$RESULT"
}

require_field() {
  local JSON="$1"
  local FIELD="$2"
  local CONTEXT="${3:-}"
  local VALUE

  VALUE=$(json_get "$JSON" "$FIELD")
  if [ $? -ne 0 ]; then
    [ -n "$CONTEXT" ] && echo "$CONTEXT: " >&2
    return 1
  fi

  if [ "$VALUE" = "null" ] || [ -z "$VALUE" ]; then
    echo "Required field '$FIELD' is null/empty${CONTEXT:+ ($CONTEXT)}" >&2
    echo "Response: ${JSON:0:500}" >&2
    return 1
  fi

  echo "$VALUE"
}

wait_for_deployment() {
  local DEPLOYMENT_ID=$1
  local MAX=${2:-60}
  local RESPONSE
  local STATUS
  for i in $(seq 1 $MAX); do
    RESPONSE=$(api "$BASE_URL/api/deployments/$DEPLOYMENT_ID")
    STATUS=$(json_get "$RESPONSE" '.status')
    if [ $? -ne 0 ]; then
      echo "  wait_for_deployment: failed to get status for $DEPLOYMENT_ID" >&2
      echo "  Response: $RESPONSE" >&2
      sleep 2
      continue
    fi
    if [ "$STATUS" = "running" ]; then
      return 0
    elif [ "$STATUS" = "failed" ]; then
      echo "  Deployment $DEPLOYMENT_ID failed" >&2
      echo "$RESPONSE" | jq >&2 || echo "$RESPONSE" >&2
      return 1
    fi
    sleep 2
  done
  echo "  Deployment $DEPLOYMENT_ID timed out (last status: $STATUS)" >&2
  return 1
}

remote() {
  if [ "${E2E_LOCAL:-}" = "1" ]; then
    bash -c "$@"
  else
    ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR -o ConnectTimeout=10 root@$SERVER_IP "$@"
  fi
}

get_default_environment() {
  local PROJECT_ID=$1
  local ENVS=$(api "$BASE_URL/api/projects/$PROJECT_ID/environments")
  json_get "$ENVS" '.[0].id'
}

sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9.-]/-/g' | sed -E 's/-+/-/g' | sed 's/^-//' | sed 's/-$//'
}

get_container_name() {
  local SERVICE_ID=$1
  local DEPLOY_ID=$2
  sanitize_name "frost-${SERVICE_ID}-${DEPLOY_ID}"
}

setup_github_app_settings() {
  local WEBHOOK_SECRET=$1
  api -X PUT "$BASE_URL/api/settings/github/test-credentials" \
    -d "{\"appId\":\"test-app-id\",\"slug\":\"test-app\",\"name\":\"Test App\",\"privateKey\":\"test-private-key\",\"webhookSecret\":\"$WEBHOOK_SECRET\",\"clientId\":\"test-client-id\",\"clientSecret\":\"test-client-secret\"}" > /dev/null \
    || return 1
}

cleanup_github_app_settings() {
  api -X POST "$BASE_URL/api/settings/github/disconnect" > /dev/null || true
}

log() {
  local GROUP=$(basename "$0" .sh | sed 's/group-/G/')
  echo "[$GROUP] $*"
}

fail() {
  log "FAIL: $*"
  echo "--- Recent server logs (last 30 lines) ---" >&2
  if [ "${E2E_LOCAL:-}" = "1" ]; then
    tail -30 /tmp/frost-dev.log 2>/dev/null || echo "(no local log found)" >&2
  else
    ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR -o ConnectTimeout=5 root@$SERVER_IP \
      "journalctl -u frost --no-pager -n 30" 2>&1 | tail -30 >&2
  fi
  echo "--- End server logs ---" >&2
  exit 1
}

pass() {
  log "PASS"
}
