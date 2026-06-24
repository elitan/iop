#!/usr/bin/env bash
set -euo pipefail

MODE="${1:?mode is required}"
BRANCH_NAME="${2:?branch name is required}"
BASE_BRANCH="${3:?base branch is required}"
REPOSITORY="${4:?repository is required}"

TEMP_REPO=$(mktemp -d)

cleanup() {
  rm -rf "$TEMP_REPO"
}
trap cleanup EXIT

echo "Creating $MODE rollback branch: $BRANCH_NAME from $BASE_BRANCH"

git clone --depth 1 --branch "$BASE_BRANCH" "https://x-access-token:${GH_TOKEN:?GH_TOKEN is required}@github.com/${REPOSITORY}.git" "$TEMP_REPO"
cd "$TEMP_REPO"

git config user.email "ci@frost.dev"
git config user.name "Frost CI"
git checkout -b "$BRANCH_NAME"

CHANGED_FILES=(update.sh)
COMMIT_MESSAGE=""

case "$MODE" in
  build)
    echo "console.log('Intentional build failure for e2e test'); process.exit(1);" > fail-build.js
    node -e "
      const pkg = require('./package.json');
      pkg.scripts.build = 'node fail-build.js';
      require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    "

    CHANGED_FILES+=(fail-build.js package.json)
    COMMIT_MESSAGE="Intentionally broken build for e2e rollback test"
    ;;
  migration)
    LAST_MIGRATION_NUMBER=$(find apps/app/schema -name '*.sql' -exec basename {} \; | sed -n 's/^\([0-9][0-9][0-9]\)-.*$/\1/p' | sort -n | tail -n1)
    NEXT_MIGRATION_NUMBER=$(printf "%03d" $((10#$LAST_MIGRATION_NUMBER + 1)))
    MIGRATION_FILE="apps/app/schema/${NEXT_MIGRATION_NUMBER}-migration-restore-fail.sql"

    cat > "$MIGRATION_FILE" <<'SQL'
PRAGMA foreign_keys = OFF;
INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_restore_probe', 'mutated');
THIS IS NOT VALID SQL;
SQL

    CHANGED_FILES+=("$MIGRATION_FILE")
    COMMIT_MESSAGE="Intentionally broken migration for e2e rollback test"
    ;;
  *)
    echo "Unknown rollback branch mode: $MODE" >&2
    exit 1
    ;;
esac

sed -i "s|git fetch origin main|git fetch origin $BRANCH_NAME:refs/remotes/origin/main|g" update.sh
git add "${CHANGED_FILES[@]}"
git commit -m "$COMMIT_MESSAGE"
git push origin "$BRANCH_NAME"

echo "branch=$BRANCH_NAME" >> "$GITHUB_OUTPUT"
