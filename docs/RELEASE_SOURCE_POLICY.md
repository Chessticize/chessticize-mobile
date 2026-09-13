# Release Source Policy

Chessticize Mobile embeds Stockfish and is distributed as GPL-3.0-or-later.
Every binary submitted to App Store Connect or Google Play must have a matching
public source release.

## Delivery Stages

Follow AGENTS and `docs/agents/pr-workflow.md`: `main` is the integration hub.
Astra may merge usable, sufficiently tested increments and upload Dev or
Production TestFlight builds without another user confirmation. User device
feedback follows delivery and becomes new PRs from `main`.

TestFlight preparation does not require coordinated release branches, an RC
freeze, final store marketing approval, both platforms, or final user acceptance.
Use an isolated short preparation branch from current `main` when build identity
files need updating, and integrate that increment through the normal PR workflow.
Preserve each app's actual bundle/signing identity and unused store build number;
never repurpose a Debug signing setup as a TestFlight distribution configuration.

Formal public Production release requires the owner's final go/no-go. Prepare
its concrete candidate and risk summary before that decision; reuse a decision
already given for that candidate and scope. The release checklist below is for
that stage. Public-source and artifact provenance apply to distributed builds
at either stage, but do not imply a full QA or marketing-approval requirement.
Use `docs/TESTING_ARCHITECTURE.md` for risk-based evidence reuse even at final
release. A low-risk change or new SHA never demands full QA on its own.

## Required Rule

For each submitted binary:

1. Ensure the working tree is clean and the release commit contains the exact
   source, native code, bundled puzzle artifact, Stockfish source, and notices
   used for the binary.
2. Create a signed or annotated platform repository tag for the submitted
   version and build, for example `ios-v1.0.0-build-1` or
   `android-v1.1.0-build-1`.
3. Create and review the matching customer-facing file under `docs/releases/`
   as defined by `docs/RELEASE_NOTES.md`. Its filename must match the platform
   source tag, and it must be part of the exact tagged commit.
4. Publish a GitHub release for that tag before or at the same time as App
   Store submission.
5. Mention the tag and public repository URL in release notes and support
   documentation so recipients can obtain the corresponding source.
6. Do not submit a binary built from an untagged commit. A Play Internal or
   Closed candidate is still a distributed binary and follows this rule.

## Current Public Source Location

The public repository is:

https://github.com/Chessticize/chessticize-mobile

## GitHub Actions Release Boundary

The release workflow is local-first. GitHub Actions does not run Android
emulators, Android Detox, iOS simulators, or iOS Detox. Risk-scoped native
validation runs locally and its evidence is recorded against the exact App and
test-runner identities.

Keep GitHub Actions only where the boundary is remote or protected:

- fast non-native core, mobile, Interaction Lab, and process checks;
- public landing-page deployment;
- the protected production-signed Android AAB and corresponding-source
  publication;
- recovery of corresponding-source publication from a retained signed
  candidate; and
- post-Play identity verification and mirroring of the Play-signed APK.

Do not add a GitHub-hosted native validation or test-only rerun workflow. A
host-side test-runner correction reuses a checksummed locally retained App
artifact only after the fail-closed App-input and artifact-byte comparisons in
`docs/ANDROID_VALIDATION.md` pass.

## Release Integration Branch

Prepare each coordinated mobile release on
`codex/mobile-<version>-release`, created from current `main`, with one draft
release PR targeting `main`.

Before the cut, `apps/mobile/development-version.json` on `main` must name the
version being released. On the new release branch, run
`pnpm mobile:version:prepare-release` to allocate the candidate's Android and
iOS build identities in `apps/mobile/release-version.json`. Immediately after
the cut, advance only `main` with `pnpm mobile:version:advance-development` or
an explicit next minor/major target. Do not change the development-version file
on the release branch. Follow [`RELEASE_VERSIONING.md`](RELEASE_VERSIONING.md)
for the complete identity lifecycle and recovery commands.

After that cut, `main` remains open for the next version's feature work. Do not
merge or rebase advancing `main` back into the release branch by default.
Selectively backport only changes approved for the current release through
reviewed PRs targeting the release branch.

Release-branch history is append-only. Never rebase the release branch, amend
or replace an already-pushed release commit, force-push the branch, or squash
the release branch into `main`. Make every correction as a new commit. Do not
create, require, or depend on GitHub branch protection, rulesets, or
administrator-only controls for this workflow. Treat append-only history,
no-force-push, no-deletion, and linear history as operator policy enforced
through reviewed PRs and exact-ref checks. Missing GitHub enforcement is not a
release blocker.

Each contributor or agent works on a separate branch and opens a PR targeting
the release branch. A contributor PR must be complete, reviewed, and green
before it is squash-merged into the release branch. These integration PRs use
`gh pr merge --squash --delete-branch`, leaving one intentional release-branch
commit per completed work package.

After integration, assess cross-change risk and run only validation invalidated
by that integration. Reuse contributor evidence under Testing Architecture;
low-risk App changes do not invalidate all native evidence. Build a submitted
binary from its declared source; do not relabel another signed artifact.

The exact validated release-branch head is the source for the submitted
binaries and the immutable iOS and Android platform tags. The later merge
commit on `main` records forward integration with concurrently developed
next-version work. Its release-side parent preserves the exact release commit
and SHA; the merge commit is not the released source tag target and must never
move or replace that tag.

Merge the usable, reviewed release preparation increment when necessary checks
pass. Do not wait for TestFlight acceptance, another platform, store submission,
or an in-review state. Track subsequent upload, review, public release and APK
mirror outcomes independently against immutable platform tags. The coordinated
release PR uses a merge commit to preserve source history; ordinary preparation
and feature PRs use squash. A merged release record is not a public-release
approval.

Keep merge commits enabled in the GitHub repository and merge that PR with
`gh pr merge --merge --delete-branch`, preserving the release branch's
already-squashed work-package commits under one explicit release merge commit.
Every other PR uses squash merge. Create immutable platform tags and source
Releases only from the final approved release commit; never tag an intermediate
contributor branch or a partially integrated release branch.

## Release Candidate Freeze

Use an RC generation only for a formal Production candidate that needs
stabilization; ordinary main/TestFlight iteration needs no freeze. A generation
records the candidate and remaining risk, not a requirement to repeat all QA:

1. **Integration open:** approved work for the release may enter through
   contributor PRs. Do not spend final release-build or native-validation time
   while known product PRs are still pending.
2. **RC frozen:** after the convergence sweep and final integration, record
   `RC-Generation`, `RC-State: frozen`, the exact 40-character release-branch
   head, freeze time, intended validation scope, App-input digest, and known
   blockers in a comment on the draft release PR. The comment is the durable
   freeze record; do not commit a marker that would move the head it records.
   Only one generation is active.
3. **RC accepted:** required current-head fast checks, selected native evidence,
   release review, notes, and identity gates pass for that generation. Only the
   accepted candidate may be publicly released; TestFlight delivery follows the
   lighter delivery stage above.
4. **Remediation:** a required App or release-identity correction invalidates
   the active generation before the release branch moves. Record
   `RC-State: invalidated`, the blocking finding, and the invalidated evidence.
   Open the branch only to focused blocker-fix PRs, perform another convergence
   sweep, then freeze the new exact head as `RC-<n+1>`. Never edit, reuse, or
   relabel the old generation.

An RC freeze rejects planned development, features, opportunistic refactors,
and non-blocking polish. Defer those changes to the next version on `main`.
Validation findings use these exception paths:

- **Transient infrastructure failure on unchanged inputs:** preserve the
  failure and rerun the specific failed job once. Repeated or deterministic
  failure requires classification rather than more retries.
- **Host-side test-runner defect:** keep the release branch and frozen App
  source unchanged. Fix the spec, selector, wait, assertion, evidence collector,
  or non-bundled fixture on a separate evidence branch based on the frozen App
  source. After the fail-closed App-input comparison and artifact checksum pass,
  rerun only the affected scope against the retained App artifact. Record the
  App source SHA, test-runner SHA, digest, checksum, finding, and result on the
  release PR. Do not merge the evidence-only correction into the frozen release
  branch; integrate it into `main` later through an ordinary squash PR.
- **Product, App-input, or required release-identity defect:** invalidate the
  current generation and enter remediation. Add the lowest reliable regression
  test, merge the reviewed focused fix into the release branch with squash,
  batch all other known blockers, and freeze the resulting head as the next
  generation. Run affected checks, rebuild required App or signed
  artifacts, and rerun only the validation gates invalidated by the changed
  boundary. Full native validation is required only when the resulting risk is
  broad.
- **Record-only correction:** retain valid evidence and update the record.
  Documentation changes do not force remediation, a new generation, or native
  execution. Record the actual source of any newly built distribution artifact.

If a frozen generation already has an immutable platform tag, signed candidate,
or store-consumed build identity, follow the platform replacement rules. Never
move the tag or reuse the consumed build number or Android version code.
Retain invalidated generations and their artifacts as audit evidence.

## Failure Recovery

Preserve failing output, classify the failure and inspect the changed boundary.
Repair the lowest reliable layer and run the affected regression test. Retry
only invalidated checks; independent passing results remain valid. Inspect the
other platform only when shared inputs or identities changed. Do not rerun
both platform doctors, all fast suites, CocoaPods installation, screenshots or
full native QA for an unrelated failure. Rebuild only artifacts whose inputs
changed and which are needed for new execution or distribution.

Keep test-runner fixes separate from product failures in the evidence. An
artifact-reuse comparison authenticates the retained binary; Astra's risk
assessment determines which test results still apply. Record both decisions.
An unexplained deterministic failure cannot be hidden by a successful retry.

## Release Checklist

- Create the exact build-specific file from
  `docs/releases/RELEASE_NOTES_TEMPLATE.md`, verify all customer-facing claims,
  approve it, and commit it before tagging. Follow `docs/RELEASE_NOTES.md` for
  store limits, copy rules, publication evidence, and replacement builds.
- Run `pnpm app-store:preflight` and resolve any failed automatable checks.
- Run `pnpm app-store:signing-readiness` on the upload machine and resolve any
  missing Apple Developer Team ID, Xcode, or Apple distribution identity before
  archiving.
- Record the release validation scope from `docs/TESTING_ARCHITECTURE.md`.
  Ordinary deltas reuse valid checks and add affected checks plus signed-artifact
  checks; targeted changes run the affected simulator/emulator suite, and only
  broad native changes require both `flows` and `practice`. Physical-device
  testing is optional and does not block App Store or Play submission, or APK
  mirroring. Passing native evidence remains reusable across later changes when Astra
  records why the tested behavior is unaffected; see Testing Architecture.
- Run `pnpm app-store:third-party-audit` from the final lockfile and resolve
  any stale package, Stockfish, NNUE, or puzzle-data notice.
- When screenshots or store metadata changed, run
  `pnpm app-store:screenshot-audit` after final export and resolve any missing
  scene or invalid pixel size before uploading screenshots.
- Run `pnpm app-store:release-manifest` from the clean release commit and save
  the JSON output with the GitHub release or the TestFlight QA evidence.
- When the public-release evidence bundle is needed for first launch, changed
  store assets or broad uncovered risk, run
  `pnpm app-store:testflight-evidence -- --screenshot-root scratch/store-assets/final`
  from the clean candidate commit to collect the full evidence bundle.
- Follow `docs/APP_STORE_UPLOAD.md` to archive and upload with
  `apps/mobile/ios/ExportOptions.app-store-connect.plist`.
- `LICENSE` contains GPL-3.0-or-later.
- `THIRD_PARTY_NOTICES.md` is current.
- `apps/mobile/native/stockfish/Copying.txt` and
  `apps/mobile/native/stockfish/AUTHORS` are present.
- The shipped Stockfish version and bundled NNUE files are listed in
  `THIRD_PARTY_NOTICES.md`.
- The App Store binary was built from the tagged release commit.
- When the destination exposes a release-note field, the submitted App Store
  or Play copy exactly matches the approved `Store copy` section for the
  platform binary, including the direct details-and-source link to its exact
  GitHub Release.
- For Android, follow `docs/ANDROID_PLAY_RELEASE.md` and retain the exact signed
  AAB plus artifact-only verifier output. Require the full `play-ready` evidence
  contract for first Production launch or an explicitly full release; ordinary
  deltas use its risk-scoped path.
- The Android AAB contains `LICENSE`, `THIRD_PARTY_NOTICES.md`, Stockfish
  `COPYING.txt`, and Stockfish `AUTHORS`, plus native debug symbols.
- The Play candidate was built from the exact `android-v<version>-build-<code>`
  tagged commit and every Play track references the same AAB/version code.
- After Play processes the Android build and exposes its universal APK, finish
  the GitHub binary release by mirroring it through
  `docs/ANDROID_GITHUB_RELEASE.md`. The GitHub Release must then contain exactly
  the source manifest, Play-signed APK, and checksum, and the mirror receipt
  must be retained.
- The source-only GitHub Release is the required pre-Play state, not the final
  Android release state. A pending or failed mirror does not invalidate an
  already accepted Play release and never triggers a rebuild, but release
  status must remain `APK mirror pending` until the idempotent mirror succeeds.
- The GitHub APK uses the same source Release and Play app-signing certificate;
  CI never rebuilds a second APK for redistribution.

## Release Manifest

`pnpm app-store:release-manifest` emits a JSON source manifest for the exact
commit being submitted. It records the source commit, suggested release tag,
iOS bundle identity, package manager, bundled puzzle pack metadata, Stockfish
version/source identifiers, and SHA-256 hashes for release-critical files such
as the lockfile, notices, privacy policy, puzzle pack, Stockfish license files,
and bundled NNUE networks.

The command refuses a dirty working tree by default. The `-- --allow-dirty`
flag is only for local review and test automation; do not use a dirty manifest
for App Store Connect, TestFlight, or a public release tag.

## Third-Party Notice Audit

`pnpm app-store:third-party-audit` verifies the runtime package inventory in
`THIRD_PARTY_NOTICES.md` against `pnpm-lock.yaml`, checks that the active
runtime dependency patches are disclosed, and confirms that the Stockfish,
NNUE, and Lichess puzzle-data notices match the bundled release artifacts.

This audit is required before tagging a submitted App Store binary. It is still
used to prepare the owner's final Production decision. Reuse reviewed notices
when dependencies and disclosures are unchanged; beta uploads need no repeated
human notice review.
