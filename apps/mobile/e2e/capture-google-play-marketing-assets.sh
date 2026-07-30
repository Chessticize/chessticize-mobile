#!/usr/bin/env bash
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$E2E_DIR/.." && pwd)"
REPOSITORY_ROOT="$(cd "$APP_DIR/../.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
E2E_APK="$APP_DIR/android/app/build/outputs/apk/e2e/app-e2e.apk"

if [[ -z "$SDK_ROOT" ]]; then
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT before Google Play capture." >&2
  exit 69
fi
ADB_PATH="${ADB_PATH:-$SDK_ROOT/platform-tools/adb}"
if [[ ! -x "$ADB_PATH" ]]; then
  echo "ADB is not executable at $ADB_PATH." >&2
  exit 69
fi

require_environment() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required for Google Play capture." >&2
    exit 64
  fi
}

assert_clean_source_state() {
  local expected_commit="$1"
  local actual_commit
  actual_commit="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
  if [[ "$actual_commit" != "$expected_commit" ]]; then
    echo "Google Play capture source commit changed during the run." >&2
    exit 65
  fi
  if [[ -n "$(git -C "$REPOSITORY_ROOT" status --porcelain=v1 --untracked-files=no)" ]]; then
    echo "Google Play capture requires a clean tracked worktree." >&2
    exit 65
  fi
}

effective_wm_value() {
  local serial="$1"
  local command_name="$2"
  "$ADB_PATH" -s "$serial" shell wm "$command_name" \
    | tr -d '\r' \
    | tail -n 1 \
    | sed -E 's/^[^:]+:[[:space:]]*//'
}

capture_device_family() {
  local device_family="$1"
  local serial="$2"
  local profile="$3"
  local expected_size="$4"
  local actual_size
  local api_level
  local density_dpi
  local artifact_directory="$OUTPUT_ROOT/detox-$device_family"

  "$ADB_PATH" -s "$serial" get-state >/dev/null
  actual_size="$(effective_wm_value "$serial" size)"
  if [[ "$actual_size" != "$expected_size" ]]; then
    echo "$device_family requires $expected_size raw pixels; $serial reports $actual_size." >&2
    exit 65
  fi
  density_dpi="$(effective_wm_value "$serial" density)"
  if [[ ! "$density_dpi" =~ ^[0-9]+$ ]]; then
    echo "Could not resolve Android density for $serial: $density_dpi" >&2
    exit 65
  fi
  api_level="$("$ADB_PATH" -s "$serial" shell getprop ro.build.version.sdk | tr -d '\r')"
  if [[ ! "$api_level" =~ ^[0-9]+$ ]]; then
    echo "Could not resolve Android API level for $serial: $api_level" >&2
    exit 65
  fi

  (
    cd "$APP_DIR"
    CHESSTICIZE_CAPTURE_MARKETING_ASSETS=1 \
    CHESSTICIZE_MARKETING_PLATFORM=google-play \
    CHESSTICIZE_MARKETING_DEVICE_FAMILY="$device_family" \
    CHESSTICIZE_ANDROID_MARKETING_DEVICE_PROFILE="$profile" \
    CHESSTICIZE_ANDROID_MARKETING_API_LEVEL="$api_level" \
    CHESSTICIZE_ANDROID_MARKETING_DENSITY_DPI="$density_dpi" \
    CHESSTICIZE_ANDROID_MARKETING_CAPTURE_MODE=deterministic-e2e \
    CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_ROLE=detox-e2e-apk \
    CHESSTICIZE_ANDROID_CAPTURE_ARTIFACT_PATH="$E2E_APK" \
    CHESSTICIZE_MARKETING_OUTPUT_ROOT="$OUTPUT_ROOT" \
    CHESSTICIZE_SOURCE_COMMIT="$SOURCE_COMMIT" \
    DETOX_ANDROID_DEVICE="$serial" \
      pnpm exec detox test \
        --configuration android.attached.e2e \
        --artifacts-location "$artifact_directory" \
        e2e/marketing-assets.e2e.js
  )
}

require_environment CHESSTICIZE_MARKETING_ANDROID_PHONE_SERIAL
require_environment CHESSTICIZE_MARKETING_ANDROID_PHONE_PROFILE
require_environment CHESSTICIZE_MARKETING_ANDROID_TABLET_7_SERIAL
require_environment CHESSTICIZE_MARKETING_ANDROID_TABLET_7_PROFILE
require_environment CHESSTICIZE_MARKETING_ANDROID_TABLET_10_SERIAL
require_environment CHESSTICIZE_MARKETING_ANDROID_TABLET_10_PROFILE

SOURCE_COMMIT="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
assert_clean_source_state "$SOURCE_COMMIT"

configured_output_root="${CHESSTICIZE_MARKETING_OUTPUT_ROOT:-scratch/store-assets/google-play/$SOURCE_COMMIT}"
if [[ "$configured_output_root" = /* ]]; then
  OUTPUT_ROOT="$configured_output_root"
else
  OUTPUT_ROOT="$REPOSITORY_ROOT/$configured_output_root"
fi
mkdir -p "$OUTPUT_ROOT"
rm -f \
  "$OUTPUT_ROOT/google-play-capture-manifest.json" \
  "$OUTPUT_ROOT/manifest-android-phone.json" \
  "$OUTPUT_ROOT/manifest-android-tablet-7.json" \
  "$OUTPUT_ROOT/manifest-android-tablet-10.json"

if [[ "${CHESSTICIZE_ANDROID_MARKETING_SKIP_BUILD:-0}" != "1" ]]; then
  (
    cd "$REPOSITORY_ROOT"
    pnpm mobile:e2e:build:android
  )
fi
if [[ ! -f "$E2E_APK" ]]; then
  echo "Missing Android E2E APK: $E2E_APK" >&2
  exit 69
fi

capture_device_family \
  android-phone \
  "$CHESSTICIZE_MARKETING_ANDROID_PHONE_SERIAL" \
  "$CHESSTICIZE_MARKETING_ANDROID_PHONE_PROFILE" \
  1080x1920
capture_device_family \
  android-tablet-7 \
  "$CHESSTICIZE_MARKETING_ANDROID_TABLET_7_SERIAL" \
  "$CHESSTICIZE_MARKETING_ANDROID_TABLET_7_PROFILE" \
  1200x1920
capture_device_family \
  android-tablet-10 \
  "$CHESSTICIZE_MARKETING_ANDROID_TABLET_10_SERIAL" \
  "$CHESSTICIZE_MARKETING_ANDROID_TABLET_10_PROFILE" \
  2560x1600

assert_clean_source_state "$SOURCE_COMMIT"
CHESSTICIZE_MARKETING_OUTPUT_ROOT="$OUTPUT_ROOT" \
  node "$E2E_DIR/finalize-google-play-marketing-capture.js"

echo "Preview-only raw Google Play captures are ready at $OUTPUT_ROOT"
echo "Final Play listing evidence must be recaptured through public UI from the accepted Play-delivered APK."
