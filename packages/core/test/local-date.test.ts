import test from "node:test";
import assert from "node:assert/strict";

import { formatLocalCalendarDate } from "../src/index.ts";

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
