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

source "$APP_DIR/scripts/android-process-inspection.sh"

remote_file_size() {
  local relative_path="$1"
  local measured_size

  if ! measured_size="$(adb_cmd shell run-as "$APP_ID" stat -c %s "$relative_path" 2>&1 \
      | tr -d '\r')"; then
    echo "Remote stat command failed for $relative_path: $measured_size" >&2
    exit 1
  fi
  if [[ ! "$measured_size" =~ ^[0-9]+$ ]] || (( measured_size <= 0 )); then
    echo "Remote stat returned an invalid size for $relative_path: ${measured_size:-<empty>}" >&2
    exit 1
  fi
  printf '%s' "$measured_size"
}

record_remote_file_stat() {
  local relative_path="$1"
  local artifact="$2"
  local measured_size

  measured_size="$(remote_file_size "$relative_path")"
  printf '%s %s\n' "$relative_path" "$measured_size" > "$artifact"
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

preflight_pm_unstop() {
  local help_artifact="$ARTIFACT_DIR/released-fixture-pm-help.txt"

  if ! adb_cmd shell pm help 2>&1 | tr -d '\r' | tee "$help_artifact"; then
    echo "Unable to inspect package-manager commands before released-fixture backup." >&2
    exit 1
  fi
  if ! grep -F 'unstop [--user USER_ID] PACKAGE' "$help_artifact"; then
    echo "Package manager does not support pm unstop; cannot prove released-fixture backup eligibility without launching the app." >&2
    exit 1
  fi
}

assert_released_fixture_ready_for_backup() {
  local evidence_prefix="$1"
  local database_path="databases/chessticize-mobile.sqlite"
  local source_fixture="$REPO_ROOT/packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite"
  local pulled_database="$ARTIFACT_DIR/released-fixture-$evidence_prefix.sqlite"
  local package_state="$ARTIFACT_DIR/released-fixture-$evidence_prefix-package-state.txt"
  local process_state="$ARTIFACT_DIR/released-fixture-$evidence_prefix-process.txt"
  local process_output
  local stat_artifact="$ARTIFACT_DIR/released-fixture-$evidence_prefix-stat.txt"
  local hash_artifact="$ARTIFACT_DIR/released-fixture-$evidence_prefix-sha256.txt"
  local user_version_artifact="$ARTIFACT_DIR/released-fixture-$evidence_prefix-user-version.txt"
  local schema_artifact="$ARTIFACT_DIR/released-fixture-$evidence_prefix-schema.sql"
  local user_state
  local source_hash
  local pulled_hash

  command -v sqlite3 >/dev/null
  sha256sum "$source_fixture" > "$ARTIFACT_DIR/released-fixture-source-sha256.txt"
  if ! process_output="$(read_app_process_ids)"; then
    echo "Released fixture app process absence could not be inspected." >&2
    exit 1
  fi
  printf '%s\n' "${process_output:-absent}" > "$process_state"
  if [[ -n "$process_output" ]]; then
    echo "Released fixture app process started before BackupManager invocation." >&2
    exit 1
  fi
  adb_cmd shell dumpsys package "$APP_ID" > "$package_state"
  user_state="$(grep -E 'User 0:.*stopped=' "$package_state" | head -n 1 || true)"
  if [[ -z "$user_state" || ! "$user_state" =~ (^|[[:space:]])stopped=false([[:space:]]|$) ]]; then
    echo "Released fixture package is stopped or its stopped=false state cannot be proven." >&2
    exit 1
  fi

  record_remote_file_stat "$database_path" "$stat_artifact"
  if ! adb_cmd exec-out run-as "$APP_ID" cat "$database_path" > "$pulled_database"; then
    echo "Unable to stream the released fixture for $evidence_prefix evidence." >&2
    exit 1
  fi
  if [[ ! -s "$pulled_database" ]]; then
    echo "Released fixture stream was empty for $evidence_prefix evidence." >&2
    exit 1
  fi
  sha256sum "$pulled_database" > "$hash_artifact"
  sqlite3 "$pulled_database" 'PRAGMA user_version;' > "$user_version_artifact"
  sqlite3 "$pulled_database" '.schema' > "$schema_artifact"
  grep -Fx '0' "$user_version_artifact"
  grep -F 'CREATE TABLE attempts' "$schema_artifact"

  source_hash="$(cut -d ' ' -f 1 "$ARTIFACT_DIR/released-fixture-source-sha256.txt")"
  pulled_hash="$(cut -d ' ' -f 1 "$hash_artifact")"
  if [[ "$source_hash" != "$pulled_hash" ]]; then
    echo "Released fixture no longer matches the immutable schema-v0 source." >&2
    exit 1
  fi
  if [[ "$evidence_prefix" == "at-backup" ]]; then
    cmp -s "$ARTIFACT_DIR/released-fixture-pre-backup-stat.txt" "$stat_artifact" || {
      echo "Released fixture stat changed before BackupManager invocation." >&2
      exit 1
    }
    cmp -s "$ARTIFACT_DIR/released-fixture-pre-backup-user-version.txt" "$user_version_artifact" || {
      echo "Released fixture user_version changed before BackupManager invocation." >&2
      exit 1
    }
    cmp -s "$ARTIFACT_DIR/released-fixture-pre-backup-schema.sql" "$schema_artifact" || {
      echo "Released fixture schema changed before BackupManager invocation." >&2
      exit 1
    }
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
  preflight_pm_unstop
  if ! adb_cmd shell pm unstop --user 0 "$APP_ID"; then
    echo "Unable to clear FLAG_STOPPED without launching the released fixture." >&2
    exit 1
  fi
  assert_released_fixture_ready_for_backup pre-backup
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
  assert_released_fixture_ready_for_backup at-backup
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
