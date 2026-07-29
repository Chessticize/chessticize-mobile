import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_REVIEW_REQUEST_COOLDOWN_MS,
  evaluateAppReviewRequestEligibility,
  type AppReviewSprintRecord
} from "../src/index.ts";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

test("the fourth successful rated puzzle Sprint across a second local date is eligible", () => {
  const sessions = [
    successfulSprint("one", "2026-07-27T17:00:00.000Z"),
    successfulSprint("two", "2026-07-27T18:00:00.000Z"),
    successfulSprint("three", "2026-07-27T19:00:00.000Z"),
    successfulSprint("four", "2026-07-28T17:00:00.000Z")
  ];

  assert.deepEqual(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "four",
    nowMs: NOW,
    sessions,
    timeZone: "America/Los_Angeles"
  }), {
    eligible: true,
    successfulSprintCount: 4,
    successfulLocalDateCount: 2
  });
});

test("invalid input and first-launch onboarding history fail closed", () => {
  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "   ",
    currentSessionId: "current",
    nowMs: NOW,
    sessions: []
  })), "invalid_app_version");

  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "missing",
    nowMs: NOW,
    sessions: []
  })), "current_sprint_not_successful");

  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "current",
    nowMs: NOW,
    sessions: [{
      ...successfulSprint("current", "2026-07-29T12:00:00.000Z"),
      completedAt: "not-a-date"
    }]
  })), "current_sprint_not_successful");
});

test("too few successes or successes on only one local date remain ineligible", () => {
  const threeSessions = [
    successfulSprint("one", "2026-07-28T17:00:00.000Z"),
    successfulSprint("two", "2026-07-28T18:00:00.000Z"),
    successfulSprint("three", "2026-07-29T17:00:00.000Z")
  ];
  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "three",
    nowMs: NOW,
    sessions: threeSessions,
    timeZone: "UTC"
  })), "not_enough_successful_sprints");

  const oneDate = [
    successfulSprint("one", "2026-07-29T01:00:00.000Z"),
    successfulSprint("two", "2026-07-29T02:00:00.000Z"),
    successfulSprint("three", "2026-07-29T03:00:00.000Z"),
    successfulSprint("four", "2026-07-29T04:00:00.000Z")
  ];
  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "four",
    nowMs: NOW,
    sessions: oneDate,
    timeZone: "UTC"
  })), "not_enough_local_dates");
});

test("failed, timed-out, abandoned, active, unrated, and Focused results are suppressed", () => {
  const prior = [
    successfulSprint("one", "2026-07-27T12:00:00.000Z"),
    successfulSprint("two", "2026-07-27T13:00:00.000Z"),
    successfulSprint("three", "2026-07-28T12:00:00.000Z")
  ];
  const cases: Array<{
    current: AppReviewSprintRecord;
    reason: string;
  }> = [
    {
      current: { ...successfulSprint("current", "2026-07-29T12:00:00.000Z"), status: "failed" },
      reason: "current_sprint_not_successful"
    },
    {
      current: {
        ...successfulSprint("current", "2026-07-29T12:00:00.000Z"),
        status: "failed",
        endReason: "time_expired"
      },
      reason: "current_sprint_not_successful"
    },
    {
      current: { ...successfulSprint("current", "2026-07-29T12:00:00.000Z"), status: "abandoned" },
      reason: "current_sprint_not_successful"
    },
    {
      current: { ...successfulSprint("current", "2026-07-29T12:00:00.000Z"), status: "active" },
      reason: "current_sprint_not_successful"
    },
    {
      current: { ...successfulSprint("current", "2026-07-29T12:00:00.000Z"), rated: false },
      reason: "current_sprint_not_rated"
    },
    {
      current: { ...successfulSprint("current", "2026-07-29T12:00:00.000Z"), focused: true },
      reason: "current_sprint_is_focused"
    }
  ];

  for (const { current, reason } of cases) {
    assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
      appVersion: "1.4.0",
      currentSessionId: current.id,
      nowMs: NOW,
      sessions: [...prior, current],
      timeZone: "UTC"
    })), reason);
  }
});

test("same-version and 120-day cooldown gates both fail closed", () => {
  const sessions = [
    successfulSprint("one", "2026-07-27T12:00:00.000Z"),
    successfulSprint("two", "2026-07-27T13:00:00.000Z"),
    successfulSprint("three", "2026-07-28T12:00:00.000Z"),
    successfulSprint("four", "2026-07-29T12:00:00.000Z")
  ];

  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "four",
    lastAttempt: {
      appVersion: "1.4.0",
      attemptedAt: new Date(NOW - APP_REVIEW_REQUEST_COOLDOWN_MS).toISOString()
    },
    nowMs: NOW,
    sessions,
    timeZone: "UTC"
  })), "same_app_version");

  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "four",
    lastAttempt: {
      appVersion: "1.3.0",
      attemptedAt: new Date(NOW - APP_REVIEW_REQUEST_COOLDOWN_MS + 1).toISOString()
    },
    nowMs: NOW,
    sessions,
    timeZone: "UTC"
  })), "cooldown_active");

  assert.equal(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "four",
    lastAttempt: {
      appVersion: "1.3.0",
      attemptedAt: new Date(NOW - APP_REVIEW_REQUEST_COOLDOWN_MS).toISOString()
    },
    nowMs: NOW,
    sessions,
    timeZone: "UTC"
  }).eligible, true);

  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "four",
    lastAttempt: {
      appVersion: "1.3.0",
      attemptedAt: "not-a-date"
    },
    nowMs: NOW,
    sessions,
    timeZone: "UTC"
  })), "invalid_last_attempt");
});

function successfulSprint(
  id: string,
  completedAt: string
): AppReviewSprintRecord {
  return {
    id,
    completedAt,
    endReason: "target_reached",
    focused: false,
    rated: true,
    status: "won"
  };
}

function ineligibleReason(
  result: ReturnType<typeof evaluateAppReviewRequestEligibility>
): string {
  assert.equal(result.eligible, false);
  return result.eligible ? "unexpectedly_eligible" : result.reason;
}
