import test from "node:test";
import assert from "node:assert/strict";
import {
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
});

test("guide progress is immutable and reset restores every guide independently", () => {
  const fresh = defaultSprintGuideProgress();
  const rulesSeen = markSprintGuideSeen(fresh, "rules");

  assert.deepEqual(fresh, {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false
  });
  assert.deepEqual(rulesSeen, {
    rulesSeen: true,
    activeSessionSeen: false,
    arrowDuelSeen: false
  });
  assert.deepEqual(resetSprintGuideProgress(), fresh);
});
