# Android Validation

This runbook is the source of truth for choosing and recording Android native
validation. Android Detox starts the real application, drives public UI, and
lets production code create and read the production SQLite progress database
and bundled puzzle pack. Tests must not call stores, repositories, native
modules, or test-only data-writing helpers directly.

## Local preflight and diagnostics

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

The `Mobile Android` workflow builds the self-contained app and Detox test APK
once. A scheduled run uses the latest `main` commit and runs complete shared
`flows` and `practice` on an API 36 x86_64 phone. A manual dispatch also runs
the bounded API 24 compatibility smoke and the release-oriented backup and
adaptive jobs.

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

## Exact-head evidence contract

Every required native result must record the following fields and retain the
workflow run plus artifacts with the PR or release record:

- exact commit SHA and build result;
- commands and selected validation scope;
- device matrix, including API/OS, ABI, profile/model, and serial or redacted
  physical identifier;
- suite results and any retry or failure classification;
- clean tracked worktree confirmation before and after execution;
- artifact names/links and screenshot review where visual behavior is in scope.

The automated API evidence JSON uses schema version 1 and records `commitSha`,
`buildResult`, `commands`, `deviceMatrix`, `suiteResults`, `worktreeClean`, and
the overall `result`. A missing required field is not passing evidence.

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
