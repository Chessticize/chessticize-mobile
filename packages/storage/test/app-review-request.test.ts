import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP_REVIEW_REQUEST_COOLDOWN_MS,
  defaultSprintConfig,
  type SprintMode,
  type SprintState
} from "../../core/src/index.ts";
import {
  MemoryStore,
  PracticeService,
  SQLiteStore
} from "../src/index.ts";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

test("PracticeService derives eligibility from local Sprint history and records suppression locally", () => {
  const store = new MemoryStore();
  seedEligibleHistory(store);
  const service = new PracticeService(store);

  assert.equal(service.getAppReviewRequestEligibility(
    "two",
    "1.4.0",
    NOW,
    "UTC"
  ).eligible, true);

  assert.deepEqual(service.recordAppReviewRequestAttempt(
    "1.4.0",
    "2026-07-29T12:00:00.000Z"
  ), {
    appVersion: "1.4.0",
    attemptedAt: "2026-07-29T12:00:00.000Z"
  });
  const suppressed = service.getAppReviewRequestEligibility(
    "two",
    "1.4.0",
    NOW,
    "UTC"
  );
  assert.equal(
    suppressed.eligible ? "unexpectedly_eligible" : suppressed.reason,
    "cooldown_active"
  );

  assert.equal(service.getAppReviewRequestEligibility(
    "two",
    "1.4.0",
    NOW + APP_REVIEW_REQUEST_COOLDOWN_MS,
    "UTC"
  ).eligible, true);

  assert.equal(
    "appReviewRequestAttempt" in service.exportLocalData(),
    false
  );
  service.clearSyncedHistory("2026-07-29T12:00:00.000Z");
  assert.deepEqual(service.getAppReviewRequestAttempt(), {
    appVersion: "1.4.0",
    attemptedAt: "2026-07-29T12:00:00.000Z"
  });
});

test("PracticeService maps Focused and Survival counts into review eligibility", () => {
  const store = new MemoryStore();
  store.createSprintSession(successfulSprint("one", "2026-07-28T12:00:00.000Z", "standard"));
  const { ratingAfter: _strongRating, ...strongBase } = successfulSprint(
    "survival-strong",
    "2026-07-29T12:00:00.000Z",
    "standard"
  );
  store.createSprintSession({
    ...strongBase,
    correctCount: 10,
    mistakeCount: 3,
    config: {
      ...defaultSprintConfig("standard"),
      ratingPolicy: "unrated",
      targetCorrect: 200,
      survival: {
        challengeType: "puzzle",
        ruleVersion: 1,
        minRating: 1000,
        maxRating: 1100,
        ratingSourceRunId: "standard",
        ratingSourceRating: 1050,
        ratingSourceGeneration: 0,
        packVersion: 1,
        packHash: "hash",
        eligibleCount: 200,
        selectionSeed: "seed"
      }
    }
  });
  const { ratingAfter: _weakRating, ...weakBase } = successfulSprint(
    "survival-weak",
    "2026-07-29T13:00:00.000Z",
    "standard"
  );
  store.createSprintSession({
    ...weakBase,
    correctCount: 4,
    mistakeCount: 3,
    config: {
      ...defaultSprintConfig("standard"),
      ratingPolicy: "unrated",
      targetCorrect: 200,
      survival: {
        challengeType: "puzzle",
        ruleVersion: 1,
        minRating: 1000,
        maxRating: 1100,
        ratingSourceRunId: "standard",
        ratingSourceRating: 1050,
        ratingSourceGeneration: 0,
        packVersion: 1,
        packHash: "hash",
        eligibleCount: 200,
        selectionSeed: "seed"
      }
    }
  });
  const { ratingAfter: _focusedRating, ...focusedBase } = successfulSprint(
    "focused-strong",
    "2026-07-29T14:00:00.000Z",
    "custom"
  );
  store.createSprintSession({
    ...focusedBase,
    correctCount: 10,
    mistakeCount: 5,
    endReason: "attempt_limit",
    config: {
      ...defaultSprintConfig("custom"),
      ratingPolicy: "unrated",
      runClock: "untimed",
      maxAttempts: 15,
      tacticalFocus: {
        taskFamily: "line",
        themes: ["fork"],
        mixedControlCount: 3,
        ratingAnchor: 1000,
        minRating: 850,
        maxRating: 1150
      }
    }
  });
  const service = new PracticeService(store);

  assert.equal(service.getAppReviewRequestEligibility(
    "survival-strong",
    "1.4.0",
    NOW,
    "UTC"
  ).eligible, true);
  assert.equal(service.getAppReviewRequestEligibility(
    "focused-strong",
    "1.4.0",
    NOW,
    "UTC"
  ).eligible, true);
  assert.equal(service.getAppReviewRequestEligibility(
    "survival-weak",
    "1.4.0",
    NOW,
    "UTC"
  ).eligible, false);
});

test("SQLite persists the review-request suppression state across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-app-review-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const first = new SQLiteStore(databasePath);
    first.migrate();
    new PracticeService(first).recordAppReviewRequestAttempt(
      "1.4.0",
      "2026-07-29T12:00:00.000Z"
    );
    first.close();

    const reopened = new SQLiteStore(databasePath);
    reopened.migrate();
    try {
      assert.deepEqual(
        new PracticeService(reopened).getAppReviewRequestAttempt(),
        {
          appVersion: "1.4.0",
          attemptedAt: "2026-07-29T12:00:00.000Z"
        }
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("review-request attempt writes reject malformed local state", () => {
  const service = new PracticeService(new MemoryStore());
  assert.throws(
    () => service.recordAppReviewRequestAttempt("", "2026-07-29T12:00:00.000Z"),
    /app version/
  );
  assert.throws(
    () => service.recordAppReviewRequestAttempt("1.4.0", "not-a-date"),
    /attempt time/
  );
});

function seedEligibleHistory(
  store: Pick<MemoryStore, "createSprintSession">
): void {
  store.createSprintSession(successfulSprint("one", "2026-07-28T12:00:00.000Z", "standard"));
  store.createSprintSession(successfulSprint("two", "2026-07-29T12:00:00.000Z", "arrow_duel"));
}

function successfulSprint(
  id: string,
  completedAt: string,
  mode: SprintMode
): SprintState {
  return {
    id,
    config: defaultSprintConfig(mode),
    status: "won",
    startedAt: completedAt,
    deadlineAt: completedAt,
    completedAt,
    endReason: "target_reached",
    correctCount: 1,
    mistakeCount: 0,
    currentStreak: 1,
    bestStreak: 1,
    hasUserSubmittedMove: true,
    currentPuzzleIndex: 1,
    puzzles: [],
    ratingBefore: 600,
    ratingAfter: 620
  };
}
