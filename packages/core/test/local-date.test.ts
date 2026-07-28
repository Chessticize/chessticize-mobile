import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLocalCalendarDate,
  formatLocalCalendarDateLabel,
  formatReviewDay
} from "../src/index.ts";

test("formatLocalCalendarDate formats ISO instants on the requested local calendar day", () => {
  assert.equal(
    formatLocalCalendarDate("2026-06-22T00:30:00.000Z", {
      locale: "en-US",
      timeZone: "America/Los_Angeles"
    }),
    "Jun 21, 2026"
  );
});

test("formatLocalCalendarDate keeps invalid values readable", () => {
  assert.equal(formatLocalCalendarDate("not-a-date"), "not-a-date");
});

test("formatLocalCalendarDateLabel uses one concise label for the current local year", () => {
  const options = {
    locale: "en-US",
    timeZone: "America/Los_Angeles",
    now: "2026-07-28T19:00:00.000Z"
  };

  assert.equal(
    formatLocalCalendarDateLabel("2026-07-28T18:00:00.000Z", options),
    "Today"
  );
  assert.equal(
    formatLocalCalendarDateLabel("2026-07-27T18:00:00.000Z", options),
    "Yesterday"
  );
  assert.equal(
    formatLocalCalendarDateLabel("2026-07-26T18:00:00.000Z", options),
    "Jul 26"
  );
  assert.equal(
    formatLocalCalendarDateLabel("2025-12-31T18:00:00.000Z", options),
    "Dec 31, 2025"
  );
});

test("formatLocalCalendarDateLabel follows local midnight across month and year boundaries", () => {
  const options = {
    locale: "en-US",
    timeZone: "America/Los_Angeles"
  };

  assert.equal(
    formatLocalCalendarDateLabel("2026-02-28T23:50:00.000Z", {
      ...options,
      now: "2026-03-01T08:10:00.000Z"
    }),
    "Yesterday"
  );
  assert.equal(
    formatLocalCalendarDateLabel("2026-01-01T07:50:00.000Z", {
      ...options,
      now: "2026-01-01T08:10:00.000Z"
    }),
    "Yesterday"
  );
});

test("formatLocalCalendarDateLabel stays calendar-correct through daylight-saving days", () => {
  const options = {
    locale: "en-US",
    timeZone: "America/Los_Angeles"
  };

  assert.equal(
    formatLocalCalendarDateLabel("2026-03-08T08:30:00.000Z", {
      ...options,
      now: "2026-03-09T07:15:00.000Z"
    }),
    "Yesterday"
  );
  assert.equal(
    formatLocalCalendarDateLabel("2026-11-01T07:15:00.000Z", {
      ...options,
      now: "2026-11-02T07:30:00.000Z"
    }),
    "Today"
  );
});

test("formatLocalCalendarDateLabel preserves invalid and future timestamp states", () => {
  const options = {
    locale: "en-US",
    timeZone: "America/Los_Angeles",
    now: "2026-07-28T19:00:00.000Z"
  };

  assert.equal(formatLocalCalendarDateLabel("not-a-date", options), "not-a-date");
  assert.equal(
    formatLocalCalendarDateLabel("2026-07-28T19:00:01.000Z", options),
    "Scheduled"
  );
  assert.throws(
    () => formatLocalCalendarDateLabel("2026-07-28T18:00:00.000Z", {
      ...options,
      now: "not-a-date"
    }),
    /now must be a valid date/
  );
});

test("formatReviewDay does not shift date-only values across time zones", () => {
  assert.equal(formatReviewDay("2026-06-21", { locale: "en-US" }), "Jun 21, 2026");
  assert.equal(formatReviewDay("not-a-date", { locale: "en-US" }), "not-a-date");
});
