#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY_ROOT="$(cd "$APP_DIR/../.." && pwd)"
DUO_DEVICE_NAME="${CHESSTICIZE_MARKETING_IPHONE_DUO_DEVICE:-Chessticize 706 Duo Inner}"
DUO_DEVICE_UDID="${CHESSTICIZE_MARKETING_IPHONE_DUO_DEVICE_UDID:-D9E6E7BA-7BE6-4D76-9CE2-945225AEF9CB}"
APP_SOURCE_SHA="${CHESSTICIZE_DUO_APP_SOURCE_SHA:-b2ba55b8d8e1b443c82490b9e1508d733ecc9207}"
APP_ARTIFACT="${CHESSTICIZE_DUO_APP_ARTIFACT:?Set CHESSTICIZE_DUO_APP_ARTIFACT to the retained Release simulator Chessticize.app.}"
APP_MANIFEST="${CHESSTICIZE_DUO_APP_MANIFEST:?Set CHESSTICIZE_DUO_APP_MANIFEST to its artifact manifest.}"
OUTPUT_ROOT="${CHESSTICIZE_MARKETING_OUTPUT_ROOT:-$REPOSITORY_ROOT/scratch/store-assets/marketing/mobile-1.6-en-us/$APP_SOURCE_SHA/duo-evidence-$(date -u +%Y%m%dT%H%M%SZ)}"
APP_LINK="$APP_DIR/ios/build-release/Build/Products/Release-iphonesimulator/Chessticize.app"
PROVENANCE_PATH="$OUTPUT_ROOT/reused-app-input-comparison.json"
PRECONFIGURED_POSTURE="${CHESSTICIZE_DUO_PRECONFIGURED_POSTURE:-0}"
EVIDENCE_FRAME_IDS="${CHESSTICIZE_DUO_CAPTURE_FRAME_IDS:-dark-arrow-duel}"
INNER_SCREEN_DISPLAY="${CHESSTICIZE_DUO_INNER_SCREEN_DISPLAY:-primary-1}"

fail() {
  echo "iPhone Duo marketing evidence failed: $*" >&2
  exit 1
}

cleanup() {
  xcrun simctl status_bar "$DUO_DEVICE_UDID" clear >/dev/null 2>&1 || true
  xcrun simctl shutdown "$DUO_DEVICE_UDID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

[[ "$APP_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "CHESSTICIZE_DUO_APP_SOURCE_SHA must be a full SHA."
[[ -d "$APP_ARTIFACT" ]] || fail "Retained app bundle does not exist: $APP_ARTIFACT"
[[ -f "$APP_MANIFEST" ]] || fail "Retained app manifest does not exist: $APP_MANIFEST"
[[ -z "$(git -C "$REPOSITORY_ROOT" status --porcelain=v1 --untracked-files=no)" ]] || fail "The capture runner worktree must be tracked-clean."
[[ "$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)" != "$APP_SOURCE_SHA" ]] || fail "Duo capture runner must be a host-only commit distinct from the retained app source."

[[ "$PRECONFIGURED_POSTURE" == "0" || "$PRECONFIGURED_POSTURE" == "1" ]] || fail "CHESSTICIZE_DUO_PRECONFIGURED_POSTURE must be 0 or 1."
xcrun simctl list devices available | grep -Fq "$DUO_DEVICE_UDID" || fail "Assigned Duo Simulator is unavailable."

ios_booted_devices="$(xcrun simctl list devices booted)"
ios_booted_count="$(printf '%s\n' "$ios_booted_devices" | grep -c '(Booted)' || true)"
duo_is_booted=0
if printf '%s\n' "$ios_booted_devices" | grep -Fq "$DUO_DEVICE_UDID"; then
  duo_is_booted=1
fi
if ! command -v adb >/dev/null 2>&1; then
  fail "adb is required to enforce the machine-wide simulator/emulator limit."
fi
android_emulator_count="$(adb devices | awk 'NR > 1 && $1 ~ /^emulator-[0-9]+$/ { count += 1 } END { print count + 0 }')"
machine_wide_count=$((ios_booted_count + android_emulator_count))
if [[ "$machine_wide_count" -gt 2 ]]; then
  fail "More than two simulators/emulators are already booted; wait for a slot."
fi
if [[ "$duo_is_booted" == "0" && "$machine_wide_count" -ge 2 ]]; then
  fail "Two simulators/emulators are already booted; wait for a slot before booting the Duo device."
fi
if [[ "$PRECONFIGURED_POSTURE" == "1" && "$duo_is_booted" == "0" ]]; then
  fail "Duo inner landscape posture must be configured in Device Hub on a booted simulator."
fi

mkdir -p "$OUTPUT_ROOT"
node "$APP_DIR/scripts/mobile-app-inputs.js" verify-artifact \
  --app-source-sha "$APP_SOURCE_SHA" \
  --test-runner-sha "$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)" \
  --artifact "$APP_ARTIFACT" \
  --manifest "$APP_MANIFEST" \
  --output "$PROVENANCE_PATH"

if [[ -e "$APP_LINK" && ! -L "$APP_LINK" ]]; then
  fail "Refusing to replace a local Release app bundle at $APP_LINK."
fi
mkdir -p "$(dirname "$APP_LINK")"
ln -sfn "$APP_ARTIFACT" "$APP_LINK"

if [[ "$PRECONFIGURED_POSTURE" == "1" ]]; then
  : # The machine-wide guard already proved the assigned Duo is booted.
else
  xcrun simctl boot "$DUO_DEVICE_UDID" 2>/dev/null || true
  xcrun simctl bootstatus "$DUO_DEVICE_UDID" -b
fi
xcrun simctl status_bar "$DUO_DEVICE_UDID" override \
  --time 9:41 --batteryState charged --batteryLevel 100
xcrun simctl ui "$DUO_DEVICE_UDID" content_size large
[[ "$(xcrun simctl ui "$DUO_DEVICE_UDID" content_size)" == "large" ]] || \
  fail "Duo Simulator native text size must be Large for store evidence."
xcrun simctl io "$DUO_DEVICE_UDID" enumerate > "$OUTPUT_ROOT/duo-display-enumerate.txt"
grep -Fq "Device Name: $INNER_SCREEN_DISPLAY" "$OUTPUT_ROOT/duo-display-enumerate.txt" || \
  fail "Duo inner screenshot display $INNER_SCREEN_DISPLAY is unavailable; inspect duo-display-enumerate.txt."

(
  cd "$APP_DIR"
  CHESSTICIZE_CAPTURE_MARKETING_ASSETS=1 \
  CHESSTICIZE_MARKETING_CAMPAIGN=mobile-1.6-en-us \
  CHESSTICIZE_MARKETING_DEVICE_FAMILY=iphoneDuo \
  CHESSTICIZE_MARKETING_IOS_SCREENSHOT_DISPLAY="$INNER_SCREEN_DISPLAY" \
  CHESSTICIZE_MARKETING_CAPTURE_PROVENANCE_FILE="$PROVENANCE_PATH" \
  CHESSTICIZE_MARKETING_EVIDENCE_FRAME_IDS="$EVIDENCE_FRAME_IDS" \
  CHESSTICIZE_MARKETING_OUTPUT_ROOT="$OUTPUT_ROOT" \
  CHESSTICIZE_SOURCE_COMMIT="$APP_SOURCE_SHA" \
  DETOX_IOS_DEVICE="$DUO_DEVICE_NAME" \
  DETOX_IOS_DEVICE_UDID="$DUO_DEVICE_UDID" \
    pnpm exec detox test \
      --configuration ios.sim.release \
      --artifacts-location "$OUTPUT_ROOT/detox-iphoneDuo" \
      e2e/marketing-assets.e2e.js
)

node - "$PROVENANCE_PATH" "$OUTPUT_ROOT/manifest-iphoneDuo.json" \
  "$OUTPUT_ROOT/duo-capture-receipt.json" "$DUO_DEVICE_NAME" "$DUO_DEVICE_UDID" \
  "$EVIDENCE_FRAME_IDS" "$INNER_SCREEN_DISPLAY" <<'NODE'
const fs = require('node:fs');
const [provenancePath, manifestPath, receiptPath, deviceName, deviceUdid, frameIds, screenDisplay] = process.argv.slice(2);
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.target?.display !== 'inner' || manifest.target?.orientation !== 'landscape') {
  throw new Error('Duo manifest did not preserve inner-landscape posture.');
}
if (manifest.frames.length !== frameIds.split(',').length) {
  throw new Error('Duo manifest did not preserve the requested evidence frame selection.');
}
fs.writeFileSync(receiptPath, `${JSON.stringify({
  schemaVersion: 1,
  captureRole: 'evidence-only',
  device: {
    name: deviceName,
    udid: deviceUdid,
    display: 'inner',
    screenshotDisplay: screenDisplay,
    orientation: 'landscape',
  },
  nativeTextSize: 'large',
  appArtifact: {
    sourceCommit: provenance.appSourceSha,
    testRunnerCommit: provenance.testRunnerSha,
    inputDigest: provenance.appInputDigest,
    name: provenance.artifactName,
    sha256: provenance.artifactSha256,
  },
  frames: manifest.frames.map((frame) => ({
    frameId: frame.frameId,
    pixelDimensions: frame.pixelDimensions,
    file: frame.file,
    sha256: frame.sha256,
  })),
}, null, 2)}\n`);
NODE

echo "Raw iPhone Duo evidence is ready at $OUTPUT_ROOT"
