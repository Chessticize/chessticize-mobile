---
name: chessticize-release-delta-qa
description: Summarize changes since an exact mobile release, or execute explicitly requested release-delta visual QA. Change reports stay read-only; simulator builds and captures belong only to visual QA mode.
---

# Chessticize Release Delta QA

## Select The Requested Mode

- **Change summary:** For "summarize fixes since version X" or release-delta
  reports, use steps 1 and 2 below to resolve exact commits and reconstruct final
  behavior. Report existing evidence and its limits, then stop. Do not build,
  install, launch simulators, capture screenshots, edit files or file issues.
  Do not load the calibration, local E2E or triage skills for a summary.
- **Visual QA:** For a requested regression sweep, simulator acceptance or visual
  audit, follow the remaining workflow. The main evidence is the exact-head
  Release app rendered in simulators. Product findings remain read-only and
  become issues within the authorized tracker scope; repair only proven test
  or workflow drift and revalidate its affected scope.

Audit the final product delta rather than treating superseded intermediate
commits as current behavior. A request that only asks what changed uses summary
mode; it does not imply permission or a requirement to execute visual QA.

## Load The Governing Skills

For visual QA only, load each skill when its step is needed:

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

For summary mode, report final behavior, source identity and existing validation
limits here, then stop. The following matrix and execution steps are for visual
QA only.

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
- Exercise native iPhone portrait and iPad portrait/landscape for every changed
  state that uses adaptive layout, Safe Area geometry, board/control rails,
  wrapping, scrolling, fixed navigation, or screen-size branches. Add compact
  wide-short, live-resize, and foldable-sized component or Interaction Lab
  evidence for the same changed state. A portrait pass is not evidence for a
  wide or landscape layout.
- Always cover the maintained fifteen Release scenes. Capture and inspect them
  when host visual calibration is available. For functional iPad landscape
  geometry, always run the dedicated exact-head gate below; the eleven
  layout-sensitive landscape screenshots are optional visual evidence and do
  not replace that native-frame gate.
- Keep ordinary full-screen iPhone simulator captures in portrait. Do not
  restore iPhone rotation merely to satisfy an older screenshot matrix.
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
- Select full native validation only when the accumulated native risk cannot
  be bounded to one suite under Testing Architecture. A release candidate or
  multiple JavaScript navigation journeys alone do not select full Detox.
  Requested visual captures and required native regression suites are distinct
  evidence scopes.
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

From the clean exact application head, run the iPad landscape functional gate:

```sh
pnpm mobile:verify:ios:landscape-layout
```

This command resolves a dedicated installed iPad simulator, copies the
production Info.plist into the ignored build directory, restricts only that
Release validation build to full-screen landscape, and verifies six product
states through native element frames. It does not use the Simulator menu or
macOS window automation, so it runs while the Mac is locked. Record the exact
head, simulator, build result, app artifact checksum, and six-state result.
Never commit the validation Info.plist or apply its landscape-only settings to
the production target.

Do not treat a locked Mac as a blocker for functional iPad landscape
acceptance. A lock only prevents screenshot-based aesthetic inspection that
depends on host Simulator rotation. When that additional visual evidence is
requested and the host is unlocked, run the existing calibration workflow:

```sh
DETOX_IOS_DEVICE="iPad Pro 11-inch (M5)" \
  .codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh
```

Use the full wrapper only with an installed dedicated iPad. Capture required
iPhone Release scenes with the portrait-only store-assets journey and archive
its screenshots separately. Preserve each device's output directory before
starting another capture so a later run cannot overwrite the evidence.

Verify orientation from the functional gate's observed native root frame or
the captured image dimensions before accepting each portrait or landscape
result.
The requested orientation, screenshot filename, and a successful capture
command are not proof. If simulator rotation is ignored or the observed frame
never reaches the requested orientation, fail the capture row as blocked and
do not accept or relabel the image.

Open every captured PNG. Do not infer visual success from the screenshot
command exiting zero. Treat functional correctness and presentation quality as
separate judgments. A screen can be usable and unclipped while still failing
visual QA. Inspect:

- Visual hierarchy and whether the intended focal order is immediately clear.
- Alignment grids, shared edges, column consistency, and control baselines.
- Spacing rhythm, padding, margins, density, and balanced use of whitespace.
- Typography scale, weight, line length, wrapping, truncation, and readability.
- Copy clarity, grammar, concision, tone, terminology, and consistency with the
  behavior the user can actually observe.
- Visual weight and balance between the board, control rail, callouts,
  navigation, and surrounding edges.
- Consistency of color, borders, corner radii, icon treatment, and sibling
  screen patterns.
- Whether guidance copy names and explains the visible UI element a novice is
  being asked to understand, without tour mechanics, internal implementation
  language, unexplained jargon, or redundant instructions.
- Native Safe Area and edge padding.
- Board size, coordinates, arrows, rail geometry, and board-to-copy balance.
- Portrait and landscape clipping, scrolling, and whitespace.
- Bottom-tab or overlay obstruction.
- Release-only presentation and absence of developer controls.

Fail the presentation judgment when an observable aesthetic or layout problem
reduces scanability, comprehension, balance, consistency, or perceived polish.
Do not dismiss such a defect as subjective merely because every element fits.
Record the exact screenshot, the visible defect, and its user impact; do not
file an issue for an unsupported personal preference.

Judge copy from the perspective of a first-time user who only knows what is
visible on the screen. Fail the copy judgment when wording is misleading,
ambiguous, grammatically awkward, needlessly repetitive, inconsistent with
other product terms, or unable to explain the visible control or consequence.
Do not treat text as correct solely because it matches an implementation name
or fits within its container.

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
`pass`, `fail`, `blocked`, or `not-applicable`, with separate functional and
presentation judgments, reproduction steps, and evidence. For every visual row
it must open the PNG and record explicit observations about correctness, copy,
and aesthetics/layout; a capture count alone is not a pass. The primary agent
verifies failures and owns deduplication, grouping, triage, and tracker writes.

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
  - A reproducible aesthetic or layout defect is also a product finding when
    evidence shows weak hierarchy, inconsistent alignment or typography,
    awkward spacing, unbalanced whitespace, cramped density, or reduced
    readability or polish. File an issue even when the flow remains usable.
  - Misleading, ambiguous, awkward, inconsistent, overly internal, or
    novice-hostile copy is a product finding when the wording can reasonably
    impair comprehension or set the wrong expectation. File an issue even when
    the text is technically rendered in full.
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
- Per-scene functional, copy, and presentation results with explicit
  observations for the selected visual matrix, the six-state iPad landscape
  native-frame result, and the required compact wide-short and foldable-sized
  lower-layer rows. Identify optional landscape screenshots that were not
  collected because host visual calibration was unavailable.
- Matrix totals for pass, fail, blocked, and not-applicable.
- Validation-drift repairs, their original failure evidence, exact changed
  artifacts, and passing rerun evidence.
- New or existing issue links and the grouping rationale.
- Explicit checks still requiring physical hardware or account access.
- The workflow/skill commit or PR when the user asked to persist the method.

Do not describe the sweep as complete if a high-priority functional matrix row
is blocked, the iPad landscape native-frame gate fails when selected, or the
build identity cannot be proven. A locked Mac alone does not block functional
iPad landscape acceptance after the dedicated gate passes; report the omitted
optional screenshot evidence precisely.
