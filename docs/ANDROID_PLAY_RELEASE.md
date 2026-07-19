# Android Play Release Candidate

This runbook builds and audits the first production-upload-signed Android App
Bundle. It deliberately separates repository-owned checks from owner-only Play
Console evidence. Missing signing material, protected-environment setup, or any
console result is a blocker; never replace it with a debug key, a scratch key,
an emulator claim, or a hand-edited passing JSON file.

## Canonical identity

- Application ID: `com.chessticize.mobile`
- Public version: `apps/mobile/release-version.json` (`1.1`)
- Android version code: `apps/mobile/release-version.json` (`1`)
- iOS build number: `apps/mobile/release-version.json` (`2`, independent from Android)
- Supported ABIs: `arm64-v8a`, `x86_64`
- Target SDK: API 36
- Required source tag before any Play track upload: `android-v1.1.0-build-1`

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

## Build and repository audit

1. Start from a clean exact candidate commit containing the canonical puzzle
   pack, Stockfish source and networks, license notices, and lockfile. Create
   and publish the annotated `android-v<version>-build-<code>` source tag before
   distributing the candidate through any Play testing track.
2. Dispatch `Mobile Android release candidate` on that exact ref. The workflow
   materializes the upload keystore only in runner temp, builds one signed AAB,
   verifies every non-signature AAB entry is covered by exactly one approved
   JAR signer, and retains the AAB plus `android-source-manifest.json` for 30
   days.
3. The verifier requires `com.chessticize.mobile`, the canonical version name
   and version code, only the two approved ABIs, `PAGE_ALIGNMENT_16K`, at least
   16 KB ELF LOAD alignment for every packaged `.so`, native debug symbols,
   and packaged GPL/source notices.
4. Retain the workflow URL, artifact ID, AAB SHA-256, byte size, largest AAB
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

## Owner-only Play sequence

Use `docs/android-play-owner-evidence.example.json` as a blank contract. Every
completed external gate must carry an evidence ID, an auditable HTTPS reference,
and the exact commit/AAB/application/version binding. Record links or IDs in the
protected release record; do not commit credentials, tester identities, private
console screenshots, or signing material.

The owner evidence schema v3 adds the mandatory `sourceRelease` record. After
the protected candidate workflow passes, use the `prepare-source-draft` and
`publish-source` phases in `docs/ANDROID_GITHUB_RELEASE.md` to attach its
unchanged `android-source-manifest.json` to the canonical public GitHub release. Record
both the GitHub release asset ID and the protected Actions workflow run,
artifact ID, artifact name, archive SHA-256, and manifest entry path. The final
verifier dereferences the live GitHub tag ref and annotated tag object to the
exact candidate commit; verifies the published release, release notes, and
retained asset; downloads the protected Actions artifact; and requires the
manifest bytes in that artifact to exactly match the public release asset. It
then binds the audit inside the manifest to the exact commit, AAB, package,
version, and code.

Set `CHESSTICIZE_GITHUB_TOKEN` or `GITHUB_TOKEN` to a GitHub token that can read
the retained Actions artifact before requesting a `play-ready` verdict. The
verifier passes this credential to `curl` through standard input, not command
arguments. Do not put it in owner evidence or commit it.

For Android version `1.1` build `1`, release notes and this support document must
name the canonical source tag `android-v1.1.0-build-1` and the public source
repository `https://github.com/Chessticize/chessticize-mobile`. The evidence
record points to this document at the exact candidate commit and records its
SHA-256. Plausible hand-authored URLs, IDs, or matching-looking JSON do not
satisfy these checks. A missing or lightweight public tag, a different tag
target, an unpublished or draft release, an unavailable API or artifact,
mismatched archive or manifest bytes, or incomplete source disclosure fails
closed. This repository does not currently claim that the owner-only tag or
release exists.

Before those protected GitHub Release phases, configure the temporary
fine-grained `ANDROID_GITHUB_RELEASE_TOKEN` in the three environments exactly as
specified by `docs/ANDROID_GITHUB_RELEASE.md`. Remove the environment secrets
and revoke/delete the token after the selected Internal or Closed release flow
and its required GitHub source/binary publication are complete.

1. Complete Play developer account identity verification and register
   `com.chessticize.mobile` under Android developer verification.
2. Create the production Play app identity, accept Play App Signing, register
   the approved upload certificate, and record both upload and Play app-signing
   SHA-256 fingerprints.
3. Enter and review the listing, supported-device declaration, content rating,
   privacy-policy URL, and Data safety answers from
   `docs/ANDROID_PLAY_LISTING.md`.
4. Upload the retained AAB to Internal or Closed testing. Install it through
   Play on an eligible device, confirm the installed version/build in Settings,
   and retain the track/release/install evidence. Either track satisfies #186;
   record both when both were run.
5. If the developer account is subject to a minimum Closed-testing
   tester/duration requirement, satisfy the live Play Console requirement; do
   not guess it from account age.
6. Wait for the exact artifact's pre-launch report. Review Stability,
   Performance, Accessibility, screenshots, and compatibility. Errors or
   actionable warnings block the candidate until fixed and rerun.
7. Run or verify `Mobile Android` on the exact candidate commit. Require API 24,
   API 36 full shared suites, adaptive profiles, and backup evidence. Reference
   the run and artifact IDs; do not copy a result from another SHA.
8. Download Play's universal APK and a generated ARM64 APK. Record each size,
   the largest contributors, and the approved size range/reference. A measured
   size outside the approved range is a release decision blocker, not a reason
   to edit the evidence.
9. Prepare Production from the same version code with a direct 100 percent
   rollout, but do not start the rollout in #186.

Then run the final gate against the retained AAB and completed owner record:

```sh
CHESSTICIZE_ANDROID_UPLOAD_CERT_SHA256=<approved-upload-certificate> \
pnpm mobile:verify:android:release -- \
  --bundle <retained-app-release.aab> \
  --bundletool <verified-bundletool-1.18.3.jar> \
  --owner-evidence <completed-owner-evidence.json> \
  --output <protected-evidence-directory>/play-ready.json
```

Only `status: "play-ready"` from this exact-artifact gate proves #186. Public
Production launch, the Play-signed GitHub APK, physical ARM64 release approval,
and final release-candidate convergence remain later release work.
Continue with the protected `prepare-binary` and `publish-binary` phases in
`docs/ANDROID_GITHUB_RELEASE.md`; do not rebuild or substitute the candidate.

## Official requirements checked on 2026-07-17

- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756): the upload key signs the AAB; Play protects a distinct app-signing key and signs delivered APKs.
- [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes): API 35+ Play submissions have required 16 KB support since 2025-11-01.
- [Native debug symbols](https://developer.android.com/build/include-native-symbols): `FULL` AAB symbols preserve function, file, and line information for Play native crash reports.
- [Android developer verification](https://developer.android.com/developer-verification/guides): account verification and package registration are console-owned evidence.
- [Play size limits](https://support.google.com/googleplay/android-developer/answer/9859152): verify the generated per-device compressed download size in Play, not only the raw AAB size.
