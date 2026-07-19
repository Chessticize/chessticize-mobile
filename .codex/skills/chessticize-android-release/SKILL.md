---
name: chessticize-android-release
description: Audit, prepare, advance, recover, and complete Chessticize Mobile Android releases across exact source tags, signed AABs, Play Console tracks, protected GitHub source and binary publication, Play-generated APKs, physical ARM64 validation, and issues #171, #186, #187, #188, and #200. Use for Android release status checks, clean-Mac release setup, release-candidate builds, Play readiness, Android GitHub Releases, versionCode bumps, protected-workflow recovery, tester or device gates, and final launch evidence.
---

# Chessticize Android Release

Treat an Android release as one immutable artifact-and-evidence chain. Never
equate a green repository build with Play readiness or public-launch approval.

## Load the authoritative contracts

Before acting, read these files completely from the repository root:

- `AGENTS.md`
- `apps/mobile/release-version.json`
- `docs/RELEASE_SOURCE_POLICY.md`
- `docs/ANDROID_PLAY_RELEASE.md`
- `docs/ANDROID_GITHUB_RELEASE.md`
- `docs/ANDROID_VALIDATION.md`
- `docs/ANDROID_PLAY_LISTING.md`
- `docs/ANDROID_PRIVACY_DISCLOSURE.md`
- `.github/workflows/mobile-android-release-candidate.yml`
- `.github/workflows/mobile-android-github-release.yml`

Refresh issue #171, every child and comment, open PRs, workflow runs, releases,
protected-environment configuration, and Play Console before relying on a
handoff. Treat all SHAs, run IDs, artifact IDs, version codes, tester counts,
environment policies, and console state as point-in-time evidence.

If live issues and repository docs disagree, stop the affected mutation,
record the conflict on the governing issue, and obtain an owner decision. Do
not silently resolve release-policy conflicts inside this skill.

## Select the operating mode

- For a status or closability request, perform a read-only audit and report the
  exact frontier. Do not close issues, change environments, move tags, publish,
  roll out, fetch refs, install dependencies, or otherwise mutate local or
  remote state. Use GitHub APIs for current remote facts and local read-only Git
  commands for checkout/worktree facts.
- For an advance request, execute only the next dependency-ready phase and
  prove its postconditions before continuing.
- For a failed phase, enter recovery mode. Preserve failed evidence, determine
  whether any artifact or external state was created, and follow the recovery
  rules below.
- For repository changes, first verify that `$implement` and `$code-review` are
  installed and discoverable; sync or install either one if missing. Keep the
  root agent focused on orchestration, run at most two dependency-independent
  implementers in separate clean worktrees, explicitly invoke `$implement` in
  every implementation prompt, and assign a different `$code-review` agent to
  each PR. Require regression coverage and merge only after exact-head checks
  and a `MERGEABLE` verdict.

Use CLI or API operations for auditable state when available. Use Computer Use
for Play Console surfaces that have no supported API, but never use it to
bypass authentication, protected-environment approval, account verification,
or an explicit owner authorization boundary.

## Phase 0: establish a trustworthy machine and checkout

For advance or recovery work, start from the primary repository or a fresh
worktree based on current `origin/main`. Never reuse copied dependencies or
build output from another machine. Run the mutating refresh/setup commands
below only outside strict read-only audit mode.

```sh
gh auth status
git fetch --all --prune
git lfs install
git lfs pull
git status --short --branch
git worktree list --porcelain
```

On a new or uncertain Mac, require Node 22 LTS at least 22.11.0, repository
pnpm 11.1.2, Java 17 or newer, the Android SDK, `adb`, `emulator`, and
`sdkmanager`. Require API 36, Build Tools 36.0.0, NDK 27.1.12297006,
platform-tools, emulator, and supported `arm64-v8a` and `x86_64` images.

```sh
pnpm install --frozen-lockfile
pnpm fetch:core-pack
pnpm mobile:install:android-sdk
pnpm mobile:doctor:android
adb devices -l
emulator -list-avds
pnpm process:validate
pnpm mobile:typecheck
pnpm mobile:test
```

Run the SDK installer only when required packages are missing. Report each
preflight item as PASS, WARN, or FAIL and fix required failures before product
or release mutations. An unavailable physical device is WARN until #200/#188;
it becomes FAIL at the physical release gate.

## Phase 1: derive the live release identity and frontier

1. Require the primary `main` checkout to be clean and synchronized.
2. Read `publicVersion` and `androidVersionCode` from
   `apps/mobile/release-version.json`. Derive the tag through the
   `canonicalAndroidSourceTag` contract in
   `apps/mobile/scripts/android-play-release.js`, which normalizes a missing
   patch component to zero (`1.1` becomes `1.1.0`) and rejects ambiguous
   versions. Do not concatenate or normalize the tag independently.
3. Inspect open PR heads, reviews, unresolved threads, required checks, and all
   worktrees. Resume an existing PR instead of duplicating it.
4. Inspect #171's live dependency graph. Keep #186, #187, #188, and #200 open
   until their own evidence contracts pass.
5. Query the canonical tag, GitHub release, candidate workflow, retained
   artifact, and Play track state before deciding whether the version code is
   unused, retained, distributed, or consumed.
6. Distinguish a **retained candidate** from a **proposed replacement**. The
   retained candidate is the last signed AAB preserved by the candidate
   workflow and remains the recovery target even when a PR proposes a higher
   version code. A version-bump PR/head is only a proposed replacement until
   its own signed workflow artifact exists.
7. Record the retained candidate tuple before mutation: commit SHA, tag,
   package, public version, Android version code, upload certificate, and
   artifact/run identity. Record any proposed replacement separately.

Do not infer external state from issue checkboxes alone. In advance or recovery
mode, post live evidence to the governing issue whenever a gate changes. In
read-only audit mode, report the proposed issue update without posting it.

## Phase 2: freeze and build one candidate

1. Require every repository-owned implementation issue and required PR to be
   merged, reviewed, and green.
2. Run or inspect the complete Android release matrix and complete iOS Detox on
   the exact candidate commit. Require clean exact-SHA evidence as defined by
   `docs/ANDROID_VALIDATION.md`.
3. Confirm the release commit contains the exact puzzle pack, Stockfish source
   and networks, notices, lockfile, privacy contract, and production metadata.
4. Create an annotated canonical Android source tag on that exact commit before
   any Play distribution.
5. Dispatch `Mobile Android release candidate` on the exact tag. Approve
   `android-production` only after comparing the ref and candidate tuple.
6. Retain and independently verify the signed AAB and
   `android-source-manifest.json`. Record the run URL, numeric artifact ID,
   artifact name, archive digest, AAB SHA-256 and bytes, exact commit, ABIs,
   16 KB result, upload certificate, and clean-worktree attestation.

Never rebuild after retaining the candidate. Every Play track, verifier, and
GitHub phase must consume this exact AAB and version code.

## Phase 3: publish corresponding source before distribution

Run the protected GitHub workflow on the exact candidate commit:

1. Dispatch `prepare-source-draft` with the exact public version, version code,
   and candidate artifact ID.
2. Inspect the retained source-draft evidence against the annotated tag,
   commit, manifest bytes, candidate provenance, and release notes.
3. Dispatch `publish-source` with the exact prior artifact ID. Approve
   `android-source-publication` only after the comparison passes.
4. Re-download the public `android-source-manifest.json` and prove it matches
   the protected retained artifact byte-for-byte.

Require the canonical source release to be public before uploading the AAB to
Internal, Closed, or Production. Do not advance `androidVersionCode` while the
corresponding source release is missing.

## Phase 4: complete #186 Play readiness

Use `docs/android-play-owner-evidence.example.json` only as a blank schema and
keep completed evidence protected. Bind every entry to the exact candidate.

1. Verify developer identity, package registration, Play App Signing, upload
   certificate, and Play app-signing certificate.
2. Re-audit listing, privacy, Data safety, permissions, supported devices,
   content rating, screenshots, symbols, and source/license disclosures.
3. Upload the retained AAB to Internal testing. Install the Play-delivered
   build and verify the installed version/build.
4. Promote the same retained build through Closed testing. Satisfy the live
   account's tester-count and continuous-duration requirement exactly as Play
   reports it; never invent, shorten, or replace it with emulator evidence.
5. Inspect the exact artifact's pre-launch report, compatibility, stability,
   performance, accessibility, device catalog, screenshots, and size data.
6. Require the exact candidate Android matrix, API 24 smoke, API 36 full
   suites, adaptive profiles, backup/restore, ABI, symbols, and 16 KB evidence.
7. Prepare Production for the documented direct 100 percent rollout without
   starting it.
8. Run the final verifier against the retained AAB and completed owner record.
   Accept only `status: "play-ready"` as completion evidence for #186.

If Play Console cannot be inspected because of scope, authentication, or
access, mark every unobserved Console gate UNKNOWN with the reason. Never infer
it from GitHub evidence or report it as PASS.

Do not expose tester identities, credentials, private keys, secret values, or
private Console screenshots in GitHub comments or committed files.

## Phase 5: complete #187 GitHub binary publication

Continue the same protected workflow and artifact chain:

1. Dispatch `prepare-binary` with the original candidate artifact ID and exact
   source-publication artifact ID.
2. Require the workflow to re-prove `play-ready`, call the official Generated
   APKs API, select the universal APK under the approved Play app-signing
   certificate, and verify package, version, code, signer, ABIs, permissions,
   source assets, 16 KB alignment, size, and checksum.
3. Independently compare the retained APK and `.sha256` file, provenance, and
   release notes.
4. Dispatch `publish-binary` with the exact preparation artifact ID. Approve
   `android-binary-publication` separately.
5. Re-download the public APK and checksum from the canonical release and
   repeat signature, identity, checksum, ABI, and install verification.

Never download and re-upload an unrecorded local APK. Never substitute an
upload-signed APK for the Play app-signing artifact.

## Phase 6: complete physical and launch gates

1. Run #200 on a physical `arm64-v8a` device using the exact retained
   candidate. Cover install/cold start, both NNUE networks, useful Stockfish
   output, cancellation and reuse, background/resume, force-stop/restart, and
   fresh analysis. Retain redacted device and artifact evidence.
2. Complete the full #188 physical checklist: representative practice and real
   board input, reminders, Back, rotation/adaptive layout, backup/restore,
   supported upgrade, and Play-to-GitHub plus GitHub-to-Play updates with
   progress preserved.
3. Confirm the public GitHub APK and Play artifact share package identity,
   Play app-signing certificate, and monotonic version-code ordering.
4. Start the exact Production rollout directly to 100 percent only after every
   launch gate is green and owner approval is explicit.
5. Record final Play release, GitHub Release, checksum, signing fingerprint,
   exact commit, workflow/artifact IDs, installs, updates, and clean evidence.
6. Close #200, #186, #187, and #188 only when each acceptance contract is
   independently satisfied. Close #171 only after every child is closed and no
   actionable review, CI, publication, or release evidence remains.

## Recover without weakening the chain

- For a repository defect, add a failing regression test first, implement the
  fix through a reviewed PR, merge it, and rerun every invalidated exact-head
  gate.
- For a transient external failure, inspect live partial state before retrying.
  Reuse only authenticated retained inputs and reconcile incomplete assets as
  documented.
- If no artifact, Play upload, or release was created, follow the governing
  issue and runbook before recreating or moving a tag. Require explicit owner
  authorization for any tag mutation.
- Once Play has consumed a version code or any candidate artifact was
  distributed, never move its tag, rebuild it, or reuse its version code.
  Publish its matching source and preserve its evidence; use a reviewed higher
  version code for a replacement candidate.
- Treat a missing source release as a hard stop before a version bump. If a
  historical recovery requires temporarily allowing `main` in a protected
  environment, require explicit owner authorization for the exact environments
  and purpose, keep the exception minimal, remove it immediately afterward,
  and verify the final policy.
- If a retained artifact expires, restart from the earliest phase whose exact
  authenticated input still exists. Never replace it with a local lookalike.
- Keep failed runs and findings visible. Do not hand-edit passing evidence,
  weaken a verifier, skip a required approval, or recast a failure as WARN.

## Report and stop precisely

For every audit or phase, report:

- the exact candidate tuple and current immutable artifacts;
- a concise PASS/WARN/FAIL table with direct evidence links; use UNKNOWN only
  for an external surface that could not be inspected, and state why;
- repository-complete work versus owner-only Play, credential, tester,
  approval, or physical-device gates;
- the next dependency-ready action and the authority it requires;
- changed live state posted to its governing issue;
- clean/synced main, active worktrees, pending PRs, reviews, and CI.

Stop only when the requested phase is proven or when the next action requires
new owner authority, external waiting, or a material policy decision.
