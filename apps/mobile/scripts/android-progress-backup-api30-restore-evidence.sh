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
DEVICE_ROOT="/data/user_de/0/$APP_ID"
ADB_OPERATION_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_ADB_TIMEOUT_SECONDS:-120}"
ADB_CLEANUP_TIMEOUT_SECONDS="${ANDROID_BACKUP_POLICY_CLEANUP_ADB_TIMEOUT_SECONDS:-10}"

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

fail() {
  echo "$1" >&2
  exit 1
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
  local user_state

  adb_cmd shell dumpsys package "$APP_ID" > "$package_state"
  user_state="$(grep -E 'User 0:.*stopped=' "$package_state" | head -n 1 || true)"
  if [[ -z "$user_state" || ! "$user_state" =~ (^|[[:space:]])stopped=true([[:space:]]|$) ]]; then
    fail "API 30 restore fixture package is not stopped after pm clear."
  fi
  : > "$process_state"
  if adb_cmd shell pidof "$APP_ID" \
      | tr -d '\r' | tee "$process_state" | grep -q .; then
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

sha256sum "$APK" > "$ARTIFACT_DIR/api30-restore-workflow-apk-sha256.txt"
if [[ ! -s "$ARTIFACT_DIR/installed-apk-sha256.txt" ]]; then
  fail "Installed APK provenance is missing before API 30 inherited restore evidence."
fi
if [[ "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/api30-restore-workflow-apk-sha256.txt")" \
    != "$(cut -d ' ' -f 1 "$ARTIFACT_DIR/installed-apk-sha256.txt")" ]]; then
  fail "Installed API 30 APK does not match the exact-head workflow artifact."
fi

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

skeleton_parameters='fake_encryption_flag=true,non_incremental_only=false'
adb_cmd shell settings put secure backup_local_transport_parameters "$skeleton_parameters"
adb_cmd shell settings get secure backup_local_transport_parameters \
  | tr -d '\r' | tee "$ARTIFACT_DIR/api30-restore-skeleton-transport-parameters.txt" \
  | grep -Fx "$skeleton_parameters"
adb_cmd shell bmgr transport "$LOCAL_TRANSPORT" \
  | tee "$ARTIFACT_DIR/api30-restore-skeleton-selected-transport.txt" \
  | grep -F 'Selected transport'
adb_cmd shell bmgr init "$LOCAL_TRANSPORT"
adb_cmd logcat -c
skeleton_backup_status=0
adb_cmd shell bmgr backupnow "$APP_ID" \
  | tee "$ARTIFACT_DIR/api30-restore-skeleton-backupnow.txt" || skeleton_backup_status=$?
adb_cmd logcat -d -v raw -s ChessticizeBackup:I \
  > "$ARTIFACT_DIR/api30-restore-skeleton-agent-log.txt" || true
adb_cmd shell dumpsys backup > "$ARTIFACT_DIR/api30-restore-skeleton-dumpsys-backup.txt"
if (( skeleton_backup_status != 0 )); then
  fail "API 30 skeleton-generation-only backup command failed with status $skeleton_backup_status."
fi
grep -F "Package $APP_ID with result: Success" \
  "$ARTIFACT_DIR/api30-restore-skeleton-backupnow.txt"
grep -Fx 'event=policy sdk=30 transportFlags=1 encryption=true d2d=false selected=true' \
  "$ARTIFACT_DIR/api30-restore-skeleton-agent-log.txt"
grep -Fx 'event=result selected=true emitted=3' \
  "$ARTIFACT_DIR/api30-restore-skeleton-agent-log.txt"
for skeleton_name in \
    chessticize-mobile.sqlite \
    chessticize-mobile.sqlite-journal \
    chessticize-mobile.sqlite-wal; do
  grep -Fx "event=payload name=$skeleton_name" \
    "$ARTIFACT_DIR/api30-restore-skeleton-agent-log.txt"
done
printf '%s\n' \
  'purpose=skeleton-generation-only; fake encryption is not capability evidence' \
  "parameters=$skeleton_parameters" \
  > "$ARTIFACT_DIR/api30-restore-skeleton-purpose.txt"

archive_paths="$ARTIFACT_DIR/api30-restore-base-archive-paths.txt"
find_transport_archive > "$archive_paths"
if [[ "$(wc -l < "$archive_paths" | tr -d ' ')" != "1" ]]; then
  fail "Expected one API 30 LocalTransport archive from skeleton generation."
fi
archive_path="$(cat "$archive_paths")"
source_archive="$ARTIFACT_DIR/api30-restore-os-source-archive.tar"
base_archive="$ARTIFACT_DIR/api30-restore-base-archive.tar"
constructed_archive="$ARTIFACT_DIR/api30-restore-archive.tar"
adb_cmd pull "$archive_path" "$source_archive" >/dev/null
if [[ ! -s "$source_archive" ]]; then
  fail "API 30 OS-produced source archive is empty."
fi
sha256sum "$source_archive" > "$ARTIFACT_DIR/api30-restore-os-source-archive-sha256.txt"

source_entries="$ARTIFACT_DIR/api30-restore-os-source-archive-entries.txt"
source_app_entries="$ARTIFACT_DIR/api30-restore-os-source-app-entries.txt"
source_data_entries="$ARTIFACT_DIR/api30-restore-os-source-data-entries.txt"
source_metadata_entries="$ARTIFACT_DIR/api30-restore-os-source-metadata-entries.txt"
tar -tf "$source_archive" > "$source_entries"
grep -E "^apps/$APP_ID/" "$source_entries" > "$source_app_entries" || true
grep -E "^apps/$APP_ID/($APP_DATA_DOMAINS)/" "$source_entries" \
  > "$source_data_entries" || true
grep -E "^apps/$APP_ID/_(manifest|meta)$" "$source_entries" \
  > "$source_metadata_entries" || true
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

source_manifest="$ARTIFACT_DIR/api30-restore-os-source-manifest.bin"
base_manifest="$ARTIFACT_DIR/api30-restore-base-manifest.bin"
final_manifest="$ARTIFACT_DIR/api30-restore-final-manifest.bin"
tar -xOf "$source_archive" "$manifest_entry" > "$source_manifest"
if [[ ! -s "$source_manifest" ]]; then
  fail "The OS-produced exact-head Android restore manifest is empty."
fi
sha256sum "$source_manifest" > "$ARTIFACT_DIR/api30-restore-os-source-manifest-sha256.txt"

meta_entry="apps/$APP_ID/_meta"
meta_count="$(grep -Fxc "$meta_entry" "$source_entries" || true)"
if (( meta_count > 1 )); then
  fail "The API 30 OS-produced archive contains duplicate _meta entries."
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

cp "$source_archive" "$base_archive"
mapfile -t source_data_entry_array < "$source_data_entries"
if (( ${#source_data_entry_array[@]} == 0 )); then
  fail "The skeleton-generation-only archive supplied no data entries to strip."
fi
tar --delete --file "$base_archive" "${source_data_entry_array[@]}"
base_entries="$ARTIFACT_DIR/api30-restore-skeleton-archive-entries.txt"
base_app_entries="$ARTIFACT_DIR/api30-restore-base-app-entries.txt"
base_metadata_entries="$ARTIFACT_DIR/api30-restore-base-metadata-entries.txt"
tar -tf "$base_archive" > "$base_entries"
grep -E "^apps/$APP_ID/" "$base_entries" > "$base_app_entries" || true
grep -E "^apps/$APP_ID/_(manifest|meta)$" "$base_entries" \
  > "$base_metadata_entries" || true
if grep -E "^apps/$APP_ID/($APP_DATA_DOMAINS)/" "$base_entries" >/dev/null; then
  fail "Stripped API 30 archive still contains app-data entries."
fi
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

archive_uid="$(adb_cmd shell stat -c %u "$archive_path" | tr -d '\r')"
archive_gid="$(adb_cmd shell stat -c %g "$archive_path" | tr -d '\r')"
archive_mode="$(adb_cmd shell stat -c %a "$archive_path" | tr -d '\r')"
adb_cmd shell ls -Zd "$archive_path" \
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
  adb_cmd shell run-as "$APP_ID" test ! -e "$path" \
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
  adb_cmd shell run-as "$APP_ID" test -f "$path" \
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
  adb_cmd shell run-as "$APP_ID" test ! -e "$path" \
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
  echo "exact-commands=API30 fake-encryption skeleton-generation-only backup; tar --delete OS data; tar --append deterministic domain fixtures; reset normal LocalTransport parameters; bmgr restore $restore_token $APP_ID"
  echo "validation-scope=targeted native API 30 inherited fullBackupContent restore parser"
  echo "scope-rationale=real BackupManager restore proves the v28 path-only main-database include admits only main and exact SQLite recovery sidecars across credential/device domains"
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
