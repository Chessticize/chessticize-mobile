#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ORIENTATION_RUNNER="$SCRIPT_DIR/set-simulator-orientation.sh"
SIMULATOR_TARGET_RESOLVER="$REPO_ROOT/apps/mobile/scripts/resolve-ios-simulator-target.js"
PNG_ORIENTATION_VALIDATOR="$REPO_ROOT/apps/mobile/scripts/assert-png-orientation.js"
DEVICE_NAME="${DETOX_IOS_DEVICE:-iPad Pro 11-inch (M5)}"
WORKER_COUNT="${DETOX_MAX_WORKERS:-1}"
PORTRAIT_SCENES=(
  app-store-01-practice-tab
  app-store-02-review-tab
  app-store-03-history-tab
  app-store-04-settings-tab
  app-store-05-standard-sprint
  app-store-06-arrow-duel
  app-store-07-custom-setup
  app-store-08-review-session
  app-store-09-sprint-rules-guide
  app-store-10-active-session-guide-header
  app-store-11-active-session-guide-slow
  app-store-12-active-session-guide-timeout
  app-store-13-active-session-guide-unclear
  app-store-14-arrow-duel-guide
  app-store-15-sprint-result
)
LANDSCAPE_SCENES=(
  app-store-01-practice-tab-landscape
  app-store-05-standard-sprint-landscape
  app-store-06-arrow-duel-landscape
  app-store-08-review-session-landscape
  app-store-09-sprint-rules-guide-landscape
  app-store-10-active-session-guide-header-landscape
  app-store-11-active-session-guide-slow-landscape
  app-store-12-active-session-guide-timeout-landscape
  app-store-13-active-session-guide-unclear-landscape
  app-store-14-arrow-duel-guide-landscape
  app-store-15-sprint-result-landscape
)

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cd "$REPO_ROOT"

[[ "$(uname -s)" == "Darwin" ]] || fail "Release simulator calibration requires macOS."
[[ "$DEVICE_NAME" == *iPad* ]] || \
  fail "Full portrait/landscape calibration requires a dedicated iPad Simulator; run iPhone store capture in portrait only."
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "Run inside the Chessticize Mobile repository."
command -v brew >/dev/null 2>&1 || fail "Homebrew is required to select the locked Ruby 3.3 toolchain."
command -v caffeinate >/dev/null 2>&1 || fail "caffeinate is required to keep local visual QA unlocked."
command -v ioreg >/dev/null 2>&1 || fail "ioreg is required to verify the macOS console state."
command -v node >/dev/null 2>&1 || fail "Node.js is required to resolve the exact Simulator."
command -v sips >/dev/null 2>&1 || fail "sips is required to normalize Simulator PNG orientation."
command -v xcrun >/dev/null 2>&1 || fail "Xcode command-line tools are required."
[[ -x "$ORIENTATION_RUNNER" ]] || fail "Missing executable orientation runner: $ORIENTATION_RUNNER"
[[ -x "$SIMULATOR_TARGET_RESOLVER" ]] || \
  fail "Missing executable Simulator target resolver: $SIMULATOR_TARGET_RESOLVER"
[[ -x "$PNG_ORIENTATION_VALIDATOR" ]] || \
  fail "Missing executable PNG orientation validator: $PNG_ORIENTATION_VALIDATOR"
if ioreg -n Root -d1 | grep '"IOConsoleLocked" = Yes' >/dev/null; then
  fail "Unlock the Mac before local visual QA so Simulator window control remains available."
fi

if [[ "${CHESSTICIZE_UI_CALIBRATION_CAFFEINATED:-0}" != "1" ]]; then
  export CHESSTICIZE_UI_CALIBRATION_CAFFEINATED=1
  exec /usr/bin/caffeinate -dimsu "$0" "$@"
fi

RUBY_PREFIX="$(brew --prefix ruby@3.3 2>/dev/null)" || \
  fail "Install Homebrew ruby@3.3 before running UI calibration."
[[ -x "$RUBY_PREFIX/bin/ruby" ]] || fail "Homebrew ruby@3.3 is not available at $RUBY_PREFIX."
export PATH="$RUBY_PREFIX/bin:$PATH"

HEAD_BEFORE="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=7 HEAD)"
STATUS_BEFORE="$(git status --porcelain --untracked-files=normal)"
[[ -z "$STATUS_BEFORE" ]] || fail "Commit or remove worktree changes before exact-head calibration."

TARGET_RESOLVER_ARGS=(--device-name "$DEVICE_NAME")
if [[ -n "${DETOX_IOS_DEVICE_UDID:-}" ]]; then
  TARGET_RESOLVER_ARGS+=(--device-udid "$DETOX_IOS_DEVICE_UDID")
fi
SIMULATOR_TARGET_JSON="$("$SIMULATOR_TARGET_RESOLVER" "${TARGET_RESOLVER_ARGS[@]}")" || \
  fail "Could not resolve the exact Simulator target."
SIMULATOR_UDID="$(
  node -e 'process.stdout.write(JSON.parse(process.argv[1]).udid)' "$SIMULATOR_TARGET_JSON"
)"
RUNTIME_IDENTIFIER="$(
  node -e 'process.stdout.write(JSON.parse(process.argv[1]).runtimeIdentifier)' \
    "$SIMULATOR_TARGET_JSON"
)"

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

DEVICE_SLUG="$(slugify "$DEVICE_NAME")"
RUNTIME_SLUG="$(slugify "$RUNTIME_IDENTIFIER")"
UDID_SLUG="$(slugify "$SIMULATOR_UDID")"
[[ -n "$DEVICE_SLUG" && -n "$RUNTIME_SLUG" && -n "$UDID_SLUG" ]] || \
  fail "Could not derive collision-proof Simulator artifact identity."

export DETOX_IOS_DEVICE="$DEVICE_NAME"
export DETOX_IOS_DEVICE_UDID="$SIMULATOR_UDID"
export DETOX_MAX_WORKERS="$WORKER_COUNT"

PORTRAIT_MARKER=""
LANDSCAPE_MARKER=""
RESTORE_PORTRAIT=0
cleanup() {
  rm -f "$PORTRAIT_MARKER" "$LANDSCAPE_MARKER"
  if [[ "$RESTORE_PORTRAIT" == "1" ]]; then
    "$ORIENTATION_RUNNER" "$SIMULATOR_UDID" "$DEVICE_NAME" portrait || \
      echo "WARNING: Could not restore $DEVICE_NAME to portrait." >&2
  fi
}
trap cleanup EXIT

copy_capture() {
  local orientation="$1"
  local marker="$2"
  shift 2
  local anchor="app-store-08-review-session.png"
  if [[ "$orientation" == "landscape" ]]; then
    anchor="app-store-08-review-session-landscape.png"
  fi

  local source_anchor=""
  local match_count=0
  while IFS= read -r candidate; do
    source_anchor="$candidate"
    match_count=$((match_count + 1))
  done < <(
    find apps/mobile/artifacts/store-assets \
      -type f \
      -name "$anchor" \
      -newer "$marker" \
      -print
  )
  [[ "$match_count" == "1" ]] || \
    fail "Expected one new $orientation Release capture anchor, found $match_count."

  local source_dir
  source_dir="$(dirname "$source_anchor")"
  local scene
  for scene in "$@"; do
    local source_path="$source_dir/$scene.png"
    [[ -f "$source_path" ]] || fail "Missing expected $orientation screenshot: $scene.png"
    cp "$source_path" "$DESTINATION/$scene.png"
    if [[ "$orientation" == "landscape" ]] && \
      ! "$PNG_ORIENTATION_VALIDATOR" "$DESTINATION/$scene.png" landscape >/dev/null 2>&1; then
      # Xcode 26.6 can expose the verified landscape UIKit surface inside a
      # portrait-shaped physical framebuffer. Detox then writes the pixels
      # counter-clockwise, so normalize that deterministic representation.
      /usr/bin/sips --rotate 90 "$DESTINATION/$scene.png" >/dev/null
    fi
    "$PNG_ORIENTATION_VALIDATOR" "$DESTINATION/$scene.png" "$orientation"
  done
}

restart_exact_simulator() {
  xcrun simctl shutdown "$SIMULATOR_UDID" 2>/dev/null || true
  xcrun simctl boot "$SIMULATOR_UDID"
  xcrun simctl bootstatus "$SIMULATOR_UDID" -b
  "/usr/bin/open" -a Simulator --args -CurrentDeviceUDID "$SIMULATOR_UDID"
}

echo "Calibrating commit $HEAD_BEFORE on $DEVICE_NAME ($SIMULATOR_UDID)"
pnpm mobile:doctor:ios
pnpm mobile:e2e:build:ios:release

DESTINATION="$REPO_ROOT/scratch/rendering-checks/$SHORT_SHA/release-$DEVICE_SLUG-$RUNTIME_SLUG-$UDID_SLUG"
[[ ! -e "$DESTINATION" ]] || fail "Move or remove the existing capture directory: $DESTINATION"
mkdir -p "$DESTINATION"

restart_exact_simulator

"$ORIENTATION_RUNNER" "$SIMULATOR_UDID" "$DEVICE_NAME" portrait
PORTRAIT_MARKER="$(mktemp -t chessticize-ui-calibration-portrait)"
touch "$PORTRAIT_MARKER"
CHESSTICIZE_STORE_ASSET_ORIENTATION=portrait pnpm mobile:e2e:store-assets:ios:release
copy_capture portrait "$PORTRAIT_MARKER" "${PORTRAIT_SCENES[@]}"

RESTORE_PORTRAIT=1
restart_exact_simulator
"$ORIENTATION_RUNNER" "$SIMULATOR_UDID" "$DEVICE_NAME" landscape
LANDSCAPE_MARKER="$(mktemp -t chessticize-ui-calibration-landscape)"
touch "$LANDSCAPE_MARKER"
CHESSTICIZE_STORE_ASSET_ORIENTATION=landscape pnpm mobile:e2e:store-assets:ios:release
copy_capture landscape "$LANDSCAPE_MARKER" "${LANDSCAPE_SCENES[@]}"

SCREENSHOT_COUNT="$(find "$DESTINATION" -maxdepth 1 -type f -name 'app-store-*.png' | wc -l | tr -d ' ')"
EXPECTED_COUNT=$((${#PORTRAIT_SCENES[@]} + ${#LANDSCAPE_SCENES[@]}))
[[ "$SCREENSHOT_COUNT" == "$EXPECTED_COUNT" ]] || \
  fail "Expected exactly $EXPECTED_COUNT screenshots in $DESTINATION, found $SCREENSHOT_COUNT."

HEAD_AFTER="$(git rev-parse HEAD)"
STATUS_AFTER="$(git status --porcelain --untracked-files=normal)"
[[ "$HEAD_AFTER" == "$HEAD_BEFORE" ]] || fail "HEAD changed during calibration."
[[ -z "$STATUS_AFTER" ]] || fail "Tracked or untracked files changed during calibration."

echo "UI calibration capture passed."
echo "Commit: $HEAD_BEFORE"
echo "Simulator: $DEVICE_NAME ($SIMULATOR_UDID)"
echo "Screenshots: $DESTINATION"
echo "Scenes: $EXPECTED_COUNT"
