# Android and iOS Release Build-Time Research

Status date: 2026-07-19

## Executive summary

The release process is slow for several different reasons, and only some of
them can be improved with a "delta build."

- Local and CI compilation can reuse unchanged work. Gradle incremental builds,
  the Gradle build cache, Gradle configuration cache, Xcode incremental builds,
  Metro's transform cache, and native compiler caches are the relevant
  mechanisms.
- Validation can be risk-scoped during pull-request development, but exact-head
  release evidence cannot be carried across a source change. The release
  candidate should be built once, validated once, and promoted without a
  rebuild.
- Google Play and the App Store optimize what users download. That is separate
  from building and uploading: each store release still starts from a new,
  complete signed AAB or Apple archive/build.
- Store and owner-controlled time remains non-incremental: signing approval,
  artifact upload, store processing, TestFlight/Play distribution, and physical
  device acceptance still have to happen for a new candidate.

For this repository, the most promising first experiments are Gradle caching,
Gradle configuration caching, React Native `ccache` support, and an iOS archive
path that retains a version-keyed Derived Data directory instead of always
starting with `clean`. These should be measured before adoption. The
513,323,008-byte offline puzzle pack is large enough to affect copying,
packaging, hashing, and store delivery, but it was not a checkout/fetch
bottleneck in the measured runs: the fetch steps took only one to three
seconds. Optimize its build-stage handling only if deeper build profiles show
that it dominates packaging.

Current Actions timing shows that build caching can remove only part of the
wall clock. The measured iOS critical path is dominated by simulator and Detox
work after a 6m43s build, while Android's full validation is already parallel
and spends 18m40s in the slowest post-build API 36 job. The clearest recurring
build target is the cold signed Android candidate: `bundleRelease` consumed
12m59s of its 14m54s job. A separate current problem is operational rather than
computational: the GitHub source-release phase reuses the candidate and fails
in about one minute, but repeated GitHub Release `POST` authorization failures
have created a manual retry loop.

## Four meanings of "delta"

| Layer | What can be reused | What still has to happen | Expected value here |
| --- | --- | --- | --- |
| Compiler and build-system incrementality | Unchanged task outputs, source transformations, native object files, and build configuration | A complete signed release artifact still has to be assembled | High |
| CI cache reuse | Dependencies and reproducible build caches restored onto a clean hosted runner | Cache misses, signing, final packaging, and upload | High after the first warm run |
| Risk-scoped validation | Unaffected suites can be skipped on routine pull requests under the repository's validation policy | Exact-head release gates and affected native journeys | High during development; bounded at release |
| Store delivery delta | Device-specific or changed content delivered by Play/App Store | Developer uploads a new full release build; store processing remains | Benefits users, not release build latency |

The useful target is therefore **incremental work while producing a complete
artifact**, not a partial AAB or IPA.

## Measured current baseline

These timings come from the GitHub Actions step/job durations for the linked
exact runs. They are a current baseline, not a guarantee for later runner
images or commits.

### iOS integration run

The [Mobile iOS run 29651531684](https://github.com/Chessticize/chessticize-mobile/actions/runs/29651531684)
completed in 24m45s wall time. Its macOS Detox job took 24m40s:

| Step | Duration |
| --- | ---: |
| Build simulator app | 6m43s |
| Select simulator | 2m02s |
| Boot simulator | 1m12s |
| `flows` suite | 7m25s |
| `practice` suite | 5m12s |

The Ubuntu JavaScript checks took 1m11s and ran in parallel, so they were not
on the critical path. The four simulator-selection, boot, and test entries sum
to 15m51s. Even eliminating the entire 6m43s build would leave roughly 18
minutes of setup and native validation. Incremental compilation is useful, but
test selection, simulator stability, and suite runtime determine the larger
ceiling.

### Android integration and candidate runs

The [Mobile Android run 29651532662](https://github.com/Chessticize/chessticize-mobile/actions/runs/29651532662)
completed in 33m34s wall time while consuming 60m32s of summed job time. The
difference is deliberate parallel fan-out after the baseline build.

| Step or job | Duration |
| --- | ---: |
| Baseline job | 14m45s |
| Backup unit tests within baseline | 3m04s |
| Fail-closed Gradle probes within baseline | 41s |
| E2E APK build within baseline | 8m55s |
| API 36 public-UI job after baseline | 18m40s |
| Adaptive-layout job after baseline | 7m11s |
| Restore job after baseline | 5m52s |
| API 24 job after baseline | 4m40s |

The critical path is approximately baseline plus API 36 validation. Gradle and
compiler caching can attack the 8m55s E2E build and part of baseline setup, but
not the 18m40s API 36 journey. Combining jobs could lower billed minutes by
reusing setup/emulator work, but may increase wall time or weaken isolation;
that is a cost-versus-latency tradeoff to benchmark explicitly.

The [signed candidate run 29673251794](https://github.com/Chessticize/chessticize-mobile/actions/runs/29673251794)
took 14m54s of job time and about 15m30s wall time. `bundleRelease` alone took
12m59s, making the recurring signed-candidate build the strongest direct cache
target.

When the two exact-head validation workflows and the Android signed-candidate
workflow are dispatched together, their measured repository critical path is
about 34 minutes rather than the sum of all three durations. The Android full
validation finishes last; the signed candidate and iOS validation finish
earlier in parallel. This does not include the separately owner-run iOS device
archive, store processing, or physical acceptance, whose durations still need
to be recorded.

### Current non-build retry loop

The recent `prepare-source-draft` attempts
[29673717647](https://github.com/Chessticize/chessticize-mobile/actions/runs/29673717647),
[29675067796](https://github.com/Chessticize/chessticize-mobile/actions/runs/29675067796),
[29699855425](https://github.com/Chessticize/chessticize-mobile/actions/runs/29699855425),
[29700946902](https://github.com/Chessticize/chessticize-mobile/actions/runs/29700946902),
and
[29702845774](https://github.com/Chessticize/chessticize-mobile/actions/runs/29702845774)
each fail in roughly one minute while reusing the retained candidate. The
latest failure is a GitHub Release creation `POST` returning 403 with the
fine-grained PAT; earlier attempts also returned 403 with the built-in
integration token. This does not justify rebuilding the AAB. It calls for an
authorization preflight and a resumable release orchestration path.

## First release versus recurring releases

The first Android release includes bootstrap gates that should not be included
in the expected duration of every later delta release:

- production signing and protected-environment setup;
- Play App Signing and publisher/service-account authorization;
- initial source publication and one-time Play API authentication setup;
- physical ARM64 evidence and the Play-console owner evidence chain;
- the one-time 12-testers-for-14-days external testing requirement tracked by
  [issue #186](https://github.com/Chessticize/chessticize-mobile/issues/186).

Likewise, the first iOS release includes Apple account, certificate, App Store
Connect, internal group, metadata, and physical TestFlight setup. Later releases
still need a new version/build, signed archive, upload, processing, risk-appropriate
acceptance, and exact source publication, but not the initial account/store
bootstrap unless credentials or policy change.

Recurring release latency should therefore be reported separately as:

1. exact-head validation;
2. one signed candidate build per platform;
3. promotion of those retained candidates;
4. store processing and required release acceptance;
5. the small post-Play APK mirror, when the GitHub manual-download asset is
   required.

That separation prevents a one-time Play eligibility gate or a current token
misconfiguration from being misdiagnosed as an inherently slow compiler.

## What the repository does today

The following are repository observations, not measured timing results.

### Shared costs

- The app uses React Native 0.86 with Hermes enabled. React Native release
  builds compile JavaScript to Hermes bytecode at build time, so even a
  JavaScript-only release has a bundling and bytecode-generation phase. See the
  [mobile package](../apps/mobile/package.json),
  [Android properties](../apps/mobile/android/gradle.properties), and
  [React Native Hermes documentation](https://reactnative.dev/docs/hermes).
- The canonical offline Core Pack is 513,323,008 bytes according to its
  [manifest](../fixtures/puzzles/bundled-core-pack.manifest.json). Android's
  generated-assets task copies it, two NNUE files, and notices into every
  variant's generated assets. See the
  [Android app build](../apps/mobile/android/app/build.gradle). The larger NNUE
  pointer declares another 108,919,594 bytes. Unchanged large files should not
  trigger recompilation, but they can still dominate cold download, sync,
  packaging, hashing, artifact, and upload stages.
- GitHub-hosted jobs start from clean runner images. GitHub documents that this
  causes dependencies to be downloaded again unless a workflow restores a
  cache. See [GitHub dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching).

### Android

- A manual [Mobile Android workflow](../.github/workflows/mobile-android.yml)
  builds the E2E APKs once and fans them out to two API-level launch jobs plus
  adaptive-layout and backup/restore jobs. This is already the correct
  build-once/fan-out pattern. A full manual dispatch creates eight jobs in the
  current DAG, several of which boot separate emulators.
- The build job performs hosted-runner disk cleanup, installs emulator runtime
  libraries and pinned Android packages, installs JavaScript dependencies,
  downloads the Core Pack, runs multiple separate Gradle invocations, builds
  the native E2E app, and uploads APKs. These are real cold-run costs.
- The workflow caches pnpm and the Core Pack but does not currently configure a
  Gradle dependency/build cache. The
  [Gradle wrapper](../apps/mobile/android/gradle/wrapper/gradle-wrapper.properties)
  is 9.3.1, while `org.gradle.caching` and
  `org.gradle.configuration-cache` are absent from
  [gradle.properties](../apps/mobile/android/gradle.properties).
- Several Gradle invocations use `--no-daemon`. A long-lived daemon mainly
  helps repeated builds in the same environment; the official Gradle guide
  describes JVM startup, in-memory cache, and runtime-optimization savings.
  See the [Gradle Daemon](https://docs.gradle.org/current/userguide/gradle_daemon.html).
- The signed [Android release-candidate workflow](../.github/workflows/mobile-android-release-candidate.yml)
  is a separate clean hosted job. It checks out LFS, installs toolchains and
  dependencies, fetches the Core Pack, builds the signed AAB, downloads
  `bundletool`, verifies the result, and uploads the candidate. It does not
  restore a Gradle build cache or the existing Core Pack cache.
- The later [GitHub release workflow](../.github/workflows/mobile-android-github-release.yml)
  authenticates and reuses the exact signed candidate instead of rebuilding the
  AAB. That is good artifact promotion and should be preserved.

### iOS

- The [Mobile iOS workflow](../.github/workflows/mobile-ios.yml) caches pnpm,
  the Core Pack, the Detox iOS framework, and CocoaPods. It does not persist
  the Xcode Derived Data path used by the Detox build. The macOS job also
  installs `applesimutils`, Bundler dependencies, and Pods before building and
  running two serial Detox suites with one worker.
- Xcode states that the first build compiles everything and subsequent builds
  are incremental, provided dependencies and script inputs/outputs are modeled
  accurately. See
  [Improving the speed of incremental builds](https://developer.apple.com/documentation/xcode/improving-the-speed-of-incremental-builds).
- The local Detox build deliberately uses a stable
  `apps/mobile/ios/build` Derived Data path, which permits warm local rebuilds.
  See [ios-build-for-detox.sh](../apps/mobile/scripts/ios-build-for-detox.sh).
- The React Native bundle shell phase declares no outputs in the Xcode project,
  so Xcode cannot use output-based dependency analysis to skip it. Apple
  documents that a shell phase without both inputs and outputs runs on every
  build. Any input/output contract change must still guarantee that every
  JavaScript and asset change regenerates the release bundle.
- The owner upload runbook invokes `clean archive`, which throws away normal
  incremental target outputs before the final device archive. See the
  [App Store upload runbook](APP_STORE_UPLOAD.md). A simulator Detox binary
  cannot replace a signed device archive, but a version-keyed device Derived
  Data directory may still reuse safe compiler work between later archives.
- The same TestFlight upload is intentionally kept eligible for later App Store
  submission. That already avoids a second production rebuild after internal
  QA.

## Why a full release remains expensive

### Build work

1. Metro transforms and serializes the JavaScript bundle. Metro caches
   transformed modules when source and configuration are unchanged, and it can
   use a remote transform cache, but the release still produces a complete
   bundle. See [Metro caching](https://metrobundler.dev/docs/caching/).
2. Hermes compiles the JavaScript bundle to bytecode during a release build.
   See [Using Hermes](https://reactnative.dev/docs/hermes).
3. Both platforms compile native React Native dependencies and the shared
   Stockfish bridge. Android also builds two release ABIs. React Native's
   single-ABI optimization is explicitly a development optimization and must
   not narrow the final release artifact. See
   [Speeding up your Build phase](https://reactnative.dev/docs/build-speed).
4. The build copies, hashes, compresses, signs, and packages a large offline
   asset set. Compilation caches do not remove final artifact assembly.

### Validation work

- Android's full manual evidence workflow boots several isolated emulators and
  exercises API 24, 30, and 36 behavior. Emulator startup and cross-version
  backup/restore behavior are product validation, not compilation.
- iOS runs `flows` and `practice` serially in nightly integration. Release
  validation now uses delta, targeted, and full risk scopes; both suites are
  required only for broad native risk.
- A source change after validation changes the candidate identity. Cache reuse
  is acceptable; claiming old exact-head evidence for a new commit is not.

### Distribution work

- Signing and protected-environment approval are intentionally fail-closed.
- Upload time is proportional to the complete artifact sent to the store, not
  to the Git diff.
- Apple processes every uploaded build before it becomes available, and then
  creates device/OS variants through app thinning. See
  [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
  and
  [View builds and metadata](https://developer.apple.com/help/app-store-connect/manage-builds/view-builds-and-metadata/).
- Play receives a new AAB and generates device-optimized APKs. See
  [Android App Bundle delivery](https://developer.android.com/topic/performance/reduce-apk-size)
  and
  [Play Console app bundles](https://support.google.com/googleplay/android-developer/answer/9844279).
- Physical-device QA, TestFlight installation, Play track operations, and store
  review/processing are external elapsed time. No compiler cache removes them.

## Recommended simplification sequence

### P0. Simplify the self-defined publication protocol

Implemented decision: Google Play remains the primary Android binary channel.
The protected signed-candidate job builds and verifies the AAB once, retains it,
and publishes the exact corresponding-source manifest using the built-in
`github.token`. After Play publication and owner device smoke, one small manual
job downloads the Play-signed universal APK and mirrors it plus SHA-256 to the
same Release. It checks only package, version, signing identity, and digest.

The former temporary personal token, four manual dispatches, extra publication
environments, separate prepare/publish approvals, repeated Play-ready evidence,
size/ABI validation, Gradle build, and product-test reruns are removed from the
APK publication path.

A small exceptional recovery workflow can authenticate the retained candidate
and idempotently republish source after a transient GitHub failure. It does not
rebuild. The post-Play mirror is independently idempotent and can be rerun
against the same Play version code.

Expected benefit: roughly the same unavoidable Android AAB build time, followed
by a post-Play mirror that normally spends only a few minutes on API download,
identity inspection, and GitHub upload. There is no temporary-token setup or
duplicate Android compilation.

### 1. Measure before changing the release contract

Capture at least one cold and two warm runs for the same commit and split the
time into:

- checkout/LFS and Core Pack fetch;
- pnpm, Ruby/CocoaPods, Android SDK, and Gradle dependency setup;
- Metro/Hermes bundle;
- native compile/link;
- 513 MB asset copy/package/sign;
- emulator/simulator boot and each test suite;
- artifact upload and store processing.

Use Android Studio Build Analyzer or Gradle's task outcomes to distinguish
executed, `UP-TO-DATE`, and `FROM-CACHE` tasks. See
[Build Analyzer](https://developer.android.com/build/build-analyzer) and
[Gradle incremental builds](https://docs.gradle.org/current/userguide/gradle_optimizations.html).
For Xcode, retain the build log and timing summary and inspect build phases that
always run because their input/output contract is incomplete. Add
`-showBuildTimingSummary` to both simulator and archive measurements; the
current Actions data measures the whole 6m43s Xcode step but does not yet split
Stockfish/native compilation, CocoaPods, Metro/Hermes bundling, linking, and
signing.

This measurement should answer whether the largest opportunity is native
compilation, the large asset, dependency bootstrap, tests, or store latency.
Use the measured Actions baseline above as the cold reference and add equivalent
warm local runs plus cache-hit counters.

### 2. Enable Android cache reuse as an experiment

In a dedicated workflow change, evaluate:

1. `org.gradle.caching=true` or `--build-cache`. Gradle's build cache restores
   outputs for cacheable tasks across workspaces and build agents; it is
   distinct from ordinary same-workspace `UP-TO-DATE` checks. See the
   [Gradle build cache](https://docs.gradle.org/current/userguide/build_cache.html).
2. `gradle/actions/setup-gradle` or the simpler `cache: gradle` option on
   `actions/setup-java`. The Gradle action persists the wrapper, dependencies,
   compiled build scripts, transforms, and the local build cache. See
   [setup-gradle](https://github.com/gradle/actions/blob/main/docs/setup-gradle.md)
   and [setup-java](https://github.com/actions/setup-java).
3. `org.gradle.configuration-cache=true`. React Native 0.86 officially supports
   configuration-cache adoption; compatibility should still be proven across
   this repository's custom generated-assets task, native CMake build, signing
   checks, and Detox tasks. See
   [React Native build speed](https://reactnative.dev/docs/build-speed) and
   [Gradle configuration cache](https://docs.gradle.org/current/userguide/configuration_cache.html).
4. Keep one Gradle daemon alive for the multiple invocations in a single job,
   unless measurement or isolation requirements show that the single-use
   process is preferable.

Start with read-only cache restoration on pull requests and write from trusted
`main`/release jobs. Do not place signing material or other secrets in a cache.

Expected benefit: high for repeated Android builds with unchanged React Native,
CMake, and dependency inputs; low on the first run after a cache-key change.

### 3. Enable a native compiler cache on both platforms

React Native recommends `ccache` for Android C++ and iOS Objective-C/C++ builds.
The iOS Podfile already contains the standard commented
`:ccache_enabled => true` hook. React Native also documents CI cache persistence
and recommends content-based compiler checks on fresh CI checkouts. See
[React Native build speed](https://reactnative.dev/docs/build-speed) and the
[Podfile](../apps/mobile/ios/Podfile).

Prove the hit rate with `ccache -s`, and key the cache by platform, compiler,
SDK/NDK, architecture, React Native/Pod lockfiles, and relevant build flags.
Do not adopt it if restore/upload overhead exceeds compilation saved.

Expected benefit: medium to high when Stockfish, React Native C++, or native
pods dominate; small when the 513 MB asset or E2E runtime dominates.

### 4. Preserve iOS incrementality without reusing an old archive

Evaluate a release-only, version-keyed Derived Data path and remove only the
`clean` action from `clean archive`. Continue creating a new `.xcarchive` at the
exact release commit; never upload an old archive. Invalidate the Derived Data
key on Xcode/SDK, configuration, architecture, Podfile.lock, native build
settings, or relevant source changes.

Xcode's build system is designed for incremental subsequent builds, but run
script phases need accurate inputs and outputs. Audit React Native bundle,
codegen, and asset phases before relying on this. See
[Apple's incremental-build guidance](https://developer.apple.com/documentation/xcode/improving-the-speed-of-incremental-builds).

This is an experiment, not an immediate release-policy change. Compare the
signed archive contents and existing release audits between clean and warm
paths before updating the runbook.

Expected benefit: medium for repeated archive attempts on the same toolchain;
limited for the first archive, final packaging, signing, and upload.

### 5. Keep Core Pack caching consistent, but do not prioritize it yet

The Core Pack is immutable under a manifest hash. The standard Android and iOS
workflows already cache it, while the Android signed-candidate workflow fetches
it cold. Restore the same content-addressed cache there before running the
existing hash verifier. This changes transfer time, not release semantics.

Expected benefit: low in the measured baseline and potentially high only under
a cold or slow-network fetch. The current workflows fetched the pack in one to
three seconds, so this is a consistency and network-resilience improvement
rather than a proven critical-path saving.

### 6. Keep validation risk-scoped before the final candidate

Continue the repository's existing model:

- unit/component/typecheck for ordinary shared logic and UI changes;
- targeted native validation for navigation, persistence, real board,
  adaptive layout, and native-module boundaries;
- full native scope only for broad native risk. An ordinary exact-head delta
  uses fast checks plus the owner's installed-device smoke.

GitHub supports path filters, but required workflows skipped by path filtering
can remain pending. Prefer an always-created required workflow whose jobs
select the justified scope. See
[GitHub workflow path filters](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

This saves development feedback time. It must not be used to carry old release
evidence onto a different commit.

### 7. Build once and promote the same artifact

Treat caches as reproducible acceleration and artifacts as the immutable
release result. GitHub makes the same distinction: caches are for reusable,
regenerable data, while artifacts persist and pass build outputs between jobs.
See [Workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts).

- Android promotes the exact signed AAB through Play; the same protected job
  publishes its corresponding-source identity. Do not introduce a second AAB
  build after validation.
- iOS should archive once, upload once to TestFlight, and promote that processed
  build to later testing/submission, as the current runbook intends.
- A small release orchestrator could dispatch Android and iOS candidate work in
  parallel for one exact commit, collect their immutable artifact/evidence
  identities, and expose owner gates in one status view. This reduces human
  sequencing latency but does not weaken either platform's gates.

## Store-side delta delivery

### iOS and iPadOS

Apple explicitly creates an optimized update package by comparing prior app
versions with the new version and including changed application-bundle content
while excluding unchanged content. Apple recommends avoiding unnecessary file
changes and keeping frequently changed content separate from stable content.
See
[Doing advanced optimization to further reduce your app's size](https://developer.apple.com/documentation/xcode/doing-advanced-optimization-to-further-reduce-your-app-s-size).

Consequences for this app:

- If the 513 MB SQLite pack and NNUE files remain byte-for-byte identical,
  Apple's update package can exclude their unchanged content.
- If a regenerated SQLite pack changes bytes throughout the file, the user
  update can become large even when the semantic data delta is small.
- The developer still creates and uploads a new complete archive/build. Apple's
  update package does not accelerate Xcode compilation, signing, or upload.
- App thinning separately creates device/OS variants. It is automatic for App
  Store and TestFlight delivery, not a developer-controlled delta upload.

### Android

An Android App Bundle is the full publishing format. Google Play generates
device-specific APKs so users receive only the code and resources needed for
their ABI, density, language, and other configuration. See
[Reduce your app size](https://developer.android.com/topic/performance/reduce-apk-size)
and
[Play app-bundle management](https://support.google.com/googleplay/android-developer/answer/9859152).

This reduces delivered size, but it does not provide a partial-AAB release
interface. Every new release still needs a new version code and a new complete
bundle. Android's base-module documentation states this requirement directly;
see [Version code and app updates](https://developer.android.com/guide/app-bundle/configure-base).
Play-controlled patching or compression should be treated as delivery behavior,
not as a build or upload guarantee.

Play Feature Delivery or Play Asset Delivery could move large content outside
the base install and support install-time, fast-follow, or on-demand delivery.
See
[Play app bundle features](https://support.google.com/googleplay/android-developer/answer/9844279).
That would be a product and distribution redesign, not a build-cache change. It
would complicate the app's local-first/offline-at-first-launch promise and the
current Play-first distribution boundary.
It should not be the first optimization.

## What not to call a delta build

- A simulator build is not a reusable signed device archive.
- An E2E APK is not the production AAB.
- A Gradle or Xcode cache entry is not a release artifact and must not be
  published.
- A prior commit's green Detox run is not exact-head evidence for a changed
  candidate.
- Store-generated update packages are not partial artifacts that the developer
  can upload.
- Building only the active Android ABI is safe for local development, not for
  the two-ABI release.
- JavaScript over-the-air patching would be a new update channel with security,
  compatibility, policy, rollout, and source-publication implications. It is
  not a transparent optimization of the present App Store/Play process and is
  outside the recommended first steps.

## Proposed decision

Adopt a two-lane model:

1. **Fast delta development lane:** warm Metro/Gradle/Xcode/compiler caches,
   smallest risk-scoped tests, and local single-ABI Android builds where
   appropriate.
2. **Immutable release lane:** one exact commit; cached but complete Android and
   iOS builds; one developer-built signed artifact per platform; exact-head fast checks plus
   delta/targeted/full validation and owner device smoke; then artifact
   promotion without rebuilding.

The protocol reduction is implemented first because it removes human and
authorization latency without changing store requirements. Cache pilots remain
the next build-time optimization and should record cold/warm timing, cache hit
rates, artifact hashes, and test results before adoption.
