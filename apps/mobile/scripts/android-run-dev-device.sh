#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY_ROOT="$(cd "$APP_DIR/../.." && pwd)"
DEV_APP_ID="com.chessticize.mobile.dev"
MAIN_ACTIVITY="com.chessticize.mobile.MainActivity"
DEVICE="${1:-}"

if [[ -z "$DEVICE" ]]; then
  echo "Usage: pnpm mobile:android:dev:device <adb-serial>" >&2
  exit 2
fi

if [[ "$DEVICE" == emulator-* ]]; then
  echo "The Android Dev device command requires an explicitly connected physical device." >&2
  exit 2
fi

ADB="$(command -v adb || true)"
if [[ -z "$ADB" ]]; then
  ANDROID_SDK_CANDIDATE="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
  if [[ -x "$ANDROID_SDK_CANDIDATE/platform-tools/adb" ]]; then
    ADB="$ANDROID_SDK_CANDIDATE/platform-tools/adb"
  fi
fi
if [[ -z "$ADB" ]]; then
  echo "adb is unavailable. Run pnpm mobile:doctor:android first." >&2
  exit 1
fi

if [[ "$($ADB -s "$DEVICE" get-state 2>/dev/null || true)" != "device" ]]; then
  echo "ADB device is not ready or authorized: $DEVICE" >&2
  exit 1
fi

ABI="$($ADB -s "$DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r')"
case "$ABI" in
  arm64-v8a|x86_64) ;;
  *)
    echo "Unsupported Android device ABI: $ABI" >&2
    exit 1
    ;;
esac

if ! curl --fail --silent http://127.0.0.1:8081/status | grep -q "packager-status:running"; then
  echo "Metro is not running. Start it with pnpm mobile:start, then retry." >&2
  exit 1
fi

cd "$REPOSITORY_ROOT"
node scripts/fetch-core-pack.mjs

cd "$APP_DIR/android"
./gradlew :app:installDeviceDev \
  -PreactNativeArchitectures="$ABI" \
  --console=plain

$ADB -s "$DEVICE" reverse tcp:8081 tcp:8081
$ADB -s "$DEVICE" shell am force-stop "$DEV_APP_ID"
$ADB -s "$DEVICE" shell am start -n "$DEV_APP_ID/$MAIN_ACTIVITY"

echo "Installed and launched Chessticize Dev ($DEV_APP_ID) on $DEVICE."
