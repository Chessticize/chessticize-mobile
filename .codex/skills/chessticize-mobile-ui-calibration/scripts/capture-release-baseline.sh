#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DEVICE_NAME="${DETOX_IOS_DEVICE:-iPhone 17-Detox}"
WORKER_COUNT="${DETOX_MAX_WORKERS:-1}"
EXPECTED_SCENES=(
  app-store-01-practice-tab
  app-store-02-review-tab
  app-store-03-history-tab
  app-store-04-settings-tab
  app-store-05-standard-sprint
  app-store-06-arrow-duel
  app-store-07-custom-setup
  app-store-08-review-session
)

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cd "$REPO_ROOT"

[[ "$(uname -s)" == "Darwin" ]] || fail "Release simulator calibration requires macOS."
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "Run inside the Chessticize Mobile repository."

HEAD_BEFORE="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=7 HEAD)"
STATUS_BEFORE="$(git status --porcelain --untracked-files=normal)"
[[ -z "$STATUS_BEFORE" ]] || fail "Commit or remove worktree changes before exact-head calibration."

export DETOX_IOS_DEVICE="$DEVICE_NAME"
export DETOX_MAX_WORKERS="$WORKER_COUNT"

echo "Calibrating commit $HEAD_BEFORE on $DEVICE_NAME"
pnpm mobile:doctor:ios
pnpm mobile:e2e:build:ios:release

CAPTURE_MARKER="$(mktemp -t chessticize-ui-calibration)"
trap 'rm -f "$CAPTURE_MARKER"' EXIT
touch "$CAPTURE_MARKER"

pnpm mobile:e2e:store-assets:ios:release

REVIEW_SCREENSHOT=""
while IFS= read -r candidate; do
  REVIEW_SCREENSHOT="$candidate"
done < <(
  find apps/mobile/artifacts/store-assets \
    -type f \
    -name 'app-store-08-review-session.png' \
    -newer "$CAPTURE_MARKER" \
    -print
)

[[ -n "$REVIEW_SCREENSHOT" ]] || fail "Could not find the new eight-scene Release capture."
SOURCE_DIR="$(dirname "$REVIEW_SCREENSHOT")"
DESTINATION="$REPO_ROOT/scratch/rendering-checks/$SHORT_SHA/release"
mkdir -p "$DESTINATION"

for scene in "${EXPECTED_SCENES[@]}"; do
  source_path="$SOURCE_DIR/$scene.png"
  [[ -f "$source_path" ]] || fail "Missing expected screenshot: $scene.png"
  cp "$source_path" "$DESTINATION/$scene.png"
done

SCREENSHOT_COUNT="$(find "$DESTINATION" -maxdepth 1 -type f -name 'app-store-*.png' | wc -l | tr -d ' ')"
[[ "$SCREENSHOT_COUNT" == "${#EXPECTED_SCENES[@]}" ]] || \
  fail "Expected exactly ${#EXPECTED_SCENES[@]} screenshots in $DESTINATION, found $SCREENSHOT_COUNT."

HEAD_AFTER="$(git rev-parse HEAD)"
STATUS_AFTER="$(git status --porcelain --untracked-files=normal)"
[[ "$HEAD_AFTER" == "$HEAD_BEFORE" ]] || fail "HEAD changed during calibration."
[[ -z "$STATUS_AFTER" ]] || fail "Tracked or untracked files changed during calibration."

echo "UI calibration capture passed."
echo "Commit: $HEAD_BEFORE"
echo "Simulator: $DEVICE_NAME"
echo "Screenshots: $DESTINATION"
echo "Scenes: ${#EXPECTED_SCENES[@]}"
