import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Puzzle } from "../../core/src/index.ts";
import {
  CURRENT_SCHEMA_VERSION,
  MemoryStore,
  PracticeService,
  SQLiteStore,
  mergeLocalDataExports
} from "../src/index.ts";

process.env.TZ = "UTC";
const PUZZLE_FIXTURE = resolve("fixtures/puzzles/presolved-sample.json");

test("SQLite v16 preserves v9 settings while backfilling Run timing, rebuilding attempts, adding guides, and quieting feedback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-v10-timing-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE sprint_sessions (
        id TEXT PRIMARY KEY,
        run_id TEXT,
        run_name TEXT
      );

      CREATE TABLE app_settings (
        id TEXT PRIMARY KEY,
        sync_icloud_enabled INTEGER NOT NULL,
        sync_upload_allowed INTEGER NOT NULL,
        review_reminder_mode TEXT NOT NULL,
        review_reminder_fixed_local_time TEXT,
        move_feedback_sound_enabled INTEGER NOT NULL DEFAULT 1,
        move_feedback_haptics_enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE practice_runs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('standard', 'arrow_duel', 'custom')),
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        mode TEXT NOT NULL CHECK (mode IN ('standard', 'arrow_duel', 'custom')),
        rating_key TEXT NOT NULL UNIQUE,
        duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
        per_puzzle_seconds INTEGER NOT NULL CHECK (per_puzzle_seconds > 0),
        target_correct INTEGER NOT NULL CHECK (target_correct > 0),
        max_mistakes INTEGER NOT NULL CHECK (max_mistakes > 0),
        themes_json TEXT,
        home_order INTEGER NOT NULL CHECK (home_order >= 0),
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        updated_at TEXT NOT NULL
      );

      CREATE INDEX practice_runs_home_order_idx
        ON practice_runs(archived, home_order, id);
      CREATE INDEX practice_runs_updated_at_idx
        ON practice_runs(updated_at, id);

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
        rating_after INTEGER,
        arrow_duel_candidate_order_json TEXT,
        unclear INTEGER NOT NULL DEFAULT 0 CHECK (unclear IN (0, 1)),
        unclear_updated_at TEXT,
        FOREIGN KEY (session_id) REFERENCES sprint_sessions(id),
        FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
      );

      CREATE INDEX attempts_completed_at_id_idx
        ON attempts(completed_at DESC, id DESC);
      CREATE INDEX attempts_rating_key_completed_at_id_idx
        ON attempts(rating_key, completed_at DESC, id DESC);
      CREATE INDEX attempts_session_result_completed_at_id_idx
        ON attempts(session_id, result, completed_at DESC, id DESC);
      CREATE INDEX attempts_puzzle_id_completed_at_id_idx
        ON attempts(puzzle_id, completed_at DESC, id DESC);
      CREATE INDEX attempts_unclear_completed_at_idx
        ON attempts(unclear, completed_at DESC);

      INSERT INTO puzzles (id) VALUES ('legacy-puzzle');
      INSERT INTO sprint_sessions (id, run_id, run_name)
        VALUES ('legacy-session', 'legacy-run', 'Legacy Run');
      INSERT INTO practice_runs (
        id, kind, name, mode, rating_key, duration_seconds, per_puzzle_seconds,
        target_correct, max_mistakes, themes_json, home_order, archived, updated_at
      ) VALUES
        (
          'legacy-run', 'custom', 'Legacy Run', 'custom', 'legacy custom 5/20',
          300, 20, 15, 3, NULL, 2, 0, '2026-07-01T00:00:00.000Z'
        ),
        (
          'low-pace-run', 'custom', 'Low Pace Run', 'custom', 'legacy custom 5/1',
          300, 1, 300, 3, NULL, 3, 0, '2026-07-01T00:00:00.000Z'
        ),
        (
          'high-pace-run', 'custom', 'High Pace Run', 'custom', 'legacy custom 5/100',
          300, 100, 3, 3, NULL, 4, 0, '2026-07-01T00:00:00.000Z'
        );
      INSERT INTO attempts (
        id, source, session_id, puzzle_id, mode, rating_key, result,
        submitted_move, expected_move, started_at, completed_at,
        rating_before, rating_after, arrow_duel_candidate_order_json,
        unclear, unclear_updated_at
      ) VALUES (
        'legacy-attempt', 'sprint', 'legacy-session', 'legacy-puzzle', 'custom',
        'legacy custom 5/20', 'correct', 'e2e4', 'e2e4',
        '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:05.000Z',
        900, 910, NULL, 0, NULL
      );

      PRAGMA user_version = 8;
    `);
    legacy.close();

    const store = new SQLiteStore(databasePath);
    store.migrate();
    try {
      assert.equal(
        (store.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
        CURRENT_SCHEMA_VERSION
      );
      assert.deepEqual(store.getSettings().moveFeedback, {
        soundEnabled: false,
        hapticsEnabled: true
      });
      assert.deepEqual(store.getSettings().sprintGuides, {
        rulesSeen: false,
        activeSessionSeen: false,
        arrowDuelSeen: false,
        focusedRunSeen: false
      });
      assert.deepEqual(
        store.listPracticeRuns().map((run) => ({
          id: run.id,
          puzzleTiming: run.puzzleTiming
        })),
        [
          {
            id: "legacy-run",
            puzzleTiming: {
              slowAfterSeconds: 40,
              timeoutAfterSeconds: 60
            }
          },
          {
            id: "low-pace-run",
            puzzleTiming: {
              slowAfterSeconds: 10,
              timeoutAfterSeconds: 15
            }
          },
          {
            id: "high-pace-run",
            puzzleTiming: {
              slowAfterSeconds: 175,
              timeoutAfterSeconds: 180
            }
          }
        ]
      );
      assert.deepEqual(store.listAttempts(), [{
        id: "legacy-attempt",
        source: "sprint",
        sessionId: "legacy-session",
        puzzleId: "legacy-puzzle",
        mode: "custom",
        ratingKey: "legacy custom 5/20",
        result: "correct",
        submittedMove: "e2e4",
        expectedMove: "e2e4",
        startedAt: "2026-07-01T00:00:00.000Z",
        completedAt: "2026-07-01T00:00:05.000Z",
        ratingBefore: 900,
        ratingAfter: 910,
        runId: "legacy-run",
        runName: "Legacy Run"
      }]);

      const attemptColumns = store.db.prepare("PRAGMA table_info(attempts)").all() as Array<{
        name: string;
        notnull: number;
      }>;
      assert.equal(attemptColumns.find((column) => column.name === "submitted_move")?.notnull, 0);
      assert.ok(attemptColumns.some((column) => column.name === "elapsed_ms"));
      assert.ok(attemptColumns.some((column) => column.name === "timing_status"));
      assert.deepEqual(
        store.db.prepare("PRAGMA index_list(attempts)").all()
          .map((row) => (row as { name: string }).name)
          .filter((name) => !name.startsWith("sqlite_autoindex_"))
          .sort(),
        [
          "attempts_completed_at_id_idx",
          "attempts_puzzle_id_completed_at_id_idx",
          "attempts_rating_key_completed_at_id_idx",
          "attempts_session_result_completed_at_id_idx",
          "attempts_unclear_completed_at_idx"
        ]
      );
      assert.deepEqual(
        store.db.prepare("PRAGMA foreign_key_list(attempts)").all()
          .map((row) => ({
            table: (row as { table: string }).table,
            from: (row as { from: string }).from,
            to: (row as { to: string }).to
          }))
          .sort((left, right) => left.from.localeCompare(right.from)),
        [
          { table: "puzzles", from: "puzzle_id", to: "id" },
          { table: "sprint_sessions", from: "session_id", to: "id" }
        ]
      );
      assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      store.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const backend of ["memory", "sqlite"] as const) {
  test(`${backend} records a just-entered final puzzle as Incomplete and binds manual Unclear to it`, async () => {
    const store = backend === "memory" ? new MemoryStore() : new SQLiteStore(":memory:");
    if (store instanceof SQLiteStore) {
      store.migrate();
    }
    try {
      const service = new PracticeService(store);
      service.loadFixturePuzzles(await loadFixturePuzzles());
      service.setPuzzleSelectionScopeIds(["00008", "000hf"]);
      const run = service.createPracticeRun({
        id: `incomplete-${backend}`,
        name: `Incomplete ${backend}`,
        mode: "custom",
        durationSeconds: 60,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 40,
          timeoutAfterSeconds: null
        },
        initialRating: 1800
      }, "2026-07-24T00:00:00.000Z");
      let active = service.startSprint({
        mode: "custom",
        practiceRunId: run.id,
        targetCorrect: 3,
        puzzleSelectionSeed: `incomplete-${backend}`
      }, "2026-07-24T00:00:00.000Z");
      const firstPuzzleId = active.currentPuzzle?.puzzle.id;
      let submissionSecond = 57;
      while (active.status === "active" && active.currentPuzzle?.puzzle.id === firstPuzzleId) {
        const currentPuzzle = active.currentPuzzle;
        assert.equal(currentPuzzle?.kind, "line");
        const expectedMove = currentPuzzle?.kind === "line"
          ? currentPuzzle.puzzle.solutionMoves[currentPuzzle.cursor]
          : undefined;
        assert.ok(expectedMove);
        const result = service.submitMove(
          expectedMove,
          `2026-07-24T00:00:${String(submissionSecond).padStart(2, "0")}.000Z`
        );
        active = result.state;
        submissionSecond += 1;
      }
      const previousAttempt = service.listHistory()[0];
      assert.equal(previousAttempt?.result, "correct");
      assert.equal(previousAttempt?.timingStatus, "slow");
      assert.equal(previousAttempt?.unclear, true);

      const expired = service.advanceSprintTime("2026-07-24T00:01:05.000Z");
      const incompleteAttempt = expired.attempt ?? assert.fail("expected Incomplete attempt");
      assert.equal(incompleteAttempt.result, "incomplete");
      assert.equal(incompleteAttempt.puzzleId, active.currentPuzzle?.puzzle.id);
      assert.equal(incompleteAttempt.completedAt, "2026-07-24T00:01:00.000Z");
      assert.equal(incompleteAttempt.submittedMove, undefined);
      assert.equal(incompleteAttempt.timingStatus, undefined);
      assert.equal(incompleteAttempt.unclear, undefined);
      assert.equal(expired.state.correctCount, 1);
      assert.equal(expired.state.mistakeCount, 0);
      assert.deepEqual(service.listReviewQueue(), []);
      assert.deepEqual(
        service.getHistoryView({
          now: "2026-07-24T00:02:00.000Z",
          timeRange: "max",
          result: "incomplete"
        }).attempts.map((attempt) => attempt.id),
        [incompleteAttempt.id]
      );
      assert.deepEqual(
        service.getHistoryView({
          now: "2026-07-24T00:02:00.000Z",
          timeRange: "max",
          result: "wrong"
        }).attempts,
        []
      );

      const marked = service.setAttemptUnclear(
        incompleteAttempt.id,
        true,
        "2026-07-24T00:01:06.000Z"
      );
      assert.equal(marked.unclear, true);
      assert.equal(service.listHistory().find((attempt) => attempt.id === previousAttempt?.id)?.unclear, true);
      assert.deepEqual(service.getSprintResultSummary(expired.state), {
        accuracyPercent: 100,
        attemptCount: 1,
        unclear: {
          slowMarkedCount: 1,
          timedOutMarkedCount: 0,
          userMarkedCount: 1
        },
        review: {
          addedCount: 0,
          mistakeCount: 0,
          timedOutCount: 0
        }
      });
      assert.doesNotThrow(() => mergeLocalDataExports(
        service.exportLocalData(),
        service.exportLocalData()
      ));
      if (backend === "sqlite") {
        const replicaStore = new SQLiteStore(":memory:");
        replicaStore.migrate();
        try {
          const replica = new PracticeService(replicaStore);
          replica.loadFixturePuzzles(await loadFixturePuzzles());
          replica.importLocalData(service.exportLocalData());
          assert.deepEqual(
            replica.listHistory({ result: "incomplete" }).map((attempt) => ({
              id: attempt.id,
              submittedMove: attempt.submittedMove,
              unclear: attempt.unclear
            })),
            [{
              id: incompleteAttempt.id,
              submittedMove: undefined,
              unclear: true
            }]
          );
        } finally {
          replicaStore.close();
        }
      }
    } finally {
      if (store instanceof SQLiteStore) {
        store.close();
      }
    }
  });
}

test("a move submitted at the timeout boundary advances and records one timeout attempt", async () => {
  const store = new MemoryStore();
  const service = new PracticeService(store);
  service.loadFixturePuzzles(await loadFixturePuzzles());
  const started = service.startSprint({
    mode: "standard",
    practiceRunId: "standard",
    targetCorrect: 2,
    puzzleSelectionSeed: "late-move-timeout"
  }, "2026-07-24T00:30:00.000Z");
  const firstPuzzleId = started.currentPuzzle?.puzzle.id;

  const handoff = service.submitMove("e2e4", "2026-07-24T00:31:00.000Z");

  assert.equal(handoff.attempt?.result, "timed_out");
  assert.equal(handoff.attempt?.unclear, undefined);
  assert.equal(handoff.attempt?.unclearUpdatedAt, undefined);
  assert.equal(handoff.state.currentPuzzleIndex, 1);
  assert.notEqual(handoff.state.currentPuzzle?.puzzle.id, firstPuzzleId);
  assert.equal(store.listSprintSessions().length, 1);

  const repeatedTick = service.advanceSprintTime("2026-07-24T00:31:00.000Z");
  assert.equal(repeatedTick.attempt, undefined);
  assert.equal(repeatedTick.state.currentPuzzleIndex, 1);
  assert.equal(
    repeatedTick.state.currentPuzzle?.puzzle.id,
    handoff.state.currentPuzzle?.puzzle.id
  );
  assert.equal(store.listSprintSessions().length, 1);
  assert.equal(service.listHistory().filter((attempt) => attempt.result === "timed_out").length, 1);
  assert.deepEqual(service.listReviewQueue().map((review) => review.puzzleId), [firstPuzzleId]);
});

test("pausing at the puzzle deadline records one timeout and pauses the next puzzle", async () => {
  const store = new MemoryStore();
  const service = new PracticeService(store);
  service.loadFixturePuzzles(await loadFixturePuzzles());
  const started = service.startSprint({
    mode: "standard",
    practiceRunId: "standard",
    targetCorrect: 2,
    puzzleSelectionSeed: "pause-timeout"
  }, "2026-07-24T00:30:00.000Z");

  const paused = service.pauseSprint("2026-07-24T00:31:00.000Z");

  assert.equal(paused.state.status, "paused");
  assert.equal(paused.state.currentPuzzleIndex, 1);
  assert.notEqual(paused.state.currentPuzzle?.puzzle.id, started.currentPuzzle?.puzzle.id);
  assert.equal(paused.state.correctCount, 0);
  assert.equal(paused.state.mistakeCount, 1);
  assert.equal(paused.attempt?.result, "timed_out");
  assert.equal(paused.attempt?.puzzleId, started.currentPuzzle?.puzzle.id);
  assert.deepEqual(
    service.listHistory().map((attempt) => attempt.result),
    ["timed_out"]
  );
  assert.deepEqual(
    service.listReviewQueue().map((review) => review.puzzleId),
    [started.currentPuzzle?.puzzle.id]
  );
});

test("abandoning after the Sprint deadline settles Incomplete instead of overwriting it as abandoned", async () => {
  const service = new PracticeService(new MemoryStore());
  service.loadFixturePuzzles(await loadFixturePuzzles());
  const started = service.startSprint({
    mode: "standard",
    durationSeconds: 60,
    perPuzzleSeconds: 20,
    targetCorrect: 2,
    maxMistakes: 3
  }, "2026-07-24T00:30:00.000Z");

  const completed = service.abandonSprint("2026-07-24T00:31:01.000Z");

  assert.equal(completed.state.status, "failed");
  assert.equal(completed.state.endReason, "time_expired");
  assert.equal(completed.attempt?.result, "incomplete");
  assert.equal(completed.attempt?.puzzleId, started.currentPuzzle?.puzzle.id);
  assert.deepEqual(service.listHistory().map((attempt) => ({
    puzzleId: attempt.puzzleId,
    result: attempt.result
  })), [{
    puzzleId: started.currentPuzzle?.puzzle.id,
    result: "incomplete"
  }]);
  assert.deepEqual(service.listReviewQueue(), []);
});

for (const backend of ["memory", "sqlite"] as const) {
  test(`${backend} Run timing CRUD and timeout attempts round-trip through the public service`, async () => {
    const store = backend === "memory" ? new MemoryStore() : new SQLiteStore(":memory:");
    if (store instanceof SQLiteStore) {
      store.migrate();
    }
    try {
      const service = new PracticeService(store);
      service.loadFixturePuzzles(await loadFixturePuzzles());
      const custom = service.createPracticeRun({
        id: `timing-${backend}`,
        name: `Timing ${backend}`,
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: null,
          timeoutAfterSeconds: 75
        },
        initialRating: 900
      }, "2026-07-24T00:00:00.000Z");
      assert.deepEqual(custom.puzzleTiming, {
        slowAfterSeconds: null,
        timeoutAfterSeconds: 75
      });
      const ratingKey = custom.ratingKey;

      const updated = service.updatePracticeRun(custom.id, {
        name: custom.name,
        rating: 900,
        puzzleTiming: {
          slowAfterSeconds: 35,
          timeoutAfterSeconds: null
        }
      }, "2026-07-24T00:01:00.000Z");
      assert.equal(updated.run.ratingKey, ratingKey);
      assert.deepEqual(updated.run.puzzleTiming, {
        slowAfterSeconds: 35,
        timeoutAfterSeconds: null
      });

      const started = service.startSprint({
        mode: "standard",
        practiceRunId: "standard",
        targetCorrect: 2,
        puzzleSelectionSeed: `timeout-${backend}`
      }, "2026-07-24T01:00:00.000Z");
      const timedOutPuzzleId = started.currentPuzzle?.puzzle.id;
      const before = service.advanceSprintTime("2026-07-24T01:00:59.999Z");
      assert.equal(before.attempt, undefined);

      const timedOut = service.advanceSprintTime("2026-07-24T01:01:00.000Z");
      assert.equal(timedOut.attempt?.result, "timed_out");
      assert.equal(timedOut.attempt?.submittedMove, undefined);
      assert.equal(timedOut.attempt?.elapsedMs, 60_000);
      assert.equal(timedOut.attempt?.timingStatus, "timed_out");
      assert.equal(timedOut.attempt?.unclear, undefined);
      assert.equal(timedOut.attempt?.unclearUpdatedAt, undefined);
      assert.notEqual(timedOut.state.currentPuzzle?.puzzle.id, timedOutPuzzleId);
      assert.equal(timedOut.state.correctCount, 0);
      assert.equal(timedOut.state.mistakeCount, 1);
      assert.deepEqual(
        service.listReviewQueue().map((review) => review.puzzleId),
        [timedOutPuzzleId]
      );
      assert.deepEqual(
        service.getSessionMistakeReview(started.id).map((item) => item.puzzle.id),
        [timedOutPuzzleId]
      );
      assert.deepEqual(service.listHistory(), [{
        ...timedOut.attempt,
        runId: "standard",
        runName: "Standard"
      }]);
      assert.deepEqual(service.exportLocalData().attempts, service.listHistory());
      assert.deepEqual(service.getSprintResultSummary(timedOut.state), {
        accuracyPercent: 0,
        attemptCount: 1,
        unclear: {
          slowMarkedCount: 0,
          timedOutMarkedCount: 0,
          userMarkedCount: 0
        },
        review: {
          addedCount: 1,
          mistakeCount: 1,
          timedOutCount: 1
        }
      });
      assert.deepEqual(
        service.getPracticeProgressSummary(
          Date.parse("2026-07-24T01:01:00.000Z"),
          started.config.ratingKey
        ),
        {
          correctThisWeek: 0,
          accuracyThisWeek: 0,
          ratingDeltaThisWeek: null,
          wrongThisWeek: 1,
          netThisWeek: -1
        }
      );
      const timedOutAttemptId = timedOut.attempt?.id ?? assert.fail("expected timeout attempt");
      assert.equal(service.listHistory()[0]?.unclear, undefined);
      assert.deepEqual(service.getHistoryView({
        now: "2026-07-24T01:01:02.000Z",
        timeRange: "max",
        attentionOnly: true
      }).attempts.map((attempt) => attempt.id), [timedOutAttemptId]);
      assert.equal(
        service.advanceSprintTime("2026-07-24T01:01:00.000Z").attempt,
        undefined
      );
    } finally {
      if (store instanceof SQLiteStore) {
        store.close();
      }
    }
  });
}

for (const backend of ["memory", "sqlite"] as const) {
  test(`${backend} keeps a completed attempt Slow after its Run timing policy changes`, async () => {
    const store = backend === "memory" ? new MemoryStore() : new SQLiteStore(":memory:");
    if (store instanceof SQLiteStore) {
      store.migrate();
    }
    try {
      const service = new PracticeService(store);
      service.loadFixturePuzzles(await loadFixturePuzzles());
      const run = service.createPracticeRun({
        id: `persisted-slow-${backend}`,
        name: `Persisted Slow ${backend}`,
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 10,
          timeoutAfterSeconds: null
        },
        initialRating: 1800,
        themes: ["hangingPiece"]
      }, "2026-07-24T03:00:00.000Z");

      service.startSprint({
        mode: "custom",
        practiceRunId: run.id,
        targetCorrect: 1,
        puzzleSelectionSeed: `persisted-slow-${backend}`
      }, "2026-07-24T03:01:00.000Z");
      service.submitMove("e6e7", "2026-07-24T03:01:05.000Z");
      service.submitMove("b3c1", "2026-07-24T03:01:08.000Z");
      const completed = service.submitMove("h6c1", "2026-07-24T03:01:10.000Z");
      assert.equal(completed.attempt?.timingStatus, "slow");

      service.updatePracticeRun(run.id, {
        name: run.name,
        rating: 1800,
        puzzleTiming: {
          slowAfterSeconds: null,
          timeoutAfterSeconds: null
        }
      }, "2026-07-24T03:02:00.000Z");

      assert.equal(service.listHistory()[0]?.timingStatus, "slow");
      assert.equal(service.exportLocalData().attempts[0]?.timingStatus, "slow");
    } finally {
      if (store instanceof SQLiteStore) {
        store.close();
      }
    }
  });
}

test("SQLite reopens custom Run timing and a Timed out attempt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-timing-reopen-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const store = new SQLiteStore(databasePath);
    store.migrate();
    const service = new PracticeService(store);
    service.loadFixturePuzzles(await loadFixturePuzzles());
    const run = service.createPracticeRun({
      id: "reopen-timing-run",
      name: "Reopen Timing Run",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      puzzleTiming: {
        slowAfterSeconds: null,
        timeoutAfterSeconds: 75
      },
      initialRating: 1800,
      themes: ["hangingPiece"]
    }, "2026-07-24T01:30:00.000Z");
    service.startSprint({
      mode: "custom",
      practiceRunId: run.id,
      targetCorrect: 2,
      puzzleSelectionSeed: "reopen-timeout"
    }, "2026-07-24T01:31:00.000Z");
    service.advanceSprintTime("2026-07-24T01:32:15.000Z");
    store.close();

    const reopened = new SQLiteStore(databasePath);
    reopened.migrate();
    try {
      const reopenedService = new PracticeService(reopened);
      assert.deepEqual(
        reopenedService.listPracticeRuns().find((candidate) => candidate.id === run.id)?.puzzleTiming,
        {
          slowAfterSeconds: null,
          timeoutAfterSeconds: 75
        }
      );
      assert.deepEqual(
        reopenedService.listHistory().map((attempt) => ({
          result: attempt.result,
          submittedMove: attempt.submittedMove,
          elapsedMs: attempt.elapsedMs,
          timingStatus: attempt.timingStatus
        })),
        [{
          result: "timed_out",
          submittedMove: undefined,
          elapsedMs: 75_000,
          timingStatus: "timed_out"
        }]
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const backend of ["memory", "sqlite"] as const) {
  test(`${backend} imports schemaVersion 1 Runs and attempts without timing fields`, async () => {
    const source = new PracticeService(new MemoryStore());
    source.loadFixturePuzzles(await loadFixturePuzzles());
    const run = source.createPracticeRun({
      id: "legacy-timing-run",
      name: "Legacy Timing Run",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      themes: ["hangingPiece"],
      initialRating: 1800
    }, "2026-07-24T02:00:00.000Z");
    source.startSprint({
      mode: "custom",
      practiceRunId: run.id,
      targetCorrect: 1,
      puzzleSelectionSeed: "legacy-payload"
    }, "2026-07-24T02:01:00.000Z");
    source.submitMove("e6e7", "2026-07-24T02:01:05.000Z");
    source.submitMove("b3c1", "2026-07-24T02:01:08.000Z");
    source.submitMove("h6c1", "2026-07-24T02:01:10.000Z");

    const legacy = structuredClone(source.exportLocalData());
    for (const legacyRun of legacy.practiceRuns) {
      delete legacyRun.puzzleTiming;
    }
    for (const session of legacy.sprintSessions) {
      if (session.config) {
        delete session.config.puzzleTiming;
      }
    }
    for (const attempt of legacy.attempts) {
      delete attempt.elapsedMs;
      delete attempt.timingStatus;
    }
    assert.equal(legacy.schemaVersion, 1);

    const store = backend === "memory" ? new MemoryStore() : new SQLiteStore(":memory:");
    if (store instanceof SQLiteStore) {
      store.migrate();
    }
    try {
      const destination = new PracticeService(store);
      destination.loadFixturePuzzles(await loadFixturePuzzles());
      destination.importLocalData(legacy);

      assert.deepEqual(
        destination.listPracticeRuns().find((candidate) => candidate.id === run.id)?.puzzleTiming,
        {
          slowAfterSeconds: 60,
          timeoutAfterSeconds: 90
        }
      );
      const [attempt] = destination.listHistory();
      assert.equal(attempt?.result, "correct");
      assert.equal(attempt?.submittedMove, "h6c1");
      assert.equal(attempt?.elapsedMs, undefined);
      assert.equal(attempt?.timingStatus, undefined);
      assert.equal(destination.exportLocalData().schemaVersion, 1);
    } finally {
      if (store instanceof SQLiteStore) {
        store.close();
      }
    }
  });
}

for (const backend of ["memory", "sqlite"] as const) {
  test(`${backend} preserves local custom timing when a newer old-client Run rename and ELO arrive`, async () => {
    const store = backend === "memory" ? new MemoryStore() : new SQLiteStore(":memory:");
    if (store instanceof SQLiteStore) {
      store.migrate();
    }
    try {
      const service = new PracticeService(store);
      service.loadFixturePuzzles(await loadFixturePuzzles());
      const run = service.createPracticeRun({
        id: `old-client-${backend}`,
        name: `Before old-client ${backend}`,
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        puzzleTiming: {
          slowAfterSeconds: 35,
          timeoutAfterSeconds: 70
        },
        themes: ["hangingPiece"],
        initialRating: 900
      }, "2026-07-24T02:30:00.000Z");

      const oldClient = structuredClone(service.exportLocalData());
      const oldClientRun = oldClient.practiceRuns.find((candidate) => candidate.id === run.id)!;
      oldClientRun.name = `Renamed by old client ${backend}`;
      oldClientRun.updatedAt = "2026-07-24T02:31:00.000Z";
      delete oldClientRun.puzzleTiming;
      const oldClientRating = oldClient.ratings.find((rating) => rating.key === run.ratingKey)!;
      oldClientRating.generation += 1;
      oldClientRating.rating = 1100;
      oldClientRating.games = 0;

      service.importLocalData(oldClient);

      const importedRun = service.listPracticeRuns().find((candidate) => candidate.id === run.id);
      assert.equal(importedRun?.name, `Renamed by old client ${backend}`);
      assert.deepEqual(importedRun?.puzzleTiming, {
        slowAfterSeconds: 35,
        timeoutAfterSeconds: 70
      });
      assert.equal(service.getRating(run.ratingKey).rating, 1100);
      assert.equal(service.exportLocalData().schemaVersion, 1);
    } finally {
      if (store instanceof SQLiteStore) {
        store.close();
      }
    }
  });
}

test("progress sync preserves explicit custom timing in either merge direction when a newer old client omits it", async () => {
  const service = new PracticeService(new MemoryStore());
  service.loadFixturePuzzles(await loadFixturePuzzles());
  const run = service.createPracticeRun({
    id: "old-client-sync",
    name: "Before old-client sync",
    mode: "custom",
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    puzzleTiming: {
      slowAfterSeconds: 35,
      timeoutAfterSeconds: 70
    },
    themes: ["hangingPiece"],
    initialRating: 900
  }, "2026-07-24T02:45:00.000Z");
  const current = service.exportLocalData();
  const oldClient = structuredClone(current);
  const oldClientRun = oldClient.practiceRuns.find((candidate) => candidate.id === run.id)!;
  oldClientRun.name = "Renamed by old-client sync";
  oldClientRun.updatedAt = "2026-07-24T02:46:00.000Z";
  delete oldClientRun.puzzleTiming;
  const oldClientRating = oldClient.ratings.find((rating) => rating.key === run.ratingKey)!;
  oldClientRating.generation += 1;
  oldClientRating.rating = 1100;
  oldClientRating.games = 0;

  for (const merged of [
    mergeLocalDataExports(current, oldClient),
    mergeLocalDataExports(oldClient, current)
  ]) {
    const mergedRun = merged.practiceRuns.find((candidate) => candidate.id === run.id);
    assert.equal(mergedRun?.name, "Renamed by old-client sync");
    assert.deepEqual(mergedRun?.puzzleTiming, {
      slowAfterSeconds: 35,
      timeoutAfterSeconds: 70
    });
    assert.equal(
      merged.ratings.find((rating) => rating.key === run.ratingKey)?.rating,
      1100
    );
    assert.equal(merged.schemaVersion, 1);
  }
});

test("progress sync deterministically preserves enriched attempt timing and Run policy", async () => {
  const source = new PracticeService(new MemoryStore());
  source.loadFixturePuzzles(await loadFixturePuzzles());
  const run = source.createPracticeRun({
    id: "sync-timing-run",
    name: "Sync Timing Run",
    mode: "custom",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    themes: ["hangingPiece"],
    initialRating: 1800
  }, "2026-07-24T03:00:00.000Z");
  source.startSprint({
    mode: "custom",
    practiceRunId: run.id,
    targetCorrect: 1,
    puzzleSelectionSeed: "sync-payload"
  }, "2026-07-24T03:01:00.000Z");
  source.submitMove("e6e7", "2026-07-24T03:01:20.000Z");
  source.submitMove("b3c1", "2026-07-24T03:01:35.000Z");
  source.submitMove("h6c1", "2026-07-24T03:01:45.000Z");

  const enriched = source.exportLocalData();
  const legacy = structuredClone(enriched);
  delete legacy.practiceRuns.find((candidate) => candidate.id === run.id)?.puzzleTiming;
  delete legacy.attempts[0]?.elapsedMs;
  delete legacy.attempts[0]?.timingStatus;

  const localFirst = mergeLocalDataExports(legacy, enriched);
  const remoteFirst = mergeLocalDataExports(enriched, legacy);
  assert.deepEqual(localFirst, remoteFirst);
  assert.deepEqual(localFirst.attempts[0], enriched.attempts[0]);
  assert.deepEqual(
    localFirst.practiceRuns.find((candidate) => candidate.id === run.id)?.puzzleTiming,
    {
      slowAfterSeconds: 60,
      timeoutAfterSeconds: 90
    }
  );
});

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  return JSON.parse(await readFile(PUZZLE_FIXTURE, "utf8")) as Puzzle[];
}
