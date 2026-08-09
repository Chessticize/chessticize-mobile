#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [[ "$#" -gt 1 ]]; then
  echo "Usage: pnpm mobile:ios:dev:device [device-name-or-udid]" >&2
  exit 64
fi

node scripts/ios-release-version.js

device_args=(--device)
if [[ "$#" -eq 1 ]]; then
  device_args=(--device "$1")
fi

exec react-native run-ios \
  --scheme ChessticizeMobile \
  --mode Debug \
  "${device_args[@]}"
