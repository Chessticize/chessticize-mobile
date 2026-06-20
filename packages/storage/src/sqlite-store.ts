import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  createDefaultRating,
  resetRating as resetRatingRecord,
  scheduleMistake,
  scheduleReview
} from "../../core/src/index.ts";
import type {
  AttemptEvent,
  AttemptResult,
  Puzzle,
  RatingRecord,
  ReviewQueueState,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type { PracticeStore } from "./practice-store.ts";
import { selectUniquePuzzles } from "./puzzle-selection.ts";

interface AttemptHistoryDbRow extends Omit<AttemptHistoryRow, "ratingAfter"> {
  ratingAfter: number | null;
}

interface PuzzleRow {
  id: string;
  initial_fen: string;
  moves_json: string;
  rating: number;
  rating_deviation: number | null;
  popularity: number | null;
  nb_plays: number | null;
  themes_json: string;
  game_url: string | null;
  opening_tags_json: string;
  source: "lichess";
  stockfish_eval: number | null;
  stockfish_bestmove: string | null;
  stockfish_eval_after_first_move: number | null;
}

interface RatingRow {
  key: string;
  generation: number;
  rating: number;
  games: number;
}

interface ReviewRow {
  puzzle_id: string;
  due_at: string;
  interval_hours: number;
  review_count: number;
  success_streak: number;
  lapse_count: number;
  last_result: AttemptResult;
  last_reviewed_at: string;
}

export class SQLiteStore implements PracticeStore {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
  }

  migrate(): void {
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  seedPuzzles(puzzles: Puzzle[]): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO puzzles (
        id,
        initial_fen,
        moves_json,
        rating,
        rating_deviation,
        popularity,
        nb_plays,
        themes_json,
        game_url,
        opening_tags_json,
        source,
        stockfish_eval,
        stockfish_bestmove,
        stockfish_eval_after_first_move
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const puzzle of puzzles) {
      statement.run(
        puzzle.id,
        puzzle.initialFen,
        JSON.stringify(puzzle.solutionMoves),
        puzzle.rating,
        puzzle.ratingDeviation ?? null,
        puzzle.popularity ?? null,
        puzzle.nbPlays ?? null,
        JSON.stringify(puzzle.themes),
        puzzle.gameUrl ?? null,
        JSON.stringify(puzzle.openingTags ?? []),
        puzzle.source,
        puzzle.stockfishEval ?? null,
        puzzle.stockfishBestMove ?? null,
        puzzle.stockfishEvalAfterFirstMove ?? null
      );
    }
  }

  countPuzzles(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM puzzles").get() as { count: number };
    return row.count;
  }

  getPuzzle(id: string): Puzzle | undefined {
    const row = this.db.prepare("SELECT * FROM puzzles WHERE id = ?").get(id) as PuzzleRow | undefined;
    return row ? puzzleFromRow(row) : undefined;
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    const rows = this.db
      .prepare("SELECT * FROM puzzles WHERE rating >= ? AND rating <= ? ORDER BY rating ASC, id ASC")
      .all(filter.minRating ?? 0, filter.maxRating ?? 4000) as PuzzleRow[];

    return selectUniquePuzzles({
      puzzles: rows.map(puzzleFromRow),
      mode: filter.mode,
      limit: filter.limit,
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.theme === undefined ? {} : { theme: filter.theme })
    });
  }

  getRating(key: string): RatingRecord {
    const row = this.db
      .prepare("SELECT * FROM ratings WHERE key = ? ORDER BY generation DESC LIMIT 1")
      .get(key) as RatingRow | undefined;
    if (!row) {
      const created = createDefaultRating(key);
      this.saveRating(created);
      return created;
    }
    return {
      key: row.key,
      generation: row.generation,
      rating: row.rating,
      games: row.games
    };
  }

  saveRating(record: RatingRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ratings (key, generation, rating, games)
         VALUES (?, ?, ?, ?)`
      )
      .run(record.key, record.generation, record.rating, record.games);
  }

  resetRating(key: string): RatingRecord {
    const next = resetRatingRecord(this.getRating(key));
    this.saveRating(next);
    return next;
  }

  createSprintSession(state: SprintState): void {
    this.db
      .prepare(
        `INSERT INTO sprint_sessions (
          id,
          mode,
          rating_key,
          config_json,
          started_at,
          deadline_at,
          status,
          correct_count,
          mistake_count,
          rating_before
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        state.id,
        state.config.mode,
        state.config.ratingKey,
        JSON.stringify(state.config),
        state.startedAt,
        state.deadlineAt,
        state.status,
        state.correctCount,
        state.mistakeCount,
        state.ratingBefore
      );
  }

  updateSprintSession(state: SprintState): void {
    this.db
      .prepare(
        `UPDATE sprint_sessions
         SET status = ?,
             completed_at = ?,
             end_reason = ?,
             correct_count = ?,
             mistake_count = ?,
             rating_after = ?
         WHERE id = ?`
      )
      .run(
        state.status,
        state.completedAt ?? null,
        state.endReason ?? null,
        state.correctCount,
        state.mistakeCount,
        state.ratingAfter ?? null,
        state.id
      );
  }

  recordAttempt(attempt: AttemptEvent): void {
    this.db
      .prepare(
        `INSERT INTO attempts (
          id,
          session_id,
          puzzle_id,
          mode,
          result,
          submitted_move,
          expected_move,
          started_at,
          completed_at,
          rating_before,
          rating_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        attempt.id,
        attempt.sessionId,
        attempt.puzzleId,
        attempt.mode,
        attempt.result,
        attempt.submittedMove,
        attempt.expectedMove,
        attempt.startedAt,
        attempt.completedAt,
        attempt.ratingBefore,
        attempt.ratingAfter ?? null
      );
  }

  listAttempts(filter: HistoryFilter = {}): AttemptHistoryRow[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          session_id AS sessionId,
          puzzle_id AS puzzleId,
          mode,
          result,
          submitted_move AS submittedMove,
          expected_move AS expectedMove,
          completed_at AS completedAt,
          rating_before AS ratingBefore,
          rating_after AS ratingAfter
         FROM attempts
         WHERE (? IS NULL OR result = ?)
           AND (? IS NULL OR mode = ?)
           AND (? IS NULL OR completed_at >= ?)
           AND (? IS NULL OR puzzle_id = ?)
         ORDER BY completed_at DESC, id DESC`
      )
      .all(
        filter.result ?? null,
        filter.result ?? null,
        filter.mode ?? null,
        filter.mode ?? null,
        filter.since ?? null,
        filter.since ?? null,
        filter.puzzleId ?? null,
        filter.puzzleId ?? null
      ) as AttemptHistoryDbRow[];

    return rows.map((row) => {
      if (row.ratingAfter === null) {
        const { ratingAfter: _ratingAfter, ...withoutRatingAfter } = row;
        return withoutRatingAfter;
      }
      return row;
    });
  }

  scheduleMistakeReview(puzzleId: string, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(puzzleId);
    const next = previous
      ? scheduleReview({ previous, result: "wrong", now })
      : scheduleMistake(puzzleId, now);
    this.saveReviewQueueState(next);
    return next;
  }

  recordReviewResult(puzzleId: string, result: AttemptResult, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(puzzleId);
    const next = previous
      ? scheduleReview({ previous, result, now })
      : { ...scheduleReview({ result, now }), puzzleId };
    this.saveReviewQueueState(next);
    this.db
      .prepare(
        `INSERT INTO review_events (
          id,
          puzzle_id,
          result,
          reviewed_at,
          next_due_at,
          interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(cryptoRandomId(), puzzleId, result, now, next.dueAt, next.intervalHours);
    return next;
  }

  getReviewQueueState(puzzleId: string): ReviewQueueState | undefined {
    const row = this.db
      .prepare("SELECT * FROM review_queue WHERE puzzle_id = ?")
      .get(puzzleId) as ReviewRow | undefined;
    return row ? reviewFromRow(row) : undefined;
  }

  getDueReviews(now: string): ReviewQueueState[] {
    const rows = this.db
      .prepare("SELECT * FROM review_queue WHERE due_at <= ? ORDER BY due_at ASC, puzzle_id ASC")
      .all(now) as ReviewRow[];
    return rows.map(reviewFromRow);
  }

  private saveReviewQueueState(state: ReviewQueueState): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO review_queue (
          puzzle_id,
          due_at,
          interval_hours,
          review_count,
          success_streak,
          lapse_count,
          last_result,
          last_reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        state.puzzleId,
        state.dueAt,
        state.intervalHours,
        state.reviewCount,
        state.successStreak,
        state.lapseCount,
        state.lastResult,
        state.lastReviewedAt
      );
  }
}

function puzzleFromRow(row: PuzzleRow): Puzzle {
  return {
    id: row.id,
    initialFen: row.initial_fen,
    solutionMoves: JSON.parse(row.moves_json) as string[],
    rating: row.rating,
    ...(row.rating_deviation === null ? {} : { ratingDeviation: row.rating_deviation }),
    ...(row.popularity === null ? {} : { popularity: row.popularity }),
    ...(row.nb_plays === null ? {} : { nbPlays: row.nb_plays }),
    themes: JSON.parse(row.themes_json) as string[],
    ...(row.game_url ? { gameUrl: row.game_url } : {}),
    openingTags: JSON.parse(row.opening_tags_json) as string[],
    source: row.source,
    ...(row.stockfish_eval === null ? {} : { stockfishEval: row.stockfish_eval }),
    ...(row.stockfish_bestmove ? { stockfishBestMove: row.stockfish_bestmove } : {}),
    ...(row.stockfish_eval_after_first_move === null
      ? {}
      : { stockfishEvalAfterFirstMove: row.stockfish_eval_after_first_move })
  };
}

function reviewFromRow(row: ReviewRow): ReviewQueueState {
  return {
    puzzleId: row.puzzle_id,
    dueAt: row.due_at,
    intervalHours: row.interval_hours,
    reviewCount: row.review_count,
    successStreak: row.success_streak,
    lapseCount: row.lapse_count,
    lastResult: row.last_result,
    lastReviewedAt: row.last_reviewed_at
  };
}

function cryptoRandomId(): string {
  return randomUUID();
}

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  initial_fen TEXT NOT NULL,
  moves_json TEXT NOT NULL,
  rating INTEGER NOT NULL,
  rating_deviation INTEGER,
  popularity INTEGER,
  nb_plays INTEGER,
  themes_json TEXT NOT NULL,
  game_url TEXT,
  opening_tags_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  stockfish_eval REAL,
  stockfish_bestmove TEXT,
  stockfish_eval_after_first_move REAL
);

CREATE TABLE IF NOT EXISTS ratings (
  key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  games INTEGER NOT NULL,
  PRIMARY KEY (key, generation)
);

CREATE TABLE IF NOT EXISTS sprint_sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  rating_key TEXT NOT NULL,
  config_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  end_reason TEXT,
  correct_count INTEGER NOT NULL,
  mistake_count INTEGER NOT NULL,
  rating_before INTEGER NOT NULL,
  rating_after INTEGER
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  puzzle_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  result TEXT NOT NULL,
  submitted_move TEXT NOT NULL,
  expected_move TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  rating_before INTEGER NOT NULL,
  rating_after INTEGER,
  FOREIGN KEY (session_id) REFERENCES sprint_sessions(id),
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
);

CREATE INDEX IF NOT EXISTS attempts_completed_at_idx ON attempts(completed_at);
CREATE INDEX IF NOT EXISTS attempts_result_idx ON attempts(result);
CREATE INDEX IF NOT EXISTS attempts_mode_idx ON attempts(mode);

CREATE TABLE IF NOT EXISTS review_queue (
  puzzle_id TEXT PRIMARY KEY,
  due_at TEXT NOT NULL,
  interval_hours INTEGER NOT NULL,
  review_count INTEGER NOT NULL,
  success_streak INTEGER NOT NULL,
  lapse_count INTEGER NOT NULL,
  last_result TEXT NOT NULL,
  last_reviewed_at TEXT NOT NULL,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
);

CREATE INDEX IF NOT EXISTS review_queue_due_at_idx ON review_queue(due_at);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  puzzle_id TEXT NOT NULL,
  result TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  next_due_at TEXT NOT NULL,
  interval_hours INTEGER NOT NULL,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
);
`;
