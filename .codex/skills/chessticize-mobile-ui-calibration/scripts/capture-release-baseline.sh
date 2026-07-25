#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ORIENTATION_RUNNER="$SCRIPT_DIR/set-simulator-orientation.sh"
DEVICE_NAME="${DETOX_IOS_DEVICE:-iPhone 17-Detox}"
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
)
LANDSCAPE_SCENES=(
  app-store-01-practice-tab-landscape
  app-store-05-standard-sprint-landscape
  app-store-06-arrow-duel-landscape
  app-store-08-review-session-landscape
)

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cd "$REPO_ROOT"

[[ "$(uname -s)" == "Darwin" ]] || fail "Release simulator calibration requires macOS."
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "Run inside the Chessticize Mobile repository."
command -v brew >/dev/null 2>&1 || fail "Homebrew is required to select the locked Ruby 3.3 toolchain."
command -v node >/dev/null 2>&1 || fail "Node.js is required to resolve the exact Simulator."
command -v xcrun >/dev/null 2>&1 || fail "Xcode command-line tools are required."
[[ -x "$ORIENTATION_RUNNER" ]] || fail "Missing executable orientation runner: $ORIENTATION_RUNNER"

RUBY_PREFIX="$(brew --prefix ruby@3.3 2>/dev/null)" || \
  fail "Install Homebrew ruby@3.3 before running UI calibration."
[[ -x "$RUBY_PREFIX/bin/ruby" ]] || fail "Homebrew ruby@3.3 is not available at $RUBY_PREFIX."
export PATH="$RUBY_PREFIX/bin:$PATH"

HEAD_BEFORE="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=7 HEAD)"
STATUS_BEFORE="$(git status --porcelain --untracked-files=normal)"
[[ -z "$STATUS_BEFORE" ]] || fail "Commit or remove worktree changes before exact-head calibration."

if [[ -n "${DETOX_IOS_DEVICE_UDID:-}" ]]; then
  SIMULATOR_UDID="$DETOX_IOS_DEVICE_UDID"
else
  SIMULATOR_UDID="$(
    xcrun simctl list devices available -j | node -e '
      const fs = require("node:fs");
      const deviceName = process.argv[1];
      const runtimes = Object.values(JSON.parse(fs.readFileSync(0, "utf8")).devices);
      const matches = runtimes.flat().filter((device) => device.name === deviceName);
      if (matches.length !== 1) {
        console.error(
          `Expected exactly one available Simulator named ${deviceName}, found ${matches.length}. `
          + "Set DETOX_IOS_DEVICE_UDID to disambiguate."
        );
        process.exit(2);
      }
      process.stdout.write(matches[0].udid);
    ' "$DEVICE_NAME"
  )" || fail "Could not resolve the exact Simulator UDID."
fi

DEVICE_SLUG="$(
  printf '%s' "$DEVICE_NAME" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
)"
[[ -n "$DEVICE_SLUG" ]] || fail "Could not derive a destination slug from $DEVICE_NAME."

export DETOX_IOS_DEVICE="$DEVICE_NAME"
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
  done
}

echo "Calibrating commit $HEAD_BEFORE on $DEVICE_NAME ($SIMULATOR_UDID)"
pnpm mobile:doctor:ios
pnpm mobile:e2e:build:ios:release

DESTINATION="$REPO_ROOT/scratch/rendering-checks/$SHORT_SHA/release-$DEVICE_SLUG"
[[ ! -e "$DESTINATION" ]] || fail "Move or remove the existing capture directory: $DESTINATION"
mkdir -p "$DESTINATION"

xcrun simctl boot "$SIMULATOR_UDID" 2>/dev/null || true
xcrun simctl bootstatus "$SIMULATOR_UDID" -b
"/usr/bin/open" -a Simulator --args -CurrentDeviceUDID "$SIMULATOR_UDID"

"$ORIENTATION_RUNNER" "$SIMULATOR_UDID" "$DEVICE_NAME" portrait
PORTRAIT_MARKER="$(mktemp -t chessticize-ui-calibration-portrait)"
touch "$PORTRAIT_MARKER"
CHESSTICIZE_STORE_ASSET_ORIENTATION=portrait pnpm mobile:e2e:store-assets:ios:release
copy_capture portrait "$PORTRAIT_MARKER" "${PORTRAIT_SCENES[@]}"

"$ORIENTATION_RUNNER" "$SIMULATOR_UDID" "$DEVICE_NAME" landscape
RESTORE_PORTRAIT=1
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
