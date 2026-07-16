#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB_PATH:-${SDK_ROOT:+$SDK_ROOT/platform-tools/adb}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"
APP_APK="${CHESSTICIZE_ANDROID_E2E_APK:-$APP_DIR/android/app/build/outputs/apk/e2e/app-e2e.apk}"
TEST_APK="${CHESSTICIZE_ANDROID_E2E_TEST_APK:-$APP_DIR/android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk}"
ARTIFACT_DIR="$APP_DIR/artifacts/android-review-reminders"

if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "Set ADB_PATH, ANDROID_HOME, or ANDROID_SDK_ROOT to an executable adb." >&2
  exit 69
fi
if [[ ! -f "$APP_APK" || ! -f "$TEST_APK" ]]; then
  echo "Android review-reminder integration requires the exact-head E2E app and test APKs." >&2
  exit 66
fi

mkdir -p "$ARTIFACT_DIR"
cd "$REPO_ROOT"
git status --porcelain --untracked-files=no > "$ARTIFACT_DIR/tracked-worktree-before.txt"
test ! -s "$ARTIFACT_DIR/tracked-worktree-before.txt"
{
  echo "commit-sha=$(git rev-parse HEAD)"
  echo "validation-scope=Android native reminder integration on API 36"
  echo "commands=install exact-head app/test APK; run ReviewReminderNotificationsIntegrationTest"
} > "$ARTIFACT_DIR/native-context.txt"

"$ADB" -s "$DEVICE" install -r -t "$APP_APK" > "$ARTIFACT_DIR/native-app-install.txt"
"$ADB" -s "$DEVICE" install -r -t "$TEST_APK" > "$ARTIFACT_DIR/native-test-install.txt"
set +e
"$ADB" -s "$DEVICE" shell am instrument -w \
  -e class com.chessticize.mobile.ReviewReminderNotificationsIntegrationTest \
  com.chessticize.mobile.test/androidx.test.runner.AndroidJUnitRunner \
  > "$ARTIFACT_DIR/native-instrumentation.txt" 2>&1
status=$?
set -e
cat "$ARTIFACT_DIR/native-instrumentation.txt"
test "$status" -eq 0
grep -F "OK (7 tests)" "$ARTIFACT_DIR/native-instrumentation.txt"
"$ADB" -s "$DEVICE" shell dumpsys package com.chessticize.mobile \
  > "$ARTIFACT_DIR/native-installed-package.txt"
"$ADB" -s "$DEVICE" shell dumpsys notification --noredact \
  > "$ARTIFACT_DIR/native-notification-state.txt"
