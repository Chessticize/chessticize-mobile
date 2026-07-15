#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="com.chessticize.mobile"
LOCAL_TRANSPORT="com.android.localtransport/.LocalTransport"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB_PATH:-${SDK_ROOT:+$SDK_ROOT/platform-tools/adb}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"
APK="${CHESSTICIZE_ANDROID_E2E_APK:-$APP_DIR/android/app/build/outputs/apk/e2e/app-e2e.apk}"
ARTIFACT_ROOT="${ANDROID_BACKUP_POLICY_ARTIFACT_DIR:-$APP_DIR/artifacts/android-progress-backup-policy}"

if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "Set ADB_PATH, ANDROID_HOME, or ANDROID_SDK_ROOT to an executable adb." >&2
  exit 69
fi
if [[ ! -f "$APK" ]]; then
  echo "Android policy evidence APK does not exist: $APK" >&2
  exit 66
fi

adb_cmd() {
  "$ADB" -s "$DEVICE" "$@"
}

wait_for_boot_completed() {
  local attempts=0
  local boot_completed=""
  while (( attempts < 60 )); do
    boot_completed="$(adb_cmd shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [[ "$boot_completed" == "1" ]]; then
      return
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  echo "Android device $DEVICE did not return to a boot-complete state." >&2
  exit 1
}

ensure_root_adbd() {
  local adb_uid
  adb_cmd wait-for-device
  wait_for_boot_completed
  adb_uid="$(adb_cmd shell id -u | tr -d '\r')"
  if [[ "$adb_uid" != "0" ]]; then
    adb_cmd root
    adb_cmd wait-for-device
    wait_for_boot_completed
    adb_uid="$(adb_cmd shell id -u | tr -d '\r')"
  fi
  if [[ "$adb_uid" != "0" ]]; then
    echo "Android backup policy evidence requires root adbd; received uid ${adb_uid:-<empty>}." >&2
    exit 1
  fi
}

write_database_fixture_file() {
  local name="$1"
  local marker="$2"
  printf '%s' "$marker" | adb_cmd shell run-as "$APP_ID" sh -c "cat > databases/$name"
}

seed_database_fixture() {
  local name
  local files=(
    chessticize-mobile.sqlite
    chessticize-mobile.sqlite-journal
    chessticize-mobile.sqlite-wal
    chessticize-mobile.sqlite-journal-journal
    chessticize-mobile.sqlite-journal-wal
    chessticize-mobile.sqlite-wal-journal
    chessticize-mobile.sqlite-wal-wal
    chessticize-mobile.sqlite-shm
  )

  adb_cmd shell input keyevent KEYCODE_HOME
  adb_cmd shell am kill "$APP_ID" || true
  adb_cmd shell run-as "$APP_ID" mkdir -p databases
  for name in "${files[@]}"; do
    adb_cmd shell run-as "$APP_ID" rm -f "databases/$name"
  done
  write_database_fixture_file chessticize-mobile.sqlite 'main-database-fixture'
  write_database_fixture_file chessticize-mobile.sqlite-journal 'rollback-journal-fixture'
  write_database_fixture_file chessticize-mobile.sqlite-wal 'write-ahead-log-fixture'
  write_database_fixture_file chessticize-mobile.sqlite-journal-journal 'recursive-journal-journal-trap'
  write_database_fixture_file chessticize-mobile.sqlite-journal-wal 'recursive-journal-wal-trap'
  write_database_fixture_file chessticize-mobile.sqlite-wal-journal 'recursive-wal-journal-trap'
  write_database_fixture_file chessticize-mobile.sqlite-wal-wal 'recursive-wal-wal-trap'
  write_database_fixture_file chessticize-mobile.sqlite-shm 'derived-shm-trap'

  : > "$ARTIFACT_DIR/seeded-database-files.txt"
  : > "$ARTIFACT_DIR/seeded-database-sha256.txt"
  for name in "${files[@]}"; do
    adb_cmd shell run-as "$APP_ID" stat -c '%n %s' "databases/$name" \
      | tr -d '\r' >> "$ARTIFACT_DIR/seeded-database-files.txt"
    adb_cmd shell run-as "$APP_ID" sha256sum "databases/$name" \
      | tr -d '\r' >> "$ARTIFACT_DIR/seeded-database-sha256.txt"
  done
  sort -o "$ARTIFACT_DIR/seeded-database-files.txt" "$ARTIFACT_DIR/seeded-database-files.txt"
  sort -o "$ARTIFACT_DIR/seeded-database-sha256.txt" "$ARTIFACT_DIR/seeded-database-sha256.txt"
  awk '$2 <= 0 { exit 1 }' "$ARTIFACT_DIR/seeded-database-files.txt"
  if [[ "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/seeded-database-sha256.txt" | sort -u | wc -l | tr -d ' ')" \
      != "${#files[@]}" ]]; then
    echo "Android backup policy fixture markers must be unique and nonempty." >&2
    exit 1
  fi
}

find_transport_archive() {
  local candidate
  local candidates=(
    "/data/data/com.android.localtransport/files/1/_full/$APP_ID"
    "/data/user/0/com.android.localtransport/files/1/_full/$APP_ID"
    "/data/user_de/0/com.android.localtransport/files/1/_full/$APP_ID"
    "/cache/backup/1/_full/$APP_ID"
  )
  for candidate in "${candidates[@]}"; do
    if adb_cmd shell test -f "$candidate"; then
      adb_cmd shell readlink -f "$candidate" | tr -d '\r'
    fi
  done | sort -u
}

capture_installed_apk() {
  local installed_path
  adb_cmd shell pm path "$APP_ID" | tr -d '\r' | tee "$ARTIFACT_DIR/installed-apk-paths.txt"
  installed_path="$(sed -n 's/^package://p' "$ARTIFACT_DIR/installed-apk-paths.txt" | head -n 1)"
  if [[ -z "$installed_path" ]]; then
    echo "No installed APK path was reported for $APP_ID." >&2
    exit 1
  fi
  sha256sum "$APK" > "$ARTIFACT_DIR/workflow-artifact-apk-sha256.txt"
  adb_cmd shell sha256sum "$installed_path" | tr -d '\r' > "$ARTIFACT_DIR/installed-apk-sha256.txt"
  if [[ "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/workflow-artifact-apk-sha256.txt")" \
      != "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/installed-apk-sha256.txt")" ]]; then
    echo "Installed APK does not match the downloaded exact-head APK." >&2
    exit 1
  fi
  adb_cmd shell dumpsys package "$APP_ID" > "$ARTIFACT_DIR/installed-package.txt"
}

capture_case_state() {
  local case_name="$1"
  adb_cmd shell settings get secure backup_local_transport_parameters \
    | tr -d '\r' > "$ARTIFACT_DIR/$case_name-transport-parameters.txt"
  adb_cmd shell bmgr list transports > "$ARTIFACT_DIR/$case_name-transports.txt"
  adb_cmd shell dumpsys backup > "$ARTIFACT_DIR/$case_name-dumpsys-backup.txt"
}

reset_local_transport() {
  if (( SDK_LEVEL >= 28 )); then
    adb_cmd shell bmgr init "$LOCAL_TRANSPORT"
  else
    # API 24 predates bmgr init. This matrix lane has one case on a fresh
    # emulator, so the package-scoped wipe is the equivalent empty baseline.
    adb_cmd shell bmgr wipe "$LOCAL_TRANSPORT" "$APP_ID"
  fi
}

assert_parser_selected_expected_resource() {
  local case_name="$1"
  local parser_log="$ARTIFACT_DIR/$case_name-parser-log.txt"
  grep -E 'Found valid (fullBackupContent|full-backup-content); parsing xml resource\.' "$parser_log"
  if (( SDK_LEVEL < 28 )); then
    if grep -Fq 'chessticize-mobile.sqlite' "$parser_log"; then
      echo "API $SDK_LEVEL unexpectedly selected a progress database include." >&2
      exit 1
    fi
    grep -F 'Excludes:' "$parser_log"
  else
    grep -F 'chessticize-mobile.sqlite' "$parser_log"
    grep -F 'chessticize-mobile.sqlite-journal' "$parser_log"
    grep -F 'chessticize-mobile.sqlite-wal' "$parser_log"
    if grep -Eq 'chessticize-mobile\.sqlite-(journal|wal)-(journal|wal)' "$parser_log"; then
      echo "API $SDK_LEVEL parser generated a recursive SQLite sidecar include." >&2
      exit 1
    fi
  fi
}

assert_database_archive_paths() {
  local case_name="$1"
  local expected_payload="$2"
  local archive_paths_file="$ARTIFACT_DIR/$case_name-transport-archive-paths.txt"
  local archive_path
  local archive="$ARTIFACT_DIR/$case_name-transport-archive.tar"
  local archive_entries="$ARTIFACT_DIR/$case_name-transport-archive-entries.txt"
  local database_entries="$ARTIFACT_DIR/$case_name-database-archive-entries.txt"
  local expected_entries="$ARTIFACT_DIR/$case_name-expected-database-entries.txt"

  find_transport_archive > "$archive_paths_file"
  : > "$database_entries"
  if [[ -s "$archive_paths_file" ]]; then
    if [[ "$(wc -l < "$archive_paths_file" | tr -d ' ')" != "1" ]]; then
      echo "Expected exactly one canonical LocalTransport archive path." >&2
      cat "$archive_paths_file" >&2
      exit 1
    fi
    archive_path="$(cat "$archive_paths_file")"
    adb_cmd pull "$archive_path" "$archive" >/dev/null
    sha256sum "$archive" > "$ARTIFACT_DIR/$case_name-transport-archive-sha256.txt"
    stat -c '%n %s' "$archive" > "$ARTIFACT_DIR/$case_name-transport-archive-stat.txt"
    tar -tf "$archive" | sort > "$archive_entries"
    grep -E "^apps/$APP_ID/db/" "$archive_entries" > "$database_entries" || true
  fi

  if [[ "$expected_payload" == "none" ]]; then
    if [[ -s "$database_entries" ]]; then
      echo "API $SDK_LEVEL $case_name unexpectedly emitted database payload." >&2
      cat "$database_entries" >&2
      exit 1
    fi
    return
  fi

  printf '%s\n' \
    "apps/$APP_ID/db/chessticize-mobile.sqlite" \
    "apps/$APP_ID/db/chessticize-mobile.sqlite-journal" \
    "apps/$APP_ID/db/chessticize-mobile.sqlite-wal" \
    | sort > "$expected_entries"
  diff -u "$expected_entries" "$database_entries"
  tar -xOf "$archive" "apps/$APP_ID/db/chessticize-mobile.sqlite" \
    | cmp - <(printf '%s' 'main-database-fixture')
  tar -xOf "$archive" "apps/$APP_ID/db/chessticize-mobile.sqlite-journal" \
    | cmp - <(printf '%s' 'rollback-journal-fixture')
  tar -xOf "$archive" "apps/$APP_ID/db/chessticize-mobile.sqlite-wal" \
    | cmp - <(printf '%s' 'write-ahead-log-fixture')
}

run_case() {
  local case_name="$1"
  local transport_parameters="$2"
  local expected_payload="$3"
  local backup_status=0

  adb_cmd shell settings put secure backup_local_transport_parameters "$transport_parameters"
  adb_cmd shell bmgr transport "$LOCAL_TRANSPORT" | grep -F 'Selected transport'
  # Every case starts from an empty LocalTransport dataset and reset framework state.
  reset_local_transport
  adb_cmd logcat -c
  adb_cmd shell bmgr backupnow "$APP_ID" \
    | tee "$ARTIFACT_DIR/$case_name-backupnow.txt" || backup_status=$?
  adb_cmd logcat -d -v threadtime BackupXmlParserLogging:V '*:S' \
    | tee "$ARTIFACT_DIR/$case_name-parser-log.txt"
  capture_case_state "$case_name"
  if (( backup_status != 0 )); then
    exit "$backup_status"
  fi
  grep -F "Package $APP_ID with result: Success" "$ARTIFACT_DIR/$case_name-backupnow.txt"
  grep -Fx "$transport_parameters" "$ARTIFACT_DIR/$case_name-transport-parameters.txt"
  grep -F "* $LOCAL_TRANSPORT" "$ARTIFACT_DIR/$case_name-transports.txt"
  assert_parser_selected_expected_resource "$case_name"
  assert_database_archive_paths "$case_name" "$expected_payload"
}

mkdir -p "$ARTIFACT_ROOT"
ensure_root_adbd
SDK_LEVEL="$(adb_cmd shell getprop ro.build.version.sdk | tr -d '\r')"
case "$SDK_LEVEL" in
  24|30) ;;
  *)
    echo "Android backup policy evidence requires API 24 or 30; found API $SDK_LEVEL." >&2
    exit 64
    ;;
esac
ARTIFACT_DIR="$ARTIFACT_ROOT/api-$SDK_LEVEL"
mkdir -p "$ARTIFACT_DIR"

original_transport="$(adb_cmd shell bmgr list transports | sed -n 's/^  \* //p' | tr -d '\r' | head -n 1)"
cleanup() {
  adb_cmd shell settings delete secure backup_local_transport_parameters >/dev/null 2>&1 || true
  if [[ -n "$original_transport" ]]; then
    adb_cmd shell bmgr transport "$original_transport" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

adb_cmd install -r -t "$APK"
adb_cmd shell am start -W -n "$APP_ID/.MainActivity" | tee "$ARTIFACT_DIR/launch.txt" | grep -F 'Status: ok'
capture_installed_apk
seed_database_fixture
adb_cmd shell setprop log.tag.BackupXmlParserLogging VERBOSE
adb_cmd shell bmgr enable true

{
  echo "api-level=$SDK_LEVEL"
  echo "commit-sha=${GITHUB_SHA:-unavailable}"
  echo "device=$DEVICE"
  echo "workflow-artifact-apk=$APK"
  echo "transport=$LOCAL_TRANSPORT"
  echo "fixture=main+journal+wal+recursive-sidecar-traps+shm-trap"
} > "$ARTIFACT_DIR/context.txt"

if (( SDK_LEVEL == 24 )); then
  run_case encrypted-advertised 'is_encrypted=true,log_agent_results=true' none
else
  run_case no-capability 'is_encrypted=false,log_agent_results=true' none
  run_case encrypted 'is_encrypted=true,log_agent_results=true' exact-progress-files
fi

echo "result=pass" >> "$ARTIFACT_DIR/context.txt"
