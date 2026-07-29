#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY_ROOT="$(cd "$APP_DIR/../.." && pwd)"

IPHONE_DEVICE_NAME="${CHESSTICIZE_MARKETING_IPHONE_DEVICE:-Chessticize Marketing iPhone 17 Pro Max}"
IPHONE_DEVICE_UDID="${CHESSTICIZE_MARKETING_IPHONE_DEVICE_UDID:-}"
IPAD_DEVICE_NAME="${CHESSTICIZE_MARKETING_IPAD_DEVICE:-Chessticize Marketing iPad Pro 13-inch (M5)}"
IPAD_DEVICE_UDID="${CHESSTICIZE_MARKETING_IPAD_DEVICE_UDID:-}"

assert_clean_source_state() {
  local expected_commit="$1"
  local actual_commit
  actual_commit="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
  if [[ "$actual_commit" != "$expected_commit" ]]; then
    echo "Marketing capture source commit changed during the run." >&2
    exit 65
  fi
  if [[ -n "$(git -C "$REPOSITORY_ROOT" status --porcelain=v1 --untracked-files=no)" ]]; then
    echo "Marketing capture requires a clean tracked worktree." >&2
    exit 65
  fi
}

resolve_simulator_udid() {
  local device_name="$1"
  local configured_udid="$2"
  local target_json
  if [[ -n "$configured_udid" ]]; then
    target_json="$(
      node "$APP_DIR/scripts/resolve-ios-simulator-target.js" \
        --device-name "$device_name" \
        --device-udid "$configured_udid"
    )"
  else
    target_json="$(
      node "$APP_DIR/scripts/resolve-ios-simulator-target.js" \
        --device-name "$device_name"
    )"
  fi
  node -e \
    'process.stdout.write(JSON.parse(process.argv[1]).udid)' \
    "$target_json"
}

capture_device_family() {
  local device_family="$1"
  local device_name="$2"
  local device_udid="$3"
  local artifact_directory="$OUTPUT_ROOT/detox-$device_family"
  (
    cd "$APP_DIR"
    CHESSTICIZE_CAPTURE_MARKETING_ASSETS=1 \
    CHESSTICIZE_MARKETING_DEVICE_FAMILY="$device_family" \
    CHESSTICIZE_MARKETING_OUTPUT_ROOT="$OUTPUT_ROOT" \
    CHESSTICIZE_SOURCE_COMMIT="$SOURCE_COMMIT" \
    DETOX_IOS_DEVICE="$device_name" \
    DETOX_IOS_DEVICE_UDID="$device_udid" \
      pnpm exec detox test \
        --configuration ios.sim.release \
        --artifacts-location "$artifact_directory" \
        e2e/marketing-assets.e2e.js
  )
}

SOURCE_COMMIT="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
assert_clean_source_state "$SOURCE_COMMIT"

configured_output_root="${CHESSTICIZE_MARKETING_OUTPUT_ROOT:-scratch/store-assets/marketing/$SOURCE_COMMIT}"
if [[ "$configured_output_root" = /* ]]; then
  OUTPUT_ROOT="$configured_output_root"
else
  OUTPUT_ROOT="$REPOSITORY_ROOT/$configured_output_root"
fi
mkdir -p "$OUTPUT_ROOT"
rm -f \
  "$OUTPUT_ROOT/manifest.json" \
  "$OUTPUT_ROOT/manifest-iphone.json" \
  "$OUTPUT_ROOT/manifest-ipad.json"

IPHONE_UDID="$(resolve_simulator_udid "$IPHONE_DEVICE_NAME" "$IPHONE_DEVICE_UDID")"
IPAD_UDID="$(resolve_simulator_udid "$IPAD_DEVICE_NAME" "$IPAD_DEVICE_UDID")"

(
  cd "$REPOSITORY_ROOT"
  CHESSTICIZE_IOS_PREPARE="${CHESSTICIZE_IOS_PREPARE:-1}" \
  DETOX_IOS_DEVICE="$IPHONE_DEVICE_NAME" \
  DETOX_IOS_DEVICE_UDID="$IPHONE_UDID" \
    pnpm mobile:e2e:build:ios:release
)

capture_device_family iphone "$IPHONE_DEVICE_NAME" "$IPHONE_UDID"
capture_device_family ipad "$IPAD_DEVICE_NAME" "$IPAD_UDID"
assert_clean_source_state "$SOURCE_COMMIT"

CHESSTICIZE_MARKETING_OUTPUT_ROOT="$OUTPUT_ROOT" \
  node "$APP_DIR/scripts/finalize-marketing-capture.js"

echo "Raw App Store marketing captures are ready at $OUTPUT_ROOT"
