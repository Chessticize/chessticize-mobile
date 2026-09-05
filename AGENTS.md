# Agent Instructions

Repository documentation and user-facing GUI copy are written and reviewed in
English unless a localization task explicitly adds another locale.

## Find The Relevant Contract

This file is the entry point. Read the linked contract for the current task;
do not load every skill or release runbook for ordinary development. Policies
live in the owning document below; other documents should link to them rather
than maintain copies. Current user instructions take precedence.

| Task | Contract |
| --- | --- |
| Development and validation selection | [Dev loop](.codex/skills/chessticize-mobile-dev-loop/SKILL.md) |
| Test layers, migrations, native scope and evidence reuse | [Testing architecture](docs/TESTING_ARCHITECTURE.md) |
| PR completion, authorization and incremental review | [PR workflow](docs/agents/pr-workflow.md) |
| New UI flows and design approval | [UI flow design](docs/agents/ui-flow-design.md) |
| Storybook publication and access | [Storybook deployment](docs/STORYBOOK_DEPLOYMENT.md) |
| Issues and PRDs | [Issue tracker](docs/agents/issue-tracker.md) |
| Feedback triage | [Triage skill](.codex/skills/chessticize-issue-triage/SKILL.md), [rubric](docs/agents/issue-triage.md), [labels](docs/agents/triage-labels.md) |
| Domain terminology and ADR discovery | [Domain docs](docs/agents/domain.md) |
| Coordinated release, RC freeze and source identity | [Release source policy](docs/RELEASE_SOURCE_POLICY.md), [versioning](docs/RELEASE_VERSIONING.md) |
| Android release status, build, submission or recovery | [Android release skill](.codex/skills/chessticize-android-release/SKILL.md) |
| Local iOS environment or selected Detox run | [Local E2E skill](.codex/skills/chessticize-mobile-local-e2e/SKILL.md) |
| Requested native visual calibration | [UI calibration skill](.codex/skills/chessticize-mobile-ui-calibration/SKILL.md) |
| Release change summary or requested visual QA | [Release delta skill](.codex/skills/chessticize-release-delta-qa/SKILL.md) |

## Architecture And Tests

- Frontend code owns rendering, navigation, accessibility, animation and input
  wiring. Business decisions belong in the local backend/domain core.
- The domain core exposes typed public interfaces runnable in Node tests and
  must not import React, React Native, navigation, gestures or UI components.
- SQLite, Stockfish and CloudKit sit behind interfaces. Prefer real internal
  implementations and maintained fakes; reserve mocks for external or native
  boundaries that the test host cannot execute.
- New business behavior includes core tests. For a reported bug, reproduce the
  failure at the lowest reliable layer before fixing it. Narrow unit tests may
  exercise details; component tests observe public UI behavior; E2E uses the
  real CLI process or app through public interfaces.
- Read the testing architecture before changing storage, sync, schemas, test
  infrastructure or release validation. Run focused checks for the changed
  boundary and record results and intentionally omitted layers in the PR.
- Ordinary non-native JS/TS changes use core, integration, component and/or Lab
  evidence. Simulator inspection is optional unless requested. Releases select
  delta, targeted or full validation by risk; do not infer mandatory Detox,
  CloudKit staging or physical-device work merely from a release build number.

## UI Design And Delivery

- New UI flows require explicit design approval before production wiring.
  Small fixes inside an approved flow do not automatically restart that gate.
  Follow the UI flow contract for classification and phase boundaries.
- Update the existing product-clone story and preserve its stable scenario URL.
  Keep Sprint first-use guidance synchronized with changed screens, terms,
  rules, timing and controls, including Active Session and Arrow Duel guidance.
- Each issue retains its own design and approval track. Do not consolidate
  issues or share implementation tracks without explicit human approval.
- Storybook review uses the exact branch's public Vercel preview published by
  GitHub Actions. Follow the deployment contract for exact-commit identity,
  marker lifecycle and anonymous access checks; do not substitute localhost or
  another branch's deployment.
- Pushes to open PR branches and merging complete, reviewed, green PRs are
  authorized under the PR workflow. Respect any narrower current user scope.
  Keep related changes in the same feature PR. Coordinated releases follow the
  release source policy, including its special final merge-commit rule.

## Simulators And Personal Devices

- Simulators are shared machine resources: check before booting and keep at
  most two booted. Reuse a compatible device only when isolation permits it.
- Use a dedicated Detox device. `delete: true` wipes its app data; never run
  Detox on a simulator holding manual-test data.
- When native validation or a requested simulator acceptance pass is selected,
  run focused lower-layer checks first, then follow the local E2E skill. Do not
  start Metro for Release/Detox builds; it is needed for the manual Debug loop.
- Shut down task-started devices by exact UDID/serial after use, failure or
  interruption; never use blanket shutdown. Verify cleanup and delete temporary
  devices created by the task. Leave one running only on explicit user request.
- Personal iPhone testing uses `pnpm mobile:ios:dev:device` and the isolated Dev
  app/CloudKit identity. Never sideload production Release for routine testing.

## Private Artifacts

Use ignored `scratch/` or `apps/mobile/artifacts/` for screenshots, raw references,
local paths and evidence. Do not link public docs to scratch files or commit
private user data, generated bundles or unsanitized screenshots.
