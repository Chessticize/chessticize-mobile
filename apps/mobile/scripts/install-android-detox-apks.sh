#!/bin/sh
set -eu

app_dir="$(cd "$(dirname "$0")/.." && pwd)"
adb_path="${ADB_PATH:-adb}"
device="${DETOX_ANDROID_DEVICE:-emulator-5554}"
app_apk="$app_dir/android/app/build/outputs/apk/e2e/app-e2e.apk"
test_apk="$app_dir/android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk"

for apk_path in "$app_apk" "$test_apk"; do
  if [ ! -s "$apk_path" ]; then
    echo "Android Detox preinstall requires a non-empty APK at $apk_path." >&2
    exit 1
  fi
done

"$adb_path" -s "$device" wait-for-device
if ! sdk_level="$("$adb_path" -s "$device" shell getprop ro.build.version.sdk)"; then
  echo "Unable to resolve Android SDK level from $device." >&2
  exit 1
fi
sdk_level="$(printf '%s' "$sdk_level" | tr -d '\r')"
if [ "$sdk_level" != "24" ]; then
  echo "Android Detox preinstall is reserved for API 24; found API ${sdk_level:-<empty>}." >&2
  exit 1
fi

install_exact_apk() {
  apk_path="$1"
  if ! install_output="$("$adb_path" -s "$device" install -r -g -t "$apk_path" 2>&1)"; then
    echo "Unable to install exact Android APK $apk_path: ${install_output:-<empty>}." >&2
    exit 1
  fi
  install_output="$(printf '%s' "$install_output" | tr -d '\r')"
  install_result="$(printf '%s\n' "$install_output" | awk 'NF { result = $0 } END { print result }')"
  if [ "$install_result" != "Success" ]; then
    echo "Android PackageManager did not accept $apk_path: ${install_output:-<empty>}." >&2
    exit 1
  fi
}

verify_installed_package() {
  package_name="$1"
  if ! package_paths="$("$adb_path" -s "$device" shell pm path "$package_name")"; then
    echo "Unable to inspect preinstalled package $package_name." >&2
    exit 1
  fi
  package_paths="$(printf '%s' "$package_paths" | tr -d '\r')"
  path_count="$(printf '%s\n' "$package_paths" | awk 'NF { count += 1 } END { print count + 0 }')"
  if [ "$path_count" != "1" ]; then
    echo "Expected exactly one installed APK for $package_name; found $path_count: ${package_paths:-<empty>}." >&2
    exit 1
  fi
  case "$package_paths" in
    package:/*.apk)
      ;;
    *)
      echo "Installed APK path for $package_name is malformed: $package_paths." >&2
      exit 1
      ;;
  esac
  echo "Verified preinstalled package $package_name at ${package_paths#package:}."
}

# Detox otherwise reinstalls this large packaged app once per Jest file, using
# a bounded ADB timeout. Preinstall both exact-head artifacts once, then the
# matrix runner passes --reuse while each spec still resets application data.
install_exact_apk "$app_apk"
install_exact_apk "$test_apk"
verify_installed_package com.chessticize.mobile
verify_installed_package com.chessticize.mobile.test
