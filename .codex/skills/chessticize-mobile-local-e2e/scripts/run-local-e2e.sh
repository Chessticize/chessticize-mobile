#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DEVICE_NAME="${DETOX_IOS_DEVICE:-iPhone 17-Detox}"
E2E_SCOPE="${CHESSTICIZE_E2E_SCOPE:-}"

fail() {
  echo "Local E2E evidence failed: $*" >&2
  exit 1
}

case "$E2E_SCOPE" in
  flows|practice|full)
    ;;
  *)
    fail "Set CHESSTICIZE_E2E_SCOPE to flows, practice, or full. Choose the smallest scope required by the PR risk matrix."
    ;;
esac

command -v brew >/dev/null 2>&1 || fail "Homebrew is required."
RUBY_PREFIX="${CHESSTICIZE_RUBY_PREFIX:-$(brew --prefix ruby@3.3 2>/dev/null || true)}"
[[ -n "$RUBY_PREFIX" && -x "$RUBY_PREFIX/bin/ruby" ]] || fail "Install Homebrew ruby@3.3 first."
export PATH="$REPO_ROOT/apps/mobile/node_modules/.bin:$RUBY_PREFIX/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

[[ "$(ruby -e 'print RUBY_VERSION.split(".")[0,2].join(".")')" == "3.3" ]] || fail "Ruby 3.3 must be active."
for required_command in git node pnpm bundle xcodebuild xcrun applesimutils; do
  command -v "$required_command" >/dev/null 2>&1 || fail "$required_command is required."
done

cd "$REPO_ROOT"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Commit or remove all worktree changes before recording exact-head evidence."
HEAD_BEFORE="$(git rev-parse HEAD)"

verify_nnue_asset() {
  local asset_path="$1"
  local asset_size

  [[ -f "$asset_path" ]] || fail "Missing $asset_path. Run git lfs pull for the Stockfish NNUE resources."
  asset_size="$(wc -c < "$asset_path" | tr -d ' ')"
  [[ "$asset_size" -gt 1000000 ]] || fail "$asset_path is a Git LFS pointer, not a neural-network binary. Run: git lfs pull --include='$(dirname "$asset_path")/*.nnue'"
}

while IFS= read -r stockfish_nnue_asset; do
  verify_nnue_asset "$stockfish_nnue_asset"
done < <(node scripts/lib/stockfish-artifacts.mjs --nnue-paths)

AVAILABLE_DEVICES="$(xcrun simctl list devices available)"
grep -Fq "$DEVICE_NAME (" <<<"$AVAILABLE_DEVICES" || fail "Dedicated simulator '$DEVICE_NAME' is not available."

run_doctor() {
  pnpm mobile:doctor:ios
}

run_build() {
  DETOX_IOS_DEVICE="$DEVICE_NAME" pnpm mobile:e2e:build:ios
  test -f apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/Chessticize.app/main.jsbundle
}

normalize_worktree_cocoapods_checksum() {
  local changed_files
  local lock_diff
  local unexpected_lines

  changed_files="$(git diff --name-only)"
  [[ -n "$changed_files" ]] || return 0

  if [[ "$changed_files" != "apps/mobile/ios/Podfile.lock" ]]; then
    fail "The build changed tracked files other than the known worktree-dependent Hermes checksum: $changed_files"
  fi

  lock_diff="$(git diff -- apps/mobile/ios/Podfile.lock)"
  unexpected_lines="$(
    printf '%s\n' "$lock_diff" |
      awk '/^[+-]/ && !/^\+\+\+/ && !/^---/ && $0 !~ /^[+-]  hermes-engine: [0-9a-f]{40}$/ { print }'
  )"
  [[ -z "$unexpected_lines" ]] || fail "Podfile.lock changed beyond the known worktree-dependent Hermes checksum."

  printf '%s\n' "$lock_diff" | git apply --reverse --whitespace=nowarn
  git diff --quiet -- apps/mobile/ios/Podfile.lock || fail "Could not normalize the worktree-dependent Hermes checksum."
  echo "Normalized worktree-dependent Hermes checksum in Podfile.lock."
}

run_suite() {
  local suite="$1"
  (
    cd apps/mobile
    DETOX_IOS_DEVICE="$DEVICE_NAME" \
      DETOX_ACTIVE_SUITE="$suite" \
      DETOX_MAX_WORKERS=1 \
      ./node_modules/.bin/detox test --configuration ios.sim.debug --cleanup
  )
}

STARTED_AT=$SECONDS
DOCTOR_STARTED=$SECONDS
run_doctor
DOCTOR_SECONDS=$((SECONDS - DOCTOR_STARTED))

BUILD_STARTED=$SECONDS
run_build
BUILD_SECONDS=$((SECONDS - BUILD_STARTED))
normalize_worktree_cocoapods_checksum

[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "The build changed tracked or untracked files before the selected suites ran."

FLOWS_SECONDS=""
PRACTICE_SECONDS=""

if [[ "$E2E_SCOPE" == "flows" || "$E2E_SCOPE" == "full" ]]; then
  FLOWS_STARTED=$SECONDS
  run_suite flows
  FLOWS_SECONDS=$((SECONDS - FLOWS_STARTED))
fi

if [[ "$E2E_SCOPE" == "practice" || "$E2E_SCOPE" == "full" ]]; then
  PRACTICE_STARTED=$SECONDS
  run_suite practice
  PRACTICE_SECONDS=$((SECONDS - PRACTICE_STARTED))
fi
TOTAL_SECONDS=$((SECONDS - STARTED_AT))

HEAD_AFTER="$(git rev-parse HEAD)"
[[ "$HEAD_AFTER" == "$HEAD_BEFORE" ]] || fail "HEAD changed during the gate."
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "The gate changed tracked or untracked files."

echo
echo "Local Detox evidence"
echo "Exact head: $HEAD_BEFORE"
echo "Scope: $E2E_SCOPE"
echo "Device: $DEVICE_NAME"
echo "Xcode: $(xcodebuild -version | tr '\n' ' ')"
echo "Ruby: $(ruby --version)"
echo "Doctor: PASS (${DOCTOR_SECONDS}s)"
echo "Build: PASS (${BUILD_SECONDS}s)"
if [[ -n "$FLOWS_SECONDS" ]]; then
  echo "Flows: PASS (${FLOWS_SECONDS}s)"
fi
if [[ -n "$PRACTICE_SECONDS" ]]; then
  echo "Practice: PASS (${PRACTICE_SECONDS}s)"
fi
echo "Total: ${TOTAL_SECONDS}s"
echo "Worktree: clean; HEAD unchanged"
