import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { PracticeService, SQLiteStore } from "../src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";

const ATTEMPT_COUNT = 20_000;
const SESSION_COUNT = 5_000;
const HISTORY_PAGE_LIMIT = 20;
const HISTORY_CHART_POINT_LIMIT = 512;
const HISTORY_QUERY_BUDGET_MS = 500;
const RATING_KEY = "standard 5/20";
const NOW = "2026-07-24T12:00:00.000Z";

process.env.TZ = "UTC";

test("large SQLite histories keep History paging, summaries, and a new run responsive", async () => {
  const store = await largeHistoryStore();
  try {
    const service = new PracticeService(store);
    const startedAt = performance.now();
    const history = service.getHistoryView({
      now: NOW,
      timeRange: "max",
      ratingKey: RATING_KEY,
      page: { limit: HISTORY_PAGE_LIMIT }
    });
    const elapsedMs = performance.now() - startedAt;

    assert.deepEqual(history.page, {
      limit: HISTORY_PAGE_LIMIT,
      offset: 0,
      total: ATTEMPT_COUNT,
      hasMore: true
    });
    assert.equal(history.attempts.length, HISTORY_PAGE_LIMIT);
    assert.equal(history.attempts[0]?.id, "attempt-19999");
    assert.equal(history.performance.correctCount, ATTEMPT_COUNT - Math.ceil(ATTEMPT_COUNT / 7));
    assert.equal(history.performance.wrongCount, Math.ceil(ATTEMPT_COUNT / 7));
    for (const points of Object.values(history.performance.charts)) {
      assert.ok(
        points.length <= HISTORY_CHART_POINT_LIMIT,
        `History returned ${points.length} chart points for a ${HISTORY_CHART_POINT_LIMIT}-point display budget`
      );
    }
    assert.ok(
      elapsedMs < HISTORY_QUERY_BUDGET_MS,
      `History page and summaries took ${elapsedMs.toFixed(1)}ms; budget is ${HISTORY_QUERY_BUDGET_MS}ms`
    );

    const lastPageStartedAt = performance.now();
    const lastPage = service.getHistoryView({
      now: NOW,
      timeRange: "max",
      ratingKey: RATING_KEY,
      page: { limit: HISTORY_PAGE_LIMIT, offset: ATTEMPT_COUNT - HISTORY_PAGE_LIMIT }
    });
    const lastPageElapsedMs = performance.now() - lastPageStartedAt;
    assert.deepEqual(lastPage.page, {
      limit: HISTORY_PAGE_LIMIT,
      offset: ATTEMPT_COUNT - HISTORY_PAGE_LIMIT,
      total: ATTEMPT_COUNT,
      hasMore: false
    });
    assert.equal(lastPage.attempts[0]?.id, "attempt-00019");
    assert.equal(lastPage.attempts.at(-1)?.id, "attempt-00000");
    assert.ok(
      lastPageElapsedMs < HISTORY_QUERY_BUDGET_MS,
      `Deep History page and summaries took ${lastPageElapsedMs.toFixed(1)}ms; budget is ${HISTORY_QUERY_BUDGET_MS}ms`
    );

    assert.equal(service.countHistory({ source: "sprint" }), ATTEMPT_COUNT);
    assert.equal(service.countHistory({ source: "scheduled_review" }), 0);
    assert.equal(service.getHistoryAttempt("attempt-19999")?.id, "attempt-19999");
    assert.equal(service.hasPlayedRatingKey(RATING_KEY), true);
    const [ratingActivity] = service.listPracticeRatingActivity();
    assert.equal(ratingActivity?.ratingKey, RATING_KEY);
    assert.equal(ratingActivity?.lastPlayedAt, historyTimestamp(ATTEMPT_COUNT - 1));
    assert.deepEqual(
      service.getPracticeProgressSummary(
        new Date(historyTimestamp(ATTEMPT_COUNT - 1)).getTime() + 60_000,
        RATING_KEY
      ),
      {
        correctThisWeek: ATTEMPT_COUNT - Math.ceil(ATTEMPT_COUNT / 7),
        accuracyThisWeek: 86,
        ratingDeltaThisWeek: SESSION_COUNT,
        wrongThisWeek: Math.ceil(ATTEMPT_COUNT / 7),
        netThisWeek: ATTEMPT_COUNT - 2 * Math.ceil(ATTEMPT_COUNT / 7)
      }
    );

    const sprint = service.startSprint(
      {
        mode: "standard",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        maxMistakes: 1
      },
      NOW
    );
    assert.equal(sprint.status, "active");
    assert.equal(sprint.currentPuzzleIndex, 0);
  } finally {
    store.close();
  }
});

test("large due Review queues are loaded without one puzzle lookup per item", async () => {
  const store = new PuzzleLookupCountingSQLiteStore(":memory:");
  store.migrate();
  const [fixture] = await loadFixturePuzzles();
  assert.ok(fixture);
  const reviewCount = 1_000;
  const puzzles = Array.from({ length: reviewCount }, (_, index): Puzzle => ({
    ...fixture,
    id: `review-puzzle-${index.toString().padStart(4, "0")}`
  }));
  store.seedPuzzles(puzzles);
  const insertReview = store.db.prepare(`
    INSERT INTO review_queue (
      puzzle_id, mode, rating_key, due_day, interval_days, review_count,
      success_streak, lapse_count, last_result, last_reviewed_at, enrolled_at
    ) VALUES (?, 'standard', ?, '2026-07-23', 1, 1, 0, 1, 'wrong', '2026-07-22T12:00:00.000Z', NULL)
  `);
  store.db.exec("BEGIN IMMEDIATE");
  try {
    for (const puzzle of puzzles) {
      insertReview.run(puzzle.id, RATING_KEY);
    }
    store.db.exec("COMMIT");
  } catch (error) {
    store.db.exec("ROLLBACK");
    throw error;
  }

  store.puzzleLookups = 0;
  try {
    const dueItems = store.getDueReviewItems(NOW);
    assert.equal(dueItems.length, reviewCount);
    assert.equal(dueItems[0]?.puzzle.id, "review-puzzle-0000");
    assert.equal(dueItems.at(-1)?.puzzle.id, "review-puzzle-0999");
    assert.equal(
      store.puzzleLookups,
      0,
      `Review loading performed ${store.puzzleLookups} per-item puzzle lookups instead of one joined query`
    );
  } finally {
    store.close();
  }
});

class PuzzleLookupCountingSQLiteStore extends SQLiteStore {
  puzzleLookups = 0;

  override getPuzzle(...args: Parameters<SQLiteStore["getPuzzle"]>) {
    this.puzzleLookups += 1;
    return super.getPuzzle(...args);
  }
}

async function largeHistoryStore(): Promise<SQLiteStore> {
  const store = new SQLiteStore(":memory:");
  store.migrate();
  const puzzles = await loadFixturePuzzles();
  store.seedPuzzles(puzzles);
  const puzzleId = puzzles[0]!.id;
  const insertSession = store.db.prepare(`
    INSERT INTO sprint_sessions (
      id, mode, rating_key, rating_generation, config_json, started_at,
      deadline_at, completed_at, status, end_reason, correct_count,
      mistake_count, rating_before, rating_after
    ) VALUES (?, 'standard', ?, 0, ?, ?, ?, ?, 'won', 'target_reached', 4, 0, 1200, 1201)
  `);
  const insertAttempt = store.db.prepare(`
    INSERT INTO attempts (
      id, source, session_id, puzzle_id, mode, rating_key, result,
      submitted_move, expected_move, started_at, completed_at,
      rating_before, rating_after
    ) VALUES (?, 'sprint', ?, ?, 'standard', ?, ?, 'e2e4', 'e2e4', ?, ?, 1200, 1201)
  `);

  store.db.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < SESSION_COUNT; index += 1) {
      const sessionId = `session-${index.toString().padStart(5, "0")}`;
      const timestamp = historyTimestamp(index * 4);
      insertSession.run(
        sessionId,
        RATING_KEY,
        JSON.stringify({
          mode: "standard",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          targetCorrect: 4,
          maxMistakes: 3,
          ratingKey: RATING_KEY
        }),
        timestamp,
        timestamp,
        timestamp
      );
    }
    for (let index = 0; index < ATTEMPT_COUNT; index += 1) {
      const sessionId = `session-${Math.floor(index / 4).toString().padStart(5, "0")}`;
      const timestamp = historyTimestamp(index);
      insertAttempt.run(
        `attempt-${index.toString().padStart(5, "0")}`,
        sessionId,
        puzzleId,
        RATING_KEY,
        index % 7 === 0 ? "wrong" : "correct",
        timestamp,
        timestamp
      );
    }
    store.db.exec("COMMIT");
    return store;
  } catch (error) {
    store.db.exec("ROLLBACK");
    store.close();
    throw error;
  }
}

function historyTimestamp(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  const contents = await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8");
  return JSON.parse(contents) as Puzzle[];
}
