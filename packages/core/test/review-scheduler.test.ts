import test from "node:test";
import assert from "node:assert/strict";
import { isReviewDue, isReviewOverdue, reviewDueState, scheduleMistake, scheduleMistakeForContext, scheduleReview } from "../src/index.ts";

test("first mistake is scheduled for one day later", () => {
  const scheduled = scheduleMistake("p1", "2026-06-20T00:00:00.000Z");

  assert.equal(scheduled.puzzleId, "p1");
  assert.equal(scheduled.dueAt, "2026-06-21T00:00:00.000Z");
  assert.equal(scheduled.intervalHours, 24);
  assert.equal(scheduled.reviewCount, 0);
  assert.equal(scheduled.successStreak, 0);
  assert.equal(scheduled.lapseCount, 0);
});

test("successful reviews start at one day, expand intervals, and failed reviews contract them", () => {
  const first = scheduleMistake("p1", "2026-06-20T00:00:00.000Z");
  const success = scheduleReview({
    previous: first,
    result: "correct",
    now: "2026-06-21T00:00:00.000Z"
  });

  assert.equal(success.dueAt, "2026-06-22T00:00:00.000Z");
  assert.equal(success.intervalHours, 24);
  assert.equal(success.reviewCount, 1);
  assert.equal(success.successStreak, 1);
  assert.equal(success.lapseCount, 0);

  const secondSuccess = scheduleReview({
    previous: success,
    result: "correct",
    now: "2026-06-22T00:00:00.000Z"
  });

  assert.equal(secondSuccess.dueAt, "2026-06-25T00:00:00.000Z");
  assert.equal(secondSuccess.intervalHours, 72);
  assert.equal(secondSuccess.reviewCount, 2);
  assert.equal(secondSuccess.successStreak, 2);
  assert.equal(secondSuccess.lapseCount, 0);

  const failed = scheduleReview({
    previous: secondSuccess,
    result: "wrong",
    now: "2026-06-23T00:00:00.000Z"
  });

  assert.equal(failed.dueAt, "2026-06-23T06:00:00.000Z");
  assert.equal(failed.intervalHours, 6);
  assert.equal(failed.reviewCount, 3);
  assert.equal(failed.successStreak, 0);
  assert.equal(failed.lapseCount, 1);
});

test("sprint misses refresh review due dates without counting as failed scheduled reviews", () => {
  const first = scheduleMistake("p1", "2026-06-20T00:00:00.000Z");
  const refreshed = scheduleMistakeForContext(
    { puzzleId: "p1", mode: "standard", ratingKey: "standard 5/20" },
    "2026-06-20T12:00:00.000Z",
    first
  );

  assert.equal(first.lapseCount, 0);
  assert.equal(refreshed.lapseCount, 0);
  assert.equal(refreshed.reviewCount, 0);
  assert.equal(refreshed.dueAt, "2026-06-21T12:00:00.000Z");
});

test("review overdue state starts only after the review is more than 24 hours late", () => {
  const review = scheduleMistake("p1", "2026-06-20T00:00:00.000Z");

  assert.equal(reviewDueState(review, "2026-06-20T23:59:59.999Z"), "future");
  assert.equal(isReviewDue(review, "2026-06-20T23:59:59.999Z"), false);
  assert.equal(isReviewOverdue(review, "2026-06-20T23:59:59.999Z"), false);
  assert.equal(reviewDueState(review, "2026-06-21T00:00:00.000Z"), "due");
  assert.equal(isReviewDue(review, "2026-06-21T12:00:00.000Z"), true);
  assert.equal(isReviewOverdue(review, "2026-06-21T23:59:59.999Z"), false);
  assert.equal(reviewDueState(review, "2026-06-22T00:00:00.000Z"), "due");
  assert.equal(reviewDueState(review, "2026-06-22T00:00:00.001Z"), "overdue");
  assert.equal(isReviewOverdue(review, "2026-06-22T00:00:00.001Z"), true);
});
