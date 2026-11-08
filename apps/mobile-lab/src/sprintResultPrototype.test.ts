import assert from "node:assert/strict";
import test from "node:test";
import { SPRINT_RESULT_FIXTURES } from "./sprintResultRedesign/sprintResultFixtures.ts";
import { presentSprintResult } from "./sprintResultRedesign/sprintResultPresentation.ts";

test("the redesign shows a rating change with a real minus sign and arrow", () => {
  const result = presentSprintResult(SPRINT_RESULT_FIXTURES.abandoned);
  const rating = result.stats.find((column) => column.key === "rating");
  assert.equal(rating?.value, "−15");
  assert.equal(rating?.detail, "709 → 694");
  assert.equal(rating?.valueTone, "negative");
  assert.equal(result.outcomeLabel, "Sprint abandoned");
  assert.equal(result.outcomeTone, "neutral");
  assert.equal(result.scoreLabel, "1 / 15");
  assert.equal(result.summaryLine, "1 attempted · 100% accuracy");
});

test("the review row counts the Unclear and In Review union once and explains it", () => {
  const result = presentSprintResult(SPRINT_RESULT_FIXTURES.reviewAndMistakes);
  assert.equal(result.review?.title, "3 to review");
  assert.deepEqual(result.review?.explanation, [
    "3 puzzles to look at again: 2 Unclear and 2 In Review (1 is both).",
    "Unclear: 1 marked by you, 1 marked after Slow. Unclear does not change your Sprint result.",
    "Replaying them does not change when they come back in Review."
  ]);
  assert.equal(result.showReplayMistakes, true);
  assert.equal(result.replayMistakesLabel, "Replay 2 mistakes");
  assert.equal(presentSprintResult(SPRINT_RESULT_FIXTURES.failedTime).replayMistakesLabel, "Replay 1 mistake");
});

test("a run with nothing to review has no review row and no Replay mistakes", () => {
  const result = presentSprintResult(SPRINT_RESULT_FIXTURES.zeroReview);
  assert.equal(result.review, null);
  assert.equal(result.showReplayMistakes, false);
});

test("marking the final puzzle unclear adds it to the review count", () => {
  assert.equal(presentSprintResult(SPRINT_RESULT_FIXTURES.failedTime).review?.title, "1 to review");
  assert.equal(
    presentSprintResult(SPRINT_RESULT_FIXTURES.failedTime, { markedUnclear: true }).review?.title,
    "2 to review"
  );
});

test("a Focused Run stays unrated, drops the trend action and shows its pace", () => {
  const result = presentSprintResult(SPRINT_RESULT_FIXTURES.focusedRun);
  assert.equal(result.title, "Focused Run Result");
  assert.equal(result.showTrendAction, false);
  assert.equal(result.primaryActionLabel, "Back to Practice");
  assert.deepEqual(
    result.stats.map((column) => [column.label, column.value, column.detail]),
    [
      ["Rating", "Unrated", "709 unchanged"],
      ["Time", "7:12", undefined],
      ["Avg solve", "17s", "Usually 24s"]
    ]
  );
});

test("outcome tones follow passed, failed and abandoned", () => {
  assert.equal(presentSprintResult(SPRINT_RESULT_FIXTURES.passed).outcomeTone, "positive");
  assert.equal(presentSprintResult(SPRINT_RESULT_FIXTURES.failedMistakes).outcomeLabel, "Sprint failed · 3 mistakes");
  assert.deepEqual(presentSprintResult(SPRINT_RESULT_FIXTURES.failedTime).outcomeParts, ["Sprint failed", "Time ran out"]);
  assert.equal(presentSprintResult(SPRINT_RESULT_FIXTURES.failedTime).outcomeTone, "negative");
  assert.equal(presentSprintResult(SPRINT_RESULT_FIXTURES.arrowDuel).outcomeLabel, "Arrow Duel passed");
});
