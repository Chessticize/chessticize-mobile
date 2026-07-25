---
name: chessticize-release-delta-qa
description: Audit Chessticize Mobile changes since an exact published release with simulator visual verification as the primary acceptance layer. Identify changed screens and states, capture and inspect the exact-head Release app across relevant viewports and orientations, use automated tests as supporting evidence, file visual or functional product defects without fixing them, and repair proven test or workflow drift. Use for post-release regression sweeps, pre-release visual QA, requests to summarize fixes since a version, or requests to have a subagent validate changed mobile journeys.
---

# Chessticize Release Delta QA

Audit the final product delta rather than replaying commit history as if every
intermediate design were still current. The main acceptance evidence is the
exact-head Release app rendered in iOS simulators, not a list of green unit
tests. Keep product code read-only during the QA phase: visual and functional
product problems become issues, while proven test-fixture or workflow drift is
repaired narrowly and revalidated.

## Load The Governing Skills

Read these repo-local skills before acting:

- `../chessticize-mobile-dev-loop/SKILL.md` for validation-layer selection.
- `../chessticize-mobile-ui-calibration/SKILL.md` for exact-head Release
  capture, the maintained twenty-six-image baseline, and visual inspection
  rules.
- `../chessticize-mobile-local-e2e/SKILL.md` when the accumulated delta or
  requested build crosses an iOS native, persistence, release, or Detox
  boundary.
- `../chessticize-issue-triage/SKILL.md` before creating or labeling findings.

Follow `AGENTS.md`. A release-delta audit does not waive its clean-worktree,
native-evidence, issue-tracker, or Storybook rules.

This skill narrows the calibration workflow's repair loop. If the calibration
skill says to fix a visual mismatch and repeat the capture, treat that as
authorization to repair only validation infrastructure during a release-delta
audit. A mismatch in product rendering or behavior remains a product finding:
file an issue and leave product code unchanged.

## 1. Pin Exact Identities

1. Determine the requested platform. If the user asks for an iOS build or iOS
   interaction QA, use the most recent published iOS release unless the user
   names another baseline. Do the equivalent for Android.
2. Read the release record and capture its exact source commit. Prefer the
   release manifest or explicit source identity in the release body; do not
   infer the baseline from dates or a mutable branch.
3. Record the full baseline commit, full target commit, target Git tree, release
   tag, platform, and worktree cleanliness.
4. Verify that the baseline is an ancestor of the target. Stop and explain a
   divergent baseline instead of silently comparing unrelated histories.

Run the local inventory helper:

```sh
node .codex/skills/chessticize-release-delta-qa/scripts/collect-release-delta.mjs \
  --base <40-character-release-commit> \
  --head <40-character-target-commit> \
  --output <ignored-or-temporary-json-path>
```

Keep generated audit artifacts under `scratch/` or a temporary directory. Do
not commit user data, screenshots, build output, or generated reports.

## 2. Reconstruct Final Behavior

Use both evidence views:

- First-parent commits and merged PR bodies explain intent, root causes, known
  fixes, and prior validation.
- The final `baseline..target` code, tests, current UI docs, and current
  Interaction Lab define the behavior that actually exists.

Treat an older PR description as historical when a later PR supersedes it.
Call out the final rule and the superseding PR instead of presenting both
behaviors as simultaneously true.

Build a surface matrix using
[`references/qa-matrix-template.md`](references/qa-matrix-template.md). For
every behavior-changing PR, capture:

- Product surface or cross-cutting boundary.
- Final user-visible behavior.
- Bug fixed or regression prevented.
- Changed interaction and edge cases.
- Deterministic simulator state or maintained screenshot scene.
- Required device profile and orientation.
- Storybook scenario or current design contract used for comparison.
- Existing automated evidence.
- Remaining simulator, device, migration, or owner-only check.
- Priority for this sweep.

Separate release/docs-only changes from product behavior. Summarize them, but
do not invent interaction tests for them.

## 3. Select The Visual Matrix And Supporting Risk

Choose simulator scenes, device profiles, orientations, and supporting test
scope from the union of changes since the release, not only the newest PR.

- Treat the changed-surface matrix as the primary visual scope. For every
  changed screen, state, or interaction, drive the real public UI on the
  simulator and inspect the resulting presentation. The maintained baseline is
  a regression safety net; it does not replace deeper checks of the release
  delta.
- Exercise both portrait and landscape for every changed state that uses
  adaptive layout, Safe Area geometry, board/control rails, wrapping, scrolling,
  fixed navigation, or screen-size branches. A portrait pass is not evidence
  for the corresponding landscape state.
- Always capture and inspect the maintained fifteen Release scenes plus the
  eleven layout-sensitive landscape scenes on a dedicated iPhone simulator.
- Add another device family when the delta touches adaptive layout, Safe Area,
  board/rail geometry, navigation geometry, text wrapping, or screen-size
  branching. Use installed named simulators; do not invent a nonexistent
  foldable profile. Prefer a compact iPhone and an 11-inch or 13-inch iPad for
  bounded layout coverage.
- Use lower-layer tests for domain, storage, component, and accessibility
  contracts as supporting evidence. A green test does not waive visual
  inspection of an affected screen.
- Require an exact-head Release iOS build for an iOS release-delta request.
- Select targeted native validation for one bounded native bridge or one
  affected native journey.
- Select full native validation when the accumulated delta spans multiple
  native/persistence/navigation journeys or is being treated as a release
  candidate.
- Include the released-fixture migration matrix and simulator upgrade smoke
  when SQLite schema or repair behavior changed.
- Keep physical-device sound, haptic, notification, CloudKit, and similar
  owner checks explicit; simulator success cannot prove them.
- Do not install or launch the audit build on physical hardware. A real-device
  check is outside this workflow unless the user separately and explicitly
  requests it.

Build only from a clean exact application head. Do not build from a workflow
documentation branch. Confirm the bundled `main.jsbundle` exists before using
the app without Metro.

## 4. Capture And Inspect Release Simulator Evidence

From the clean exact application head, run the existing calibration workflow:

```sh
DETOX_IOS_DEVICE="iPhone 17-Detox" \
  .codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh
```

For each additional required device family, rerun the same journey with that
installed dedicated simulator name and archive its screenshots separately.
Preserve each device's output directory before starting another capture so a
later run cannot overwrite the evidence.

Verify orientation from the app's observed adaptive-layout frame or the
captured image dimensions before accepting each portrait or landscape file.
The requested orientation, screenshot filename, and a successful capture
command are not proof. If simulator rotation is ignored or the observed frame
never reaches the requested orientation, fail the capture row as blocked and
do not accept or relabel the image.

Open every captured PNG. Do not infer visual success from the screenshot
command exiting zero. Inspect:

- Hierarchy, copy, wrapping, truncation, and disabled states.
- Native Safe Area and edge padding.
- Board size, coordinates, arrows, rail geometry, and board-to-copy balance.
- Portrait and landscape clipping, scrolling, and whitespace.
- Bottom-tab or overlay obstruction.
- Release-only presentation and absence of developer controls.

For changed interactions, also play the transition before and after the
captured state through public controls. Confirm that the visible target remains
reachable and that rotation does not hide, overlap, reset, or replace the state.
Static screenshots alone do not prove an interaction regression.

Compare against the current Storybook scenario when one exists. Storybook is
the design contract; the Release simulator is native acceptance evidence.
Avoid pixel-perfect snapshot gates by default. Record human visual judgment per
scene and keep the screenshot path.

## 5. Run One Independent QA Agent

When subagents are available, use one bounded QA subagent for the simulator
visual sweep and its supporting interaction checks. Give it:

- Exact baseline and target identities.
- The raw delta inventory and surface matrix.
- The exact Release app or capture command and dedicated simulator names.
- Current docs or Storybook scenarios for expected behavior.
- A strict instruction to test and collect evidence only.

Do not give it suspected answers or ask it to implement fixes. Do not let the
subagent create GitHub issues directly. It returns one result per matrix row:
`pass`, `fail`, `blocked`, or `not-applicable`, with reproduction steps and
evidence. For every visual row it must open the PNG and record explicit visual
observations; a capture count alone is not a pass. The primary agent verifies
failures and owns deduplication, grouping, triage, and tracker writes.

Use a dedicated Detox simulator. Never run destructive Detox launches against
the user's manual-testing simulator.

## 6. Separate Product Findings From Validation Drift

During this workflow:

- Do not edit product code to resolve a newly discovered product defect.
- Reproduce a reported failure once outside the subagent when safe and
  practical.
- Classify the failure before choosing the terminal action:
  - A reproducible visual mismatch in the Release simulator is a product
    finding even when automated assertions pass. File an issue and do not fix
    it during this sweep.
  - Any other mismatch in current product behavior is also a product finding.
    File an issue and do not fix it during this sweep.
  - A test, fixture, or workflow that still asserts a superseded contract is
    validation drift. Preserve the original failing evidence, repair only that
    validation artifact, and rerun the smallest affected command immediately.
  - An environment or account failure is blocked evidence. Do not weaken a
    gate or silently rewrite a test to make it pass.
- Prove validation drift from the current final contract and an independent
  lower-layer or interactive observation. Do not label a legitimate regression
  as a stale test merely because changing the test is easier.
- Keep validation-drift repairs separate from product implementation. Add no
  new product behavior, and rerun the repaired check plus any cheap validator
  that covers the changed test infrastructure.
- Search open and recently closed issues before creating a new one.
- Group small symptoms only when they share the same journey, likely root
  cause, implementation boundary, priority, and validation plan.
- Create separate issues when findings have different root causes, owners,
  severity, acceptance criteria, or require independent investigation.
- Do not consolidate or close existing issues without explicit human approval.

Run the live label preflight required by the issue-triage skill. Each new issue
must include:

- Baseline and target commits.
- Build identity, simulator/device, and test date.
- Exact reproduction steps.
- Expected and actual behavior.
- Frequency and impact.
- Logs, screenshots, video, or test identifiers when available.
- A bounded acceptance checklist.
- Suggested validation scope, including owner/device checks that automation
  cannot prove.

Apply the issue-triage rubric and leave its durable triage record. Filing the
issue is the terminal action for the defect in this workflow.

## 7. Finish With Auditable Evidence

Report:

- Baseline release and exact target.
- Merged PRs and final behavior by surface.
- Pages requiring owner attention.
- Release build and capture commands, screenshot directories, Xcode, simulator
  profiles, orientations, and clean-worktree evidence.
- Per-scene visual result and explicit observation, including every maintained
  portrait and landscape image.
- Matrix totals for pass, fail, blocked, and not-applicable.
- Validation-drift repairs, their original failure evidence, exact changed
  artifacts, and passing rerun evidence.
- New or existing issue links and the grouping rationale.
- Explicit checks still requiring physical hardware or account access.
- The workflow/skill commit or PR when the user asked to persist the method.

Do not describe the sweep as complete if a high-priority matrix row is blocked
or if the build identity cannot be proven.
