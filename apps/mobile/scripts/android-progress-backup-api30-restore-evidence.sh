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
ARTIFACT_DIR="$ARTIFACT_ROOT/api-30"
API36_SOURCE_DIR="${ANDROID_BACKUP_API36_SOURCE_DIR:-$ARTIFACT_ROOT/api-36-source}"
DEVICE_ROOT="/data/user_de/0/$APP_ID"
ADB_OPERATION_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_ADB_TIMEOUT_SECONDS:-120}"
ADB_CLEANUP_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_CLEANUP_ADB_TIMEOUT_SECONDS:-10}"
AOSP_ANDROID11_TAR_BACKUP_READER_URL="https://android.googlesource.com/platform/frameworks/base/+/android11-release/services/backup/java/com/android/server/backup/utils/TarBackupReader.java"

if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "Set ADB_PATH, ANDROID_HOME, or ANDROID_SDK_ROOT to an executable adb." >&2
  exit 69
fi
if [[ ! -f "$APK" ]]; then
  echo "Android policy evidence APK does not exist: $APK" >&2
  exit 66
fi

mkdir -p "$ARTIFACT_DIR"

adb_cmd() {
  local diagnostic_file
  local status=0

  if timeout --foreground "${ADB_OPERATION_TIMEOUT_SECONDS}s" \
      "$ADB" -s "$DEVICE" "$@"; then
    return 0
  else
    status=$?
  fi
  if (( status == 124 || status == 137 )); then
    diagnostic_file="$ARTIFACT_DIR/adb-timeout-diagnostic-$(date -u +%Y%m%dT%H%M%S%N)-$$.txt"
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

fail() {
  echo "$1" >&2
  exit 1
}

read_strict_size_artifact() {
  local artifact="$1"
  local label="$2"
  local line

  if [[ ! -s "$artifact" || "$(awk 'END { print NR + 0 }' "$artifact")" != "1" ]]; then
    fail "$label must contain exactly one nonempty size line: $artifact"
  fi
  line="$(sed -n '1p' "$artifact")"
  if [[ ! "$line" =~ ^[1-9][0-9]*$ ]]; then
    fail "$label contains a malformed size: ${line:-<empty>}"
  fi
  printf '%s' "$line"
}

read_strict_sha256_artifact() {
  local artifact="$1"
  local label="$2"
  local line

  if [[ ! -s "$artifact" || "$(awk 'END { print NR + 0 }' "$artifact")" != "1" ]]; then
    fail "$label must contain exactly one nonempty SHA-256 line: $artifact"
  fi
  line="$(sed -n '1p' "$artifact")"
  if [[ ! "$line" =~ ^([0-9a-f]{64})[[:space:]]+[^[:space:]].*$ ]]; then
    fail "$label contains a malformed SHA-256 record: ${line:-<empty>}"
  fi
  printf '%s' "${BASH_REMATCH[1]}"
}

validate_apk_cmp_artifact() {
  local artifact="$1"
  local expected_size="$2"
  local label="$3"

  if [[ ! "$expected_size" =~ ^[1-9][0-9]*$ \
      || ! -s "$artifact" \
      || "$(awk 'END { print NR + 0 }' "$artifact")" != "6" ]]; then
    fail "$label does not contain a strict six-line APK comparison record: $artifact"
  fi
  grep -Fx 'source-path=/data/local/tmp/chessticize-exact-head.apk' "$artifact" >/dev/null \
    || fail "$label retained APK comparison source path is invalid."
  grep -E '^installed-path=/[A-Za-z0-9._/~=-]+/base\.apk$' "$artifact" >/dev/null \
    || fail "$label installed APK comparison path is invalid."
  grep -Fx "source-size=$expected_size" "$artifact" >/dev/null \
    || fail "$label retained APK comparison size is invalid."
  grep -Fx "installed-size=$expected_size" "$artifact" >/dev/null \
    || fail "$label installed APK comparison size is invalid."
  grep -Fx 'device-status=0' "$artifact" >/dev/null \
    || fail "$label APK comparison status is invalid."
  grep -Fx 'result=identical' "$artifact" >/dev/null \
    || fail "$label APK comparison result is invalid."
}

find_transport_archive_parent() {
  local candidates=(
    "/data/data/com.android.localtransport/files/1/_full"
    "/data/user/0/com.android.localtransport/files/1/_full"
    "/data/user_de/0/com.android.localtransport/files/1/_full"
    "/cache/backup/1/_full"
  )
  find_existing_device_paths directory "${candidates[@]}"
}

stream_device_sha256() {
  local path="$1"
  local artifact="$2"

  if ! adb_cmd exec-out run-as "$APP_ID" cat "$path" | sha256sum > "$artifact"; then
    fail "Unable to stream restored file for host-side SHA-256 evidence: $path"
  fi
}

assert_package_stopped_without_process() {
  local package_state="$ARTIFACT_DIR/api30-restore-package-state-after-clear.txt"
  local process_state="$ARTIFACT_DIR/api30-restore-process-after-clear.txt"
  local process_output
  local user_state

  adb_cmd shell dumpsys package "$APP_ID" > "$package_state"
  user_state="$(grep -E 'User 0:.*stopped=' "$package_state" | head -n 1 || true)"
  if [[ -z "$user_state" || ! "$user_state" =~ (^|[[:space:]])stopped=true([[:space:]]|$) ]]; then
    fail "API 30 restore fixture package is not stopped after pm clear."
  fi
  if ! process_output="$(read_app_process_ids)"; then
    fail "API 30 restore fixture process absence could not be inspected."
  fi
  printf '%s\n' "${process_output:-absent}" > "$process_state"
  if [[ -n "$process_output" ]]; then
    fail "API 30 restore fixture process started before bmgr restore."
  fi
}

POSITIVE_ARCHIVE_ENTRIES=(
  "apps/$APP_ID/db/chessticize-mobile.sqlite"
  "apps/$APP_ID/db/chessticize-mobile.sqlite-journal"
  "apps/$APP_ID/db/chessticize-mobile.sqlite-wal"
)
POSITIVE_DEVICE_PATHS=(
  "databases/chessticize-mobile.sqlite"
  "databases/chessticize-mobile.sqlite-journal"
  "databases/chessticize-mobile.sqlite-wal"
)
POSITIVE_MARKERS=(
  "api30-restore-main-database-positive"
  "api30-restore-journal-positive"
  "api30-restore-wal-positive"
)

NEGATIVE_ARCHIVE_ENTRIES=(
  "apps/$APP_ID/db/chessticize-mobile.sqlite-journal-journal"
  "apps/$APP_ID/db/chessticize-mobile.sqlite-journal-wal"
  "apps/$APP_ID/db/chessticize-mobile.sqlite-wal-journal"
  "apps/$APP_ID/db/chessticize-mobile.sqlite-wal-wal"
  "apps/$APP_ID/db/chessticize-mobile.sqlite-shm"
  "apps/$APP_ID/db/other-progress.sqlite"
  "apps/$APP_ID/r/credential-root-trap.bin"
  "apps/$APP_ID/f/credential-file-trap.bin"
  "apps/$APP_ID/sp/credential-sharedpref-trap.xml"
  "apps/$APP_ID/db/credential-database-trap.bin"
  "apps/$APP_ID/d_r/device-root-trap.bin"
  "apps/$APP_ID/d_f/device-file-trap.bin"
  "apps/$APP_ID/d_sp/device-sharedpref-trap.xml"
  "apps/$APP_ID/d_db/device-database-trap.bin"
)
NEGATIVE_DEVICE_PATHS=(
  "databases/chessticize-mobile.sqlite-journal-journal"
  "databases/chessticize-mobile.sqlite-journal-wal"
  "databases/chessticize-mobile.sqlite-wal-journal"
  "databases/chessticize-mobile.sqlite-wal-wal"
  "databases/chessticize-mobile.sqlite-shm"
  "databases/other-progress.sqlite"
  "credential-root-trap.bin"
  "files/credential-file-trap.bin"
  "shared_prefs/credential-sharedpref-trap.xml"
  "databases/credential-database-trap.bin"
  "$DEVICE_ROOT/device-root-trap.bin"
  "$DEVICE_ROOT/files/device-file-trap.bin"
  "$DEVICE_ROOT/shared_prefs/device-sharedpref-trap.xml"
  "$DEVICE_ROOT/databases/device-database-trap.bin"
)
NEGATIVE_MARKERS=(
  "api30-reject-recursive-journal-journal"
  "api30-reject-cross-journal-wal"
  "api30-reject-cross-wal-journal"
  "api30-reject-recursive-wal-wal"
  "api30-reject-derived-shm"
  "api30-reject-other-database"
  "api30-reject-credential-root"
  "api30-reject-credential-file"
  "api30-reject-credential-sharedpref"
  "api30-reject-credential-database"
  "api30-reject-device-root"
  "api30-reject-device-file"
  "api30-reject-device-sharedpref"
  "api30-reject-device-database"
)

if (( ${#POSITIVE_ARCHIVE_ENTRIES[@]} != ${#POSITIVE_DEVICE_PATHS[@]} \
    || ${#POSITIVE_ARCHIVE_ENTRIES[@]} != ${#POSITIVE_MARKERS[@]} \
    || ${#NEGATIVE_ARCHIVE_ENTRIES[@]} != ${#NEGATIVE_DEVICE_PATHS[@]} \
    || ${#NEGATIVE_ARCHIVE_ENTRIES[@]} != ${#NEGATIVE_MARKERS[@]} )); then
  fail "API 30 restore evidence entry, device-path, and marker arrays differ in length."
fi

SDK_LEVEL="$(adb_cmd shell getprop ro.build.version.sdk | tr -d '\r')"
printf '%s\n' "$SDK_LEVEL" > "$ARTIFACT_DIR/api30-restore-sdk.txt"
if [[ "$SDK_LEVEL" != "30" ]]; then
  fail "API 30 inherited restore evidence requires API 30; found API $SDK_LEVEL."
fi

GITHUB_SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
git -C "$REPO_ROOT" status --porcelain --untracked-files=no \
  > "$ARTIFACT_DIR/api30-restore-tracked-worktree-before.txt"
if [[ -s "$ARTIFACT_DIR/api30-restore-tracked-worktree-before.txt" ]]; then
  fail "Tracked worktree was not clean before API 30 inherited restore evidence."
fi
if [[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" != "$GITHUB_SHA" ]]; then
  fail "Checked-out commit does not match exact head $GITHUB_SHA."
fi

stat -c %s "$APK" > "$ARTIFACT_DIR/api30-restore-workflow-apk-size.txt"
sha256sum "$APK" > "$ARTIFACT_DIR/api30-restore-workflow-apk-sha256.txt"
if [[ ! -s "$ARTIFACT_DIR/retained-install-source-apk-size.txt" \
    || ! -s "$ARTIFACT_DIR/installed-apk-size.txt" \
    || ! -s "$ARTIFACT_DIR/installed-apk-sha256.txt" \
    || ! -s "$ARTIFACT_DIR/installed-apk-cmp.txt" ]]; then
  fail "Installed APK provenance is missing before API 30 inherited restore evidence."
fi
current_workflow_apk_size="$(read_strict_size_artifact \
  "$ARTIFACT_DIR/api30-restore-workflow-apk-size.txt" "API 30 workflow APK")"
current_retained_apk_size="$(read_strict_size_artifact \
  "$ARTIFACT_DIR/retained-install-source-apk-size.txt" "API 30 retained APK")"
current_installed_apk_size="$(read_strict_size_artifact \
  "$ARTIFACT_DIR/installed-apk-size.txt" "API 30 installed APK")"
current_workflow_apk_hash="$(read_strict_sha256_artifact \
  "$ARTIFACT_DIR/api30-restore-workflow-apk-sha256.txt" "API 30 workflow APK")"
current_installed_apk_hash="$(read_strict_sha256_artifact \
  "$ARTIFACT_DIR/installed-apk-sha256.txt" "API 30 installed APK")"
if [[ ! "$current_workflow_apk_size" =~ ^[1-9][0-9]*$ \
    || "$current_retained_apk_size" != "$current_workflow_apk_size" \
    || "$current_installed_apk_size" != "$current_workflow_apk_size" \
    || ! "$current_workflow_apk_hash" =~ ^[0-9a-f]{64}$ \
    || "$current_installed_apk_hash" != "$current_workflow_apk_hash" ]]; then
  fail "Installed API 30 APK does not match the exact-head workflow artifact."
fi
validate_apk_cmp_artifact "$ARTIFACT_DIR/installed-apk-cmp.txt" \
  "$current_workflow_apk_size" "API 30"

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/chessticize-api30-restore.XXXXXX")"
staging_root="$temp_root/staging"
device_archive="/data/local/tmp/chessticize-api30-restore.tar"
original_xml_log_level="$(adb_cmd shell getprop log.tag.BackupXmlParserLogging | tr -d '\r')"

cleanup() {
  rm -rf "$temp_root"
  ADB_OPERATION_TIMEOUT_SECONDS="$ADB_CLEANUP_TIMEOUT_SECONDS"
  adb_cmd shell rm -f "$device_archive" >/dev/null 2>&1 || true
  adb_cmd shell setprop log.tag.BackupXmlParserLogging "$original_xml_log_level" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

required_source_files=(
  context.txt
  tracked-worktree-before.txt
  tracked-worktree-after.txt
  retained-install-source-apk-path.txt
  retained-install-source-apk-size.txt
  retained-apk-push.txt
  retained-apk-install.txt
  workflow-artifact-apk-size.txt
  installed-apk-size.txt
  workflow-artifact-apk-sha256.txt
  installed-apk-sha256.txt
  installed-apk-cmp.txt
  installed-package.txt
  neither-unique-policy-events.txt
  neither-unique-result-events.txt
  encryption-only-unique-policy-events.txt
  encryption-only-unique-result-events.txt
  d2d-only-unique-policy-events.txt
  d2d-only-unique-result-events.txt
  both-unique-policy-events.txt
  both-unique-result-events.txt
  both-transport-archive.tar
  both-transport-archive-sha256.txt
  both-transport-archive-entries.txt
  both-app-data-archive-entries.txt
)
for source_name in "${required_source_files[@]}"; do
  if [[ ! -f "$API36_SOURCE_DIR/$source_name" ]]; then
    fail "API 36 source evidence is missing: $API36_SOURCE_DIR/$source_name"
  fi
done
if [[ -s "$API36_SOURCE_DIR/tracked-worktree-before.txt" \
    || -s "$API36_SOURCE_DIR/tracked-worktree-after.txt" ]]; then
  fail "API 36 archive evidence did not come from a clean tracked worktree."
fi
grep -Fx 'api-level=36' "$API36_SOURCE_DIR/context.txt"
grep -Fx "commit-sha=$GITHUB_SHA" "$API36_SOURCE_DIR/context.txt"
grep -Fx 'result=pass' "$API36_SOURCE_DIR/context.txt"
grep -Fx \
  "artifact-identifier=run-${GITHUB_RUN_ID:-local}/android-progress-backup-policy-api-36" \
  "$API36_SOURCE_DIR/context.txt"
grep -Fx 'apk-provenance=host-sha256+retained-device-size+installed-device-size+device-cmp' \
  "$API36_SOURCE_DIR/context.txt"
grep -Fx 'retained-install-source=/data/local/tmp/chessticize-exact-head.apk' \
  "$API36_SOURCE_DIR/context.txt"
grep -Fx '/data/local/tmp/chessticize-exact-head.apk' \
  "$API36_SOURCE_DIR/retained-install-source-apk-path.txt"
grep -Fx 'Success' "$API36_SOURCE_DIR/retained-apk-install.txt"
grep -E '^case=neither delivered-mask=0 selected=false emitted=0 agent-invocations=[1-9][0-9]* payload=none framework-result=success result=pass$' \
  "$API36_SOURCE_DIR/context.txt"
grep -E '^case=encryption-only delivered-mask=1 selected=true emitted=3 agent-invocations=[1-9][0-9]* payload=exact-progress-files framework-result=success result=pass$' \
  "$API36_SOURCE_DIR/context.txt"
grep -E '^case=d2d-only delivered-mask=2 selected=true emitted=3 agent-invocations=[1-9][0-9]* payload=exact-progress-files framework-result=success result=pass$' \
  "$API36_SOURCE_DIR/context.txt"
grep -E '^case=both delivered-mask=3 selected=true emitted=3 agent-invocations=[1-9][0-9]* payload=exact-progress-files framework-result=success result=pass$' \
  "$API36_SOURCE_DIR/context.txt"
grep -Fx 'event=policy sdk=36 transportFlags=0 encryption=false d2d=false selected=false' \
  "$API36_SOURCE_DIR/neither-unique-policy-events.txt"
grep -Fx 'event=result selected=false emitted=0' \
  "$API36_SOURCE_DIR/neither-unique-result-events.txt"
grep -Fx 'event=policy sdk=36 transportFlags=1 encryption=true d2d=false selected=true' \
  "$API36_SOURCE_DIR/encryption-only-unique-policy-events.txt"
grep -Fx 'event=result selected=true emitted=3' \
  "$API36_SOURCE_DIR/encryption-only-unique-result-events.txt"
grep -Fx 'event=policy sdk=36 transportFlags=2 encryption=false d2d=true selected=true' \
  "$API36_SOURCE_DIR/d2d-only-unique-policy-events.txt"
grep -Fx 'event=result selected=true emitted=3' \
  "$API36_SOURCE_DIR/d2d-only-unique-result-events.txt"
grep -Fx 'event=policy sdk=36 transportFlags=3 encryption=true d2d=true selected=true' \
  "$API36_SOURCE_DIR/both-unique-policy-events.txt"
grep -Fx 'event=result selected=true emitted=3' \
  "$API36_SOURCE_DIR/both-unique-result-events.txt"
for unique_source_file in \
    neither-unique-policy-events.txt \
    neither-unique-result-events.txt \
    encryption-only-unique-policy-events.txt \
    encryption-only-unique-result-events.txt \
    d2d-only-unique-policy-events.txt \
    d2d-only-unique-result-events.txt \
    both-unique-policy-events.txt \
    both-unique-result-events.txt; do
  if [[ "$(wc -l < "$API36_SOURCE_DIR/$unique_source_file" | tr -d ' ')" != "1" ]]; then
    fail "API 36 source mask evidence is not unique: $unique_source_file"
  fi
done

current_workflow_apk_size="$(read_strict_size_artifact \
  "$ARTIFACT_DIR/api30-restore-workflow-apk-size.txt" "API 30 workflow APK")"
current_retained_apk_size="$(read_strict_size_artifact \
  "$ARTIFACT_DIR/retained-install-source-apk-size.txt" "API 30 retained APK")"
current_installed_apk_size="$(read_strict_size_artifact \
  "$ARTIFACT_DIR/installed-apk-size.txt" "API 30 installed APK")"
source_workflow_apk_size="$(read_strict_size_artifact \
  "$API36_SOURCE_DIR/workflow-artifact-apk-size.txt" "API 36 workflow APK")"
source_retained_apk_size="$(read_strict_size_artifact \
  "$API36_SOURCE_DIR/retained-install-source-apk-size.txt" "API 36 retained APK")"
source_installed_apk_size="$(read_strict_size_artifact \
  "$API36_SOURCE_DIR/installed-apk-size.txt" "API 36 installed APK")"
current_workflow_apk_hash="$(read_strict_sha256_artifact \
  "$ARTIFACT_DIR/api30-restore-workflow-apk-sha256.txt" "API 30 workflow APK")"
current_installed_apk_hash="$(read_strict_sha256_artifact \
  "$ARTIFACT_DIR/installed-apk-sha256.txt" "API 30 installed APK")"
source_workflow_apk_hash="$(read_strict_sha256_artifact \
  "$API36_SOURCE_DIR/workflow-artifact-apk-sha256.txt" "API 36 workflow APK")"
source_installed_apk_hash="$(read_strict_sha256_artifact \
  "$API36_SOURCE_DIR/installed-apk-sha256.txt" "API 36 installed APK")"
if [[ ! "$current_workflow_apk_size" =~ ^[1-9][0-9]*$ \
    || "$current_retained_apk_size" != "$current_workflow_apk_size" \
    || "$current_installed_apk_size" != "$current_workflow_apk_size" \
    || "$source_workflow_apk_size" != "$current_workflow_apk_size" \
    || "$source_retained_apk_size" != "$current_workflow_apk_size" \
    || "$source_installed_apk_size" != "$current_workflow_apk_size" \
    || ! "$current_workflow_apk_hash" =~ ^[0-9a-f]{64}$ \
    || "$current_installed_apk_hash" != "$current_workflow_apk_hash" \
    || "$source_workflow_apk_hash" != "$current_workflow_apk_hash" \
    || "$source_installed_apk_hash" != "$current_workflow_apk_hash" ]]; then
  fail "API 36 archive producer and API 30 restore consumer did not use the same exact-head APK."
fi
validate_apk_cmp_artifact "$ARTIFACT_DIR/installed-apk-cmp.txt" \
  "$current_workflow_apk_size" "API 30"
validate_apk_cmp_artifact "$API36_SOURCE_DIR/installed-apk-cmp.txt" \
  "$source_workflow_apk_size" "API 36"

source_archive="$API36_SOURCE_DIR/both-transport-archive.tar"
source_archive_copy="$ARTIFACT_DIR/api30-restore-os-source-archive.tar"
base_archive="$ARTIFACT_DIR/api30-restore-base-archive.tar"
constructed_archive="$ARTIFACT_DIR/api30-restore-archive.tar"
if [[ ! -s "$source_archive" ]]; then
  fail "API 36 OS-produced source archive is empty."
fi
cp "$source_archive" "$source_archive_copy"
source_archive_hash="$(sha256sum "$source_archive" | cut -d ' ' -f 1)"
recorded_source_archive_hash="$(cut -d ' ' -f 1 "$API36_SOURCE_DIR/both-transport-archive-sha256.txt")"
if [[ "$source_archive_hash" != "$recorded_source_archive_hash" ]]; then
  fail "API 36 source archive SHA-256 does not match its producer evidence."
fi
sha256sum "$source_archive_copy" > "$ARTIFACT_DIR/api30-restore-os-source-archive-sha256.txt"

source_entries="$ARTIFACT_DIR/api30-restore-os-source-archive-entries.txt"
source_app_entries="$ARTIFACT_DIR/api30-restore-os-source-app-entries.txt"
source_data_entries="$ARTIFACT_DIR/api30-restore-os-source-data-entries.txt"
source_metadata_entries="$ARTIFACT_DIR/api30-restore-os-source-metadata-entries.txt"
tar -tf "$source_archive" > "$source_entries"
sort "$source_entries" > "$ARTIFACT_DIR/api30-restore-os-source-sorted-archive-entries.txt"
diff -u "$API36_SOURCE_DIR/both-transport-archive-entries.txt" \
  "$ARTIFACT_DIR/api30-restore-os-source-sorted-archive-entries.txt"
grep -E "^apps/$APP_ID/" "$source_entries" > "$source_app_entries" || true
grep -E "^apps/$APP_ID/_(manifest|meta)$" "$source_entries" \
  > "$source_metadata_entries" || true
grep -E "^apps/$APP_ID/" "$source_entries" \
  | grep -Ev "^apps/$APP_ID/_(manifest|meta)$" \
  > "$source_data_entries" || true
first_app_entry="$(sed -n '1p' "$source_app_entries")"
manifest_entry="apps/$APP_ID/_manifest"
if [[ "$first_app_entry" != "$manifest_entry" \
    || "$(grep -Fxc "$manifest_entry" "$source_entries")" != "1" ]]; then
  fail "The exact-head Android _manifest is not the first unique app archive entry."
fi
printf '%s\n' \
  "apps/$APP_ID/db/chessticize-mobile.sqlite" \
  "apps/$APP_ID/db/chessticize-mobile.sqlite-journal" \
  "apps/$APP_ID/db/chessticize-mobile.sqlite-wal" \
  | sort > "$ARTIFACT_DIR/api30-restore-os-source-expected-data-entries.txt"
sort "$source_data_entries" > "$ARTIFACT_DIR/api30-restore-os-source-sorted-data-entries.txt"
diff -u "$ARTIFACT_DIR/api30-restore-os-source-expected-data-entries.txt" \
  "$ARTIFACT_DIR/api30-restore-os-source-sorted-data-entries.txt"
diff -u "$API36_SOURCE_DIR/both-app-data-archive-entries.txt" \
  "$ARTIFACT_DIR/api30-restore-os-source-sorted-data-entries.txt"

source_manifest="$ARTIFACT_DIR/api30-restore-os-source-manifest.bin"
base_manifest="$ARTIFACT_DIR/api30-restore-base-manifest.bin"
final_manifest="$ARTIFACT_DIR/api30-restore-final-manifest.bin"
tar -xOf "$source_archive" "$manifest_entry" > "$source_manifest"
if [[ ! -s "$source_manifest" ]]; then
  fail "The OS-produced exact-head Android restore manifest is empty."
fi
sha256sum "$source_manifest" > "$ARTIFACT_DIR/api30-restore-os-source-manifest-sha256.txt"
mapfile -t manifest_lines < "$source_manifest"
manifest_version="${manifest_lines[0]:-}"
manifest_package="${manifest_lines[1]:-}"
manifest_app_version="${manifest_lines[2]:-}"
manifest_platform_version="${manifest_lines[3]:-}"
manifest_has_apk="${manifest_lines[5]:-}"
manifest_signature_count="${manifest_lines[6]:-}"
if [[ "$manifest_version" != "1" || "$manifest_package" != "$APP_ID" \
    || ! "$manifest_app_version" =~ ^[1-9][0-9]*$ \
    || "$manifest_platform_version" != "36" \
    || "$manifest_has_apk" != "0" \
    || ! "$manifest_signature_count" =~ ^[1-9][0-9]*$ ]]; then
  fail "API 36 OS manifest header does not match the exact package and expected full-backup format."
fi
if (( ${#manifest_lines[@]} != 7 + manifest_signature_count )); then
  fail "API 36 OS manifest signature count does not match its signature entries."
fi
for (( signature_index = 0; signature_index < manifest_signature_count; signature_index++ )); do
  manifest_signature="${manifest_lines[$((7 + signature_index))]}"
  if [[ ! "$manifest_signature" =~ ^[0-9A-Fa-f]+$ ]]; then
    fail "API 36 OS manifest contains an invalid signing-certificate digest."
  fi
done
grep -E "versionCode=$manifest_app_version([[:space:]]|$)" \
  "$API36_SOURCE_DIR/installed-package.txt"
grep -E "versionCode=$manifest_app_version([[:space:]]|$)" \
  "$ARTIFACT_DIR/installed-package.txt"

meta_entry="apps/$APP_ID/_meta"
meta_count="$(grep -Fxc "$meta_entry" "$source_entries" || true)"
if (( meta_count > 1 )); then
  fail "The API 36 OS-produced archive contains duplicate _meta entries."
fi
source_meta="$ARTIFACT_DIR/api30-restore-os-source-meta.bin"
base_meta="$ARTIFACT_DIR/api30-restore-base-meta.bin"
final_meta="$ARTIFACT_DIR/api30-restore-final-meta.bin"
if (( meta_count == 1 )); then
  tar -xOf "$source_archive" "$meta_entry" > "$source_meta"
  if [[ ! -s "$source_meta" ]]; then
    fail "The OS-produced exact-head Android restore metadata entry is empty."
  fi
  sha256sum "$source_meta" > "$ARTIFACT_DIR/api30-restore-os-source-meta-sha256.txt"
fi

{
  echo "source-api-level=36"
  echo "source-run-id=${GITHUB_RUN_ID:-local}"
  echo "source-commit-sha=$GITHUB_SHA"
  echo "source-workflow-apk-size=$source_workflow_apk_size"
  echo "source-retained-apk-size=$source_retained_apk_size"
  echo "source-installed-apk-size=$source_installed_apk_size"
  echo "source-workflow-apk-sha256=$source_workflow_apk_hash"
  echo "source-installed-apk-sha256=$source_installed_apk_hash"
  echo "source-archive-sha256=$source_archive_hash"
  echo "source-manifest-version=$manifest_version"
  echo "source-manifest-package=$manifest_package"
  echo "source-manifest-app-version=$manifest_app_version"
  echo "source-platform-version=36"
  echo "source-manifest-signature-count=$manifest_signature_count"
  echo "source-case=both-capabilities-real-mask-3"
  echo "source-artifact=android-progress-backup-policy-api-36"
  echo "android11-tar-backup-reader=$AOSP_ANDROID11_TAR_BACKUP_READER_URL"
} > "$ARTIFACT_DIR/api30-restore-source-provenance.txt"

cp "$source_archive" "$base_archive"
mapfile -t source_data_entry_array < "$source_data_entries"
if (( ${#source_data_entry_array[@]} == 0 )); then
  fail "The API 36 OS archive supplied no app-data entries to strip."
fi
tar --delete --file "$base_archive" "${source_data_entry_array[@]}"
base_entries="$ARTIFACT_DIR/api30-restore-stripped-archive-entries.txt"
base_app_entries="$ARTIFACT_DIR/api30-restore-base-app-entries.txt"
base_metadata_entries="$ARTIFACT_DIR/api30-restore-base-metadata-entries.txt"
tar -tf "$base_archive" > "$base_entries"
grep -E "^apps/$APP_ID/" "$base_entries" > "$base_app_entries" || true
grep -E "^apps/$APP_ID/_(manifest|meta)$" "$base_entries" \
  > "$base_metadata_entries" || true
if grep -E "^apps/$APP_ID/($APP_DATA_DOMAINS)/" "$base_entries" >/dev/null; then
  fail "Stripped API 30 archive still contains app-data entries."
fi
cmp -s "$base_app_entries" "$base_metadata_entries" \
  || fail "Stripped archive retained app entries beyond the OS manifest and metadata."
cmp -s "$source_metadata_entries" "$base_metadata_entries" \
  || fail "Manifest/metadata order changed while stripping OS-produced data."
tar -xOf "$base_archive" "$manifest_entry" > "$base_manifest"
cmp -s "$source_manifest" "$base_manifest" \
  || fail "Android restore manifest bytes changed while stripping OS-produced data."
sha256sum "$base_manifest" > "$ARTIFACT_DIR/api30-restore-base-manifest-sha256.txt"
if (( meta_count == 1 )); then
  tar -xOf "$base_archive" "$meta_entry" > "$base_meta"
  cmp -s "$source_meta" "$base_meta" \
    || fail "Android restore metadata bytes changed while stripping OS-produced data."
  sha256sum "$base_meta" > "$ARTIFACT_DIR/api30-restore-base-meta-sha256.txt"
fi
sha256sum "$base_archive" > "$ARTIFACT_DIR/api30-restore-base-archive-sha256.txt"

mkdir -p "$staging_root"
ALL_ARCHIVE_ENTRIES=("${POSITIVE_ARCHIVE_ENTRIES[@]}" "${NEGATIVE_ARCHIVE_ENTRIES[@]}")
ALL_MARKERS=("${POSITIVE_MARKERS[@]}" "${NEGATIVE_MARKERS[@]}")
: > "$ARTIFACT_DIR/api30-restore-source-entry-sha256.txt"
for index in "${!ALL_ARCHIVE_ENTRIES[@]}"; do
  entry="${ALL_ARCHIVE_ENTRIES[$index]}"
  marker="${ALL_MARKERS[$index]}"
  mkdir -p "$(dirname "$staging_root/$entry")"
  printf '%s' "$marker" > "$staging_root/$entry"
  if [[ ! -s "$staging_root/$entry" ]]; then
    fail "API 30 restore marker is empty: $entry"
  fi
  marker_hash="$(sha256sum "$staging_root/$entry" | cut -d ' ' -f 1)"
  printf '%s %s\n' "$marker_hash" "$entry" \
    >> "$ARTIFACT_DIR/api30-restore-source-entry-sha256.txt"
done
if [[ "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/api30-restore-source-entry-sha256.txt" \
    | sort -u | wc -l | tr -d ' ')" != "${#ALL_ARCHIVE_ENTRIES[@]}" ]]; then
  fail "API 30 restore evidence markers must be unique and nonempty."
fi

cp "$base_archive" "$constructed_archive"
tar --append --file "$constructed_archive" --numeric-owner \
  --owner=0 --group=0 --mode=0600 --mtime=@0 --no-recursion \
  -C "$staging_root" "${ALL_ARCHIVE_ENTRIES[@]}"

final_entries="$ARTIFACT_DIR/api30-restore-archive-entries.txt"
expected_final_entries="$ARTIFACT_DIR/api30-restore-expected-archive-entries.txt"
final_metadata_entries="$ARTIFACT_DIR/api30-restore-final-metadata-entries.txt"
tar -tf "$constructed_archive" > "$final_entries"
cp "$base_entries" "$expected_final_entries"
printf '%s\n' "${ALL_ARCHIVE_ENTRIES[@]}" >> "$expected_final_entries"
diff -u "$expected_final_entries" "$final_entries"
grep -E "^apps/$APP_ID/_(manifest|meta)$" "$final_entries" > "$final_metadata_entries" || true
cmp -s "$base_metadata_entries" "$final_metadata_entries" \
  || fail "Android manifest/metadata archive order changed during tar append."
if [[ "$(grep -E "^apps/$APP_ID/" "$final_entries" | head -n 1)" != "$manifest_entry" ]]; then
  fail "Android _manifest is no longer the first app entry after tar append."
fi

tar -xOf "$constructed_archive" "$manifest_entry" > "$final_manifest"
cmp -s "$base_manifest" "$final_manifest" \
  || fail "Android restore manifest bytes changed during tar append."
sha256sum "$final_manifest" > "$ARTIFACT_DIR/api30-restore-final-manifest-sha256.txt"
if (( meta_count == 1 )); then
  tar -xOf "$constructed_archive" "$meta_entry" > "$final_meta"
  cmp -s "$base_meta" "$final_meta" \
    || fail "Android restore metadata bytes changed during tar append."
  sha256sum "$final_meta" > "$ARTIFACT_DIR/api30-restore-final-meta-sha256.txt"
fi

: > "$ARTIFACT_DIR/api30-restore-final-entry-sha256.txt"
for entry in "${ALL_ARCHIVE_ENTRIES[@]}"; do
  if [[ "$(grep -Fxc "$entry" "$final_entries")" != "1" ]]; then
    fail "API 30 constructed archive entry is missing or duplicated: $entry"
  fi
  extracted="$temp_root/extracted-$(printf '%s' "$entry" | tr '/.' '__')"
  tar -xOf "$constructed_archive" "$entry" > "$extracted"
  if [[ ! -s "$extracted" ]] || ! cmp -s "$staging_root/$entry" "$extracted"; then
    fail "API 30 constructed archive entry changed or became empty: $entry"
  fi
  extracted_hash="$(sha256sum "$extracted" | cut -d ' ' -f 1)"
  printf '%s %s\n' "$extracted_hash" "$entry" \
    >> "$ARTIFACT_DIR/api30-restore-final-entry-sha256.txt"
done
sha256sum "$constructed_archive" > "$ARTIFACT_DIR/api30-restore-archive-sha256.txt"

archive_parent_paths="$ARTIFACT_DIR/api30-restore-base-archive-parent-paths.txt"
if ! find_transport_archive_parent > "$archive_parent_paths"; then
  fail "Unable to inspect API 30 LocalTransport full-backup archive parents."
fi
if [[ "$(wc -l < "$archive_parent_paths" | tr -d ' ')" != "1" ]]; then
  fail "Expected one initialized API 30 LocalTransport full-backup archive parent."
fi
archive_parent="$(cat "$archive_parent_paths")"
archive_path="$archive_parent/$APP_ID"
archive_uid="$(adb_cmd shell stat -c %u "$archive_parent" | tr -d '\r')"
archive_gid="$(adb_cmd shell stat -c %g "$archive_parent" | tr -d '\r')"
archive_mode="600"
adb_cmd shell ls -Zd "$archive_parent" \
  | tr -d '\r' > "$ARTIFACT_DIR/api30-restore-base-archive-selinux.txt"
archive_context="$(awk 'NR == 1 { print $1 }' "$ARTIFACT_DIR/api30-restore-base-archive-selinux.txt")"
if [[ ! "$archive_uid" =~ ^[0-9]+$ || ! "$archive_gid" =~ ^[0-9]+$ \
    || ! "$archive_mode" =~ ^[0-7]+$ || "$archive_context" != *:*:*:* ]]; then
  fail "Unable to prove LocalTransport archive ownership, mode, and SELinux context."
fi
printf '%s %s %s %s\n' "$archive_uid" "$archive_gid" "$archive_mode" "$archive_context" \
  > "$ARTIFACT_DIR/api30-restore-base-archive-security.txt"

adb_cmd shell pm clear "$APP_ID"
assert_package_stopped_without_process
for path in "${POSITIVE_DEVICE_PATHS[@]}" "${NEGATIVE_DEVICE_PATHS[@]}"; do
  require_device_path_state any "$path" absent "$APP_ID" \
    || fail "API 30 restore target existed after pm clear: $path"
done

adb_cmd push "$constructed_archive" "$device_archive" >/dev/null
adb_cmd shell cp "$device_archive" "$archive_path"
adb_cmd shell chown "$archive_uid:$archive_gid" "$archive_path"
adb_cmd shell chmod "$archive_mode" "$archive_path"
adb_cmd shell chcon "$archive_context" "$archive_path"
adb_cmd shell ls -Zd "$archive_path" \
  | tr -d '\r' > "$ARTIFACT_DIR/api30-restore-installed-archive-selinux.txt"
installed_context="$(awk 'NR == 1 { print $1 }' "$ARTIFACT_DIR/api30-restore-installed-archive-selinux.txt")"
if [[ "$installed_context" != "$archive_context" ]]; then
  fail "Installed LocalTransport archive SELinux context changed."
fi
if ! adb_cmd exec-out cat "$archive_path" \
    | sha256sum > "$ARTIFACT_DIR/api30-restore-installed-archive-sha256.txt"; then
  fail "Unable to stream the installed LocalTransport archive for SHA-256 evidence."
fi
if [[ "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/api30-restore-archive-sha256.txt")" \
    != "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/api30-restore-installed-archive-sha256.txt")" ]]; then
  fail "Installed LocalTransport archive does not match the constructed archive."
fi

restore_parameters='non_incremental_only=false'
adb_cmd shell settings put secure backup_local_transport_parameters "$restore_parameters"
adb_cmd shell settings get secure backup_local_transport_parameters \
  | tr -d '\r' | tee "$ARTIFACT_DIR/api30-restore-transport-parameters.txt" \
  | grep -Fx "$restore_parameters"
adb_cmd shell bmgr transport "$LOCAL_TRANSPORT" \
  | tee "$ARTIFACT_DIR/api30-restore-selected-transport.txt" | grep -F 'Selected transport'
adb_cmd shell bmgr list transports \
  > "$ARTIFACT_DIR/api30-restore-transports.txt"
grep -F "* $LOCAL_TRANSPORT" "$ARTIFACT_DIR/api30-restore-transports.txt"
adb_cmd shell bmgr list sets | tr -d '\r' \
  | tee "$ARTIFACT_DIR/api30-restore-sets.txt"
restore_token="$(awk -F ':' '
  {
    token = $1
    gsub(/[[:space:]]/, "", token)
    if (token ~ /^[0-9a-fA-F]+$/) { print token; exit }
  }
' "$ARTIFACT_DIR/api30-restore-sets.txt")"
archive_token="$(basename "$(dirname "$(dirname "$archive_path")")")"
if [[ -z "$restore_token" || "${restore_token,,}" != "${archive_token,,}" ]]; then
  fail "LocalTransport restore token does not match the installed archive token."
fi
printf '%s\n' "$restore_token" > "$ARTIFACT_DIR/api30-restore-token.txt"

adb_cmd shell setprop log.tag.BackupXmlParserLogging VERBOSE
adb_cmd logcat -c
adb_cmd shell dumpsys backup > "$ARTIFACT_DIR/api30-restore-dumpsys-backup-before.txt"
restore_status=0
adb_cmd shell bmgr restore "$restore_token" "$APP_ID" \
  | tee "$ARTIFACT_DIR/api30-restore-bmgr.txt" || restore_status=$?
adb_cmd logcat -d -v threadtime \
  > "$ARTIFACT_DIR/api30-restore-logcat.txt" || true
adb_cmd logcat -d -v threadtime \
  BackupXmlParserLogging:V BackupManagerService:V LocalTransport:V \
  FullRestoreEngine:V BackupAgent:V '*:S' \
  > "$ARTIFACT_DIR/api30-restore-parser-log.txt" || true
adb_cmd shell dumpsys backup > "$ARTIFACT_DIR/api30-restore-dumpsys-backup.txt"
if (( restore_status != 0 )); then
  fail "bmgr restore command failed with status $restore_status."
fi
grep -F 'restoreFinished: 0' "$ARTIFACT_DIR/api30-restore-bmgr.txt"
parser_observations="$ARTIFACT_DIR/api30-restore-parser-observations.txt"
: > "$parser_observations"
if grep -F 'BackupXmlParserLogging' "$ARTIFACT_DIR/api30-restore-parser-log.txt" \
    > "$parser_observations"; then
  grep -E 'fullBackupContent|include|exclude|skipp' "$parser_observations" >/dev/null \
    || fail "API 30 parser emitted logs without allowlist selection details."
fi

: > "$ARTIFACT_DIR/api30-restore-restored-positive-sha256.txt"
for index in "${!POSITIVE_DEVICE_PATHS[@]}"; do
  path="${POSITIVE_DEVICE_PATHS[$index]}"
  expected_entry="${POSITIVE_ARCHIVE_ENTRIES[$index]}"
  expected_hash="$(sha256sum "$staging_root/$expected_entry" | cut -d ' ' -f 1)"
  actual_hash_artifact="$temp_root/restored-positive-$index.sha256"
  require_device_path_state file "$path" present "$APP_ID" \
    || fail "Expected API 30 restore positive is absent: $path"
  stream_device_sha256 "$path" "$actual_hash_artifact"
  actual_hash="$(cut -d ' ' -f 1 "$actual_hash_artifact")"
  if [[ "$actual_hash" != "$expected_hash" ]]; then
    fail "Restored API 30 positive marker hash differs: $path"
  fi
  printf '%s %s\n' "$actual_hash" "$path" \
    >> "$ARTIFACT_DIR/api30-restore-restored-positive-sha256.txt"
done

: > "$ARTIFACT_DIR/api30-restore-rejected-negative-paths.txt"
for path in "${NEGATIVE_DEVICE_PATHS[@]}"; do
  require_device_path_state any "$path" absent "$APP_ID" \
    || fail "API 30 inherited restore admitted excluded path: $path"
  printf '%s\n' "$path" >> "$ARTIFACT_DIR/api30-restore-rejected-negative-paths.txt"
  negative_name="$(basename "$path")"
  if grep -F 'BackupXmlParserLogging' "$ARTIFACT_DIR/api30-restore-parser-log.txt" \
      | grep -F "$negative_name" >/dev/null; then
    grep -F 'BackupXmlParserLogging' "$ARTIFACT_DIR/api30-restore-parser-log.txt" \
      | grep -F "$negative_name" \
      | grep -Ei 'skipp|exclud|not.*(includ|specif)' >/dev/null \
      || fail "API 30 parser mentioned a negative without rejecting it: $negative_name"
  fi
done

{
  echo "api-level=30"
  echo "commit-sha=$GITHUB_SHA"
  echo "exact-apk-sha256=$(cut -d ' ' -f 1 "$ARTIFACT_DIR/api30-restore-workflow-apk-sha256.txt")"
  echo "archive-sha256=$(cut -d ' ' -f 1 "$ARTIFACT_DIR/api30-restore-archive-sha256.txt")"
  echo "transport=$LOCAL_TRANSPORT"
  echo "restore-token=$restore_token"
  echo "source-platform-version=36"
  echo "exact-commands=validate same-run exact-head API36 mask-3 OS archive; tar --delete all OS app data; tar --append deterministic domain fixtures; reset normal API30 LocalTransport parameters; bmgr restore $restore_token $APP_ID"
  echo "validation-scope=targeted native API 30 inherited fullBackupContent restore parser"
  echo "scope-rationale=Android 11 TarBackupReader parses but does not use the manifest platform-version field for restore policy; exact APK, package, version, signature-manifest, and archive provenance plus real BackupManager restore prove the v28 path-only allowlist admits only main and exact SQLite recovery sidecars across credential/device domains"
  echo "artifact-name=android-progress-backup-policy-api-30"
  echo "artifact-identifier=run-${GITHUB_RUN_ID:-local}/android-progress-backup-policy-api-30"
  echo "artifact-url=${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-local/repository}/actions/runs/${GITHUB_RUN_ID:-local}#artifacts"
  echo "result=pass"
} > "$ARTIFACT_DIR/api30-restore-context.txt"

git -C "$REPO_ROOT" status --porcelain --untracked-files=no \
  > "$ARTIFACT_DIR/api30-restore-tracked-worktree-after.txt"
if [[ -s "$ARTIFACT_DIR/api30-restore-tracked-worktree-after.txt" ]]; then
  fail "Tracked worktree was not clean after API 30 inherited restore evidence."
fi
