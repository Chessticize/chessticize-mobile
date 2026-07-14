---
name: chessticize-mobile-local-e2e
description: Prepare and validate the Chessticize Mobile macOS/iOS environment and fresh Git worktrees, run risk-scoped exact-head local Detox evidence for flows, practice, or the full suite, diagnose Xcode, Ruby, CocoaPods, Git LFS, Simulator, or Detox failures, and record auditable results. Use when a PR crosses an iOS native boundary, when nightly or release validation needs the complete suite, when setting up a Mac or worktree for Detox, or when measuring local E2E duration.
---

# Chessticize Mobile Local E2E

Run the selected iOS Detox scope on a dedicated simulator and record evidence for the exact commit tested. Treat environment preparation, PR risk selection, and release validation as separate phases.

## Safety Rules

- Run only on macOS with full Xcode and an installed iOS Simulator runtime.
- Use a dedicated simulator such as `iPhone 17-Detox`. Never use the simulator that holds manual-test data: Detox launches with `delete: true` and wipes the app sandbox.
- Commit the intended code first and require a clean worktree before producing merge evidence.
- Rebuild and rerun the selected scope after any code change. Evidence from an older commit is invalid.
- Choose `flows`, `practice`, or `full` from the repository risk matrix. Do not default a routine PR to `full` without a broad native reason.
- Do not wait for nightly GitHub Detox before merging a routine PR. All relevant fast CI checks must still pass.
- Do not weaken Ruby, package-manager, signing, or certificate checks to make setup pass.

## Prepare the Mac

### 1. Install and select Xcode

Install full Xcode, open it once, install an iOS Simulator runtime, then verify:

```sh
xcode-select -p
xcodebuild -version
xcrun simctl list runtimes available
```

If Command Line Tools are selected, switch to Xcode from an authorized Terminal session:

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
```

Ask before running commands that require `sudo` or change the active developer directory.

### 2. Install Node, pnpm, and JavaScript dependencies

Use Node 22.11 or newer and the repository-pinned pnpm version:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
```

`package.json` currently pins pnpm 11.1.2. If the pnpm launcher hangs on signature or registry verification, install that pinned version normally; never disable signature verification.

### 3. Hydrate Git LFS resources in every fresh worktree

Git worktrees can contain the 132-byte NNUE pointer files even when another checkout has the real binaries. Hydrate the Stockfish networks before building:

```sh
git lfs pull --include='apps/mobile/native/stockfish/Resources/*.nnue'
wc -c apps/mobile/native/stockfish/Resources/*.nnue
```

Expect both files to exceed 1 MB. Pointer files can compile and be copied into the app bundle, but opening Analysis then terminates Stockfish and appears in Detox as `The app has unexpectedly disconnected from Detox server.`

### 4. Use Ruby 3.3 for the locked CocoaPods bundle

The currently verified local combination is Homebrew Ruby 3.3 plus Bundler 2.4.22. Do not use:

- macOS system Ruby 2.6 with Xcode 26: native gem headers are unavailable.
- Ruby 3.4 with the current Gemfile: CocoaPods can fail loading `base64`.
- Ruby 4 with the current lock: `minitest` 5.25.4 requires Ruby below 4.

Prepare Ruby and the repo-local bundle:

```sh
brew install ruby@3.3
export PATH="$(brew --prefix ruby@3.3)/bin:$PATH"
ruby --version
gem install bundler -v 2.4.22
cd apps/mobile
BUNDLE_FROZEN=true bundle _2.4.22_ install
cd ../..
```

Keep gems under `apps/mobile/vendor/bundle` as configured by `.bundle/config`. Do not update `Gemfile.lock` during environment setup.

Install the bundle once per fresh worktree; the ignored `vendor/bundle` directory is not shared automatically between worktrees.

### 5. Install Detox simulator utilities

```sh
brew tap wix/brew
brew install applesimutils
applesimutils --version
```

If Homebrew requires formula trust, use its displayed `brew trust --formula wix/brew/applesimutils` command and retry.

### 6. Create a dedicated simulator

Inspect installed identifiers:

```sh
xcrun simctl list devicetypes
xcrun simctl list runtimes available
xcrun simctl list devices available
```

If `iPhone 17-Detox` does not exist, create it with an installed device type and runtime. Example identifiers are illustrative; select identifiers present on the current Mac:

```sh
xcrun simctl create "iPhone 17-Detox" \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17 \
  com.apple.CoreSimulator.SimRuntime.iOS-27-0
```

### 7. Run the environment doctor

```sh
export PATH="$(brew --prefix ruby@3.3)/bin:$PATH"
pnpm mobile:doctor:ios
```

If Detox reports a missing framework cache, rebuild it:

```sh
pnpm --filter ChessticizeMobile exec detox clean-framework-cache
pnpm --filter ChessticizeMobile exec detox build-framework-cache
```

## Choose The Scope

- Use `flows` for affected app-shell, navigation, History, Settings, Analysis, or other flows-suite journeys.
- Use `practice` for affected Practice, Review, sprint, board, or practice-suite journeys.
- Use `full` for nightly/release validation and PRs that change app startup, shared navigation/storage wiring, global launch fixtures, native build configuration, Detox infrastructure, or risk that cannot be bounded to one suite.
- Use a focused simulator screenshot instead of this runner for a visual-only acceptance check when no repeatable journey changed.

Record the choice and rationale in the PR before running native validation.

## Run Exact-Head Evidence

Prefer the bundled runner from the repository root:

```sh
CHESSTICIZE_E2E_SCOPE=practice \
  DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh
```

Replace `practice` with `flows` or `full`. The runner requires an explicit scope so a routine PR cannot accidentally pay for the complete suite.

The runner:

1. Selects Homebrew Ruby 3.3.
2. Requires a clean git worktree and records `HEAD`.
3. Rejects unhydrated Git LFS pointer files for the Stockfish NNUE networks.
4. Verifies the dedicated simulator and iOS environment.
5. Builds the app with bundled JavaScript.
6. Normalizes only the known worktree-dependent Hermes checksum when that is the build's sole tracked change; any other tracked or untracked build output fails the gate.
7. Runs the selected suite, or both suites for `full`, with one worker.
8. Verifies the commit and worktree did not change.
9. Prints per-step timing and a PR evidence summary.

To run commands manually, use the same order and run only the selected scope. This example shows `practice`:

```sh
export PATH="$(brew --prefix ruby@3.3)/bin:$PATH"
export DETOX_IOS_DEVICE="iPhone 17-Detox"
export DETOX_MAX_WORKERS=1

pnpm mobile:doctor:ios
pnpm mobile:e2e:build:ios

cd apps/mobile
DETOX_ACTIVE_SUITE=practice ./node_modules/.bin/detox test \
  --configuration ios.sim.debug --cleanup
```

For `full`, run the same command once with `DETOX_ACTIVE_SUITE=flows` and once with `DETOX_ACTIVE_SUITE=practice`; reuse the same build.

The build must create:

```text
apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/Chessticize.app/main.jsbundle
```

Its presence proves the Detox app does not depend on Metro.

## Diagnose Failures

- `CoreSimulatorService connection became invalid` or log permission errors: retry simulator commands outside a restricted sandbox; do not recreate devices based only on sandbox failure.
- Missing gems or native-extension compiler failures: confirm Ruby 3.3 is first in `PATH`, then rerun the frozen Bundler install.
- `cannot load such file -- base64`: Ruby 3.4 is active; switch to Ruby 3.3.
- `minitest ... requires ruby version < 4.0`: Ruby 4 is active; switch to Ruby 3.3.
- `jest: command not found` from Detox: ensure `apps/mobile/node_modules/.bin` is in `PATH`, or invoke the repository script, which does this.
- Analysis-button tests disconnect from Detox without a crash report: check that both `Resources/*.nnue` files exceed 1 MB. If they are 132-134 byte LFS pointers, run the scoped `git lfs pull` command above, rebuild, and rerun the focused test before both complete suites.
- Missing `main.jsbundle`: rebuild with `pnpm mobile:e2e:build:ios`; do not trust a Metro-only app.
- A suite fails: inspect the exact failing spec and product state. Rerun the focused spec to diagnose, fix the cause, then rebuild and rerun the originally selected scope. Rerun both suites only when `full` was required.
- `pod install` changes only the Hermes checksum in `Podfile.lock`: the runner verifies that exact diff and normalizes it because React Native embeds the worktree path in the podspec checksum.
- `pod install` dirties the Xcode project, workspace, another lock entry, or any other tracked file: stop. Fix the environment or intentionally commit the CocoaPods change; the runner must not hide it.

## Record PR Evidence

When a PR requires native validation, add a PR comment containing:

- Full tested commit SHA.
- Selected scope and rationale.
- Xcode version and simulator name.
- Build command and success.
- Each required suite command, pass count, and duration.
- Total duration.
- Confirmation that the worktree remained clean and `HEAD` did not change.

Then verify all relevant fast checks before merging. Any code change after the recorded SHA invalidates the evidence. Nightly and release runs must use `full` and require both suites.
