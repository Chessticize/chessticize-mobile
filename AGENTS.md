# Agent Instructions

All repository documentation must be written in English. User-facing GUI copy must be planned and reviewed in English unless a localization task explicitly adds another locale.

For development-loop decisions, use the repo-local skill at `.codex/skills/chessticize-mobile-dev-loop/SKILL.md`. It defines the preferred order for core/backend tests, CLI E2E checks, mobile component tests, and iOS simulator/Detox screenshot verification.

For repeatable Storybook-to-Release simulator calibration across the maintained
eight-scene UI baseline, use
`.codex/skills/chessticize-mobile-ui-calibration/SKILL.md`.

For Android release orchestration, use the repo-local skill at `.codex/skills/chessticize-android-release/SKILL.md`. It governs clean-machine preflight, exact-artifact Play and GitHub publication, protected recovery, physical ARM64 validation, and final issue closure.

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

A new screen, navigation destination, stateful modal or sheet, multi-step
journey, or materially new loading, empty, error, or permission path counts as
a new UI flow. Small fixes to an already approved flow do not automatically
restart this gate unless they materially change the journey.

### Issue tracker

Issues and PRDs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

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
- Use a draft PR only while its stated goal is still incomplete, and push to it frequently. Draft pushes run only path-scoped fast checks. The agent is authorized to `git push` to open PR branches in this repository without asking for per-push confirmation.
- If the PR's stated goal is already complete when it is opened or first pushed, open it as ready for review rather than as a draft. If an existing draft becomes complete, mark it ready for review (`gh pr ready`) proactively, without waiting to be asked. Ready PRs run the Mobile JS checks; CI Detox is reserved for nightly `main` integration and risk-scoped native validation.
- The agent is authorized to merge a ready-for-review PR (`gh pr merge --squash --delete-branch`, matching this repo's existing squash-merge convention) once it is complete, every required fast check is green, and the risk-scoped validation described below is recorded. Do not wait for a nightly GitHub Detox run before merging a routine PR. Merge to main when the feature PR is complete, not after every increment. Do not create a new branch for each small follow-up while a feature PR is still open — push to the open PR instead.
- `main` has no branch protection, so GitHub will not itself enforce this policy. Before merging, inspect the actual required check status (for example `gh pr checks`) and confirm any required exact-head local evidence. Do not treat an unverified assumption as local evidence.
- Do not mark a PR ready or merge it while part of its stated goal is unfinished, a required check is red, its selected native-validation scope is incomplete, or the PR description calls out a known unresolved product issue.
- Nightly Mobile iOS/Detox runs the complete `flows` and `practice` suites against the latest `main` as an integration signal. Triage a failure promptly, but do not treat a later nightly failure as retroactively invalidating already merged PR evidence.
- Before a release, require exact-head fast checks plus the release scope selected below. An ordinary delta may ship after the owner passes the physical-device smoke without rerunning full Detox. Run the affected suite for targeted native risk and both suites only for broad native risk. An unresolved exact-head or nightly failure that touches the changed boundary is a release blocker; an unrelated or superseded nightly failure is not.
- Delete or reuse stale `codex/*` branches after their PR merges.

### PR Validation Scope

Choose the smallest validation layer that proves the changed boundary. Record the selected scope and rationale in the PR body. File paths can automate which fast CI jobs run, but the PR author must make the native-risk decision because a single React Native file can contain either harmless copy or release-critical native wiring.

- **No mobile Detox**: documentation and tooling; pure core, storage, or CLI behavior covered by their own suites; ordinary React Native copy, state, styling, accessibility, and service wiring covered by component tests and mobile typecheck.
- **Targeted native validation**: run the affected Detox spec or one affected suite (`flows` or `practice`) when the change crosses navigation, a multi-screen journey, relaunch persistence, real board interaction/rendering, adaptive layout, or a native-module boundary. A focused simulator screenshot may replace Detox for a one-off visual-only acceptance check when no repeatable journey changed.
- **Full native validation**: build once and run both `flows` and `practice` only when the change has broad native blast radius, such as app startup, shared navigation or storage wiring, global launch fixtures, native build configuration, Detox infrastructure, or a risk that cannot be bounded to one suite.
- Any required Detox evidence must come from the exact PR head and record the commit SHA, build result, commands, selected scope, results, and clean-worktree confirmation. A later code change invalidates that evidence.
- SQLite schema changes still require the released-fixture migration matrix in the PR and the native upgrade smoke before release. Real CloudKit, notification delivery, TestFlight upgrade, physical-device, and App Store screenshot checks remain release gates unless the changed boundary specifically requires earlier targeted validation.

The same three scopes apply to releases. A delta release changes only bounded JavaScript, copy, styling, tests, documentation, or release metadata and uses fast CI plus owner device smoke. Targeted and full release validation are required only when the changed boundary matches the risks above. Store-account setup, listing review, screenshot generation, compatibility matrices, and unchanged manual checklists are one-time or change-triggered gates, not automatic work for every build number.

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
- GUI automation must cover core user journeys on an iOS simulator before release. Android GUI automation is required before Android release.

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
- If Metro is not running or the simulator reports that it cannot connect to the development server, start Metro with `pnpm mobile:start` and then rerun the simulator refresh.
- If simulator refresh is skipped because Xcode, Metro, or the simulator is unavailable, say that explicitly in the final response and include the exact command the next agent or developer should run.

## Mobile GUI Automation Direction

- Use Detox as the primary React Native E2E framework because it is tailored for React Native and supports simulator/emulator automation.
- Use React Native Testing Library for component behavior tests.
- Use Maestro only for lightweight smoke flows, release sanity scripts, or screenshot-style flows where its YAML syntax is useful.
- Do not adopt Appium by default. Keep it as a fallback only if Detox cannot support a required device-lab or black-box automation need.
- Keep E2E fixtures small, deterministic, and shipped through the same public app storage path used by real users.
