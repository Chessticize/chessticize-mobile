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

## Automated matrix

The `Mobile Android` workflow is a manually dispatched full diagnostic matrix.
It builds the self-contained app and Detox test APK once, runs complete shared
`flows` and `practice` on an API 36 x86_64 phone, and also runs the bounded API
24 compatibility smoke plus the release-oriented backup and adaptive jobs.
It has no scheduled trigger and is not a recurring release gate. Use it only
when the selected scope is full or when diagnosing a boundary that needs its
hosted Linux/Android evidence. Routine releases use exact-head fast checks and
risk-scoped CI or emulator validation on the Android build machine. A physical
device is not required for Play submission or the post-Play APK mirror.

The API 24 smoke contains only:

- cold launch into Practice through public UI;
- a deterministic Standard sprint that writes and reopens production SQLite;
- migration of a released progress fixture, verified through public UI; and
- one packaged Stockfish analysis through the public Settings diagnostics
  surface.

It intentionally does not copy the complete API 36 journeys. The shared suites
remain the product-journey source of truth on both iOS and Android.

For an attached local emulator or device with the E2E APKs already built, run
the same fail-closed matrix entry used by CI:

```sh
ANDROID_VALIDATION_COMMIT_SHA=<exact-40-character-sha> \
ANDROID_VALIDATION_BUILD_RESULT=success \
ANDROID_VALIDATION_DEVICE_ABI=x86_64 \
ANDROID_VALIDATION_DEVICE_PROFILE=pixel_2 \
DETOX_ANDROID_DEVICE=emulator-5554 \
pnpm mobile:validate:android:matrix -- --api-level 36 \
  --output apps/mobile/artifacts/android-validation/api-36.json
```

Replace `36` with `24` only for the bounded compatibility smoke. The command
rejects an unsupported API or suite, a missing or mismatched test-runner SHA, a
dirty tracked worktree, changed App inputs, changed artifact bytes, a
failed/missing step, or incomplete build/device data. It writes passing
evidence only after every selected command succeeds and it has rechecked the
checkout head and clean tracked worktree. Add `--suite <name>` only for a
focused test-only rerun.

CI gives the complete matrix command a 30-minute deadline inside a 40-minute
job. This is deliberately much larger than the normal API 24 and API 36
runtime, but shorter than an unproductive hosted-runner hang. The runner writes
`api-<level>.progress.json` before and after every prepare, install, native, and
Detox step. A failed or timed-out workflow uploads that progress file with any
Android UI diagnostics, so classify the exact last running step before
retrying. Only `api-<level>.json`, written after every step passes, is release
evidence; the progress file is diagnostic evidence and never converts a
partial run into a pass.

## Test-only reruns with retained APKs

When a failure is classified as a host-side spec, selector, wait, assertion,
evidence collector, or non-bundled fixture defect, do not rebuild the App.
Commit the test correction, keep current-head fast checks green, then dispatch
`Mobile Android test-only rerun` with:

- `source_run_id`: the retained `Mobile Android` run whose
  `Android build baseline` job passed;
- `app_source_sha`: that run's exact App source SHA; and
- `target`: `api-24`, `api-36-full`, or the smallest affected API 36 suite.

The workflow checks that the source run used
`.github/workflows/mobile-android.yml`, its build job passed, the App source is
an ancestor of the test runner, and the fail-closed App-input digest is
identical. It downloads the immutable `android-practice-apks` artifact and
records both APK checksums. It never invokes Gradle.

GitHub can dispatch this workflow only after the workflow file exists on the
default branch. While the policy first lives on an active release branch,
download the same retained artifact on the Android build machine and invoke
the matrix directly:

```sh
gh run download <source-run-id> \
  --name android-practice-apks \
  --dir apps/mobile/android/app/build/outputs/apk
node apps/mobile/scripts/mobile-app-inputs.js compare \
  --app-source-sha <app-source-sha> \
  --test-runner-sha "$(git rev-parse HEAD)" \
  --output apps/mobile/artifacts/android-validation/app-input-comparison.json
ANDROID_VALIDATION_COMMIT_SHA="$(git rev-parse HEAD)" \
ANDROID_VALIDATION_APP_SOURCE_SHA=<app-source-sha> \
ANDROID_VALIDATION_BUILD_RESULT=success \
ANDROID_VALIDATION_DEVICE_ABI=x86_64 \
ANDROID_VALIDATION_DEVICE_PROFILE=pixel_2 \
DETOX_ANDROID_DEVICE=emulator-5554 \
pnpm mobile:validate:android:matrix -- --api-level 36 \
  --suite android-history \
  --output apps/mobile/artifacts/android-validation/test-only-android-history.json
```

Replace `android-history` with the smallest affected suite. This local path
performs the same App-input comparison and APK checksum recording as the hosted
workflow; it also never invokes Gradle.

For a transient failure on the same commit, use GitHub's specific-job rerun
instead. For a test correction on a new commit, use the test-only workflow so
the evidence records distinct App source and test-runner SHAs. If the
classifier reports any App build input change, stop and run a normal build plus
the selected native scope. Expected-result changes require failure
classification and review; they must not normalize an unexplained product
regression. The classifier is a trust anchor and intentionally invalidates
reuse when its own implementation changes.

## Adaptive contract

Manual full-workflow dispatch runs
`apps/mobile/scripts/android-adaptive-layout-evidence.sh` on API 36. It reaches
the real sprint through public UI and checks phone rotation plus representative
tablet, foldable/resizable, ChromeOS-style, and large-text profiles. Retain the
JSON/text context, display metrics, assertions, and screenshots from the
`android-adaptive-layout-evidence` artifact and visually inspect representative
phone, tablet, and foldable captures.

## Deterministic fixtures

E2E uses a small deterministic fixture identity or seed to select known puzzles
from the shipped bundled pack. Production puzzle selection, PracticeService,
and production SQLite still perform all reads and writes. Launch arguments may
fix time, permission state, or puzzle choice at maintained native boundaries;
they must not inject attempts, ratings, review rows, or settings behind the
public UI.

## Native evidence contract

Every required native result must record the following fields and retain the
workflow run plus artifacts with the PR or release record:

- App source SHA, test-runner SHA, App-input digest, APK checksums, and build result;
- commands and selected validation scope;
- device matrix, including API/OS, ABI, profile/model, and serial or redacted
  physical identifier;
- suite results and any retry or failure classification;
- clean tracked worktree confirmation before and after execution;
- artifact names/links and screenshot review where visual behavior is in scope.

The automated API evidence JSON uses schema version 2 and records
`appSourceSha`, `testRunnerSha`, `appInputDigest`, `artifacts`, `buildResult`,
`commands`, `deviceMatrix`, `suiteResults`, `worktreeClean`, and the overall
`result`. `commitSha` remains a compatibility alias for `testRunnerSha`. A
missing required field is not passing evidence.

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
wants extra confidence after publication. Automated CI/simulator/emulator
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
