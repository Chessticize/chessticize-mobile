# Android Play Release Candidate

This runbook builds and audits the current production-upload-signed Android App
Bundle. Builds 1 through 4 remain immutable audit records. Version code 1 was
uploaded to Play before a later protected source-publication workflow defect was
fixed. Version code 2 produced a valid signed candidate, but exact-tag Android
validation found a stale adaptive E2E dependency on a deliberately removed
public control. Version code 3 fixed that stale UI dependency, but exact-tag API
24 validation exposed a launch/package-manager state race in the evidence
harness. Version code 4 became the published Android 1.1 release. Version code 5
stopped before the AAB build because a generic doctor checked an emulator-only
runtime library. Version code 6 completed the Android 1.2 release operation for
the current Play track: corresponding source, Play delivery, owner
physical-device smoke under the former policy, and the Play-signed GitHub APK
mirror are complete. Version code 7 is the Android 1.2.1 ordinary-delta release
currently in Play review with corresponding source and the Play-signed GitHub
binary release published.
This runbook deliberately separates
repository-owned checks from owner-only Play Console evidence. Missing signing material,
protected-environment setup, or any console result is a blocker; never replace
it with a debug key, a scratch key, an emulator claim, or a hand-edited passing
JSON file.

The build-1 source-publication gate is complete. The public source release
[`android-v1.1.0-build-1`](https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.1.0-build-1)
was published on 2026-07-19 and retains this immutable audit evidence:

- annotated tag target: `2c4c17a53773db407dc0f865d912976188235708`;
- protected source-publication workflow run:
  [`29703293904`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29703293904);
- retained source-publication artifact: ID `8447113926`, name
  `android-source-publication-29703293904`, archive SHA-256
  `cf07dc2d83d0b6ba2d5d402f95d6a957fa68c28d88d9f4fda45bbcc716b3e872`;
- public `android-source-manifest.json` asset: ID `482719712`, SHA-256
  `77c3d891ba1dda1fe17b2b385b20efa96a49634ae4226a720d0c07f2d78162a7`.

Do not move the build-1 tag, rebuild its AAB, replace either artifact, or reuse
version code 1.

Build 2 is an immutable failed-validation candidate and was never distributed:

- annotated tag: `android-v1.1.0-build-2`, targeting
  `585ad836d7a01d3969f5aeb5e9af976956850e97`;
- successful protected candidate workflow run:
  [`29704109543`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29704109543);
- retained candidate artifact: ID `8447504169`, name
  `android-signed-release-candidate-585ad836d7a01d3969f5aeb5e9af976956850e97`,
  archive SHA-256
  `6b9c07b67743b4599366704de6e417d792a871ab7ee08ea2205803c52edf6935`;
- signed AAB: 440,335,589 bytes, SHA-256
  `3923be1602d7518255efca6d09799d5ed09cdf86fe11d678951ba3a2bf6adcad`;
- source manifest SHA-256
  `d81fe076b6493cfdfc1fd314ce8196f953938a966aa2019140e31b14d01d39f7`;
- exact-tag Android matrix run:
  [`29704116081`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29704116081),
  which completed 7/8 jobs successfully; only adaptive public UI failed because
  the E2E still waited for `session-accessible-moves-open` after that control
  was intentionally removed.

No build-2 source release was created and its AAB was not uploaded to Play. Do
not move or reuse its tag, artifact, or version code, and do not resume its
legacy publication phases.

Build 3 is also an immutable failed-validation candidate and was never
distributed:

- annotated tag: `android-v1.1.0-build-3`, targeting
  `925d3d763008af102eb732797693dee0552cee71`;
- successful protected candidate workflow run:
  [`29705924044`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29705924044);
- retained candidate artifact: ID `8448037753`, archive SHA-256
  `74f259c9f0175ca5cd374f09f408ca1a6a33df0219ecad7473910880f0618ab6`;
- signed AAB: 440,335,573 bytes, SHA-256
  `87924938fd0994436e3a3421f08f58679cae7ddeddeb3eebd7ba056b651de791`;
- source manifest SHA-256
  `96d3ac5ed2d4774e07c5702a26e5107b247699a32699006a90de35fd76f5d0fe`;
- exact-tag Android matrix run:
  [`29705924909`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29705924909),
  whose API 24 backup-policy job
  [`88244129794`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29705924909/job/88244129794)
  failed because the installed package still reported `stopped=true` and
  `notLaunched=true` when `bmgr backupnow` ran, so Android returned the
  framework-level `Backup is not allowed` before the fail-closed BackupAgent
  policy could execute;
- exact-tag iOS workflow run:
  [`29705926506`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29705926506),
  which passed Mobile JS plus the complete `flows` and `practice` suites.

The API 24 evidence contract still requires the exact single `Transport
rejected package` result and does not accept `Backup is not allowed`. No build-3 source release was created and its AAB was not uploaded to Play. Do not
move or reuse its tag, artifact, or version code, and do not resume its source
or binary publication phases.

Build 4 is the immutable published Android 1.1 release:

- annotated tag: `android-v1.1.0-build-4`, targeting
  `b6c604eec716cff02355fd931ba246317f3bbb9e`;
- successful protected candidate workflow run:
  [`29707311997`](https://github.com/Chessticize/chessticize-mobile/actions/runs/29707311997);
- public corresponding-source release:
  [`android-v1.1.0-build-4`](https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.1.0-build-4);
- Play-generated universal APK SHA-256:
  `c53265becfdfcef2f3579f5cd1903a196d9ebab66e2a143ef66623af5c8f6a3d`.

Do not move the build-4 tag, rebuild its AAB, replace its public artifacts, or
reuse version code 4.

Build 5 is an immutable failed candidate and was never distributed:

- annotated tag: `android-v1.2.0-build-5`, targeting
  `f4c5c589309ab6c1fbd1e89227da26000ba7b5e9`;
- failed protected candidate workflow run:
  [`30065085901`](https://github.com/Chessticize/chessticize-mobile/actions/runs/30065085901);
- the generic Android doctor stopped on missing emulator-only `libpulse.so.0`
  before Gradle built an AAB.

No build-5 GitHub source Release or Play upload was created. Do not move or
reuse its tag or version code.

Build 6 is the immutable Android 1.2 release for the current Play track:

- annotated tag: `android-v1.2.0-build-6`, targeting
  `9526eb1da16d043dcfbbdb2a903e927d1056f799`;
- protected candidate workflow run:
  [`30065810499`](https://github.com/Chessticize/chessticize-mobile/actions/runs/30065810499);
- retained candidate artifact: ID `8586432221`;
- signed AAB: 440,381,305 bytes, SHA-256
  `af6ce299eaed4ce9c826378ec90c605bc0928e52261df9ee40ebee0e3a23e0ed`;
- source-publication recovery run:
  [`30066568119`](https://github.com/Chessticize/chessticize-mobile/actions/runs/30066568119);
- public corresponding-source release:
  [`android-v1.2.0-build-6`](https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.2.0-build-6);
- public source-manifest SHA-256:
  `20882c243f53ba5962c18a3557463e04c2b0394e7c40bb224e714d42fdf906d7`;
- Play Closed testing Alpha submission passed Play quick checks, and the owner
  installed the Play-delivered `1.2` build `6` on a physical device and
  confirmed the required smoke on 2026-07-24. Recheck the live Console before
  relying on a later review, promotion, or Production state;
- successful APK-mirror workflow run:
  [`30118284864`](https://github.com/Chessticize/chessticize-mobile/actions/runs/30118284864);
- Play-signed universal APK: 359,752,647 bytes, SHA-256
  `dc7e7f77ffd06ce7b4c109ca2a731e7575b1fe056201b2a667de4ee4e49f2746`,
  asset ID `488711898`;
- Play app-signing certificate SHA-256:
  `318a4453d4052c90364d3abfe376dce9c06a04ab70db7ce1d5d43ba995cff900`;
- checksum asset ID `488711885`, SHA-256
  `8c42960d31b5f674fc4541c2b60560cbe02539128eb40ae587b9e22b0c305cac`;
- retained receipt:
  `android-apk-mirror-9526eb1da16d043dcfbbdb2a903e927d1056f799`,
  recording phase `play-apk-mirrored` and the exact source, AAB, Play download,
  signer, release, and public-asset identities.

Do not move the build-6 tag, rebuild its AAB, replace its public source
manifest or mirrored assets, or reuse version code 6. The public Release has
exactly the required source manifest, Play-signed APK, and checksum.

Build 7 is the Android 1.2.1 ordinary-delta GitHub binary release:

- annotated tag: `android-v1.2.1-build-7`, targeting
  `9028826447330d67ab4c34f64a3fb7d1b5b05229`;
- primary user-visible change: keep Practice, History, Review, and new Run
  startup responsive with large puzzle histories;
- validation scope: exact-head fast checks plus the protected signed-candidate
  and corresponding-source job; no physical-device gate;
- protected candidate workflow run:
  [`30123127230`](https://github.com/Chessticize/chessticize-mobile/actions/runs/30123127230);
- signed AAB SHA-256:
  `1267e260d0a77bddc11475aefb2a8dbc926347395793ca4e36db3ed9048e3f11`;
- public corresponding-source release:
  [`android-v1.2.1-build-7`](https://github.com/Chessticize/chessticize-mobile/releases/tag/android-v1.2.1-build-7);
- public source-manifest SHA-256:
  `f06491e90802fd38d4598fbe5dcf6e651ad6d9b8c029415d837b6e24f505139d`;
- successful APK-mirror workflow run:
  [`30126025819`](https://github.com/Chessticize/chessticize-mobile/actions/runs/30126025819);
- Play-signed universal APK: 359,785,415 bytes, SHA-256
  `ce756d365d42d8714a1841233dddcfb388c80dbb59e1c3a08d86f8509521afe9`,
  asset ID `488818447`;
- Play app-signing certificate SHA-256:
  `318a4453d4052c90364d3abfe376dce9c06a04ab70db7ce1d5d43ba995cff900`;
- checksum asset ID `488818430`, SHA-256
  `c0c7fbcd1df6e90ec3052874f2e32eea67ae45e5d015d62bbe5ed21b75089327`;
- retained receipt artifact ID `8609270415`, named
  `android-apk-mirror-9028826447330d67ab4c34f64a3fb7d1b5b05229`;
- current state: GitHub binary publication is complete with exactly the source
  manifest, Play-signed APK, and checksum. Closed testing Alpha build
  `7 (1.2.1)` was last observed in Play review; track review continues
  independently and must not be reported as published until the Console says so.

## Canonical identity

- Application ID: `com.chessticize.mobile`
- Public version: `apps/mobile/release-version.json` (`1.2.1`)
- Android version code: `apps/mobile/release-version.json` (`7`)
- iOS build number: `apps/mobile/release-version.json` (`1`, independent from Android)
- Supported ABIs: `arm64-v8a`, `x86_64`
- Target SDK: API 36
- Required source tag before any Play track upload: `android-v1.2.1-build-7`

Android `versionCode` must increase for every later Play upload. The public
version must continue to match iOS. Settings reads `versionName` and
`versionCode` from the installed Android artifact and the corresponding bundle
keys on iOS; no user-visible version fallback is hardcoded in JavaScript.

## Protected inputs

Create and protect the GitHub Environment `android-production` before running
the candidate workflow. Require owner approval and limit deployment branches.
Configure these environment secrets; do not use repository-wide plaintext
variables and never commit the keystore or passwords:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`
- `ANDROID_UPLOAD_CERT_SHA256`

The upload key must be the certificate registered with Play. Play's app-signing
key is a separate protected identity and its SHA-256 fingerprint is recorded
from Play Console, not inferred from the upload-signed AAB. Missing or partial
local signing configuration makes Gradle `bundleRelease` fail closed.

The post-Play APK mirror does not use these upload-signing secrets. Configure
the one-time Android Publisher authentication and public Play app-signing
fingerprint described in `docs/ANDROID_GITHUB_RELEASE.md`. The mirror creates a
short-lived access token automatically and requires no temporary operator
token. No temporary GitHub token is used.

## Build and repository audit

After any failed complete release workflow, perform the cross-platform
pre-retry convergence sweep in `docs/RELEASE_SOURCE_POLICY.md` before
dispatching another full native run.

1. Start from a clean exact candidate commit containing the canonical puzzle
   pack, Stockfish source and networks, license notices, lockfile, and approved
   `docs/releases/android-v<version>-build-<code>.md` created under
   `docs/RELEASE_NOTES.md`. Create and publish the annotated
   `android-v<version>-build-<code>` source tag before distributing the
   candidate through any Play testing track.
2. Record passing exact-head fast checks and the selected risk-scoped Android
   validation before dispatch. The protected candidate workflow deliberately
   does not repeat product tests or install, check, or run an emulator.
3. Dispatch `Mobile Android release candidate` on that exact ref. The workflow
   installs only the pinned SDK packages required for the AAB, runs the
   artifact-only build doctor, materializes the upload keystore only in runner
   temp, builds one signed AAB, verifies every non-signature AAB entry is
   covered by exactly one approved JAR signer, and retains the AAB plus
   `android-source-manifest.json` for 30 days.
4. The verifier requires `com.chessticize.mobile`, the canonical version name
   and version code, only the two approved ABIs, `PAGE_ALIGNMENT_16K`, at least
   16 KB ELF LOAD alignment for every packaged `.so`, native debug symbols,
   and packaged GPL/source notices.
5. Retain the workflow URL, artifact ID, AAB SHA-256, byte size, largest AAB
   contributors, exact commit, and clean-worktree result. Do not rebuild after
   this step; every Play track and the Production draft must reference this
   exact AAB/version code.

The pinned verifier is:

```sh
CHESSTICIZE_ANDROID_UPLOAD_CERT_SHA256=<approved-upload-certificate> \
pnpm mobile:verify:android:release -- --artifact-only \
  --bundle apps/mobile/android/app/build/outputs/bundle/release/app-release.aab \
  --bundletool <verified-bundletool-1.18.3.jar> \
  --output apps/mobile/artifacts/android-release/android-source-manifest.json
```

`--artifact-only` means only the repository and signed-AAB boundary passed. It
cannot produce a `play-ready` verdict and is not enough to close #186.

## Play and publication sequence

The candidate workflow publishes the exact corresponding source itself. Before
Play distribution, its public Release contains only
`android-source-manifest.json` and matches the annotated tag, commit,
application ID, version, version code, and AAB SHA-256. After Play processing
exposes the universal APK, the separate one-job mirror adds only that exact
Play-generated file and its SHA-256 checksum.

### Release completion states

Use these states in status reports and handoffs:

| State | Required evidence |
| --- | --- |
| Candidate ready | Retained verified AAB, annotated tag, and public source Release containing only the matching source manifest. |
| Play submitted | The same AAB/version code is saved or submitted to the intended track and all currently visible actionable Play errors are resolved. |
| APK available | Play has processed the AAB and the Generated APKs API exposes the Play-signed universal APK; track review may still be open. |
| GitHub binary published | The mirror workflow succeeds, the GitHub Release has exactly the source manifest, Play-signed APK, and checksum, and the mirror receipt is retained. |
| Play published | The intended track reports the version code as published. |

A source-only GitHub Release satisfies the corresponding-source requirement
before Play distribution, but it is not a complete GitHub binary release. Report
the mirror and Play track states independently until both are complete.

### Ordinary delta

For a bounded follow-up release:

For Android version `1.2.1` build `7`, release notes and this support document must
name the canonical source tag `android-v1.2.1-build-7` and the public source
repository `https://github.com/Chessticize/chessticize-mobile`. The evidence
must bind the annotated tag, commit, application ID, version, version code, and
AAB SHA-256 before Play distribution. A missing or lightweight public tag, a
different tag target, an unpublished or draft source Release, mismatched
manifest bytes, or incomplete source disclosure fails closed.

1. Upload the retained AAB from the successful candidate workflow to the chosen
   Play track; do not rebuild it locally. Copy the approved `Store copy` from
   the exact Android release-note file without paraphrasing. Require two or
   three Android-only bullets, at most 300 Unicode characters in total, and the
   direct link to this exact GitHub Release. Save the submitted metadata with
   the release evidence.
2. Run only the targeted CI simulator/emulator checks selected by
   `docs/ANDROID_VALIDATION.md` when the changed boundary requires them.
3. Resolve any new Play Console error or actionable warning for this artifact,
   then promote the same version code.
4. After Play processing exposes the version code's universal APK, dispatch
   `Publish Play-generated Android APK`. This required release
   finalizer downloads from Play, checks only package/version/signing identity
   and SHA-256, and appends the APK plus checksum to the existing source
   Release. It does not rebuild or repeat product validation.
5. Verify that the public Release has exactly the three expected assets and
   retain the workflow receipt described by `docs/ANDROID_GITHUB_RELEASE.md`.

Fast exact-head checks, the selected CI/simulator/emulator scope, and the
protected production-signed AAB/source job are the recurring release gates.
Physical-device testing is optional and never blocks Play submission or the
post-Play mirror. The mirror is a small required publication finalizer, not
another validation gate. A fresh full Detox matrix, unchanged listing review,
generated-package size catalog, and repeated account setup are not recurring
delta gates.

### First launch and change-triggered gates

Complete or refresh the following only for first Production launch, when the
relevant declaration/configuration changed, or when Play flags a problem:

1. Developer identity/package verification, Play App Signing enrollment, and
   upload/app-signing certificate records.
2. Store listing, supported-device declaration, content rating, privacy policy,
   and Data safety answers.
3. Any Closed-testing tester/duration requirement shown by the live account.
4. The exact artifact's pre-launch report and applicable compatibility review.
5. Full Android suites, API 24/adaptive/backup evidence, automated
   migration/upgrade checks, or native artifact size analysis when their
   boundary changed.

Use `docs/android-play-owner-evidence.example.json` and the `play-ready` verifier
for the first-launch audit or another explicitly full release. It remains a
strict evidence collector; it is not required for every ordinary delta:

```sh
CHESSTICIZE_ANDROID_UPLOAD_CERT_SHA256=<approved-upload-certificate> \
pnpm mobile:verify:android:release -- \
  --bundle <retained-app-release.aab> \
  --bundletool <verified-bundletool-1.18.3.jar> \
  --owner-evidence <completed-owner-evidence.json> \
  --output <protected-evidence-directory>/play-ready.json
```

Only `status: "play-ready"` proves that complete first-launch evidence contract.
For every release scope, never move the canonical tag, reuse a version code,
rebuild the retained AAB, or bypass the selected automated validation scope.

## Official requirements checked on 2026-07-17

- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756): the upload key signs the AAB; Play protects a distinct app-signing key and signs delivered APKs.
- [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes): API 35+ Play submissions have required 16 KB support since 2025-11-01.
- [Native debug symbols](https://developer.android.com/build/include-native-symbols): `FULL` AAB symbols preserve function, file, and line information for Play native crash reports.
- [Android developer verification](https://developer.android.com/developer-verification/guides): account verification and package registration are console-owned evidence.
- [Play size limits](https://support.google.com/googleplay/android-developer/answer/9859152): verify the generated per-device compressed download size in Play, not only the raw AAB size.
