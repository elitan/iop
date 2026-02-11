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

function cf_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4$path" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body"
    return
  fi
  curl -sS -X "$method" "https://api.cloudflare.com/client/v4$path" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
}

function upsert_a_record() {
  local zone_id="$1"
  local name="$2"
  local ip="$3"

  local get_resp
  get_resp="$(cf_request GET "/zones/$zone_id/dns_records?type=A&name=$name")"
  local ok
  ok="$(echo "$get_resp" | jq -r '.success')"
  if [ "$ok" != "true" ]; then
    echo "cloudflare get record failed: $name"
    echo "$get_resp"
    exit 1
  fi

  local record_id
  record_id="$(echo "$get_resp" | jq -r '.result[0].id // empty')"
  if [ -n "$record_id" ]; then
    local patch_body
    patch_body="$(jq -nc --arg content "$ip" '{content:$content,ttl:1,proxied:false}')"
    local patch_resp
    patch_resp="$(cf_request PATCH "/zones/$zone_id/dns_records/$record_id" "$patch_body")"
    local patch_ok
    patch_ok="$(echo "$patch_resp" | jq -r '.success')"
    if [ "$patch_ok" != "true" ]; then
      echo "cloudflare update record failed: $name"
      echo "$patch_resp"
      exit 1
    fi
    return
  fi

  local create_body
  create_body="$(jq -nc --arg name "$name" --arg content "$ip" '{type:"A",name:$name,content:$content,ttl:1,proxied:false}')"
  local create_resp
  create_resp="$(cf_request POST "/zones/$zone_id/dns_records" "$create_body")"
  local create_ok
  create_ok="$(echo "$create_resp" | jq -r '.success')"
  if [ "$create_ok" != "true" ]; then
    echo "cloudflare create record failed: $name"
    echo "$create_resp"
    exit 1
  fi
}

function resolve_ipv4() {
  local name="$1"
  if command -v dig > /dev/null 2>&1; then
    dig +short A "$name" @1.1.1.1 | grep -E '^[0-9.]+$' | head -n1 || true
    return
  fi
  if command -v host > /dev/null 2>&1; then
    host "$name" 1.1.1.1 | awk '/has address/ {print $4; exit}' || true
    return
  fi
  if command -v nslookup > /dev/null 2>&1; then
    nslookup "$name" 1.1.1.1 2>/dev/null | awk '/^Address: / {print $2; exit}' || true
    return
  fi
  echo ""
}

function wait_for_dns() {
  local name="$1"
  local expected_ip="$2"
  for _ in $(seq 1 60); do
    local resolved
    resolved="$(resolve_ipv4 "$name")"
    if [ "$resolved" = "$expected_ip" ]; then
      return
    fi
    sleep 5
  done
  echo "dns did not resolve to expected ip: $name -> $expected_ip"
  exit 1
}

function api_request() {
  local method="$1"
  local base_url="$2"
  local path="$3"
  local body="${4:-}"
  local response

  if [ -n "$body" ]; then
    response="$(curl -ksS -X "$method" "$base_url$path" \
      -H "X-Frost-Token: $INSTALL_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -w "\n%{http_code}")"
  else
    response="$(curl -ksS -X "$method" "$base_url$path" \
      -H "X-Frost-Token: $INSTALL_API_KEY" \
      -w "\n%{http_code}")"
  fi

  local http_code
  http_code="$(echo "$response" | tail -n1)"
  local response_body
  response_body="$(echo "$response" | sed '$d')"

  if [ "$http_code" -ge 400 ]; then
    echo "api request failed: $method $path ($http_code)"
    echo "$response_body"
    exit 1
  fi

  echo "$response_body"
}

function public_api_request() {
  local method="$1"
  local base_url="$2"
  local path="$3"
  local body="${4:-}"
  local response

  if [ -n "$body" ]; then
    response="$(curl -ksS -X "$method" "$base_url$path" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -w "\n%{http_code}")"
  else
    response="$(curl -ksS -X "$method" "$base_url$path" -w "\n%{http_code}")"
  fi

  local http_code
  http_code="$(echo "$response" | tail -n1)"
  local response_body
  response_body="$(echo "$response" | sed '$d')"

  if [ "$http_code" -ge 400 ]; then
    echo "public api request failed: $method $path ($http_code)"
    echo "$response_body"
    exit 1
  fi

  echo "$response_body"
}

for cmd in curl jq sed awk; do
  require_cmd "$cmd"
done

require_env CLOUDFLARE_API_TOKEN
require_env DEMO_EMAIL
require_env DEMO_PASSWORD

DEMO_DOMAIN="${DEMO_DOMAIN:-demo.frost.build}"
SERVER_IP="${SERVER_IP:-${1:-}}"
INSTALL_API_KEY="${INSTALL_API_KEY:-${2:-}}"

if [ -z "$SERVER_IP" ]; then
  echo "missing server ip: set SERVER_IP or pass as arg1"
  exit 1
fi

if [ -z "$INSTALL_API_KEY" ]; then
  echo "missing install api key: set INSTALL_API_KEY or pass as arg2"
  exit 1
fi

root_domain="${DEMO_DOMAIN#*.}"
wildcard_name="*.${DEMO_DOMAIN}"
wildcard_probe="wildcard-check-$(date +%s).${DEMO_DOMAIN}"

echo "getting cloudflare zone"
zone_resp="$(cf_request GET "/zones?name=$root_domain")"
zone_ok="$(echo "$zone_resp" | jq -r '.success')"
zone_id="$(echo "$zone_resp" | jq -r '.result[0].id // empty')"

if [ "$zone_ok" != "true" ] || [ -z "$zone_id" ]; then
  echo "failed to get zone id for $root_domain"
  echo "$zone_resp"
  exit 1
fi

echo "upserting dns records"
upsert_a_record "$zone_id" "$DEMO_DOMAIN" "$SERVER_IP"
upsert_a_record "$zone_id" "$wildcard_name" "$SERVER_IP"

echo "waiting dns propagation"
wait_for_dns "$DEMO_DOMAIN" "$SERVER_IP"
wait_for_dns "$wildcard_probe" "$SERVER_IP"

ip_base_url="http://$SERVER_IP:3000"
domain_base_url="https://$DEMO_DOMAIN"

echo "enabling ssl"
api_request POST "$ip_base_url" "/api/settings/enable-ssl" "$(jq -nc --arg domain "$DEMO_DOMAIN" --arg email "$DEMO_EMAIL" '{domain:$domain,email:$email,staging:false}')" > /dev/null

echo "waiting ssl verification"
for _ in $(seq 1 60); do
  verify_resp="$(api_request POST "$ip_base_url" "/api/settings/verify-ssl" "$(jq -nc --arg domain "$DEMO_DOMAIN" '{domain:$domain}')")"
  working="$(echo "$verify_resp" | jq -r '.working')"
  if [ "$working" = "true" ]; then
    break
  fi
  sleep 5
done

echo "setting wildcard"
api_request POST "$domain_base_url" "/api/settings/wildcard" "$(jq -nc --arg wildcardDomain "$DEMO_DOMAIN" --arg dnsToken "$CLOUDFLARE_API_TOKEN" '{wildcardDomain:$wildcardDomain,dnsProvider:"cloudflare",dnsApiToken:$dnsToken}')" > /dev/null

echo "setting demo password"
setup_resp="$(public_api_request GET "$domain_base_url" "/api/setup")"
setup_complete="$(echo "$setup_resp" | jq -r '.setupComplete')"
if [ "$setup_complete" != "true" ]; then
  public_api_request POST "$domain_base_url" "/api/setup" "$(jq -nc --arg password "$DEMO_PASSWORD" '{password:$password}')" > /dev/null
fi

echo "configured_domain=$DEMO_DOMAIN"
echo "configured_ip=$SERVER_IP"
