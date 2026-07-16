#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
APP_ID="com.chessticize.mobile"
API24_LOCAL_TRANSPORT="android/com.android.internal.backup.LocalTransport"
LOCAL_TRANSPORT="com.android.localtransport/.LocalTransport"
APP_DATA_DOMAINS='r|f|db|sp|d_r|d_f|d_db|d_sp|ef'
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB_PATH:-${SDK_ROOT:+$SDK_ROOT/platform-tools/adb}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"
APK="${CHESSTICIZE_ANDROID_E2E_APK:-$APP_DIR/android/app/build/outputs/apk/e2e/app-e2e.apk}"
ARTIFACT_ROOT="${ANDROID_BACKUP_POLICY_ARTIFACT_DIR:-$APP_DIR/artifacts/android-progress-backup-policy}"
RETAINED_APK_PATH="/data/local/tmp/chessticize-exact-head.apk"
ADB_OPERATION_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_ADB_TIMEOUT_SECONDS:-120}"
ADB_CLEANUP_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_CLEANUP_ADB_TIMEOUT_SECONDS:-10}"
BACKUP_MANAGER_READINESS_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_READINESS_TIMEOUT_SECONDS:-15}"
BACKUP_MANAGER_READINESS_ATTEMPTS="${ANDROID_BACKUP_POLICY_READINESS_ATTEMPTS:-6}"
ADB_ROOT_RECOVERY_ATTEMPTS="${ANDROID_BACKUP_POLICY_ADB_ROOT_RECOVERY_ATTEMPTS:-3}"

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
  return 1
}

is_transient_adb_root_restart_failure() {
  local output="$1"
  local line
  local matched=0

  while IFS= read -r line; do
    line="${line//$'\r'/}"
    [[ -z "$line" ]] && continue
    case "$line" in
      "adb: unable to connect for root: closed"|"error: closed"|"error: device offline")
        matched=1
        ;;
      *)
        return 1
        ;;
    esac
  done <<< "$output"
  (( matched == 1 ))
}

read_adbd_uid() {
  local uid_output

  if ! uid_output="$(adb_cmd shell id -u 2>&1)"; then
    echo "Unable to verify adbd uid after device recovery: ${uid_output:-<empty>}." >&2
    return 1
  fi
  uid_output="${uid_output//$'\r'/}"
  if [[ ! "$uid_output" =~ ^[0-9]+$ ]]; then
    echo "adbd returned a malformed uid after device recovery: ${uid_output:-<empty>}." >&2
    return 1
  fi
  printf '%s' "$uid_output"
}

wait_for_adbd_recovery() {
  if ! adb_cmd wait-for-device; then
    echo "Android device $DEVICE did not reconnect after the adbd root restart." >&2
    return 1
  fi
  if ! wait_for_boot_completed; then
    echo "Android device $DEVICE did not recover to boot-complete after the adbd root restart." >&2
    return 1
  fi
}

ensure_root_adbd() {
  local adb_uid
  local attempt=1
  local root_diagnostic="$ARTIFACT_DIR/adb-root-recovery.txt"
  local root_output=""
  local root_status=0

  if [[ ! "$ADB_ROOT_RECOVERY_ATTEMPTS" =~ ^[1-3]$ ]]; then
    echo "ANDROID_BACKUP_POLICY_ADB_ROOT_RECOVERY_ATTEMPTS must be an integer from 1 through 3." >&2
    return 64
  fi
  if ! wait_for_adbd_recovery; then
    return 1
  fi
  adb_uid="$(read_adbd_uid)" || return 1
  if [[ "$adb_uid" == "0" ]]; then
    return
  fi

  while (( attempt <= ADB_ROOT_RECOVERY_ATTEMPTS )); do
    root_status=0
    if root_output="$(adb_cmd root 2>&1)"; then
      root_status=0
    else
      root_status=$?
    fi
    {
      printf 'attempt=%s status=%s\n' "$attempt" "$root_status"
      printf 'output=%s\n' "${root_output:-<empty>}"
    } >> "$root_diagnostic"

    if (( root_status != 0 )) && ! is_transient_adb_root_restart_failure "$root_output"; then
      echo "adb root failed with a non-transient error (status $root_status): ${root_output:-<empty>}. Diagnostic: $root_diagnostic" >&2
      return 1
    fi

    if ! wait_for_adbd_recovery; then
      echo "adb root recovery diagnostic: $root_diagnostic" >&2
      return 1
    fi
    if ! adb_uid="$(read_adbd_uid)"; then
      echo "adb root recovery diagnostic: $root_diagnostic" >&2
      return 1
    fi
    if [[ "$adb_uid" == "0" ]]; then
      return
    fi
    if (( root_status == 0 )); then
      echo "adb root reported success but adbd remained uid $adb_uid. Diagnostic: $root_diagnostic" >&2
      return 1
    fi
    attempt=$((attempt + 1))
  done

  echo "Transient adb root restart failures did not yield root adbd after $ADB_ROOT_RECOVERY_ATTEMPTS bounded attempts; final uid $adb_uid. Diagnostic: $root_diagnostic" >&2
  return 1
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
  local case_name="$1"
  local candidates=(
    "/data/data/com.android.localtransport/files/1/_full/$APP_ID"
    "/data/user/0/com.android.localtransport/files/1/_full/$APP_ID"
    "/data/user_de/0/com.android.localtransport/files/1/_full/$APP_ID"
    "/cache/backup/1/_full/$APP_ID"
  )
  local raw_aliases_file="$ARTIFACT_DIR/$case_name-transport-archive-raw-aliases.txt"
  local canonical_aliases_file="$ARTIFACT_DIR/$case_name-transport-archive-canonical-aliases.txt"
  local identities_file="$ARTIFACT_DIR/$case_name-transport-archive-identities.txt"
  local candidate
  local path_state
  local canonical_path
  local archive_identity
  local identity_count
  local -a canonical_paths=()

  : > "$raw_aliases_file"
  : > "$canonical_aliases_file"
  : > "$identities_file"

  for candidate in "${candidates[@]}"; do
    if ! path_state="$(probe_device_path file "$candidate")"; then
      return 1
    fi
    if [[ "$path_state" == "absent" ]]; then
      continue
    fi
    if [[ "$path_state" != "present" ]]; then
      echo "Android device path probe returned an unsupported state for $candidate: $path_state" >&2
      return 1
    fi
    printf '%s\n' "$candidate" >> "$raw_aliases_file"
    if ! canonical_path="$(read_canonical_device_path "$candidate")"; then
      return 1
    fi
    printf '%s %s\n' "$candidate" "$canonical_path" >> "$canonical_aliases_file"
    if ! archive_identity="$(read_device_file_identity "$candidate")"; then
      return 1
    fi
    printf '%s %s %s\n' "$archive_identity" "$candidate" "$canonical_path" \
      >> "$identities_file"
    canonical_paths+=("$canonical_path")
  done

  if [[ ! -s "$raw_aliases_file" ]]; then
    return
  fi
  identity_count="$(cut -d ' ' -f 1 "$identities_file" | sort -u | wc -l | tr -d ' ')"
  if [[ "$identity_count" != "1" ]]; then
    echo "Expected at most one canonical LocalTransport archive target." >&2
    cat "$identities_file" >&2
    return 1
  fi
  printf '%s\n' "${canonical_paths[0]}"
}

WORKFLOW_APK_SIZE=''
WORKFLOW_APK_HASH=''
RETAINED_APK_SIZE=''

prepare_retained_apk_install_source() {
  WORKFLOW_APK_SIZE="$(stat -c %s "$APK")"
  if [[ ! "$WORKFLOW_APK_SIZE" =~ ^[1-9][0-9]*$ ]]; then
    echo "Exact-head workflow APK has an invalid size: ${WORKFLOW_APK_SIZE:-<empty>}" >&2
    exit 1
  fi
  printf '%s\n' "$WORKFLOW_APK_SIZE" \
    > "$ARTIFACT_DIR/workflow-artifact-apk-size.txt"
  sha256sum "$APK" > "$ARTIFACT_DIR/workflow-artifact-apk-sha256.txt"
  WORKFLOW_APK_HASH="$(cut -d ' ' -f 1 \
    "$ARTIFACT_DIR/workflow-artifact-apk-sha256.txt")"
  if [[ ! "$WORKFLOW_APK_HASH" =~ ^[0-9a-f]{64}$ ]]; then
    echo "Exact-head workflow APK has an invalid SHA-256: ${WORKFLOW_APK_HASH:-<empty>}" >&2
    exit 1
  fi

  if ! remove_device_file "$RETAINED_APK_PATH"; then
    echo "Unable to clear the retained APK path before exact-head installation." >&2
    exit 1
  fi
  if ! require_device_path_state any "$RETAINED_APK_PATH" absent; then
    echo "Retained APK path was not absent before the exact-head push." >&2
    exit 1
  fi
  printf '%s\n' "$RETAINED_APK_PATH" \
    > "$ARTIFACT_DIR/retained-install-source-apk-path.txt"
  if ! push_host_file_to_device "$APK" "$RETAINED_APK_PATH" \
      > "$ARTIFACT_DIR/retained-apk-push.txt" 2>&1; then
    cat "$ARTIFACT_DIR/retained-apk-push.txt" >&2
    echo "Unable to push the exact-head APK to its retained install path." >&2
    exit 1
  fi
  if ! require_device_path_state file "$RETAINED_APK_PATH" present; then
    echo "Retained APK was not present after the exact-head push." >&2
    exit 1
  fi
  if ! RETAINED_APK_SIZE="$(read_device_file_size "$RETAINED_APK_PATH")"; then
    echo "Unable to measure the retained exact-head APK." >&2
    exit 1
  fi
  if [[ ! "$RETAINED_APK_SIZE" =~ ^[1-9][0-9]*$ \
      || "$RETAINED_APK_SIZE" != "$WORKFLOW_APK_SIZE" ]]; then
    echo "Retained APK size does not match the exact-head workflow APK." >&2
    exit 1
  fi
  printf '%s\n' "$RETAINED_APK_SIZE" \
    > "$ARTIFACT_DIR/retained-install-source-apk-size.txt"
}

install_retained_apk() {
  local install_output

  if ! install_output="$(install_device_apk "$RETAINED_APK_PATH")"; then
    echo "Unable to install the retained exact-head APK through Package Manager." >&2
    exit 1
  fi
  printf '%s\n' "$install_output" > "$ARTIFACT_DIR/retained-apk-install.txt"
}

capture_installed_apk() {
  local installed_path
  local installed_path_count
  local installed_size

  if ! read_installed_package_apk_paths "$APP_ID" \
      > "$ARTIFACT_DIR/installed-apk-paths.txt"; then
    echo "Unable to inspect installed APK paths for exact-head provenance." >&2
    exit 1
  fi
  installed_path="$(sed -n 's/^package:\(.*\/base\.apk\)$/\1/p' \
    "$ARTIFACT_DIR/installed-apk-paths.txt")"
  installed_path_count="$(awk '/^package:.*\/base\.apk$/ { count += 1 } END { print count + 0 }' \
    "$ARTIFACT_DIR/installed-apk-paths.txt")"
  if [[ "$installed_path_count" != "1" || -z "$installed_path" \
      || "$installed_path" == *$'\n'* ]]; then
    echo "Expected exactly one installed base.apk path for $APP_ID." >&2
    exit 1
  fi

  if [[ ! "$WORKFLOW_APK_SIZE" =~ ^[1-9][0-9]*$ \
      || ! "$RETAINED_APK_SIZE" =~ ^[1-9][0-9]*$ \
      || ! "$WORKFLOW_APK_HASH" =~ ^[0-9a-f]{64}$ ]]; then
    echo "Retained APK provenance was not initialized before installed-APK capture." >&2
    exit 1
  fi

  if ! installed_size="$(read_device_file_size "$installed_path")"; then
    echo "Unable to measure the installed APK for exact-head provenance." >&2
    exit 1
  fi
  if [[ ! "$installed_size" =~ ^[1-9][0-9]*$ ]]; then
    echo "Installed APK has an invalid device-local size: ${installed_size:-<empty>}" >&2
    exit 1
  fi
  printf '%s\n' "$installed_size" > "$ARTIFACT_DIR/installed-apk-size.txt"
  if [[ "$installed_size" != "$WORKFLOW_APK_SIZE" \
      || "$installed_size" != "$RETAINED_APK_SIZE" ]]; then
    echo "Installed APK does not match the downloaded exact-head APK." >&2
    exit 1
  fi
  if ! require_device_files_identical "$RETAINED_APK_PATH" "$installed_path"; then
    echo "Installed APK does not match the downloaded exact-head APK." >&2
    exit 1
  fi
  {
    echo "source-path=$RETAINED_APK_PATH"
    echo "installed-path=$installed_path"
    echo "source-size=$RETAINED_APK_SIZE"
    echo "installed-size=$installed_size"
    echo "device-status=0"
    echo "result=identical"
  } > "$ARTIFACT_DIR/installed-apk-cmp.txt"
  printf '%s  %s\n' "$WORKFLOW_APK_HASH" "$installed_path" \
    > "$ARTIFACT_DIR/installed-apk-sha256.txt"
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
  local invocation_policy="$5"
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
  case "$invocation_policy" in
    exactly-one)
      if [[ "$policy_invocations" != "1" ]]; then
        echo "Expected exactly one BackupAgent invocation for $case_name." >&2
        exit 1
      fi
      ;;
    repeated-identical) ;;
    *) echo "Unsupported BackupAgent invocation policy: $invocation_policy" >&2; exit 64 ;;
  esac
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

  if ! find_transport_archive "$case_name" > "$archive_paths_file"; then
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

assert_exclusive_framework_result() {
  local case_name="$1"
  local expected_package_result="$2"
  local backup_output="$ARTIFACT_DIR/$case_name-backupnow.txt"
  local package_results="$ARTIFACT_DIR/$case_name-framework-package-results.txt"
  local overall_results="$ARTIFACT_DIR/$case_name-framework-overall-results.txt"

  grep -F "Package $APP_ID with result:" "$backup_output" > "$package_results" || true
  grep -F "Backup finished with result:" "$backup_output" > "$overall_results" || true
  if [[ "$(wc -l < "$package_results" | tr -d ' ')" != "1" \
      || "$(cat "$package_results")" != "$expected_package_result" ]]; then
    echo "Expected exactly one framework package result for $case_name: $expected_package_result" >&2
    cat "$package_results" >&2
    return 1
  fi
  if [[ "$(wc -l < "$overall_results" | tr -d ' ')" != "1" \
      || "$(cat "$overall_results")" != "Backup finished with result: Success" ]]; then
    echo "Expected exactly one successful overall framework result for $case_name." >&2
    cat "$overall_results" >&2
    return 1
  fi
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
  local invocation_policy=repeated-identical
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
    fail-closed-legacy-transport-rejection)
      invocation_policy=exactly-one
      if ! assert_exclusive_framework_result "$case_name" \
          "Package $APP_ID with result: Transport rejected package"; then
        exit 1
      fi
      ;;
    fail-closed-transport-rejection)
      invocation_policy=exactly-one
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
  assert_agent_decision \
    "$case_name" "$expected_flags" "$expected_selected" "$expected_emitted" "$invocation_policy"
  assert_app_data_archive_paths "$case_name" "$expected_payload"
  echo "case=$case_name delivered-mask=$expected_flags selected=$expected_selected emitted=$expected_emitted agent-invocations=$AGENT_INVOCATIONS payload=$expected_payload framework-result=$expected_framework_result result=pass" \
    >> "$ARTIFACT_DIR/context.txt"
}

mkdir -p "$ARTIFACT_ROOT"
adb_cmd wait-for-device
wait_for_boot_completed
SDK_LEVEL="$(adb_cmd shell getprop ro.build.version.sdk | tr -d '\r')"
case "$SDK_LEVEL" in
  24|30|36) ;;
  *)
    echo "Android backup policy evidence requires API 24, 30, or 36; found API $SDK_LEVEL." >&2
    exit 64
    ;;
esac
if (( SDK_LEVEL == 24 )); then
  LOCAL_TRANSPORT="$API24_LOCAL_TRANSPORT"
fi
ARTIFACT_DIR="$ARTIFACT_ROOT/api-$SDK_LEVEL"
mkdir -p "$ARTIFACT_DIR"
ensure_root_adbd

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
  local exit_status=$?
  local retained_cleanup_status=0
  trap - EXIT
  set +e
  ADB_OPERATION_TIMEOUT_SECONDS="$ADB_CLEANUP_TIMEOUT_SECONDS"
  if {
    remove_device_file "$RETAINED_APK_PATH" \
      && require_device_path_state any "$RETAINED_APK_PATH" absent
  } > "$ARTIFACT_DIR/retained-apk-cleanup.txt" 2>&1; then
    printf 'result=removed\n' > "$ARTIFACT_DIR/retained-apk-cleanup.txt"
  else
    retained_cleanup_status=$?
  fi
  adb_cmd shell settings delete secure backup_local_transport_parameters >/dev/null 2>&1 || true
  if [[ -n "$original_transport" ]]; then
    adb_cmd shell bmgr transport "$original_transport" >/dev/null 2>&1 || true
  fi
  if (( exit_status == 0 && retained_cleanup_status != 0 )); then
    cat "$ARTIFACT_DIR/retained-apk-cleanup.txt" >&2
    echo "Unable to remove the retained exact-head APK during cleanup." >&2
    exit_status=1
  fi
  exit "$exit_status"
}
trap cleanup EXIT

prepare_retained_apk_install_source
install_retained_apk
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
  echo "apk-provenance=host-sha256+retained-device-size+installed-device-size+device-cmp"
  echo "retained-install-source=$RETAINED_APK_PATH"
  echo "transport=$LOCAL_TRANSPORT"
  echo "exact-commands=./gradlew :app:testDebugUnitTest --tests com.chessticize.mobile.backup.ProgressBackupPolicyTest --no-daemon; apps/mobile/scripts/android-progress-backup-policy-evidence.sh"
  echo "validation-scope=targeted native Android full-backup capability and allowlist policy"
  echo "scope-rationale=API24 requires one pre-transport-flags fail-closed decision, exactly one legacy package rejection and successful overall result, no payload log, and no archive; API30 proves shared agent mask 0 fails closed with no payload and a real inherited restore admits only the v28 path-only allowlist; API36 mask 0 requires exactly one fail-closed policy/result invocation, selected masks 1,2,3 tolerate only repeated-identical preflight groups, and device/inode identity collapses raw path aliases only after recording every alias and proving one canonical archive target"
  echo "artifact-name=android-progress-backup-policy-api-$SDK_LEVEL"
  echo "artifact-identifier=run-${GITHUB_RUN_ID:-local}/android-progress-backup-policy-api-$SDK_LEVEL"
  echo "artifact-url=${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-local/repository}/actions/runs/${GITHUB_RUN_ID:-local}#artifacts"
  echo "aosp-api30-localtransport-parameters=$AOSP_API30_PARAMETERS_URL"
  echo "aosp-api36-localtransport-parameters=$AOSP_API36_PARAMETERS_URL"
  echo "fixture=canonical-database-files+credential-and-device-root-files-sharedpref-database-traps"
} > "$ARTIFACT_DIR/context.txt"

if (( SDK_LEVEL == 24 )); then
  run_case pre-flags-api 'non_incremental_only=false' unavailable false 0 no-archive \
    fail-closed-legacy-transport-rejection
elif (( SDK_LEVEL == 30 )); then
  run_case no-capability 'non_incremental_only=false' 0 false 0 no-archive \
    fail-closed-transport-rejection
  apps/mobile/scripts/android-progress-backup-api30-restore-evidence.sh
else
  run_case neither 'is_encrypted=false,is_device_transfer=false,log_agent_results=true' \
    0 false 0 no-archive \
    fail-closed-transport-rejection
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
