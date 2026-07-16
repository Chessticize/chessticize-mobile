import test from "node:test";
import assert from "node:assert/strict";
import {
  addReviewDays,
  isReviewDue,
  isReviewOverdue,
  orderReviewQueue,
  reviewDayFor,
  reviewDueState,
  reviewQueueForecast,
  scheduleMistake,
  scheduleMistakeForContext,
  scheduleReview
} from "../src/index.ts";

const UTC = "UTC";

test("first mistake is scheduled for the next review day", () => {
  const scheduled = scheduleMistake("p1", "2026-06-20T23:59:59.000Z", UTC);

  assert.equal(scheduled.puzzleId, "p1");
  assert.equal(scheduled.dueDay, "2026-06-21");
  assert.equal(scheduled.intervalDays, 1);
  assert.equal(scheduled.reviewCount, 0);
  assert.equal(scheduled.successStreak, 0);
  assert.equal(scheduled.lapseCount, 0);
});

test("successful reviews follow 1, 3, 7, 14, 30, and capped 60 day intervals", () => {
  let review = scheduleMistake("p1", "2026-06-20T12:00:00.000Z", UTC);
  const reviewDays = ["2026-06-21", "2026-06-22", "2026-06-25", "2026-07-02", "2026-07-16", "2026-08-15", "2026-10-14"];
  const expectedDueDays = ["2026-06-22", "2026-06-25", "2026-07-02", "2026-07-16", "2026-08-15", "2026-10-14", "2026-12-13"];
  const expectedIntervals = [1, 3, 7, 14, 30, 60, 60];

  for (let index = 0; index < reviewDays.length; index += 1) {
    review = scheduleReview({
      previous: review,
      result: "correct",
      now: `${reviewDays[index]}T12:00:00.000Z`,
      timeZone: UTC
    });
    assert.equal(review.dueDay, expectedDueDays[index]);
    assert.equal(review.intervalDays, expectedIntervals[index]);
    assert.equal(review.successStreak, index + 1);
  }
  assert.equal(review.reviewCount, 7);
  assert.equal(review.lapseCount, 0);
});

test("a wrong scheduled review always returns tomorrow and resets its streak", () => {
  const previous = {
    ...scheduleMistake("p1", "2026-06-20T12:00:00.000Z", UTC),
    successStreak: 4,
    lapseCount: 2
  };
  const failed = scheduleReview({
    previous,
    result: "wrong",
    now: "2026-06-21T23:30:00.000Z",
    timeZone: UTC
  });

  assert.equal(failed.dueDay, "2026-06-22");
  assert.equal(failed.intervalDays, 1);
  assert.equal(failed.reviewCount, 1);
  assert.equal(failed.successStreak, 0);
  assert.equal(failed.lapseCount, 3);
});

test("sprint misses stay due tomorrow without counting as failed scheduled reviews", () => {
  const first = scheduleMistake("p1", "2026-06-20T05:00:00.000Z", UTC);
  const refreshed = scheduleMistakeForContext(
    { puzzleId: "p1", mode: "standard", ratingKey: "standard 5/20" },
    "2026-06-20T23:59:00.000Z",
    first,
    UTC
  );

  assert.equal(first.lapseCount, 0);
  assert.equal(refreshed.lapseCount, 0);
  assert.equal(refreshed.reviewCount, 0);
  assert.equal(refreshed.dueDay, "2026-06-21");
});

test("a completed review stays done when practice creates another mistake later that day", () => {
  const context = { puzzleId: "p1", mode: "standard" as const, ratingKey: "standard 5/20" };
  const due = scheduleMistakeForContext(context, "2026-06-19T12:00:00.000Z", undefined, UTC);
  const completed = scheduleReview({
    previous: due,
    result: "correct",
    now: "2026-06-20T12:00:00.000Z",
    timeZone: UTC
  });
  const refreshed = scheduleMistakeForContext(context, "2026-06-20T20:00:00.000Z", completed, UTC);

  assert.equal(isReviewDue(completed, "2026-06-20T23:59:00.000Z", UTC), false);
  assert.equal(refreshed.dueDay, "2026-06-21");
  assert.equal(isReviewDue(refreshed, "2026-06-20T23:59:00.000Z", UTC), false);
});

test("the local review day rolls over at 4 AM", () => {
  assert.equal(reviewDayFor("2026-06-20T10:59:59.999Z", "America/Los_Angeles"), "2026-06-19");
  assert.equal(reviewDayFor("2026-06-20T11:00:00.000Z", "America/Los_Angeles"), "2026-06-20");
});

test("the 4 AM rollover survives both daylight-saving transitions", () => {
  assert.equal(reviewDayFor("2026-03-08T10:59:59.999Z", "America/Los_Angeles"), "2026-03-07");
  assert.equal(reviewDayFor("2026-03-08T11:00:00.000Z", "America/Los_Angeles"), "2026-03-08");
  assert.equal(reviewDayFor("2026-11-01T11:59:59.999Z", "America/Los_Angeles"), "2026-10-31");
  assert.equal(reviewDayFor("2026-11-01T12:00:00.000Z", "America/Los_Angeles"), "2026-11-01");
});

test("calendar-day arithmetic handles month, year, and leap-day boundaries", () => {
  assert.equal(addReviewDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addReviewDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addReviewDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addReviewDays("2028-02-29", 1), "2028-03-01");
});

test("reviews become overdue on the next review day", () => {
  const review = { dueDay: "2026-06-21" };
  assert.equal(reviewDueState(review, "2026-06-21T10:59:59.999Z", "America/Los_Angeles"), "future");
  assert.equal(reviewDueState(review, "2026-06-21T11:00:00.000Z", "America/Los_Angeles"), "due");
  assert.equal(isReviewDue(review, "2026-06-21T20:00:00.000Z", "America/Los_Angeles"), true);
  assert.equal(isReviewOverdue(review, "2026-06-21T20:00:00.000Z", "America/Los_Angeles"), false);
  assert.equal(reviewDueState(review, "2026-06-22T11:00:00.000Z", "America/Los_Angeles"), "overdue");
});

test("review queue forecasts separate today, tomorrow, the next seven days, and total", () => {
  const forecast = reviewQueueForecast(
    ["2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22", "2026-06-27", "2026-06-28"].map((dueDay) => ({ dueDay })),
    "2026-06-20T20:00:00.000Z",
    UTC
  );

  assert.deepEqual(forecast, {
    todayCount: 2,
    tomorrowCount: 1,
    nextSevenDaysCount: 3,
    overdueCount: 1,
    totalCount: 6,
    nextDueDay: "2026-06-21"
  });
});

test("review queue ordering is a stable shared-domain contract", () => {
  const queue = [
    scheduleMistakeForContext(
      { puzzleId: "p2", mode: "standard", ratingKey: "standard 5/30" },
      "2026-06-21T12:00:00.000Z",
      undefined,
      UTC
    ),
    scheduleMistakeForContext(
      { puzzleId: "p1", mode: "standard", ratingKey: "standard 5/30" },
      "2026-06-20T12:00:00.000Z",
      undefined,
      UTC
    ),
    scheduleMistakeForContext(
      { puzzleId: "p1", mode: "arrow_duel", ratingKey: "arrow duel 5/30" },
      "2026-06-20T12:00:00.000Z",
      undefined,
      UTC
    ),
    scheduleMistakeForContext(
      { puzzleId: "p1", mode: "arrow_duel", ratingKey: "arrow duel 5/20" },
      "2026-06-20T12:00:00.000Z",
      undefined,
      UTC
    )
  ];

  assert.deepEqual(
    orderReviewQueue(queue).map((review) => [review.dueDay, review.puzzleId, review.mode, review.ratingKey]),
    [
      ["2026-06-21", "p1", "arrow_duel", "arrow duel 5/20"],
      ["2026-06-21", "p1", "arrow_duel", "arrow duel 5/30"],
      ["2026-06-21", "p1", "standard", "standard 5/30"],
      ["2026-06-22", "p2", "standard", "standard 5/30"]
    ]
  );
  assert.equal(queue[0]?.puzzleId, "p2");
});
