---
name: write-user-first-copy
description: Audit, generate, and rewrite user-facing product copy from a first-time user's perspective. Use for onboarding, Settings, per-item or per-run editors, toggles, forms, prompts, empty and error states, confirmations, tooltips, accessibility labels, and Storybook UI copy when text feels technical, abstract, implementation-led, or "written by an engineer." Preserve the real product contract while replacing internal terminology with concrete actions, outcomes, scope, timing, and escape hatches users can understand.
---

# Write User-First Product Copy

Write from the user's task and visible outcome, not from the implementation's state model. Keep every claim faithful to the real behavior.

## Workflow

1. Reconstruct the behavior before drafting.
   - Identify what the user does, what the product does next, what changes when the setting is off, timing or consequences, and where the user can change it.
   - Inspect source, tests, issue acceptance criteria, or product context when the contract is not explicit. Do not invent friendlier but false behavior.
2. Name the audience and moment.
   - Assume no prior knowledge for onboarding and first-use Settings.
   - Reuse established product terms only after the UI has taught them.
   - Distinguish global settings, individual-item overrides, recurring prompts, and transient status messages.
3. Draft the mental model in plain language.
   - Privately complete: “After I ___, the product ___, so I can ___.”
   - Lead the UI copy with the visible experience. Explain scope or storage only after the experience is clear.
4. Cover every meaningful state.
   - For a toggle, write both On and Off copy. Off copy must say what the user will experience, not merely “disabled.”
   - For a local override, say what happens in this item or Run and where to change the behavior globally.
   - For optional mechanics, make the escape hatch explicit wherever the mechanic is first taught or repeatedly requested.
5. Fit the surface.
   - Label: concrete action or outcome.
   - Helper text: what happens and why it matters.
   - Scope line: “This setting only changes this Run.”
   - Timing line: amount, limit, and whether other timers pause.
   - Status message: direct confirmation in the same vocabulary as the control.
6. Read the copy in rendered order and revise.
   - Put the primary instruction first, consequence next, and optional escape hatch last.
   - Use a separate visually highlighted line when optionality changes whether the user must participate. Emphasize **optional**, but keep the complete meaning available to accessibility APIs without relying on styling alone.
7. Validate the result in context.
   - Update exact-copy component tests and Storybook play assertions when code is in scope.
   - Inspect narrow and wide layouts when added copy or emphasis can change wrapping or hierarchy.

## Engineer-Language Audit

Flag text that does any of the following:

- Describes the implementation instead of the experience: “enabled,” “global state,” “saved intent,” “fallback,” “override,” “one choice.”
- Leads with ownership or scope: “Controls this Run only” before saying what the control does.
- Uses an abstract noun where a verb works: “Opponent reply challenge” instead of “Find the opponent's reply.”
- Names a UI object without explaining the action: “choice,” “candidate,” “entry,” “configuration.”
- Says data is preserved without first explaining the visible Off behavior.
- Hides optionality inside a dense paragraph or mentions Settings without saying what can be changed there.
- Uses different names for the same mechanic across onboarding, Settings, Edit, prompts, and status messages.
- Requires the reader to infer side effects, timing, mistakes, Review consequences, or paused clocks.

Do not ban technical terms merely because they are technical. Keep a term when users already need it to complete the task and the interface teaches it consistently.

## Rewrite Patterns

Prefer:

- “After you choose the better arrow, you'll go straight to the next puzzle.”
- “This setting only changes this Run.”
- “To turn this off for every Run, go to Settings.”
- “You'll have 10 seconds by default. Choose up to 30 seconds.”
- “Your Sprint and puzzle timers pause while you find the reply.”

Avoid:

- “Every Run uses one choice.”
- “Saved per-Run intent remains unchanged.”
- “Controls this Run only.”
- “The global setting is enabled.”
- “Optional after a correct choice.”

These examples illustrate structure, not mandatory vocabulary. Adapt them to the actual product contract.

## First-Time User Check

Before accepting copy, verify that a new user can answer:

- What will happen?
- What am I expected to do?
- Why or when would I use this?
- What happens if I turn it off or skip it?
- Does this affect everything or only this item or Run?
- Where can I change it later?
- Is there a timer, penalty, irreversible effect, or saved preference I need to know about?

If any answer depends on insider knowledge, rewrite.

## Output

When asked only for copy, provide the proposed strings grouped by surface and state, followed by only the rationale needed to evaluate a real tradeoff. When asked to implement, change the source and its public-behavior tests, then report the final strings and validation evidence.

Preserve the project's language and localization rules. Do not silently translate, change terminology contracts, or add product behavior while improving tone.
