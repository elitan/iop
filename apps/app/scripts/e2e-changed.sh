#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"
DEFAULT_GROUPS="${E2E_DEFAULT_GROUPS:-01-basic,04-update,10-race,20-setup,28-oauth,29-mcp}"
BATCH_SIZE="${1:-2}"
BASE_REF="${E2E_BASE_REF:-origin/main}"

cd "$REPO_ROOT"

SELECTED_GROUPS=()
SELECTED_GROUP_KEYS="|"

add_group() {
  local group="$1"
  group="${group%.sh}"
  group="${group##*/}"
  group="${group#group-}"
  [ -n "$group" ] || return 0

  case "$SELECTED_GROUP_KEYS" in
    *"|$group|"*) return 0 ;;
  esac

  SELECTED_GROUPS+=("$group")
  SELECTED_GROUP_KEYS="${SELECTED_GROUP_KEYS}${group}|"
}

add_groups_csv() {
  local csv="$1"
  local normalized
  normalized=$(echo "$csv" | tr ',\n\t' '   ')
  for group in $normalized; do
    add_group "$group"
  done
}

select_from_file() {
  local file="$1"

  case "$file" in
    apps/app/scripts/e2e/group-*.sh)
      add_group "$(basename "$file" .sh)"
      ;;
  esac

  case "$file" in
    apps/app/src/server/settings.ts|apps/app/src/contracts/settings.ts|apps/app/src/lib/caddy.ts|apps/app/src/lib/domains.ts|apps/app/src/server/domains.ts|apps/app/src/lib/cloudflare.ts|apps/app/scripts/e2e/group-05-ssl.sh|apps/app/scripts/e2e/group-17-wildcard.sh|apps/app/scripts/e2e/group-23-change-password.sh)
      add_groups_csv "05-ssl,17-wildcard,23-change-password"
      ;;
  esac

  case "$file" in
    apps/app/src/app/api/oauth/*|apps/app/src/lib/oauth.ts|apps/app/src/lib/oauth.test.ts|apps/app/src/app/api/mcp/*|apps/app/src/server/mcp-tokens.ts|apps/app/src/contracts/mcp-*.ts|apps/app/scripts/e2e/group-28-oauth.sh|apps/app/scripts/e2e/group-29-mcp.sh)
      add_groups_csv "28-oauth,29-mcp"
      ;;
  esac

  case "$file" in
    apps/app/src/app/api/github/*|apps/app/src/lib/webhook.ts|apps/app/src/lib/github.ts|apps/app/src/server/github.ts|apps/app/scripts/e2e/group-06-webhook.sh|apps/app/scripts/e2e/group-22-preview-envs.sh)
      add_groups_csv "06-webhook,22-preview-envs"
      ;;
  esac

  case "$file" in
    apps/app/src/lib/deployer.ts|apps/app/src/lib/docker.ts|apps/app/src/server/services.ts|apps/app/src/server/deployments.ts|apps/app/src/server/projects.ts|apps/app/src/server/environments.ts|apps/app/src/lib/paths.ts|apps/app/scripts/e2e/common.sh|apps/app/scripts/e2e-test.sh|apps/app/scripts/e2e-local*.sh)
      add_groups_csv "01-basic,02-multiservice,03-envvars,04-update,07-database,08-rollback,09-healthcheck,10-race,11-frost-env,12-limits,13-timeout,14-volumes,16-concurrent,18-build-context,19-templates,21-hostname,24-zero-downtime,25-graceful-shutdown,26-replicas,27-replica-logs"
      ;;
  esac

  case "$file" in
    apps/app/src/app/api/setup/*|apps/app/src/app/api/auth/*|apps/app/src/lib/auth.ts|apps/app/src/proxy.ts|apps/app/scripts/e2e/group-20-setup.sh|apps/app/scripts/e2e/group-23-change-password.sh)
      add_groups_csv "20-setup,23-change-password,28-oauth,29-mcp"
      ;;
  esac
}

BASE_COMMIT=""
if git rev-parse --verify "$BASE_REF" > /dev/null 2>&1; then
  BASE_COMMIT=$(git merge-base "$BASE_REF" HEAD 2>/dev/null || true)
fi

if [ -z "$BASE_COMMIT" ]; then
  if git rev-parse --verify HEAD~1 > /dev/null 2>&1; then
    BASE_COMMIT="$(git rev-parse HEAD~1)"
  else
    BASE_COMMIT="$(git rev-parse HEAD)"
  fi
fi

CHANGED_FILES="$(
  {
    git diff --name-only "$BASE_COMMIT"...HEAD 2>/dev/null || true
    git diff --name-only
    git diff --name-only --cached
  } | awk 'NF' | sort -u
)"

if [ -n "$CHANGED_FILES" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    select_from_file "$file"
  done <<< "$CHANGED_FILES"
fi

if [ "${#SELECTED_GROUPS[@]}" -eq 0 ]; then
  add_groups_csv "$DEFAULT_GROUPS"
fi

GROUPS_CSV=$(IFS=, ; echo "${SELECTED_GROUPS[*]}")

echo "Base ref: $BASE_REF"
echo "Base commit: $BASE_COMMIT"
echo "Selected E2E groups: $GROUPS_CSV"

if [ "${E2E_CHANGED_DRY_RUN:-0}" = "1" ]; then
  exit 0
fi

E2E_GROUPS="$GROUPS_CSV" bash "$SCRIPT_DIR/e2e-local-managed.sh" "$BATCH_SIZE"
