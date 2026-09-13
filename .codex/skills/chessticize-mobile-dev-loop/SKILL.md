---
name: chessticize-mobile-dev-loop
description: Select the cheapest reliable validation layer for Chessticize development and route new UI design, native testing, and release work to their owning contracts.
---

# Chessticize Mobile Dev Loop

Choose the changed boundary before running commands. This is a routing guide;
[Testing Architecture](../../../docs/TESTING_ARCHITECTURE.md) owns test policy,
required native scope and evidence reuse. Read the relevant section when making
those decisions, not every platform runbook.

## Incremental UI Delivery

For UI work, use [incremental design](../../../docs/agents/ui-flow-design.md).
Merge usable, tested increments into the `main` integration hub; user review and
polish continue in later PRs. Update stories and guidance when their behavior
changes. Wait for design approval only when the current user explicitly asks.

For a requested hosted Storybook handoff, use
[branch Vercel deployment](../../../docs/STORYBOOK_DEPLOYMENT.md). Headless Lab
validation is enough for ordinary iteration until a visual handoff is needed.

## Select The Development Loop

Run from the repository root. Use focused tests during iteration, then the
applicable fast checks for the completed change. These rows are alternatives
selected by changed boundaries, not a checklist to run in sequence.

| Changed boundary | Commands and evidence |
| --- | --- |
| Pure domain rules | Focused core tests, `pnpm test:unit`, `pnpm typecheck` |
| Storage/repository contracts | Real SQLite integration tests, `pnpm test:integration`; migration matrix when schema changes |
| CLI or process protocol | `pnpm test:e2e` against the real CLI process |
| React Native state, navigation, copy, accessibility or service wiring | Focused component tests, `pnpm mobile:test`, `pnpm mobile:typecheck` |
| Shared presentation or responsive UI | Relevant component/Interaction Lab coverage, `pnpm mobile:lab:validate` for Lab changes |
| Agent guidance or process tooling | `pnpm process:validate` and focused tooling tests when executable checks change |
| Native bridge, platform, dependency or native runner | Select targeted/full scope in Testing Architecture, then the platform runner below |

Business logic stays outside components and runs in Node. Component assertions
observe visible behavior and accessibility; native rendering mocks prove wiring,
not real chess-piece rendering or gestures. Add regression coverage at the
lowest layer that detects the reported bug.

## Conditional Workflows

- **PR completion/review:** [PR workflow](../../../docs/agents/pr-workflow.md).
  Reuse an accepted review checkpoint for bounded follow-ups; full review and
  native evidence reuse are separate decisions.
- **iOS native testing/environment:** [Local E2E](../chessticize-mobile-local-e2e/SKILL.md).
  Select the affected spec, `flows`, `practice` or `full` before building.
  Choose Debug, Release or both by the identity and configuration risk.
- **Android native testing:** [Android validation](../../../docs/ANDROID_VALIDATION.md).
  Emulator and Detox execution stays local.
- **Native visual acceptance:** [UI calibration](../chessticize-mobile-ui-calibration/SKILL.md).
  Use affected scenes for focused acceptance; request the full baseline only
  when its coverage is needed. Ordinary copy/layout work does not implicitly
  invoke this workflow.
- **Personal iPhone install:** [Dev build](../../../docs/IOS_DEVELOPMENT_BUILD.md),
  using `pnpm mobile:ios:dev:device` to preserve Dev/Production isolation.
- **Release:** [source/RC policy](../../../docs/RELEASE_SOURCE_POLICY.md) and
  [versioning](../../../docs/RELEASE_VERSIONING.md). Select delta, targeted or
  full risk first; a release does not automatically require native E2E.
- **Release summary or visual audit:** [Release delta QA](../chessticize-release-delta-qa/SKILL.md).
  Select its read-only summary mode for a change report.

## Completion

State the usable increment, focused results, reused evidence, and remaining
acceptance in the PR. Testing Architecture distinguishes artifact reuse from
risk-based test-evidence reuse. An App input change does not automatically
invalidate every prior test; a distribution build records its actual source.
Astra may merge and deliver Dev or Production TestFlight after sufficient
validation without waiting for final user review. Public Production release
retains the owner's final decision.

Do not rerun unaffected tests or visual scenes solely because a review comment
or documentation changed. Report any required evidence that remains blocked,
and clean up task-owned simulators and generated artifacts.
