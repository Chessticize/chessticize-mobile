# Android Play-Signed GitHub APK

This runbook governs the repository-owned automation for publishing the exact
Play-generated universal APK on the canonical Android GitHub release. It does
not upload an AAB to Play, start a Play rollout, create owner evidence, or
replace any gate in [the Play release-candidate runbook](./ANDROID_PLAY_RELEASE.md).

## Wording conflict and canonical lifecycle

There is one GitHub tag and one GitHub release per Android identity.
#186 requires the canonical source release to be public before its final
`play-ready` verdict. #187 literally asks automation to create a draft release
after that verdict. GitHub cannot have both a public release and a new
draft for the same canonical tag. The lifecycle below preserves all security
and source-disclosure gates, but it does not strictly resolve that wording conflict.
Keep #187 open until the owner evidence is complete and the issue
ordering is ratified or corrected.

The manual `Mobile Android GitHub release` workflow has four fail-closed
phases. Always reuse the same public version, Android version code, annotated
source tag, and release:

1. `prepare-source-draft` authenticates the retained signed-candidate Actions
   artifact from #186, creates the canonical draft release, and attaches the
   exact `android-source-manifest.json`. It retains a source-draft evidence
   artifact; it does not publish the release.
2. `publish-source` accepts only that exact retained evidence. After a reviewer
   approves the `android-source-publication` environment, it publishes the
   source-only canonical release so the final #186 gate can verify public
   source availability. It retains source-publication evidence.
3. `prepare-binary` accepts the exact signed-candidate and source-publication
   artifacts. It reruns the final #186 verifier using the retained AAB and
   protected owner evidence, requires `status: play-ready`, obtains a scoped
   OAuth access token, and calls the official Google Play Generated APKs API.
   It downloads the universal APK selected by the approved Play app-signing
   certificate, verifies the complete APK contract, and retains the immutable
   APK, checksum, source manifest, and preparation evidence. It does not change
   the public release.
4. `publish-binary` accepts only that exact preparation artifact. After a
   different protected publication approval, it rechecks the live canonical
   release, exact source asset, APK bytes, checksum, notes, version, package,
   ABI set, signing certificate, and provenance. It publishes the checksum
   first, then the exact binary notes, and attaches the executable APK last.
   Any incomplete, unexpected, duplicate, or mismatched pre-existing APK is
   removed before the phase continues. APK cleanup failures stop with the exact
   asset ID and require manual removal; they are never hidden behind the
   original API failure.

There is no push, pull-request, scheduled, tag-creation, Play-upload, or Play
rollout trigger. Preparation never implies publication, and a publication job
cannot run without its exact retained prior-phase artifact.

## One-time protected configuration

Create these GitHub Environments, restrict them to the release branch, and
require reviewers:

- `android-production`: existing #186 signing/candidate controls and the two
  preparation phases. Preparation has no public-release approval marker.
- `android-source-publication`: a reviewer explicitly authorizes the one
  source-only publication. Only this job receives
  `CHESSTICIZE_ANDROID_SOURCE_PUBLICATION_APPROVED=true`.
- `android-binary-publication`: a reviewer explicitly authorizes attaching the
  prepared Play-signed binary. Only this job receives
  `CHESSTICIZE_ANDROID_BINARY_PUBLICATION_APPROVED=true`.

Keep all credentials and private evidence in protected environment secrets;
never commit them or put them in workflow inputs:

- `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_STORE_PASSWORD`,
  `ANDROID_RELEASE_KEY_ALIAS`, `ANDROID_RELEASE_KEY_PASSWORD`, and
  `ANDROID_UPLOAD_CERT_SHA256` remain the #186 candidate inputs.
- `ANDROID_PLAY_OWNER_EVIDENCE_BASE64` is the completed owner evidence JSON for
  the exact retained AAB. The workflow writes it with mode `0600` in runner
  temp and destroys it in an `always()` step.
- `ANDROID_PUBLISHER_SERVICE_ACCOUNT_JSON` is a least-privilege service-account
  credential authorized to read Generated APKs for
  `com.chessticize.mobile`. The authentication action requests only
  `https://www.googleapis.com/auth/androidpublisher`.

The service account does not need permission to edit a Play release or rollout.
Do not substitute upload-key credentials for the Play app-signing certificate.

## Dispatch and retained-evidence chain

Start every phase on the exact release-candidate commit. Record each workflow
URL, run ID, input artifact ID, artifact name, and GitHub-provided artifact
archive SHA-256. The workflow downloads artifacts by immutable numeric ID,
rejects expired artifacts, verifies the archive digest before extraction, and
binds those values into the next evidence JSON.

1. Dispatch `prepare-source-draft` with `public_version`, `version_code`, and
   the retained #186 `candidate_artifact_id`.
2. Inspect the resulting `android-source-draft-<run-id>` artifact. Dispatch
   `publish-source` with its numeric ID as `prior_artifact_id`, then approve the
   source-publication environment only after comparing the tag, commit,
   manifest, candidate provenance, and release notes.
3. Complete the owner-only Play sequence and final evidence described in
   `docs/ANDROID_PLAY_RELEASE.md`. Dispatch `prepare-binary` with the original
   #186 candidate ID and the exact `android-source-publication-<run-id>` ID.
4. Inspect `android-binary-preparation-<run-id>`. Confirm the APK and `.sha256`
   file match locally, review the truthful release notes, and dispatch
   `publish-binary` with that artifact ID as `prior_artifact_id`. Approve the
   binary-publication environment only after all comparisons pass.

Never download and re-upload an unrecorded local APK. Never rebuild the AAB or
APK between phases. If an artifact expires, restart from the earliest phase
whose authenticated input still exists. Any identity, evidence, digest, API,
inspection, asset, or publication mismatch fails closed.

## Verified binary contract

The official [Generated APKs API list
method](https://developers.google.com/android-publisher/api-ref/rest/v3/generatedapks/list)
groups generated downloads by app-signing certificate. The automation selects
exactly one matching `generatedUniversalApk`, then uses the official [download
method](https://developers.google.com/android-publisher/api-ref/rest/v3/generatedapks/download)
and streams it to a temporary file before an atomic rename.

The verifier requires all of the following before retaining or publishing the
APK:

- package `com.chessticize.mobile`, exact public version and Android version
  code, and exactly the approved Play app-signing SHA-256 certificate;
- exactly one signer, release rather than debug/test packaging, and no
  unexpected `android.permission.INTERNET` permission;
- only `arm64-v8a` and `x86_64`, the required GPL/source assets, ZIP page
  alignment, and at least 16 KB LOAD alignment for every native ELF library;
- SHA-256 and byte size equal to the measured streamed file, the Play API
  size when supplied, and the owner-approved minimum/maximum size range;
- release asset names `Chessticize-Android-<public-version>.apk` and the matching
  `.sha256`, with no pre-existing or duplicate binary assets.

Release notes state that the binary was generated and signed by Google Play,
name the exact package/version/code and app-signing fingerprint, link the
canonical source tag and repository, provide checksum instructions, and explain
manual installation. The app performs no automatic GitHub update checks and
adds no update telemetry, background polling, downloader, or install prompt.
Settings only offers an explicit link to the GitHub Releases page on Android.

## Manual installation and channel safety

Users may download the APK and checksum from the GitHub release, verify the
published SHA-256 locally, and install it through Android's normal manual
package-install flow. Installation over a Play copy works only when the
package, app-signing key, and version-code ordering match. The workflow verifies
those values; it does not bypass Android downgrade or installer protections.

Play remains the normal update channel. A GitHub-installed copy is not polled
or updated automatically. Before publishing a later GitHub APK, ensure its
version code is not lower than any Play-distributed build that users may have.

## Owner-only completion and retry rules

Repository tests can prove the orchestration, parsing, API contracts, identity
checks, cleanup behavior, UI link, and absence of automatic update logic. They
cannot prove live Play Console identity, Play App Signing enrollment, service
account access, Generated APK availability, a physical ARM64 install, or a real
GitHub publication. Those remain protected owner evidence; issue #200 remains
the Android physical-device release gate.

Do not weaken a failure into a warning. Fix repository defects with regression
tests and rerun from a clean exact head. For transient Google, GitHub, or Actions
failures, retry only after confirming that no APK exists without its exact
checksum and binary notes. The automation reconciles an exact complete state,
retains safe checksum/notes preparation for retry, and removes any incomplete
APK. If APK deletion fails, remove the reported asset manually and confirm the
release state before retrying. A successful dry preparation is not publication
evidence, and no phase authorizes a Production rollout.
