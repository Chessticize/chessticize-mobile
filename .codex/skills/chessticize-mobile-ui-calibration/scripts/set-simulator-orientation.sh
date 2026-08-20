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
command -v osascript >/dev/null 2>&1 || fail "osascript is required."

# Xcode 26.6 keeps simctl screenshot dimensions fixed to the physical display even
# while the Simulator rotates. The exact Simulator window dimensions still track
# the effective device orientation and avoid accepting a stale framebuffer shape.
simulator_window_orientation() {
  local dimensions
  local width
  local height
  dimensions="$(
    /usr/bin/osascript \
      -e 'on run argv' \
      -e 'set deviceName to item 1 of argv' \
      -e 'tell application "System Events"' \
      -e 'tell process "Simulator"' \
      -e 'set matchingWindows to every window whose name starts with deviceName' \
      -e 'if (count of matchingWindows) is not 1 then error "Expected exactly one open Simulator window starting with " & deviceName' \
      -e 'set deviceSize to size of item 1 of matchingWindows' \
      -e 'return (item 1 of deviceSize as text) & " " & (item 2 of deviceSize as text)' \
      -e 'end tell' \
      -e 'end tell' \
      -e 'end run' \
      "$DEVICE_NAME"
  )" || fail "Could not read the exact Simulator window dimensions for $DEVICE_NAME ($SIMULATOR_UDID)."
  read -r width height <<< "$dimensions"
  [[ "$width" =~ ^[0-9]+$ && "$height" =~ ^[0-9]+$ ]] || \
    fail "Could not parse the Simulator window dimensions: $dimensions"
  if (( width > height )); then
    echo "landscape"
  else
    echo "portrait"
  fi
}

CURRENT_ORIENTATION="$(simulator_window_orientation)"
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
  CURRENT_ORIENTATION="$(simulator_window_orientation)"
  if [[ "$CURRENT_ORIENTATION" == "$TARGET_ORIENTATION" ]]; then
    echo "Rotated Simulator $DEVICE_NAME to $TARGET_ORIENTATION."
    exit 0
  fi
  sleep 0.25
done

fail "Simulator window remained $CURRENT_ORIENTATION after requesting $TARGET_ORIENTATION."
