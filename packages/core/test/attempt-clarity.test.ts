import test from "node:test";
import assert from "node:assert/strict";
import { isUnclearAttemptEligible, updateAttemptUnclearState } from "../src/index.ts";
import type { AttemptEvent } from "../src/index.ts";

const CORRECT_SPRINT_ATTEMPT: AttemptEvent = {
  id: "attempt-1",
  source: "sprint",
  sessionId: "session-1",
  puzzleId: "puzzle-1",
  mode: "standard",
  ratingKey: "standard 5/20",
  result: "correct",
  submittedMove: "e2e4",
  expectedMove: "e2e4",
  startedAt: "2026-07-17T12:00:00.000Z",
  completedAt: "2026-07-17T12:00:05.000Z",
  ratingBefore: 1200
};

test("only correct sprint attempts are eligible to be marked unclear", () => {
  for (const mode of ["standard", "arrow_duel", "custom"] as const) {
    assert.equal(isUnclearAttemptEligible({ ...CORRECT_SPRINT_ATTEMPT, mode }), true);
  }
  assert.equal(isUnclearAttemptEligible({ ...CORRECT_SPRINT_ATTEMPT, result: "wrong" }), false);
  assert.equal(isUnclearAttemptEligible({ ...CORRECT_SPRINT_ATTEMPT, source: "scheduled_review" }), false);
});

test("unclear changes are reversible and repeated writes are idempotent", () => {
  const marked = updateAttemptUnclearState(CORRECT_SPRINT_ATTEMPT, true, "2026-07-17T12:01:00.000Z");
  assert.equal(marked.unclear, true);
  assert.equal(marked.unclearUpdatedAt, "2026-07-17T12:01:00.000Z");
  assert.equal(updateAttemptUnclearState(marked, true, "2026-07-17T12:02:00.000Z"), marked);

  const cleared = updateAttemptUnclearState(marked, false, "2026-07-17T12:03:00.000Z");
  assert.equal(cleared.unclear, false);
  assert.equal(cleared.unclearUpdatedAt, "2026-07-17T12:03:00.000Z");
});

test("unclear updates reject ineligible attempts and invalid timestamps", () => {
  assert.throws(
    () => updateAttemptUnclearState({ ...CORRECT_SPRINT_ATTEMPT, result: "wrong" }, true, "2026-07-17T12:01:00.000Z"),
    /Only correct sprint attempts/
  );
  assert.throws(
    () => updateAttemptUnclearState(CORRECT_SPRINT_ATTEMPT, true, "not-a-date"),
    /updatedAt must be a valid ISO timestamp/
  );
});
