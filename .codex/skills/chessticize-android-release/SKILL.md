---
name: chessticize-android-release
description: Audit, prepare, advance, recover, and complete Chessticize Mobile Android releases across exact source tags, protected signed AABs, Google Play tracks, post-Play APK mirroring, risk-scoped validation, and owner physical-device smoke. Use for release status, local or CI builds, Play readiness, versionCode bumps, source-publication recovery, and launch evidence.
---

# Chessticize Android Release

Google Play distributes Android binaries first. GitHub publishes corresponding
source and may mirror the exact Play-signed universal APK after owner
acceptance. Treat the signed AAB, annotated tag, source manifest, Play version
code, mirrored APK, and owner device result as one release identity.

## Load the authoritative contracts

Read these files completely before acting:

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
- `.github/workflows/mobile-android-source-recovery.yml`

Use them for commands, evidence fields, Console copy, and workflow inputs. Live
store/account requirements override repository assumptions. ADR-0009 replaces
the historical multi-phase GitHub publication protocol with one post-Play APK
mirror job.

## Select the operating mode

- For status, perform a read-only audit of exact tags, releases, workflow runs,
  artifacts, open PRs, and visible Play state.
- For advance work, execute the next dependency-ready action and verify its
  postcondition.
- For recovery, preserve failed evidence and reuse only the exact retained
  candidate artifact.
- For repository changes, follow `AGENTS.md` and the user's requested scope.

Prefer CLI or APIs for auditable state. Use Computer Use only for Play Console
surfaces without a supported API, and never bypass authentication, protected
approval, account verification, or explicit owner authorization.

## Establish a trustworthy checkout

For a new or uncertain Mac, begin with a clean synchronized checkout and run:

```sh
gh auth status
git fetch --all --prune
git lfs install
git lfs pull
git status --short --branch
pnpm install --frozen-lockfile
pnpm fetch:core-pack
pnpm mobile:doctor:android
pnpm process:validate
pnpm mobile:typecheck
pnpm mobile:test
adb devices -l
```

Require Node 22 LTS, pnpm 11.1.2, Java 17 or newer, and the Android packages in
`docs/ANDROID_VALIDATION.md`. Report PASS/WARN/FAIL. Do not run this mutating
setup during a strict read-only audit.

## Resolve the live identity

1. Read `publicVersion` and `androidVersionCode` from
   `apps/mobile/release-version.json` and derive the canonical tag with
   `canonicalAndroidSourceTag`.
2. Distinguish a retained signed candidate from a proposed replacement. A code
   or version change is not a candidate until its own signed AAB exists.
3. Record commit, annotated tag, package, public version, version code,
   candidate workflow/run/artifact ID, AAB digest, source Release, Play track,
   and owner device-smoke state.
4. Never infer Play state from issue checkboxes. Mark unobserved Console gates
   UNKNOWN.

## Select the release scope

- **Delta:** bounded JavaScript, copy, styling, test, documentation, or release
  metadata changes. Require exact-head fast checks, the protected signed
  AAB/source job, and owner physical-device smoke.
- **Targeted:** navigation, one multi-screen journey, relaunch persistence,
  board rendering/input, adaptive layout, or one native-module boundary. Add
  the affected suite or manual native check.
- **Full:** startup, shared navigation/storage wiring, schema/migration, global
  fixtures, native build configuration/dependencies, signing/release
  infrastructure, backup, Stockfish, notifications, or unbounded native risk.
  Run both suites and the applicable compatibility/manual matrix.

Every release is installed on the owner's physical device. A delta smoke records
installed version/build, cold launch, one real Practice completion, and the
changed behavior. Do not repeat unchanged listing, account, screenshot, closed
test, pre-launch, size, backup, or compatibility gates unless this is first
launch, the boundary changed, or Play reports a problem.

## Route the release

| Action | Required postcondition |
| --- | --- |
| Prepare identity | Clean exact commit and published annotated canonical tag; monotonically increasing version code. |
| Build candidate | One `android-production` approval produces a verified production-signed AAB, retained source manifest, and public matching source-first Release. |
| Recover source | The manual recovery workflow authenticates the original candidate artifact and idempotently publishes the same source manifest; no rebuild or token substitution. |
| Validate | Exact-head fast checks plus the selected delta, targeted, or full scope pass. |
| Test on device | The Play-delivered candidate passes owner smoke and any changed-boundary checks. |
| Promote | The same retained AAB/version code advances through the selected Play track; applicable live Console errors are resolved. |
| Mirror APK | After Play publication and owner smoke, one manual CI job downloads the Play-signed universal APK, verifies identity, and adds it plus SHA-256 to the source Release. |

Both GitHub mutations use the built-in `github.token` with `contents: write`.
The mirror obtains a short-lived Play token through configured workload identity
or a least-privilege service account; it never asks the operator for a temporary
token. Do not add prepare/publish phases or a second APK build.

## Preserve invariants

- Publish matching source before or with every distributed binary, including
  Internal and Closed tracks.
- Reuse one retained AAB across every Play track and Production; never rebuild
  between tracks.
- Publish only the universal APK returned by Play after the owner accepts the
  Play-delivered release; never publish an upload-key or locally rebuilt APK.
- Preserve package, versions, upload signing identity, ABIs, 16 KB result,
  license/source assets, symbols, and AAB digest.
- Keep credentials, signing material, tester identities, private evidence, and
  Console screenshots out of commits and public comments.
- Do not weaken Google requirements, GPL disclosure, changed-boundary tests, or
  physical-device acceptance.

## Recover without broadening the protocol

- Add regression coverage for repository defects and rerun only invalidated
  exact-head gates.
- For a source-publication failure, use the recovery workflow with the original
  candidate artifact ID. It can recover an artifact retained before the normal
  workflow's later source step failed.
- Once Play consumes a version code or distributes a candidate, never move its
  tag, rebuild it, or reuse its code. Create a higher-code replacement.
- If the retained artifact expires, build a new reviewed candidate with a new
  version code. Never substitute a local lookalike.
- Preserve failed runs and report external waits as UNKNOWN or blocked; do not
  hand-edit evidence.
- A failed APK mirror is retried idempotently against the same Play version
  code. It does not invalidate the already accepted Play release or trigger a
  rebuild.

## Report completion

Report the exact identity tuple, validation scope and rationale, fast-check
results, workflow/artifact/source state, owner device result, Play state, and
remaining owner-only gates. Stop when the requested release outcome is proven
or the next action needs new owner authority or external waiting.
