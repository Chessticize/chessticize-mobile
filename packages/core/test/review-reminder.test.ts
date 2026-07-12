import test from "node:test";
import assert from "node:assert/strict";

import { computeNextReminder, type ReviewReminderUsageEntry, type ReviewQueueState } from "../src/index.ts";

test("computeNextReminder uses the median local session-start hour from recent history", () => {
  const now = localIso(2026, 7, 3, 12);
  const decision = computeNextReminder(
    [reviewDueDay("2026-07-03")],
    [
      usage("s1", localIso(2026, 7, 2, 8, 10)),
      usage("s2", localIso(2026, 7, 2, 18, 20)),
      usage("s3", localIso(2026, 7, 1, 20, 30)),
      usage("s4", localIso(2026, 6, 30, 20, 40)),
      usage("s5", localIso(2026, 6, 29, 21, 50)),
      usage("old", localIso(2026, 6, 1, 23))
    ],
    { kind: "smart" },
    now
  );

  assert.equal(decision?.scheduledAt, localIso(2026, 7, 3, 20));
  assert.equal(decision?.dueCount, 1);
  assert.equal(decision?.body, "1 review is ready");
  assert.equal(decision?.route, "review");
});

test("computeNextReminder deduplicates attempts from the same session before computing smart time", () => {
  const decision = computeNextReminder(
    [reviewDueDay("2026-07-03")],
    [
      usage("s1", localIso(2026, 7, 2, 8, 30)),
      usage("s1", localIso(2026, 7, 2, 23, 30)),
      usage("s2", localIso(2026, 7, 2, 18)),
      usage("s3", localIso(2026, 7, 1, 19)),
      usage("s4", localIso(2026, 6, 30, 20)),
      usage("s5", localIso(2026, 6, 29, 21))
    ],
    { kind: "smart" },
    localIso(2026, 7, 3, 12)
  );

  assert.equal(decision?.scheduledAt, localIso(2026, 7, 3, 19));
});

test("computeNextReminder falls back to 19:00 local time until enough recent sessions exist", () => {
  const decision = computeNextReminder(
    [reviewDueDay("2026-07-03")],
    [
      usage("s1", localIso(2026, 7, 2, 8)),
      usage("s2", localIso(2026, 7, 1, 9)),
      usage("s3", localIso(2026, 6, 30, 10)),
      usage("s4", localIso(2026, 6, 29, 11))
    ],
    { kind: "smart" },
    localIso(2026, 7, 3, 12)
  );

  assert.equal(decision?.scheduledAt, localIso(2026, 7, 3, 19));
});

test("computeNextReminder respects fixed reminder time and pluralizes due-count copy", () => {
  const decision = computeNextReminder(
    [
      reviewDueDay("2026-07-03"),
      reviewDueDay("2026-07-03"),
      reviewDueDay("2026-07-04")
    ],
    [],
    { kind: "fixed", hour: 8, minute: 15 },
    localIso(2026, 7, 3, 7, 30)
  );

  assert.equal(decision?.scheduledAt, localIso(2026, 7, 3, 8, 15));
  assert.equal(decision?.dueCount, 2);
  assert.equal(decision?.body, "2 reviews are ready");
});

test("computeNextReminder projects to the next local reminder time that will have due reviews", () => {
  const decision = computeNextReminder(
    [reviewDueDay("2026-07-05")],
    [],
    { kind: "fixed", hour: 19, minute: 0 },
    localIso(2026, 7, 3, 12)
  );

  assert.equal(decision?.scheduledAt, localIso(2026, 7, 5, 19));
  assert.equal(decision?.dueCount, 1);
});

test("computeNextReminder returns none when reminders are off or no reviews will be due", () => {
  assert.equal(
    computeNextReminder([reviewDueDay("2026-07-03")], [], { kind: "off" }, "2026-07-03T12:00:00.000Z"),
    undefined
  );
  assert.equal(
    computeNextReminder([], [], { kind: "smart" }, "2026-07-03T12:00:00.000Z"),
    undefined
  );
  assert.equal(
    computeNextReminder([reviewDueDay("not-a-date")], [], { kind: "smart" }, "2026-07-03T12:00:00.000Z"),
    undefined
  );
});

test("computeNextReminder validates fixed reminder settings and now", () => {
  assert.throws(
    () => computeNextReminder([reviewDueDay("2026-07-03")], [], { kind: "fixed", hour: 24, minute: 0 }, "2026-07-03T12:00:00.000Z"),
    /hour/
  );
  assert.throws(
    () => computeNextReminder([reviewDueDay("2026-07-03")], [], { kind: "fixed", hour: 8, minute: 60 }, "2026-07-03T12:00:00.000Z"),
    /minute/
  );
  assert.throws(
    () => computeNextReminder([reviewDueDay("2026-07-03")], [], { kind: "smart" }, "not-a-date"),
    /now/
  );
});

function reviewDueDay(dueDay: string): Pick<ReviewQueueState, "dueDay"> {
  return { dueDay };
}

function usage(sessionId: string, startedAt: string): ReviewReminderUsageEntry {
  return { sessionId, startedAt };
}

function localIso(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}
