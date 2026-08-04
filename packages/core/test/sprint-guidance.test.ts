import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeArrowDuelReplyCue,
  advanceArrowDuelReplyCueSprint,
  arrowDuelReplyCuePresentationFor,
  defaultSprintGuideProgress,
  markSprintGuideSeen,
  resetSprintGuideProgress,
  sprintSessionGuidesFor
} from "../src/index.ts";

test("first Standard and Arrow Duel sessions receive the applicable guide sequence", () => {
  const fresh = defaultSprintGuideProgress();

  assert.deepEqual(sprintSessionGuidesFor(fresh, "standard"), ["active_session"]);
  assert.deepEqual(sprintSessionGuidesFor(fresh, "arrow_duel"), [
    "active_session",
    "arrow_duel"
  ]);

  const sharedSeen = markSprintGuideSeen(fresh, "active_session");
  assert.deepEqual(sprintSessionGuidesFor(sharedSeen, "standard"), []);
  assert.deepEqual(sprintSessionGuidesFor(sharedSeen, "arrow_duel"), ["arrow_duel"]);

  const allSeen = markSprintGuideSeen(sharedSeen, "arrow_duel");
  assert.deepEqual(sprintSessionGuidesFor(allSeen, "arrow_duel"), []);

  assert.deepEqual(
    sprintSessionGuidesFor(allSeen, "standard", { focusedRun: true }),
    ["focused_run"]
  );
  assert.deepEqual(
    sprintSessionGuidesFor(sharedSeen, "arrow_duel", { focusedRun: true }),
    ["focused_run", "arrow_duel"]
  );
  const focusSeen = markSprintGuideSeen(allSeen, "focused_run");
  assert.deepEqual(
    sprintSessionGuidesFor(focusSeen, "arrow_duel", { focusedRun: true }),
    []
  );
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
