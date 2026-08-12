# Agent Instructions

All repository documentation must be written in English. User-facing GUI copy must be planned and reviewed in English unless a localization task explicitly adds another locale.

For development-loop decisions, use the repo-local skill at `.codex/skills/chessticize-mobile-dev-loop/SKILL.md`. It defines the preferred order for core/backend tests, CLI E2E checks, mobile component tests, and iOS simulator/Detox screenshot verification.

For repeatable Storybook-to-Release simulator calibration across the maintained
fifteen-scene, twenty-six-image UI baseline, use
`.codex/skills/chessticize-mobile-ui-calibration/SKILL.md`.

For Android release orchestration, use the repo-local skill at `.codex/skills/chessticize-android-release/SKILL.md`. It governs clean-machine preflight, exact-artifact Play and GitHub publication, protected recovery, risk-scoped local emulator validation, and final issue closure.

For audits of all product changes since a released mobile source commit, use
the repo-local skill at
`.codex/skills/chessticize-release-delta-qa/SKILL.md`. It governs exact source
identity, exact-head Release simulator captures, per-scene visual inspection,
supporting interaction evidence, validation-drift repair, and GitHub issue
grouping.

## Agent wayfinding

### Storybook-first UI flow gate

Before production implementation of any new UI flow, create the interactive
design slice in the Interaction Lab and obtain explicit design approval. The
Storybook phase may add production-intended presentation components and
deterministic fixtures, but it must not add the production navigation entry,
storage or backend mutations, native-module wiring, analytics, or rollout
logic. After approval, keep the approved Storybook scenario as living UI
documentation while completing the product wiring. Follow
`docs/agents/ui-flow-design.md` and the repo-local development-loop skill.

When the product screen or flow already exists in the Interaction Lab, update
that product clone incrementally and preserve its stable story URL. Do not
create a standalone prototype page that repeats existing product context. The
full Storybook should show the expected post-implementation product, while the
issue-owned `new` marker identifies the changed scenario.
At the start of every new issue-scoped Storybook design, reset
`newScenarioMarkers.json` before adding the current issue so no `new` tag from
an earlier design track remains in the catalog.

Treat Sprint onboarding as part of the Sprint UI contract: whenever a Sprint
screen, rule, term, status, timing behavior, or control changes, update the
corresponding first-use guidance and Interaction Lab guide scenarios in the same
change, including shared Active Session guidance and Arrow Duel guidance when
applicable.

Each feedback issue owns its Storybook design track. The dedicated Interaction
Lab Vercel project publishes one isolated full-catalog deployment and stable
branch URL per feature branch; never substitute a URL owned by another branch.
Later commits on the same branch advance that branch URL, while `main` owns the
long-lived Production catalog. GitHub Actions is the single deployment writer;
the committed Vercel configuration disables duplicate provider-side Git builds.
Every new Storybook request goes through a pushed issue branch and PR, then
waits for that workflow's Vercel deployment. Do not launch
`pnpm mobile:storybook` or hand off a localhost URL for design review; local
headless validation and static builds remain required before push.
Every Storybook review deployment, including the main catalog and every branch
preview, is public and must not require authentication. Verify that an
unauthenticated request to `/storybook/` returns HTTP 200 after every deployment
or access-policy change. Follow `docs/STORYBOOK_DEPLOYMENT.md`.
If publication is unavailable after a concrete deployment attempt, an explicit
repository-owner authorization may waive this gate for that PR. Record the
failed publication result, the site's resulting access state, the owner's
authorization, and the follow-up needed in the PR before marking it ready or
merging it. Keep any usable owner-only deployment in place; never substitute or
overwrite another branch's review deployment.
A coherent design increment may merge to `main` before implementation. Its
scenario remains living UI documentation, while its `new` marker remains only
until the next issue-scoped Storybook design resets the manifest.
Generated Storybook bundles and Vercel link files are not committed to the
application branch.

A new screen, navigation destination, stateful modal or sheet, multi-step
journey, or materially new loading, empty, error, or permission path counts as
a new UI flow. Small fixes to an already approved flow do not automatically
restart this gate unless they materially change the journey.

### Issue tracker

Issues and PRDs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Issue triage

For new-issue evaluation, effort and priority ratings, tracker routing,
related-issue analysis, and issue-scoped Storybook preview handoff, use
`.codex/skills/chessticize-issue-triage/SKILL.md` and follow
`docs/agents/issue-triage.md`. Triage must stop before product implementation;
Storybook design artifacts remain behind the explicit approval gate.
Route every UI/UX or functional ticket with a presentation change through
`docs/agents/ui-flow-design.md`, starting from the existing product-clone story
and the full-catalog Storybook workflow. Relationship suggestions are advisory:
do not consolidate tickets, close one as a duplicate, or share a design or
implementation track without explicit human approval for that action.

### Tracker labels

The required triage and Wayfinder label vocabulary, plus the live tracker
preflight, is documented in `docs/agents/triage-labels.md`. Verify the live
labels before a label-dependent workflow; a missing label is a tracker setup
blocker, not permission to substitute a different label.

### Domain docs

Domain docs are created lazily in a multi-context layout. See
`docs/agents/domain.md` for discovery and placement rules; an absent glossary or
ADR is not itself a defect.

## Branch And PR Workflow

- Prefer one feature-scoped PR per coherent goal (for example, one screen or one flow brought to design parity), not a separate PR per small polish tweak. Batch related polish into the active feature PR.
- Prepare every coordinated mobile release on a dedicated integration branch
  created from current `main`, named `codex/mobile-<version>-release`. Open its
  release PR to `main` as a draft immediately so the branch, intended release
  identity, accumulated checks, and remaining gates stay visible.
- Before cutting that branch, make
  `apps/mobile/development-version.json` on `main` name the intended public
  version. Allocate the candidate on the release branch with
  `pnpm mobile:version:prepare-release`, then immediately advance only `main`
  with `pnpm mobile:version:advance-development` or an explicit next
  minor/major target. The release branch must not change the development
  version. Follow `docs/RELEASE_VERSIONING.md`.
- After the release branch is cut, `main` remains open for the next version's
  feature development. Do not merge or rebase advancing `main` back into the
  release branch by default. Bring over only a change explicitly selected for
  the current release, through a reviewed PR targeting the release branch, so
  later-version work cannot leak into the candidate.
- Release-branch history is append-only. Never rebase the release branch,
  amend or replace a commit already pushed to it, force-push it, or squash the
  release branch when integrating it to `main`. Correct mistakes with new
  commits. Do not create, require, or depend on GitHub branch protection,
  rulesets, or administrator-only controls for this workflow. Treat the
  append-only history, no-force-push, no-deletion, and linear-history rules as
  operator policy enforced through reviewed PRs and exact-ref checks. Missing
  GitHub enforcement is not a release blocker.
- During release preparation, each contributor or agent works on its own
  branch and opens a PR whose base is the dedicated release branch. Do not push
  another contributor's work directly to the release branch and do not route
  release-preparation PRs through `main`. Merge each complete, reviewed, green
  contributor PR into the release branch with squash merge
  (`gh pr merge --squash --delete-branch`) so each work package contributes one
  intentional integration commit.
- Run final cross-change QA, release builds, and release validation from a
  clean exact head of the integrated release branch. Contributor-branch
  evidence is supporting evidence only; rerun or document valid evidence reuse
  after integration according to the App-input and test-runner identity rules.
  Android emulator builds and Detox run locally on the Android build machine;
  GitHub Actions must not provide Android emulator or Detox release evidence.
- Freeze an RC only after known release work has converged. Record the RC
  generation, frozen exact head, scope, App-input digest, and blockers in a
  draft release-PR comment without committing a freeze marker. A frozen RC
  rejects planned development, features, opportunistic refactors, and
  non-blocking polish.
- A validation-discovered host-side test-runner defect does not move the frozen
  App head. Correct it on a separate evidence branch based on the frozen App
  source, prove unchanged App inputs and artifact bytes, and rerun only the
  affected scope. Record both SHAs and integrate that test correction into
  `main` later through an ordinary squash PR; do not merge it into the frozen
  release branch.
- A validation-discovered product, App-input, or required release-identity
  defect invalidates the current RC generation before the release branch
  moves. Enter remediation, merge only reviewed focused blocker fixes, batch
  all known fixes in a convergence sweep, then freeze the new exact head as the
  next RC generation. Exact-head fast checks always rerun; rebuild and rerun
  only the artifacts and validation scopes invalidated by the changed
  boundary. Never relabel evidence from the invalidated generation.
- Queue record-only changes until after release unless they are required for
  the release. A required record correction uses remediation and a new RC
  generation, although unchanged native App evidence may still be reused after
  the fail-closed comparison. See `docs/RELEASE_SOURCE_POLICY.md`.
- The exact validated release-branch head is the binary source and immutable
  platform-tag target. The later merge commit on `main` is a forward-integration
  record whose release-side parent preserves that exact commit and its SHA; it
  must not replace, move, or be substituted for that release tag.
- Keep the release PR draft until its complete release identity, approved
  build-specific notes, required fast checks, selected native evidence,
  release review, exact platform tags, and uploaded binaries are recorded.
  Mark it ready only after every platform included in the coordinated release
  has been formally submitted for store review. Once those submissions report
  an in-review state, merge the release PR; do not wait for store approval,
  public availability, or the post-Play APK mirror. Track those post-merge
  outcomes against the immutable platform tags and release evidence. The final
  release PR is the only merge-commit exception: merge it to `main` with
  `gh pr merge --merge --delete-branch`, preserving the release branch's
  already-squashed work-package commits under one explicit release merge
  commit. GitHub repository settings must keep merge commits enabled for this
  step. Never merge a partially integrated release branch to `main`.
- Use a draft PR only while its stated goal is still incomplete, and push to it frequently. Draft pushes run only path-scoped fast checks. The agent is authorized to `git push` to open PR branches in this repository without asking for per-push confirmation.
- If the PR's stated goal is already complete when it is opened or first pushed, open it as ready for review rather than as a draft. If an existing draft becomes complete, mark it ready for review (`gh pr ready`) proactively, without waiting to be asked. Ready PRs run the Mobile JS checks; iOS native builds and Detox run locally under the risk-scoped validation policy.
- For a Storybook-only PR, the coherent issue-scoped design increment is the stated goal. It may merge while the linked product issue remains open; the absent product wiring is deliberately out of scope until explicit design approval.
- The agent is authorized to merge a ready-for-review PR (`gh pr merge --squash --delete-branch`, matching this repo's required convention for every PR except the final release PR to `main`, which requires a merge commit) once it is complete, every required fast check is green, and the risk-scoped validation described below is recorded. Merge to main when the feature PR is complete, not after every increment. Do not create a new branch for each small follow-up while a feature PR is still open — push to the open PR instead.
- GitHub branch protection and rulesets are not release gates in this
  repository, so GitHub will not itself enforce this policy. Before merging,
  inspect the actual required check status (for example `gh pr checks`) and
  confirm any required local native evidence or documented evidence-reuse
  comparison. Do not treat an unverified assumption as local evidence.
- Do not mark a PR ready or merge it while part of its stated goal is unfinished, a required check is red, its selected native-validation scope is incomplete, or the PR description calls out a known unresolved product issue.
- GitHub Actions does not run Android emulators, Android Detox, Xcode builds, or iOS Detox. Local native validation is required only for release candidates and changes to native implementation, native integration/configuration, native dependencies, or native validation infrastructure. Record the tested commit SHA, build result, required suite results, toolchain version, emulator/simulator, clean-worktree confirmation, and any later evidence-reuse comparison. GitHub Actions remains responsible for fast non-native checks, the protected Android signed-AAB/source job, source recovery, and the post-Play APK mirror.
- Before a release, require exact-head fast checks plus the release scope selected below. An ordinary delta may ship after fast checks and the platform's signed-artifact checks without a physical-device smoke or full Detox rerun. Run the affected local simulator/emulator suite for targeted native risk and both suites locally only for broad native risk. Whenever an iOS release scope includes simulator E2E, run the selected scope against both Debug-Dev and Release-Production with `CHESSTICIZE_E2E_VARIANTS=both`. Treat production runtime/domain sources, native/platform projects and native test-APK sources, dependency manifests or patches, build/release configuration, bundled fixtures/resources, and the fail-closed App-input classifier itself as App build inputs. A change to any App build input requires a new validation build and the selected native scope. Host-side E2E specs, selectors, assertions, screenshot/evidence collectors, and non-bundled fixtures are test-runner inputs: when the fail-closed App-input comparison passes, reuse the checksummed validation App artifact and rerun only the affected test scope locally. Documentation, review metadata, agent guidance, and merge ancestry are record-only inputs. Unknown paths are App build inputs. Record the App source SHA, test-runner SHA, App-input digest, and artifact checksum whenever evidence spans commits. This evidence reuse never relabels or publishes an ancestor's signed candidate: the distributed candidate, platform tag, and source manifest remain bound to the exact final release-branch head. Any unresolved automated failure that touches the changed boundary remains a release blocker.
- Delete or reuse stale `codex/*` branches after their PR merges.

### Review Cadence

- The first review of a coherent PR establishes an accepted review baseline for
  that PR's complete change set. After that baseline exists, prefer incremental
  review of the diff from the last reviewed commit to the current head, its
  directly affected contracts, and any unresolved findings. Do not restart a
  full review solely because a small follow-up commit, comment edit, or CI retry
  changed the head SHA.
- A successful review must leave a durable checkpoint in the PR body or a new
  PR comment with `Review-Mode`, `Review-Baseline`, `Reviewed-Through`, and
  `Review-Result: pass`, using full 40-character commit SHAs. The next reviewer
  uses the latest passing `Reviewed-Through` commit only after verifying that it
  is an ancestor of the current head, then reviews
  `Reviewed-Through..current-head`. For the first full PR review,
  `Review-Baseline` is the PR merge base; for an incremental review, it is the
  prior passing `Reviewed-Through`. A missing, ambiguous, or non-passing
  checkpoint is not reusable. A non-ancestor checkpoint may be re-anchored only
  after `git range-diff` or equivalent evidence proves the reviewed change set
  is patch-equivalent; otherwise use full review. A release review may reuse the
  exact commit's accepted PR checkpoint and add only the release-identity and
  evidence audit.
- Full review means reviewing the coherent PR or release change set again, not
  reviewing the entire repository. Trigger it only when there is no trustworthy
  accepted baseline; the stated goal, specification, or architecture boundary
  materially changes; the change selects **Full native validation**; signing,
  source/artifact identity, privacy/security, schema/migration, global launch or
  test infrastructure changes; a serious finding invalidates earlier review
  assumptions; or accumulated follow-ups can no longer be bounded to the
  previously reviewed behavior.
- Diff size alone does not choose the mode. Documentation, copy, styling,
  test-only corrections, and focused fixes remain incremental unless their
  semantic impact meets a full-review trigger. A small native, persistence,
  signing, privacy, or release-identity change may still require full review.
- Review reuse does not reuse stale validation evidence. Required fast checks
  must pass on the current head. Native App evidence remains reusable only
  while the fail-closed App-input digest is unchanged. A test-runner change
  invalidates and reruns only the affected test evidence; documentation,
  review metadata, and merge-parent changes alone invalidate neither.

### PR Validation Scope

Choose the smallest validation layer that proves the changed boundary. Record the selected scope and rationale in the PR body. Native validation is required only for a release candidate or a change to native implementation, native integration/configuration, native dependencies, or native validation infrastructure. Navigation, persistence journeys, board presentation, animations, and adaptive layout implemented entirely in JavaScript/TypeScript do not require native validation; prove them with the appropriate core, component, Interaction Lab, and fast CI layers, with optional simulator inspection when useful.

- **No mobile Detox**: every non-release PR without a native-impacting change, including ordinary React Native navigation, state, styling, accessibility, service wiring, board presentation, and adaptive layout. Pure core, storage, CLI, documentation, and tooling changes also use their own lower layers.
- **Targeted native validation**: run the affected Detox spec or one affected suite (`flows` or `practice`) for a bounded native bridge/adapter change, native dependency or platform-project change, native persistence/relaunch integration, or a release candidate with one affected native journey.
- **Full native validation**: build once and run both `flows` and `practice` only for broad native risk such as app startup, shared native navigation/storage wiring, global native launch fixtures, platform build configuration, Detox infrastructure, or a release candidate whose native risk cannot be bounded to one suite.
- When iPad landscape native geometry is in the selected scope, also run `pnpm mobile:verify:ios:landscape-layout` locally. It uses an ignored validation-only Info.plist copy that requires full-screen landscape, verifies real Release-app element frames, and leaves production iPad rotation and multitasking unchanged. Marketing screenshots are separate optional visual evidence, not the functional gate.
- Required Detox evidence records the App source SHA, test-runner SHA, App-input digest, artifact checksum, build result, commands, selected scope, results, and clean-worktree confirmation. The two SHAs may differ when `node apps/mobile/scripts/mobile-app-inputs.js compare` proves the App build inputs are unchanged. A host-side spec, selector, assertion, evidence collector, or non-bundled fixture change reruns only its affected test scope against that verified validation App artifact. Runtime, native/platform, native test-APK, dependency, build/release, or bundled fixture/resource changes require a new validation build. Documentation, review metadata, or merge-only changes require neither. Signed production candidates still use the exact final release-branch head.
- SQLite schema changes still require the released-fixture migration matrix in the PR and an automated simulator/emulator upgrade smoke before release. Real CloudKit, notification delivery, physical-device upgrade, and similar hardware checks are optional diagnostics and do not block App Store or Play submission, or the GitHub APK mirror.
- Any pre-release install on a personal iPhone must use `pnpm mobile:ios:dev:device`. Debug is `Chessticize Dev` with `com.chessticize.mobile.dev` and `iCloud.com.chessticize.mobile.dev` in the CloudKit Development environment; never sideload the production Release identity for routine device testing.

The same three scopes apply to releases. A delta release changes only bounded JavaScript, copy, styling, tests, documentation, or release metadata and uses fast CI plus the platform's signed-artifact checks. Targeted and full release validation are required only when the changed boundary matches the risks above, and run on local simulators/emulators or through deterministic non-native tests. GitHub-hosted Android emulator workflows are not release gates and must not be reintroduced. Store-account setup, listing review, screenshot generation, compatibility matrices, physical-device checks, and unchanged manual checklists are not automatic work for every build number.

## Testing Philosophy

The authoritative test-layer responsibilities, E2E regression scope, and
SQLite migration compatibility requirements are documented in
`docs/TESTING_ARCHITECTURE.md`. Read it before changing test infrastructure,
storage, sync, database schemas, or release validation.

- Business logic must be thoroughly tested before code is described as complete.
- Business logic must live outside React components and React Native screens.
- Prefer real implementations for internal dependencies whenever practical.
- Avoid mocks and ad hoc stubs for internal code.
- Use mocks only at boundaries the project does not control, such as CloudKit, App Store services, network failures, third-party APIs, or explicit latency/failure simulation.
- When tests need isolation or deterministic setup, create maintained fakes behind the same public interface. A fake must be a drop-in implementation and should share behavior tests with the real implementation when possible.
- Before changing test infrastructure, storage behavior, sync behavior, or repository fakes, look for and follow local testing guidelines and shared behavior tests.
- End-to-end tests must start the real app on a simulator/emulator/device and interact through public UI. Do not call stores, repositories, handlers, or test-only helpers directly from E2E tests.

## Architecture Boundary

- The app must be split into a frontend UI shell and a local backend/domain core.
- Frontend code owns rendering, navigation, accessibility, animations, and user input wiring.
- Backend/domain code owns ELO, sprint rules, puzzle selection, Arrow Duel validation, spaced repetition, history filtering, sync merge, pack validation, and analysis orchestration.
- React components may dispatch intents and render state, but must not make domain decisions directly.
- The backend/domain core must not import React, React Native, navigation libraries, gesture libraries, or visual components.
- The backend/domain core must expose typed public interfaces that can run in Node-based tests without a simulator.
- Native services such as SQLite, Stockfish, and CloudKit must sit behind interfaces. Use real adapters in integration tests where practical and maintained fakes for deterministic failure or conflict scenarios.
- Any new feature that adds business behavior must add backend/domain tests first or in the same commit as the behavior.

## Scratch Workspace

- `scratch/` is intentionally ignored by git.
- Use `scratch/` for private screenshots, raw design references, generated exploratory mockups, local repo paths, and implementation notes that should not be published.
- Do not link public docs to files under `scratch/`.
- Do not commit raw screenshots that contain usernames, exact ratings, private stats, dates, or account details. Use sanitized schematics or generated mockups instead.

## Required Test Layers

- Narrow unit tests may exercise implementation details and should cover pure business rules such as ELO, sprint end conditions, spaced repetition scheduling, Arrow Duel candidate selection, and puzzle pack filtering.
- Component behavior tests must verify public behavior through rendered UI, accessibility labels, and user-visible text. Avoid implementation-state assertions.
- Storage integration tests must use real SQLite databases or deterministic fixture databases.
- Native engine tests must exercise the real Stockfish bridge for UCI handshake, fixed-position analysis, cancellation, and background handling.
- Sync tests must use a maintained fake sync transport for deterministic local behavior and a real CloudKit staging/manual suite before release.
- GUI automation must cover core user journeys on an iOS simulator before release. Required Android GUI automation runs on a local emulator before Android release.

## Definition of Done

Before declaring code work complete:

- Identify the public behavior, edge cases, and failure cases introduced or changed.
- When feedback reports a bug or regression, first add a test that reproduces the failure and confirm that it fails before implementing the fix.
- Add or update unit tests for detailed business logic paths.
- Add or update component behavior tests when UI behavior changes.
- Add or update integration tests when SQLite, puzzle packs, sync, engine bridges, or migrations change.
- Add or update E2E tests when the change affects navigation, practice flows, reset flows, sync settings, history filters, or cross-component workflows.
- Include regression tests for bugs found during review.
- If a test layer is intentionally not updated, record the reason in the final response or PR notes.
- Run the focused tests that prove the change, or state clearly why they could not be run.

## Emulator Refresh Expectation

- Before booting or creating a simulator, inspect the existing simulator devices
  and reuse a compatible device whenever it satisfies the required runtime,
  device profile, and test-isolation boundary. Start a different simulator only
  when no existing device is suitable.
- Refresh the iOS simulator after changes that affect real rendering, board interaction, navigation geometry, animation, Safe Area/adaptive layout, native modules, or an explicitly requested manual acceptance flow.
- Ordinary copy, state, styling, accessibility, and service-wiring changes do not require a simulator refresh when component behavior tests prove the public behavior.
- When a refresh is required, the normal order is focused component tests, mobile typecheck, then simulator refresh.
- Use `pnpm mobile:ios` to rebuild and relaunch the app when native or bundled code may have changed.
- Do not run Detox E2E on the simulator used for manual testing. Detox launches the app with `delete: true` and wipes the app sandbox, including local SQLite history, sprint sessions, and review queue data. Use a dedicated simulator such as `iPhone 17-Detox` for local Detox runs.
- After simulator or emulator work completes, fails, or is interrupted, shut down every test device started by that task to release host memory. Address each task-owned iOS simulator by exact UDID and each Android emulator by exact serial; never use a blanket `shutdown all` or kill an unrelated manual-testing device. Verify the post-cleanup booted/attached-device lists before handing off.
- Leave a task-owned simulator or emulator running only when the owner explicitly asks for it to remain available, and record that exception in the handoff.
- If Metro is not running or the simulator reports that it cannot connect to the development server, start Metro with `pnpm mobile:start` and then rerun the simulator refresh.
- If simulator refresh is skipped because Xcode, Metro, or the simulator is unavailable, say that explicitly in the final response and include the exact command the next agent or developer should run.

## Mobile GUI Automation Direction

- Use Detox as the primary React Native E2E framework because it is tailored for React Native and supports simulator/emulator automation.
- Use React Native Testing Library for component behavior tests.
- Use Maestro only for lightweight smoke flows, release sanity scripts, or screenshot-style flows where its YAML syntax is useful.
- Do not adopt Appium by default. Keep it as a fallback only if Detox cannot support a required device-lab or black-box automation need.
- Keep E2E fixtures small, deterministic, and shipped through the same public app storage path used by real users.
