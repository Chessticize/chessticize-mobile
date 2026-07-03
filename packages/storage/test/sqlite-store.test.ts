import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PracticeService, SQLiteStore } from "../src/index.ts";
import type { Puzzle, ReviewContext } from "../../core/src/index.ts";

test("SQLite store seeds fixture puzzles and filters Arrow Duel eligibility", async () => {
  const store = await seededStore();
  try {
    assert.equal(store.countPuzzles(), 4);
    assert.equal(store.getPuzzle("00008")?.stockfishBestMove, "b2b1");

    const arrowPuzzles = store.selectPuzzles({ mode: "arrow_duel", limit: 10 });
    assert.deepEqual(arrowPuzzles.map((puzzle) => puzzle.id).sort(), ["00008", "0018S", "001h8"]);

    const themePuzzles = store.selectPuzzles({ mode: "standard", limit: 10, theme: "hangingPiece" });
    assert.deepEqual(themePuzzles.map((puzzle) => puzzle.id), ["00008"]);
  } finally {
    store.close();
  }
});

test("SQLite store does not select duplicate puzzle positions for one sprint", async () => {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const puzzles = await loadFixturePuzzles();
  try {
    store.seedPuzzles([
      puzzles[0] as Puzzle,
      {
        ...(puzzles[0] as Puzzle),
        id: "00008-copy",
        initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 37 91"
      },
      puzzles[1] as Puzzle
    ]);

    const selected = store.selectPuzzles({ mode: "standard", limit: 3 });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["000hf", "00008"]);
  } finally {
    store.close();
  }
});

test("SQLite store can scope future puzzle selection without deleting seeded puzzles", async () => {
  const store = await seededStore();
  try {
    const selected = store.selectPuzzles({
      mode: "standard",
      limit: 10,
      includeIds: ["000hf"],
      rating: 1500
    });

    assert.deepEqual(selected.map((puzzle) => puzzle.id), ["000hf"]);
    assert.equal(store.getPuzzle("00008")?.id, "00008");
  } finally {
    store.close();
  }
});

test("SQLite persists Arrow Duel attempt candidate order across reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-arrow-order-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const store = new SQLiteStore(dbPath);
    store.migrate();
    store.seedPuzzles(await loadFixturePuzzles());
    const service = new PracticeService(store);
    const sprint = service.startSprint(
      {
        mode: "arrow_duel",
        durationSeconds: 300,
        perPuzzleSeconds: 30,
        targetCorrect: 1,
        maxMistakes: 3,
        minRating: 1700,
        maxRating: 1800
      },
      "2026-06-20T00:00:00.000Z"
    );
    const currentPuzzle = sprint.currentPuzzle;
    assert.equal(currentPuzzle?.kind, "arrow_duel");
    const candidateOrder = currentPuzzle?.kind === "arrow_duel" ? currentPuzzle.candidates : [];

    const result = service.submitMove("f2g3", "2026-06-20T00:00:05.000Z");
    assert.deepEqual(result.attempt?.arrowDuelCandidateOrder, candidateOrder);
    store.close();

    const reopened = new SQLiteStore(dbPath);
    reopened.migrate();
    try {
      assert.deepEqual(reopened.listAttempts({ result: "wrong" })[0]?.arrowDuelCandidateOrder, candidateOrder);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("SQLite migration adds Arrow Duel candidate order to existing attempts tables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-arrow-order-migration-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'sprint',
        session_id TEXT NOT NULL,
        puzzle_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        rating_key TEXT,
        result TEXT NOT NULL,
        submitted_move TEXT NOT NULL,
        expected_move TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        rating_before INTEGER NOT NULL,
        rating_after INTEGER
      );
    `);
    legacyDb.close();

    const store = new SQLiteStore(dbPath);
    store.migrate();
    store.close();

    const migratedDb = new DatabaseSync(dbPath);
    const columns = migratedDb.prepare("PRAGMA table_info(attempts)").all() as Array<{ name: string }>;
    migratedDb.close();
    assert.ok(columns.some((column) => column.name === "arrow_duel_candidate_order_json"));
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("PracticeService selects SQLite sprint puzzles from the current run ELO window", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    store.saveRating({ key: "standard 5/20", generation: 0, rating: 1800, games: 3 });

    const sprint = service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );

    assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");
  } finally {
    store.close();
  }
});

test("PracticeService exposes current-session mistake review items from SQLite history", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    const sprint = service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    const result = service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    assert.equal(result.state.status, "failed");
    assert.equal(store.listAttempts({ sessionId: sprint.id, result: "wrong" }).length, 1);
    const review = service.getSessionMistakeReview(sprint.id);
    assert.equal(review.length, 1);
    assert.equal(review[0]?.puzzle.id, "000hf");
    assert.equal(review[0]?.attempt.submittedMove, "c4b5");
  } finally {
    store.close();
  }
});

test("PracticeService builds SQLite history view for a required time range and rating key", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    assert.deepEqual(service.listPlayedRatings(), []);

    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    const view = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "7d",
      ratingKey: "standard 5/20",
      result: "wrong",
      theme: "mate"
    });

    assert.deepEqual(
      view.ratingKeys.map((rating) => rating.key),
      ["standard 5/20"]
    );
    assert.deepEqual(
      service.listPlayedRatings().map((rating) => rating.key),
      ["standard 5/20"]
    );
    assert.equal(view.attempts.length, 1);
    assert.equal(view.attempts[0]?.ratingKey, "standard 5/20");
    assert.equal(view.attempts[0]?.puzzleId, "000hf");
    assert.equal(view.attempts[0]?.puzzleRating, 1485);
    assert.equal(service.getHistoryView({ ...view.query, maxRating: 1485 }).attempts.length, 1);
    assert.equal(service.getHistoryView({ ...view.query, minRating: 1486 }).attempts.length, 0);
    assert.ok(view.availableThemes.includes("mate"));
    assert.equal(view.elo.length, 1);
    assert.deepEqual(view.puzzleStats, [
      {
        puzzleId: "000hf",
        mode: "standard",
        ratingKey: "standard 5/20",
        correctCount: 0,
        wrongCount: 1,
        lastWrongAt: "2026-06-20T00:00:05.000Z",
        nextReviewAt: "2026-06-21T00:00:05.000Z"
      }
    ]);

    const oppositeSide = view.attempts[0]?.side === "white" ? "black" : "white";
    assert.equal(service.getHistoryView({ ...view.query, side: oppositeSide }).attempts.length, 0);
    assert.equal(service.getDueReviewItems("2026-06-21T00:00:05.000Z")[0]?.puzzle.id, "000hf");
    assert.deepEqual(
      service.getHistoryView({ ...view.query, reviewStatus: "queued" }).attempts.map((attempt) => attempt.id),
      view.attempts.map((attempt) => attempt.id)
    );
    assert.deepEqual(service.getHistoryView({ ...view.query, reviewStatus: "clear" }).attempts, []);

    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "c4b5",
      expectedMove: "c4b5",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");
    assert.equal(store.listAttempts({ source: "scheduled_review", result: "correct" }).length, 1);

    service.resetRating("standard 5/20");
    assert.deepEqual(
      service.listPlayedRatings().map((rating) => rating.key),
      ["standard 5/20"]
    );
  } finally {
    store.close();
  }
});

test("PracticeService persists SQLite custom sprint configs after successful custom starts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      {
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece",
        persistCustomConfig: true
      },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");
    service.startSprint(
      {
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece",
        persistCustomConfig: true
      },
      "2026-06-21T00:00:00.000Z"
    );

    assert.deepEqual(service.getActiveSprint()?.puzzles.map((puzzle) => puzzle.id), ["00008"]);
    assert.deepEqual(service.listCustomSprintConfigs(), [
      {
        id: "custom-custom-300-20-hangingPiece",
        mode: "custom",
        ratingKey: "hangingPiece custom 5/20",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece",
        lastStartedAt: "2026-06-21T00:00:00.000Z",
        playCount: 2
      }
    ]);
  } finally {
    store.close();
  }
});

test("PracticeService persists SQLite settings across store reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-mobile-settings-"));
  const databasePath = join(directory, "settings.sqlite");
  try {
    {
      const store = new SQLiteStore(databasePath);
      store.migrate();
      const service = new PracticeService(store);
      try {
        assert.deepEqual(service.getSettings(), {
          sync: {
            iCloudEnabled: true,
            uploadAllowed: false
          },
          notifications: {
            reviewReminder: {
              mode: "smart"
            }
          }
        });

        service.saveSettings({
          sync: {
            iCloudEnabled: false,
            uploadAllowed: true
          },
          notifications: {
            reviewReminder: {
              mode: "fixed",
              fixedLocalTime: "20:30"
            }
          }
        });

        assert.deepEqual(service.saveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "08:15" }), {
          mode: "fixed",
          fixedLocalTime: "08:15"
        });
        assert.deepEqual(service.getReviewReminderSettings(), { kind: "fixed", hour: 8, minute: 15 });
      } finally {
        store.close();
      }
    }

    {
      const store = new SQLiteStore(databasePath);
      store.migrate();
      const service = new PracticeService(store);
      try {
        assert.deepEqual(service.getSettings(), {
          sync: {
            iCloudEnabled: false,
            uploadAllowed: true
          },
          notifications: {
            reviewReminder: {
              mode: "fixed",
              fixedLocalTime: "08:15"
            }
          }
        });
        assert.deepEqual(service.getReviewReminderPreference(), { mode: "fixed", fixedLocalTime: "08:15" });
        assert.deepEqual(service.getReviewReminderSettings(), { kind: "fixed", hour: 8, minute: 15 });
        assert.deepEqual(service.saveReviewReminderPreference({ mode: "off" }), { mode: "off" });
        assert.deepEqual(service.getSettings().notifications.reviewReminder, { mode: "off" });
        assert.deepEqual(service.exportLocalData().settings, service.getSettings());
      } finally {
        store.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PracticeService clears SQLite local history without resetting ratings or puzzles", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "c4b5",
      expectedMove: "c4b5",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");

    assert.equal(store.countPuzzles(), 4);
    assert.equal((service.listHistory() as unknown[]).length, 2);
    assert.equal(service.getDueReviewItems("2026-06-25T00:00:00.000Z").length, 1);
    const exported = service.exportLocalData();
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.attempts.length, 2);
    assert.equal(exported.reviewQueue.length, 1);
    assert.equal(exported.sprintSessions.length, 2);
    assert.deepEqual(exported.ratings.map((rating) => rating.key), ["standard 5/20"]);
    const ratingBefore = service.getRating("standard 5/20");

    const result = service.clearLocalHistory();

    assert.deepEqual(result, {
      attempts: 2,
      reviewEvents: 1,
      reviewQueue: 1,
      sprintSessions: 2
    });
    assert.equal(store.countPuzzles(), 4);
    assert.deepEqual(service.listHistory(), []);
    assert.deepEqual(service.getDueReviewItems("2026-06-21T00:00:05.000Z"), []);
    assert.deepEqual(service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20"
    }).attempts, []);
    assert.deepEqual(service.getRating("standard 5/20"), ratingBefore);
  } finally {
    store.close();
  }
});

test("PracticeService records official SQLite reviews in history without mixing queue contexts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    service.recordReviewAttempt({
      puzzleId: "000hf",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      submittedMove: "c4b5",
      expectedMove: "c4b5",
      startedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:00:05.000Z");

    const all = service.getHistoryView({
      now: "2026-06-22T00:00:00.000Z",
      timeRange: "7d",
      ratingKey: "standard 5/20"
    });
    assert.deepEqual(all.attempts.map((attempt) => attempt.source), ["scheduled_review", "sprint"]);
    assert.deepEqual(
      service.getHistoryView({ ...all.query, source: "scheduled_review" }).attempts.map((attempt) => attempt.result),
      ["correct"]
    );
    assert.deepEqual(
      service.getHistoryView({ ...all.query, source: "scheduled_review" }).attempts.map((attempt) => ({
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt
      })),
      [{ startedAt: "2026-06-21T00:00:00.000Z", completedAt: "2026-06-21T00:00:05.000Z" }]
    );
    assert.deepEqual(
      service.getHistoryView({ ...all.query, source: "sprint" }).attempts.map((attempt) => attempt.result),
      ["wrong"]
    );

    store.recordReviewResult({ puzzleId: "000hf", mode: "arrow_duel", ratingKey: "arrow duel 5/30" }, "wrong", "2026-06-21T00:01:00.000Z");
    assert.deepEqual(
      store.getDueReviews("2026-06-25T00:00:00.000Z").map((review) => `${review.puzzleId}:${review.mode}:${review.ratingKey}`).sort(),
      ["000hf:arrow_duel:arrow duel 5/30", "000hf:standard:standard 5/20"]
    );
  } finally {
    store.close();
  }
});

test("PracticeService pages SQLite history over all available sprint attempts", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-05-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-05-20T00:00:05.000Z");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");

    const firstPage = service.getHistoryView({
      now: "2026-06-21T00:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20",
      page: { limit: 1 }
    });
    assert.deepEqual(firstPage.page, {
      limit: 1,
      offset: 0,
      total: 2,
      hasMore: true
    });
    assert.equal(firstPage.attempts[0]?.completedAt, "2026-06-20T00:00:05.000Z");

    const secondPage = service.getHistoryView({
      ...firstPage.query,
      page: { limit: 1, offset: 1 }
    });
    assert.deepEqual(secondPage.page, {
      limit: 1,
      offset: 1,
      total: 2,
      hasMore: false
    });
    assert.equal(secondPage.attempts[0]?.completedAt, "2026-05-20T00:00:05.000Z");
  } finally {
    store.close();
  }
});

test("PracticeService exposes the current rating for the selected sprint run", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    assert.equal(service.getRating("standard 5/20").rating, 600);

    const reset = service.resetRating("standard 5/20") as { generation: number; rating: number };

    assert.equal(reset.rating, 600);
    assert.equal(service.getRating("standard 5/20").generation, 1);
    const adjusted = service.setRating("standard 5/20", 725);
    assert.equal(adjusted.rating, 725);
    assert.equal(adjusted.generation, 2);
    assert.equal(service.getRating("standard 5/20").rating, 725);
    assert.throws(() => service.setRating("standard 5/20", 599), /at least 600/);
    assert.throws(() => service.setRating("standard 5/20", 700.5), /integer/);
  } finally {
    store.close();
  }
});

test("SQLite review result updates expand and contract the persisted review schedule", async () => {
  const store = await seededStore();
  try {
    const context = reviewContext("00008");
    store.scheduleMistakeReview(context, "2026-06-20T00:00:00.000Z");

    const success = store.recordReviewResult(context, "correct", "2026-06-21T00:00:00.000Z");
    assert.equal(success.dueAt, "2026-06-22T00:00:00.000Z");
    assert.equal(success.intervalHours, 24);
    assert.equal(success.successStreak, 1);

    const secondSuccess = store.recordReviewResult(context, "correct", "2026-06-22T00:00:00.000Z");
    assert.equal(secondSuccess.dueAt, "2026-06-25T00:00:00.000Z");
    assert.equal(secondSuccess.intervalHours, 72);
    assert.equal(secondSuccess.successStreak, 2);

    const wrong = store.recordReviewResult(context, "wrong", "2026-06-23T00:00:00.000Z");
    assert.equal(wrong.dueAt, "2026-06-23T06:00:00.000Z");
    assert.equal(wrong.successStreak, 0);
    assert.equal(wrong.lapseCount, 1);
  } finally {
    store.close();
  }
});

test("SQLite sprint misses do not count as failed scheduled review lapses", async () => {
  const store = await seededStore();
  try {
    const context = reviewContext("000hf");

    const firstMiss = store.scheduleMistakeReview(context, "2026-06-20T00:00:00.000Z");
    const repeatedMiss = store.scheduleMistakeReview(context, "2026-06-20T12:00:00.000Z");
    const failedReview = store.recordReviewResult(context, "wrong", "2026-06-21T12:00:00.000Z");

    assert.equal(firstMiss.reviewCount, 0);
    assert.equal(firstMiss.lapseCount, 0);
    assert.equal(repeatedMiss.reviewCount, 0);
    assert.equal(repeatedMiss.lapseCount, 0);
    assert.equal(repeatedMiss.dueAt, "2026-06-21T12:00:00.000Z");
    assert.equal(failedReview.reviewCount, 1);
    assert.equal(failedReview.lapseCount, 1);
  } finally {
    store.close();
  }
});

test("PracticeService prunes orphaned SQLite review queue rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-sqlite-orphan-"));
  const dbPath = join(dir, "practice.sqlite");
  try {
    const setupStore = new SQLiteStore(dbPath);
    setupStore.migrate();
    setupStore.seedPuzzles(await loadFixturePuzzles());
    setupStore.scheduleMistakeReview(reviewContext("000hf"), "2026-06-20T00:00:00.000Z");
    setupStore.close();

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec("PRAGMA foreign_keys = OFF");
    legacyDb
      .prepare(
        `INSERT INTO review_queue (
          puzzle_id,
          mode,
          rating_key,
          due_at,
          interval_hours,
          review_count,
          success_streak,
          lapse_count,
          last_result,
          last_reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "missing-puzzle",
        "standard",
        "standard 5/20",
        "2026-06-21T00:00:00.000Z",
        24,
        0,
        0,
        0,
        "wrong",
        "2026-06-20T00:00:00.000Z"
      );
    legacyDb.close();

    const store = new SQLiteStore(dbPath);
    const service = new PracticeService(store);
    try {
      assert.equal(service.listReviewQueue().length, 2);
      assert.equal(service.getDueReviewItems("2026-06-22T00:00:00.000Z").length, 1);
      assert.equal(service.pruneOrphanedReviewQueue(), 1);
      assert.deepEqual(service.listReviewQueue().map((review) => review.puzzleId), ["000hf"]);
      assert.equal(service.pruneOrphanedReviewQueue(), 0);
    } finally {
      store.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
test("SQLite review result without an existing queue row is counted once", async () => {
  const store = await seededStore();
  try {
    const wrong = store.recordReviewResult(reviewContext("00008"), "wrong", "2026-06-20T00:00:00.000Z");
    assert.equal(wrong.reviewCount, 1);
    assert.equal(wrong.lapseCount, 1);
    assert.equal(wrong.dueAt, "2026-06-21T00:00:00.000Z");

    const correct = store.recordReviewResult(reviewContext("000hf"), "correct", "2026-06-20T00:00:00.000Z");
    assert.equal(correct.reviewCount, 1);
    assert.equal(correct.successStreak, 1);
    assert.equal(correct.dueAt, "2026-06-21T00:00:00.000Z");
  } finally {
    store.close();
  }
});

test("SQLite transaction rolls back partial writes", async () => {
  const store = await seededStore();
  try {
    assert.throws(() => {
      store.transaction(() => {
        store.resetRating("standard 5/20");
        throw new Error("boom");
      });
    }, /boom/);

    assert.equal(store.getRating("standard 5/20").generation, 0);
  } finally {
    store.close();
  }
});

test("PracticeService persists wrong attempts, history filters, review queue, and rating reset generations", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );
    const result = service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    assert.equal(result.attempt?.result, "wrong");

    const wrongHistory = store.listAttempts({
      result: "wrong",
      since: "2026-06-19T00:00:00.000Z"
    });
    assert.equal(wrongHistory.length, 1);
    assert.equal(wrongHistory[0]?.puzzleId, "000hf");

    const futureDue = store.getDueReviews("2026-06-22T00:00:00.000Z");
    assert.equal(futureDue.length, 1);
    assert.equal(futureDue[0]?.puzzleId, "000hf");
    const fullQueue = service.listReviewQueue();
    assert.equal(fullQueue.length, 1);
    assert.equal(fullQueue[0]?.puzzleId, "000hf");
    assert.equal(service.getDueReviews("2026-06-20T12:00:00.000Z").length, 0);

    const rating = store.getRating("standard 5/20");
    const reset = store.resetRating("standard 5/20");
    assert.equal(reset.generation, rating.generation + 1);
    assert.equal(store.listAttempts({ result: "wrong" }).length, 1);
  } finally {
    store.close();
  }
});

test("PracticeService rejects starting a second sprint while one is active", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
      "2026-06-20T00:00:00.000Z"
    );

    assert.throws(
      () =>
        service.startSprint(
          { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 3 },
          "2026-06-20T00:00:01.000Z"
        ),
      /another sprint is active/
    );
  } finally {
    store.close();
  }
});

test("PracticeService records a completed sprint and persists updated ELO", async () => {
  const store = await seededStore();
  const service = new PracticeService(store);
  try {
    let sprint = service.startSprint(
      {
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 3,
        theme: "hangingPiece"
      },
      "2026-06-20T00:00:00.000Z"
    );
    assert.equal(sprint.currentPuzzle?.puzzle.id, "00008");

    let result = service.submitMove("e6e7", "2026-06-20T00:00:05.000Z");
    assert.equal(result.state.status, "active");
    result = service.submitMove("b3c1", "2026-06-20T00:00:10.000Z");
    assert.equal(result.state.status, "active");
    result = service.submitMove("h6c1", "2026-06-20T00:00:15.000Z");
    assert.equal(result.state.status, "won");

    const rating = store.getRating("hangingPiece standard 5/20");
    assert.ok(rating.rating > 600);
    assert.equal(rating.games, 1);
  } finally {
    store.close();
  }
});

async function seededStore(): Promise<SQLiteStore> {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  store.seedPuzzles(await loadFixturePuzzles());
  return store;
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  const contents = await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8");
  return JSON.parse(contents) as Puzzle[];
}

function reviewContext(puzzleId: string): ReviewContext {
  return {
    puzzleId,
    mode: "standard",
    ratingKey: "standard 5/20"
  };
}
