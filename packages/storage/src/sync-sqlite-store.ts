import {
  buildHistoryView,
  buildSessionMistakeReview,
  createDefaultRating,
  filterHistoryAttemptsForQuery,
  resetRating as resetRatingRecord,
  resolveHistoryRange,
  scheduleMistakeForContext,
  scheduleReview,
  sideToMoveForHistoryPuzzle
} from "../../core/src/index.ts";
import type {
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  HistoryAttemptView,
  HistoryEloPoint,
  HistoryQuery,
  HistoryView,
  Puzzle,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  SessionMistakeReviewItem,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type { ClearLocalHistoryResult, ExportedSprintSession, LocalDataExport, PracticeSettings, PracticeStore } from "./practice-store.ts";
import { clonePracticeSettings, defaultPracticeSettings, normalizeReviewReminderPreference, reviewReminderPreferenceToSettings } from "./practice-settings.ts";
import { selectUniquePuzzles } from "./puzzle-selection.ts";
import type { ReviewReminderPreference } from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";

interface AttemptHistoryDbRow extends Omit<AttemptHistoryRow, "ratingAfter" | "arrowDuelCandidateOrder"> {
  ratingAfter: number | null;
  arrowDuelCandidateOrderJson: string | null;
}

interface HistoryAttemptDbRow extends PuzzleRow {
  attempt_id: string;
  attempt_source: "sprint" | "scheduled_review";
  session_id: string;
  mode: SprintMode;
  result: AttemptResult;
  submitted_move: string;
  expected_move: string;
  attempt_started_at: string;
  completed_at: string;
  rating_before: number;
  rating_after: number | null;
  arrow_duel_candidate_order_json: string | null;
  rating_key: string;
}

interface HistoryEloDbRow {
  session_id: string;
  completed_at: string;
  rating_before: number;
  rating_after: number;
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
  source: "lichess" | "synthetic";
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
  mode: SprintMode;
  rating_key: string;
  due_at: string;
  interval_hours: number;
  review_count: number;
  success_streak: number;
  lapse_count: number;
  last_result: AttemptResult;
  last_reviewed_at: string;
}

interface CustomSprintConfigRow {
  id: string;
  mode: SprintMode;
  rating_key: string;
  duration_seconds: number;
  per_puzzle_seconds: number;
  target_correct: number;
  max_mistakes: number;
  theme: string | null;
  last_started_at: string;
  play_count: number;
}

interface AppSettingsRow {
  id: string;
  sync_icloud_enabled: number;
  sync_upload_allowed: number;
  review_reminder_mode: PracticeSettings["notifications"]["reviewReminder"]["mode"];
  review_reminder_fixed_local_time: string | null;
}

interface SprintSessionExportRow {
  id: string;
  mode: SprintMode;
  ratingKey: string;
  startedAt: string;
  completedAt: string | null;
  status: SprintState["status"];
  correctCount: number;
  mistakeCount: number;
  ratingBefore: number;
  ratingAfter: number | null;
}

export type SyncSqliteValue = string | number | null;

export interface SyncSqliteStatement {
  run(...params: SyncSqliteValue[]): void;
  get(...params: SyncSqliteValue[]): unknown;
  all(...params: SyncSqliteValue[]): unknown[];
}

export interface SyncSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SyncSqliteStatement;
}

export interface SyncSQLiteStoreOptions {
  randomId: () => string;
}

export class SyncSQLiteStore implements PracticeStore {
  readonly db: SyncSqliteDatabase;
  private readonly options: SyncSQLiteStoreOptions;

  constructor(db: SyncSqliteDatabase, options: SyncSQLiteStoreOptions) {
    this.db = db;
    this.options = options;
  }

  migrate(): void {
    this.db.exec(SCHEMA_SQL);
    this.ensureAttemptCandidateOrderColumn();
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
      ...(filter.rating === undefined ? {} : { rating: filter.rating }),
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.theme === undefined ? {} : { theme: filter.theme }),
      ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
      ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
      ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
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

  listRatings(): RatingRecord[] {
    const rows = this.db
      .prepare(
        `SELECT r.*
         FROM ratings r
         JOIN (
           SELECT key, MAX(generation) AS generation
           FROM ratings
           GROUP BY key
         ) latest ON latest.key = r.key AND latest.generation = r.generation
         ORDER BY r.key ASC`
      )
      .all() as RatingRow[];
    return rows.map((row) => ({
      key: row.key,
      generation: row.generation,
      rating: row.rating,
      games: row.games
    }));
  }

  listPlayedRatings(): RatingRecord[] {
    const rows = this.db
      .prepare(
        `SELECT r.*
         FROM ratings r
         JOIN (
           SELECT key, MAX(generation) AS generation
           FROM ratings
           GROUP BY key
         ) latest ON latest.key = r.key AND latest.generation = r.generation
         JOIN (
           SELECT key
           FROM ratings
           GROUP BY key
           HAVING SUM(games) > 0
         ) played ON played.key = r.key
         ORDER BY r.key ASC`
      )
      .all() as RatingRow[];
    return rows.map((row) => ({
      key: row.key,
      generation: row.generation,
      rating: row.rating,
      games: row.games
    }));
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

  saveCustomSprintConfig(config: CustomSprintConfigRecord): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO custom_sprint_configs (
          id,
          mode,
          rating_key,
          duration_seconds,
          per_puzzle_seconds,
          target_correct,
          max_mistakes,
          theme,
          last_started_at,
          play_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        config.id,
        config.mode,
        config.ratingKey,
        config.durationSeconds,
        config.perPuzzleSeconds,
        config.targetCorrect,
        config.maxMistakes,
        config.theme ?? null,
        config.lastStartedAt,
        config.playCount
      );
  }

  listCustomSprintConfigs(): CustomSprintConfigRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM custom_sprint_configs ORDER BY last_started_at DESC, id ASC")
      .all() as CustomSprintConfigRow[];
    return rows.map((row) => ({
      id: row.id,
      mode: row.mode,
      ratingKey: row.rating_key,
      durationSeconds: row.duration_seconds,
      perPuzzleSeconds: row.per_puzzle_seconds,
      targetCorrect: row.target_correct,
      maxMistakes: row.max_mistakes,
      ...(row.theme === null ? {} : { theme: row.theme }),
      lastStartedAt: row.last_started_at,
      playCount: row.play_count
    }));
  }

  getSettings(): PracticeSettings {
    const row = this.db.prepare("SELECT * FROM app_settings WHERE id = 'default'").get() as AppSettingsRow | undefined;
    if (!row) {
      const settings = defaultPracticeSettings();
      this.saveSettings(settings);
      return settings;
    }
    return settingsFromRow(row);
  }

  saveSettings(settings: PracticeSettings): void {
    const cloned = clonePracticeSettings(settings);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO app_settings (
          id,
          sync_icloud_enabled,
          sync_upload_allowed,
          review_reminder_mode,
          review_reminder_fixed_local_time
        ) VALUES ('default', ?, ?, ?, ?)`
      )
      .run(
        boolToInt(cloned.sync.iCloudEnabled),
        boolToInt(cloned.sync.uploadAllowed),
        cloned.notifications.reviewReminder.mode,
        cloned.notifications.reviewReminder.mode === "fixed"
          ? cloned.notifications.reviewReminder.fixedLocalTime
          : null
      );
  }

  getReviewReminderPreference(): ReviewReminderPreference {
    return this.getSettings().notifications.reviewReminder;
  }

  saveReviewReminderPreference(preference: ReviewReminderPreference): ReviewReminderPreference {
    const settings = this.getSettings();
    this.saveSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        reviewReminder: preference
      }
    });
    return this.getReviewReminderPreference();
  }

  getReviewReminderSettings(): ReviewReminderSettings {
    return reviewReminderPreferenceToSettings(this.getReviewReminderPreference());
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
    if (attempt.source === "scheduled_review") {
      this.ensureSyntheticReviewSession(attempt);
    }
    this.db
      .prepare(
        `INSERT INTO attempts (
          id,
          source,
          session_id,
          puzzle_id,
          mode,
          rating_key,
          result,
          submitted_move,
          expected_move,
          started_at,
          completed_at,
          rating_before,
          rating_after,
          arrow_duel_candidate_order_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        attempt.id,
        attempt.source,
        attempt.sessionId,
        attempt.puzzleId,
        attempt.mode,
        attempt.ratingKey,
        attempt.result,
        attempt.submittedMove,
        attempt.expectedMove,
        attempt.startedAt,
        attempt.completedAt,
        attempt.ratingBefore,
        attempt.ratingAfter ?? null,
        attempt.arrowDuelCandidateOrder ? JSON.stringify(attempt.arrowDuelCandidateOrder) : null
      );
  }

  listAttempts(filter: HistoryFilter = {}): AttemptHistoryRow[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          source,
          session_id AS sessionId,
          puzzle_id AS puzzleId,
          mode,
          rating_key AS ratingKey,
          result,
          submitted_move AS submittedMove,
          expected_move AS expectedMove,
          started_at AS startedAt,
          completed_at AS completedAt,
          rating_before AS ratingBefore,
          rating_after AS ratingAfter,
          arrow_duel_candidate_order_json AS arrowDuelCandidateOrderJson
         FROM attempts
         WHERE (? IS NULL OR source = ?)
           AND (? IS NULL OR result = ?)
           AND (? IS NULL OR mode = ?)
           AND (? IS NULL OR completed_at >= ?)
           AND (? IS NULL OR puzzle_id = ?)
           AND (? IS NULL OR session_id = ?)
         ORDER BY completed_at DESC, id DESC`
      )
      .all(
        filter.source ?? null,
        filter.source ?? null,
        filter.result ?? null,
        filter.result ?? null,
        filter.mode ?? null,
        filter.mode ?? null,
        filter.since ?? null,
        filter.since ?? null,
        filter.puzzleId ?? null,
        filter.puzzleId ?? null,
        filter.sessionId ?? null,
        filter.sessionId ?? null
      ) as AttemptHistoryDbRow[];

    return rows.map((row) => {
      const candidateOrder = optionalStringArrayFromJson(row.arrowDuelCandidateOrderJson);
      const { ratingAfter, arrowDuelCandidateOrderJson: _arrowDuelCandidateOrderJson, ...attempt } = row;
      return {
        ...attempt,
        ...(ratingAfter === null ? {} : { ratingAfter }),
        ...(candidateOrder === undefined ? {} : { arrowDuelCandidateOrder: candidateOrder })
      };
    });
  }

  exportLocalData(): LocalDataExport {
    return {
      schemaVersion: 1,
      settings: this.getSettings(),
      ratings: this.listRatings(),
      attempts: this.listAttempts(),
      reviewQueue: this.listAllReviewQueueStates()
        .sort((left, right) =>
          left.dueAt.localeCompare(right.dueAt) ||
          left.puzzleId.localeCompare(right.puzzleId) ||
          left.mode.localeCompare(right.mode) ||
          left.ratingKey.localeCompare(right.ratingKey)
        ),
      sprintSessions: this.listExportedSprintSessions()
    };
  }

  clearLocalHistory(): ClearLocalHistoryResult {
    const result: ClearLocalHistoryResult = {
      attempts: countRows(this.db, "attempts"),
      reviewEvents: countRows(this.db, "review_events"),
      reviewQueue: countRows(this.db, "review_queue"),
      sprintSessions: countRows(this.db, "sprint_sessions", "status NOT IN ('active', 'paused')")
    };
    this.db.prepare("DELETE FROM attempts").run();
    this.db.prepare("DELETE FROM review_events").run();
    this.db.prepare("DELETE FROM review_queue").run();
    this.db.prepare("DELETE FROM sprint_sessions WHERE status NOT IN ('active', 'paused')").run();
    return result;
  }

  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[] {
    const attempts = this.listAttempts({ sessionId, result: "wrong" }).map(attemptEventFromHistoryRow);
    const puzzles = attempts
      .map((attempt) => this.getPuzzle(attempt.puzzleId))
      .filter((puzzle): puzzle is Puzzle => Boolean(puzzle));
    return buildSessionMistakeReview({ sessionId, attempts, puzzles });
  }

  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = scheduleMistakeForContext(context, now, previous);
    this.saveReviewQueueState(next);
    return next;
  }

  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = previous
      ? scheduleReview({ previous, result, now })
      : scheduleReview({ context, result, now });
    this.saveReviewQueueState(next);
    this.db
      .prepare(
        `INSERT INTO review_events (
          id,
          puzzle_id,
          mode,
          rating_key,
          result,
          reviewed_at,
          next_due_at,
          interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(this.options.randomId(), context.puzzleId, context.mode, context.ratingKey, result, now, next.dueAt, next.intervalHours);
    return next;
  }

  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined {
    const row = this.db
      .prepare("SELECT * FROM review_queue WHERE puzzle_id = ? AND mode = ? AND rating_key = ?")
      .get(context.puzzleId, context.mode, context.ratingKey) as ReviewRow | undefined;
    return row ? reviewFromRow(row) : undefined;
  }

  listReviewQueue(): ReviewQueueState[] {
    return this.listAllReviewQueueStates();
  }

  pruneOrphanedReviewQueue(): number {
    const removed = countRows(this.db, "review_queue", "NOT EXISTS (SELECT 1 FROM puzzles WHERE puzzles.id = review_queue.puzzle_id)");
    if (removed > 0) {
      this.db
        .prepare("DELETE FROM review_queue WHERE NOT EXISTS (SELECT 1 FROM puzzles WHERE puzzles.id = review_queue.puzzle_id)")
        .run();
    }
    return removed;
  }

  getDueReviews(now: string): ReviewQueueState[] {
    const rows = this.db
      .prepare("SELECT * FROM review_queue WHERE due_at <= ? ORDER BY due_at ASC, puzzle_id ASC, mode ASC, rating_key ASC")
      .all(now) as ReviewRow[];
    return rows.map(reviewFromRow);
  }

  getDueReviewItems(now: string): ReviewQueueItem[] {
    return this.getDueReviews(now)
      .map((review) => {
        const puzzle = this.getPuzzle(review.puzzleId);
        return puzzle ? { puzzle, review } : undefined;
      })
      .filter((item): item is ReviewQueueItem => Boolean(item));
  }

  getHistoryView(query: HistoryQuery): HistoryView {
    const range = resolveHistoryRange(query.now, query.timeRange);
    const allAttempts = this.selectHistoryAttempts(query.ratingKey, range.since, range.until);
    const reviews = this.listAllReviewQueueStates();
    const attempts = filterHistoryAttemptsForQuery({ attempts: allAttempts, query, reviews });
    return buildHistoryView({
      query,
      ratingKeys: this.listPlayedRatings(),
      attempts,
      elo: this.selectHistoryElo(query.ratingKey, range.since, range.until),
      reviews,
      allAttemptsForOptions: allAttempts
    });
  }

  private saveReviewQueueState(state: ReviewQueueState): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO review_queue (
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
        state.puzzleId,
        state.mode,
        state.ratingKey,
        state.dueAt,
        state.intervalHours,
        state.reviewCount,
        state.successStreak,
        state.lapseCount,
        state.lastResult,
        state.lastReviewedAt
      );
  }

  private selectHistoryAttempts(ratingKey: string, since: string | undefined, until: string): HistoryAttemptView[] {
    const rows = this.db
      .prepare(
        `SELECT
          a.id AS attempt_id,
          a.source AS attempt_source,
          a.session_id,
          a.mode,
          a.result,
          a.submitted_move,
          a.expected_move,
          a.started_at AS attempt_started_at,
          a.completed_at,
          a.rating_before,
          a.rating_after,
          a.arrow_duel_candidate_order_json,
          COALESCE(a.rating_key, s.rating_key) AS rating_key,
          p.*
         FROM attempts a
         JOIN sprint_sessions s ON s.id = a.session_id
         JOIN puzzles p ON p.id = a.puzzle_id
         WHERE COALESCE(a.rating_key, s.rating_key) = ?
           AND (? IS NULL OR a.completed_at >= ?)
           AND a.completed_at <= ?
         ORDER BY a.completed_at DESC, a.id DESC`
      )
      .all(ratingKey, since ?? null, since ?? null, until) as HistoryAttemptDbRow[];

    return rows.map((row) => {
      const puzzle = puzzleFromRow(row);
      const candidateOrder = optionalStringArrayFromJson(row.arrow_duel_candidate_order_json);
      return {
        id: row.attempt_id,
        source: row.attempt_source,
        sessionId: row.session_id,
        puzzleId: puzzle.id,
        mode: row.mode,
        ratingKey: row.rating_key,
        result: row.result,
        submittedMove: row.submitted_move,
        expectedMove: row.expected_move,
        startedAt: row.attempt_started_at,
        completedAt: row.completed_at,
        ratingBefore: row.rating_before,
        ...(row.rating_after === null ? {} : { ratingAfter: row.rating_after }),
        ...(candidateOrder === undefined ? {} : { arrowDuelCandidateOrder: candidateOrder }),
        puzzleRating: puzzle.rating,
        side: sideToMoveForHistoryPuzzle({ puzzle, mode: row.mode }),
        themes: puzzle.themes
      };
    });
  }

  private selectHistoryElo(ratingKey: string, since: string | undefined, until: string): HistoryEloPoint[] {
    const rows = this.db
      .prepare(
        `SELECT
          id AS session_id,
          completed_at,
          rating_before,
          rating_after
         FROM sprint_sessions
         WHERE rating_key = ?
           AND completed_at IS NOT NULL
           AND rating_after IS NOT NULL
           AND (? IS NULL OR completed_at >= ?)
           AND completed_at <= ?
         ORDER BY completed_at ASC, id ASC`
      )
      .all(ratingKey, since ?? null, since ?? null, until) as HistoryEloDbRow[];
    return rows.map((row) => ({
      sessionId: row.session_id,
      completedAt: row.completed_at,
      ratingBefore: row.rating_before,
      ratingAfter: row.rating_after
    }));
  }

  private listAllReviewQueueStates(): ReviewQueueState[] {
    const rows = this.db.prepare("SELECT * FROM review_queue ORDER BY due_at ASC, puzzle_id ASC, mode ASC, rating_key ASC").all() as ReviewRow[];
    return rows.map(reviewFromRow);
  }

  private listExportedSprintSessions(): ExportedSprintSession[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          mode,
          rating_key AS ratingKey,
          started_at AS startedAt,
          completed_at AS completedAt,
          status,
          correct_count AS correctCount,
          mistake_count AS mistakeCount,
          rating_before AS ratingBefore,
          rating_after AS ratingAfter
         FROM sprint_sessions
         ORDER BY started_at DESC, id DESC`
      )
      .all() as SprintSessionExportRow[];

    return rows.map((row) => ({
      id: row.id,
      mode: row.mode,
      ratingKey: row.ratingKey,
      startedAt: row.startedAt,
      ...(row.completedAt === null ? {} : { completedAt: row.completedAt }),
      status: row.status,
      correctCount: row.correctCount,
      mistakeCount: row.mistakeCount,
      ratingBefore: row.ratingBefore,
      ...(row.ratingAfter === null ? {} : { ratingAfter: row.ratingAfter })
    }));
  }

  private ensureSyntheticReviewSession(attempt: AttemptEvent): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO sprint_sessions (
          id,
          mode,
          rating_key,
          config_json,
          started_at,
          deadline_at,
          completed_at,
          status,
          correct_count,
          mistake_count,
          rating_before,
          rating_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        attempt.sessionId,
        attempt.mode,
        attempt.ratingKey,
        JSON.stringify({ source: "scheduled_review", mode: attempt.mode, ratingKey: attempt.ratingKey }),
        attempt.startedAt,
        attempt.completedAt,
        attempt.completedAt,
        "won",
        attempt.result === "correct" ? 1 : 0,
        attempt.result === "wrong" ? 1 : 0,
        attempt.ratingBefore,
        null
      );
  }

  private ensureAttemptCandidateOrderColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(attempts)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "arrow_duel_candidate_order_json")) {
      this.db.exec("ALTER TABLE attempts ADD COLUMN arrow_duel_candidate_order_json TEXT");
    }
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
    mode: row.mode,
    ratingKey: row.rating_key,
    dueAt: row.due_at,
    intervalHours: row.interval_hours,
    reviewCount: row.review_count,
    successStreak: row.success_streak,
    lapseCount: row.lapse_count,
    lastResult: row.last_result,
    lastReviewedAt: row.last_reviewed_at
  };
}

function settingsFromRow(row: AppSettingsRow): PracticeSettings {
  const reminder = normalizeReviewReminderPreference(
    row.review_reminder_mode === "fixed"
      ? { mode: "fixed", fixedLocalTime: row.review_reminder_fixed_local_time ?? "" }
      : { mode: row.review_reminder_mode }
  );
  return {
    sync: {
      iCloudEnabled: intToBool(row.sync_icloud_enabled),
      uploadAllowed: intToBool(row.sync_upload_allowed)
    },
    notifications: {
      reviewReminder: reminder
    }
  };
}

function attemptEventFromHistoryRow(row: AttemptHistoryRow): AttemptEvent {
  return {
    id: row.id,
    source: row.source,
    sessionId: row.sessionId,
    puzzleId: row.puzzleId,
    mode: row.mode,
    ratingKey: row.ratingKey,
    result: row.result,
    submittedMove: row.submittedMove,
    expectedMove: row.expectedMove,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    ratingBefore: row.ratingBefore,
    ...(row.ratingAfter === undefined ? {} : { ratingAfter: row.ratingAfter }),
    ...(row.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: row.arrowDuelCandidateOrder })
  };
}

function optionalStringArrayFromJson(value: string | null): string[] | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Stored Arrow Duel candidate order must be a string array");
  }
  return parsed;
}

function countRows(db: SyncSqliteDatabase, table: string, where?: string): number {
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  return (db.prepare(sql).get() as { count: number }).count;
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function intToBool(value: number): boolean {
  return value !== 0;
}

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  sync_icloud_enabled INTEGER NOT NULL,
  sync_upload_allowed INTEGER NOT NULL,
  review_reminder_mode TEXT NOT NULL,
  review_reminder_fixed_local_time TEXT
);

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
  FOREIGN KEY (session_id) REFERENCES sprint_sessions(id),
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
);

CREATE INDEX IF NOT EXISTS attempts_completed_at_idx ON attempts(completed_at);
CREATE INDEX IF NOT EXISTS attempts_result_idx ON attempts(result);
CREATE INDEX IF NOT EXISTS attempts_mode_idx ON attempts(mode);
CREATE INDEX IF NOT EXISTS attempts_session_id_idx ON attempts(session_id);
CREATE INDEX IF NOT EXISTS sprint_sessions_rating_key_completed_at_idx ON sprint_sessions(rating_key, completed_at);

CREATE TABLE IF NOT EXISTS custom_sprint_configs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  rating_key TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  per_puzzle_seconds INTEGER NOT NULL,
  target_correct INTEGER NOT NULL,
  max_mistakes INTEGER NOT NULL,
  theme TEXT,
  last_started_at TEXT NOT NULL,
  play_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS custom_sprint_configs_last_started_at_idx ON custom_sprint_configs(last_started_at);

CREATE TABLE IF NOT EXISTS review_queue (
  puzzle_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'standard',
  rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
  due_at TEXT NOT NULL,
  interval_hours INTEGER NOT NULL,
  review_count INTEGER NOT NULL,
  success_streak INTEGER NOT NULL,
  lapse_count INTEGER NOT NULL,
  last_result TEXT NOT NULL,
  last_reviewed_at TEXT NOT NULL,
  PRIMARY KEY (puzzle_id, mode, rating_key),
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
);

CREATE INDEX IF NOT EXISTS review_queue_due_at_idx ON review_queue(due_at);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  puzzle_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'standard',
  rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
  result TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  next_due_at TEXT NOT NULL,
  interval_hours INTEGER NOT NULL,
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
);
CREATE INDEX IF NOT EXISTS review_events_puzzle_id_idx ON review_events(puzzle_id);
CREATE INDEX IF NOT EXISTS review_events_reviewed_at_idx ON review_events(reviewed_at);
`;
