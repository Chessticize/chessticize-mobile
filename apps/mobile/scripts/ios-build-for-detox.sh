#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

scripts/ios-doctor.sh

REPO_DIR="$APP_DIR/../.."
CORE_PACK_PATH="$REPO_DIR/fixtures/puzzles/bundled-core-pack.sqlite"
core_pack_backup=""

restore_core_pack() {
  if [[ "${DETOX_USE_FIXTURE_CORE_PACK:-0}" != "1" ]]; then
    return
  fi
  rm -f "$CORE_PACK_PATH"
  if [[ -n "$core_pack_backup" && -f "$core_pack_backup" ]]; then
    mv "$core_pack_backup" "$CORE_PACK_PATH"
  fi
}

if [[ "${DETOX_USE_FIXTURE_CORE_PACK:-0}" == "1" ]]; then
  if [[ -f "$CORE_PACK_PATH" ]]; then
    core_pack_backup="$CORE_PACK_PATH.release-backup.$$"
    mv "$CORE_PACK_PATH" "$core_pack_backup"
  fi
  trap restore_core_pack EXIT
  (
    cd "$REPO_DIR"
    node --experimental-strip-types scripts/generate-detox-puzzle-pack.mjs --output "$CORE_PACK_PATH"
  )
else
  (cd "$REPO_DIR" && node scripts/fetch-core-pack.mjs)
fi

if ! bundle check; then
  bundle install
fi

bundle exec pod install --project-directory=ios

export FORCE_BUNDLING=1

destination_args=()
if [[ -n "${DETOX_IOS_DEVICE:-}" ]]; then
  destination_args=(-destination "platform=iOS Simulator,name=${DETOX_IOS_DEVICE}")
fi

xcodebuild_args=(
  -workspace ios/ChessticizeMobile.xcworkspace \
  -scheme ChessticizeMobile \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath ios/build \
  ONLY_ACTIVE_ARCH=YES
)

if [[ ${#destination_args[@]} -gt 0 ]]; then
  xcodebuild_args+=("${destination_args[@]}")
fi

build_settings="$(xcodebuild "${xcodebuild_args[@]}" -showBuildSettings)"
target_build_dir="$(awk -F ' = ' '/ TARGET_BUILD_DIR = / { print $2; exit }' <<<"$build_settings")"
wrapper_name="$(awk -F ' = ' '/ WRAPPER_NAME = / { print $2; exit }' <<<"$build_settings")"

if [[ -z "$target_build_dir" || -z "$wrapper_name" ]]; then
  echo "Could not resolve Detox app bundle path from Xcode build settings." >&2
  exit 69
fi

xcodebuild "${xcodebuild_args[@]}"

app_bundle="$target_build_dir/$wrapper_name"
js_bundle="$app_bundle/main.jsbundle"

if [[ ! -f "$js_bundle" ]]; then
  echo "Expected Detox build to include $js_bundle, but it was not found." >&2
  echo "React Native Debug simulator builds skip bundling unless FORCE_BUNDLING=1 is honored." >&2
  exit 70
fi
