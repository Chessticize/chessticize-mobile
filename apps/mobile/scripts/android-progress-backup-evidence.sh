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

if [[ ! "$MODE" =~ ^(cloud-encrypted|device-transfer-released-fixture|seed-released-fixture)$ ]]; then
  echo "Usage: $0 cloud-encrypted|device-transfer-released-fixture|seed-released-fixture" >&2
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

capture_transport_state() {
  adb_cmd shell bmgr list transports \
    | tee "$ARTIFACT_DIR/$MODE-selected-transport.txt"
  {
    echo "backup_local_transport_parameters:"
    adb_cmd shell settings get secure backup_local_transport_parameters
    echo "backup_enable_d2d_test_mode:"
    adb_cmd shell settings get secure backup_enable_d2d_test_mode
  } | tee "$ARTIFACT_DIR/$MODE-transport-parameters.txt"
}

capture_backup_diagnostics() {
  adb_cmd logcat -d -v threadtime \
    BackupManagerService:V LocalTransport:V PFTBT:V FullBackupEngine:V KeyValueBackupTask:V '*:S' \
    | tee "$ARTIFACT_DIR/$MODE-backup-logcat.txt" || true
  adb_cmd shell dumpsys backup \
    | tee "$ARTIFACT_DIR/$MODE-dumpsys-backup.txt" || true
}

record_released_fixture_state() {
  local fixture="$1"
  local database_path="databases/chessticize-mobile.sqlite"
  local pulled_database="$ARTIFACT_DIR/released-fixture-pre-backup.sqlite"
  local source_hash
  local device_hash
  local pulled_hash

  command -v sqlite3 >/dev/null
  adb_cmd shell run-as "$APP_ID" stat -c '%n %s' "$database_path" \
    | tr -d '\r' > "$ARTIFACT_DIR/released-fixture-pre-backup-stat.txt"
  adb_cmd shell run-as "$APP_ID" sha256sum "$database_path" \
    | tr -d '\r' > "$ARTIFACT_DIR/released-fixture-pre-backup-sha256.txt"
  adb_cmd exec-out run-as "$APP_ID" cat "$database_path" > "$pulled_database"
  sha256sum "$fixture" > "$ARTIFACT_DIR/released-fixture-source-sha256.txt"
  sha256sum "$pulled_database" > "$ARTIFACT_DIR/released-fixture-pulled-sha256.txt"
  source_hash="$(cut -d ' ' -f 1 "$ARTIFACT_DIR/released-fixture-source-sha256.txt")"
  device_hash="$(cut -d ' ' -f 1 "$ARTIFACT_DIR/released-fixture-pre-backup-sha256.txt")"
  pulled_hash="$(cut -d ' ' -f 1 "$ARTIFACT_DIR/released-fixture-pulled-sha256.txt")"
  if [[ "$source_hash" != "$device_hash" || "$source_hash" != "$pulled_hash" ]]; then
    echo "Seeded released fixture does not match the immutable source fixture." >&2
    exit 1
  fi
  sqlite3 "$pulled_database" 'PRAGMA user_version;' \
    > "$ARTIFACT_DIR/released-fixture-pre-backup-user-version.txt"
  sqlite3 "$pulled_database" '.schema' \
    > "$ARTIFACT_DIR/released-fixture-pre-backup-schema.sql"
  grep -Fx '0' "$ARTIFACT_DIR/released-fixture-pre-backup-user-version.txt"
  grep -F 'CREATE TABLE attempts' "$ARTIFACT_DIR/released-fixture-pre-backup-schema.sql"
  adb_cmd shell dumpsys package "$APP_ID" \
    > "$ARTIFACT_DIR/released-fixture-pre-backup-package-state.txt"
  : > "$ARTIFACT_DIR/released-fixture-pre-backup-process.txt"
  if adb_cmd shell pidof "$APP_ID" \
      | tr -d '\r' | tee "$ARTIFACT_DIR/released-fixture-pre-backup-process.txt" \
      | grep -q .; then
    echo "Released fixture app process started before backup." >&2
    exit 1
  fi
}

assert_released_fixture_unlaunched() {
  local before_hash
  local at_backup_hash

  : > "$ARTIFACT_DIR/released-fixture-at-backup-process.txt"
  if adb_cmd shell pidof "$APP_ID" \
      | tr -d '\r' | tee "$ARTIFACT_DIR/released-fixture-at-backup-process.txt" \
      | grep -q .; then
    echo "Released fixture app process started before BackupManager invocation." >&2
    exit 1
  fi
  adb_cmd shell run-as "$APP_ID" stat -c '%n %s' databases/chessticize-mobile.sqlite \
    | tr -d '\r' > "$ARTIFACT_DIR/released-fixture-at-backup-stat.txt"
  adb_cmd shell run-as "$APP_ID" sha256sum databases/chessticize-mobile.sqlite \
    | tr -d '\r' > "$ARTIFACT_DIR/released-fixture-at-backup-sha256.txt"
  before_hash="$(cut -d ' ' -f 1 "$ARTIFACT_DIR/released-fixture-pre-backup-sha256.txt")"
  at_backup_hash="$(cut -d ' ' -f 1 "$ARTIFACT_DIR/released-fixture-at-backup-sha256.txt")"
  if [[ "$before_hash" != "$at_backup_hash" ]]; then
    echo "Released fixture changed before BackupManager invocation." >&2
    exit 1
  fi
}

if [[ "$MODE" == "seed-released-fixture" ]]; then
  fixture="$REPO_ROOT/packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite"
  device_fixture="/data/local/tmp/chessticize-mobile-released.sqlite"
  adb_cmd shell pm clear "$APP_ID"
  adb_cmd push "$fixture" "$device_fixture"
  trap 'adb_cmd shell rm -f /data/local/tmp/chessticize-mobile-released.sqlite >/dev/null 2>&1 || true' EXIT
  adb_cmd shell run-as "$APP_ID" mkdir -p databases
  adb_cmd shell run-as "$APP_ID" cp "$device_fixture" databases/chessticize-mobile.sqlite
  adb_cmd shell rm -f "$device_fixture"
  trap - EXIT
  record_released_fixture_state "$fixture"
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
  # API 31+ cloud rules require the real client-side-encryption capability bit.
  # LocalTransport's is_encrypted parameter advertises that bit for this test transport.
  adb_cmd shell settings put secure backup_local_transport_parameters 'is_encrypted=true,log_agent_results=true'
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
capture_transport_state

if [[ "$MODE" == "cloud-encrypted" ]]; then
  # Detox cleanup can leave the package force-stopped and therefore ineligible.
  # A public launch clears that state; Android Backup quiesces the app itself.
  adb_cmd shell am start -W -n "$APP_ID/.MainActivity" | grep -F "Status: ok"
else
  assert_released_fixture_unlaunched
fi
adb_cmd logcat -c
backup_status=0
adb_cmd shell bmgr backupnow --monitor-verbose "$APP_ID" \
  | tee "$ARTIFACT_DIR/$MODE-backupnow.txt" || backup_status=$?
capture_backup_diagnostics
if (( backup_status != 0 )); then
  exit "$backup_status"
fi
grep -F "Package $APP_ID with result: Success" "$ARTIFACT_DIR/$MODE-backupnow.txt"

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
if [[ "$MODE" == "device-transfer-released-fixture" ]]; then
  adb_cmd shell bmgr transport "$GMS_TRANSPORT" | grep -F "Selected transport"
fi
adb_cmd install-multiple -t --user 0 "$apk_dir"/*.apk
if [[ "$MODE" == "device-transfer-released-fixture" ]]; then
  # Match Android's documented single-device D2D cleanup after restore so a
  # later run cannot reuse this migration dataset.
  adb_cmd shell bmgr init "$D2D_TRANSPORT"
fi
adb_cmd shell pm path "$APP_ID" | tee "$ARTIFACT_DIR/$MODE-restored-package.txt"
echo "Completed $MODE backup, clean uninstall, reinstall, and system restore."
