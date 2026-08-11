---
name: review-interaction-flows
description: Review end-to-end product interaction flows from the user's point of view, including entry intent, navigation, action semantics, state transitions, feedback continuity, interruption and recovery, responsive layout, accessibility, and copy. Use when Codex is asked to review UX, try a feature, inspect a multi-step journey, evaluate a modal or page, diagnose an interaction that feels surprising or abrupt, assess screenshots plus real behavior, or perform a pre-merge experience pass beyond visual polish and isolated acceptance tests.
---

# Review Interaction Flows

Evaluate the journey as a conversation between the product and the user. Treat every visible action as a promise: its label, placement, and affordance must predict what happens next.

## Establish the review boundary

1. Identify the user's goal, likely entry points, relevant saved states, and interruptions.
2. Read the product contract, issue, existing implementation, and tests. Distinguish intended behavior from accidental behavior.
3. Do not infer implementation permission from a review request. Diagnose and report unless the user also asks for changes.
4. Prefer the real application and realistic data. Use Storybook or component harnesses to cover states, not as a substitute for playing the integrated journey.

## Build a journey matrix

Review combinations rather than one happy-path screenshot.

Map:

- Entry: primary CTA, informational link, notification, deep link, restored app, and help entry.
- User state: first use, returning, active work, paused work, completed work, error, and empty state.
- App state: foreground, background, relaunch, rotation or resize, slow operation, and interrupted transition.
- Exit: back, close, cancel, pause, completion, and switching to another mode.

For each path, write the user's likely intent before the action and the destination or state they reasonably expect afterward. Flag paths where identical destinations behave differently without a user-visible reason.

## Walk the flow at three levels

### 1. Intent and information architecture

- Separate learning, configuring, starting, continuing, pausing, and abandoning. Do not let an informational action silently become a commitment.
- Prefer a stable decision point before a consequential action when the user may need context or has multiple saved choices.
- Make Back return within the navigation hierarchy; reserve Close or X for dismissing an overlay or temporary layer.
- Exercise every platform Back mechanism, including hardware, gesture, and predictive variants. It must commit the same domain transition as the visible Back control.
- Preserve the user's selected object, mode, and configuration across detours and recovery.
- Check that alternate entry points honor the same contract instead of bypassing important context.

### 2. Action and state semantics

- Verify the entire hit area communicates clickability. A card that looks clickable must behave as one; a non-clickable card must not borrow button styling.
- Avoid nested actions that compete with a parent card or make the dominant next step ambiguous.
- Make labels name the immediate result. Use Continue only when the next screen predictably resumes work; otherwise name the intermediate destination.
- Require a distinct, explicit action for destructive, irreversible, or session-starting transitions.
- Ensure disabled, loading, pressed, selected, and completed states remain distinguishable.

### 3. Perceptual continuity

- Keep the cause and result close in time and space. The user should see input, acknowledgment, correctness, consequence, and handoff in that order.
- Never let timers, async resets, navigation, animation, or background events erase required feedback early.
- Avoid unexplained teleports: preserve the outgoing state long enough to understand it, then make the handoff atomic or visibly animated.
- Prevent impossible intermediate frames, blank shells, stale controls, duplicate submissions, and momentary flashes of the next state.
- Keep high-value feedback visible long enough to perceive, but do not block the next action longer than the feedback requires.

## Inspect interruption and recovery

Treat pause, backgrounding, relaunch, and mode switching as first-class transitions.

- The recovered screen must explain what is paused or saved, what remains hidden, and what the available actions do.
- Derive presentation from the authoritative domain state when possible. Avoid parallel UI flags that can disagree with persisted state.
- Hide sensitive or answer-revealing content immediately when interruption requires it; do not leave a blank page with no explanation.
- Do not resume consequential work merely because the app foregrounded or the user revisited an entry card.
- Verify repeated interruption is idempotent and elapsed-time accounting remains correct.

## Review presentation quality

- Establish one clear primary action and one visual hierarchy per screen.
- Check whether containers look like pages, cards, dialogs, or buttons and whether their behavior matches that visual grammar.
- Test the smallest and largest supported viewports, dynamic text, long labels, safe areas, keyboard, portrait, and relevant landscape layouts.
- Treat scroll position as navigation state. A destination must own or intentionally reset its scroll offset instead of inheriting the replaced screen's position.
- Look for truncation, awkward wrapping, clipped controls, unreachable content, weak contrast, and controls too close to system gestures.
- Review accessibility roles, names, focus order, touch targets, selected state, and screen-reader announcement of state changes.
- Apply user-first copy: state the concrete outcome, timing, scope, and escape hatch; remove internal terminology.

## Trace implementation risks

Inspect the full path from intent to rendered result:

1. Input handler and navigation.
2. Domain command and persisted state.
3. Async work, timers, animation, and lifecycle callbacks.
4. Derived presentation state.
5. Rendered affordances and accessibility.

Look especially for duplicated state machines, synthetic deadlines, stale closures, race-prone effect cleanup, separately implemented sibling-mode behavior, and preview-only logic that diverges from production. Prefer one mature shared transition over a parallel feature-specific copy when the contracts match.

## Validate findings

For each suspected defect:

1. Reproduce it through the public interaction surface.
   Enter from the preceding real screen; a fixture that mounts the destination directly cannot prove entry position, navigation, or transition behavior.
2. Record the entry path, starting state, action, actual result, and expected result.
3. Confirm the implementation cause before proposing a fix.
4. Add a red-capable regression test at the lowest public layer that proves the contract. Add integrated or lifecycle coverage when the defect crosses boundaries.
5. After a fix, replay the complete journey, not only the failing step. Synchronize maintained Storybook scenarios with the accepted production behavior.

Use screenshots or recordings for layout and temporal evidence. Use tests for behavioral durability. Neither replaces the other.

## Report the review

Lead with the overall journey judgment, then list findings in user-impact order.

For each finding include:

- Path and starting state.
- User expectation and violated promise.
- Observable evidence.
- Confirmed cause or clearly labeled hypothesis.
- Recommended interaction contract.
- Required regression and visual coverage.

Separate blockers, important polish, and optional ideas. Avoid turning personal taste into a defect: tie each finding to intent, predictability, continuity, recoverability, accessibility, or a stated product principle.

Finish with a compact entry-state-destination matrix and identify any paths not exercised.
