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

if [ -z "$FROST_JWT_SECRET" ]; then
  log "ERROR: FROST_JWT_SECRET not set"
  exit 1
fi

FROST_API_KEY=$(echo -n "${FROST_JWT_SECRET}frost-api-key" | sha256sum | cut -c1-32)

log "Starting cleanup job"

RESPONSE=$(curl -s -X POST http://localhost:3000/api/cleanup/run \
  -H "x-frost-token: $FROST_API_KEY" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  log "Cleanup started successfully"
elif [ "$HTTP_CODE" = "409" ]; then
  log "Cleanup already running"
else
  log "ERROR: Failed to start cleanup (HTTP $HTTP_CODE): $BODY"
  exit 1
fi
