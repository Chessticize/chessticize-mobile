---
name: chessticize-android-release
description: Audit, prepare, advance, recover, and complete Chessticize Mobile Android releases across exact source tags, signed AABs, Play Console tracks, protected GitHub source and binary publication, Play-generated APKs, physical ARM64 validation, and issues #171, #186, #187, #188, and #200. Use for Android release status checks, clean-Mac release setup, release-candidate builds, Play readiness, Android GitHub Releases, versionCode bumps, protected-workflow recovery, tester or device gates, and final launch evidence.
---

# Chessticize Android Release

Treat an Android release as one immutable artifact-and-evidence chain. Never
equate a green repository build with Play readiness or launch approval.

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

Use those files for phase details, commands, evidence fields, Console copy, and
workflow inputs. Keep this skill limited to routing and cross-phase invariants.
If live issues and repository docs disagree, stop the affected mutation,
record the conflict, and obtain an owner decision rather than inventing policy.

Refresh issue #171, every child and comment, open PRs, workflow runs, releases,
protected environments, and Play Console before relying on a handoff. Treat
SHAs, artifact IDs, tester requirements, environment policies, and Console
state as point-in-time evidence.

## Select the operating mode

- For status or closability, perform a strict read-only audit. Do not fetch
  refs, install dependencies, post comments, close issues, dispatch workflows,
  change environments, move tags, publish, or roll out. Use GitHub APIs for
  current remote facts and read-only Git commands for local facts.
- For advance work, execute only the next dependency-ready phase and prove its
  postconditions before continuing.
- For recovery, preserve failed evidence, determine exactly which local and
  external state exists, then apply the recovery rules below.
- For repository code changes, follow `AGENTS.md` and the active issue or user
  instructions for worktrees, implementation, review, CI, and merge policy.

Prefer CLI or APIs for auditable state. Use Computer Use only for Play Console
surfaces without a supported API, and never to bypass authentication, protected
approval, account verification, or explicit owner authorization.

## Establish a trustworthy checkout

For advance or recovery on a new or uncertain Mac, start from current
`origin/main` and run the clean-machine preflight. Never copy `node_modules`,
Pods, Gradle output, temporary worktrees, or other machine-local build state.

```sh
gh auth status
git fetch --all --prune
git lfs install
git lfs pull
git status --short --branch
git worktree list --porcelain
pnpm install --frozen-lockfile
pnpm fetch:core-pack
pnpm mobile:doctor:android
adb devices -l
emulator -list-avds
pnpm process:validate
pnpm mobile:typecheck
pnpm mobile:test
```

Require Node 22 LTS at least 22.11.0, repository pnpm 11.1.2, Java 17 or
newer, and the SDK/packages named by `docs/ANDROID_VALIDATION.md`. Run
`pnpm mobile:install:android-sdk` only when required packages are missing.
Report PASS/WARN/FAIL and fix required failures before release mutation. A
missing physical device is WARN until #200/#188 and FAIL at that release gate.

Do not run this mutating setup block during strict read-only audit mode.

## Resolve the live identity and frontier

1. Require a clean, synchronized primary `main` checkout before mutation.
2. Read `publicVersion` and `androidVersionCode` from
   `apps/mobile/release-version.json`. Derive the tag through
   `canonicalAndroidSourceTag` in
   `apps/mobile/scripts/android-play-release.js`; it normalizes a missing patch
   component to zero (`1.1` becomes `1.1.0`) and rejects ambiguity.
3. Distinguish the **retained candidate** from a **proposed replacement**. The
   retained candidate is the last signed AAB preserved by the candidate
   workflow. A version-bump PR is only a proposed replacement until its own
   signed candidate artifact exists.
4. Inspect open PR heads, reviews, threads, checks, worktrees, the canonical
   tag/ref, GitHub release, workflow artifacts, and Play tracks. Resume live
   work instead of duplicating it.
5. Record retained and proposed tuples separately: commit, tag, package,
   public version, version code, signing identity, workflow run, artifact ID,
   archive digest, AAB digest, and distribution state.

Never infer external state from issue checkboxes. If Play Console cannot be
inspected because of scope, authentication, or access, mark every unobserved
Console gate UNKNOWN and state why.

## Route the next phase

Read the listed contract immediately before executing a row. Require its
postcondition before moving down the table.

| Phase | Authoritative contract | Required postcondition |
| --- | --- | --- |
| Repository and native convergence | `docs/ANDROID_VALIDATION.md`, #171 dependency graph | Required implementation PRs are merged; exact candidate Android and iOS evidence is green and clean. |
| Retain signed candidate | `docs/ANDROID_PLAY_RELEASE.md`, candidate workflow | The annotated canonical tag is created **and published** on the exact commit; one signed AAB and source manifest are retained and independently verified. |
| Publish corresponding source | `docs/ANDROID_GITHUB_RELEASE.md` phases `prepare-source-draft` then `publish-source` | The canonical public source release and manifest match the retained artifact byte-for-byte before any Play-track distribution. |
| Complete #186 | Owner sequence in `docs/ANDROID_PLAY_RELEASE.md` | The retained AAB is installed through Internal **or** Closed testing; any Closed tester/duration rule is satisfied only if the live account requires it; exact owner evidence yields `status: "play-ready"`; Production is prepared but not started. |
| Complete #187 | `docs/ANDROID_GITHUB_RELEASE.md` phases `prepare-binary` then `publish-binary` | The exact Play-generated universal APK and checksum are public and reverified; the documented #186/#187 ordering conflict is owner-ratified or corrected. |
| Complete #200 and #188 | Physical checklist in `docs/ANDROID_VALIDATION.md`, live issue acceptance | Exact-candidate physical ARM64, install, engine, lifecycle, backup, upgrade, and cross-channel evidence passes; the approved Production artifact launches directly to 100 percent. |

Preparation never authorizes publication, and publication never authorizes a
Production rollout. Honor each protected environment as a separate approval.

## Preserve cross-phase invariants

- Publish matching source before or with every distributed binary, including
  Internal and Closed testing.
- Reuse one retained AAB across every Play track and the Production draft. Do
  not rebuild between phases.
- Use the original candidate artifact ID through source preparation and binary
  preparation. Authenticate every retained prior-phase artifact by numeric ID,
  name, run, and archive digest.
- Accept only the documented package, public version, Android version code,
  upload certificate, Play app-signing certificate, ABIs, 16 KB result,
  license/source assets, symbols, permissions, size, and checksums.
- Keep credentials, signing material, tester identities, private owner
  evidence, and private Console screenshots out of commits and public comments.
- Do not weaken tests, verifiers, approvals, source disclosure, tester rules,
  physical evidence, or issue acceptance criteria.

## Recover without weakening the chain

- For a repository defect, add a regression test, fix it through the repository
  PR/review policy, and rerun every invalidated exact-head gate.
- For an external failure, inspect partial state before retrying. Reuse only
  authenticated retained inputs and reconcile incomplete release assets as the
  GitHub release runbook specifies.
- If no artifact, Play upload, or release exists, follow the governing issue
  before recreating or moving a tag. Require explicit owner authorization for
  any tag mutation.
- Once Play consumes a version code or a candidate is distributed, never move
  its tag, rebuild it, or reuse its version code. Preserve and publish its
  matching source; create a reviewed higher-code replacement separately.
- Treat a missing source release as a hard stop before a version bump. If
  historical recovery requires temporarily allowing `main` in protected
  environments, require explicit owner authorization naming the environments
  and purpose, minimize the exception, remove it immediately, and verify the
  final policy.
- If an artifact expires, restart from the earliest phase whose exact
  authenticated input still exists. Never substitute a local lookalike.
- Preserve failed runs and findings. Do not hand-edit evidence or recast a
  failure as WARN.

## Report and close precisely

For every audit or phase, report the retained and proposed tuples, a concise
PASS/WARN/FAIL table with direct evidence, UNKNOWN external surfaces, active
PR/worktree/CI state, owner-only gates, and the next dependency-ready action.
In advance or recovery mode, post changed evidence to the governing issue. In
read-only mode, report the proposed issue update without posting it.

Close #186 only on exact retained-artifact `play-ready` evidence. Close #187
only after binary publication evidence **and** owner ratification or correction
of the documented ordering conflict. Close #200 and #188 only on their live
physical and launch contracts. Close #171 only when every child is closed and
no actionable review, CI, publication, or release evidence remains.

Stop when the requested phase is proven or the next action requires new owner
authority, external waiting, or a material policy decision.
