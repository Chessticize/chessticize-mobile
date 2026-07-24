#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

PODFILE_LOCK="ios/Podfile.lock"
MANIFEST_LOCK="ios/Pods/Manifest.lock"

if [[ -d ios/Pods ]]; then
  if [[ ! -f "$MANIFEST_LOCK" ]] || ! cmp -s "$PODFILE_LOCK" "$MANIFEST_LOCK"; then
    echo "Discarding stale CocoaPods sandbox because Pods/Manifest.lock does not match Podfile.lock."
    rm -rf ios/Pods
  fi
fi

bundle exec pod install --deployment --project-directory=ios
