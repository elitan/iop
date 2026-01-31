#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ADMIN_PASSWORD="${ADMIN_PASSWORD:-e2eTestPassword123}"
NEW_PASSWORD="newE2ePassword456"

log "=== Change password ==="

# wrong current password → error
log "Attempting change with wrong password..."
RESULT=$(api -X PUT "$BASE_URL/api/settings/password" \
  -d '{"currentPassword":"wrong-password-here","newPassword":"something"}')
ERROR=$(json_get "$RESULT" '.message // .error // empty')
if [ -z "$ERROR" ]; then
  fail "Expected error for wrong current password, got: $RESULT"
fi
log "Wrong password correctly rejected"

# too-short new password → error (zod validation, min 4)
log "Attempting change with too-short new password..."
RESULT=$(api -X PUT "$BASE_URL/api/settings/password" \
  -d "{\"currentPassword\":\"$ADMIN_PASSWORD\",\"newPassword\":\"ab\"}")
ERROR=$(json_get "$RESULT" '.message // .error // empty')
if [ -z "$ERROR" ]; then
  fail "Expected error for short password, got: $RESULT"
fi
log "Short password correctly rejected"

# correct change
log "Changing password..."
RESULT=$(api -X PUT "$BASE_URL/api/settings/password" \
  -d "{\"currentPassword\":\"$ADMIN_PASSWORD\",\"newPassword\":\"$NEW_PASSWORD\"}")
SUCCESS=$(json_get "$RESULT" '.success // empty')
if [ "$SUCCESS" != "true" ]; then
  fail "Password change failed: $RESULT"
fi
log "Password changed successfully"

# verify login with new password
log "Verifying login with new password..."
LOGIN_RESULT=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$NEW_PASSWORD\"}")
SUCCESS=$(echo "$LOGIN_RESULT" | jq -r '.success // empty')
if [ "$SUCCESS" != "true" ]; then
  fail "Login with new password failed: $LOGIN_RESULT"
fi
log "Login with new password works"

# verify old password no longer works
log "Verifying old password is rejected on login..."
LOGIN_RESULT=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}")
ERROR=$(echo "$LOGIN_RESULT" | jq -r '.error // empty')
if [ -z "$ERROR" ]; then
  fail "Old password should not work anymore: $LOGIN_RESULT"
fi
log "Old password correctly rejected"

# restore original password
log "Restoring original password..."
RESULT=$(api -X PUT "$BASE_URL/api/settings/password" \
  -d "{\"currentPassword\":\"$NEW_PASSWORD\",\"newPassword\":\"$ADMIN_PASSWORD\"}")
SUCCESS=$(json_get "$RESULT" '.success // empty')
if [ "$SUCCESS" != "true" ]; then
  fail "Failed to restore password: $RESULT"
fi
log "Password restored"

pass
