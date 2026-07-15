#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
APP_ID="com.chessticize.mobile"
LOCAL_TRANSPORT="com.android.localtransport/.LocalTransport"
APP_DATA_DOMAINS='r|f|db|sp|d_r|d_f|d_db|d_sp|ef'
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB_PATH:-${SDK_ROOT:+$SDK_ROOT/platform-tools/adb}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"
APK="${CHESSTICIZE_ANDROID_E2E_APK:-$APP_DIR/android/app/build/outputs/apk/e2e/app-e2e.apk}"
ARTIFACT_ROOT="${ANDROID_BACKUP_POLICY_ARTIFACT_DIR:-$APP_DIR/artifacts/android-progress-backup-policy}"
ADB_OPERATION_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_ADB_TIMEOUT_SECONDS:-120}"
ADB_CLEANUP_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_CLEANUP_ADB_TIMEOUT_SECONDS:-10}"
BACKUP_MANAGER_READINESS_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_READINESS_TIMEOUT_SECONDS:-15}"
BACKUP_MANAGER_READINESS_ATTEMPTS="${ANDROID_BACKUP_POLICY_READINESS_ATTEMPTS:-6}"

# API 30's Android 11 LocalTransport recognizes only fake_encryption_flag and
# non_incremental_only. It cannot be used as evidence for a real encryption or D2D capability:
# https://android.googlesource.com/platform/frameworks/base/+/android11-release/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java
# API 36 uses Android 16's authoritative is_encrypted and is_device_transfer parameters:
# https://android.googlesource.com/platform/frameworks/base/+/android-16.0.0_r1/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java
AOSP_API30_PARAMETERS_URL="https://android.googlesource.com/platform/frameworks/base/+/android11-release/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java"
AOSP_API36_PARAMETERS_URL="https://android.googlesource.com/platform/frameworks/base/+/android-16.0.0_r1/packages/LocalTransport/src/com/android/localtransport/LocalTransportParameters.java"

if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "Set ADB_PATH, ANDROID_HOME, or ANDROID_SDK_ROOT to an executable adb." >&2
  exit 69
fi
if [[ ! -f "$APK" ]]; then
  echo "Android policy evidence APK does not exist: $APK" >&2
  exit 66
fi

adb_cmd() {
  local diagnostic_dir="${ARTIFACT_DIR:-$ARTIFACT_ROOT}"
  local diagnostic_file
  local status=0

  if timeout --foreground "${ADB_OPERATION_TIMEOUT_SECONDS}s" \
      "$ADB" -s "$DEVICE" "$@"; then
    return 0
  else
    status=$?
  fi
  if (( status == 124 || status == 137 )); then
    mkdir -p "$diagnostic_dir"
    diagnostic_file="$diagnostic_dir/adb-timeout-diagnostic-$(date -u +%Y%m%dT%H%M%S%N)-$$.txt"
    {
      printf 'timeout-seconds=%s\n' "$ADB_OPERATION_TIMEOUT_SECONDS"
      printf 'device=%s\n' "$DEVICE"
      printf 'timed-out-command='
      printf '%q ' "$ADB" -s "$DEVICE" "$@"
      printf '\n'
    } > "$diagnostic_file"
    echo "Android policy ADB operation timed out after ${ADB_OPERATION_TIMEOUT_SECONDS}s; diagnostic: $diagnostic_file" >&2
  fi
  return "$status"
}

source "$APP_DIR/scripts/android-device-inspection.sh"

assert_app_process_absent() {
  local label="$1"
  local process_output

  process_output="$(read_app_process_ids)"
  printf '%s\n' "${process_output:-absent}" > "$ARTIFACT_DIR/$label-process.txt"
  if [[ -n "$process_output" ]]; then
    echo "$APP_ID process interfered with the synthetic backup fixture at $label: $process_output" >&2
    exit 1
  fi
}

quiesce_app_process_for_fixture() {
  local attempts=0
  local process_output
  local -a process_ids=()

  adb_cmd shell input keyevent KEYCODE_HOME
  process_output="$(read_app_process_ids)"
  if [[ -n "$process_output" ]]; then
    read -r -a process_ids <<< "$process_output"
    adb_cmd shell kill -9 "${process_ids[@]}"
  fi
  while (( attempts < 40 )); do
    process_output="$(read_app_process_ids)"
    if [[ -z "$process_output" ]]; then
      return
    fi
    attempts=$((attempts + 1))
    sleep 0.25
  done
  echo "$APP_ID did not reach a quiescent process state before fixture seeding." >&2
  exit 1
}

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

record_remote_file_sha256() {
  local relative_path="$1"
  local artifact="$2"

  if ! adb_cmd exec-out run-as "$APP_ID" cat "$relative_path" \
      | sha256sum >> "$artifact"; then
    echo "Unable to stream $relative_path for host-side SHA-256 evidence." >&2
    exit 1
  fi
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

wait_for_api24_backup_manager_ready() {
  local attempt=1
  local attempt_artifact
  local status=0

  while (( attempt <= BACKUP_MANAGER_READINESS_ATTEMPTS )); do
    attempt_artifact="$ARTIFACT_DIR/api24-backup-manager-readiness-attempt-$attempt.txt"
    if ADB_OPERATION_TIMEOUT_SECONDS="$BACKUP_MANAGER_READINESS_TIMEOUT_SECONDS" \
        adb_cmd shell bmgr list transports > "$attempt_artifact" 2>&1; then
      if grep -F "$LOCAL_TRANSPORT" "$attempt_artifact" >/dev/null; then
        cp "$attempt_artifact" "$ARTIFACT_DIR/api24-backup-manager-readiness.txt"
        printf 'attempt=%s status=ready\n' "$attempt" \
          >> "$ARTIFACT_DIR/api24-backup-manager-readiness.txt"
        return
      fi
      status=1
    else
      status=$?
    fi
    printf 'attempt=%s status=%s\n' "$attempt" "$status" >> "$attempt_artifact"
    attempt=$((attempt + 1))
    sleep 2
  done
  echo "API 24 BackupManager did not become ready after $BACKUP_MANAGER_READINESS_ATTEMPTS bounded attempts." >&2
  exit 1
}

write_fixture_file() {
  local relative_path="$1"
  local marker="$2"
  local dd_output
  local measured_size

  if ! dd_output="$(printf '%s' "$marker" \
      | adb_cmd shell run-as "$APP_ID" dd "of=$relative_path" 2>&1)"; then
    echo "Fixture write command failed for $relative_path: $dd_output" >&2
    exit 1
  fi
  measured_size="$(remote_file_size "$relative_path")"
}

seed_app_data_fixture() {
  local credential_root
  local device_root="/data/user_de/0/$APP_ID"
  local index
  local measured_size
  local relative_path
  local paths=(
    databases/chessticize-mobile.sqlite
    databases/chessticize-mobile.sqlite-journal
    databases/chessticize-mobile.sqlite-wal
    databases/chessticize-mobile.sqlite-journal-journal
    databases/chessticize-mobile.sqlite-journal-wal
    databases/chessticize-mobile.sqlite-wal-journal
    databases/chessticize-mobile.sqlite-wal-wal
    databases/chessticize-mobile.sqlite-shm
    credential-root-trap.bin
    files/credential-file-trap.bin
    shared_prefs/credential-sharedpref-trap.xml
    databases/credential-database-trap.bin
    "$device_root/device-root-trap.bin"
    "$device_root/files/device-file-trap.bin"
    "$device_root/shared_prefs/device-sharedpref-trap.xml"
    "$device_root/databases/device-database-trap.bin"
  )
  local markers=(
    main-database-fixture
    rollback-journal-fixture
    write-ahead-log-fixture
    recursive-journal-journal-trap
    recursive-journal-wal-trap
    recursive-wal-journal-trap
    recursive-wal-wal-trap
    derived-shm-trap
    credential-root-domain-trap
    credential-file-domain-trap
    credential-sharedpref-domain-trap
    credential-database-domain-trap
    device-root-domain-trap
    device-file-domain-trap
    device-sharedpref-domain-trap
    device-database-domain-trap
  )

  quiesce_app_process_for_fixture
  assert_app_process_absent fixture-seed-before
  credential_root="$(adb_cmd shell run-as "$APP_ID" pwd | tr -d '\r')"
  if [[ -z "$credential_root" ]]; then
    echo "run-as returned an empty credential-protected data root." >&2
    exit 1
  fi
  adb_cmd shell run-as "$APP_ID" mkdir -p \
    databases files shared_prefs \
    "$device_root" "$device_root/databases" "$device_root/files" "$device_root/shared_prefs"

  for index in "${!paths[@]}"; do
    adb_cmd shell run-as "$APP_ID" rm -rf "${paths[$index]}"
    write_fixture_file "${paths[$index]}" "${markers[$index]}"
    assert_app_process_absent "fixture-seed-$index"
  done
  assert_app_process_absent fixture-seed-after

  : > "$ARTIFACT_DIR/seeded-app-data-files.txt"
  : > "$ARTIFACT_DIR/seeded-app-data-sha256.txt"
  for index in "${!paths[@]}"; do
    measured_size="$(remote_file_size "${paths[$index]}")"
    relative_path="${paths[$index]}"
    printf '%s %s\n' "$relative_path" "$measured_size" \
      >> "$ARTIFACT_DIR/seeded-app-data-files.txt"
    record_remote_file_sha256 "$relative_path" "$ARTIFACT_DIR/seeded-app-data-sha256.txt"
  done
  sort -o "$ARTIFACT_DIR/seeded-app-data-files.txt" "$ARTIFACT_DIR/seeded-app-data-files.txt"
  sort -o "$ARTIFACT_DIR/seeded-app-data-sha256.txt" "$ARTIFACT_DIR/seeded-app-data-sha256.txt"
  awk '$2 <= 0 { exit 1 }' "$ARTIFACT_DIR/seeded-app-data-files.txt"
  if [[ "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/seeded-app-data-sha256.txt" \
      | sort -u | wc -l | tr -d ' ')" != "${#paths[@]}" ]]; then
    echo "Android backup policy fixture markers must be unique and nonempty." >&2
    exit 1
  fi
  printf '%s\n' "$credential_root" > "$ARTIFACT_DIR/credential-data-root.txt"
  printf '%s\n' "$device_root" > "$ARTIFACT_DIR/device-data-root.txt"
}

find_transport_archive() {
  local candidates=(
    "/data/data/com.android.localtransport/files/1/_full/$APP_ID"
    "/data/user/0/com.android.localtransport/files/1/_full/$APP_ID"
    "/data/user_de/0/com.android.localtransport/files/1/_full/$APP_ID"
    "/cache/backup/1/_full/$APP_ID"
  )
  find_existing_device_paths file "${candidates[@]}"
}

capture_installed_apk() {
  local installed_path
  local installed_apk="$ARTIFACT_DIR/installed-base.apk"
  adb_cmd shell pm path "$APP_ID" | tr -d '\r' | tee "$ARTIFACT_DIR/installed-apk-paths.txt"
  installed_path="$(sed -n 's/^package://p' "$ARTIFACT_DIR/installed-apk-paths.txt" | head -n 1)"
  if [[ -z "$installed_path" ]]; then
    echo "No installed APK path was reported for $APP_ID." >&2
    exit 1
  fi
  sha256sum "$APK" > "$ARTIFACT_DIR/workflow-artifact-apk-sha256.txt"
  if ! adb_cmd exec-out cat "$installed_path" > "$installed_apk"; then
    echo "Unable to stream the installed APK for exact-head provenance." >&2
    exit 1
  fi
  if [[ ! -s "$installed_apk" ]]; then
    echo "Installed APK stream was empty; exact-head provenance cannot be proven." >&2
    exit 1
  fi
  sha256sum "$installed_apk" > "$ARTIFACT_DIR/installed-apk-sha256.txt"
  if [[ "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/workflow-artifact-apk-sha256.txt")" \
      != "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/installed-apk-sha256.txt")" ]]; then
    echo "Installed APK does not match the downloaded exact-head APK." >&2
    exit 1
  fi
  rm -f "$installed_apk"
  adb_cmd shell dumpsys package "$APP_ID" > "$ARTIFACT_DIR/installed-package.txt"
}

capture_case_state() {
  local case_name="$1"
  adb_cmd shell settings get secure backup_local_transport_parameters \
    | tr -d '\r' > "$ARTIFACT_DIR/$case_name-transport-parameters.txt"
  adb_cmd shell bmgr list transports > "$ARTIFACT_DIR/$case_name-transports.txt"
  adb_cmd shell dumpsys backup > "$ARTIFACT_DIR/$case_name-dumpsys-backup.txt"
  adb_cmd logcat -d -v raw -s ChessticizeBackup:I \
    > "$ARTIFACT_DIR/$case_name-agent-log.txt"
}

reset_local_transport() {
  if (( SDK_LEVEL >= 28 )); then
    adb_cmd shell bmgr init "$LOCAL_TRANSPORT"
  else
    adb_cmd shell bmgr wipe "$LOCAL_TRANSPORT" "$APP_ID"
  fi
}

assert_agent_decision() {
  local case_name="$1"
  local expected_flags="$2"
  local expected_selected="$3"
  local expected_emitted="$4"
  local encryption=false
  local d2d=false
  local log="$ARTIFACT_DIR/$case_name-agent-log.txt"
  local policy_events="$ARTIFACT_DIR/$case_name-policy-events.txt"
  local unique_policy_events="$ARTIFACT_DIR/$case_name-unique-policy-events.txt"
  local result_events="$ARTIFACT_DIR/$case_name-result-events.txt"
  local unique_result_events="$ARTIFACT_DIR/$case_name-unique-result-events.txt"
  local payload_events="$ARTIFACT_DIR/$case_name-payload-events.txt"
  local expected_policy
  local expected_result
  local policy_invocations
  local expected_payload_events
  local name

  case "$expected_flags" in
    unavailable) ;;
    0) ;;
    1) encryption=true ;;
    2) d2d=true ;;
    3) encryption=true; d2d=true ;;
    *) echo "Unsupported expected transport flag mask: $expected_flags" >&2; exit 64 ;;
  esac

  expected_policy="event=policy sdk=$SDK_LEVEL transportFlags=$expected_flags encryption=$encryption d2d=$d2d selected=$expected_selected"
  expected_result="event=result selected=$expected_selected emitted=$expected_emitted"
  grep '^event=policy ' "$log" > "$policy_events" || true
  grep '^event=result ' "$log" > "$result_events" || true
  grep '^event=payload ' "$log" > "$payload_events" || true
  if [[ ! -s "$policy_events" || ! -s "$result_events" ]]; then
    echo "Expected at least one BackupAgent policy and result invocation for $case_name." >&2
    exit 1
  fi
  sort -u "$policy_events" > "$unique_policy_events"
  sort -u "$result_events" > "$unique_result_events"
  if [[ "$(wc -l < "$unique_policy_events" | tr -d ' ')" != "1" \
      || "$(cat "$unique_policy_events")" != "$expected_policy" ]]; then
    echo "Inconsistent BackupAgent policy selections for $case_name." >&2
    cat "$unique_policy_events" >&2
    exit 1
  fi
  if [[ "$(wc -l < "$unique_result_events" | tr -d ' ')" != "1" \
      || "$(cat "$unique_result_events")" != "$expected_result" ]]; then
    echo "Inconsistent BackupAgent results for $case_name." >&2
    cat "$unique_result_events" >&2
    exit 1
  fi
  policy_invocations="$(wc -l < "$policy_events" | tr -d ' ')"
  if [[ "$(wc -l < "$result_events" | tr -d ' ')" != "$policy_invocations" ]]; then
    echo "BackupAgent policy/result invocation counts differ for $case_name." >&2
    exit 1
  fi
  AGENT_INVOCATIONS="$policy_invocations"

  if (( expected_emitted == 0 )); then
    if [[ -s "$payload_events" ]]; then
      echo "$case_name logged payload despite a fail-closed policy decision." >&2
      exit 1
    fi
    return
  fi

  expected_payload_events=$((expected_emitted * policy_invocations))
  if [[ "$(wc -l < "$payload_events" | tr -d ' ')" != "$expected_payload_events" ]]; then
    echo "$case_name payload log count is inconsistent with its BackupAgent invocations." >&2
    exit 1
  fi
  for name in chessticize-mobile.sqlite chessticize-mobile.sqlite-journal chessticize-mobile.sqlite-wal; do
    if [[ "$(grep -Fxc "event=payload name=$name" "$payload_events")" != "$policy_invocations" ]]; then
      echo "$case_name did not emit $name once per consistent BackupAgent invocation." >&2
      exit 1
    fi
  done
}

assert_app_data_archive_paths() {
  local case_name="$1"
  local expected_payload="$2"
  local archive_paths_file="$ARTIFACT_DIR/$case_name-transport-archive-paths.txt"
  local archive_path
  local archive="$ARTIFACT_DIR/$case_name-transport-archive.tar"
  local archive_entries="$ARTIFACT_DIR/$case_name-transport-archive-entries.txt"
  local app_data_entries="$ARTIFACT_DIR/$case_name-app-data-archive-entries.txt"
  local expected_entries="$ARTIFACT_DIR/$case_name-expected-app-data-entries.txt"
  local archive_size

  if ! find_transport_archive > "$archive_paths_file"; then
    echo "Unable to inspect canonical LocalTransport archive paths." >&2
    exit 1
  fi
  : > "$archive_entries"
  : > "$app_data_entries"
  if [[ -s "$archive_paths_file" ]]; then
    if [[ "$(wc -l < "$archive_paths_file" | tr -d ' ')" != "1" ]]; then
      echo "Expected at most one canonical LocalTransport archive path." >&2
      cat "$archive_paths_file" >&2
      exit 1
    fi
    archive_path="$(cat "$archive_paths_file")"
    adb_cmd pull "$archive_path" "$archive" >/dev/null
    sha256sum "$archive" > "$ARTIFACT_DIR/$case_name-transport-archive-sha256.txt"
    archive_size="$(stat -c %s "$archive")"
    printf '%s %s\n' "$archive" "$archive_size" \
      > "$ARTIFACT_DIR/$case_name-transport-archive-stat.txt"
    tar -tf "$archive" | sort > "$archive_entries"
    grep -E "^apps/$APP_ID/($APP_DATA_DOMAINS)/" "$archive_entries" \
      > "$app_data_entries" || true
  fi

  if [[ "$expected_payload" == "no-archive" ]]; then
    if [[ -s "$archive_paths_file" ]]; then
      echo "API $SDK_LEVEL $case_name unexpectedly created a transport archive." >&2
      cat "$archive_paths_file" >&2
      exit 1
    fi
    return
  fi

  if [[ "$expected_payload" == "none" ]]; then
    if [[ -s "$app_data_entries" ]]; then
      echo "API $SDK_LEVEL $case_name unexpectedly emitted app-data payload." >&2
      cat "$app_data_entries" >&2
      exit 1
    fi
    return
  fi

  if [[ ! -s "$archive_paths_file" ]]; then
    echo "API $SDK_LEVEL $case_name completed successfully but emitted no transport archive." >&2
    exit 1
  fi
  printf '%s\n' \
    "apps/$APP_ID/db/chessticize-mobile.sqlite" \
    "apps/$APP_ID/db/chessticize-mobile.sqlite-journal" \
    "apps/$APP_ID/db/chessticize-mobile.sqlite-wal" \
    | sort > "$expected_entries"
  diff -u "$expected_entries" "$app_data_entries"
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
  local expected_flags="$3"
  local expected_selected="$4"
  local expected_emitted="$5"
  local expected_payload="$6"
  local expected_framework_result="${7:-success}"
  local backup_status=0
  AGENT_INVOCATIONS=0

  adb_cmd shell settings put secure backup_local_transport_parameters "$transport_parameters"
  adb_cmd shell bmgr transport "$LOCAL_TRANSPORT" | grep -F 'Selected transport'
  reset_local_transport
  adb_cmd logcat -c
  adb_cmd shell bmgr backupnow "$APP_ID" \
    | tee "$ARTIFACT_DIR/$case_name-backupnow.txt" || backup_status=$?
  capture_case_state "$case_name"
  if (( backup_status != 0 )); then
    echo "bmgr backupnow command failed for $case_name with status $backup_status." >&2
    exit "$backup_status"
  fi
  case "$expected_framework_result" in
    success)
      grep -F "Package $APP_ID with result: Success" "$ARTIFACT_DIR/$case_name-backupnow.txt"
      ;;
    fail-closed-transport-rejection)
      grep -F "Package $APP_ID with result: Transport rejected package because it wasn't able to process it at the time" \
        "$ARTIFACT_DIR/$case_name-backupnow.txt"
      grep -F "Backup finished with result: Success" "$ARTIFACT_DIR/$case_name-backupnow.txt"
      ;;
    *)
      echo "Unsupported expected framework result: $expected_framework_result" >&2
      exit 64
      ;;
  esac
  grep -Fx "$transport_parameters" "$ARTIFACT_DIR/$case_name-transport-parameters.txt"
  grep -F "* $LOCAL_TRANSPORT" "$ARTIFACT_DIR/$case_name-transports.txt"
  assert_agent_decision "$case_name" "$expected_flags" "$expected_selected" "$expected_emitted"
  assert_app_data_archive_paths "$case_name" "$expected_payload"
  echo "case=$case_name delivered-mask=$expected_flags selected=$expected_selected emitted=$expected_emitted agent-invocations=$AGENT_INVOCATIONS payload=$expected_payload framework-result=$expected_framework_result result=pass" \
    >> "$ARTIFACT_DIR/context.txt"
}

mkdir -p "$ARTIFACT_ROOT"
ensure_root_adbd
SDK_LEVEL="$(adb_cmd shell getprop ro.build.version.sdk | tr -d '\r')"
case "$SDK_LEVEL" in
  24|30|36) ;;
  *)
    echo "Android backup policy evidence requires API 24, 30, or 36; found API $SDK_LEVEL." >&2
    exit 64
    ;;
esac
ARTIFACT_DIR="$ARTIFACT_ROOT/api-$SDK_LEVEL"
mkdir -p "$ARTIFACT_DIR"

GITHUB_SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
git -C "$REPO_ROOT" status --porcelain --untracked-files=no \
  > "$ARTIFACT_DIR/tracked-worktree-before.txt"
if [[ -s "$ARTIFACT_DIR/tracked-worktree-before.txt" ]]; then
  echo "Tracked worktree was not clean before Android backup policy validation." >&2
  exit 1
fi
if [[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" != "$GITHUB_SHA" ]]; then
  echo "Checked-out commit does not match the requested exact-head commit $GITHUB_SHA." >&2
  exit 1
fi

original_transport=""
if (( SDK_LEVEL != 24 )); then
  original_transport="$(adb_cmd shell bmgr list transports \
    | sed -n 's/^  \* //p' | tr -d '\r' | head -n 1)"
fi
cleanup() {
  ADB_OPERATION_TIMEOUT_SECONDS="$ADB_CLEANUP_TIMEOUT_SECONDS"
  adb_cmd shell settings delete secure backup_local_transport_parameters >/dev/null 2>&1 || true
  if [[ -n "$original_transport" ]]; then
    adb_cmd shell bmgr transport "$original_transport" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

adb_cmd install -r -t "$APK"
adb_cmd shell am start -W -n "$APP_ID/.MainActivity" \
  | tee "$ARTIFACT_DIR/launch.txt" | grep -F 'Status: ok'
capture_installed_apk
seed_app_data_fixture
if (( SDK_LEVEL == 24 )); then
  wait_for_api24_backup_manager_ready
fi
adb_cmd shell bmgr enable true

{
  echo "api-level=$SDK_LEVEL"
  echo "commit-sha=$GITHUB_SHA"
  echo "build-result=success (android-build dependency)"
  echo "device=$DEVICE"
  echo "workflow-artifact-apk=$APK"
  echo "transport=$LOCAL_TRANSPORT"
  echo "exact-commands=./gradlew :app:testDebugUnitTest --tests com.chessticize.mobile.backup.ProgressBackupPolicyTest --no-daemon; apps/mobile/scripts/android-progress-backup-policy-evidence.sh"
  echo "validation-scope=targeted native Android full-backup capability and allowlist policy"
  echo "scope-rationale=API24 proves pre-transport-flags fail-closed behavior; API30 proves shared agent mask 0 fails closed with no payload and a real inherited restore admits only the v28 path-only allowlist; API36 proves authoritative LocalTransport masks 0,1,2,3 and once-only agent output"
  echo "artifact-name=android-progress-backup-policy-api-$SDK_LEVEL"
  echo "artifact-identifier=run-${GITHUB_RUN_ID:-local}/android-progress-backup-policy-api-$SDK_LEVEL"
  echo "artifact-url=${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-local/repository}/actions/runs/${GITHUB_RUN_ID:-local}#artifacts"
  echo "aosp-api30-localtransport-parameters=$AOSP_API30_PARAMETERS_URL"
  echo "aosp-api36-localtransport-parameters=$AOSP_API36_PARAMETERS_URL"
  echo "fixture=canonical-database-files+credential-and-device-root-files-sharedpref-database-traps"
} > "$ARTIFACT_DIR/context.txt"

if (( SDK_LEVEL == 24 )); then
  run_case pre-flags-api 'non_incremental_only=false' unavailable false 0 none
elif (( SDK_LEVEL == 30 )); then
  run_case no-capability 'non_incremental_only=false' 0 false 0 no-archive \
    fail-closed-transport-rejection
  apps/mobile/scripts/android-progress-backup-api30-restore-evidence.sh
else
  run_case neither 'is_encrypted=false,is_device_transfer=false,log_agent_results=true' \
    0 false 0 none
  run_case encryption-only 'is_encrypted=true,is_device_transfer=false,log_agent_results=true' \
    1 true 3 exact-progress-files
  run_case d2d-only 'is_encrypted=false,is_device_transfer=true,log_agent_results=true' \
    2 true 3 exact-progress-files
  run_case both 'is_encrypted=true,is_device_transfer=true,log_agent_results=true' \
    3 true 3 exact-progress-files
fi

git -C "$REPO_ROOT" status --porcelain --untracked-files=no \
  > "$ARTIFACT_DIR/tracked-worktree-after.txt"
if [[ -s "$ARTIFACT_DIR/tracked-worktree-after.txt" ]]; then
  echo "Tracked worktree was not clean after Android backup policy validation." >&2
  exit 1
fi
echo "result=pass" >> "$ARTIFACT_DIR/context.txt"
