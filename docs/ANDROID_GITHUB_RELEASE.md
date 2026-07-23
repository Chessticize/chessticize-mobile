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

1. keeps the current release tooling checked out, resolves the canonical
   annotated tag, and reads its immutable `release-version.json` with
   `git show` without detaching to the historical commit;
2. validates that historical identity against the dispatch inputs before any
   GitHub source download or Google Play authentication;
3. downloads the existing `android-source-manifest.json` from that Release;
4. obtains a short-lived Android Publisher access token;
5. downloads the universal APK from the Generated APKs API;
6. checks package name, public version, version code, Play app-signing
   certificate, non-empty bytes, and SHA-256;
7. uploads the checksum, updates the Release notes, uploads the APK, and retains
   a small `android-apk-mirror-evidence.json` receipt.

The mirror does not run Gradle, install project dependencies, rebuild the AAB
or APK, rerun product tests or Detox, validate ABIs or 16 KB alignment again,
consume the full Play-ready/owner evidence contract, or wait for another human
approval. Those boundaries were already proven before Play publication.

The operation is idempotent. A retry accepts exact existing assets and fills in
only missing state. Conflicting source, APK, checksum, tag, version, signer, or
Release notes fail without deleting or replacing the public artifact.

## Customer release notes

Before creating the annotated tag, approve the exact Android customer note
under `docs/releases/` as required by `docs/RELEASE_NOTES.md`. Its store block
contains two or three Android-only bullets, stays within 300 Unicode
characters, and links this exact GitHub Release for details and source.

The generated GitHub body puts a prominent link to that checked-in note first,
then preserves the source, signing, checksum, and manual-installation details.
Do not hand-edit or replace the generated body with store copy.

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

## Operator procedure

The commands below are the recurring operator path. Replace the example public
version, version code, tag, commit, and run ID with the exact retained candidate.
Do not dispatch the mirror until the Play-delivered build has passed the owner
device smoke and the matching source Release is public.

### 1. Check the one-time authentication setup

List configuration names without printing secret values:

```sh
gh variable list --repo Chessticize/chessticize-mobile
gh secret list --repo Chessticize/chessticize-mobile
```

Confirm that the names required by [Authentication setup](#authentication-setup)
are present. When both authentication paths are stored during a migration, the
workflow uses Workload Identity Federation whenever
`GOOGLE_WORKLOAD_IDENTITY_PROVIDER` is non-empty and ignores the JSON fallback.
If that variable is absent or empty, the workflow selects the JSON fallback.

The Publisher identity must have only the Google Play permissions required to
read the released app-bundle version and download its generated APKs. It does
not need GitHub credentials, upload-signing material, or permission to publish
a new Play release.

### 2. Verify the immutable release prerequisites

For Android `1.2` build `5`, verify the public source Release and its sole
pre-mirror asset, prove that the canonical tag is annotated, and compare its
dereferenced commit with the source manifest:

```sh
gh release view android-v1.2.0-build-5 \
  --repo Chessticize/chessticize-mobile \
  --json tagName,isDraft,isPrerelease,publishedAt,url,assets

tag_object_sha="$(gh api \
  repos/Chessticize/chessticize-mobile/git/ref/tags/android-v1.2.0-build-5 \
  --jq '.object | select(.type == "tag") | .sha')"
test -n "$tag_object_sha"

tagged_commit_sha="$(gh api \
  "repos/Chessticize/chessticize-mobile/git/tags/$tag_object_sha" \
  --jq '.object | select(.type == "commit") | .sha')"
test -n "$tagged_commit_sha"

mkdir -p scratch/android-apk-mirror/build-5/preflight
gh release download android-v1.2.0-build-5 \
  --repo Chessticize/chessticize-mobile \
  --pattern android-source-manifest.json \
  --dir scratch/android-apk-mirror/build-5/preflight \
  --clobber

manifest_commit_sha="$(jq -r '.commitSha' \
  scratch/android-apk-mirror/build-5/preflight/android-source-manifest.json)"
test "$tagged_commit_sha" = "$manifest_commit_sha"
printf 'candidate commit: %s\n' "$tagged_commit_sha"
```

The tag query must return an annotated tag object, the tag and manifest commits
must match the retained candidate commit, the Release must be public, and
`android-source-manifest.json` must be its only asset before mirroring.
Separately record the active Play track and the accepted owner device-smoke
evidence. An issue checkbox or emulator result does not replace either live
Play state or the physical-device result.

### 3. Dispatch and monitor the mirror

Dispatch from current `main`; the workflow resolves the historical candidate
from the immutable tag and does not rebuild it. Capture the returned run URL so
later checks remain bound to this dispatch:

```sh
dispatch_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
run_url="$(gh workflow run mobile-android-github-release.yml \
  --repo Chessticize/chessticize-mobile \
  --ref main \
  -f public_version=1.2 \
  -f version_code=5)"
printf '%s\n' "$run_url"
```

Extract the numeric run ID from that URL and wait for its exact result. Do not
substitute the newest workflow run, which could belong to another operator:

```sh
run_id="${run_url##*/}"
test -n "$run_id"
gh run view "$run_id" \
  --repo Chessticize/chessticize-mobile \
  --json url,event,headBranch,headSha,workflowName
gh run watch "$run_id" \
  --repo Chessticize/chessticize-mobile \
  --exit-status
```

If the installed `gh` version does not return a URL, use
`dispatch_started_at` to narrow the Actions UI or `gh run list --created`
results. Continue only after identifying a single run created by this dispatch
and confirming its `public_version`, `version_code`, workflow, and `main` head;
otherwise stop without selecting a run by recency alone.

### 4. Verify the public APK and retained receipt

A successful Android `1.2` build `5` mirror leaves exactly these three public
Release assets:

- `android-source-manifest.json`
- `Chessticize-Android-1.2.apk`
- `Chessticize-Android-1.2.apk.sha256`

Verify the public state, then download the APK and checksum into ignored local
evidence storage:

```sh
gh release view android-v1.2.0-build-5 \
  --repo Chessticize/chessticize-mobile \
  --json assets,url

mkdir -p scratch/android-apk-mirror/build-5/public
gh release download android-v1.2.0-build-5 \
  --repo Chessticize/chessticize-mobile \
  --pattern 'Chessticize-Android-1.2.apk*' \
  --dir scratch/android-apk-mirror/build-5/public

(
  cd scratch/android-apk-mirror/build-5/public
  shasum -a 256 -c Chessticize-Android-1.2.apk.sha256
)
```

Download the small workflow receipt separately and retain its release URL,
asset IDs, Play download ID, APK byte size, APK SHA-256, and Play app-signing
certificate SHA-256:

```sh
gh run download "$run_id" \
  --repo Chessticize/chessticize-mobile \
  --name android-apk-mirror-<candidate-commit-sha> \
  --dir scratch/android-apk-mirror/build-5/receipt
```

### 5. Recover a failed mirror

Read the failed step before changing configuration:

```sh
gh run view <run-id> \
  --repo Chessticize/chessticize-mobile \
  --log-failed
```

If Google authentication says that exactly one of
`workload_identity_provider` or `credentials_json` is required, the selected
one-time authentication path is missing or incomplete. Configure one path,
then dispatch the same version inputs again. The mirror is idempotent and
reconciles exact existing assets; do not delete assets, move the tag, rebuild
the AAB, change the version code, or hand-edit the Release to recover it.

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
