#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METRO_PORT="${METRO_PORT:-8081}"
METRO_LOG="$APP_DIR/artifacts/android-launch/metro.log"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

if [[ -z "$SDK_ROOT" ]]; then
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT before running the Android launch smoke." >&2
  exit 69
fi

ADB_PATH="${ADB_PATH:-$SDK_ROOT/platform-tools/adb}"
if [[ ! -x "$ADB_PATH" ]]; then
  echo "ADB is not executable at $ADB_PATH. Run pnpm mobile:doctor:android for details." >&2
  exit 69
fi

mkdir -p "$(dirname "$METRO_LOG")"
cd "$APP_DIR"

pnpm exec react-native start --host 127.0.0.1 --port "$METRO_PORT" >"$METRO_LOG" 2>&1 &
metro_pid=$!

cleanup() {
  kill "$metro_pid" 2>/dev/null || true
  wait "$metro_pid" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl --fail --silent "http://127.0.0.1:$METRO_PORT/status" | grep -q "packager-status:running"; then
    break
  fi
  if ! kill -0 "$metro_pid" 2>/dev/null; then
    cat "$METRO_LOG" >&2
    echo "Metro exited before the Android launch smoke started." >&2
    exit 69
  fi
  sleep 1
done

if ! curl --fail --silent "http://127.0.0.1:$METRO_PORT/status" | grep -q "packager-status:running"; then
  cat "$METRO_LOG" >&2
  echo "Metro did not become ready on port $METRO_PORT." >&2
  exit 69
fi

"$ADB_PATH" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT"
DETOX_ACTIVE_SUITE=android-launch pnpm exec detox test --configuration android.attached.debug "$@"
