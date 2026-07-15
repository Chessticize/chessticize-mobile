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

detox_args=("$@")
if [[ "${CHESSTICIZE_DETOX_REUSE_INSTALLED_APP:-0}" == "1" ]]; then
  # Restore evidence must exercise the package Android just restored. Detox's
  # default initialization uninstalls and reinstalls the app, erasing that data.
  detox_args+=(--reuse)
fi

DETOX_ACTIVE_SUITE="${DETOX_ACTIVE_SUITE:-android-launch}" \
  pnpm exec detox test --configuration android.attached.e2e "${detox_args[@]}"
