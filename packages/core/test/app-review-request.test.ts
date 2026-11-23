import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_REVIEW_REQUEST_COOLDOWN_MS,
  evaluateAppReviewRequestEligibility,
  type AppReviewSprintRecord
} from "../src/index.ts";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

test("the second successful puzzle Sprint across a second local date is eligible", () => {
  const sessions = [
    successfulSprint("one", "2026-07-27T17:00:00.000Z"),
    successfulSprint("two", "2026-07-28T17:00:00.000Z")
  ];

  assert.deepEqual(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "two",
    nowMs: NOW,
    sessions,
    timeZone: "America/Los_Angeles"
  }), {
    eligible: true,
    successfulSprintCount: 2,
    successfulLocalDateCount: 2
  });
});

test("the third successful puzzle Sprint on a single local date is eligible", () => {
  const sessions = [
    successfulSprint("one", "2026-07-29T01:00:00.000Z"),
    successfulSprint("two", "2026-07-29T02:00:00.000Z"),
    successfulSprint("three", "2026-07-29T03:00:00.000Z")
  ];

  assert.deepEqual(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "three",
    nowMs: NOW,
    sessions,
    timeZone: "UTC"
  }), {
    eligible: true,
    successfulSprintCount: 3,
    successfulLocalDateCount: 1
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

test("one win or two wins on a single local date remain ineligible", () => {
  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "one",
    nowMs: NOW,
    sessions: [successfulSprint("one", "2026-07-29T12:00:00.000Z")],
    timeZone: "UTC"
  })), "not_enough_successful_sprints");

  const twoSameDate = [
    successfulSprint("one", "2026-07-29T01:00:00.000Z"),
    successfulSprint("two", "2026-07-29T02:00:00.000Z")
  ];
  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "two",
    nowMs: NOW,
    sessions: twoSameDate,
    timeZone: "UTC"
  })), "not_enough_successful_sprints");
});

test("unrated Sprints, high-accuracy Focused Runs, and strong Survival Runs are eligible", () => {
  const prior = [successfulSprint("one", "2026-07-28T12:00:00.000Z")];

  const positiveModes: AppReviewSprintRecord[] = [
    {
      ...successfulSprint("unrated-custom", "2026-07-29T12:00:00.000Z"),
      rated: false
    },
    {
      ...successfulSprint("focused-good", "2026-07-29T12:00:00.000Z"),
      focused: true,
      rated: false,
      correctCount: 9,
      mistakeCount: 6,
      endReason: "attempt_limit"
    },
    {
      ...successfulSprint("survival-10", "2026-07-29T12:00:00.000Z"),
      rated: false,
      survival: true,
      correctCount: 10,
      mistakeCount: 3,
      targetCorrect: 200,
      endReason: "max_mistakes"
    },
    {
      ...successfulSprint("survival-pool-cleared", "2026-07-29T12:00:00.000Z"),
      rated: false,
      survival: true,
      correctCount: 6,
      mistakeCount: 0,
      targetCorrect: 6,
      endReason: "pool_cleared"
    }
  ];

  for (const current of positiveModes) {
    assert.deepEqual(evaluateAppReviewRequestEligibility({
      appVersion: "1.4.0",
      currentSessionId: current.id,
      nowMs: NOW,
      sessions: [...prior, current],
      timeZone: "UTC"
    }), {
      eligible: true,
      successfulSprintCount: 2,
      successfulLocalDateCount: 2
    });
  }
});

test("failed, timed-out, abandoned, active, low-accuracy Focused, and low-score Survival results are suppressed", () => {
  const prior = [
    successfulSprint("one", "2026-07-27T12:00:00.000Z"),
    successfulSprint("two", "2026-07-28T12:00:00.000Z")
  ];
  const cases: AppReviewSprintRecord[] = [
    { ...successfulSprint("failed", "2026-07-29T12:00:00.000Z"), status: "failed" },
    {
      ...successfulSprint("timed-out", "2026-07-29T12:00:00.000Z"),
      status: "failed",
      endReason: "time_expired"
    },
    { ...successfulSprint("abandoned", "2026-07-29T12:00:00.000Z"), status: "abandoned" },
    { ...successfulSprint("active", "2026-07-29T12:00:00.000Z"), status: "active" },
    {
      ...successfulSprint("focused-low-accuracy", "2026-07-29T12:00:00.000Z"),
      focused: true,
      rated: false,
      correctCount: 8,
      mistakeCount: 7,
      endReason: "attempt_limit"
    },
    {
      ...successfulSprint("focused-missing-counts", "2026-07-29T12:00:00.000Z"),
      focused: true,
      rated: false
    },
    {
      ...successfulSprint("survival-low-score", "2026-07-29T12:00:00.000Z"),
      rated: false,
      survival: true,
      correctCount: 9,
      mistakeCount: 3,
      targetCorrect: 200,
      endReason: "max_mistakes"
    },
    {
      ...successfulSprint("survival-zero", "2026-07-29T12:00:00.000Z"),
      rated: false,
      survival: true,
      correctCount: 0,
      mistakeCount: 3,
      targetCorrect: 200,
      endReason: "max_mistakes"
    }
  ];

  for (const current of cases) {
    assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
      appVersion: "1.4.0",
      currentSessionId: current.id,
      nowMs: NOW,
      sessions: [...prior, current],
      timeZone: "UTC"
    })), "current_sprint_not_successful", current.id);
  }
});

test("30-day cooldown gate suppresses before 30 days and allows again at 30 days", () => {
  assert.equal(APP_REVIEW_REQUEST_COOLDOWN_MS, 30 * 24 * 60 * 60 * 1000);

  const sessions = [
    successfulSprint("one", "2026-07-28T12:00:00.000Z"),
    successfulSprint("two", "2026-07-29T12:00:00.000Z")
  ];

  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "two",
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
    currentSessionId: "two",
    lastAttempt: {
      appVersion: "1.4.0",
      attemptedAt: new Date(NOW - APP_REVIEW_REQUEST_COOLDOWN_MS).toISOString()
    },
    nowMs: NOW,
    sessions,
    timeZone: "UTC"
  }).eligible, true);

  assert.equal(evaluateAppReviewRequestEligibility({
    appVersion: "1.5.0",
    currentSessionId: "two",
    lastAttempt: {
      appVersion: "1.4.0",
      attemptedAt: new Date(NOW - APP_REVIEW_REQUEST_COOLDOWN_MS).toISOString()
    },
    nowMs: NOW,
    sessions,
    timeZone: "UTC"
  }).eligible, true);

  assert.equal(ineligibleReason(evaluateAppReviewRequestEligibility({
    appVersion: "1.4.0",
    currentSessionId: "two",
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
