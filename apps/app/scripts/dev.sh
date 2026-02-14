#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "--demo" ]; then
  shift
  FROST_DEMO_MODE=true bun --cwd apps/app dev "$@"
  exit 0
fi

bun --cwd apps/app dev "$@"
