#!/bin/sh
set -eu

app_dir="$(cd "$(dirname "$0")/.." && pwd)"
adb_path="${ADB_PATH:-adb}"
device="${DETOX_ANDROID_DEVICE:-emulator-5554}"
app_apk="$app_dir/android/app/build/outputs/apk/e2e/app-e2e.apk"
test_apk="$app_dir/android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk"
sdk_level="$("$adb_path" -s "$device" shell getprop ro.build.version.sdk | tr -d '\r')"

case "$sdk_level" in
  ''|*[!0-9]*)
    echo "Unable to resolve Android SDK level from $device: ${sdk_level:-<empty>}" >&2
    exit 1
    ;;
esac

wait_for_boot_completed() {
  attempts=0
  boot_completed=""
  while [ "$attempts" -lt 30 ]; do
    boot_completed="$("$adb_path" -s "$device" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [ "$boot_completed" = "1" ]; then
      return
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  echo "Android device $device did not return to a boot-complete state after adbd preparation." >&2
  exit 1
}

"$adb_path" -s "$device" wait-for-device
wait_for_boot_completed

for apk_path in "$app_apk" "$test_apk"; do
  if [ ! -s "$apk_path" ]; then
    echo "Android offline validation requires a non-empty APK at $apk_path." >&2
    exit 1
  fi
done

app_apk_bytes="$(wc -c < "$app_apk" | tr -d '[:space:]')"
test_apk_bytes="$(wc -c < "$test_apk" | tr -d '[:space:]')"
case "$app_apk_bytes:$test_apk_bytes" in
  *[!0-9:]*|:*|*:)
    echo "Unable to resolve strict Android E2E APK sizes." >&2
    exit 1
    ;;
esac

# PackageManager needs room for the installed app and a temporary staged copy.
# Keep additional bounded headroom because Detox initializes each API 24 smoke
# spec independently; a timed-out install must not consume the rest of /data.
required_data_bytes=$((4 * (app_apk_bytes + test_apk_bytes) + 512 * 1024 * 1024))
# Android 7's legacy `pm` parser requires an explicit K/M/G suffix, while
# current Android also accepts the same syntax. Round up to KiB so cache
# trimming never requests less headroom than the subsequent byte-level check.
required_data_kib=$(((required_data_bytes + 1023) / 1024))
"$adb_path" -s "$device" shell pm trim-caches "${required_data_kib}K" >/dev/null
available_data_kib="$(
  "$adb_path" -s "$device" shell df -k /data \
    | tr -d '\r' \
    | awk 'NF >= 4 { available = $4 } END { print available }'
)"
case "$available_data_kib" in
  ''|*[!0-9]*)
    echo "Unable to resolve available Android /data capacity: ${available_data_kib:-<empty>}." >&2
    exit 1
    ;;
esac
available_data_bytes=$((available_data_kib * 1024))
if [ "$available_data_bytes" -lt "$required_data_bytes" ]; then
  echo "Android /data capacity is insufficient: available=$available_data_bytes required=$required_data_bytes." >&2
  exit 1
fi
echo "Android /data capacity ready: available=$available_data_bytes required=$required_data_bytes."

if [ "$sdk_level" -lt 30 ]; then
  adb_user_id="$("$adb_path" -s "$device" shell id -u | tr -d '\r')"
  if ! [ "$adb_user_id" = "0" ]; then
    "$adb_path" -s "$device" root
    "$adb_path" -s "$device" wait-for-device
    wait_for_boot_completed
    adb_user_id="$("$adb_path" -s "$device" shell id -u | tr -d '\r')"
  fi
  if ! [ "$adb_user_id" = "0" ]; then
    echo "API $sdk_level offline validation requires root adbd; received uid ${adb_user_id:-<empty>}" >&2
    exit 1
  fi
fi
