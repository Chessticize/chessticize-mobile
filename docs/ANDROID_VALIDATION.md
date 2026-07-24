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
  fixtures, native build configuration, Detox infrastructure, or an otherwise
  unbounded native risk.

Record the chosen scope and rationale in the PR. A code change after native
evidence invalidates that evidence.

## Automated matrix

The `Mobile Android` workflow is a manually dispatched full diagnostic matrix.
It builds the self-contained app and Detox test APK once, runs complete shared
`flows` and `practice` on an API 36 x86_64 phone, and also runs the bounded API
24 compatibility smoke plus the release-oriented backup and adaptive jobs.
It has no scheduled trigger and is not a recurring release gate. Use it only
when the selected scope is full or when diagnosing a boundary that needs its
hosted Linux/Android evidence. Routine releases use exact-head fast checks,
risk-scoped validation on the Android build machine, and owner physical-device
smoke.

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
rejects an unsupported API, a missing or mismatched exact commit SHA, a dirty
tracked worktree, a failed/missing step, or incomplete build/device data. It
writes passing evidence only after every selected command succeeds and it has
rechecked the checkout head and clean tracked worktree.

CI gives the complete matrix command a 30-minute deadline inside a 40-minute
job. This is deliberately much larger than the normal API 24 and API 36
runtime, but shorter than an unproductive hosted-runner hang. The runner writes
`api-<level>.progress.json` before and after every prepare, install, native, and
Detox step. A failed or timed-out workflow uploads that progress file with any
Android UI diagnostics, so classify the exact last running step before
retrying. Only `api-<level>.json`, written after every step passes, is release
evidence; the progress file is diagnostic evidence and never converts a
partial run into a pass.

## Adaptive contract

Manual exact-head workflow dispatch runs
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

- tested commit SHA and build result;
- commands and selected validation scope;
- device matrix, including API/OS, ABI, profile/model, and serial or redacted
  physical identifier;
- suite results and any retry or failure classification;
- clean tracked worktree confirmation before and after execution;
- artifact names/links and screenshot review where visual behavior is in scope.

The automated API evidence JSON uses schema version 1 and records `commitSha`,
`buildResult`, `commands`, `deviceMatrix`, `suiteResults`, `worktreeClean`, and
the overall `result`. A missing required field is not passing evidence.

The tested SHA does not have to equal a later PR or release head when a
documented diff proves that validation-relevant development inputs are
unchanged. Record both SHAs and the comparison. Runtime, native/platform,
dependency, build/release, or selected native spec/fixture changes require a
rerun; documentation, review metadata, and merge ancestry alone do not.

## Physical ARM64 release checklist

This is owner-recorded release evidence. The Stockfish lifecycle subset remains
tracked by #200, and the complete checklist is approved with release issue
#188. Physical hardware availability is not a routine feature-PR blocker.

For an ordinary delta, record only the exact installed version/build, cold
launch, one real Practice completion, and the changed behavior. Add the
applicable items below when the change touches them. Run the complete checklist
for first launch or broad native risk; do not repeat unchanged items solely
because the build number advanced.

Record the exact candidate SHA, AAB/APK identity and checksum, signing
certificate, device model, Android version, `arm64-v8a` ABI, commands,
timestamps, results, retries, and redacted evidence links before checking any
item.

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

Any physical failure blocks release approval. Fix it, rerun the complete
affected scope on the exact replacement candidate, and retain both the failed
and passing evidence.

## Play-signed release boundary

The selected automated scope proves source behavior; it does not prove upload
signing, Play App Signing, store declarations, or Play-delivered installation.
For an Android release candidate, also follow `docs/ANDROID_PLAY_RELEASE.md`.
The signed-candidate job binds one exact AAB SHA-256 to its corresponding source
manifest. Google Play distributes and signs the binary first. The later GitHub
APK mirror checks only immutable package/version/signing identity and digest;
it does not repeat product or native validation. Account setup, pre-launch
reports, listing review, and full compatibility matrices are first-launch or
change-triggered evidence rather than automatic delta gates.
