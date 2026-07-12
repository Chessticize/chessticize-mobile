#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DEVICE_NAME="${DETOX_IOS_DEVICE:-iPhone 17-Detox}"

fail() {
  echo "Local E2E gate failed: $*" >&2
  exit 1
}

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

AVAILABLE_DEVICES="$(xcrun simctl list devices available)"
grep -Fq "$DEVICE_NAME (" <<<"$AVAILABLE_DEVICES" || fail "Dedicated simulator '$DEVICE_NAME' is not available."

run_doctor() {
  pnpm mobile:doctor:ios
}

run_build() {
  DETOX_IOS_DEVICE="$DEVICE_NAME" pnpm mobile:e2e:build:ios
  test -f apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/Chessticize.app/main.jsbundle
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

FLOWS_STARTED=$SECONDS
run_suite flows
FLOWS_SECONDS=$((SECONDS - FLOWS_STARTED))

PRACTICE_STARTED=$SECONDS
run_suite practice
PRACTICE_SECONDS=$((SECONDS - PRACTICE_STARTED))
TOTAL_SECONDS=$((SECONDS - STARTED_AT))

HEAD_AFTER="$(git rev-parse HEAD)"
[[ "$HEAD_AFTER" == "$HEAD_BEFORE" ]] || fail "HEAD changed during the gate."
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "The gate changed tracked or untracked files."

echo
echo "Local Detox merge evidence"
echo "Exact head: $HEAD_BEFORE"
echo "Device: $DEVICE_NAME"
echo "Xcode: $(xcodebuild -version | tr '\n' ' ')"
echo "Ruby: $(ruby --version)"
echo "Doctor: PASS (${DOCTOR_SECONDS}s)"
echo "Build: PASS (${BUILD_SECONDS}s)"
echo "Flows: PASS (${FLOWS_SECONDS}s)"
echo "Practice: PASS (${PRACTICE_SECONDS}s)"
echo "Total: ${TOTAL_SECONDS}s"
echo "Worktree: clean; HEAD unchanged"
