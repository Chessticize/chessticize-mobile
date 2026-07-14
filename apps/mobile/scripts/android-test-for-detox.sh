#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

if [[ -z "$SDK_ROOT" ]]; then
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT before running Android E2E." >&2
  exit 69
fi

export ADB_PATH="${ADB_PATH:-$SDK_ROOT/platform-tools/adb}"
if [[ ! -x "$ADB_PATH" ]]; then
  echo "ADB is not executable at $ADB_PATH. Run pnpm mobile:doctor:android for details." >&2
  exit 69
fi

cd "$APP_DIR"

DETOX_ACTIVE_SUITE="${DETOX_ACTIVE_SUITE:-android-launch}" \
  pnpm exec detox test --configuration android.attached.e2e "$@"
