# Android Corresponding Source and Play APK Mirror

Google Play is the primary Android binary channel. GitHub Releases first
publishes the exact corresponding-source identity for the retained AAB. After
the owner publishes and smoke-tests that version through Play, GitHub may also
mirror Google's Play-signed universal APK for manual installation.

This is a Play-first APK mirror, not a second build or an independent release
channel. The GitHub APK has the same application ID, version code, and Play
app-signing certificate as the APK generated from the released AAB.

## Candidate and source publication

The `Mobile Android release candidate` workflow performs the recurring
repository-owned candidate work in one protected job:

1. Run exact-head fast checks.
2. Build and verify one upload-signed AAB.
3. Retain the AAB and `android-source-manifest.json` for 30 days.
4. Publish the matching annotated-tag GitHub Release with the source manifest.

This job uses the built-in `github.token` with `contents: write`. It requires
neither a temporary personal token nor a Play publisher credential. The source
Release must be public before or with every Play-distributed candidate.

## Post-Play APK mirror

After all three conditions are true:

- the retained AAB/version code has been published through the intended Play
  track;
- the owner installed the Play-delivered build and passed the selected physical
  device smoke; and
- the matching corresponding-source Release is already public;

manually dispatch `Publish Play-generated Android APK` with `public_version`
and `version_code`.

The workflow has one job and no protected publication environment. It:

1. resolves and checks out the canonical annotated tag;
2. downloads the existing `android-source-manifest.json` from that Release;
3. obtains a short-lived Android Publisher access token;
4. downloads the universal APK from the Generated APKs API;
5. checks package name, public version, version code, Play app-signing
   certificate, non-empty bytes, and SHA-256;
6. uploads the checksum, updates the Release notes, uploads the APK, and retains
   a small `android-apk-mirror-evidence.json` receipt.

The mirror does not run Gradle, install project dependencies, rebuild the AAB
or APK, rerun product tests or Detox, validate ABIs or 16 KB alignment again,
consume the full Play-ready/owner evidence contract, or wait for another human
approval. Those boundaries were already proven before Play publication.

The operation is idempotent. A retry accepts exact existing assets and fills in
only missing state. Conflicting source, APK, checksum, tag, version, signer, or
Release notes fail without deleting or replacing the public artifact.

## Authentication setup

GitHub publication always uses the built-in `github.token`; do not create a
temporary PAT. Configure Play access once using one of these paths:

1. Preferred: repository variables `GOOGLE_WORKLOAD_IDENTITY_PROVIDER` and
   `GOOGLE_PLAY_PUBLISHER_SERVICE_ACCOUNT` for GitHub OIDC/Workload Identity
   Federation.
2. Fallback: repository secret `ANDROID_PUBLISHER_SERVICE_ACCOUNT_JSON` for a
   least-privilege Play service account.

Also configure repository variable
`ANDROID_PLAY_APP_SIGNING_CERT_SHA256` from Play Console. This is the public
Play app-signing certificate fingerprint, not the upload certificate.

The workflow creates its Android Publisher access token automatically. The
operator does not supply or rotate a temporary token for each release.

## Source recovery

Use `Recover Android corresponding-source publication` only when the candidate
AAB and source manifest were retained but the normal source-publication step
failed. Supply the public version, version code, and original candidate artifact
ID. The workflow authenticates the retained artifact and idempotently publishes
the same source without rebuilding.

Do not use recovery to substitute a local lookalike, move a tag, reuse a
version code, or publish an APK before Play and physical-device acceptance.

## Operator record

Retain:

- canonical tag and commit SHA;
- candidate workflow URL, artifact ID, and AAB SHA-256;
- GitHub Release URL and source-manifest SHA-256;
- Play track/version code and owner smoke result;
- APK mirror workflow URL, Play signing certificate, APK SHA-256, and asset ID.

GitHub APK users update manually. Chessticize does not poll GitHub, download an
update, or install one in the background.
