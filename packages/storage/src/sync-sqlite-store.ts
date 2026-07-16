import {
  buildHistoryView,
  buildSessionMistakeReview,
  createDefaultRating,
  filterHistoryAttemptsForQuery,
  normalizeRatingRecord,
  orderReviewQueue,
  resetRating as resetRatingRecord,
  resolveHistoryRange,
  reviewDayFor,
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
import type {
  ClearLocalHistoryResult,
  ExportedSprintSession,
  LocalDataImport,
  LocalDataImportResult,
  LocalDataExport,
  PracticeSettings,
  PracticeStore,
  ReviewQueueDuePromotionResult
} from "./practice-store.ts";
import { exportReviewQueueState, normalizeImportedReviewQueueState } from "./practice-store.ts";
import { clonePracticeSettings, defaultPracticeSettings, normalizeReviewReminderPreference, reviewReminderPreferenceToSettings } from "./practice-settings.ts";
import { selectUniquePuzzles } from "./puzzle-selection.ts";
import { preferredSprintSession, sameSprintSession } from "./sprint-session-sync.ts";
import { assignLegacyRatingGenerations } from "./rating-history.ts";
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
  rating_deviation: number | null;
  volatility: number | null;
  games: number;
}

interface ReviewRow {
  puzzle_id: string;
  mode: SprintMode;
  rating_key: string;
  due_day: string;
  interval_days: number;
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
  ratingGeneration: number | null;
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

export const CURRENT_SCHEMA_VERSION = 4;

interface SQLiteMigration {
  from: number;
  to: number;
  apply: (db: SyncSqliteDatabase) => void;
}

const SQLITE_MIGRATIONS: readonly SQLiteMigration[] = [
  { from: 0, to: 1, apply: migrateUnversionedSchemaToV1 },
  { from: 1, to: 2, apply: migrateV1ToV2 },
  { from: 2, to: 3, apply: migrateV2ToV3 },
  { from: 3, to: 4, apply: migrateV3ToV4 }
];

export class SyncSQLiteStore implements PracticeStore {
  readonly db: SyncSqliteDatabase;
  private readonly options: SyncSQLiteStoreOptions;

  constructor(db: SyncSqliteDatabase, options: SyncSQLiteStoreOptions) {
    this.db = db;
    this.options = options;
  }

  migrate(): void {
    this.db.exec("PRAGMA foreign_keys = ON");
    const startingVersion = readSchemaVersion(this.db);
    if (startingVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `SQLite schema version ${startingVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`
      );
    }
    if (startingVersion === CURRENT_SCHEMA_VERSION) {
      return;
    }

    this.transaction(() => {
      let version = startingVersion;
      while (version < CURRENT_SCHEMA_VERSION) {
        const migration = SQLITE_MIGRATIONS.find((candidate) => candidate.from === version);
        if (!migration || migration.to !== version + 1 || migration.to > CURRENT_SCHEMA_VERSION) {
          throw new Error(`No SQLite migration is registered from schema version ${version}`);
        }
        migration.apply(this.db);
        assertForeignKeyIntegrity(this.db);
        setSchemaVersion(this.db, migration.to);
        version = migration.to;
      }
      if (version !== CURRENT_SCHEMA_VERSION) {
        throw new Error(`SQLite migration stopped at schema version ${version}`);
      }
    });
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
    return ratingFromRow(row);
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
    return rows.map((row) => ratingFromRow(row));
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
    return rows.map((row) => ratingFromRow(row));
  }

  saveRating(record: RatingRecord): void {
    const normalized = normalizeRatingRecord(record);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ratings (key, generation, rating, games, rating_deviation, volatility)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalized.key,
        normalized.generation,
        normalized.rating,
        normalized.games,
        normalized.ratingDeviation ?? null,
        normalized.volatility ?? null
      );
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
        0,
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
          rating_generation,
          config_json,
          started_at,
          deadline_at,
          status,
          correct_count,
          mistake_count,
          rating_before
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        state.id,
        state.config.mode,
        state.config.ratingKey,
        state.ratingGeneration ?? this.getRating(state.config.ratingKey).generation,
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
             rating_generation = COALESCE(?, rating_generation),
             completed_at = ?,
             end_reason = ?,
             correct_count = ?,
             mistake_count = ?,
             rating_after = ?
         WHERE id = ?`
      )
      .run(
        state.status,
        state.ratingGeneration ?? null,
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
    const clauses: string[] = [];
    const params: SyncSqliteValue[] = [];
    if (filter.source !== undefined) {
      clauses.push("source = ?");
      params.push(filter.source);
    }
    if (filter.result !== undefined) {
      clauses.push("result = ?");
      params.push(filter.result);
    }
    if (filter.mode !== undefined) {
      clauses.push("mode = ?");
      params.push(filter.mode);
    }
    if (filter.since !== undefined) {
      clauses.push("completed_at >= ?");
      params.push(filter.since);
    }
    if (filter.puzzleId !== undefined) {
      clauses.push("puzzle_id = ?");
      params.push(filter.puzzleId);
    }
    if (filter.sessionId !== undefined) {
      clauses.push("session_id = ?");
      params.push(filter.sessionId);
    }
    const where = clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;
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
         ${where}
         ORDER BY completed_at DESC, id DESC`
      )
      .all(...params) as AttemptHistoryDbRow[];

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
      reviewQueue: this.listReviewQueue().map(exportReviewQueueState),
      sprintSessions: this.listSprintSessions()
    };
  }

  importLocalData(data: LocalDataImport): LocalDataImportResult {
    const result: LocalDataImportResult = {
      ratings: 0,
      attempts: 0,
      reviewQueue: 0,
      sprintSessions: 0
    };
    this.transaction(() => {
      this.saveSettings({
        ...this.getSettings(),
        notifications: clonePracticeSettings(data.settings).notifications
      });
      for (const rating of data.ratings) {
        const previous = this.getRating(rating.key);
        const next = preferredRating(previous, rating);
        if (!sameRating(previous, next)) {
          this.saveRating(next);
          result.ratings += 1;
        }
      }
      for (const session of data.sprintSessions) {
        if (this.importSprintSession(session)) {
          result.sprintSessions += 1;
        }
      }
      for (const attempt of data.attempts) {
        if (this.importAttempt(attempt)) {
          result.attempts += 1;
        }
      }
      for (const importedReview of data.reviewQueue) {
        const review = normalizeImportedReviewQueueState(importedReview);
        if (!this.getPuzzle(review.puzzleId)) {
          continue;
        }
        const previous = this.getReviewQueueState(review);
        const next = preferredReviewQueue(previous, review);
        if (!sameReviewQueue(previous, next)) {
          this.saveReviewQueueState(next);
          result.reviewQueue += 1;
        }
      }
    });
    return result;
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
          next_due_day,
          interval_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(this.options.randomId(), context.puzzleId, context.mode, context.ratingKey, result, now, next.dueDay, next.intervalDays);
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

  promoteNextFutureReviewsToDue(now: string): ReviewQueueDuePromotionResult {
    const today = reviewDayFor(now);
    const nextFuture = this.db
      .prepare("SELECT due_day AS dueDay FROM review_queue WHERE due_day > ? ORDER BY due_day ASC, puzzle_id ASC, mode ASC, rating_key ASC LIMIT 1")
      .get(today) as { dueDay: string } | undefined;
    if (!nextFuture) {
      return { promotedCount: 0 };
    }

    const promotedDate = nextFuture.dueDay;
    const promotedCount = (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM review_queue WHERE due_day = ?")
        .get(promotedDate) as { count: number }
    ).count;

    if (promotedCount > 0) {
      this.db
        .prepare("UPDATE review_queue SET due_day = ? WHERE due_day = ?")
        .run(today, promotedDate);
    }

    return {
      promotedCount,
      promotedDate,
      dueDay: today
    };
  }

  getDueReviews(now: string): ReviewQueueState[] {
    const today = reviewDayFor(now);
    const rows = this.db
      .prepare("SELECT * FROM review_queue WHERE due_day <= ? ORDER BY due_day ASC, puzzle_id ASC, mode ASC, rating_key ASC")
      .all(today) as ReviewRow[];
    return orderReviewQueue(rows.map(reviewFromRow));
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
      elo: query.ratingKey ? this.selectHistoryElo(query.ratingKey, range.since, range.until) : [],
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
          due_day,
          interval_days,
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
        state.dueDay,
        state.intervalDays,
        state.reviewCount,
        state.successStreak,
        state.lapseCount,
        state.lastResult,
        state.lastReviewedAt
      );
  }

  private selectHistoryAttempts(ratingKey: string | undefined, since: string | undefined, until: string): HistoryAttemptView[] {
    const clauses: string[] = [];
    const params: SyncSqliteValue[] = [];
    if (ratingKey !== undefined) {
      clauses.push("COALESCE(a.rating_key, s.rating_key) = ?");
      params.push(ratingKey);
    }
    if (since !== undefined) {
      clauses.push("a.completed_at >= ?");
      params.push(since);
    }
    clauses.push("a.completed_at <= ?");
    params.push(until);
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
         WHERE ${clauses.join(" AND ")}
         ORDER BY a.completed_at DESC, a.id DESC`
      )
      .all(...params) as HistoryAttemptDbRow[];

    return rows.map((row) => {
      const puzzle = puzzleFromRow(row);
      const candidateOrder = optionalHistoryStringArrayFromJson(row.arrow_duel_candidate_order_json);
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
    const clauses = [
      "rating_key = ?",
      "completed_at IS NOT NULL",
      "rating_after IS NOT NULL"
    ];
    const params: SyncSqliteValue[] = [ratingKey];
    if (since !== undefined) {
      clauses.push("completed_at >= ?");
      params.push(since);
    }
    clauses.push("completed_at <= ?");
    params.push(until);
    const rows = this.db
      .prepare(
        `SELECT
          id AS session_id,
          completed_at,
          rating_before,
          rating_after
         FROM sprint_sessions
         WHERE ${clauses.join(" AND ")}
         ORDER BY completed_at ASC, id ASC`
      )
      .all(...params) as HistoryEloDbRow[];
    return rows.map((row) => ({
      sessionId: row.session_id,
      completedAt: row.completed_at,
      ratingBefore: row.rating_before,
      ratingAfter: row.rating_after
    }));
  }

  private listAllReviewQueueStates(): ReviewQueueState[] {
    const rows = this.db.prepare("SELECT * FROM review_queue ORDER BY due_day ASC, puzzle_id ASC, mode ASC, rating_key ASC").all() as ReviewRow[];
    return orderReviewQueue(rows.map(reviewFromRow));
  }

  listSprintSessions(): ExportedSprintSession[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          mode,
          rating_key AS ratingKey,
          rating_generation AS ratingGeneration,
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

    return rows.map(exportedSprintSessionFromRow);
  }

  private importSprintSession(session: ExportedSprintSession): boolean {
    const existingRow = this.db
      .prepare(
        `SELECT
          id,
          mode,
          rating_key AS ratingKey,
          rating_generation AS ratingGeneration,
          started_at AS startedAt,
          completed_at AS completedAt,
          status,
          correct_count AS correctCount,
          mistake_count AS mistakeCount,
          rating_before AS ratingBefore,
          rating_after AS ratingAfter
         FROM sprint_sessions
         WHERE id = ?`
      )
      .get(session.id) as SprintSessionExportRow | undefined;
    if (existingRow && (session.status === "active" || session.status === "paused")) {
      return false;
    }
    const previous = existingRow ? exportedSprintSessionFromRow(existingRow) : undefined;
    const incoming = normalizedImportedSprintSession(session);
    const next = previous ? preferredSprintSession(previous, incoming) : incoming;
    if (sameSprintSession(previous, next)) {
      return false;
    }
    const completedAt = next.completedAt ?? next.startedAt;
    if (existingRow) {
      this.db
        .prepare(
          `UPDATE sprint_sessions
           SET mode = ?,
               rating_key = ?,
               rating_generation = ?,
               started_at = ?,
               deadline_at = ?,
               completed_at = ?,
               status = ?,
               correct_count = ?,
               mistake_count = ?,
               rating_before = ?,
               rating_after = ?
           WHERE id = ?`
        )
        .run(
          next.mode,
          next.ratingKey,
          next.ratingGeneration ?? null,
          next.startedAt,
          completedAt,
          completedAt,
          next.status,
          next.correctCount,
          next.mistakeCount,
          next.ratingBefore,
          next.ratingAfter ?? null,
          next.id
        );
      return true;
    }
    this.db
      .prepare(
        `INSERT INTO sprint_sessions (
          id,
          mode,
          rating_key,
          rating_generation,
          config_json,
          started_at,
          deadline_at,
          completed_at,
          status,
          correct_count,
          mistake_count,
          rating_before,
          rating_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        next.id,
        next.mode,
        next.ratingKey,
        next.ratingGeneration ?? null,
        JSON.stringify({ source: "icloud_sync", mode: next.mode, ratingKey: next.ratingKey }),
        next.startedAt,
        completedAt,
        completedAt,
        next.status,
        next.correctCount,
        next.mistakeCount,
        next.ratingBefore,
        next.ratingAfter ?? null
      );
    return true;
  }

  private importAttempt(attempt: AttemptEvent): boolean {
    const existing = this.db.prepare("SELECT id FROM attempts WHERE id = ?").get(attempt.id);
    if (existing || !this.getPuzzle(attempt.puzzleId)) {
      return false;
    }
    this.ensureSessionForAttempt(attempt);
    this.recordAttempt(attempt);
    return true;
  }

  private ensureSessionForAttempt(attempt: AttemptEvent): void {
    const existing = this.db.prepare("SELECT id FROM sprint_sessions WHERE id = ?").get(attempt.sessionId);
    if (existing) {
      return;
    }
    this.db
      .prepare(
        `INSERT INTO sprint_sessions (
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
        JSON.stringify({ source: "icloud_sync", mode: attempt.mode, ratingKey: attempt.ratingKey }),
        attempt.startedAt,
        attempt.completedAt,
        attempt.completedAt,
        attempt.result === "correct" ? "won" : "failed",
        attempt.result === "correct" ? 1 : 0,
        attempt.result === "wrong" ? 1 : 0,
        attempt.ratingBefore,
        attempt.ratingAfter ?? null
      );
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

}

function migrateUnversionedSchemaToV1(db: SyncSqliteDatabase): void {
  db.exec(SCHEMA_V1_SQL);
  ensureColumn(
    db,
    "app_settings",
    "sync_upload_allowed",
    "ALTER TABLE app_settings ADD COLUMN sync_upload_allowed INTEGER NOT NULL DEFAULT 0"
  );
  ensureColumn(
    db,
    "attempts",
    "arrow_duel_candidate_order_json",
    "ALTER TABLE attempts ADD COLUMN arrow_duel_candidate_order_json TEXT"
  );
  ensureColumn(
    db,
    "ratings",
    "rating_deviation",
    "ALTER TABLE ratings ADD COLUMN rating_deviation REAL NOT NULL DEFAULT 350"
  );
  ensureColumn(
    db,
    "ratings",
    "volatility",
    "ALTER TABLE ratings ADD COLUMN volatility REAL NOT NULL DEFAULT 0.06"
  );
}

function migrateV1ToV2(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "attempts",
    "rating_key",
    "ALTER TABLE attempts ADD COLUMN rating_key TEXT"
  );
  db.prepare(
    `UPDATE attempts
     SET rating_key = (
       SELECT sprint_sessions.rating_key
       FROM sprint_sessions
       WHERE sprint_sessions.id = attempts.session_id
     )
     WHERE rating_key IS NULL
       AND EXISTS (
         SELECT 1
         FROM sprint_sessions
         WHERE sprint_sessions.id = attempts.session_id
       )`
  ).run();
  db.exec(INDEX_V2_SQL);
}

function migrateV2ToV3(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "sprint_sessions",
    "rating_generation",
    "ALTER TABLE sprint_sessions ADD COLUMN rating_generation INTEGER"
  );
  const ratingRows = db
    .prepare(
      `SELECT r.*
       FROM ratings r
       JOIN (
         SELECT key, MAX(generation) AS generation
         FROM ratings
         GROUP BY key
       ) latest ON latest.key = r.key AND latest.generation = r.generation`
    )
    .all() as RatingRow[];
  const ratings = ratingRows.map(ratingFromRow);
  const tagSession = db.prepare(
    "UPDATE sprint_sessions SET rating_generation = ? WHERE id = ? AND rating_generation IS NULL"
  );
  for (const rating of ratings) {
    if (rating.generation === 0) {
      db.prepare(
        "UPDATE sprint_sessions SET rating_generation = 0 WHERE rating_key = ? AND rating_generation IS NULL"
      ).run(rating.key);
      continue;
    }
    db.prepare(
      `UPDATE sprint_sessions
       SET rating_generation = ?
       WHERE rating_key = ?
         AND rating_generation IS NULL
         AND status IN ('active', 'paused')`
    ).run(rating.generation, rating.key);
    const sessionRows = db
      .prepare(
        `SELECT
          id,
          mode,
          rating_key AS ratingKey,
          rating_generation AS ratingGeneration,
          started_at AS startedAt,
          completed_at AS completedAt,
          status,
          correct_count AS correctCount,
          mistake_count AS mistakeCount,
          rating_before AS ratingBefore,
          rating_after AS ratingAfter
         FROM sprint_sessions
         WHERE rating_key = ?
         ORDER BY started_at DESC, id DESC`
      )
      .all(rating.key) as SprintSessionExportRow[];
    const assigned = assignLegacyRatingGenerations(
      [rating],
      sessionRows.map(exportedSprintSessionFromRow)
    );
    for (const session of assigned) {
      if (session.ratingGeneration === rating.generation) {
        tagSession.run(rating.generation, session.id);
      }
    }
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS sprint_sessions_rating_generation_completed_at_id_idx " +
    "ON sprint_sessions(rating_key, rating_generation, completed_at, id)"
  );
}

function migrateV3ToV4(db: SyncSqliteDatabase): void {
  db.exec(`
    CREATE TABLE review_queue_v4 (
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'standard',
      rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
      due_day TEXT NOT NULL,
      interval_days INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      success_streak INTEGER NOT NULL,
      lapse_count INTEGER NOT NULL,
      last_result TEXT NOT NULL,
      last_reviewed_at TEXT NOT NULL,
      PRIMARY KEY (puzzle_id, mode, rating_key),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
    );

    INSERT INTO review_queue_v4 (
      puzzle_id,
      mode,
      rating_key,
      due_day,
      interval_days,
      review_count,
      success_streak,
      lapse_count,
      last_result,
      last_reviewed_at
    )
    SELECT
      puzzle_id,
      mode,
      rating_key,
      COALESCE(strftime('%Y-%m-%d', due_at, 'localtime', '-4 hours'), substr(due_at, 1, 10)),
      MAX(1, CAST((interval_hours + 23) / 24 AS INTEGER)),
      review_count,
      success_streak,
      lapse_count,
      last_result,
      last_reviewed_at
    FROM review_queue;

    CREATE TABLE review_events_v4 (
      id TEXT PRIMARY KEY,
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'standard',
      rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
      result TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      next_due_day TEXT NOT NULL,
      interval_days INTEGER NOT NULL,
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
    );

    INSERT INTO review_events_v4 (
      id,
      puzzle_id,
      mode,
      rating_key,
      result,
      reviewed_at,
      next_due_day,
      interval_days
    )
    SELECT
      id,
      puzzle_id,
      mode,
      rating_key,
      result,
      reviewed_at,
      COALESCE(strftime('%Y-%m-%d', next_due_at, 'localtime', '-4 hours'), substr(next_due_at, 1, 10)),
      MAX(1, CAST((interval_hours + 23) / 24 AS INTEGER))
    FROM review_events;

    DROP TABLE review_events;
    DROP TABLE review_queue;
    ALTER TABLE review_queue_v4 RENAME TO review_queue;
    ALTER TABLE review_events_v4 RENAME TO review_events;

    CREATE INDEX review_queue_due_day_order_idx ON review_queue(due_day, puzzle_id, mode, rating_key);
    CREATE INDEX review_events_puzzle_id_idx ON review_events(puzzle_id);
    CREATE INDEX review_events_reviewed_at_idx ON review_events(reviewed_at);
  `);
}

function ensureColumn(db: SyncSqliteDatabase, table: string, column: string, alterSql: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((candidate) => candidate.name === column)) {
    db.exec(alterSql);
  }
}

function readSchemaVersion(db: SyncSqliteDatabase): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: unknown } | undefined;
  const version = row?.user_version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw new Error(`SQLite returned an invalid schema version: ${String(version)}`);
  }
  return version;
}

function setSchemaVersion(db: SyncSqliteDatabase, version: number): void {
  db.exec(`PRAGMA user_version = ${version}`);
}

function assertForeignKeyIntegrity(db: SyncSqliteDatabase): void {
  const violations = db.prepare("PRAGMA foreign_key_check").all();
  if (violations.length > 0) {
    throw new Error(`SQLite migration found ${violations.length} foreign key violation(s)`);
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

function ratingFromRow(row: RatingRow): RatingRecord {
  return normalizeRatingRecord({
    key: row.key,
    generation: row.generation,
    rating: row.rating,
    ...(row.rating_deviation === null ? {} : { ratingDeviation: row.rating_deviation }),
    ...(row.volatility === null ? {} : { volatility: row.volatility }),
    games: row.games
  });
}

function reviewFromRow(row: ReviewRow): ReviewQueueState {
  return {
    puzzleId: row.puzzle_id,
    mode: row.mode,
    ratingKey: row.rating_key,
    dueDay: row.due_day,
    intervalDays: row.interval_days,
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
      iCloudEnabled: intToBool(row.sync_icloud_enabled)
    },
    notifications: {
      reviewReminder: reminder
    }
  };
}

function preferredRating(local: RatingRecord, incoming: RatingRecord): RatingRecord {
  const normalizedLocal = normalizeRatingRecord(local);
  const normalizedIncoming = normalizeRatingRecord(incoming);
  if (normalizedIncoming.generation !== normalizedLocal.generation) {
    return normalizedIncoming.generation > normalizedLocal.generation ? normalizedIncoming : normalizedLocal;
  }
  if (normalizedIncoming.games !== normalizedLocal.games) {
    return normalizedIncoming.games > normalizedLocal.games ? normalizedIncoming : normalizedLocal;
  }
  return normalizedIncoming;
}

function sameRating(left: RatingRecord, right: RatingRecord): boolean {
  return left.key === right.key &&
    left.generation === right.generation &&
    left.rating === right.rating &&
    left.games === right.games &&
    left.ratingDeviation === right.ratingDeviation &&
    left.volatility === right.volatility;
}

function preferredReviewQueue(
  local: ReviewQueueState | undefined,
  incoming: ReviewQueueState
): ReviewQueueState {
  if (!local) {
    return incoming;
  }
  const reviewComparison = incoming.lastReviewedAt.localeCompare(local.lastReviewedAt);
  if (reviewComparison !== 0) {
    return reviewComparison > 0 ? incoming : local;
  }
  const dueComparison = incoming.dueDay.localeCompare(local.dueDay);
  if (dueComparison !== 0) {
    return dueComparison > 0 ? incoming : local;
  }
  return incoming;
}

function sameReviewQueue(left: ReviewQueueState | undefined, right: ReviewQueueState): boolean {
  return left !== undefined &&
    left.puzzleId === right.puzzleId &&
    left.mode === right.mode &&
    left.ratingKey === right.ratingKey &&
    left.dueDay === right.dueDay &&
    left.intervalDays === right.intervalDays &&
    left.reviewCount === right.reviewCount &&
    left.successStreak === right.successStreak &&
    left.lapseCount === right.lapseCount &&
    left.lastResult === right.lastResult &&
    left.lastReviewedAt === right.lastReviewedAt;
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

function optionalHistoryStringArrayFromJson(value: string | null): string[] | undefined {
  try {
    return optionalStringArrayFromJson(value);
  } catch {
    // Candidate order is optional reconstruction metadata. A damaged legacy
    // value must not make otherwise readable History unavailable.
    return undefined;
  }
}

function countRows(db: SyncSqliteDatabase, table: string, where?: string): number {
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  return (db.prepare(sql).get() as { count: number }).count;
}

function exportedSprintSessionFromRow(row: SprintSessionExportRow): ExportedSprintSession {
  return {
    id: row.id,
    mode: row.mode,
    ratingKey: row.ratingKey,
    ...(row.ratingGeneration === null ? {} : { ratingGeneration: row.ratingGeneration }),
    startedAt: row.startedAt,
    ...(row.completedAt === null ? {} : { completedAt: row.completedAt }),
    status: row.status,
    correctCount: row.correctCount,
    mistakeCount: row.mistakeCount,
    ratingBefore: row.ratingBefore,
    ...(row.ratingAfter === null ? {} : { ratingAfter: row.ratingAfter })
  };
}

function normalizedImportedSprintSession(session: ExportedSprintSession): ExportedSprintSession {
  if (session.status !== "active" && session.status !== "paused") {
    return { ...session };
  }
  return {
    ...session,
    status: "failed",
    completedAt: session.completedAt ?? session.startedAt
  };
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function intToBool(value: number): boolean {
  return value !== 0;
}

// This is the frozen schema produced by migration 0 -> 1. Add a new migration
// instead of editing it after schema version 1 has shipped.
const SCHEMA_V1_SQL = `
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
  rating_deviation REAL NOT NULL DEFAULT 350,
  volatility REAL NOT NULL DEFAULT 0.06,
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

const INDEX_V2_SQL = `
DROP INDEX IF EXISTS attempts_completed_at_idx;
DROP INDEX IF EXISTS attempts_result_idx;
DROP INDEX IF EXISTS attempts_mode_idx;
DROP INDEX IF EXISTS attempts_session_id_idx;
DROP INDEX IF EXISTS sprint_sessions_rating_key_completed_at_idx;
DROP INDEX IF EXISTS custom_sprint_configs_last_started_at_idx;
DROP INDEX IF EXISTS review_queue_due_at_idx;
DROP INDEX IF EXISTS review_events_reviewed_at_idx;

CREATE INDEX IF NOT EXISTS puzzles_rating_id_idx ON puzzles(rating, id);
CREATE INDEX IF NOT EXISTS attempts_completed_at_id_idx ON attempts(completed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS attempts_rating_key_completed_at_id_idx ON attempts(rating_key, completed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS attempts_session_result_completed_at_id_idx ON attempts(session_id, result, completed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS attempts_puzzle_id_completed_at_id_idx ON attempts(puzzle_id, completed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS sprint_sessions_rating_key_completed_at_id_idx ON sprint_sessions(rating_key, completed_at, id);
CREATE INDEX IF NOT EXISTS sprint_sessions_started_at_id_idx ON sprint_sessions(started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS custom_sprint_configs_last_started_at_id_idx ON custom_sprint_configs(last_started_at DESC, id ASC);
CREATE INDEX IF NOT EXISTS review_queue_due_at_order_idx ON review_queue(due_at, puzzle_id, mode, rating_key);
CREATE INDEX IF NOT EXISTS review_events_puzzle_id_idx ON review_events(puzzle_id);
`;
