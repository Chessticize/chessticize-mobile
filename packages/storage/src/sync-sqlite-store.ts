import {
  buildHistoryView,
  ATTEMPT_MISTAKE_OUTCOMES,
  curatedPuzzleThemes,
  clonePracticeRun,
  buildSessionMistakeReview,
  createDefaultRating,
  DEFAULT_OPPONENT_REPLY_SECONDS,
  defaultPuzzleTimingPolicy,
  enrollReviewContext,
  filterHistoryAttemptsForQuery,
  normalizeThemeSelection,
  normalizeRatingRecord,
  mergePracticeRunCatalogs,
  namedThemesForSelection,
  OPPONENT_REPLY_MAX_SECONDS,
  OPPONENT_REPLY_MIN_SECONDS,
  orderReviewQueue,
  practiceRunsFromLegacyCustomConfigs,
  preferredReviewScheduleChange,
  removeReviewContext,
  resetRating as resetRatingRecord,
  resolveOpponentReplyConfig,
  resolveHistoryRange,
  reviewDayFor,
  scheduleMistakeForContext,
  scheduleReview,
  samePracticeRun,
  sameReviewContext,
  sideToMoveForHistoryPuzzle,
  isAttemptMistake,
  updateAttemptUnclearState
} from "../../core/src/index.ts";
import type {
  AppReviewRequestAttempt,
  AttemptEvent,
  AttemptOutcome,
  AttemptResult,
  AttemptTimingStatus,
  CustomSprintConfigRecord,
  HistoryAttemptView,
  HistoryEloPoint,
  HistoryQuery,
  HistoryView,
  Puzzle,
  PracticeRunKind,
  PracticeRunRecord,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  ReviewScheduleChange,
  ReviewScheduleRemoval,
  SessionMistakeReviewItem,
  SprintMode,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type {
  ClearSyncedHistoryResult,
  ExportedSprintSession,
  LocalDataImport,
  LocalDataImportObserver,
  LocalDataImportResult,
  LocalDataExport,
  PracticeRatingActivity,
  PracticeSettings,
  PracticeStore,
  ReviewQueueDuePromotionResult
} from "./practice-store.ts";
import { exportReviewQueueState, normalizeImportedReviewQueueState } from "./practice-store.ts";
import { clonePracticeSettings, defaultPracticeSettings, normalizeReviewReminderPreference, reviewReminderPreferenceToSettings } from "./practice-settings.ts";
import {
  selectUniquePuzzles,
  selectUniquePuzzlesForRatingBands
} from "./puzzle-selection.ts";
import type {
  RatingBandPuzzleSelection,
  RatingBandPuzzleSelectionInput
} from "./puzzle-source.ts";
import { preferredSprintSession, sameSprintSession } from "./sprint-session-sync.ts";
import { assignLegacyRatingGenerations } from "./rating-history.ts";
import type { PracticeProgressSummary } from "./rating-history.ts";
import type { ReviewReminderPreference } from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";
import { cloneAttemptHistoryRow, preferredAttemptHistoryRow, sameAttemptHistoryRow } from "./attempt-sync.ts";
import {
  compatiblePracticeRunMergeInputs
} from "./practice-run-sync.ts";
import type {
  ProgressV2LocalState,
  ProgressV2OutboxEntry,
  ProgressV2OutboxStats,
  ProgressV2Persistence,
  ProgressV2RecordIdentity,
  ProgressV2StatePatch,
  ProgressV2Tombstone
} from "./progress-v2-persistence.ts";

interface AttemptHistoryDbRow extends Omit<
  AttemptHistoryRow,
  | "ratingAfter"
  | "submittedMove"
  | "elapsedMs"
  | "timingStatus"
  | "arrowDuelCandidateOrder"
  | "unclear"
  | "unclearUpdatedAt"
  | "runId"
  | "runName"
> {
  ratingAfter: number | null;
  submittedMove: string | null;
  elapsedMs: number | null;
  timingStatus: AttemptTimingStatus | null;
  arrowDuelCandidateOrderJson: string | null;
  unclear: number;
  unclearUpdatedAt: string | null;
  runId: string | null;
  runName: string | null;
}

interface HistoryAttemptDbRow extends PuzzleRow {
  attempt_id: string;
  attempt_source: "sprint" | "scheduled_review";
  session_id: string;
  mode: SprintMode;
  result: AttemptOutcome;
  submitted_move: string | null;
  expected_move: string;
  attempt_started_at: string;
  completed_at: string;
  elapsed_ms: number | null;
  timing_status: AttemptTimingStatus | null;
  rating_before: number;
  rating_after: number | null;
  arrow_duel_candidate_order_json: string | null;
  unclear: number;
  unclear_updated_at: string | null;
  rating_key: string;
  run_id: string | null;
  run_name: string | null;
  session_config_json: string;
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
  last_result: AttemptResult | null;
  last_reviewed_at: string | null;
  enrolled_at: string | null;
}

interface DueReviewItemDbRow extends PuzzleRow {
  review_puzzle_id: string;
  review_mode: SprintMode;
  review_rating_key: string;
  review_due_day: string;
  review_interval_days: number;
  review_count: number;
  review_success_streak: number;
  review_lapse_count: number;
  review_last_result: AttemptResult | null;
  review_last_reviewed_at: string | null;
  review_enrolled_at: string | null;
}

interface ReviewRemovalRow {
  puzzle_id: string;
  mode: SprintMode;
  rating_key: string;
  removed_at: string;
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

interface PracticeRunRow {
  id: string;
  kind: PracticeRunKind;
  name: string;
  mode: PracticeRunRecord["mode"];
  rating_key: string;
  duration_seconds: number;
  per_puzzle_seconds: number;
  slow_after_seconds?: number | null;
  timeout_after_seconds?: number | null;
  target_correct: number;
  max_mistakes: number;
  opponent_reply_enabled?: number;
  opponent_reply_seconds?: number;
  themes_json: string | null;
  home_order: number;
  archived: number;
  updated_at: string;
}

interface AppSettingsRow {
  id: string;
  sync_icloud_enabled: number;
  sync_upload_allowed: number;
  arrow_duel_opponent_reply_enabled: number;
  review_reminder_mode: PracticeSettings["notifications"]["reviewReminder"]["mode"];
  review_reminder_fixed_local_time: string | null;
  move_feedback_sound_enabled: number;
  move_feedback_haptics_enabled: number;
  sprint_rules_guide_seen: number;
  sprint_active_session_guide_seen: number;
  sprint_arrow_duel_guide_seen: number;
  sprint_focused_run_guide_seen: number;
  sprint_arrow_duel_reply_cue_stage: number;
}

interface AppReviewRequestStateRow {
  app_version: string;
  attempted_at: string;
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
  configJson?: string;
  runId?: string | null;
  runKind?: PracticeRunKind | null;
  runName?: string | null;
}

interface ProgressV2StateRow {
  phase: ProgressV2LocalState["phase"];
  zone_initialized: number;
  server_change_token: string | null;
  server_change_token_fingerprint: string | null;
  seeded_at: string | null;
  last_pull_at: string | null;
  last_push_at: string | null;
  last_v1_change_tag: string | null;
  pending_v1_change_tag: string | null;
  last_v1_import_at: string | null;
  last_v1_check_at: string | null;
  last_v1_check_status: "available" | "missing" | null;
  sealed_at: string | null;
}

interface ProgressV2OutboxRow {
  kind: ProgressV2RecordIdentity["kind"];
  entity_key: string;
  enqueued_at: string;
  revision: number;
}

interface ProgressV2TombstoneRow {
  kind: ProgressV2RecordIdentity["kind"];
  entity_key: string;
  deleted_at: string;
}

export type SyncSqliteValue =
  | string
  | number
  | null
  | ArrayBuffer
  | ArrayBufferView;

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

export const CURRENT_SCHEMA_VERSION = 21;
const MAX_SQL_ID_FILTER_VALUES = 400;

interface SQLiteMigration {
  from: number;
  to: number;
  apply: (db: SyncSqliteDatabase) => void;
}

const SQLITE_MIGRATIONS: readonly SQLiteMigration[] = [
  { from: 0, to: 1, apply: migrateUnversionedSchemaToV1 },
  { from: 1, to: 2, apply: migrateV1ToV2 },
  { from: 2, to: 3, apply: migrateV2ToV3 },
  { from: 3, to: 4, apply: migrateV3ToV4 },
  { from: 4, to: 5, apply: migrateV4ToV5 },
  { from: 5, to: 6, apply: migrateV5ToV6 },
  { from: 6, to: 7, apply: migrateV6ToV7 },
  { from: 7, to: 8, apply: migrateV7ToV8 },
  { from: 8, to: 9, apply: migrateV8ToV9 },
  { from: 9, to: 10, apply: migrateV9ToV10 },
  { from: 10, to: 11, apply: migrateV10ToV11 },
  { from: 11, to: 12, apply: migrateV11ToV12 },
  { from: 12, to: 13, apply: migrateV12ToV13 },
  { from: 13, to: 14, apply: migrateV13ToV14 },
  { from: 14, to: 15, apply: migrateV14ToV15 },
  { from: 15, to: 16, apply: migrateV15ToV16 },
  { from: 16, to: 17, apply: migrateV16ToV17 },
  { from: 17, to: 18, apply: migrateV17ToV18 },
  { from: 18, to: 19, apply: migrateV18ToV19 },
  { from: 19, to: 20, apply: migrateV19ToV20 },
  { from: 20, to: 21, apply: migrateV20ToV21 }
];

export class SyncSQLiteStore implements PracticeStore {
  readonly db: SyncSqliteDatabase;
  readonly progressV2: ProgressV2Persistence;
  private readonly options: SyncSQLiteStoreOptions;
  private transactionDepth = 0;

  constructor(db: SyncSqliteDatabase, options: SyncSQLiteStoreOptions) {
    this.db = db;
    this.options = options;
    this.progressV2 = {
      exportData: () => this.exportProgressV2Data(),
      readState: () => this.readProgressV2State(),
      writeState: (patch) => this.writeProgressV2State(patch),
      stageOutbox: (entries, enqueuedAt) => this.stageProgressV2Outbox(entries, enqueuedAt),
      listOutbox: (limit) => this.listProgressV2Outbox(limit),
      hasOutbox: (identity) => this.hasProgressV2Outbox(identity),
      getOutboxStats: () => this.getProgressV2OutboxStats(),
      acknowledgeOutbox: (entries, pushedAt) => this.acknowledgeProgressV2Outbox(entries, pushedAt),
      listTombstones: () => this.listProgressV2Tombstones(),
      applyTombstones: (tombstones) => this.applyProgressV2Tombstones(tombstones),
      applyRemoteBatch: (patch, work) => this.applyProgressV2RemoteBatch(patch, work),
      commitStateAndStage: (patch, entries, enqueuedAt) =>
        this.commitProgressV2StateAndStage(patch, entries, enqueuedAt)
    };
  }

  migrate(): void {
    this.db.exec("PRAGMA foreign_keys = ON");
    const startingVersion = readSchemaVersion(this.db);
    if (startingVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `SQLite schema version ${startingVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`
      );
    }
    if (
      startingVersion === CURRENT_SCHEMA_VERSION &&
      hasCurrentSettingsColumns(this.db) &&
      hasProgressV2Schema(this.db)
    ) {
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
      repairKnownSchemaDrift(this.db);
      assertForeignKeyIntegrity(this.db);
    });
  }

  transaction<T>(work: () => T): T {
    if (this.transactionDepth > 0) {
      this.transactionDepth += 1;
      try {
        return work();
      } finally {
        this.transactionDepth -= 1;
      }
    }
    this.db.exec("BEGIN IMMEDIATE");
    this.transactionDepth = 1;
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth = 0;
    }
  }

  private readProgressV2State(): ProgressV2LocalState {
    const row = this.db.prepare(
      "SELECT * FROM progress_v2_sync_state WHERE id = 'default'"
    ).get() as ProgressV2StateRow | undefined;
    if (!row) {
      throw new Error("Progress V2 SQLite state is not initialized");
    }
    return {
      phase: row.phase,
      zoneInitialized: intToBool(row.zone_initialized),
      ...(row.server_change_token === null ? {} : { serverChangeToken: row.server_change_token }),
      ...(row.server_change_token_fingerprint === null
        ? {}
        : { serverChangeTokenFingerprint: row.server_change_token_fingerprint }),
      ...(row.seeded_at === null ? {} : { seededAt: row.seeded_at }),
      ...(row.last_pull_at === null ? {} : { lastPullAt: row.last_pull_at }),
      ...(row.last_push_at === null ? {} : { lastPushAt: row.last_push_at }),
      ...(row.last_v1_change_tag === null ? {} : { lastV1ChangeTag: row.last_v1_change_tag }),
      ...(row.pending_v1_change_tag === null ? {} : { pendingV1ChangeTag: row.pending_v1_change_tag }),
      ...(row.last_v1_import_at === null ? {} : { lastV1ImportAt: row.last_v1_import_at }),
      ...(row.last_v1_check_at === null ? {} : { lastV1CheckAt: row.last_v1_check_at }),
      ...(row.last_v1_check_status === null ? {} : { lastV1CheckStatus: row.last_v1_check_status }),
      ...(row.sealed_at === null ? {} : { sealedAt: row.sealed_at })
    };
  }

  private writeProgressV2State(patch: ProgressV2StatePatch): void {
    const current = this.readProgressV2State();
    const value = <K extends keyof ProgressV2StatePatch>(key: K): ProgressV2StatePatch[K] =>
      patch[key] === undefined ? current[key as keyof ProgressV2LocalState] as ProgressV2StatePatch[K] : patch[key];
    this.db.prepare(
      `UPDATE progress_v2_sync_state
       SET phase = ?,
           zone_initialized = ?,
           server_change_token = ?,
           server_change_token_fingerprint = ?,
           seeded_at = ?,
           last_pull_at = ?,
           last_push_at = ?,
           last_v1_change_tag = ?,
           pending_v1_change_tag = ?,
           last_v1_import_at = ?,
           last_v1_check_at = ?,
           last_v1_check_status = ?,
           sealed_at = ?
       WHERE id = 'default'`
    ).run(
      value("phase") ?? "bridging",
      boolToInt(value("zoneInitialized") ?? false),
      value("serverChangeToken") ?? null,
      value("serverChangeTokenFingerprint") ?? null,
      value("seededAt") ?? null,
      value("lastPullAt") ?? null,
      value("lastPushAt") ?? null,
      value("lastV1ChangeTag") ?? null,
      value("pendingV1ChangeTag") ?? null,
      value("lastV1ImportAt") ?? null,
      value("lastV1CheckAt") ?? null,
      value("lastV1CheckStatus") ?? null,
      value("sealedAt") ?? null
    );
  }

  private stageProgressV2Outbox(
    entries: readonly ProgressV2RecordIdentity[],
    enqueuedAt: string
  ): void {
    const statement = this.db.prepare(
      `INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at, revision)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(kind, entity_key) DO UPDATE SET
         enqueued_at = excluded.enqueued_at,
         revision = progress_v2_outbox.revision + 1`
    );
    this.transaction(() => {
      for (const entry of entries) {
        statement.run(entry.kind, entry.entityKey, enqueuedAt);
      }
    });
  }

  private listProgressV2Outbox(limit = 400): ProgressV2OutboxEntry[] {
    const boundedLimit = Math.max(1, Math.min(400, Math.trunc(limit)));
    return (this.db.prepare(
      `SELECT kind, entity_key, enqueued_at, revision
       FROM progress_v2_outbox
       ORDER BY CASE WHEN kind = 'manifest' THEN 1 ELSE 0 END ASC,
                enqueued_at ASC,
                kind ASC,
                entity_key ASC
       LIMIT ?`
    ).all(boundedLimit) as ProgressV2OutboxRow[]).map((row) => ({
      kind: row.kind,
      entityKey: row.entity_key,
      enqueuedAt: row.enqueued_at,
      revision: row.revision
    }));
  }

  private getProgressV2OutboxStats(): ProgressV2OutboxStats {
    const row = this.db.prepare(
      `SELECT COUNT(*) AS pending_count, MIN(enqueued_at) AS oldest_enqueued_at
       FROM progress_v2_outbox`
    ).get() as { pending_count: number; oldest_enqueued_at: string | null };
    return {
      pendingCount: row.pending_count,
      ...(row.oldest_enqueued_at === null ? {} : { oldestEnqueuedAt: row.oldest_enqueued_at })
    };
  }

  private hasProgressV2Outbox(identity: ProgressV2RecordIdentity): boolean {
    return this.db.prepare(
      "SELECT 1 FROM progress_v2_outbox WHERE kind = ? AND entity_key = ?"
    ).get(identity.kind, identity.entityKey) !== undefined;
  }

  private acknowledgeProgressV2Outbox(
    entries: readonly ProgressV2OutboxEntry[],
    pushedAt: string
  ): void {
    const statement = this.db.prepare(
      `DELETE FROM progress_v2_outbox
       WHERE kind = ? AND entity_key = ? AND revision = ?`
    );
    this.transaction(() => {
      for (const entry of entries) {
        statement.run(entry.kind, entry.entityKey, entry.revision);
      }
      this.writeProgressV2State({ lastPushAt: pushedAt });
    });
  }

  private listProgressV2Tombstones(): ProgressV2Tombstone[] {
    return (this.db.prepare(
      `SELECT kind, entity_key, deleted_at
       FROM progress_v2_tombstones
       ORDER BY kind ASC, entity_key ASC`
    ).all() as ProgressV2TombstoneRow[]).map((row) => ({
      kind: row.kind,
      entityKey: row.entity_key,
      deletedAt: row.deleted_at
    }));
  }

  private applyProgressV2Tombstones(tombstones: readonly ProgressV2Tombstone[]): void {
    const save = this.db.prepare(
      `INSERT INTO progress_v2_tombstones (kind, entity_key, deleted_at)
       VALUES (?, ?, ?)
       ON CONFLICT(kind, entity_key) DO UPDATE SET deleted_at = excluded.deleted_at
       WHERE excluded.deleted_at > progress_v2_tombstones.deleted_at`
    );
    this.transaction(() => {
      for (const tombstone of [...tombstones].sort(compareProgressV2Tombstones)) {
        save.run(tombstone.kind, tombstone.entityKey, tombstone.deletedAt);
        switch (tombstone.kind) {
          case "attempt":
            this.db.prepare("DELETE FROM attempts WHERE id = ?").run(tombstone.entityKey);
            break;
          case "sprint_session":
            this.db.prepare(
              `DELETE FROM sprint_sessions
               WHERE id = ?
                 AND NOT EXISTS (SELECT 1 FROM attempts WHERE attempts.session_id = sprint_sessions.id)`
            ).run(tombstone.entityKey);
            break;
          case "practice_run":
            this.db.prepare("DELETE FROM practice_runs WHERE id = ?").run(tombstone.entityKey);
            break;
          case "review_schedule": {
            const [puzzleId, mode, ratingKey] = tombstone.entityKey.split("\u001f");
            if (puzzleId && mode && ratingKey) {
              this.saveReviewRemoval({
                puzzleId,
                mode: mode as SprintMode,
                ratingKey,
                removedAt: tombstone.deletedAt
              });
              this.db.prepare(
                "DELETE FROM review_queue WHERE puzzle_id = ? AND mode = ? AND rating_key = ?"
              ).run(puzzleId, mode, ratingKey);
            }
            break;
          }
          case "manifest":
          case "preferences":
          case "rating":
            throw new Error(`Progress V2 does not support deleting ${tombstone.kind} records`);
        }
      }
    });
  }

  private applyProgressV2RemoteBatch<T>(patch: ProgressV2StatePatch, work: () => T): T {
    return this.transaction(() => {
      this.db.prepare(
        "UPDATE progress_v2_sync_state SET outbox_suppressed = 1 WHERE id = 'default'"
      ).run();
      const result = work();
      this.writeProgressV2State(patch);
      this.db.prepare(
        "UPDATE progress_v2_sync_state SET outbox_suppressed = 0 WHERE id = 'default'"
      ).run();
      return result;
    });
  }

  private commitProgressV2StateAndStage(
    patch: ProgressV2StatePatch,
    entries: readonly ProgressV2RecordIdentity[],
    enqueuedAt: string
  ): void {
    this.transaction(() => {
      this.writeProgressV2State(patch);
      this.stageProgressV2Outbox(entries, enqueuedAt);
    });
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

  countPuzzles(filter?: PuzzleSelectionFilter): number {
    if (filter !== undefined) {
      return this.selectPuzzles(filter).length;
    }
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM puzzles").get() as { count: number };
    return row.count;
  }

  getPuzzle(id: string): Puzzle | undefined {
    const row = this.db.prepare("SELECT * FROM puzzles WHERE id = ?").get(id) as PuzzleRow | undefined;
    return row ? puzzleFromRow(row) : undefined;
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    const rows = this.db
      .prepare(
        filter.preferredRating === undefined
          ? "SELECT * FROM puzzles WHERE rating >= ? AND rating <= ? ORDER BY rating ASC, id ASC"
          : "SELECT * FROM puzzles WHERE rating >= ? AND rating <= ? ORDER BY ABS(rating - ?) ASC, id ASC"
      )
      .all(
        filter.minRating ?? 0,
        filter.maxRating ?? 4000,
        ...(filter.preferredRating === undefined
          ? []
          : [filter.preferredRating])
      ) as PuzzleRow[];

    return selectUniquePuzzles({
      puzzles: rows.map(puzzleFromRow),
      mode: filter.mode,
      limit: filter.limit,
      ...(filter.rating === undefined ? {} : { rating: filter.rating }),
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.themes === undefined ? {} : { themes: filter.themes }),
      ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
      ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
      ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
    });
  }

  selectPuzzlesForRatingBands(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[] {
    const widestHalfWidth = Math.max(...input.halfWidths, 0);
    const rows = this.db
      .prepare(
        `SELECT *
         FROM puzzles
         WHERE rating >= ? AND rating <= ?
         ORDER BY ABS(rating - ?) ASC, id ASC`
      )
      .all(
        Math.max(0, input.ratingAnchor - widestHalfWidth),
        input.ratingAnchor + widestHalfWidth,
        input.ratingAnchor
      ) as PuzzleRow[];
    return selectUniquePuzzlesForRatingBands(
      rows.map(puzzleFromRow),
      input
    );
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

  private listAllRatingGenerations(): RatingRecord[] {
    return (this.db.prepare(
      "SELECT * FROM ratings ORDER BY key ASC, generation ASC"
    ).all() as RatingRow[]).map(ratingFromRow);
  }

  private getRatingGeneration(key: string, generation: number): RatingRecord | undefined {
    const row = this.db.prepare(
      "SELECT * FROM ratings WHERE key = ? AND generation = ?"
    ).get(key, generation) as RatingRow | undefined;
    return row ? ratingFromRow(row) : undefined;
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
        encodeStoredThemeSelection(config),
        config.lastStartedAt,
        config.playCount
      );
  }

  listCustomSprintConfigs(): CustomSprintConfigRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM custom_sprint_configs ORDER BY last_started_at DESC, id ASC")
      .all() as CustomSprintConfigRow[];
    return rows.map(customSprintConfigFromRow);
  }

  savePracticeRun(run: PracticeRunRecord): void {
    const puzzleTiming = normalizedRunPuzzleTiming(run);
    const opponentReply = normalizedRunOpponentReply(run);
    this.db.prepare(
      `INSERT INTO practice_runs (
        id, kind, name, mode, rating_key, duration_seconds, per_puzzle_seconds,
        slow_after_seconds, timeout_after_seconds, target_correct, max_mistakes,
        opponent_reply_enabled, opponent_reply_seconds, themes_json, home_order,
        archived, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        name = excluded.name,
        mode = excluded.mode,
        rating_key = excluded.rating_key,
        duration_seconds = excluded.duration_seconds,
        per_puzzle_seconds = excluded.per_puzzle_seconds,
        slow_after_seconds = excluded.slow_after_seconds,
        timeout_after_seconds = excluded.timeout_after_seconds,
        target_correct = excluded.target_correct,
        max_mistakes = excluded.max_mistakes,
        opponent_reply_enabled = excluded.opponent_reply_enabled,
        opponent_reply_seconds = excluded.opponent_reply_seconds,
        themes_json = excluded.themes_json,
        home_order = excluded.home_order,
        archived = excluded.archived,
        updated_at = excluded.updated_at`
    ).run(
      run.id,
      run.kind,
      run.name,
      run.mode,
      run.ratingKey,
      run.durationSeconds,
      run.perPuzzleSeconds,
      puzzleTiming.slowAfterSeconds,
      puzzleTiming.timeoutAfterSeconds,
      run.targetCorrect,
      run.maxMistakes,
      boolToInt(opponentReply.enabled),
      opponentReply.seconds,
      run.themes === undefined ? null : JSON.stringify(run.themes),
      run.homeOrder,
      boolToInt(run.archived),
      run.updatedAt
    );
  }

  listPracticeRuns(): PracticeRunRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM practice_runs ORDER BY archived ASC, home_order ASC, id ASC"
    ).all() as PracticeRunRow[];
    return rows.map(practiceRunFromRow);
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
        `INSERT INTO app_settings (
          id,
          sync_icloud_enabled,
          sync_upload_allowed,
          arrow_duel_opponent_reply_enabled,
          review_reminder_mode,
          review_reminder_fixed_local_time,
          move_feedback_sound_enabled,
          move_feedback_haptics_enabled,
          sprint_rules_guide_seen,
          sprint_active_session_guide_seen,
          sprint_arrow_duel_guide_seen,
          sprint_focused_run_guide_seen,
          sprint_arrow_duel_reply_cue_stage
        ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sync_icloud_enabled = excluded.sync_icloud_enabled,
          sync_upload_allowed = excluded.sync_upload_allowed,
          arrow_duel_opponent_reply_enabled = excluded.arrow_duel_opponent_reply_enabled,
          review_reminder_mode = excluded.review_reminder_mode,
          review_reminder_fixed_local_time = excluded.review_reminder_fixed_local_time,
          move_feedback_sound_enabled = excluded.move_feedback_sound_enabled,
          move_feedback_haptics_enabled = excluded.move_feedback_haptics_enabled,
          sprint_rules_guide_seen = excluded.sprint_rules_guide_seen,
          sprint_active_session_guide_seen = excluded.sprint_active_session_guide_seen,
          sprint_arrow_duel_guide_seen = excluded.sprint_arrow_duel_guide_seen,
          sprint_focused_run_guide_seen = excluded.sprint_focused_run_guide_seen,
          sprint_arrow_duel_reply_cue_stage = excluded.sprint_arrow_duel_reply_cue_stage`
      )
      .run(
        boolToInt(cloned.sync.iCloudEnabled),
        0,
        boolToInt(cloned.arrowDuel.opponentReplyEnabled),
        cloned.notifications.reviewReminder.mode,
        cloned.notifications.reviewReminder.mode === "fixed"
          ? cloned.notifications.reviewReminder.fixedLocalTime
          : null,
        boolToInt(cloned.moveFeedback.soundEnabled),
        boolToInt(cloned.moveFeedback.hapticsEnabled),
        boolToInt(cloned.sprintGuides.rulesSeen),
        boolToInt(cloned.sprintGuides.activeSessionSeen),
        boolToInt(cloned.sprintGuides.arrowDuelSeen),
        boolToInt(cloned.sprintGuides.focusedRunSeen ?? false),
        cloned.sprintGuides.arrowDuelReplyCueStage ?? 0
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

  getAppReviewRequestAttempt(): AppReviewRequestAttempt | undefined {
    const row = this.db
      .prepare(
        `SELECT app_version, attempted_at
         FROM app_review_request_state
         WHERE singleton_id = 1`
      )
      .get() as AppReviewRequestStateRow | undefined;
    return row
      ? {
          appVersion: row.app_version,
          attemptedAt: row.attempted_at
        }
      : undefined;
  }

  saveAppReviewRequestAttempt(
    attempt: AppReviewRequestAttempt
  ): AppReviewRequestAttempt {
    this.db
      .prepare(
        `INSERT INTO app_review_request_state (
          singleton_id,
          app_version,
          attempted_at
        ) VALUES (1, ?, ?)
        ON CONFLICT(singleton_id) DO UPDATE SET
          app_version = excluded.app_version,
          attempted_at = excluded.attempted_at`
      )
      .run(attempt.appVersion, attempt.attemptedAt);
    return { ...attempt };
  }

  createSprintSession(state: SprintState): void {
    this.db
      .prepare(
        `INSERT INTO sprint_sessions (
          id,
          mode,
          rating_key,
          rating_generation,
          run_id,
          run_kind,
          run_name,
          config_json,
          started_at,
          deadline_at,
          status,
          correct_count,
          mistake_count,
          rating_before
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        state.id,
        state.config.mode,
        state.config.ratingKey,
        state.ratingGeneration ?? this.getRating(state.config.ratingKey).generation,
        state.run?.id ?? null,
        state.run?.kind ?? null,
        state.run?.name ?? null,
        sprintSessionConfigJson(state.config, {
          ...(state.ratingGamesBefore === undefined ? {} : { ratingGamesBefore: state.ratingGamesBefore }),
          ...(state.ratingDeviationBefore === undefined ? {} : { ratingDeviationBefore: state.ratingDeviationBefore }),
          ...(state.volatilityBefore === undefined ? {} : { volatilityBefore: state.volatilityBefore })
        }),
        state.startedAt,
        state.deadlineAt,
        state.status,
        state.correctCount,
        state.mistakeCount,
        state.ratingBefore
      );
  }

  updateSprintSession(state: SprintState): void {
    const previous = this.getSprintSessions([state.id])[0];
    const previouslyEligible =
      isTacticalProfileEvidenceSession(previous) &&
      this.countAttempts({ source: "sprint", sessionId: state.id }) > 0;
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
    const isNowEligible =
      isTacticalProfileEvidenceSession(state) &&
      this.countAttempts({ source: "sprint", sessionId: state.id }) > 0;
    if (!previouslyEligible && isNowEligible) {
      this.bumpTacticalProfileSourceRevision();
    }
  }

  recordAttempt(attempt: AttemptEvent): void {
    const storedAttempt = cloneAttemptHistoryRow(attempt);
    if (storedAttempt.source === "scheduled_review") {
      this.ensureSyntheticReviewSession(storedAttempt);
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
          elapsed_ms,
          timing_status,
          rating_before,
          rating_after,
          arrow_duel_candidate_order_json,
          unclear,
          unclear_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        storedAttempt.id,
        storedAttempt.source,
        storedAttempt.sessionId,
        storedAttempt.puzzleId,
        storedAttempt.mode,
        storedAttempt.ratingKey,
        storedAttempt.result,
        storedAttempt.submittedMove ?? null,
        storedAttempt.expectedMove,
        storedAttempt.startedAt,
        storedAttempt.completedAt,
        storedAttempt.elapsedMs ?? null,
        storedAttempt.timingStatus ?? null,
        storedAttempt.ratingBefore,
        storedAttempt.ratingAfter ?? null,
        storedAttempt.arrowDuelCandidateOrder ? JSON.stringify(storedAttempt.arrowDuelCandidateOrder) : null,
        storedAttempt.unclear ? 1 : 0,
        storedAttempt.unclearUpdatedAt ?? null
      );
    if (
      storedAttempt.source === "sprint" &&
      isTacticalProfileEvidenceSession(
        this.getSprintSessions([storedAttempt.sessionId])[0]
      )
    ) {
      this.bumpTacticalProfileSourceRevision();
    }
  }

  setAttemptUnclear(attemptId: string, unclear: boolean, updatedAt: string): AttemptHistoryRow {
    const attempt = this.attemptById(attemptId);
    if (!attempt) {
      throw new Error(`Attempt ${attemptId} was not found`);
    }
    const next = updateAttemptUnclearState(attempt, unclear, updatedAt);
    if (next === attempt) {
      return attempt;
    }
    this.db
      .prepare("UPDATE attempts SET unclear = ?, unclear_updated_at = ? WHERE id = ?")
      .run(next.unclear ? 1 : 0, next.unclearUpdatedAt ?? null, attemptId);
    return cloneAttemptHistoryRow(next);
  }

  getAttempt(attemptId: string): AttemptHistoryRow | undefined {
    return this.attemptById(attemptId);
  }

  countAttempts(filter: HistoryFilter = {}): number {
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
    if (filter.ratingKey !== undefined) {
      clauses.push("rating_key = ?");
      params.push(filter.ratingKey);
    }
    if (filter.since !== undefined) {
      clauses.push("completed_at >= ?");
      params.push(filter.since);
    }
    if (filter.until !== undefined) {
      clauses.push("completed_at < ?");
      params.push(filter.until);
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
    return (
      this.db.prepare(`SELECT COUNT(*) AS count FROM attempts ${where}`).get(...params) as { count: number }
    ).count;
  }

  listAttempts(filter: HistoryFilter = {}): AttemptHistoryRow[] {
    const clauses: string[] = [];
    const params: SyncSqliteValue[] = [];
    if (filter.source !== undefined) {
      clauses.push("a.source = ?");
      params.push(filter.source);
    }
    if (filter.result !== undefined) {
      clauses.push("a.result = ?");
      params.push(filter.result);
    }
    if (filter.mode !== undefined) {
      clauses.push("a.mode = ?");
      params.push(filter.mode);
    }
    if (filter.ratingKey !== undefined) {
      clauses.push("a.rating_key = ?");
      params.push(filter.ratingKey);
    }
    if (filter.since !== undefined) {
      clauses.push("a.completed_at >= ?");
      params.push(filter.since);
    }
    if (filter.until !== undefined) {
      clauses.push("a.completed_at < ?");
      params.push(filter.until);
    }
    if (filter.puzzleId !== undefined) {
      clauses.push("a.puzzle_id = ?");
      params.push(filter.puzzleId);
    }
    if (filter.sessionId !== undefined) {
      clauses.push("a.session_id = ?");
      params.push(filter.sessionId);
    }
    const where = clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;
    const rows = this.db
      .prepare(
        `SELECT
          a.id,
          a.source,
          a.session_id AS sessionId,
          a.puzzle_id AS puzzleId,
          a.mode,
          a.rating_key AS ratingKey,
          a.result,
          a.submitted_move AS submittedMove,
          a.expected_move AS expectedMove,
          a.started_at AS startedAt,
          a.completed_at AS completedAt,
          a.elapsed_ms AS elapsedMs,
          a.timing_status AS timingStatus,
          a.rating_before AS ratingBefore,
          a.rating_after AS ratingAfter,
          a.arrow_duel_candidate_order_json AS arrowDuelCandidateOrderJson,
          a.unclear,
          a.unclear_updated_at AS unclearUpdatedAt,
          s.run_id AS runId,
          s.run_name AS runName
         FROM attempts a
         JOIN sprint_sessions s ON s.id = a.session_id
         ${where}
         ORDER BY a.completed_at DESC, a.id DESC`
      )
      .all(...params) as AttemptHistoryDbRow[];

    return rows.map(attemptHistoryRowFromDbRow);
  }

  getPracticeProgressSummary(nowMs: number, ratingKey: string): PracticeProgressSummary {
    const until = new Date(nowMs).toISOString();
    const since = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const attemptSummary = this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN result = 'correct' THEN 1 ELSE 0 END) AS correct_count,
          SUM(CASE WHEN result IN (?, ?) THEN 1 ELSE 0 END) AS wrong_count
         FROM attempts
         WHERE rating_key = ? AND completed_at >= ? AND completed_at <= ?`
      )
      .get(...ATTEMPT_MISTAKE_OUTCOMES, ratingKey, since, until) as {
        correct_count: number | null;
        wrong_count: number | null;
      };
    const sessionSummary = this.db
      .prepare(
        `SELECT
          COUNT(*) AS rated_sprint_count,
          SUM(rating_after - rating_before) AS rating_delta
         FROM sprint_sessions
         WHERE rating_key = ?
           AND completed_at >= ?
           AND completed_at <= ?
           AND rating_after IS NOT NULL`
      )
      .get(ratingKey, since, until) as { rated_sprint_count: number; rating_delta: number | null };
    const correctThisWeek = attemptSummary.correct_count ?? 0;
    const wrongThisWeek = attemptSummary.wrong_count ?? 0;
    return {
      correctThisWeek,
      accuracyThisWeek: correctThisWeek + wrongThisWeek === 0
        ? null
        : Math.round((correctThisWeek / (correctThisWeek + wrongThisWeek)) * 100),
      ratingDeltaThisWeek: sessionSummary.rated_sprint_count === 0
        ? null
        : sessionSummary.rating_delta ?? 0,
      wrongThisWeek,
      netThisWeek: correctThisWeek - wrongThisWeek
    };
  }

  listPracticeRatingActivity(): PracticeRatingActivity[] {
    return this.db
      .prepare(
        `SELECT rating_key AS ratingKey, MAX(played_at) AS lastPlayedAt
         FROM (
           SELECT COALESCE(a.rating_key, s.rating_key) AS rating_key, a.completed_at AS played_at
           FROM attempts a
           LEFT JOIN sprint_sessions s ON s.id = a.session_id
           UNION ALL
           SELECT rating_key, COALESCE(completed_at, started_at) AS played_at
           FROM sprint_sessions
           UNION ALL
           SELECT key AS rating_key, '' AS played_at
           FROM ratings
           GROUP BY key
           HAVING SUM(games) > 0
         )
         WHERE rating_key IS NOT NULL
         GROUP BY rating_key
         ORDER BY lastPlayedAt DESC, ratingKey ASC`
      )
      .all() as PracticeRatingActivity[];
  }

  hasPlayedRatingKey(ratingKey: string): boolean {
    const row = this.db
      .prepare(
        `SELECT (
           EXISTS(
             SELECT 1
             FROM attempts a
             JOIN sprint_sessions s ON s.id = a.session_id
             WHERE a.source = 'sprint'
               AND (a.rating_key = ? OR (a.rating_key IS NULL AND s.rating_key = ?))
             LIMIT 1
           )
           OR EXISTS(
             SELECT 1
             FROM sprint_sessions
             WHERE rating_key = ? AND rating_after IS NOT NULL
             LIMIT 1
           )
         ) AS played`
      )
      .get(ratingKey, ratingKey, ratingKey) as { played: number };
    return row.played === 1;
  }

  private attemptById(attemptId: string): AttemptHistoryRow | undefined {
    const row = this.db
      .prepare(
        `SELECT
          a.id,
          a.source,
          a.session_id AS sessionId,
          a.puzzle_id AS puzzleId,
          a.mode,
          a.rating_key AS ratingKey,
          a.result,
          a.submitted_move AS submittedMove,
          a.expected_move AS expectedMove,
          a.started_at AS startedAt,
          a.completed_at AS completedAt,
          a.elapsed_ms AS elapsedMs,
          a.timing_status AS timingStatus,
          a.rating_before AS ratingBefore,
          a.rating_after AS ratingAfter,
          a.arrow_duel_candidate_order_json AS arrowDuelCandidateOrderJson,
          a.unclear,
          a.unclear_updated_at AS unclearUpdatedAt,
          s.run_id AS runId,
          s.run_name AS runName
         FROM attempts a
         JOIN sprint_sessions s ON s.id = a.session_id
         WHERE a.id = ?`
      )
      .get(attemptId) as AttemptHistoryDbRow | undefined;
    return row ? attemptHistoryRowFromDbRow(row) : undefined;
  }

  exportLocalData(): LocalDataExport {
    return {
      schemaVersion: 1,
      settings: this.getSettings(),
      ratings: this.listRatings(),
      attempts: this.listAttempts(),
      reviewQueue: this.listReviewQueue().map(exportReviewQueueState),
      reviewRemovals: this.listReviewRemovals(),
      sprintSessions: this.listSprintSessions(),
      practiceRuns: this.listPracticeRuns()
    };
  }

  private exportProgressV2Data(): LocalDataExport {
    return {
      ...this.exportLocalData(),
      ratings: this.listAllRatingGenerations()
    };
  }

  importLocalData(
    data: LocalDataImport,
    observer?: LocalDataImportObserver
  ): LocalDataImportResult {
    const changedProfileSessions: Array<{
      previous: ExportedSprintSession | undefined;
      next: ExportedSprintSession;
    }> = [];
    let eligibleAttemptChanged = false;
    const trackingObserver: LocalDataImportObserver = {
      onSprintSessionChanged: (previous, next) => {
        changedProfileSessions.push({ previous, next });
        observer?.onSprintSessionChanged(previous, next);
      },
      onAttemptChanged: (previous, next) => {
        eligibleAttemptChanged ||= [previous, next].some((candidate) => {
          if (candidate?.source !== "sprint") {
            return false;
          }
          return isTacticalProfileEvidenceSession(
            this.getSprintSessions([candidate.sessionId])[0]
          );
        });
        observer?.onAttemptChanged(previous, next);
      }
    };
    const result: LocalDataImportResult = {
      ratings: 0,
      attempts: 0,
      reviewQueue: 0,
      sprintSessions: 0,
      practiceRuns: 0
    };
    this.transaction(() => {
      this.saveSettings({
        ...this.getSettings(),
        notifications: clonePracticeSettings(data.settings).notifications,
        moveFeedback: clonePracticeSettings(data.settings).moveFeedback
      });
      const currentRuns = this.listPracticeRuns();
      const previousRuns = new Map(currentRuns.map((run) => [run.id, run]));
      const compatibleRuns = compatiblePracticeRunMergeInputs(
        currentRuns,
        data.practiceRuns ?? []
      );
      const mergedRuns = mergePracticeRunCatalogs(
        compatibleRuns.localRuns,
        compatibleRuns.incomingRuns
      );
      const changedRunCount = mergedRuns.filter((run) => !samePracticeRun(previousRuns.get(run.id), run)).length;
      if (changedRunCount > 0) {
        // The catalog owns no incoming foreign keys, so replacing it inside
        // this transaction safely avoids transient NOCASE name collisions
        // when two devices concurrently create the same user-facing name.
        this.db.prepare("DELETE FROM practice_runs").run();
        for (const run of mergedRuns) {
          this.savePracticeRun(run);
        }
        result.practiceRuns = changedRunCount;
      }
      for (const rating of data.ratings) {
        const previous = this.getRatingGeneration(rating.key, rating.generation);
        const next = previous === undefined ? rating : preferredRating(previous, rating);
        if (previous === undefined || !sameRating(previous, next)) {
          this.saveRating(next);
          result.ratings += 1;
        }
      }
      for (const session of data.sprintSessions) {
        if (this.importSprintSession(session, trackingObserver)) {
          result.sprintSessions += 1;
        }
      }
      for (const attempt of data.attempts) {
        if (this.importAttempt(attempt, trackingObserver)) {
          result.attempts += 1;
        }
      }
      const importedReviewChanges: ReviewScheduleChange[] = [
        ...data.reviewQueue.map((review): ReviewScheduleChange => ({
          kind: "scheduled",
          review: normalizeImportedReviewQueueState(review)
        })),
        ...(data.reviewRemovals ?? []).map((removal): ReviewScheduleChange => ({ kind: "removed", removal }))
      ];
      for (const change of importedReviewChanges) {
        if (!this.getPuzzle(reviewContextForChange(change).puzzleId)) {
          continue;
        }
        if (this.applyReviewScheduleChange(change)) {
          result.reviewQueue += 1;
        }
      }
      const eligibleSessionChanged = changedProfileSessions.some(
        ({ previous, next }) =>
          (
            isTacticalProfileEvidenceSession(previous) ||
            isTacticalProfileEvidenceSession(next)
          ) &&
          this.countAttempts({ source: "sprint", sessionId: next.id }) > 0
      );
      if (eligibleSessionChanged || eligibleAttemptChanged) {
        this.bumpTacticalProfileSourceRevision();
      }
    });
    return result;
  }

  clearSyncedHistory(now: string): ClearSyncedHistoryResult {
    return this.transaction(() => this.clearSyncedHistoryInTransaction(now));
  }

  private clearSyncedHistoryInTransaction(now: string): ClearSyncedHistoryResult {
    const hadTacticalProfileEvidence = this
      .listSprintSessions()
      .some(
        (session) =>
          isTacticalProfileEvidenceSession(session) &&
          this.countAttempts({
            source: "sprint",
            sessionId: session.id
          }) > 0
      );
    const result: ClearSyncedHistoryResult = {
      attempts: countRows(this.db, "attempts"),
      reviewEvents: countRows(this.db, "review_events"),
      reviewQueue: countRows(this.db, "review_queue"),
      sprintSessions: countRows(this.db, "sprint_sessions", "status NOT IN ('active', 'paused')")
    };
    const attemptIds = (this.db.prepare("SELECT id FROM attempts ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id);
    const terminalSessionIds = (this.db.prepare(
      "SELECT id FROM sprint_sessions WHERE status NOT IN ('active', 'paused') ORDER BY id"
    ).all() as Array<{ id: string }>).map((row) => row.id);
    const tombstone = this.db.prepare(
      `INSERT INTO progress_v2_tombstones (kind, entity_key, deleted_at)
       VALUES (?, ?, ?)
       ON CONFLICT(kind, entity_key) DO UPDATE SET deleted_at = excluded.deleted_at`
    );
    for (const id of attemptIds) {
      tombstone.run("attempt", id, now);
    }
    for (const id of terminalSessionIds) {
      tombstone.run("sprint_session", id, now);
    }
    this.stageProgressV2Outbox([
      ...attemptIds.map((entityKey) => ({ kind: "attempt" as const, entityKey })),
      ...terminalSessionIds.map((entityKey) => ({ kind: "sprint_session" as const, entityKey }))
    ], now);
    for (const review of this.listReviewQueue()) {
      this.saveReviewRemoval({
        puzzleId: review.puzzleId,
        mode: review.mode,
        ratingKey: review.ratingKey,
        removedAt: now
      });
    }
    this.db.prepare("DELETE FROM attempts").run();
    this.db.prepare("DELETE FROM review_events").run();
    this.db.prepare("DELETE FROM review_queue").run();
    this.db.prepare("DELETE FROM sprint_sessions WHERE status NOT IN ('active', 'paused')").run();
    if (hadTacticalProfileEvidence) {
      this.bumpTacticalProfileSourceRevision();
    }
    return result;
  }

  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[] {
    const attempts = this.listAttempts({ sessionId }).map(attemptEventFromHistoryRow);
    const puzzles = attempts
      .map((attempt) => this.getPuzzle(attempt.puzzleId))
      .filter((puzzle): puzzle is Puzzle => Boolean(puzzle));
    return buildSessionMistakeReview({ sessionId, attempts, puzzles });
  }

  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = scheduleMistakeForContext(context, now, previous);
    this.commitScheduledReview(next);
    return next;
  }

  enrollReview(context: ReviewContext, now: string, initiatingAttemptId?: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = enrollReviewContext(context, now, previous);
    let initiatingAttempt: AttemptHistoryRow | undefined;
    if (initiatingAttemptId) {
      initiatingAttempt = this.attemptById(initiatingAttemptId);
      if (!initiatingAttempt) {
        throw new Error(`Attempt ${initiatingAttemptId} was not found`);
      }
      if (!sameReviewContext(initiatingAttempt, context)) {
        throw new Error("The initiating attempt must identify the same Review Context");
      }
      updateAttemptUnclearState(initiatingAttempt, false, now);
    }
    this.commitScheduledReview(next);
    if (initiatingAttempt) {
      this.setAttemptUnclear(initiatingAttempt.id, false, now);
    }
    return next;
  }

  removeReview(context: ReviewContext, now: string): ReviewScheduleRemoval {
    const previousReview = this.getReviewQueueState(context);
    const previousRemoval = this.getReviewRemoval(context);
    if (!previousReview && previousRemoval) {
      return previousRemoval;
    }
    const removal = removeReviewContext(context, now, previousReview ? undefined : previousRemoval);
    if (previousReview) {
      const winner = preferredReviewScheduleChange(
        { kind: "scheduled", review: previousReview },
        { kind: "removed", removal }
      );
      if (winner.kind !== "removed") {
        throw new Error("Review removal must not be older than the active Review Schedule");
      }
    }
    this.saveReviewRemoval(removal);
    this.db
      .prepare("DELETE FROM review_queue WHERE puzzle_id = ? AND mode = ? AND rating_key = ?")
      .run(context.puzzleId, context.mode, context.ratingKey);
    return removal;
  }

  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = previous
      ? scheduleReview({ previous, result, now })
      : scheduleReview({ context, result, now });
    this.commitScheduledReview(next);
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
    this.db
      .prepare("DELETE FROM review_schedule_removals WHERE NOT EXISTS (SELECT 1 FROM puzzles WHERE puzzles.id = review_schedule_removals.puzzle_id)")
      .run();
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
    const today = reviewDayFor(now);
    const rows = this.db
      .prepare(
        `SELECT
          p.*,
          r.puzzle_id AS review_puzzle_id,
          r.mode AS review_mode,
          r.rating_key AS review_rating_key,
          r.due_day AS review_due_day,
          r.interval_days AS review_interval_days,
          r.review_count,
          r.success_streak AS review_success_streak,
          r.lapse_count AS review_lapse_count,
          r.last_result AS review_last_result,
          r.last_reviewed_at AS review_last_reviewed_at,
          r.enrolled_at AS review_enrolled_at
         FROM review_queue r
         JOIN puzzles p ON p.id = r.puzzle_id
         WHERE r.due_day <= ?
         ORDER BY r.due_day ASC, r.puzzle_id ASC, r.mode ASC, r.rating_key ASC`
      )
      .all(today) as DueReviewItemDbRow[];
    return rows.map((row) => ({
      puzzle: puzzleFromRow(row),
      review: reviewFromRow({
        puzzle_id: row.review_puzzle_id,
        mode: row.review_mode,
        rating_key: row.review_rating_key,
        due_day: row.review_due_day,
        interval_days: row.review_interval_days,
        review_count: row.review_count,
        success_streak: row.review_success_streak,
        lapse_count: row.review_lapse_count,
        last_result: row.review_last_result,
        last_reviewed_at: row.review_last_reviewed_at,
        enrolled_at: row.review_enrolled_at
      })
    }));
  }

  getHistoryView(query: HistoryQuery): HistoryView {
    const range = resolveHistoryRange(query.now, query.timeRange);
    const allAttempts = this.selectHistoryAttempts(query.ratingKey, range.since, range.until);
    const reviews = this.listAllReviewQueueStates();
    const { unclear: _unclear, ...queryWithoutUnclear } = query;
    const attemptsIgnoringUnclear = filterHistoryAttemptsForQuery({
      attempts: allAttempts,
      query: queryWithoutUnclear,
      reviews
    });
    const attempts = query.unclear === undefined
      ? attemptsIgnoringUnclear
      : filterHistoryAttemptsForQuery({
          attempts: attemptsIgnoringUnclear,
          query: { unclear: query.unclear },
          reviews
        });
    const unclearCount = filterHistoryAttemptsForQuery({
      attempts: attemptsIgnoringUnclear,
      query: { unclear: true },
      reviews
    }).length;
    return buildHistoryView({
      query,
      ratingKeys: this.listPlayedRatings(),
      attempts,
      unclearCount,
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
          last_reviewed_at,
          enrolled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        state.lastReviewedAt,
        state.enrolledAt ?? null
      );
  }

  private listReviewRemovals(): ReviewScheduleRemoval[] {
    const rows = this.db
      .prepare("SELECT * FROM review_schedule_removals ORDER BY puzzle_id ASC, mode ASC, rating_key ASC")
      .all() as ReviewRemovalRow[];
    return rows.map(reviewRemovalFromRow);
  }

  private getReviewRemoval(context: ReviewContext): ReviewScheduleRemoval | undefined {
    const row = this.db
      .prepare("SELECT * FROM review_schedule_removals WHERE puzzle_id = ? AND mode = ? AND rating_key = ?")
      .get(context.puzzleId, context.mode, context.ratingKey) as ReviewRemovalRow | undefined;
    return row ? reviewRemovalFromRow(row) : undefined;
  }

  private saveReviewRemoval(removal: ReviewScheduleRemoval): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO review_schedule_removals (puzzle_id, mode, rating_key, removed_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(removal.puzzleId, removal.mode, removal.ratingKey, removal.removedAt);
  }

  private commitScheduledReview(review: ReviewQueueState): void {
    const removal = this.getReviewRemoval(review);
    if (removal) {
      const winner = preferredReviewScheduleChange(
        { kind: "removed", removal },
        { kind: "scheduled", review }
      );
      if (winner.kind !== "scheduled") {
        throw new Error("Review enrollment must occur after the latest Review removal");
      }
    }
    this.saveReviewQueueState(review);
    this.db
      .prepare("DELETE FROM review_schedule_removals WHERE puzzle_id = ? AND mode = ? AND rating_key = ?")
      .run(review.puzzleId, review.mode, review.ratingKey);
  }

  private applyReviewScheduleChange(incoming: ReviewScheduleChange): boolean {
    const context = reviewContextForChange(incoming);
    const localRemoval = this.getReviewRemoval(context);
    const localReview = this.getReviewQueueState(context);
    const local: ReviewScheduleChange | undefined = localRemoval
      ? { kind: "removed", removal: localRemoval }
      : localReview
        ? { kind: "scheduled", review: localReview }
        : undefined;
    const next = preferredReviewScheduleChange(local, incoming);
    if (sameReviewScheduleChange(local, next)) {
      return false;
    }
    if (next.kind === "scheduled") {
      this.saveReviewQueueState(next.review);
      this.db
        .prepare("DELETE FROM review_schedule_removals WHERE puzzle_id = ? AND mode = ? AND rating_key = ?")
        .run(context.puzzleId, context.mode, context.ratingKey);
    } else {
      this.saveReviewRemoval(next.removal);
      this.db
        .prepare("DELETE FROM review_queue WHERE puzzle_id = ? AND mode = ? AND rating_key = ?")
        .run(context.puzzleId, context.mode, context.ratingKey);
    }
    return true;
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
          a.elapsed_ms,
          a.timing_status,
          a.rating_before,
          a.rating_after,
          a.arrow_duel_candidate_order_json,
          a.unclear,
          a.unclear_updated_at,
          COALESCE(a.rating_key, s.rating_key) AS rating_key,
          s.run_id,
          s.run_name,
          s.config_json AS session_config_json,
          p.*
         FROM attempts a
         JOIN sprint_sessions s ON s.id = a.session_id
         JOIN puzzles p ON p.id = a.puzzle_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY a.completed_at DESC, a.id DESC`
      )
      .all(...params) as HistoryAttemptDbRow[];

    const puzzlesById = new Map<string, Puzzle>();
    const sidesByPuzzleAndMode = new Map<string, HistoryAttemptView["side"]>();
    const perPuzzleSecondsBySession = new Map<string, number | undefined>();
    return rows.map((row) => {
      let puzzle = puzzlesById.get(row.id);
      if (!puzzle) {
        puzzle = puzzleFromRow(row);
        puzzlesById.set(row.id, puzzle);
      }
      const candidateOrder = optionalHistoryStringArrayFromJson(row.arrow_duel_candidate_order_json);
      let perPuzzleSeconds = perPuzzleSecondsBySession.get(row.session_id);
      if (!perPuzzleSecondsBySession.has(row.session_id)) {
        perPuzzleSeconds = positivePerPuzzleSecondsFromConfigJson(row.session_config_json);
        perPuzzleSecondsBySession.set(row.session_id, perPuzzleSeconds);
      }
      const sideKey = `${puzzle.id}\u0000${row.mode}`;
      let side = sidesByPuzzleAndMode.get(sideKey);
      if (!side) {
        side = sideToMoveForHistoryPuzzle({ puzzle, mode: row.mode });
        sidesByPuzzleAndMode.set(sideKey, side);
      }
      return {
        id: row.attempt_id,
        source: row.attempt_source,
        sessionId: row.session_id,
        puzzleId: puzzle.id,
        mode: row.mode,
        ratingKey: row.rating_key,
        result: row.result,
        ...(row.submitted_move === null ? {} : { submittedMove: row.submitted_move }),
        expectedMove: row.expected_move,
        startedAt: row.attempt_started_at,
        completedAt: row.completed_at,
        ...(row.elapsed_ms === null ? {} : { elapsedMs: row.elapsed_ms }),
        ...(row.timing_status === null ? {} : { timingStatus: row.timing_status }),
        ratingBefore: row.rating_before,
        ...(row.rating_after === null ? {} : { ratingAfter: row.rating_after }),
        ...(candidateOrder.status === "valid" ? { arrowDuelCandidateOrder: candidateOrder.value } : {}),
        ...(candidateOrder.status === "corrupt" ? { arrowDuelCandidateOrderStatus: "corrupt" as const } : {}),
        ...(row.unclear_updated_at === null
          ? {}
          : { unclear: row.unclear === 1, unclearUpdatedAt: row.unclear_updated_at }),
        ...(row.run_id === null || row.run_name === null
          ? {}
          : { runId: row.run_id, runName: row.run_name }),
        ...(perPuzzleSeconds === undefined ? {} : { perPuzzleSeconds }),
        puzzleRating: puzzle.rating,
        side,
        themes: puzzle.themes,
        curatedThemes: curatedPuzzleThemes(puzzle.themes)
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
          config_json AS configJson,
          run_id AS runId,
          run_kind AS runKind,
          run_name AS runName,
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

  getSprintSessions(ids: readonly string[]): ExportedSprintSession[] {
    const uniqueIds = [...new Set(ids)];
    const sessions: ExportedSprintSession[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += MAX_SQL_ID_FILTER_VALUES) {
      const chunk = uniqueIds.slice(offset, offset + MAX_SQL_ID_FILTER_VALUES);
      const rows = this.db
        .prepare(
          `SELECT
            id,
            mode,
            rating_key AS ratingKey,
            rating_generation AS ratingGeneration,
            config_json AS configJson,
            run_id AS runId,
            run_kind AS runKind,
            run_name AS runName,
            started_at AS startedAt,
            completed_at AS completedAt,
            status,
            correct_count AS correctCount,
            mistake_count AS mistakeCount,
            rating_before AS ratingBefore,
            rating_after AS ratingAfter
           FROM sprint_sessions
           WHERE id IN (${chunk.map(() => "?").join(", ")})`
        )
        .all(...chunk) as SprintSessionExportRow[];
      sessions.push(...rows.map(exportedSprintSessionFromRow));
    }
    const byId = new Map(sessions.map((session) => [session.id, session]));
    return uniqueIds.flatMap((id) => {
      const session = byId.get(id);
      return session ? [session] : [];
    });
  }

  listLatestTerminalFocusedSprintSessions(): ExportedSprintSession[] {
    const sessions: ExportedSprintSession[] = [];
    for (const taskFamily of ["line", "arrow_duel"] as const) {
      const row = this.db
        .prepare(
          `SELECT
            id,
            mode,
            rating_key AS ratingKey,
            rating_generation AS ratingGeneration,
            config_json AS configJson,
            run_id AS runId,
            run_kind AS runKind,
            run_name AS runName,
            started_at AS startedAt,
            completed_at AS completedAt,
            status,
            correct_count AS correctCount,
            mistake_count AS mistakeCount,
            rating_before AS ratingBefore,
            rating_after AS ratingAfter
           FROM sprint_sessions
           WHERE completed_at IS NOT NULL
             AND json_extract(
               config_json,
               '$.tacticalFocus.taskFamily'
             ) = ?
           ORDER BY completed_at DESC, id DESC
           LIMIT 1`
        )
        .get(taskFamily) as SprintSessionExportRow | undefined;
      if (row) {
        sessions.push(exportedSprintSessionFromRow(row));
      }
    }
    return sessions;
  }

  listSprintAttemptUtcDays(sessionIds: readonly string[]): string[] {
    const uniqueIds = [...new Set(sessionIds)];
    const days = new Set<string>();
    for (let offset = 0; offset < uniqueIds.length; offset += MAX_SQL_ID_FILTER_VALUES) {
      const chunk = uniqueIds.slice(offset, offset + MAX_SQL_ID_FILTER_VALUES);
      const rows = this.db
        .prepare(
          `SELECT DISTINCT strftime('%Y-%m-%d', completed_at) AS day
           FROM attempts
           WHERE source = 'sprint'
             AND session_id IN (${chunk.map(() => "?").join(", ")})
             AND strftime('%Y-%m-%d', completed_at) IS NOT NULL`
        )
        .all(...chunk) as Array<{ day: string }>;
      for (const row of rows) {
        days.add(row.day);
      }
    }
    return [...days].sort();
  }

  getTacticalProfileSourceRevision(): number {
    const row = this.db.prepare(`
      SELECT revision
      FROM tactical_profile_source_state
      WHERE singleton_id = 1
    `).get() as { revision?: unknown } | undefined;
    return typeof row?.revision === "number" &&
        Number.isSafeInteger(row.revision) &&
        row.revision >= 0
      ? row.revision
      : 0;
  }

  private importSprintSession(
    session: ExportedSprintSession,
    observer?: LocalDataImportObserver
  ): boolean {
    const existingRow = this.db
      .prepare(
        `SELECT
          id,
          mode,
          rating_key AS ratingKey,
          rating_generation AS ratingGeneration,
          config_json AS configJson,
          run_id AS runId,
          run_kind AS runKind,
          run_name AS runName,
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
               config_json = ?,
               run_id = ?,
               run_kind = ?,
               run_name = ?,
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
          sprintSessionConfigJson(next.config ?? existingRow.configJson, next),
          next.run?.id ?? null,
          next.run?.kind ?? null,
          next.run?.name ?? null,
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
      observer?.onSprintSessionChanged(previous, next);
      return true;
    }
    this.db
      .prepare(
        `INSERT INTO sprint_sessions (
          id,
          mode,
          rating_key,
          rating_generation,
          run_id,
          run_kind,
          run_name,
          config_json,
          started_at,
          deadline_at,
          completed_at,
          status,
          correct_count,
          mistake_count,
          rating_before,
          rating_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        next.id,
        next.mode,
        next.ratingKey,
        next.ratingGeneration ?? null,
        next.run?.id ?? null,
        next.run?.kind ?? null,
        next.run?.name ?? null,
        sprintSessionConfigJson(
          next.config ?? { source: "icloud_sync", mode: next.mode, ratingKey: next.ratingKey },
          next
        ),
        next.startedAt,
        completedAt,
        completedAt,
        next.status,
        next.correctCount,
        next.mistakeCount,
        next.ratingBefore,
        next.ratingAfter ?? null
      );
    observer?.onSprintSessionChanged(previous, next);
    return true;
  }

  private importAttempt(
    attempt: AttemptEvent,
    observer?: LocalDataImportObserver
  ): boolean {
    const existing = this.attemptById(attempt.id);
    if (existing) {
      const next = preferredAttemptHistoryRow(existing, attempt);
      if (sameAttemptHistoryRow(existing, next)) {
        return false;
      }
      this.db
        .prepare(
          `UPDATE attempts
           SET source = ?,
               session_id = ?,
               puzzle_id = ?,
               mode = ?,
               rating_key = ?,
               result = ?,
               submitted_move = ?,
               expected_move = ?,
               started_at = ?,
               completed_at = ?,
               elapsed_ms = ?,
               timing_status = ?,
               rating_before = ?,
               rating_after = ?,
               arrow_duel_candidate_order_json = ?,
               unclear = ?,
               unclear_updated_at = ?
           WHERE id = ?`
        )
        .run(
          next.source,
          next.sessionId,
          next.puzzleId,
          next.mode,
          next.ratingKey,
          next.result,
          next.submittedMove ?? null,
          next.expectedMove,
          next.startedAt,
          next.completedAt,
          next.elapsedMs ?? null,
          next.timingStatus ?? null,
          next.ratingBefore,
          next.ratingAfter ?? null,
          next.arrowDuelCandidateOrder ? JSON.stringify(next.arrowDuelCandidateOrder) : null,
          next.unclear ? 1 : 0,
          next.unclearUpdatedAt ?? null,
          next.id
        );
      observer?.onAttemptChanged(existing, next);
      return true;
    }
    if (!this.getPuzzle(attempt.puzzleId)) {
      return false;
    }
    this.ensureSessionForAttempt(attempt);
    const next = cloneAttemptHistoryRow(attempt);
    this.recordAttempt(next);
    observer?.onAttemptChanged(undefined, next);
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
        isAttemptMistake(attempt.result) ? 1 : 0,
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
        isAttemptMistake(attempt.result) ? 1 : 0,
        attempt.ratingBefore,
        null
      );
  }

  private bumpTacticalProfileSourceRevision(): void {
    this.db.prepare(`
      UPDATE tactical_profile_source_state
      SET revision = revision + 1
      WHERE singleton_id = 1
    `).run();
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
          config_json AS configJson,
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
  if (!hasColumn(db, table, column)) {
    db.exec(alterSql);
  }
}

function hasColumn(db: SyncSqliteDatabase, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((candidate) => candidate.name === column);
}

function hasTable(db: SyncSqliteDatabase, table: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .get(table) as { name?: unknown } | undefined;
  return row?.name === table;
}

function hasTrigger(db: SyncSqliteDatabase, trigger: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?"
    )
    .get(trigger) as { name?: unknown } | undefined;
  return row?.name === trigger;
}

function migrateV4ToV5(db: SyncSqliteDatabase): void {
  db.exec(`
    ALTER TABLE attempts
      ADD COLUMN unclear INTEGER NOT NULL DEFAULT 0
      CHECK (unclear IN (0, 1));
    ALTER TABLE attempts
      ADD COLUMN unclear_updated_at TEXT;

    CREATE INDEX attempts_unclear_completed_at_idx
      ON attempts(unclear, completed_at DESC);

    CREATE TABLE review_queue_v5 (
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'standard',
      rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
      due_day TEXT NOT NULL,
      interval_days INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      success_streak INTEGER NOT NULL,
      lapse_count INTEGER NOT NULL,
      last_result TEXT,
      last_reviewed_at TEXT,
      enrolled_at TEXT,
      PRIMARY KEY (puzzle_id, mode, rating_key),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id),
      CHECK (
        (last_result IS NOT NULL AND last_reviewed_at IS NOT NULL)
        OR
        (last_result IS NULL AND last_reviewed_at IS NULL AND enrolled_at IS NOT NULL)
      )
    );

    INSERT INTO review_queue_v5 (
      puzzle_id,
      mode,
      rating_key,
      due_day,
      interval_days,
      review_count,
      success_streak,
      lapse_count,
      last_result,
      last_reviewed_at,
      enrolled_at
    )
    SELECT
      puzzle_id,
      mode,
      rating_key,
      due_day,
      interval_days,
      review_count,
      success_streak,
      lapse_count,
      last_result,
      last_reviewed_at,
      NULL
    FROM review_queue;

    DROP TABLE review_queue;
    ALTER TABLE review_queue_v5 RENAME TO review_queue;
    CREATE INDEX review_queue_due_day_order_idx
      ON review_queue(due_day, puzzle_id, mode, rating_key);
  `);
}

function migrateV5ToV6(db: SyncSqliteDatabase): void {
  db.exec(`
    CREATE TABLE review_schedule_removals (
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      rating_key TEXT NOT NULL,
      removed_at TEXT NOT NULL,
      PRIMARY KEY (puzzle_id, mode, rating_key),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
    );

    CREATE INDEX review_schedule_removals_removed_at_idx
      ON review_schedule_removals(removed_at, puzzle_id, mode, rating_key);
  `);
}

function migrateV6ToV7(db: SyncSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_runs (
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

    CREATE INDEX IF NOT EXISTS practice_runs_home_order_idx
      ON practice_runs(archived, home_order, id);
    CREATE INDEX IF NOT EXISTS practice_runs_updated_at_idx
      ON practice_runs(updated_at, id);

    INSERT OR IGNORE INTO practice_runs (
      id, kind, name, mode, rating_key, duration_seconds, per_puzzle_seconds,
      target_correct, max_mistakes, themes_json, home_order, archived, updated_at
    ) VALUES
      ('standard', 'standard', 'Standard', 'standard', 'standard 5/20', 300, 20,
       15, 3, NULL, 0, 0, '1970-01-01T00:00:00.000Z'),
      ('arrow-duel', 'arrow_duel', 'Arrow Duel', 'arrow_duel', 'arrow_duel 5/30', 300, 30,
       10, 3, NULL, 1, 0, '1970-01-01T00:00:00.000Z');

  `);
  ensureColumn(db, "sprint_sessions", "run_id", "ALTER TABLE sprint_sessions ADD COLUMN run_id TEXT");
  ensureColumn(db, "sprint_sessions", "run_kind", "ALTER TABLE sprint_sessions ADD COLUMN run_kind TEXT");
  ensureColumn(db, "sprint_sessions", "run_name", "ALTER TABLE sprint_sessions ADD COLUMN run_name TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS sprint_sessions_run_id_started_at_idx
      ON sprint_sessions(run_id, started_at DESC, id DESC);
  `);
}

function migrateV7ToV8(db: SyncSqliteDatabase): void {
  const configs = (db.prepare(
    "SELECT * FROM custom_sprint_configs ORDER BY last_started_at DESC, id ASC"
  ).all() as CustomSprintConfigRow[]).map(customSprintConfigFromRow);
  const existingRuns = (db.prepare(
    "SELECT * FROM practice_runs ORDER BY archived ASC, home_order ASC, id ASC"
  ).all() as PracticeRunRow[]).map(practiceRunFromRow);
  const migratedRuns = practiceRunsFromLegacyCustomConfigs(configs, existingRuns);
  const statement = db.prepare(`
    INSERT OR IGNORE INTO practice_runs (
      id, kind, name, mode, rating_key, duration_seconds, per_puzzle_seconds,
      target_correct, max_mistakes, themes_json, home_order, archived, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const run of migratedRuns) {
    statement.run(
      run.id,
      run.kind,
      run.name,
      run.mode,
      run.ratingKey,
      run.durationSeconds,
      run.perPuzzleSeconds,
      run.targetCorrect,
      run.maxMistakes,
      run.themes === undefined ? null : JSON.stringify(run.themes),
      run.homeOrder,
      boolToInt(run.archived),
      run.updatedAt
    );
  }
}

function migrateV8ToV9(db: SyncSqliteDatabase): void {
  ensureMoveFeedbackColumns(db);
}

function repairKnownSchemaDrift(db: SyncSqliteDatabase): void {
  // The timing and move-feedback branches both used schema v9 before they were
  // merged. Devices that ran the timing build can therefore report the current
  // version while still lacking these columns.
  const hadMoveFeedbackSoundColumn = hasColumn(
    db,
    "app_settings",
    "move_feedback_sound_enabled"
  );
  const hadOpponentReplyColumns = hasColumn(
    db,
    "practice_runs",
    "opponent_reply_enabled"
  ) && hasColumn(db, "practice_runs", "opponent_reply_seconds");
  ensureMoveFeedbackColumns(db);
  if (!hadMoveFeedbackSoundColumn) {
    db.exec("UPDATE app_settings SET move_feedback_sound_enabled = 0");
  }
  migrateV10ToV11(db);
  migrateV11ToV12(db);
  migrateV14ToV15(db);
  migrateV16ToV17(db);
  migrateV18ToV19(db);
  if (!hadOpponentReplyColumns) {
    migrateV17ToV18(db);
  }
  if (!hasProgressV2Schema(db)) {
    migrateV19ToV20(db);
  }
  migrateV20ToV21(db);
}

function hasCurrentSettingsColumns(db: SyncSqliteDatabase): boolean {
  return hasColumn(db, "app_settings", "arrow_duel_opponent_reply_enabled") &&
    hasColumn(db, "app_settings", "move_feedback_sound_enabled") &&
    hasColumn(db, "app_settings", "move_feedback_haptics_enabled") &&
    hasColumn(db, "app_settings", "sprint_rules_guide_seen") &&
    hasColumn(db, "app_settings", "sprint_active_session_guide_seen") &&
    hasColumn(db, "app_settings", "sprint_arrow_duel_guide_seen") &&
    hasColumn(db, "app_settings", "sprint_focused_run_guide_seen") &&
    hasColumn(db, "app_settings", "sprint_arrow_duel_reply_cue_stage") &&
    hasTable(db, "app_review_request_state") &&
    hasColumn(db, "practice_runs", "opponent_reply_enabled") &&
    hasColumn(db, "practice_runs", "opponent_reply_seconds");
}

function hasProgressV2Schema(db: SyncSqliteDatabase): boolean {
  return hasTable(db, "progress_v2_sync_state") &&
    hasTable(db, "progress_v2_outbox") &&
    hasTable(db, "progress_v2_tombstones") &&
    hasColumn(db, "progress_v2_outbox", "revision") &&
    hasColumn(db, "progress_v2_sync_state", "outbox_suppressed") &&
    hasColumn(db, "progress_v2_sync_state", "last_v1_check_at") &&
    hasColumn(db, "progress_v2_sync_state", "last_v1_check_status") &&
    hasColumn(db, "progress_v2_sync_state", "sealed_at") &&
    hasTrigger(db, "progress_v2_settings_insert") &&
    hasTrigger(db, "progress_v2_settings_update") &&
    hasTrigger(db, "progress_v2_outbox_revision_update");
}

function ensureMoveFeedbackColumns(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "app_settings",
    "move_feedback_sound_enabled",
    "ALTER TABLE app_settings ADD COLUMN move_feedback_sound_enabled INTEGER NOT NULL DEFAULT 1 CHECK (move_feedback_sound_enabled IN (0, 1))"
  );
  ensureColumn(
    db,
    "app_settings",
    "move_feedback_haptics_enabled",
    "ALTER TABLE app_settings ADD COLUMN move_feedback_haptics_enabled INTEGER NOT NULL DEFAULT 1 CHECK (move_feedback_haptics_enabled IN (0, 1))"
  );
}

function migrateV9ToV10(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "practice_runs",
    "slow_after_seconds",
    "ALTER TABLE practice_runs ADD COLUMN slow_after_seconds INTEGER " +
      "CHECK (slow_after_seconds IS NULL OR slow_after_seconds > 0)"
  );
  ensureColumn(
    db,
    "practice_runs",
    "timeout_after_seconds",
    "ALTER TABLE practice_runs ADD COLUMN timeout_after_seconds INTEGER " +
      "CHECK (timeout_after_seconds IS NULL OR timeout_after_seconds > 0)"
  );
  const legacyRuns = db.prepare(
    `SELECT id, per_puzzle_seconds
     FROM practice_runs
     WHERE slow_after_seconds IS NULL
       AND timeout_after_seconds IS NULL`
  ).all() as Array<{ id: string; per_puzzle_seconds: number }>;
  const updateRunTiming = db.prepare(
    `UPDATE practice_runs
     SET slow_after_seconds = ?,
         timeout_after_seconds = ?
     WHERE id = ?`
  );
  for (const run of legacyRuns) {
    const defaults = defaultPuzzleTimingPolicy(run.per_puzzle_seconds);
    updateRunTiming.run(
      defaults.slowAfterSeconds,
      defaults.timeoutAfterSeconds,
      run.id
    );
  }

  const attemptCount = countRows(db, "attempts");
  db.exec(`
    CREATE TABLE attempts_v10 (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'sprint',
      session_id TEXT NOT NULL,
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      rating_key TEXT,
      result TEXT NOT NULL,
      submitted_move TEXT,
      expected_move TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      elapsed_ms INTEGER CHECK (elapsed_ms IS NULL OR elapsed_ms >= 0),
      timing_status TEXT CHECK (
        timing_status IS NULL OR timing_status IN ('slow', 'timed_out')
      ),
      rating_before INTEGER NOT NULL,
      rating_after INTEGER,
      arrow_duel_candidate_order_json TEXT,
      unclear INTEGER NOT NULL DEFAULT 0 CHECK (unclear IN (0, 1)),
      unclear_updated_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sprint_sessions(id),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id),
      CHECK (
        (result = 'timed_out' AND timing_status = 'timed_out')
        OR
        (result <> 'timed_out' AND (timing_status IS NULL OR timing_status = 'slow'))
      ),
      CHECK (
        (result = 'timed_out' AND submitted_move IS NULL)
        OR
        (result <> 'timed_out' AND submitted_move IS NOT NULL)
      ),
      CHECK (timing_status IS NULL OR elapsed_ms IS NOT NULL)
    );

    INSERT INTO attempts_v10 (
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
      elapsed_ms,
      timing_status,
      rating_before,
      rating_after,
      arrow_duel_candidate_order_json,
      unclear,
      unclear_updated_at
    )
    SELECT
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
      NULL,
      NULL,
      rating_before,
      rating_after,
      arrow_duel_candidate_order_json,
      unclear,
      unclear_updated_at
    FROM attempts;
  `);
  if (countRows(db, "attempts_v10") !== attemptCount) {
    throw new Error("SQLite v10 attempt rebuild changed the attempt row count");
  }
  db.exec(`
    DROP TABLE attempts;
    ALTER TABLE attempts_v10 RENAME TO attempts;

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
  `);
}

function migrateV10ToV11(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "app_settings",
    "sprint_rules_guide_seen",
    "ALTER TABLE app_settings ADD COLUMN sprint_rules_guide_seen INTEGER NOT NULL DEFAULT 0 CHECK (sprint_rules_guide_seen IN (0, 1))"
  );
  ensureColumn(
    db,
    "app_settings",
    "sprint_active_session_guide_seen",
    "ALTER TABLE app_settings ADD COLUMN sprint_active_session_guide_seen INTEGER NOT NULL DEFAULT 0 CHECK (sprint_active_session_guide_seen IN (0, 1))"
  );
  ensureColumn(
    db,
    "app_settings",
    "sprint_arrow_duel_guide_seen",
    "ALTER TABLE app_settings ADD COLUMN sprint_arrow_duel_guide_seen INTEGER NOT NULL DEFAULT 0 CHECK (sprint_arrow_duel_guide_seen IN (0, 1))"
  );
}

function migrateV11ToV12(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "app_settings",
    "sprint_focused_run_guide_seen",
    "ALTER TABLE app_settings ADD COLUMN sprint_focused_run_guide_seen INTEGER NOT NULL DEFAULT 0 CHECK (sprint_focused_run_guide_seen IN (0, 1))"
  );
}

function migrateV12ToV13(db: SyncSqliteDatabase): void {
  if (hasColumn(db, "sprint_sessions", "config_json")) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS sprint_sessions_tactical_focus_family_completed_at_id_idx
      ON sprint_sessions(
        json_extract(config_json, '$.tacticalFocus.taskFamily'),
        completed_at DESC,
        id DESC
      );
    `);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS tactical_profile_source_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      revision INTEGER NOT NULL CHECK (revision >= 0)
    );
    INSERT OR IGNORE INTO tactical_profile_source_state (singleton_id, revision)
    VALUES (1, 0);
  `);
}

function migrateV13ToV14(db: SyncSqliteDatabase): void {
  // Sound was previously on by default, and the stored boolean cannot
  // distinguish that inherited default from an explicit opt-in. Apply the new
  // quiet default once during upgrade; later user changes persist because this
  // migration cannot run again after user_version reaches 14.
  ensureMoveFeedbackColumns(db);
  db.exec("UPDATE app_settings SET move_feedback_sound_enabled = 0");
}

function migrateV14ToV15(db: SyncSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_review_request_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      app_version TEXT NOT NULL CHECK (length(trim(app_version)) > 0),
      attempted_at TEXT NOT NULL
    );
  `);
}

function migrateV15ToV16(db: SyncSqliteDatabase): void {
  const attemptCount = countRows(db, "attempts");
  db.exec(`
    CREATE TABLE attempts_v16 (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'sprint',
      session_id TEXT NOT NULL,
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      rating_key TEXT,
      result TEXT NOT NULL,
      submitted_move TEXT,
      expected_move TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      elapsed_ms INTEGER CHECK (elapsed_ms IS NULL OR elapsed_ms >= 0),
      timing_status TEXT CHECK (
        timing_status IS NULL OR timing_status IN ('slow', 'timed_out')
      ),
      rating_before INTEGER NOT NULL,
      rating_after INTEGER,
      arrow_duel_candidate_order_json TEXT,
      unclear INTEGER NOT NULL DEFAULT 0 CHECK (unclear IN (0, 1)),
      unclear_updated_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sprint_sessions(id),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id),
      CHECK (
        (result = 'timed_out' AND timing_status = 'timed_out')
        OR
        (result <> 'timed_out' AND (timing_status IS NULL OR timing_status = 'slow'))
      ),
      CHECK (
        (result IN ('timed_out', 'incomplete') AND submitted_move IS NULL)
        OR
        (result NOT IN ('timed_out', 'incomplete') AND submitted_move IS NOT NULL)
      ),
      CHECK (timing_status IS NULL OR elapsed_ms IS NOT NULL)
    );

    INSERT INTO attempts_v16 (
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
      elapsed_ms,
      timing_status,
      rating_before,
      rating_after,
      arrow_duel_candidate_order_json,
      unclear,
      unclear_updated_at
    )
    SELECT
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
      elapsed_ms,
      timing_status,
      rating_before,
      rating_after,
      arrow_duel_candidate_order_json,
      unclear,
      unclear_updated_at
    FROM attempts;
  `);
  if (countRows(db, "attempts_v16") !== attemptCount) {
    throw new Error("SQLite v16 attempt rebuild changed the attempt row count");
  }
  db.exec(`
    DROP TABLE attempts;
    ALTER TABLE attempts_v16 RENAME TO attempts;

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
  `);
}

function migrateV16ToV17(db: SyncSqliteDatabase): void {
  const hadOpponentReplyEnabled = hasColumn(
    db,
    "practice_runs",
    "opponent_reply_enabled"
  );
  ensureColumn(
    db,
    "practice_runs",
    "opponent_reply_enabled",
    "ALTER TABLE practice_runs ADD COLUMN opponent_reply_enabled INTEGER NOT NULL DEFAULT 0 " +
      "CHECK (opponent_reply_enabled IN (0, 1))"
  );
  ensureColumn(
    db,
    "practice_runs",
    "opponent_reply_seconds",
    `ALTER TABLE practice_runs ADD COLUMN opponent_reply_seconds INTEGER NOT NULL DEFAULT ${DEFAULT_OPPONENT_REPLY_SECONDS} ` +
      "CHECK (opponent_reply_seconds BETWEEN 1 AND 10)"
  );
  if (!hadOpponentReplyEnabled) {
    db.exec(
      "UPDATE practice_runs SET opponent_reply_enabled = 1 WHERE mode = 'arrow_duel'"
    );
  }
}

function migrateV17ToV18(db: SyncSqliteDatabase): void {
  const runCount = countRows(db, "practice_runs");
  db.exec(`
    CREATE TABLE practice_runs_v18 (
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
      updated_at TEXT NOT NULL,
      slow_after_seconds INTEGER CHECK (
        slow_after_seconds IS NULL OR slow_after_seconds > 0
      ),
      timeout_after_seconds INTEGER CHECK (
        timeout_after_seconds IS NULL OR timeout_after_seconds > 0
      ),
      opponent_reply_enabled INTEGER NOT NULL DEFAULT 0 CHECK (
        opponent_reply_enabled IN (0, 1)
      ),
      opponent_reply_seconds INTEGER NOT NULL DEFAULT ${DEFAULT_OPPONENT_REPLY_SECONDS} CHECK (
        opponent_reply_seconds BETWEEN ${OPPONENT_REPLY_MIN_SECONDS} AND ${OPPONENT_REPLY_MAX_SECONDS}
      )
    );

    INSERT INTO practice_runs_v18 (
      id,
      kind,
      name,
      mode,
      rating_key,
      duration_seconds,
      per_puzzle_seconds,
      target_correct,
      max_mistakes,
      themes_json,
      home_order,
      archived,
      updated_at,
      slow_after_seconds,
      timeout_after_seconds,
      opponent_reply_enabled,
      opponent_reply_seconds
    )
    SELECT
      id,
      kind,
      name,
      mode,
      rating_key,
      duration_seconds,
      per_puzzle_seconds,
      target_correct,
      max_mistakes,
      themes_json,
      home_order,
      archived,
      updated_at,
      slow_after_seconds,
      timeout_after_seconds,
      opponent_reply_enabled,
      opponent_reply_seconds
    FROM practice_runs;
  `);
  if (countRows(db, "practice_runs_v18") !== runCount) {
    throw new Error("SQLite v18 practice Run rebuild changed the row count");
  }
  db.exec(`
    DROP TABLE practice_runs;
    ALTER TABLE practice_runs_v18 RENAME TO practice_runs;

    CREATE INDEX practice_runs_home_order_idx
      ON practice_runs(archived, home_order, id);
    CREATE INDEX practice_runs_updated_at_idx
      ON practice_runs(updated_at, id);
  `);
}

function migrateV18ToV19(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "app_settings",
    "sprint_arrow_duel_reply_cue_stage",
    "ALTER TABLE app_settings ADD COLUMN sprint_arrow_duel_reply_cue_stage INTEGER NOT NULL DEFAULT 0 " +
      "CHECK (sprint_arrow_duel_reply_cue_stage BETWEEN 0 AND 3)"
  );
}

function migrateV19ToV20(db: SyncSqliteDatabase): void {
  if (hasTable(db, "progress_v2_outbox")) {
    ensureColumn(
      db,
      "progress_v2_outbox",
      "revision",
      "ALTER TABLE progress_v2_outbox ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)"
    );
  }
  if (hasTable(db, "progress_v2_sync_state")) {
    ensureColumn(
      db,
      "progress_v2_sync_state",
      "last_v1_check_at",
      "ALTER TABLE progress_v2_sync_state ADD COLUMN last_v1_check_at TEXT"
    );
    ensureColumn(
      db,
      "progress_v2_sync_state",
      "last_v1_check_status",
      "ALTER TABLE progress_v2_sync_state ADD COLUMN last_v1_check_status TEXT CHECK (last_v1_check_status IN ('available', 'missing'))"
    );
  }
  db.exec(`
    DROP TRIGGER IF EXISTS progress_v2_ratings_insert;
    DROP TRIGGER IF EXISTS progress_v2_ratings_update;
    DROP TRIGGER IF EXISTS progress_v2_attempts_insert;
    DROP TRIGGER IF EXISTS progress_v2_attempts_update;
    DROP TRIGGER IF EXISTS progress_v2_sprint_sessions_insert;
    DROP TRIGGER IF EXISTS progress_v2_sprint_sessions_update;
    DROP TRIGGER IF EXISTS progress_v2_review_queue_insert;
    DROP TRIGGER IF EXISTS progress_v2_review_queue_update;
    DROP TRIGGER IF EXISTS progress_v2_review_removals_insert;
    DROP TRIGGER IF EXISTS progress_v2_review_removals_update;
    DROP TRIGGER IF EXISTS progress_v2_practice_runs_insert;
    DROP TRIGGER IF EXISTS progress_v2_practice_runs_update;
    DROP TRIGGER IF EXISTS progress_v2_settings_insert;
    DROP TRIGGER IF EXISTS progress_v2_settings_update;
    DROP TRIGGER IF EXISTS progress_v2_outbox_revision_update;

    -- Some supported historical/repair fixtures intentionally contain only
    -- the tables needed by their feature boundary. Restore the three V2
    -- source families that older forward migrations did not need to touch so
    -- trigger creation and initial outbox seeding remain total.
    CREATE TABLE IF NOT EXISTS ratings (
      key TEXT NOT NULL,
      generation INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      rating_deviation REAL NOT NULL DEFAULT 350,
      volatility REAL NOT NULL DEFAULT 0.06,
      games INTEGER NOT NULL,
      PRIMARY KEY (key, generation)
    );

    CREATE TABLE IF NOT EXISTS review_queue (
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'standard',
      rating_key TEXT NOT NULL DEFAULT 'standard 5/20',
      due_day TEXT NOT NULL,
      interval_days INTEGER NOT NULL,
      review_count INTEGER NOT NULL,
      success_streak INTEGER NOT NULL,
      lapse_count INTEGER NOT NULL,
      last_result TEXT,
      last_reviewed_at TEXT,
      enrolled_at TEXT,
      PRIMARY KEY (puzzle_id, mode, rating_key),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id),
      CHECK (
        (last_result IS NOT NULL AND last_reviewed_at IS NOT NULL)
        OR
        (last_result IS NULL AND last_reviewed_at IS NULL AND enrolled_at IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS review_queue_due_day_order_idx
      ON review_queue(due_day, puzzle_id, mode, rating_key);

    CREATE TABLE IF NOT EXISTS review_schedule_removals (
      puzzle_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      rating_key TEXT NOT NULL,
      removed_at TEXT NOT NULL,
      PRIMARY KEY (puzzle_id, mode, rating_key),
      FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
    );

    CREATE INDEX IF NOT EXISTS review_schedule_removals_removed_at_idx
      ON review_schedule_removals(removed_at, puzzle_id, mode, rating_key);

    CREATE TABLE IF NOT EXISTS progress_v2_sync_state (
      id TEXT PRIMARY KEY CHECK (id = 'default'),
      phase TEXT NOT NULL DEFAULT 'bridging' CHECK (phase IN ('bridging', 'sealed')),
      zone_initialized INTEGER NOT NULL DEFAULT 0 CHECK (zone_initialized IN (0, 1)),
      server_change_token TEXT,
      server_change_token_fingerprint TEXT,
      seeded_at TEXT,
      last_pull_at TEXT,
      last_push_at TEXT,
      last_v1_change_tag TEXT,
      pending_v1_change_tag TEXT,
      last_v1_import_at TEXT,
      last_v1_check_at TEXT,
      last_v1_check_status TEXT CHECK (last_v1_check_status IN ('available', 'missing')),
      sealed_at TEXT,
      outbox_suppressed INTEGER NOT NULL DEFAULT 0 CHECK (outbox_suppressed IN (0, 1))
    );

    INSERT OR IGNORE INTO progress_v2_sync_state (id, seeded_at)
    VALUES ('default', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

    CREATE TABLE IF NOT EXISTS progress_v2_outbox (
      kind TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      enqueued_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
      PRIMARY KEY (kind, entity_key)
    );

    CREATE INDEX IF NOT EXISTS progress_v2_outbox_enqueued_at_idx
      ON progress_v2_outbox(enqueued_at, kind, entity_key);

    CREATE TRIGGER progress_v2_outbox_revision_update
    AFTER UPDATE OF enqueued_at ON progress_v2_outbox
    WHEN NEW.revision = OLD.revision
    BEGIN
      UPDATE progress_v2_outbox
      SET revision = OLD.revision + 1
      WHERE kind = NEW.kind AND entity_key = NEW.entity_key;
    END;

    CREATE TABLE IF NOT EXISTS progress_v2_tombstones (
      kind TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (kind, entity_key)
    );

    CREATE INDEX IF NOT EXISTS progress_v2_tombstones_deleted_at_idx
      ON progress_v2_tombstones(deleted_at, kind, entity_key);

    CREATE TRIGGER IF NOT EXISTS progress_v2_ratings_insert
    AFTER INSERT ON ratings
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('rating', NEW.key || char(31) || NEW.generation,
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
      DELETE FROM progress_v2_tombstones
      WHERE kind = 'rating' AND entity_key = NEW.key || char(31) || NEW.generation;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_ratings_update
    AFTER UPDATE ON ratings
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('rating', NEW.key || char(31) || NEW.generation,
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_attempts_insert
    AFTER INSERT ON attempts
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('attempt', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
      DELETE FROM progress_v2_tombstones WHERE kind = 'attempt' AND entity_key = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_attempts_update
    AFTER UPDATE ON attempts
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('attempt', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_sprint_sessions_insert
    AFTER INSERT ON sprint_sessions
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('sprint_session', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
      DELETE FROM progress_v2_tombstones WHERE kind = 'sprint_session' AND entity_key = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_sprint_sessions_update
    AFTER UPDATE ON sprint_sessions
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('sprint_session', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_review_queue_insert
    AFTER INSERT ON review_queue
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('review_schedule', NEW.puzzle_id || char(31) || NEW.mode || char(31) || NEW.rating_key,
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_review_queue_update
    AFTER UPDATE ON review_queue
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('review_schedule', NEW.puzzle_id || char(31) || NEW.mode || char(31) || NEW.rating_key,
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_review_removals_insert
    AFTER INSERT ON review_schedule_removals
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('review_schedule', NEW.puzzle_id || char(31) || NEW.mode || char(31) || NEW.rating_key,
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_review_removals_update
    AFTER UPDATE ON review_schedule_removals
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('review_schedule', NEW.puzzle_id || char(31) || NEW.mode || char(31) || NEW.rating_key,
              strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_practice_runs_insert
    AFTER INSERT ON practice_runs
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('practice_run', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
      DELETE FROM progress_v2_tombstones WHERE kind = 'practice_run' AND entity_key = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_practice_runs_update
    AFTER UPDATE ON practice_runs
    WHEN (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('practice_run', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_settings_insert
    AFTER INSERT ON app_settings
    WHEN NEW.id = 'default'
      AND (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('preferences', 'default', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    CREATE TRIGGER IF NOT EXISTS progress_v2_settings_update
    AFTER UPDATE ON app_settings
    WHEN NEW.id = 'default'
      AND (SELECT outbox_suppressed FROM progress_v2_sync_state WHERE id = 'default') = 0
      AND (
        NEW.review_reminder_mode IS NOT OLD.review_reminder_mode
        OR NEW.review_reminder_fixed_local_time IS NOT OLD.review_reminder_fixed_local_time
        OR NEW.move_feedback_sound_enabled IS NOT OLD.move_feedback_sound_enabled
        OR NEW.move_feedback_haptics_enabled IS NOT OLD.move_feedback_haptics_enabled
      )
    BEGIN
      INSERT INTO progress_v2_outbox (kind, entity_key, enqueued_at)
      VALUES ('preferences', 'default', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(kind, entity_key) DO UPDATE SET enqueued_at = excluded.enqueued_at;
    END;

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    VALUES ('manifest', 'default', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    SELECT 'preferences', 'default', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM app_settings WHERE id = 'default';

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    SELECT 'rating', key || char(31) || generation, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM ratings;

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    SELECT 'attempt', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM attempts;

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    SELECT 'sprint_session', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM sprint_sessions;

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    SELECT 'practice_run', id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM practice_runs;

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    SELECT 'review_schedule', puzzle_id || char(31) || mode || char(31) || rating_key,
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM review_queue;

    INSERT OR IGNORE INTO progress_v2_outbox (kind, entity_key, enqueued_at)
    SELECT 'review_schedule', puzzle_id || char(31) || mode || char(31) || rating_key,
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM review_schedule_removals;
  `);
  ensureColumn(
    db,
    "progress_v2_sync_state",
    "last_v1_check_at",
    "ALTER TABLE progress_v2_sync_state ADD COLUMN last_v1_check_at TEXT"
  );
  ensureColumn(
    db,
    "progress_v2_sync_state",
    "last_v1_check_status",
    "ALTER TABLE progress_v2_sync_state ADD COLUMN last_v1_check_status TEXT CHECK (last_v1_check_status IN ('available', 'missing'))"
  );
  ensureColumn(
    db,
    "progress_v2_outbox",
    "revision",
    "ALTER TABLE progress_v2_outbox ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)"
  );
  ensureColumn(
    db,
    "progress_v2_sync_state",
    "sealed_at",
    "ALTER TABLE progress_v2_sync_state ADD COLUMN sealed_at TEXT"
  );
}

function migrateV20ToV21(db: SyncSqliteDatabase): void {
  ensureColumn(
    db,
    "app_settings",
    "arrow_duel_opponent_reply_enabled",
    "ALTER TABLE app_settings ADD COLUMN arrow_duel_opponent_reply_enabled INTEGER NOT NULL DEFAULT 1 " +
      "CHECK (arrow_duel_opponent_reply_enabled IN (0, 1))"
  );
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

function encodeStoredThemeSelection(config: CustomSprintConfigRecord): string | null {
  const themes = normalizeThemeSelection(config.themes);
  if (themes.length === 0) {
    return null;
  }
  return themes.length === 1 ? themes[0] as string : JSON.stringify(themes);
}

function customSprintConfigFromRow(row: CustomSprintConfigRow): CustomSprintConfigRecord {
  return {
    id: row.id,
    mode: row.mode,
    ratingKey: row.rating_key,
    durationSeconds: row.duration_seconds,
    perPuzzleSeconds: row.per_puzzle_seconds,
    targetCorrect: row.target_correct,
    maxMistakes: row.max_mistakes,
    ...decodeStoredThemeSelection(row.theme),
    lastStartedAt: row.last_started_at,
    playCount: row.play_count
  };
}

function decodeStoredThemeSelection(value: string | null): {
  themes?: string[];
} {
  if (value === null) {
    return {};
  }
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every((theme) => typeof theme === "string")) {
        return decodedThemeSelection(parsed);
      }
    } catch {
      // Treat malformed or legacy scalar values as one theme below.
    }
  }
  return decodedThemeSelection([value]);
}

function decodedThemeSelection(themes: readonly string[]): { themes?: string[] } {
  const normalizedThemes = normalizeThemeSelection(themes);
  return normalizedThemes.length === 0 ? {} : { themes: normalizedThemes };
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
    lastReviewedAt: row.last_reviewed_at,
    ...(row.enrolled_at === null ? {} : { enrolledAt: row.enrolled_at })
  };
}

function reviewRemovalFromRow(row: ReviewRemovalRow): ReviewScheduleRemoval {
  return {
    puzzleId: row.puzzle_id,
    mode: row.mode,
    ratingKey: row.rating_key,
    removedAt: row.removed_at
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
    arrowDuel: {
      opponentReplyEnabled: intToBool(row.arrow_duel_opponent_reply_enabled ?? 1)
    },
    notifications: {
      reviewReminder: reminder
    },
    moveFeedback: {
      soundEnabled: intToBool(row.move_feedback_sound_enabled),
      hapticsEnabled: intToBool(row.move_feedback_haptics_enabled)
    },
    sprintGuides: {
      rulesSeen: intToBool(row.sprint_rules_guide_seen),
      activeSessionSeen: intToBool(row.sprint_active_session_guide_seen),
      arrowDuelSeen: intToBool(row.sprint_arrow_duel_guide_seen),
      focusedRunSeen: intToBool(row.sprint_focused_run_guide_seen),
      arrowDuelReplyCueStage: normalizeArrowDuelReplyCueStage(
        row.sprint_arrow_duel_reply_cue_stage
      )
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
    left.lastReviewedAt === right.lastReviewedAt &&
    left.enrolledAt === right.enrolledAt;
}

function reviewContextForChange(change: ReviewScheduleChange): ReviewContext {
  return change.kind === "scheduled" ? change.review : change.removal;
}

function compareProgressV2Tombstones(
  left: ProgressV2Tombstone,
  right: ProgressV2Tombstone
): number {
  const priority = (kind: ProgressV2Tombstone["kind"]): number =>
    kind === "attempt" ? 0 : kind === "review_schedule" ? 1 : 2;
  return priority(left.kind) - priority(right.kind) ||
    left.kind.localeCompare(right.kind) ||
    left.entityKey.localeCompare(right.entityKey);
}

function sameReviewScheduleChange(
  left: ReviewScheduleChange | undefined,
  right: ReviewScheduleChange
): boolean {
  if (!left || left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "removed" && right.kind === "removed") {
    return left.removal.removedAt === right.removal.removedAt &&
      sameReviewContext(left.removal, right.removal);
  }
  return left.kind === "scheduled" && right.kind === "scheduled" &&
    sameReviewQueue(left.review, right.review);
}

function attemptHistoryRowFromDbRow(row: AttemptHistoryDbRow): AttemptHistoryRow {
  const candidateOrder = optionalStringArrayFromJson(row.arrowDuelCandidateOrderJson);
  const {
    ratingAfter,
    submittedMove,
    elapsedMs,
    timingStatus,
    arrowDuelCandidateOrderJson: _arrowDuelCandidateOrderJson,
    unclear,
    unclearUpdatedAt,
    runId,
    runName,
    ...attempt
  } = row;
  return {
    ...attempt,
    ...(ratingAfter === null ? {} : { ratingAfter }),
    ...(submittedMove === null ? {} : { submittedMove }),
    ...(elapsedMs === null ? {} : { elapsedMs }),
    ...(timingStatus === null ? {} : { timingStatus }),
    ...(candidateOrder === undefined ? {} : { arrowDuelCandidateOrder: candidateOrder }),
    ...(unclearUpdatedAt === null ? {} : { unclear: unclear === 1, unclearUpdatedAt }),
    ...(runId === null || runId === undefined ? {} : { runId }),
    ...(runName === null || runName === undefined ? {} : { runName })
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
    ...(row.submittedMove === undefined ? {} : { submittedMove: row.submittedMove }),
    expectedMove: row.expectedMove,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    ...(row.elapsedMs === undefined ? {} : { elapsedMs: row.elapsedMs }),
    ...(row.timingStatus === undefined ? {} : { timingStatus: row.timingStatus }),
    ratingBefore: row.ratingBefore,
    ...(row.ratingAfter === undefined ? {} : { ratingAfter: row.ratingAfter }),
    ...(row.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: row.arrowDuelCandidateOrder }),
    ...(row.unclearUpdatedAt === undefined
      ? {}
      : { unclear: Boolean(row.unclear), unclearUpdatedAt: row.unclearUpdatedAt })
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

function optionalHistoryStringArrayFromJson(value: string | null):
  | { status: "absent" }
  | { status: "valid"; value: string[] }
  | { status: "corrupt" } {
  try {
    const parsed = optionalStringArrayFromJson(value);
    return parsed === undefined ? { status: "absent" } : { status: "valid", value: parsed };
  } catch {
    // Keep the row readable, but preserve the corruption so consumers cannot
    // silently fabricate a different Arrow Duel candidate set for replay.
    return { status: "corrupt" };
  }
}

function positivePerPuzzleSecondsFromConfigJson(value: string): number | undefined {
  try {
    const parsed = JSON.parse(value) as { perPuzzleSeconds?: unknown };
    return typeof parsed.perPuzzleSeconds === "number" &&
      Number.isInteger(parsed.perPuzzleSeconds) &&
      parsed.perPuzzleSeconds > 0
      ? parsed.perPuzzleSeconds
      : undefined;
  } catch {
    return undefined;
  }
}

function countRows(db: SyncSqliteDatabase, table: string, where?: string): number {
  const sql = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
  return (db.prepare(sql).get() as { count: number }).count;
}

function exportedSprintSessionFromRow(row: SprintSessionExportRow): ExportedSprintSession {
  const config = sprintSessionConfigFromConfigJson(row.configJson);
  const ratingAnchor = sprintSessionRatingAnchorFromConfigJson(row.configJson);
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
    ...ratingAnchor,
    ...(row.ratingAfter === null ? {} : { ratingAfter: row.ratingAfter }),
    ...(row.runId == null || row.runKind == null || row.runName == null
      ? {}
      : { run: { id: row.runId, kind: row.runKind, name: row.runName } }),
    ...(config === undefined ? {} : { config })
  };
}

function practiceRunFromRow(row: PracticeRunRow): PracticeRunRecord {
  const themes = optionalStringArrayFromJson(row.themes_json);
  const puzzleTiming = row.slow_after_seconds === undefined || row.timeout_after_seconds === undefined
    ? defaultRunPuzzleTiming(row.per_puzzle_seconds)
    : {
        slowAfterSeconds: row.slow_after_seconds,
        timeoutAfterSeconds: row.timeout_after_seconds
      };
  const opponentReply = row.mode === "arrow_duel"
    ? resolveOpponentReplyConfig(
        row.mode,
        row.opponent_reply_enabled === undefined || row.opponent_reply_seconds === undefined
          ? undefined
          : {
              enabled: intToBool(row.opponent_reply_enabled),
              seconds: row.opponent_reply_seconds
            }
      )
    : undefined;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    mode: row.mode,
    ratingKey: row.rating_key,
    durationSeconds: row.duration_seconds,
    perPuzzleSeconds: row.per_puzzle_seconds,
    puzzleTiming,
    targetCorrect: row.target_correct,
    maxMistakes: row.max_mistakes,
    ...(opponentReply === undefined ? {} : { opponentReply }),
    ...(themes === undefined ? {} : { themes }),
    homeOrder: row.home_order,
    archived: intToBool(row.archived),
    updatedAt: row.updated_at
  };
}

function normalizedRunOpponentReply(run: PracticeRunRecord): {
  enabled: boolean;
  seconds: number;
} {
  return resolveOpponentReplyConfig(run.mode, run.opponentReply) ?? {
    enabled: false,
    seconds: DEFAULT_OPPONENT_REPLY_SECONDS
  };
}

function normalizedRunPuzzleTiming(run: PracticeRunRecord): {
  slowAfterSeconds: number | null;
  timeoutAfterSeconds: number | null;
} {
  return run.puzzleTiming ?? defaultRunPuzzleTiming(run.perPuzzleSeconds);
}

function defaultRunPuzzleTiming(perPuzzleSeconds: number): {
  slowAfterSeconds: number | null;
  timeoutAfterSeconds: number | null;
} {
  return defaultPuzzleTimingPolicy(perPuzzleSeconds);
}

function isTacticalProfileEvidenceSession(
  session:
    | Pick<SprintState, "completedAt" | "config">
    | Pick<ExportedSprintSession, "completedAt" | "config">
    | undefined
): boolean {
  return Boolean(
    session?.completedAt &&
    session.config &&
    session.config.tacticalFocus === undefined &&
    namedThemesForSelection(session.config.themes).length === 0
  );
}

function sprintSessionConfigJson(
  existingConfig: unknown,
  ratingAnchor: Pick<
    ExportedSprintSession,
    "ratingGamesBefore" | "ratingDeviationBefore" | "volatilityBefore"
  >
): string {
  const parsed = typeof existingConfig === "string"
    ? parseJsonObject(existingConfig)
    : isJsonObject(existingConfig)
      ? existingConfig
      : {};
  const hasCompleteAnchor =
    ratingAnchor.ratingGamesBefore !== undefined &&
    ratingAnchor.ratingDeviationBefore !== undefined &&
    ratingAnchor.volatilityBefore !== undefined;
  return JSON.stringify({
    ...parsed,
    ...(hasCompleteAnchor
      ? {
          ratingStateBefore: {
            games: ratingAnchor.ratingGamesBefore,
            ratingDeviation: ratingAnchor.ratingDeviationBefore,
            volatility: ratingAnchor.volatilityBefore
          }
        }
      : {})
  });
}

function sprintSessionRatingAnchorFromConfigJson(
  configJson: string | undefined
): Pick<
  ExportedSprintSession,
  "ratingGamesBefore" | "ratingDeviationBefore" | "volatilityBefore"
> {
  if (configJson === undefined) {
    return {};
  }
  const parsed = parseJsonObject(configJson);
  const anchor = isJsonObject(parsed.ratingStateBefore) ? parsed.ratingStateBefore : undefined;
  if (
    !anchor ||
    !isNonNegativeInteger(anchor.games) ||
    !isPositiveFiniteNumber(anchor.ratingDeviation) ||
    !isPositiveFiniteNumber(anchor.volatility)
  ) {
    return {};
  }
  return {
    ratingGamesBefore: anchor.games,
    ratingDeviationBefore: anchor.ratingDeviation,
    volatilityBefore: anchor.volatility
  };
}

function sprintSessionConfigFromConfigJson(
  configJson: string | undefined
): ExportedSprintSession["config"] | undefined {
  if (configJson === undefined) {
    return undefined;
  }
  const parsed = JSON.parse(configJson) as unknown;
  if (!isJsonObject(parsed)) {
    return parsed as ExportedSprintSession["config"];
  }
  const { ratingStateBefore: _ratingStateBefore, ...config } = parsed;
  return config as unknown as ExportedSprintSession["config"];
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

function normalizeArrowDuelReplyCueStage(value: number): 0 | 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : 0;
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
