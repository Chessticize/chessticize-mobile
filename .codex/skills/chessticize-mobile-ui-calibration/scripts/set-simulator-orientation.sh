#!/usr/bin/env bash
set -euo pipefail

SIMULATOR_UDID="${1:-}"
DEVICE_NAME="${2:-}"
TARGET_ORIENTATION="${3:-}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "Simulator orientation control requires macOS."
[[ -n "$SIMULATOR_UDID" ]] || fail "Pass the exact Simulator UDID as argument 1."
[[ -n "$DEVICE_NAME" ]] || fail "Pass the exact Simulator device name as argument 2."
[[ "$TARGET_ORIENTATION" == "portrait" || "$TARGET_ORIENTATION" == "landscape" ]] || \
  fail "Orientation must be portrait or landscape."
command -v xcrun >/dev/null 2>&1 || fail "xcrun is required."
command -v sips >/dev/null 2>&1 || fail "sips is required."

SCREENSHOT_PATH="$(mktemp -t chessticize-simulator-orientation).png"
trap 'rm -f "$SCREENSHOT_PATH"' EXIT

framebuffer_orientation() {
  xcrun simctl io "$SIMULATOR_UDID" screenshot "$SCREENSHOT_PATH" >/dev/null 2>&1 || \
    fail "Could not capture the Simulator framebuffer for $SIMULATOR_UDID."
  local width
  local height
  width="$(sips -g pixelWidth "$SCREENSHOT_PATH" | awk '/pixelWidth:/ { print $2 }')"
  height="$(sips -g pixelHeight "$SCREENSHOT_PATH" | awk '/pixelHeight:/ { print $2 }')"
  [[ "$width" =~ ^[0-9]+$ && "$height" =~ ^[0-9]+$ ]] || \
    fail "Could not read the Simulator framebuffer dimensions."
  if (( width > height )); then
    echo "landscape"
  else
    echo "portrait"
  fi
}

CURRENT_ORIENTATION="$(framebuffer_orientation)"
if [[ "$CURRENT_ORIENTATION" == "$TARGET_ORIENTATION" ]]; then
  echo "Simulator $DEVICE_NAME is already $TARGET_ORIENTATION."
  exit 0
fi

if ! /usr/bin/osascript \
  -e 'on run argv' \
  -e 'set deviceName to item 1 of argv' \
  -e 'tell application "Simulator" to activate' \
  -e 'tell application "System Events"' \
  -e 'tell process "Simulator"' \
  -e 'set frontmost to true' \
  -e 'set matchingWindows to every window whose name starts with deviceName' \
  -e 'if (count of matchingWindows) is not 1 then error "Expected exactly one open Simulator window starting with " & deviceName' \
  -e 'set deviceWindow to item 1 of matchingWindows' \
  -e 'set rotateButtons to every button of toolbar 1 of deviceWindow whose description is "Rotate"' \
  -e 'if (count of rotateButtons) is not 1 then error "Expected exactly one Rotate toolbar button in " & deviceName' \
  -e 'click item 1 of rotateButtons' \
  -e 'end tell' \
  -e 'end tell' \
  -e 'end run' \
  "$DEVICE_NAME"; then
  fail "Could not rotate the exact Simulator window. Unlock the Mac, open $DEVICE_NAME in Simulator, and allow Accessibility control."
fi

for _ in {1..40}; do
  CURRENT_ORIENTATION="$(framebuffer_orientation)"
  if [[ "$CURRENT_ORIENTATION" == "$TARGET_ORIENTATION" ]]; then
    echo "Rotated Simulator $DEVICE_NAME to $TARGET_ORIENTATION."
    exit 0
  fi
  sleep 0.25
done

fail "Simulator framebuffer remained $CURRENT_ORIENTATION after requesting $TARGET_ORIENTATION."
