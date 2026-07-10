#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

scripts/ios-doctor.sh

(cd "$APP_DIR/../.." && node scripts/fetch-core-pack.mjs)

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
