#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

scripts/ios-doctor.sh

if ! bundle check; then
  bundle install
fi

bundle exec pod install --project-directory=ios

export FORCE_BUNDLING=1

xcodebuild \
  -workspace ios/ChessticizeMobile.xcworkspace \
  -scheme ChessticizeMobile \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath ios/build

app_bundle="ios/build/Build/Products/Debug-iphonesimulator/ChessticizeMobile.app"
js_bundle="$app_bundle/main.jsbundle"

if [[ ! -f "$js_bundle" ]]; then
  echo "Expected Detox build to include $js_bundle, but it was not found." >&2
  echo "React Native Debug simulator builds skip bundling unless FORCE_BUNDLING=1 is honored." >&2
  exit 70
fi
