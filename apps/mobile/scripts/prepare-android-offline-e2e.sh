#!/bin/sh
set -eu

adb_path="${ADB_PATH:-adb}"
device="${DETOX_ANDROID_DEVICE:-emulator-5554}"
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
