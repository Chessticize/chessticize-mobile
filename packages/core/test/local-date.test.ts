import test from "node:test";
import assert from "node:assert/strict";

import { formatLocalCalendarDate, formatReviewDay } from "../src/index.ts";

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

test("formatReviewDay does not shift date-only values across time zones", () => {
  assert.equal(formatReviewDay("2026-06-21", { locale: "en-US" }), "Jun 21, 2026");
  assert.equal(formatReviewDay("not-a-date", { locale: "en-US" }), "not-a-date");
});
