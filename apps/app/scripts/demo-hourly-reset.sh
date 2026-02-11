#!/bin/bash
set -euo pipefail

if [ -f /opt/frost/.env ]; then
  set -a
  source /opt/frost/.env
  set +a
fi

if [ ! -f /etc/frost-demo.env ]; then
  echo "missing /etc/frost-demo.env"
  exit 1
fi

set -a
source /etc/frost-demo.env
set +a

DEMO_DOMAIN="${DEMO_DOMAIN:-demo.frost.build}"
FROST_DATA_DIR="${FROST_DATA_DIR:-/opt/frost/data}"
DB_PATH="${FROST_DB_PATH:-$FROST_DATA_DIR/frost.db}"
LOG_FILE="$FROST_DATA_DIR/demo-reset.log"

mkdir -p "$FROST_DATA_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

if [ "${DEMO_ENV:-}" != "demo" ]; then
  echo "safety gate failed: DEMO_ENV must be demo"
  exit 1
fi

if [ -z "${DEMO_PASSWORD:-}" ]; then
  echo "missing DEMO_PASSWORD"
  exit 1
fi

if [ "${#DEMO_PASSWORD}" -lt 8 ]; then
  echo "DEMO_PASSWORD must be at least 8 chars"
  exit 1
fi

if [ -z "${FROST_JWT_SECRET:-}" ]; then
  echo "missing FROST_JWT_SECRET"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "missing db: $DB_PATH"
  exit 1
fi

mkdir -p /var/lock
exec 9>"/var/lock/frost-demo-reset.lock"
if ! flock -n 9; then
  echo "reset already running"
  exit 0
fi

function db_scalar() {
  local sql="$1"
  DB_PATH="$DB_PATH" SQL="$sql" bun -e 'import { Database } from "bun:sqlite"; const db = new Database(process.env.DB_PATH!); const row = db.query(process.env.SQL!).get() as Record<string, unknown> | undefined; if (row) { const key = Object.keys(row)[0]; const val = row[key]; if (val !== null && val !== undefined) process.stdout.write(String(val)); } db.close();'
}

function db_exec() {
  local sql="$1"
  DB_PATH="$DB_PATH" SQL="$sql" bun -e 'import { Database } from "bun:sqlite"; const db = new Database(process.env.DB_PATH!); db.exec(process.env.SQL!); db.close();'
}

current_domain="$(db_scalar "SELECT value FROM settings WHERE key = 'domain' LIMIT 1")"
if [ "$current_domain" != "$DEMO_DOMAIN" ]; then
  echo "safety gate failed: settings domain is '$current_domain'"
  exit 1
fi

function create_api_key() {
  local name="$1"
  (cd /opt/frost && FROST_JWT_SECRET="$FROST_JWT_SECRET" FROST_DATA_DIR="$FROST_DATA_DIR" bun scripts/create-api-key.ts "$name")
}

API_KEY=""

function api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response

  if [ -n "$body" ]; then
    response="$(curl -sS -X "$method" "http://localhost:3000$path" \
      -H "X-Frost-Token: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -w "\n%{http_code}")"
  else
    response="$(curl -sS -X "$method" "http://localhost:3000$path" \
      -H "X-Frost-Token: $API_KEY" \
      -w "\n%{http_code}")"
  fi

  local http_code
  http_code="$(echo "$response" | tail -n1)"
  local response_body
  response_body="$(echo "$response" | sed '$d')"

  if [ "$http_code" -ge 400 ]; then
    echo "api error: $method $path ($http_code)"
    echo "$response_body"
    exit 1
  fi

  echo "$response_body"
}

echo "reset start: $(date -Is)"
API_KEY="$(create_api_key "demo-reset-$(date +%s)-phase1")"

echo "deleting projects"
projects_json="$(api_request GET "/api/projects")"
project_ids="$(echo "$projects_json" | jq -r '.[].id // empty')"
if [ -n "$project_ids" ]; then
  while IFS= read -r project_id; do
    if [ -n "$project_id" ]; then
      api_request DELETE "/api/projects/$project_id" > /dev/null
    fi
  done <<< "$project_ids"
fi

echo "clearing sensitive tables"
db_exec "
DELETE FROM registries;
DELETE FROM github_installations;
DELETE FROM oauth_clients;
DELETE FROM oauth_codes;
DELETE FROM oauth_tokens;
DELETE FROM api_keys;
DELETE FROM metrics;
DELETE FROM settings
WHERE key NOT IN (
  'admin_password_hash',
  'domain',
  'email',
  'ssl_enabled',
  'ssl_staging',
  'wildcard_domain',
  'dns_provider',
  'dns_api_token'
);
"

echo "reapplying demo password"
(cd /opt/frost && FROST_DATA_DIR="$FROST_DATA_DIR" bun run setup "$DEMO_PASSWORD")

echo "seeding demo project"
API_KEY="$(create_api_key "demo-reset-$(date +%s)-phase2")"

project_resp="$(api_request POST "/api/projects" "$(jq -nc '{name:"demo-hello",envVars:[]}')")"
project_id="$(echo "$project_resp" | jq -r '.id // empty')"
if [ -z "$project_id" ]; then
  echo "failed to create demo project"
  exit 1
fi

envs_resp="$(api_request GET "/api/projects/$project_id/environments")"
env_id="$(echo "$envs_resp" | jq -r '.[0].id // empty')"
if [ -z "$env_id" ]; then
  echo "failed to get production environment"
  exit 1
fi

service_payload="$(jq -nc --arg environmentId "$env_id" '{environmentId:$environmentId,name:"hello",deployType:"image",serviceTemplateId:"hello",envVars:[]}')"
service_resp="$(api_request POST "/api/environments/$env_id/services" "$service_payload")"
service_id="$(echo "$service_resp" | jq -r '.id // empty')"
if [ -z "$service_id" ]; then
  echo "failed to create demo service"
  exit 1
fi

running="false"
for _ in $(seq 1 180); do
  deployments_resp="$(api_request GET "/api/services/$service_id/deployments")"
  status="$(echo "$deployments_resp" | jq -r '.[0].status // empty')"
  if [ "$status" = "running" ]; then
    running="true"
    break
  fi
  if [ "$status" = "failed" ] || [ "$status" = "cancelled" ]; then
    echo "demo deployment ended with status: $status"
    exit 1
  fi
  sleep 2
done

if [ "$running" != "true" ]; then
  echo "demo service did not reach running state"
  exit 1
fi

db_exec "DELETE FROM api_keys;"

echo "reset complete: $(date -Is)"
