#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB_PATH:-${SDK_ROOT:+$SDK_ROOT/platform-tools/adb}}"
AAPT2="${AAPT2_PATH:-${SDK_ROOT:+$SDK_ROOT/build-tools/36.0.0/aapt2}}"
DEVICE="${DETOX_ANDROID_DEVICE:-emulator-5554}"
APP_ID="com.chessticize.mobile"
TEST_RUNNER="$APP_ID.test/androidx.test.runner.AndroidJUnitRunner"
APP_APK="${CHESSTICIZE_ANDROID_R8_APK:-$APP_DIR/android/app/build/outputs/apk/r8Validation/app-r8Validation.apk}"
APP_BUNDLE="${CHESSTICIZE_ANDROID_R8_BUNDLE:-$APP_DIR/android/app/build/outputs/bundle/r8Validation/app-r8Validation.aab}"
TEST_APK="${CHESSTICIZE_ANDROID_R8_TEST_APK:-$APP_DIR/android/app/build/outputs/apk/androidTest/r8Validation/app-r8Validation-androidTest.apk}"
MAPPING_DIR="${CHESSTICIZE_ANDROID_R8_MAPPING_DIR:-$APP_DIR/android/app/build/outputs/mapping/r8Validation}"
ARTIFACT_DIR="${CHESSTICIZE_ANDROID_R8_ARTIFACT_DIR:-$APP_DIR/artifacts/android-r8/native-validation}"
OPTIMIZATION_REPORT="${CHESSTICIZE_ANDROID_R8_REPORT:-$APP_DIR/artifacts/android-r8/r8-validation.json}"

if [[ -z "$ADB" || ! -x "$ADB" ]]; then
  echo "Set ADB_PATH, ANDROID_HOME, or ANDROID_SDK_ROOT to an executable adb." >&2
  exit 69
fi
if [[ -z "$AAPT2" || ! -x "$AAPT2" ]]; then
  echo "Set AAPT2_PATH or provide Android build-tools 36.0.0." >&2
  exit 69
fi
for artifact in "$APP_APK" "$APP_BUNDLE" "$TEST_APK"; do
  if [[ ! -s "$artifact" ]]; then
    echo "R8 native validation requires a non-empty artifact at $artifact." >&2
    exit 66
  fi
done
if [[ ! -d "$MAPPING_DIR" ]]; then
  echo "R8 native validation mapping directory does not exist: $MAPPING_DIR" >&2
  exit 66
fi

mkdir -p "$ARTIFACT_DIR"
cd "$REPO_ROOT"
git status --porcelain --untracked-files=no > "$ARTIFACT_DIR/tracked-worktree-before.txt"
if [[ -s "$ARTIFACT_DIR/tracked-worktree-before.txt" ]]; then
  echo "R8 native validation requires a clean tracked worktree." >&2
  exit 1
fi

source_sha="$(git rev-parse HEAD)"
api_level="$($ADB -s "$DEVICE" shell getprop ro.build.version.sdk | tr -d '\r')"
device_abi="$($ADB -s "$DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r')"
if [[ "$api_level" != "36" ]]; then
  echo "R8 native validation requires Android API 36; found ${api_level:-<empty>}." >&2
  exit 1
fi

node apps/mobile/scripts/android-r8-evidence.js \
  --variant r8Validation \
  --source-sha "$source_sha" \
  --apk "$APP_APK" \
  --bundle "$APP_BUNDLE" \
  --mapping-dir "$MAPPING_DIR" \
  --output "$OPTIMIZATION_REPORT"
node apps/mobile/scripts/verify-android-apk-abis.js "$APP_APK" \
  > "$ARTIFACT_DIR/native-packaging.txt"

"$AAPT2" dump xmltree "$APP_APK" --file AndroidManifest.xml \
  > "$ARTIFACT_DIR/manifest.txt"
grep -F 'android:usesCleartextTraffic' "$ARTIFACT_DIR/manifest.txt" | grep -F '=false'
if grep -Fq 'android.permission.INTERNET' "$ARTIFACT_DIR/manifest.txt"; then
  echo "R8 validation APK unexpectedly requests INTERNET." >&2
  exit 1
fi
if grep -Fq 'android:debuggable' "$ARTIFACT_DIR/manifest.txt"; then
  echo "R8 validation APK unexpectedly declares debuggable=true." >&2
  exit 1
fi
for manifest_boundary in \
  'com.chessticize.mobile.MainActivity' \
  'com.chessticize.mobile.backup.ProgressBackupAgent' \
  'com.chessticize.mobile.ReviewReminderAlarmReceiver' \
  'com.chessticize.mobile.ReviewReminderLifecycleReceiver' \
  'android:fullBackupContent' \
  'android:dataExtractionRules'; do
  grep -F "$manifest_boundary" "$ARTIFACT_DIR/manifest.txt"
done

"$ADB" -s "$DEVICE" install -r -t "$APP_APK" \
  > "$ARTIFACT_DIR/app-install.txt"
"$ADB" -s "$DEVICE" install -r -t "$TEST_APK" \
  > "$ARTIFACT_DIR/test-install.txt"

run_instrumentation() {
  local class_name="$1"
  local expected_summary="$2"
  local output_name="$3"
  local status=0

  set +e
  "$ADB" -s "$DEVICE" shell am instrument -w \
    -e class "$class_name" \
    "$TEST_RUNNER" > "$ARTIFACT_DIR/$output_name" 2>&1
  status=$?
  set -e
  cat "$ARTIFACT_DIR/$output_name"
  test "$status" -eq 0
  grep -F "$expected_summary" "$ARTIFACT_DIR/$output_name"
}

run_instrumentation \
  com.chessticize.mobile.R8NativeBoundariesIntegrationTest \
  'OK (2 tests)' \
  native-boundaries.txt
run_instrumentation \
  com.chessticize.mobile.ReviewReminderNotificationsIntegrationTest \
  'OK (8 tests)' \
  reminder-boundaries.txt
run_instrumentation \
  com.chessticize.mobile.ReleasedDatabaseFixtureInstallerTest \
  'OK (1 test)' \
  migration-fixture-installer.txt

"$ADB" -s "$DEVICE" shell pm clear "$APP_ID" > "$ARTIFACT_DIR/app-clear.txt"
"$ADB" -s "$DEVICE" shell am start -W -S \
  -n "$APP_ID/.MainActivity" > "$ARTIFACT_DIR/cold-start.txt"
grep -F 'Status: ok' "$ARTIFACT_DIR/cold-start.txt"
grep -F 'LaunchState: COLD' "$ARTIFACT_DIR/cold-start.txt"
grep -E '^TotalTime: [0-9]+$' "$ARTIFACT_DIR/cold-start.txt"

public_ui_visible=0
for _ in $(seq 1 30); do
  if "$ADB" -s "$DEVICE" shell uiautomator dump /sdcard/chessticize-r8-ui.xml \
      > /dev/null 2>&1 \
      && "$ADB" -s "$DEVICE" exec-out cat /sdcard/chessticize-r8-ui.xml \
      > "$ARTIFACT_DIR/public-ui.xml" \
      && grep -Fq 'practice-tab' "$ARTIFACT_DIR/public-ui.xml"; then
    public_ui_visible=1
    break
  fi
  sleep 1
done
if [[ "$public_ui_visible" != "1" ]]; then
  echo "R8 validation APK did not render the public Practice UI." >&2
  exit 1
fi

"$ADB" -s "$DEVICE" shell dumpsys package "$APP_ID" \
  > "$ARTIFACT_DIR/installed-package.txt"
expected_version_name="$(node -p "require('./apps/mobile/release-version.json').publicVersion")"
expected_version_code="$(node -p "require('./apps/mobile/release-version.json').androidVersionCode")"
grep -F "versionName=$expected_version_name" "$ARTIFACT_DIR/installed-package.txt"
grep -E "versionCode=$expected_version_code([[:space:]]|$)" "$ARTIFACT_DIR/installed-package.txt"

{
  echo "source-sha=$source_sha"
  echo "variant=r8Validation"
  echo "device=$DEVICE"
  echo "api-level=$api_level"
  echo "abi=$device_abi"
  echo "app-apk-sha256=$(shasum -a 256 "$APP_APK" | awk '{print $1}')"
  echo "test-apk-sha256=$(shasum -a 256 "$TEST_APK" | awk '{print $1}')"
  echo "optimization-report=$OPTIMIZATION_REPORT"
  echo "result=pass"
} > "$ARTIFACT_DIR/context.txt"

git status --porcelain --untracked-files=no > "$ARTIFACT_DIR/tracked-worktree-after.txt"
test ! -s "$ARTIFACT_DIR/tracked-worktree-after.txt"
echo "R8 non-debuggable native validation passed on $DEVICE."
