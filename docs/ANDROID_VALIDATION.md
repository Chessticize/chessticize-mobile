# Android Validation

This runbook is the source of truth for choosing and recording Android native
validation. Android Detox starts the real application, drives public UI, and
lets production code create and read the production SQLite progress database
and bundled puzzle pack. Tests must not call stores, repositories, native
modules, or test-only data-writing helpers directly.

## Local preflight and diagnostics

Use a JDK 17 `JAVA_HOME` whose `java`, `jar`, `jarsigner`, and `keytool`
binaries are on `PATH`. A Homebrew JDK may be installed without being
registered with macOS, so `/usr/bin/java` can still report that no runtime is
available. In that case, set the environment explicitly before the preflight:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

Install the lockfile-pinned dependencies and puzzle pack before native work:

```sh
pnpm install --frozen-lockfile
pnpm fetch:core-pack
pnpm mobile:doctor:android
adb devices -l
emulator -list-avds
```

`pnpm mobile:doctor:android` reports Java, Android SDK/API and Build Tools, NDK,
ADB, emulator/AVDs, Gradle, production signing, shared native-library inputs,
Detox, JavaScript dependencies, and the puzzle pack as separate checks. Missing
production signing is a warning for development validation because release
packaging already fails closed. Partial signing configuration, missing native
inputs, or missing Detox are failures. Build-time ABI and 16 KB native-library
inspection remains `pnpm mobile:verify:android:abis` after the APK exists.

## Smallest proving layer

- **No Android Detox:** documentation/tooling, pure core/storage/CLI work, and
  ordinary shared React Native copy, state, styling, accessibility, or service
  wiring already proven by the relevant fast tests.
- **Targeted Android validation:** one Android-specific spec or one shared suite
  for a bounded navigation, persistence, real board, adaptive-layout, reminder,
  Back, or native-module boundary.
- **Full Android validation:** one build followed by complete `flows` and
  `practice` for app startup, shared navigation or storage wiring, global launch
  fixtures bundled into the App, native build configuration, or an otherwise
  unbounded native risk. A broad host-side Detox runner change may rerun both
  suites against the verified existing APKs without rebuilding them.

Record the chosen scope and rationale in the PR. App build inputs, test-runner
inputs, and record-only inputs follow the separate evidence identities in
`docs/TESTING_ARCHITECTURE.md`.

## Local Android matrix

Android emulator and Detox validation runs only on the local Android build
machine. GitHub Actions must not boot an Android emulator, build the E2E APKs,
or run Detox. The protected GitHub workflows remain responsible only for the
production-signed AAB and corresponding source, source-publication recovery,
and the post-Play APK mirror.

Use an existing compatible AVD when possible. The primary profile is API 36
with at least 4096 MB RAM and 8192 MB data capacity. Create or boot an API 24
AVD only when the changed boundary requires the bounded compatibility smoke.
On Apple Silicon, use an `arm64-v8a` system image; on Intel hosts use
`x86_64`. The E2E APK supports both ABIs.

For a deterministic headless API 36 run on Apple Silicon, prefer a cold
software-GPU boot:

```sh
emulator -avd Chessticize_API_36_Release \
  -memory 4096 -partition-size 8192 -cores 4 \
  -gpu swiftshader \
  -no-snapshot-load -no-snapshot-save \
  -no-audio -no-boot-anim -no-window
```

If a host-GPU run produces `bad color buffer handle`, QEMU I/O-thread spin, or
a `System UI isn't responding` window, classify and retain that failed run,
cold-stop the AVD, and make at most one explicit rerun with the software-GPU
command above. Do not let the matrix retry a suite automatically.

Build the self-contained app and Detox test APK once:

```sh
pnpm mobile:e2e:build:android
pnpm mobile:verify:android:abis
```

Then run the selected scope against the attached emulator:

```sh
export DETOX_ANDROID_DEVICE=emulator-5554
export ANDROID_VALIDATION_DEVICE_ABI="$(
  adb -s "$DETOX_ANDROID_DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r'
)"
ANDROID_VALIDATION_COMMIT_SHA="$(git rev-parse HEAD)" \
ANDROID_VALIDATION_BUILD_RESULT=success \
ANDROID_VALIDATION_DEVICE_ABI="$ANDROID_VALIDATION_DEVICE_ABI" \
ANDROID_VALIDATION_DEVICE_PROFILE=pixel_2 \
DETOX_ANDROID_DEVICE="$DETOX_ANDROID_DEVICE" \
pnpm mobile:validate:android:matrix -- --api-level 36 \
  --output apps/mobile/artifacts/android-validation/api-36.json
```

Add `--suite <name>` for targeted validation. A full scope uses API 36 without
`--suite`, which runs the complete shared `flows` and `practice` suites plus
the registered Android journeys. Replace `36` with `24` only for the bounded
compatibility smoke. Do not run API 24 merely because a build number advanced.

The API 24 smoke contains only:

- cold launch into Practice through public UI;
- a deterministic Standard sprint that writes and reopens production SQLite;
- migration of a released progress fixture, verified through public UI; and
- one packaged Stockfish analysis through the public Settings diagnostics
  surface.

It intentionally does not copy the complete API 36 journeys. The shared suites
remain the product-journey source of truth on both iOS and Android. The command
rejects an unsupported API or suite, a missing or mismatched test-runner SHA, a
dirty tracked worktree, changed App inputs, changed artifact bytes, a
failed/missing step, or incomplete build/device data. It writes passing
evidence only after every selected command succeeds and it has rechecked the
checkout head and clean tracked worktree.

The runner writes `api-<level>.progress.json` before and after every prepare,
install, native, and Detox step. If the process fails or is interrupted, keep
that file with Android UI diagnostics and classify the exact last running step
before retrying. Only `api-<level>.json`, written after every selected step
passes, is release evidence; the progress file is diagnostic evidence and
never converts a partial run into a pass. Do not automatically retry a failed
API 24 or API 36 run. Fix or classify the failure, then rerun only the affected
local scope.

## R8-optimized release validation

When release minification, resource shrinking, keep rules, or the Android
Gradle optimization boundary changes, a debug or ordinary `e2e` APK is not
valid evidence. Build both the production `release` output and the
`releaseE2e` validation output from the same clean exact source commit:

```sh
pnpm mobile:e2e:build:android:release

pnpm mobile:verify:android:r8 -- \
  --variant releaseE2e \
  --apk apps/mobile/android/app/build/outputs/apk/releaseE2e/app-releaseE2e.apk \
  --bundle apps/mobile/android/app/build/outputs/bundle/releaseE2e/app-releaseE2e.aab \
  --mapping-dir apps/mobile/android/app/build/outputs/mapping/releaseE2e \
  --output apps/mobile/artifacts/android-r8/release-e2e.json
```

`releaseE2e` inherits the release optimization graph and is debug-signed only
for local emulator installation. It adds Detox's test-only keep rules so the
instrumentation protocol can inspect React Native, plus an exact-class test ABI
for the separately compiled reminder integration test. Those rules are
deliberately absent from the production `release` build. Therefore also inspect
the production `release` mapping directory with `mobile:verify:android:r8`; the
protected candidate workflow performs that check again on the upload-signed
AAB and retains `configuration.txt`, `mapping.txt`, `resources.txt`,
`seeds.txt`, and `usage.txt` beside the candidate for 30 days.

Run the full API 36 matrix against the release-derived pair:

```sh
export DETOX_ANDROID_DEVICE=emulator-5554
export ANDROID_VALIDATION_DEVICE_ABI="$(
  adb -s "$DETOX_ANDROID_DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r'
)"
ANDROID_VALIDATION_COMMIT_SHA="$(git rev-parse HEAD)" \
ANDROID_VALIDATION_BUILD_RESULT=success \
ANDROID_VALIDATION_DEVICE_ABI="$ANDROID_VALIDATION_DEVICE_ABI" \
ANDROID_VALIDATION_DEVICE_PROFILE=pixel_2 \
DETOX_ANDROID_DEVICE="$DETOX_ANDROID_DEVICE" \
pnpm mobile:validate:android:r8 -- --api-level 36 \
  --output apps/mobile/artifacts/android-validation/r8-api-36.json
```

The matrix rejects a release-derived run unless its optimization report, App
source SHA, variant, and APK artifact-identity checksum match. It covers launch and installed
version metadata, system Back and the API-gated predictive-Back bridge,
Stockfish start/send/cancel/reuse, reminder scheduling and notification entry,
and the complete shared `flows` and `practice` journeys. Run the conditional
Progress Backup policy/restore profile as well when build-wide shrinking could
affect manifest entry points. The production APK/AAB inspection plus the
release-derived runtime matrix form one result; neither substitutes for the
other.

For a reproducible before/after runtime sample, use the same dedicated device,
fresh-install choice, component, run count, and ART compilation reset:

```sh
pnpm mobile:benchmark:android:runtime -- \
  --fresh-install \
  --variant release \
  --apk apps/mobile/android/app/build/outputs/apk/release/app-release.apk \
  --device emulator-5554 \
  --component com.chessticize.mobile/.MainActivity \
  --runs 5 \
  --output apps/mobile/artifacts/android-r8/runtime-release.json
```

This local APK may use the repository debug keystore only for measurement. It
is not a signed candidate and must never be uploaded or described as release
signing evidence.

## Test-only reruns with retained APKs

During an active RC freeze, first classify the finding under
`docs/RELEASE_SOURCE_POLICY.md`. A host-side test-runner correction uses the
retained-APK path below without moving the frozen release branch. A product,
App-input, or required release-identity correction invalidates that RC
generation before its focused fix merges; freeze a new generation afterward
and rebuild only the affected artifacts and validation scope. Planned
development and non-blocking polish wait for the next version.

When a failure is classified as a host-side spec, selector, wait, assertion,
evidence collector, or non-bundled fixture defect, do not rebuild the App.
Retain the locally built APK pair and record its manifest before changing the
test runner:

```sh
app_source_sha="$(git rev-parse HEAD)"
retained_root="scratch/android-validation/$app_source_sha"
mkdir -p "$retained_root/apks/app" "$retained_root/apks/androidTest"
cp apps/mobile/android/app/build/outputs/apk/e2e/app-e2e.apk \
  "$retained_root/apks/app/"
cp apps/mobile/android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk \
  "$retained_root/apks/androidTest/"
node apps/mobile/scripts/mobile-app-inputs.js record-artifact \
  --app-source-sha "$app_source_sha" \
  --artifact "$retained_root/apks" \
  --output "$retained_root/apks-manifest.json"
```

After committing the test correction, keep current-head fast checks green,
verify both the App inputs and retained bytes, restore the APKs to their
expected build paths, and run only the smallest affected local scope:

```sh
app_source_sha=<exact-App-source-sha>
test_runner_sha="$(git rev-parse HEAD)"
retained_root="scratch/android-validation/$app_source_sha"
node apps/mobile/scripts/mobile-app-inputs.js verify-artifact \
  --app-source-sha "$app_source_sha" \
  --test-runner-sha "$test_runner_sha" \
  --artifact "$retained_root/apks" \
  --manifest "$retained_root/apks-manifest.json" \
  --output apps/mobile/artifacts/android-validation/artifact-reuse.json
mkdir -p apps/mobile/android/app/build/outputs/apk/e2e \
  apps/mobile/android/app/build/outputs/apk/androidTest/e2e
cp "$retained_root/apks/app/app-e2e.apk" \
  apps/mobile/android/app/build/outputs/apk/e2e/
cp "$retained_root/apks/androidTest/app-e2e-androidTest.apk" \
  apps/mobile/android/app/build/outputs/apk/androidTest/e2e/
export DETOX_ANDROID_DEVICE=emulator-5554
export ANDROID_VALIDATION_DEVICE_ABI="$(
  adb -s "$DETOX_ANDROID_DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r'
)"
ANDROID_VALIDATION_COMMIT_SHA="$(git rev-parse HEAD)" \
ANDROID_VALIDATION_APP_SOURCE_SHA="$app_source_sha" \
ANDROID_VALIDATION_BUILD_RESULT=success \
ANDROID_VALIDATION_DEVICE_ABI="$ANDROID_VALIDATION_DEVICE_ABI" \
ANDROID_VALIDATION_DEVICE_PROFILE=pixel_2 \
DETOX_ANDROID_DEVICE="$DETOX_ANDROID_DEVICE" \
pnpm mobile:validate:android:matrix -- --api-level 36 \
  --suite android-history \
  --output apps/mobile/artifacts/android-validation/test-only-android-history.json
```

Replace `android-history` with the smallest affected suite. This path never
invokes Gradle. If either comparison rejects reuse, stop and create a fresh
local build.

For a transient failure on the same commit, rerun only the affected local
command once after recording the infrastructure cause. For a test correction
on a new commit, the evidence records distinct App source and test-runner SHAs.
If the classifier reports any App build input change, stop and run a normal
build plus the selected native scope. Expected-result changes require failure
classification and review; they must not normalize an unexplained product
regression. The classifier is a trust anchor and intentionally invalidates
reuse when its own implementation changes.

## Adaptive contract

When adaptive presentation changed, run
`apps/mobile/scripts/android-adaptive-layout-evidence.sh` locally on API 36.
It reaches the real sprint through public UI and checks phone rotation plus
representative tablet, foldable/resizable, ChromeOS-style, and large-text
profiles. Retain the JSON/text context, display metrics, assertions, and
screenshots under `apps/mobile/artifacts/android-adaptive-layout/` and visually
inspect representative phone, tablet, and foldable captures.

When Android Progress Backup changed, run its Gradle policy test and only the
affected local API profiles:

```sh
(cd apps/mobile/android && \
  ./gradlew :app:testDebugUnitTest \
    --tests com.chessticize.mobile.backup.ProgressBackupPolicyTest --no-daemon)
DETOX_ANDROID_DEVICE=emulator-5554 \
  apps/mobile/scripts/android-progress-backup-policy-evidence.sh
```

The policy script accepts API 24, 30, or 36. The API 30 inherited-framework
restore consumes the retained API 36 evidence through
`ANDROID_BACKUP_API36_SOURCE_DIR`; run API 36 first and point API 30 at that
local directory. These profiles are conditional boundary evidence, not an
automatic release matrix.

## Deterministic fixtures

E2E uses a small deterministic fixture identity or seed to select known puzzles
from the shipped bundled pack. Production puzzle selection, PracticeService,
and production SQLite still perform all reads and writes. Launch arguments may
fix time, permission state, or puzzle choice at maintained native boundaries;
they must not inject attempts, ratings, review rows, or settings behind the
public UI.

## Native evidence contract

Every required native result must record the following fields and retain the
local command log plus artifacts with the PR or release record:

- App source SHA, test-runner SHA, App-input digest, APK checksums, and build result;
- commands and selected validation scope;
- device matrix, including API/OS, ABI, profile/model, and serial or redacted
  physical identifier;
- suite results and any retry or failure classification;
- clean tracked worktree confirmation before and after execution;
- artifact names/links and screenshot review where visual behavior is in scope.

The automated API evidence JSON uses schema version 2 and records
`appSourceSha`, `testRunnerSha`, `appVariant`, `appInputDigest`, `artifacts`,
`buildResult`, `commands`, `deviceMatrix`, `suiteResults`, `worktreeClean`, and
the overall `result`. R8 runs also record checksum-bound
`optimizationEvidence`. `commitSha` remains a compatibility alias for
`testRunnerSha`. A missing required field is not passing evidence.

The two SHAs may differ when
`node apps/mobile/scripts/mobile-app-inputs.js compare` proves the App build
inputs are unchanged. Runtime/domain, native/platform or native test-APK,
dependency, build/release, or bundled fixture/resource changes require a new
build and selected native scope. Host-side specs, selectors, assertions,
collectors, and non-bundled fixtures require only the affected test rerun.
Documentation, review metadata, agent guidance, and merge ancestry require
neither.

## Optional physical ARM64 diagnostic checklist

This is optional owner-recorded diagnostic evidence. The Stockfish lifecycle
subset remains tracked by #200, and the complete checklist is preserved with
release issue #188 for investigations that benefit from real hardware.
Physical hardware availability is not a feature-PR or release blocker.

Do not run this checklist for an ordinary delta solely because the build number
advanced. Use it when diagnosing device-specific behavior or when the owner
wants extra confidence after publication. Risk-scoped local simulator/emulator
evidence remains the release standard.

If the checklist is run, record the exact candidate SHA, AAB/APK identity and
checksum, signing certificate, device model, Android version, `arm64-v8a` ABI,
commands, timestamps, results, retries, and redacted evidence links before
checking any item.

- [ ] **Install and cold start:** install the exact candidate without debug or
  test substitution, launch from a stopped state, and confirm the public
  Practice home and installed version/build.
- [ ] **Real board input:** complete representative Standard input and exercise
  Custom and Arrow Duel board input; confirm feedback, timers, ratings, Review,
  and History through public UI.
- [ ] **Stockfish:** open analysis from a completed attempt, verify both NNUE
  networks and useful output, cancel an active search, reuse the engine, then
  terminate and start a fresh analysis as required by #200.
- [ ] **App background and resume:** background and resume during an active
  session and Stockfish analysis, then force-stop/relaunch and verify durable,
  deterministic recovery.
- [ ] **Review reminder:** exercise opt-in/permission, scheduling, denial
  recovery, and a reminder tap from cold and foreground states without an
  exact-minute promise.
- [ ] **Android Back and rotation:** verify transient dismissal, guarded active
  session behavior, child/top-level navigation, root back-to-home, and usable
  portrait/landscape layouts.
- [ ] **Android Progress Backup and backup-sensitive storage:** prove the
  progress database and required sidecars are protected, bundled puzzles,
  Stockfish networks, caches, and test artifacts are excluded, and a restore or
  device transfer retains writable migrated progress within quota.
- [ ] **Supported upgrade:** install the candidate over
  the supported previous build without clearing app data, then verify ratings,
  attempts, active session, review queue, Custom configurations, History, and
  settings before making one new write. This is required for storage/schema,
  signing, or install-path changes, not for every bounded delta.

A physical-only failure is diagnostic input. Investigate it and add the
smallest deterministic automated regression that can reproduce the affected
boundary, but do not hold Play submission or APK mirroring solely for this
optional checklist.

## Play-signed release boundary

The selected automated scope proves source behavior; it does not prove upload
signing, Play App Signing, or store declarations.
For an Android release candidate, also follow `docs/ANDROID_PLAY_RELEASE.md`.
The signed-candidate job binds one exact AAB SHA-256 to its corresponding source
manifest. Google Play distributes and signs the binary first. The later GitHub
APK mirror checks only immutable package/version/signing identity and digest;
it does not repeat product or native validation. Account setup, pre-launch
reports, listing review, and full compatibility matrices are first-launch or
change-triggered evidence rather than automatic delta gates.
