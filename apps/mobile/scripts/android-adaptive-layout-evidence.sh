#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"
EVIDENCE_ROOT="${CHESSTICIZE_ANDROID_ADAPTIVE_EVIDENCE_DIR:-$APP_DIR/artifacts/android-adaptive-layout}"

if [[ -z "$SDK_ROOT" || ! -x "$SDK_ROOT/platform-tools/adb" ]]; then
  echo "Android adaptive evidence requires an executable SDK platform-tools/adb." >&2
  exit 69
fi

ADB="$SDK_ROOT/platform-tools/adb"
mkdir -p "$EVIDENCE_ROOT"

restore_system_setting() {
  local key="$1"
  local value="$2"
  if [[ -n "$value" && "$value" != "null" ]]; then
    "$ADB" -s "$DEVICE" shell settings put system "$key" "$value" >/dev/null 2>&1 || true
  else
    "$ADB" -s "$DEVICE" shell settings delete system "$key" >/dev/null 2>&1 || true
  fi
}

restore_display_rotation() {
  local state="$1"
  if [[ "$state" == "free" ]]; then
    "$ADB" -s "$DEVICE" shell wm user-rotation free >/dev/null 2>&1 || true
  elif [[ "$state" =~ ^lock\ ([0-3])$ ]]; then
    "$ADB" -s "$DEVICE" shell wm user-rotation lock "${BASH_REMATCH[1]}" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  "$ADB" -s "$DEVICE" shell wm size reset >/dev/null 2>&1 || true
  "$ADB" -s "$DEVICE" shell wm density reset >/dev/null 2>&1 || true
  restore_system_setting font_scale "${original_font_scale:-}"
  restore_display_rotation "${original_user_rotation_state:-}"
}
trap cleanup EXIT

cd "$REPO_ROOT"
git diff --quiet
git diff --cached --quiet
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Android adaptive evidence requires a clean worktree." >&2
  exit 1
fi

commit_sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
api_level="$($ADB -s "$DEVICE" shell getprop ro.build.version.sdk | tr -d '\r')"
original_font_scale="$($ADB -s "$DEVICE" shell settings get system font_scale | tr -d '\r')"
wm_help="$($ADB -s "$DEVICE" shell wm help | tr -d '\r')"
if [[ "$wm_help" != *"user-rotation"* ]]; then
  echo "Android adaptive evidence requires wm user-rotation display control." >&2
  exit 1
fi
original_user_rotation_state="$($ADB -s "$DEVICE" shell wm user-rotation | tr -d '\r')"
if [[ "$original_user_rotation_state" != "free" && ! "$original_user_rotation_state" =~ ^lock\ [0-3]$ ]]; then
  echo "Android adaptive evidence could not read the original display rotation: $original_user_rotation_state" >&2
  exit 1
fi
if [[ "$api_level" != "36" ]]; then
  echo "Android adaptive evidence requires API 36, found API $api_level." >&2
  exit 1
fi

profiles=(
  "phone:1080x2400:420:both:1"
  "tablet:1600x2560:320:both:1"
  "foldable:1768x2208:420:landscape:1"
  "chromeos:1200x1920:240:landscape:1"
  "large-text-phone:1080x2400:420:portrait:1.5"
)

{
  printf 'commit=%s\n' "$commit_sha"
  printf 'api-level=%s\n' "$api_level"
  printf 'device=%s\n' "$DEVICE"
  printf 'build=apps/mobile/android/app/build/outputs/apk/e2e/app-e2e.apk\n'
  printf 'scope=targeted-android-adaptive-layout\n'
  printf 'profiles=%s\n' "${profiles[*]}"
  printf 'original-user-rotation=%s\n' "$original_user_rotation_state"
  printf 'worktree-clean=true\n'
} > "$EVIDENCE_ROOT/context.txt"

for profile_spec in "${profiles[@]}"; do
  IFS=: read -r profile size density orientation_scope font_scale <<< "$profile_spec"
  profile_root="$EVIDENCE_ROOT/$profile"
  mkdir -p "$profile_root"

  # A completed landscape capture leaves Android's display rotation at 90
  # degrees. Normalize the real display before applying the next profile's
  # portrait dimensions so the next physical display rotation starts from
  # known natural bounds.
  "$ADB" -s "$DEVICE" shell am force-stop com.chessticize.mobile >/dev/null 2>&1 || true
  "$ADB" -s "$DEVICE" shell wm user-rotation lock 0
  profile_rotation_state="$($ADB -s "$DEVICE" shell wm user-rotation | tr -d '\r')"
  if [[ "$profile_rotation_state" != "lock 0" ]]; then
    echo "Android adaptive evidence could not reset display rotation: $profile_rotation_state" >&2
    exit 1
  fi
  "$ADB" -s "$DEVICE" shell wm size "$size"
  "$ADB" -s "$DEVICE" shell wm density "$density"
  "$ADB" -s "$DEVICE" shell settings put system font_scale "$font_scale"
  "$ADB" -s "$DEVICE" wait-for-device
  sleep 2

  {
    printf 'profile=%s\n' "$profile"
    printf 'requested-size=%s\n' "$size"
    printf 'requested-density=%s\n' "$density"
    printf 'orientation-scope=%s\n' "$orientation_scope"
    printf 'font-scale=%s\n' "$font_scale"
    printf 'profile-start-user-rotation=%s\n' "$profile_rotation_state"
    "$ADB" -s "$DEVICE" shell wm size
    "$ADB" -s "$DEVICE" shell wm density
  } > "$profile_root/display.txt"

  if [[ "$orientation_scope" == "both" ]]; then
    include_landscape=1
    only_orientation=""
  else
    include_landscape=0
    only_orientation="$orientation_scope"
  fi

  (
    cd "$REPO_ROOT"
    DETOX_ACTIVE_SUITE=android-adaptive-layout \
      CHESSTICIZE_ADAPTIVE_DEVICE_LABEL="android-$profile" \
      CHESSTICIZE_ADAPTIVE_INCLUDE_LANDSCAPE="$include_landscape" \
      CHESSTICIZE_ADAPTIVE_ONLY_ORIENTATION="$only_orientation" \
      CHESSTICIZE_ADAPTIVE_ORIENTATION_EVIDENCE="$profile_root/display.txt" \
      "$APP_DIR/scripts/android-test-for-detox.sh" \
        --cleanup \
        --artifacts-location "$profile_root/detox"
  )

  printf 'result=pass\n' >> "$profile_root/display.txt"
done

printf 'result=pass\n' >> "$EVIDENCE_ROOT/context.txt"
