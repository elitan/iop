#!/bin/bash

FROST_DIR="/opt/frost"
CLEANUP_LOG="$FROST_DIR/data/.cleanup-log"

log() {
  echo "$(date -Iseconds) $1" >> "$CLEANUP_LOG"
}

if [ ! -f "$FROST_DIR/.env" ]; then
  log "ERROR: .env file not found"
  exit 1
fi

source "$FROST_DIR/.env"
CLEANUP_KEY_FILE="${FROST_CLEANUP_API_KEY_FILE:-$FROST_DIR/data/.cleanup-api-key}"

log "Starting cleanup job"

if [ ! -s "$CLEANUP_KEY_FILE" ]; then
  log "ERROR: cleanup API key missing; run install/update to provision it"
  exit 1
fi

FROST_API_KEY=$(tr -d '\r\n' < "$CLEANUP_KEY_FILE")
if [ -z "$FROST_API_KEY" ]; then
  log "ERROR: cleanup API key file is empty"
  exit 1
fi

RESPONSE=$(curl -s -X POST http://localhost:3000/api/cleanup/run \
  -H "x-frost-token: $FROST_API_KEY" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  log "ERROR: cleanup API key rejected; run install/update to reprovision it"
  exit 1
fi

if [ "$HTTP_CODE" = "200" ]; then
  log "Cleanup started successfully"
elif [ "$HTTP_CODE" = "409" ]; then
  log "Cleanup already running"
else
  log "ERROR: Failed to start cleanup (HTTP $HTTP_CODE): $BODY"
  exit 1
fi
