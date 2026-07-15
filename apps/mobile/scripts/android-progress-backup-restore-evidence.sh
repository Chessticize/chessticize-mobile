#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
ARTIFACT_DIR="${ANDROID_BACKUP_ARTIFACT_DIR:-$APP_DIR/artifacts/android-progress-backup}"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB_PATH:-${SDK_ROOT:+$SDK_ROOT/platform-tools/adb}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"

if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "Set ADB_PATH, ANDROID_HOME, or ANDROID_SDK_ROOT to an executable adb." >&2
  exit 69
fi

cd "$REPO_ROOT"

record_restored_install() {
  local evidence_prefix="$1"
  local app_paths
  local test_paths

  pnpm mobile:verify:android:backup -- --adb-device "$DEVICE" --json \
    > "$ARTIFACT_DIR/$evidence_prefix-payload.json"
  app_paths="$("$ADB" -s "$DEVICE" shell pm path com.chessticize.mobile)"
  test_paths="$("$ADB" -s "$DEVICE" shell pm path com.chessticize.mobile.test)"
  [[ "$app_paths" == package:* ]]
  [[ "$test_paths" == package:* ]]
  {
    echo "app:"
    echo "$app_paths"
    echo "test:"
    echo "$test_paths"
  } > "$ARTIFACT_DIR/$evidence_prefix-package.txt"
}

assert_restored_progress() {
  local expectation="$1"
  local evidence_prefix="$2"
  local restore_status=0

  record_restored_install "$evidence_prefix-before-detox"
  CHESSTICIZE_DETOX_REUSE_INSTALLED_APP=1 \
    CHESSTICIZE_BACKUP_EXPECTATION="$expectation" \
    DETOX_ACTIVE_SUITE=android-progress-backup-restore \
    pnpm mobile:e2e:test:android:ci || restore_status=$?
  record_restored_install "$evidence_prefix-after-detox"
  return "$restore_status"
}

mkdir -p "$ARTIFACT_DIR"
apps/mobile/scripts/prepare-android-offline-e2e.sh
DETOX_ACTIVE_SUITE=android-standard-practice pnpm mobile:e2e:test:android:ci
pnpm mobile:verify:android:backup -- --adb-device "$DEVICE" --json \
  > "$ARTIFACT_DIR/cloud-payload.json"
apps/mobile/scripts/android-progress-backup-evidence.sh cloud-encrypted
assert_restored_progress current-progress cloud-restored
apps/mobile/scripts/android-progress-backup-evidence.sh seed-released-fixture
pnpm mobile:verify:android:backup -- --adb-device "$DEVICE" --json \
  > "$ARTIFACT_DIR/device-transfer-payload.json"
apps/mobile/scripts/android-progress-backup-evidence.sh device-transfer
assert_restored_progress released-fixture device-transfer-restored
git status --porcelain --untracked-files=no > "$ARTIFACT_DIR/tracked-worktree-after.txt"
[[ ! -s "$ARTIFACT_DIR/tracked-worktree-after.txt" ]]
echo "result=pass" >> "$ARTIFACT_DIR/context.txt"
