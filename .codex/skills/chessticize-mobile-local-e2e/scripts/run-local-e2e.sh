#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DEVICE_NAME="${DETOX_IOS_DEVICE:-iPhone 17-Detox}"
E2E_SCOPE="${CHESSTICIZE_E2E_SCOPE:-}"
E2E_VARIANTS="${CHESSTICIZE_E2E_VARIANTS:-debug}"
REUSE_APP_SOURCE_SHA="${CHESSTICIZE_E2E_REUSE_APP_SOURCE_SHA:-}"

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

case "$E2E_VARIANTS" in
  debug)
    E2E_VARIANT_LIST=(debug)
    ;;
  release)
    E2E_VARIANT_LIST=(release)
    ;;
  both)
    E2E_VARIANT_LIST=(debug release)
    ;;
  *)
    fail "Set CHESSTICIZE_E2E_VARIANTS to debug|release|both. Release candidates must use both."
    ;;
esac

command -v brew >/dev/null 2>&1 || fail "Homebrew is required."
RUBY_PREFIX="${CHESSTICIZE_RUBY_PREFIX:-$(brew --prefix ruby@3.3 2>/dev/null || true)}"
NODE_PREFIX="${CHESSTICIZE_NODE_PREFIX:-$(brew --prefix node@22 2>/dev/null || true)}"
[[ -n "$RUBY_PREFIX" && -x "$RUBY_PREFIX/bin/ruby" ]] || fail "Install Homebrew ruby@3.3 first."
[[ -n "$NODE_PREFIX" && -x "$NODE_PREFIX/bin/node" ]] || fail "Install Homebrew node@22 first."
export PATH="$REPO_ROOT/apps/mobile/node_modules/.bin:$RUBY_PREFIX/bin:$NODE_PREFIX/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

[[ "$(ruby -e 'print RUBY_VERSION.split(".")[0,2].join(".")')" == "3.3" ]] || fail "Ruby 3.3 must be active."
for required_command in git node pnpm bundle xcodebuild xcrun applesimutils; do
  command -v "$required_command" >/dev/null 2>&1 || fail "$required_command is required."
done

cd "$REPO_ROOT"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Commit or remove all worktree changes before recording release evidence."
HEAD_BEFORE="$(git rev-parse HEAD)"

verify_nnue_asset() {
  local asset_path="$1"
  local asset_size

  [[ -f "$asset_path" ]] || fail "Missing $asset_path. Run git lfs pull for the Stockfish NNUE resources."
  asset_size="$(wc -c < "$asset_path" | tr -d ' ')"
  [[ "$asset_size" -gt 1000000 ]] || fail "$asset_path is a Git LFS pointer, not a neural-network binary. Run: git lfs pull --include='$(dirname "$asset_path")/*.nnue'"
}

if ! STOCKFISH_NNUE_ASSETS="$(node scripts/lib/stockfish-artifacts.mjs --nnue-paths)"; then
  fail "Could not enumerate Stockfish NNUE assets from artifact metadata."
fi
[[ -n "$STOCKFISH_NNUE_ASSETS" ]] || fail "Stockfish artifact metadata listed no NNUE assets."

STOCKFISH_NNUE_ASSET_COUNT=0
while IFS= read -r stockfish_nnue_asset; do
  [[ -n "$stockfish_nnue_asset" ]] || fail "Stockfish artifact metadata contains an empty NNUE path."
  [[ "$stockfish_nnue_asset" == apps/mobile/*.nnue && "$stockfish_nnue_asset" != *"/../"* && "$stockfish_nnue_asset" != *$'\r'* ]] ||
    fail "Malformed Stockfish NNUE asset path '$stockfish_nnue_asset'; expected a repository-relative apps/mobile/*.nnue path."
  verify_nnue_asset "$stockfish_nnue_asset"
  STOCKFISH_NNUE_ASSET_COUNT=$((STOCKFISH_NNUE_ASSET_COUNT + 1))
done <<<"$STOCKFISH_NNUE_ASSETS"
echo "Verified $STOCKFISH_NNUE_ASSET_COUNT Stockfish NNUE assets from artifact metadata."

AVAILABLE_DEVICES="$(xcrun simctl list devices available)"
grep -Fq "$DEVICE_NAME (" <<<"$AVAILABLE_DEVICES" || fail "Dedicated simulator '$DEVICE_NAME' is not available."

run_doctor() {
  pnpm mobile:doctor:ios
}

set_variant_paths() {
  local variant="$1"

  case "$variant" in
    debug)
      APP_BUNDLE="apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/Chessticize.app"
      APP_MANIFEST="apps/mobile/ios/build/chessticize-e2e-app-manifest.json"
      REUSE_COMPARISON="apps/mobile/ios/build/chessticize-e2e-reuse.json"
      DETOX_CONFIGURATION="ios.sim.debug"
      ;;
    release)
      APP_BUNDLE="apps/mobile/ios/build-release/Build/Products/Release-iphonesimulator/Chessticize.app"
      APP_MANIFEST="apps/mobile/ios/build-release/chessticize-e2e-app-manifest.json"
      REUSE_COMPARISON="apps/mobile/ios/build-release/chessticize-e2e-reuse.json"
      DETOX_CONFIGURATION="ios.sim.release"
      ;;
    *)
      fail "Unsupported iOS E2E variant '$variant'."
      ;;
  esac
}

run_build() {
  local variant="$1"

  case "$variant" in
    debug)
      DETOX_IOS_DEVICE="$DEVICE_NAME" pnpm mobile:e2e:build:ios
      ;;
    release)
      CHESSTICIZE_IOS_PREPARE=1 \
        DETOX_IOS_DEVICE="$DEVICE_NAME" \
        pnpm mobile:e2e:build:ios:release
      ;;
  esac
  test -f "$APP_BUNDLE/main.jsbundle"
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
      ./node_modules/.bin/detox test --configuration "$DETOX_CONFIGURATION" --cleanup
  )
}

STARTED_AT=$SECONDS
DOCTOR_STARTED=$SECONDS
run_doctor
DOCTOR_SECONDS=$((SECONDS - DOCTOR_STARTED))

EVIDENCE_VARIANTS=()
EVIDENCE_APP_SOURCES=()
EVIDENCE_BUILD_RESULTS=()
EVIDENCE_BUILD_SECONDS=()
EVIDENCE_MANIFESTS=()
EVIDENCE_INPUT_DIGESTS=()
EVIDENCE_ARTIFACT_SHA256S=()
EVIDENCE_FLOWS_SECONDS=()
EVIDENCE_PRACTICE_SECONDS=()

for variant in "${E2E_VARIANT_LIST[@]}"; do
  set_variant_paths "$variant"
  BUILD_STARTED=$SECONDS
  if [[ -n "$REUSE_APP_SOURCE_SHA" ]]; then
    [[ -d "$APP_BUNDLE" ]] || fail "The reusable $variant iOS App bundle is missing; run one normal $variant build first."
    [[ -f "$APP_MANIFEST" ]] || fail "The reusable $variant iOS App manifest is missing; run one normal $variant build first."
    node apps/mobile/scripts/mobile-app-inputs.js verify-artifact \
      --app-source-sha "$REUSE_APP_SOURCE_SHA" \
      --test-runner-sha "$HEAD_BEFORE" \
      --artifact "$APP_BUNDLE" \
      --manifest "$APP_MANIFEST" \
      --output "$REUSE_COMPARISON"
    APP_SOURCE_SHA="$REUSE_APP_SOURCE_SHA"
    BUILD_RESULT="REUSED"
    IDENTITY_RECORD="$REUSE_COMPARISON"
  else
    run_build "$variant"
    normalize_worktree_cocoapods_checksum
    node apps/mobile/scripts/mobile-app-inputs.js record-artifact \
      --app-source-sha "$HEAD_BEFORE" \
      --artifact "$APP_BUNDLE" \
      --output "$APP_MANIFEST"
    APP_SOURCE_SHA="$HEAD_BEFORE"
    BUILD_RESULT="PASS"
    IDENTITY_RECORD="$APP_MANIFEST"
  fi
  BUILD_SECONDS=$((SECONDS - BUILD_STARTED))
  APP_INPUT_DIGEST="$(
    node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).appInputDigest);' \
      "$IDENTITY_RECORD"
  )"
  APP_ARTIFACT_SHA256="$(
    node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).artifactSha256);' \
      "$IDENTITY_RECORD"
  )"

  [[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "The $variant build changed tracked or untracked files before the selected suites ran."

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

  evidence_index=${#EVIDENCE_VARIANTS[@]}
  EVIDENCE_VARIANTS[$evidence_index]="$variant"
  EVIDENCE_APP_SOURCES[$evidence_index]="$APP_SOURCE_SHA"
  EVIDENCE_BUILD_RESULTS[$evidence_index]="$BUILD_RESULT"
  EVIDENCE_BUILD_SECONDS[$evidence_index]="$BUILD_SECONDS"
  EVIDENCE_MANIFESTS[$evidence_index]="$APP_MANIFEST"
  EVIDENCE_INPUT_DIGESTS[$evidence_index]="$APP_INPUT_DIGEST"
  EVIDENCE_ARTIFACT_SHA256S[$evidence_index]="$APP_ARTIFACT_SHA256"
  EVIDENCE_FLOWS_SECONDS[$evidence_index]="$FLOWS_SECONDS"
  EVIDENCE_PRACTICE_SECONDS[$evidence_index]="$PRACTICE_SECONDS"
done
TOTAL_SECONDS=$((SECONDS - STARTED_AT))

HEAD_AFTER="$(git rev-parse HEAD)"
[[ "$HEAD_AFTER" == "$HEAD_BEFORE" ]] || fail "HEAD changed during the gate."
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "The gate changed tracked or untracked files."

echo
echo "Local Detox evidence"
echo "Test runner: $HEAD_BEFORE"
echo "Scope: $E2E_SCOPE"
echo "Variants: $E2E_VARIANTS"
echo "Device: $DEVICE_NAME"
echo "Xcode: $(xcodebuild -version | tr '\n' ' ')"
echo "Ruby: $(ruby --version)"
echo "Doctor: PASS (${DOCTOR_SECONDS}s)"
for evidence_index in "${!EVIDENCE_VARIANTS[@]}"; do
  echo "${EVIDENCE_VARIANTS[$evidence_index]} App source: ${EVIDENCE_APP_SOURCES[$evidence_index]}"
  echo "${EVIDENCE_VARIANTS[$evidence_index]} build: ${EVIDENCE_BUILD_RESULTS[$evidence_index]} (${EVIDENCE_BUILD_SECONDS[$evidence_index]}s)"
  echo "${EVIDENCE_VARIANTS[$evidence_index]} App manifest: ${EVIDENCE_MANIFESTS[$evidence_index]}"
  echo "${EVIDENCE_VARIANTS[$evidence_index]} App input digest: ${EVIDENCE_INPUT_DIGESTS[$evidence_index]}"
  echo "${EVIDENCE_VARIANTS[$evidence_index]} App artifact SHA-256: ${EVIDENCE_ARTIFACT_SHA256S[$evidence_index]}"
  if [[ -n "${EVIDENCE_FLOWS_SECONDS[$evidence_index]}" ]]; then
    echo "${EVIDENCE_VARIANTS[$evidence_index]} flows: PASS (${EVIDENCE_FLOWS_SECONDS[$evidence_index]}s)"
  fi
  if [[ -n "${EVIDENCE_PRACTICE_SECONDS[$evidence_index]}" ]]; then
    echo "${EVIDENCE_VARIANTS[$evidence_index]} practice: PASS (${EVIDENCE_PRACTICE_SECONDS[$evidence_index]}s)"
  fi
done
echo "Total: ${TOTAL_SECONDS}s"
echo "Worktree: clean; HEAD unchanged"
