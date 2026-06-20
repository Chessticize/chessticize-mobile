#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  selected_developer_dir="$(xcode-select -p 2>/dev/null || true)"
  if [[ "$selected_developer_dir" == *"/CommandLineTools" && -d "/Applications/Xcode.app/Contents/Developer" ]]; then
    export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
  elif [[ -n "$selected_developer_dir" ]]; then
    export DEVELOPER_DIR="$selected_developer_dir"
  else
    export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
  fi
fi

if [[ ! -d "$DEVELOPER_DIR" ]]; then
  cat >&2 <<EOF
Xcode was not found at:
  $DEVELOPER_DIR

Install Xcode or set DEVELOPER_DIR to the active Xcode developer directory.
EOF
  exit 66
fi

echo "Xcode:"
xcodebuild -version

if ! simctl_output="$(xcrun simctl list devices available 2>&1 >/dev/null)"; then
  cat >&2 <<EOF
Unable to access iOS simulators.

$simctl_output

If this is a fresh Xcode install, accept the license from a Terminal session:
  sudo DEVELOPER_DIR=$DEVELOPER_DIR xcodebuild -license accept
EOF
  exit 69
fi

if ! command -v bundle >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Bundler was not found. Install Bundler before installing CocoaPods:
  gem install bundler
EOF
  exit 69
fi

if ! command -v applesimutils >/dev/null 2>&1; then
  cat >&2 <<'EOF'
applesimutils was not found. Detox requires it for iOS simulator control:
  brew tap wix/brew && brew install applesimutils
EOF
  exit 69
fi

echo "Bundler:"
bundle --version

echo "applesimutils:"
applesimutils --version

if [[ -f Gemfile.lock ]]; then
  echo "Ruby dependencies:"
  bundle check
else
  echo "Ruby dependencies:"
  echo "  Gemfile.lock is not present yet; ios-build-for-detox.sh will run bundle install."
fi

echo "iOS doctor passed."
