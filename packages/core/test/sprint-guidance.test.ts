import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeArrowDuelReplyCue,
  advanceArrowDuelReplyCueSprint,
  arrowDuelReplyCuePresentationFor,
  defaultSprintGuideProgress,
  markSprintGuideSeen,
  markSprintSessionGuidePlanSeen,
  resetSprintGuideProgress,
  SPRINT_SESSION_GUIDE_MAX_STEPS,
  sprintSessionGuidePlanFor,
  type SprintGuideProgress,
  type SprintMode
} from "../src/index.ts";

test("a first Standard Sprint teaches the header, the amber timer and Mark as unclear", () => {
  const fresh = defaultSprintGuideProgress();

  for (const mode of ["standard", "custom", "blitz"] as const) {
    assert.deepEqual(sprintSessionGuidePlanFor(fresh, mode), {
      steps: ["session_progress", "slow_timer", "mark_unclear"],
      completes: ["active_session"]
    });
  }
  assert.deepEqual(
    sprintSessionGuidePlanFor(markSprintGuideSeen(fresh, "active_session"), "standard"),
    { steps: [], completes: [] }
  );
});

test("a first Arrow Duel teaches the choice and, when enabled, the reply", () => {
  const fresh = defaultSprintGuideProgress();
  const sharedSeen = markSprintGuideSeen(fresh, "active_session");

  assert.deepEqual(
    sprintSessionGuidePlanFor(fresh, "arrow_duel", { opponentReply: true }),
    {
      steps: ["session_progress", "arrow_duel_choice", "arrow_duel_reply"],
      completes: ["arrow_duel"]
    }
  );
  assert.deepEqual(sprintSessionGuidePlanFor(fresh, "arrow_duel"), {
    steps: ["session_progress", "arrow_duel_choice"],
    completes: ["arrow_duel"]
  });
  assert.deepEqual(
    sprintSessionGuidePlanFor(sharedSeen, "arrow_duel", { opponentReply: true }),
    { steps: ["arrow_duel_choice", "arrow_duel_reply"], completes: ["arrow_duel"] }
  );
  assert.deepEqual(sprintSessionGuidePlanFor(sharedSeen, "arrow_duel"), {
    steps: ["arrow_duel_choice"],
    completes: ["arrow_duel"]
  });
});

test("finishing a first Arrow Duel guide keeps the Standard basics for the first Standard Sprint", () => {
  const fresh = defaultSprintGuideProgress();
  const plan = sprintSessionGuidePlanFor(fresh, "arrow_duel", { opponentReply: true });
  const afterArrowDuel = markSprintSessionGuidePlanSeen(fresh, plan);

  assert.equal(afterArrowDuel.arrowDuelSeen, true);
  assert.equal(afterArrowDuel.activeSessionSeen, false);
  assert.deepEqual(
    sprintSessionGuidePlanFor(afterArrowDuel, "arrow_duel", { opponentReply: true }),
    { steps: [], completes: [] }
  );
  assert.deepEqual(
    sprintSessionGuidePlanFor(afterArrowDuel, "standard").steps,
    ["session_progress", "slow_timer", "mark_unclear"]
  );
});

test("Focused Runs use their own header guide and share the Arrow Duel steps", () => {
  const fresh = defaultSprintGuideProgress();
  const allSessionGuidesSeen = markSprintGuideSeen(
    markSprintGuideSeen(fresh, "active_session"),
    "arrow_duel"
  );

  assert.deepEqual(
    sprintSessionGuidePlanFor(allSessionGuidesSeen, "standard", { focusedRun: true }),
    {
      steps: ["session_progress", "slow_timer", "mark_unclear"],
      completes: ["focused_run"]
    }
  );
  assert.deepEqual(
    sprintSessionGuidePlanFor(fresh, "arrow_duel", { focusedRun: true, opponentReply: true }),
    {
      steps: ["session_progress", "arrow_duel_choice", "arrow_duel_reply"],
      completes: ["focused_run", "arrow_duel"]
    }
  );
  assert.deepEqual(
    sprintSessionGuidePlanFor(allSessionGuidesSeen, "arrow_duel", { focusedRun: true }),
    { steps: ["session_progress"], completes: ["focused_run"] }
  );
  const focusSeen = markSprintGuideSeen(allSessionGuidesSeen, "focused_run");
  assert.deepEqual(
    sprintSessionGuidePlanFor(focusSeen, "arrow_duel", { focusedRun: true }),
    { steps: [], completes: [] }
  );
});

test("no first-use plan exceeds the step limit or repeats a step", () => {
  const modes: SprintMode[] = ["standard", "blitz", "arrow_duel", "custom"];
  const flags = [false, true];
  for (const rulesSeen of flags) {
    for (const activeSessionSeen of flags) {
      for (const arrowDuelSeen of flags) {
        for (const focusedRunSeen of flags) {
          const progress: SprintGuideProgress = {
            rulesSeen,
            activeSessionSeen,
            arrowDuelSeen,
            focusedRunSeen
          };
          for (const mode of modes) {
            for (const focusedRun of flags) {
              for (const opponentReply of flags) {
                const plan = sprintSessionGuidePlanFor(progress, mode, {
                  focusedRun,
                  opponentReply
                });
                assert.ok(plan.steps.length <= SPRINT_SESSION_GUIDE_MAX_STEPS);
                assert.equal(new Set(plan.steps).size, plan.steps.length);
                assert.equal(plan.steps.length === 0, plan.completes.length === 0);
                assert.deepEqual(
                  sprintSessionGuidePlanFor(
                    markSprintSessionGuidePlanSeen(progress, plan),
                    mode,
                    { focusedRun, opponentReply }
                  ).steps,
                  []
                );
              }
            }
          }
        }
      }
    }
  }
});

test("guide progress is immutable and reset restores every guide independently", () => {
  const fresh = defaultSprintGuideProgress();
  const rulesSeen = markSprintGuideSeen(fresh, "rules");

  assert.deepEqual(fresh, {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false,
    focusedRunSeen: false,
    arrowDuelReplyCueStage: 0
  });
  assert.deepEqual(rulesSeen, {
    rulesSeen: true,
    activeSessionSeen: false,
    arrowDuelSeen: false,
    focusedRunSeen: false,
    arrowDuelReplyCueStage: 0
  });
  assert.deepEqual(resetSprintGuideProgress(), fresh);
});

test("Arrow Duel reply cues progress from confirmation through two familiar Sprints", () => {
  const fresh = defaultSprintGuideProgress();

  assert.deepEqual(arrowDuelReplyCuePresentationFor(fresh), {
    confirmationRequired: true,
    holdMs: null
  });
  assert.equal(
    advanceArrowDuelReplyCueSprint(fresh).arrowDuelReplyCueStage,
    0
  );

  const firstSprint = acknowledgeArrowDuelReplyCue(fresh);
  assert.deepEqual(arrowDuelReplyCuePresentationFor(firstSprint), {
    confirmationRequired: false,
    holdMs: 1_500
  });

  const secondSprint = advanceArrowDuelReplyCueSprint(firstSprint);
  assert.deepEqual(arrowDuelReplyCuePresentationFor(secondSprint), {
    confirmationRequired: false,
    holdMs: 1_500
  });

  const thirdSprint = advanceArrowDuelReplyCueSprint(secondSprint);
  assert.deepEqual(arrowDuelReplyCuePresentationFor(thirdSprint), {
    confirmationRequired: false,
    holdMs: 1_000
  });
  assert.deepEqual(
    arrowDuelReplyCuePresentationFor(advanceArrowDuelReplyCueSprint(thirdSprint)),
    { confirmationRequired: false, holdMs: 1_000 }
  );

  assert.deepEqual(arrowDuelReplyCuePresentationFor(resetSprintGuideProgress()), {
    confirmationRequired: true,
    holdMs: null
  });
});
