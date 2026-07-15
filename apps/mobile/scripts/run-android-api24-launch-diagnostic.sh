#!/bin/sh

set -eu

mkdir -p apps/mobile/artifacts/android-ui
adb -s "$DETOX_ANDROID_DEVICE" logcat -c

capture_api24_startup() {
  status=$?
  set +e
  adb -s "$DETOX_ANDROID_DEVICE" logcat -d -v threadtime > apps/mobile/artifacts/android-ui/logcat-raw.txt
  adb -s "$DETOX_ANDROID_DEVICE" shell dumpsys activity activities > apps/mobile/artifacts/android-ui/activity.txt
  adb -s "$DETOX_ANDROID_DEVICE" shell dumpsys window windows > apps/mobile/artifacts/android-ui/window.txt
  trap - 0
  exit "$status"
}

trap capture_api24_startup 0
DETOX_ACTIVE_SUITE=android-launch pnpm mobile:e2e:test:android:ci
trap - 0
