import test from "node:test";
import assert from "node:assert/strict";
import {
  isCanonicalLocalDataExport,
  isCanonicalProgressSyncSnapshot
} from "../src/local-data-export-validation.ts";

test("accepts the complete current progress sync contract", () => {
  const snapshot = canonicalSnapshot();
  assert.equal(isCanonicalProgressSyncSnapshot(snapshot), true);
  assert.equal(isCanonicalLocalDataExport(snapshot.data), true);
});

test("accepts documented optional legacy fields", () => {
  const snapshot = canonicalSnapshot();
  delete snapshot.data.settings.sprintGuides.focusedRunSeen;
  delete snapshot.data.reviewRemovals;
  delete snapshot.data.sprintSessions[0].config.puzzleTiming;
  delete snapshot.data.sprintSessions[0].ratingGamesBefore;
  delete snapshot.data.sprintSessions[0].ratingDeviationBefore;
  delete snapshot.data.sprintSessions[0].volatilityBefore;
  delete snapshot.data.practiceRuns[0].puzzleTiming;
  assert.equal(isCanonicalProgressSyncSnapshot(snapshot), true);
});

test("accepts exported synthetic review session configs", () => {
  const snapshot = canonicalSnapshot();
  snapshot.data.sprintSessions[0].config = {
    source: "scheduled_review",
    mode: "standard",
    ratingKey: "standard 5/20"
  };
  assert.equal(isCanonicalProgressSyncSnapshot(snapshot), true);
});

test("accepts an Incomplete Sprint attempt without a submitted move", () => {
  const snapshot = canonicalSnapshot();
  snapshot.data.attempts[0].result = "incomplete";
  delete snapshot.data.attempts[0].submittedMove;
  snapshot.data.attempts[0].unclear = true;
  snapshot.data.attempts[0].unclearUpdatedAt = "2026-07-26T12:00:01.000Z";

  assert.equal(isCanonicalProgressSyncSnapshot(snapshot), true);
});

test("rejects malformed nested progress records", () => {
  const cases = [
    ["snapshot device", (value) => { value.deviceId = ""; }],
    ["settings", (value) => { value.data.settings.sync.iCloudEnabled = "yes"; }],
    ["rating", (value) => { value.data.ratings[0].games = "one"; }],
    ["attempt", (value) => { value.data.attempts[0].source = "unknown"; }],
    ["review", (value) => { value.data.reviewQueue[0].lastResult = "timed_out"; }],
    ["removal", (value) => { value.data.reviewRemovals[0].removedAt = "not-a-date"; }],
    ["session", (value) => { value.data.sprintSessions[0].config.durationSeconds = 0; }],
    ["session rating games", (value) => { value.data.sprintSessions[0].ratingGamesBefore = 0.5; }],
    ["session rating deviation", (value) => { value.data.sprintSessions[0].ratingDeviationBefore = 0; }],
    ["session volatility", (value) => { value.data.sprintSessions[0].volatilityBefore = -0.06; }],
    ["partial session rating anchor", (value) => {
      delete value.data.sprintSessions[0].volatilityBefore;
    }],
    ["run", (value) => { value.data.practiceRuns[0].archived = "no"; }]
  ];
  for (const [label, mutate] of cases) {
    const candidate = canonicalSnapshot();
    mutate(candidate);
    assert.equal(
      isCanonicalProgressSyncSnapshot(candidate),
      false,
      `${label} should fail validation`
    );
  }
});

function canonicalSnapshot() {
  return {
    schemaVersion: 1,
    deviceId: "device-1",
    updatedAt: "2026-07-26T12:00:00.000Z",
    data: {
      schemaVersion: 1,
      settings: {
        sync: { iCloudEnabled: true },
        notifications: { reviewReminder: { mode: "smart" } },
        moveFeedback: { soundEnabled: true, hapticsEnabled: true },
        sprintGuides: {
          rulesSeen: true,
          activeSessionSeen: true,
          arrowDuelSeen: true,
          focusedRunSeen: true
        }
      },
      ratings: [{
        key: "standard 5/20",
        generation: 0,
        rating: 1200,
        ratingDeviation: 80,
        volatility: 0.06,
        games: 1
      }],
      attempts: [{
        id: "attempt-1",
        source: "sprint",
        sessionId: "session-1",
        puzzleId: "puzzle-1",
        mode: "standard",
        ratingKey: "standard 5/20",
        result: "correct",
        submittedMove: "e2e4",
        expectedMove: "e2e4",
        startedAt: "2026-07-26T11:59:55.000Z",
        completedAt: "2026-07-26T12:00:00.000Z",
        elapsedMs: 5000,
        ratingBefore: 1200,
        ratingAfter: 1210,
        unclear: false
      }],
      reviewQueue: [{
        puzzleId: "puzzle-1",
        mode: "standard",
        ratingKey: "standard 5/20",
        dueDay: "2026-07-27",
        intervalDays: 1,
        reviewCount: 1,
        successStreak: 1,
        lapseCount: 0,
        lastResult: "correct",
        lastReviewedAt: "2026-07-26T12:00:00.000Z",
        dueAt: "2026-07-27T04:00:00.000Z",
        intervalHours: 24
      }],
      reviewRemovals: [{
        puzzleId: "puzzle-2",
        mode: "standard",
        ratingKey: "standard 5/20",
        removedAt: "2026-07-26T12:00:00.000Z"
      }],
      sprintSessions: [{
        id: "session-1",
        mode: "standard",
        ratingKey: "standard 5/20",
        ratingGeneration: 0,
        startedAt: "2026-07-26T11:55:00.000Z",
        completedAt: "2026-07-26T12:00:00.000Z",
        status: "won",
        correctCount: 1,
        mistakeCount: 0,
        ratingBefore: 1200,
        ratingAfter: 1210,
        ratingGamesBefore: 0,
        ratingDeviationBefore: 100,
        volatilityBefore: 0.06,
        run: { id: "standard", kind: "standard", name: "Standard" },
        config: {
          mode: "standard",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          puzzleTiming: {
            slowAfterSeconds: 40,
            timeoutAfterSeconds: 60
          },
          targetCorrect: 1,
          maxMistakes: 3,
          ratingKey: "standard 5/20"
        }
      }],
      practiceRuns: [{
        id: "standard",
        kind: "standard",
        name: "Standard",
        mode: "standard",
        ratingKey: "standard 5/20",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: 60
        },
        targetCorrect: 10,
        maxMistakes: 3,
        homeOrder: 0,
        archived: false,
        updatedAt: "2026-07-26T12:00:00.000Z"
      }]
    }
  };
}
