#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVICE_NAME="${DETOX_IOS_DEVICE:-Chessticize Marketing iPad Pro 13-inch (M5)}"
CONFIGURED_UDID="${DETOX_IOS_DEVICE_UDID:-}"

if [[ "$DEVICE_NAME" != *iPad* ]]; then
  echo "Landscape layout validation requires an iPad Simulator." >&2
  exit 64
fi

resolve_args=(--device-name "$DEVICE_NAME")
if [[ -n "$CONFIGURED_UDID" ]]; then
  resolve_args+=(--device-udid "$CONFIGURED_UDID")
fi
target_json="$(
  node "$APP_DIR/scripts/resolve-ios-simulator-target.js" "${resolve_args[@]}"
)"
DEVICE_UDID="$(
  node -e 'process.stdout.write(JSON.parse(process.argv[1]).udid)' "$target_json"
)"

(
  cd "$APP_DIR"
  CHESSTICIZE_IOS_LANDSCAPE_VALIDATION=1 \
  DETOX_IOS_DEVICE="$DEVICE_NAME" \
  DETOX_IOS_DEVICE_UDID="$DEVICE_UDID" \
    pnpm e2e:build:ios:release

  CHESSTICIZE_VERIFY_IOS_LANDSCAPE_LAYOUT=1 \
  CHESSTICIZE_MARKETING_DEVICE_FAMILY=ipad \
  DETOX_IOS_DEVICE="$DEVICE_NAME" \
  DETOX_IOS_DEVICE_UDID="$DEVICE_UDID" \
    pnpm e2e:verify:ios:landscape-layout
)
