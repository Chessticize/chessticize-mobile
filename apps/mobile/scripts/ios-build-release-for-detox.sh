#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
cd "$APP_DIR"

if [[ "${CHESSTICIZE_IOS_PREPARE:-0}" == "1" ]]; then
  scripts/ios-doctor.sh
  if ! bundle check; then
    bundle install
  fi
  scripts/ios-install-pods-locked.sh
fi

(cd "$REPO_ROOT" && node scripts/fetch-core-pack.mjs)

export FORCE_BUNDLING=1

landscape_validation="${CHESSTICIZE_IOS_LANDSCAPE_VALIDATION:-0}"
validation_info_plist=""
case "$landscape_validation" in
  ""|0)
    ;;
  1)
    validation_info_directory="$APP_DIR/ios/build-release/validation-info"
    validation_info_plist="$validation_info_directory/Info-landscape.plist"
    mkdir -p "$validation_info_directory"
    cp "$APP_DIR/ios/ChessticizeMobile/Info.plist" "$validation_info_plist"
    /usr/bin/plutil -replace 'UISupportedInterfaceOrientations~ipad' \
      -json '["UIInterfaceOrientationLandscapeRight"]' \
      "$validation_info_plist"
    /usr/bin/plutil -replace UIRequiresFullScreen -bool YES "$validation_info_plist"
    /usr/bin/plutil -lint "$validation_info_plist" >/dev/null
    ;;
  *)
    echo "CHESSTICIZE_IOS_LANDSCAPE_VALIDATION must be 0 or 1." >&2
    exit 64
    ;;
esac

destination_args=()
if [[ -n "${DETOX_IOS_DEVICE_UDID:-}" ]]; then
  [[ -n "${DETOX_IOS_DEVICE:-}" ]] || {
    echo "DETOX_IOS_DEVICE_UDID requires DETOX_IOS_DEVICE." >&2
    exit 72
  }
  node scripts/resolve-ios-simulator-target.js \
    --device-name "$DETOX_IOS_DEVICE" \
    --device-udid "$DETOX_IOS_DEVICE_UDID" \
    >/dev/null
  destination_args=(-destination "platform=iOS Simulator,id=${DETOX_IOS_DEVICE_UDID}")
elif [[ -n "${DETOX_IOS_DEVICE:-}" ]]; then
  destination_args=(-destination "platform=iOS Simulator,name=${DETOX_IOS_DEVICE}")
fi

xcodebuild_args=(
  -workspace ios/ChessticizeMobile.xcworkspace
  -scheme ChessticizeMobile
  -configuration Release
  -sdk iphonesimulator
  -derivedDataPath ios/build-release
)

if [[ -n "$validation_info_plist" ]]; then
  xcodebuild_args+=(
    ONLY_ACTIVE_ARCH=YES
    INFOPLIST_FILE="$validation_info_plist"
  )
fi

if [[ ${#destination_args[@]} -gt 0 ]]; then
  xcodebuild_args+=("${destination_args[@]}")
fi

build_settings="$(xcodebuild "${xcodebuild_args[@]}" -showBuildSettings)"
target_build_dir="$(awk -F ' = ' '/ TARGET_BUILD_DIR = / { print $2; exit }' <<<"$build_settings")"
wrapper_name="$(awk -F ' = ' '/ WRAPPER_NAME = / { print $2; exit }' <<<"$build_settings")"

if [[ -z "$target_build_dir" || -z "$wrapper_name" ]]; then
  echo "Could not resolve Release Detox app bundle path from Xcode build settings." >&2
  exit 69
fi

xcodebuild "${xcodebuild_args[@]}"

app_bundle="$target_build_dir/$wrapper_name"
js_bundle="$app_bundle/main.jsbundle"

if [[ ! -f "$js_bundle" ]]; then
  echo "Expected Release Detox build to include $js_bundle, but it was not found." >&2
  exit 70
fi

if [[ -n "$validation_info_plist" ]]; then
  built_info_plist="$app_bundle/Info.plist"
  built_ipad_orientations="$(
    /usr/bin/plutil -extract 'UISupportedInterfaceOrientations~ipad' \
      json -o - "$built_info_plist" | tr -d '[:space:]'
  )"
  built_requires_full_screen="$(
    /usr/bin/plutil -extract UIRequiresFullScreen raw -o - "$built_info_plist"
  )"
  if [[ "$built_ipad_orientations" != '["UIInterfaceOrientationLandscapeRight"]' ]]; then
    echo "Landscape validation build has unexpected iPad orientations: $built_ipad_orientations" >&2
    exit 71
  fi
  if [[ "$built_requires_full_screen" != "true" ]]; then
    echo "Landscape validation build must require full screen." >&2
    exit 71
  fi
fi
