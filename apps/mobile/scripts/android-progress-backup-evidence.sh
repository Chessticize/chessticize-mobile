#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
APP_ID="com.chessticize.mobile"
LOCAL_TRANSPORT="com.android.localtransport/.LocalTransport"
D2D_TRANSPORT="com.google.android.gms/.backup.migrate.service.D2dTransport"
GMS_TRANSPORT="com.google.android.gms/.backup.BackupTransportService"
MODE="${1:-}"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB_PATH:-${SDK_ROOT:+$SDK_ROOT/platform-tools/adb}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"
ARTIFACT_DIR="${ANDROID_BACKUP_ARTIFACT_DIR:-$APP_DIR/artifacts/android-progress-backup}"

if [[ ! "$MODE" =~ ^(cloud-encrypted|device-transfer|seed-released-fixture)$ ]]; then
  echo "Usage: $0 cloud-encrypted|device-transfer|seed-released-fixture" >&2
  exit 64
fi
if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "Set ADB_PATH, ANDROID_HOME, or ANDROID_SDK_ROOT to an executable adb." >&2
  exit 69
fi

mkdir -p "$ARTIFACT_DIR"
exec > >(tee "$ARTIFACT_DIR/$MODE.log") 2>&1

adb_cmd() {
  "$ADB" -s "$DEVICE" "$@"
}

if [[ "$MODE" == "seed-released-fixture" ]]; then
  fixture="$REPO_ROOT/packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite"
  device_fixture="/data/local/tmp/chessticize-mobile-released.sqlite"
  adb_cmd shell am force-stop "$APP_ID"
  adb_cmd shell pm clear "$APP_ID"
  adb_cmd push "$fixture" "$device_fixture"
  trap 'adb_cmd shell rm -f /data/local/tmp/chessticize-mobile-released.sqlite >/dev/null 2>&1 || true' EXIT
  adb_cmd shell run-as "$APP_ID" mkdir -p databases
  adb_cmd shell run-as "$APP_ID" cp "$device_fixture" databases/chessticize-mobile.sqlite
  adb_cmd shell rm -f "$device_fixture"
  trap - EXIT
  echo "Installed released progress fixture through the app database directory."
  exit 0
fi

original_transport="$(adb_cmd shell bmgr list transports | awk '$1 == "*" { print $2; exit }')"
apk_dir="$(mktemp -d "${TMPDIR:-/tmp}/chessticize-backup-apks.XXXXXX")"

cleanup() {
  adb_cmd shell settings put secure backup_enable_d2d_test_mode 0 >/dev/null 2>&1 || true
  adb_cmd shell settings delete secure backup_local_transport_parameters >/dev/null 2>&1 || true
  if [[ -n "$original_transport" ]]; then
    adb_cmd shell bmgr transport "$original_transport" >/dev/null 2>&1 || true
  fi
  rm -rf "$apk_dir"
}
trap cleanup EXIT

adb_cmd shell bmgr enable true
if [[ "$MODE" == "cloud-encrypted" ]]; then
  # Set AOSP LocalTransport's test-only encryption capability before selecting
  # the transport so its service observes the capability during activation.
  adb_cmd shell settings put secure backup_local_transport_parameters 'fake_encryption_flag=true'
  adb_cmd shell bmgr transport "$LOCAL_TRANSPORT" | grep -F "Selected transport"
else
  sdk_level="$(adb_cmd shell getprop ro.build.version.sdk | tr -d '\r')"
  if (( sdk_level < 31 )); then
    echo "D2D evidence requires Android 12 / API 31 or newer; found API $sdk_level." >&2
    exit 69
  fi
  adb_cmd shell settings put secure backup_enable_d2d_test_mode 1
  adb_cmd shell bmgr transport "$D2D_TRANSPORT" | grep -F "Selected transport"
  adb_cmd shell bmgr init "$D2D_TRANSPORT"
  adb_cmd shell bmgr list transports | grep -q -F "  * $D2D_TRANSPORT"
fi

adb_cmd shell am force-stop "$APP_ID"
adb_cmd shell bmgr backupnow "$APP_ID" | tee "$ARTIFACT_DIR/$MODE-backupnow.txt" | grep -F "Package $APP_ID with result: Success"

apk_index=0
while IFS= read -r apk_line; do
  [[ "$apk_line" == package:* ]] || continue
  apk_index=$((apk_index + 1))
  adb_cmd pull "${apk_line#package:}" "$apk_dir/app-$apk_index.apk"
done < <(adb_cmd shell pm path "$APP_ID")
if (( apk_index == 0 )); then
  echo "No installed APKs found for $APP_ID." >&2
  exit 1
fi

adb_cmd shell pm uninstall --user 0 "$APP_ID"
if [[ "$MODE" == "device-transfer" ]]; then
  adb_cmd shell bmgr transport "$GMS_TRANSPORT" | grep -F "Selected transport"
fi
adb_cmd install-multiple -t --user 0 "$apk_dir"/*.apk
if [[ "$MODE" == "device-transfer" ]]; then
  # Match Android's documented single-device D2D cleanup after restore so a
  # later run cannot reuse this migration dataset.
  adb_cmd shell bmgr init "$D2D_TRANSPORT"
fi
adb_cmd shell pm path "$APP_ID" | tee "$ARTIFACT_DIR/$MODE-restored-package.txt"
echo "Completed $MODE backup, clean uninstall, reinstall, and system restore."
