#!/bin/sh
set -eu

app_dir="$(cd "$(dirname "$0")/.." && pwd)"
adb_path="${ADB_PATH:-adb}"
device="${DETOX_ANDROID_DEVICE:-emulator-5554}"
app_apk="$app_dir/android/app/build/outputs/apk/e2e/app-e2e.apk"
test_apk="$app_dir/android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk"
sdk_level="$("$adb_path" -s "$device" shell getprop ro.build.version.sdk | tr -d '\r')"
adb_recovery_wait_attempts="${ANDROID_OFFLINE_ADB_RECOVERY_WAIT_ATTEMPTS:-60}"
adb_recovery_wait_interval="${ANDROID_OFFLINE_ADB_RECOVERY_WAIT_INTERVAL_SECONDS:-1}"

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

wait_for_device_bounded() {
  wait_attempt=0
  "$adb_path" -s "$device" wait-for-device &
  wait_pid=$!
  while kill -0 "$wait_pid" 2>/dev/null; do
    if [ "$wait_attempt" -ge "$adb_recovery_wait_attempts" ]; then
      kill "$wait_pid" 2>/dev/null || true
      wait "$wait_pid" 2>/dev/null || true
      echo "Android device $device did not reconnect within the bounded adbd recovery wait." >&2
      return 1
    fi
    sleep "$adb_recovery_wait_interval"
    wait_attempt=$((wait_attempt + 1))
  done
  if ! wait "$wait_pid"; then
    echo "Android device $device failed while waiting for adbd recovery." >&2
    return 1
  fi
}

is_transient_adb_root_restart_failure() {
  transient_output="$1"
  transient_matched=0
  while IFS= read -r transient_line; do
    transient_line="$(printf '%s' "$transient_line" | tr -d '\r')"
    [ -z "$transient_line" ] && continue
    case "$transient_line" in
      "adb: unable to connect for root: closed"|"error: closed"|"error: device offline")
        transient_matched=1
        ;;
      *)
        return 1
        ;;
    esac
  done <<EOF
$transient_output
EOF
  [ "$transient_matched" -eq 1 ]
}

run_adb_root() {
  adb_root_status=0
  adb_root_output="$("$adb_path" -s "$device" root 2>&1)" || adb_root_status=$?
}

recover_after_adb_root() {
  wait_for_device_bounded || return 1
  wait_for_boot_completed
}

case "$adb_recovery_wait_attempts" in
  ''|*[!0-9]*|0)
    echo "ANDROID_OFFLINE_ADB_RECOVERY_WAIT_ATTEMPTS must be a positive integer." >&2
    exit 64
    ;;
esac

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
if ! cache_trim_output="$(
  "$adb_path" -s "$device" shell pm trim-caches "${required_data_kib}K" 2>&1
)"; then
  echo "WARN: Android cache trim was unavailable; continuing to the hard /data capacity check." >&2
  printf '%s\n' "${cache_trim_output:-<empty>}" >&2
fi
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
    run_adb_root
    if [ "$adb_root_status" -ne 0 ]; then
      if ! is_transient_adb_root_restart_failure "$adb_root_output"; then
        printf '%s\n' "${adb_root_output:-adb root failed without output}" >&2
        exit 1
      fi
      echo "WARN: transient adb root transport failure; waiting for adbd and retrying once." >&2
      printf '%s\n' "$adb_root_output" >&2
      recover_after_adb_root || exit 1
      run_adb_root
      if [ "$adb_root_status" -ne 0 ]; then
        printf '%s\n' "${adb_root_output:-adb root retry failed without output}" >&2
        if is_transient_adb_root_restart_failure "$adb_root_output"; then
          echo "Transient adb root transport failure persisted after one retry." >&2
        else
          echo "adb root retry failed with a non-transient error." >&2
        fi
        exit 1
      fi
    fi
    recover_after_adb_root || exit 1
    adb_user_id="$("$adb_path" -s "$device" shell id -u | tr -d '\r')"
  fi
  if ! [ "$adb_user_id" = "0" ]; then
    echo "API $sdk_level offline validation requires root adbd; received uid ${adb_user_id:-<empty>}" >&2
    exit 1
  fi
fi
