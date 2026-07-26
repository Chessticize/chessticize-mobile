import type {
  TacticalProfileCalibrationArtifact,
  TacticalProfileDailyCell,
  TacticalProfileTaskFamily
} from "../../core/src/index.ts";
import type { SyncSqliteDatabase } from "./sync-sqlite-store.ts";

export const TACTICAL_PROFILE_CACHE_SCHEMA_VERSION = 5;

export type TacticalProfileCacheIdentity = Pick<
  TacticalProfileCalibrationArtifact,
  "modelVersion" | "packFeatureHash" | "calibrationId"
>;

export type TacticalProfileBuildStatus = "empty" | "building" | "ready" | "failed";

export type TacticalProfileRatingAnchor = {
  sessionId: string;
  ratingKey: string;
  completedAt: string;
};

export type TacticalProfileFocusedRunWatermark = {
  sessionId: string;
  completedAt: string;
};

export type TacticalProfileBuildState = TacticalProfileCacheIdentity & {
  status: TacticalProfileBuildStatus;
  dirtyDayCount: number;
  sourceRevision: number;
  watermarkDay?: string;
  lastError?: string;
  evaluatedAt?: string;
  recommendedSignalIds?: readonly string[];
  ratingAnchors?: Readonly<Partial<Record<
    TacticalProfileTaskFamily,
    TacticalProfileRatingAnchor
  >>>;
  focusedRunWatermarks?: Readonly<Partial<Record<
    TacticalProfileTaskFamily,
    TacticalProfileFocusedRunWatermark
  >>>;
};

export interface TacticalProfileRepository {
  migrate(): void;
  getBuildState(): TacticalProfileBuildState | undefined;
  reset(
    identity: TacticalProfileCacheIdentity,
    completedDays: readonly string[],
    sourceRevision: number
  ): void;
  markDirtyDays(
    identity: TacticalProfileCacheIdentity,
    completedDays: readonly string[],
    sourceRevision: number
  ): void;
  listDirtyDays(identity: TacticalProfileCacheIdentity): string[];
  replaceDay(
    identity: TacticalProfileCacheIdentity,
    completedDay: string,
    cells: readonly TacticalProfileDailyCell[]
  ): void;
  listDailyCells(identity: TacticalProfileCacheIdentity): TacticalProfileDailyCell[];
  saveBuildState(state: TacticalProfileBuildState): void;
  transaction<T>(work: () => T): T;
}

export class MemoryTacticalProfileRepository implements TacticalProfileRepository {
  private buildState: TacticalProfileBuildState | undefined;
  private cells = new Map<string, TacticalProfileDailyCell>();
  private dirtyDays = new Set<string>();

  migrate(): void {}

  getBuildState(): TacticalProfileBuildState | undefined {
    return this.buildState ? cloneBuildState(this.buildState) : undefined;
  }

  reset(
    identity: TacticalProfileCacheIdentity,
    completedDays: readonly string[],
    sourceRevision: number
  ): void {
    this.cells.clear();
    this.dirtyDays = new Set(uniqueDays(completedDays));
    this.buildState = {
      ...identity,
      status: this.dirtyDays.size > 0 ? "building" : "ready",
      dirtyDayCount: this.dirtyDays.size,
      sourceRevision,
      ratingAnchors: {},
      focusedRunWatermarks: {}
    };
  }

  markDirtyDays(
    identity: TacticalProfileCacheIdentity,
    completedDays: readonly string[],
    sourceRevision: number
  ): void {
    this.assertIdentity(identity);
    uniqueDays(completedDays).forEach((day) => this.dirtyDays.add(day));
    this.buildState = {
      ...identity,
      status: this.dirtyDays.size > 0 ? "building" : this.buildState?.status ?? "empty",
      dirtyDayCount: this.dirtyDays.size,
      sourceRevision,
      ...(this.buildState?.watermarkDay === undefined
        ? {}
        : { watermarkDay: this.buildState.watermarkDay }),
      ...(this.buildState?.evaluatedAt === undefined
        ? {}
        : { evaluatedAt: this.buildState.evaluatedAt }),
      ...(this.buildState?.recommendedSignalIds === undefined
        ? {}
        : { recommendedSignalIds: [...this.buildState.recommendedSignalIds] }),
      ...(this.buildState?.ratingAnchors === undefined
        ? {}
        : { ratingAnchors: cloneRatingAnchors(this.buildState.ratingAnchors) }),
      ...(this.buildState?.focusedRunWatermarks === undefined
        ? {}
        : {
            focusedRunWatermarks:
              cloneFocusedRunWatermarks(this.buildState.focusedRunWatermarks)
          })
    };
  }

  listDirtyDays(identity: TacticalProfileCacheIdentity): string[] {
    this.assertIdentity(identity);
    return [...this.dirtyDays].sort().reverse();
  }

  replaceDay(
    identity: TacticalProfileCacheIdentity,
    completedDay: string,
    cells: readonly TacticalProfileDailyCell[]
  ): void {
    this.assertIdentity(identity);
    this.transaction(() => {
      for (const key of this.cells.keys()) {
        if (key.startsWith(`${completedDay}\u0000`)) {
          this.cells.delete(key);
        }
      }
      for (const cell of cells) {
        if (!sameIdentity(cell, identity) || cell.completedDay !== completedDay) {
          throw new Error("Tactical Profile daily cell identity does not match its cache");
        }
        this.cells.set(cellKey(cell), cloneCell(cell));
      }
      this.dirtyDays.delete(completedDay);
    });
  }

  listDailyCells(identity: TacticalProfileCacheIdentity): TacticalProfileDailyCell[] {
    this.assertIdentity(identity);
    return [...this.cells.values()].map(cloneCell).sort(compareCells);
  }

  saveBuildState(state: TacticalProfileBuildState): void {
    this.assertIdentity(state);
    this.buildState = cloneBuildState(state);
  }

  transaction<T>(work: () => T): T {
    const previousState = this.buildState && cloneBuildState(this.buildState);
    const previousCells = new Map(
      [...this.cells].map(([key, cell]) => [key, cloneCell(cell)])
    );
    const previousDirtyDays = new Set(this.dirtyDays);
    try {
      return work();
    } catch (error) {
      this.buildState = previousState;
      this.cells = previousCells;
      this.dirtyDays = previousDirtyDays;
      throw error;
    }
  }

  private assertIdentity(identity: TacticalProfileCacheIdentity): void {
    if (this.buildState && !sameIdentity(this.buildState, identity)) {
      throw new Error("Tactical Profile cache identity mismatch");
    }
  }
}

export class SQLiteTacticalProfileRepository implements TacticalProfileRepository {
  private readonly db: SyncSqliteDatabase;

  constructor(db: SyncSqliteDatabase) {
    this.db = db;
  }

  migrate(): void {
    const version = this.db.prepare("PRAGMA user_version").get() as { user_version?: number };
    const current = version.user_version ?? 0;
    if (current > TACTICAL_PROFILE_CACHE_SCHEMA_VERSION) {
      throw new Error(`Unsupported Tactical Profile cache schema version ${current}`);
    }
    if (current === TACTICAL_PROFILE_CACHE_SCHEMA_VERSION) {
      return;
    }
    this.transaction(() => {
      if (current === 0) {
        this.db.exec(`
        CREATE TABLE IF NOT EXISTS weakness_daily_stats (
          model_version TEXT NOT NULL,
          pack_feature_hash TEXT NOT NULL,
          calibration_id TEXT NOT NULL,
          completed_day TEXT NOT NULL,
          task_family TEXT NOT NULL,
          theme TEXT NOT NULL,
          solve_score REAL NOT NULL,
          solve_information REAL NOT NULL,
          solve_expected_success REAL NOT NULL,
          solve_observed_success REAL NOT NULL,
          solve_sensitivity REAL NOT NULL,
          solve_weight REAL NOT NULL,
          speed_weighted_residual REAL NOT NULL,
          speed_precision REAL NOT NULL,
          speed_weight REAL NOT NULL,
          distinct_puzzle_ids_json TEXT NOT NULL,
          distinct_session_ids_json TEXT NOT NULL,
          PRIMARY KEY (
            model_version,
            pack_feature_hash,
            calibration_id,
            completed_day,
            task_family,
            theme
          )
        );
        CREATE INDEX IF NOT EXISTS weakness_daily_stats_identity_day
          ON weakness_daily_stats (
            model_version,
            pack_feature_hash,
            calibration_id,
            completed_day DESC
          );
        CREATE TABLE IF NOT EXISTS weakness_dirty_days (
          model_version TEXT NOT NULL,
          pack_feature_hash TEXT NOT NULL,
          calibration_id TEXT NOT NULL,
          completed_day TEXT NOT NULL,
          PRIMARY KEY (
            model_version,
            pack_feature_hash,
            calibration_id,
            completed_day
          )
        );
        CREATE TABLE IF NOT EXISTS weakness_build_state (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          model_version TEXT NOT NULL,
          pack_feature_hash TEXT NOT NULL,
          calibration_id TEXT NOT NULL,
          status TEXT NOT NULL,
          dirty_day_count INTEGER NOT NULL,
          source_revision INTEGER NOT NULL,
          watermark_day TEXT,
          last_error TEXT,
          evaluated_at TEXT,
          recommended_signal_ids_json TEXT,
          rating_anchors_json TEXT,
          focused_run_watermarks_json TEXT
        );
      `);
      } else {
        if (current === 1) {
          this.db.exec(`
            ALTER TABLE weakness_build_state ADD COLUMN evaluated_at TEXT;
            ALTER TABLE weakness_build_state ADD COLUMN recommended_signal_ids_json TEXT;
          `);
        }
        if (current <= 2) {
          this.db.exec(`
            ALTER TABLE weakness_build_state
            ADD COLUMN source_revision INTEGER NOT NULL DEFAULT -1;
          `);
        }
        if (current <= 3) {
          this.db.exec(`
            ALTER TABLE weakness_build_state ADD COLUMN rating_anchors_json TEXT;
          `);
        }
        if (current <= 4) {
          this.db.exec(`
            ALTER TABLE weakness_build_state
            ADD COLUMN focused_run_watermarks_json TEXT;
          `);
        }
      }
      this.db.exec(`PRAGMA user_version = ${TACTICAL_PROFILE_CACHE_SCHEMA_VERSION}`);
    });
  }

  getBuildState(): TacticalProfileBuildState | undefined {
    const row = this.db.prepare(`
      SELECT
        model_version AS modelVersion,
        pack_feature_hash AS packFeatureHash,
        calibration_id AS calibrationId,
        status,
        dirty_day_count AS dirtyDayCount,
        source_revision AS sourceRevision,
        watermark_day AS watermarkDay,
        last_error AS lastError,
        evaluated_at AS evaluatedAt,
        recommended_signal_ids_json AS recommendedSignalIdsJson,
        rating_anchors_json AS ratingAnchorsJson,
        focused_run_watermarks_json AS focusedRunWatermarksJson
      FROM weakness_build_state
      WHERE singleton_id = 1
    `).get() as BuildStateRow | undefined;
    return row ? buildStateFromRow(row) : undefined;
  }

  reset(
    identity: TacticalProfileCacheIdentity,
    completedDays: readonly string[],
    sourceRevision: number
  ): void {
    const days = uniqueDays(completedDays);
    this.transaction(() => {
      this.db.prepare("DELETE FROM weakness_daily_stats").run();
      this.db.prepare("DELETE FROM weakness_dirty_days").run();
      for (const day of days) {
        this.insertDirtyDay(identity, day);
      }
      this.saveBuildState({
        ...identity,
        status: days.length > 0 ? "building" : "ready",
        dirtyDayCount: days.length,
        sourceRevision,
        ratingAnchors: {},
        focusedRunWatermarks: {}
      });
    });
  }

  markDirtyDays(
    identity: TacticalProfileCacheIdentity,
    completedDays: readonly string[],
    sourceRevision: number
  ): void {
    this.requireIdentity(identity);
    this.transaction(() => {
      for (const day of uniqueDays(completedDays)) {
        this.insertDirtyDay(identity, day);
      }
      const dirtyDayCount = this.countDirtyDays(identity);
      const current = this.getBuildState();
      this.saveBuildState({
        ...identity,
        status: dirtyDayCount > 0 ? "building" : current?.status ?? "empty",
        dirtyDayCount,
        sourceRevision,
        ...(current?.watermarkDay === undefined ? {} : { watermarkDay: current.watermarkDay }),
        ...(current?.evaluatedAt === undefined ? {} : { evaluatedAt: current.evaluatedAt }),
        ...(current?.recommendedSignalIds === undefined
          ? {}
          : { recommendedSignalIds: current.recommendedSignalIds }),
        ...(current?.ratingAnchors === undefined
          ? {}
          : { ratingAnchors: current.ratingAnchors }),
        ...(current?.focusedRunWatermarks === undefined
          ? {}
          : { focusedRunWatermarks: current.focusedRunWatermarks })
      });
    });
  }

  listDirtyDays(identity: TacticalProfileCacheIdentity): string[] {
    this.requireIdentity(identity);
    return (this.db.prepare(`
      SELECT completed_day AS completedDay
      FROM weakness_dirty_days
      WHERE model_version = ?
        AND pack_feature_hash = ?
        AND calibration_id = ?
      ORDER BY completed_day DESC
    `).all(identity.modelVersion, identity.packFeatureHash, identity.calibrationId) as Array<{
      completedDay: string;
    }>).map((row) => row.completedDay);
  }

  replaceDay(
    identity: TacticalProfileCacheIdentity,
    completedDay: string,
    cells: readonly TacticalProfileDailyCell[]
  ): void {
    this.requireIdentity(identity);
    this.transaction(() => {
      this.db.prepare(`
        DELETE FROM weakness_daily_stats
        WHERE model_version = ?
          AND pack_feature_hash = ?
          AND calibration_id = ?
          AND completed_day = ?
      `).run(identity.modelVersion, identity.packFeatureHash, identity.calibrationId, completedDay);
      const insert = this.db.prepare(`
        INSERT INTO weakness_daily_stats (
          model_version,
          pack_feature_hash,
          calibration_id,
          completed_day,
          task_family,
          theme,
          solve_score,
          solve_information,
          solve_expected_success,
          solve_observed_success,
          solve_sensitivity,
          solve_weight,
          speed_weighted_residual,
          speed_precision,
          speed_weight,
          distinct_puzzle_ids_json,
          distinct_session_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const cell of cells) {
        if (!sameIdentity(cell, identity) || cell.completedDay !== completedDay) {
          throw new Error("Tactical Profile daily cell identity does not match its cache");
        }
        insert.run(
          cell.modelVersion,
          cell.packFeatureHash,
          cell.calibrationId,
          cell.completedDay,
          cell.taskFamily,
          cell.theme,
          cell.solveScore,
          cell.solveInformation,
          cell.solveExpectedSuccess,
          cell.solveObservedSuccess,
          cell.solveSensitivity,
          cell.solveWeight,
          cell.speedWeightedResidual,
          cell.speedPrecision,
          cell.speedWeight,
          JSON.stringify([...cell.distinctPuzzleIds].sort()),
          JSON.stringify([...cell.distinctSessionIds].sort())
        );
      }
      this.db.prepare(`
        DELETE FROM weakness_dirty_days
        WHERE model_version = ?
          AND pack_feature_hash = ?
          AND calibration_id = ?
          AND completed_day = ?
      `).run(identity.modelVersion, identity.packFeatureHash, identity.calibrationId, completedDay);
    });
  }

  listDailyCells(identity: TacticalProfileCacheIdentity): TacticalProfileDailyCell[] {
    this.requireIdentity(identity);
    const rows = this.db.prepare(`
      SELECT
        model_version AS modelVersion,
        pack_feature_hash AS packFeatureHash,
        calibration_id AS calibrationId,
        completed_day AS completedDay,
        task_family AS taskFamily,
        theme,
        solve_score AS solveScore,
        solve_information AS solveInformation,
        solve_expected_success AS solveExpectedSuccess,
        solve_observed_success AS solveObservedSuccess,
        solve_sensitivity AS solveSensitivity,
        solve_weight AS solveWeight,
        speed_weighted_residual AS speedWeightedResidual,
        speed_precision AS speedPrecision,
        speed_weight AS speedWeight,
        distinct_puzzle_ids_json AS distinctPuzzleIdsJson,
        distinct_session_ids_json AS distinctSessionIdsJson
      FROM weakness_daily_stats
      WHERE model_version = ?
        AND pack_feature_hash = ?
        AND calibration_id = ?
      ORDER BY completed_day, task_family, theme
    `).all(identity.modelVersion, identity.packFeatureHash, identity.calibrationId) as DailyCellRow[];
    return rows.map(dailyCellFromRow);
  }

  saveBuildState(state: TacticalProfileBuildState): void {
    this.db.prepare(`
      INSERT INTO weakness_build_state (
        singleton_id,
        model_version,
        pack_feature_hash,
        calibration_id,
        status,
        dirty_day_count,
        source_revision,
        watermark_day,
        last_error,
        evaluated_at,
        recommended_signal_ids_json,
        rating_anchors_json,
        focused_run_watermarks_json
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton_id) DO UPDATE SET
        model_version = excluded.model_version,
        pack_feature_hash = excluded.pack_feature_hash,
        calibration_id = excluded.calibration_id,
        status = excluded.status,
        dirty_day_count = excluded.dirty_day_count,
        source_revision = excluded.source_revision,
        watermark_day = excluded.watermark_day,
        last_error = excluded.last_error,
        evaluated_at = excluded.evaluated_at,
        recommended_signal_ids_json = excluded.recommended_signal_ids_json,
        rating_anchors_json = excluded.rating_anchors_json,
        focused_run_watermarks_json = excluded.focused_run_watermarks_json
    `).run(
      state.modelVersion,
      state.packFeatureHash,
      state.calibrationId,
      state.status,
      state.dirtyDayCount,
      state.sourceRevision,
      state.watermarkDay ?? null,
      state.lastError ?? null,
      state.evaluatedAt ?? null,
      state.recommendedSignalIds === undefined
        ? null
        : JSON.stringify(uniqueStrings(state.recommendedSignalIds)),
      state.ratingAnchors === undefined
        ? null
        : JSON.stringify(cloneRatingAnchors(state.ratingAnchors)),
      state.focusedRunWatermarks === undefined
        ? null
        : JSON.stringify(
            cloneFocusedRunWatermarks(state.focusedRunWatermarks)
          )
    );
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

  private insertDirtyDay(identity: TacticalProfileCacheIdentity, completedDay: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO weakness_dirty_days (
        model_version,
        pack_feature_hash,
        calibration_id,
        completed_day
      ) VALUES (?, ?, ?, ?)
    `).run(identity.modelVersion, identity.packFeatureHash, identity.calibrationId, completedDay);
  }

  private countDirtyDays(identity: TacticalProfileCacheIdentity): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM weakness_dirty_days
      WHERE model_version = ?
        AND pack_feature_hash = ?
        AND calibration_id = ?
    `).get(identity.modelVersion, identity.packFeatureHash, identity.calibrationId) as { count: number };
    return row.count;
  }

  private requireIdentity(identity: TacticalProfileCacheIdentity): void {
    const state = this.getBuildState();
    if (state && !sameIdentity(state, identity)) {
      throw new Error("Tactical Profile cache identity mismatch");
    }
  }
}

interface BuildStateRow {
  modelVersion: string;
  packFeatureHash: string;
  calibrationId: string;
  status: TacticalProfileBuildStatus;
  dirtyDayCount: number;
  sourceRevision: number;
  watermarkDay: string | null;
  lastError: string | null;
  evaluatedAt: string | null;
  recommendedSignalIdsJson: string | null;
  ratingAnchorsJson: string | null;
  focusedRunWatermarksJson: string | null;
}

interface DailyCellRow extends Omit<
  TacticalProfileDailyCell,
  "taskFamily" | "distinctPuzzleIds" | "distinctSessionIds"
> {
  taskFamily: string;
  distinctPuzzleIdsJson: string;
  distinctSessionIdsJson: string;
}

function buildStateFromRow(row: BuildStateRow): TacticalProfileBuildState {
  return {
    modelVersion: row.modelVersion,
    packFeatureHash: row.packFeatureHash,
    calibrationId: row.calibrationId,
    status: row.status,
    dirtyDayCount: row.dirtyDayCount,
    sourceRevision: row.sourceRevision,
    ...(row.watermarkDay === null ? {} : { watermarkDay: row.watermarkDay }),
    ...(row.lastError === null ? {} : { lastError: row.lastError }),
    ...(row.evaluatedAt === null ? {} : { evaluatedAt: row.evaluatedAt }),
    ...(row.recommendedSignalIdsJson === null
      ? {}
      : { recommendedSignalIds: parseStringArray(row.recommendedSignalIdsJson) }),
    ...(row.ratingAnchorsJson === null
      ? {}
      : { ratingAnchors: parseRatingAnchors(row.ratingAnchorsJson) }),
    ...(row.focusedRunWatermarksJson === null
      ? {}
      : {
          focusedRunWatermarks:
            parseFocusedRunWatermarks(row.focusedRunWatermarksJson)
        })
  };
}

function cloneBuildState(state: TacticalProfileBuildState): TacticalProfileBuildState {
  return {
    ...state,
    ...(state.recommendedSignalIds === undefined
      ? {}
      : { recommendedSignalIds: uniqueStrings(state.recommendedSignalIds) }),
    ...(state.ratingAnchors === undefined
      ? {}
      : { ratingAnchors: cloneRatingAnchors(state.ratingAnchors) }),
    ...(state.focusedRunWatermarks === undefined
      ? {}
      : {
          focusedRunWatermarks:
            cloneFocusedRunWatermarks(state.focusedRunWatermarks)
        })
  };
}

function cloneRatingAnchors(
  anchors: Readonly<Partial<Record<
    TacticalProfileTaskFamily,
    TacticalProfileRatingAnchor
  >>>
): Partial<Record<TacticalProfileTaskFamily, TacticalProfileRatingAnchor>> {
  return Object.fromEntries(
    (["line", "arrow_duel"] as const).flatMap((taskFamily) => {
      const anchor = anchors[taskFamily];
      return anchor ? [[taskFamily, { ...anchor }]] : [];
    })
  );
}

function cloneFocusedRunWatermarks(
  watermarks: Readonly<Partial<Record<
    TacticalProfileTaskFamily,
    TacticalProfileFocusedRunWatermark
  >>>
): Partial<Record<TacticalProfileTaskFamily, TacticalProfileFocusedRunWatermark>> {
  return Object.fromEntries(
    (["line", "arrow_duel"] as const).flatMap((taskFamily) => {
      const watermark = watermarks[taskFamily];
      return watermark ? [[taskFamily, { ...watermark }]] : [];
    })
  );
}

function parseRatingAnchors(
  value: string
): Partial<Record<TacticalProfileTaskFamily, TacticalProfileRatingAnchor>> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Tactical Profile rating anchors");
  }
  const parsedRecord = parsed as Record<string, unknown>;
  if (
    Object.keys(parsedRecord).some(
      (key) => key !== "line" && key !== "arrow_duel"
    )
  ) {
    throw new Error("Invalid Tactical Profile rating anchors");
  }
  const anchors: Partial<Record<
    TacticalProfileTaskFamily,
    TacticalProfileRatingAnchor
  >> = {};
  for (const taskFamily of ["line", "arrow_duel"] as const) {
    const candidate = parsedRecord[taskFamily];
    if (candidate === undefined) {
      continue;
    }
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new Error("Invalid Tactical Profile rating anchor");
    }
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.sessionId !== "string" ||
      record.sessionId.length === 0 ||
      typeof record.ratingKey !== "string" ||
      record.ratingKey.length === 0 ||
      typeof record.completedAt !== "string" ||
      !isCanonicalIsoTimestamp(record.completedAt) ||
      Object.keys(record).some(
        (key) =>
          key !== "sessionId" &&
          key !== "ratingKey" &&
          key !== "completedAt"
      )
    ) {
      throw new Error("Invalid Tactical Profile rating anchor");
    }
    anchors[taskFamily] = {
      sessionId: record.sessionId,
      ratingKey: record.ratingKey,
      completedAt: record.completedAt
    };
  }
  return anchors;
}

function parseFocusedRunWatermarks(
  value: string
): Partial<Record<
  TacticalProfileTaskFamily,
  TacticalProfileFocusedRunWatermark
>> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Tactical Profile focused Run watermarks");
  }
  const parsedRecord = parsed as Record<string, unknown>;
  if (
    Object.keys(parsedRecord).some(
      (key) => key !== "line" && key !== "arrow_duel"
    )
  ) {
    throw new Error("Invalid Tactical Profile focused Run watermarks");
  }
  const watermarks: Partial<Record<
    TacticalProfileTaskFamily,
    TacticalProfileFocusedRunWatermark
  >> = {};
  for (const taskFamily of ["line", "arrow_duel"] as const) {
    const candidate = parsedRecord[taskFamily];
    if (candidate === undefined) {
      continue;
    }
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new Error("Invalid Tactical Profile focused Run watermark");
    }
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.sessionId !== "string" ||
      record.sessionId.length === 0 ||
      typeof record.completedAt !== "string" ||
      !isCanonicalIsoTimestamp(record.completedAt) ||
      Object.keys(record).some(
        (key) => key !== "sessionId" && key !== "completedAt"
      )
    ) {
      throw new Error("Invalid Tactical Profile focused Run watermark");
    }
    watermarks[taskFamily] = {
      sessionId: record.sessionId,
      completedAt: record.completedAt
    };
  }
  return watermarks;
}

function isCanonicalIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function dailyCellFromRow(row: DailyCellRow): TacticalProfileDailyCell {
  if (row.taskFamily !== "line" && row.taskFamily !== "arrow_duel") {
    throw new Error(`Unknown Tactical Profile task family ${row.taskFamily}`);
  }
  return {
    modelVersion: row.modelVersion,
    packFeatureHash: row.packFeatureHash,
    calibrationId: row.calibrationId,
    completedDay: row.completedDay,
    taskFamily: row.taskFamily,
    theme: row.theme,
    solveScore: row.solveScore,
    solveInformation: row.solveInformation,
    solveExpectedSuccess: row.solveExpectedSuccess,
    solveObservedSuccess: row.solveObservedSuccess,
    solveSensitivity: row.solveSensitivity,
    solveWeight: row.solveWeight,
    speedWeightedResidual: row.speedWeightedResidual,
    speedPrecision: row.speedPrecision,
    speedWeight: row.speedWeight,
    distinctPuzzleIds: parseStringArray(row.distinctPuzzleIdsJson),
    distinctSessionIds: parseStringArray(row.distinctSessionIdsJson)
  };
}

function parseStringArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error("Invalid Tactical Profile diversity set");
  }
  return [...new Set(parsed)].sort();
}

function uniqueDays(days: readonly string[]): string[] {
  return [...new Set(days.filter(isUtcDay))].sort();
}

function isUtcDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sameIdentity(
  left: TacticalProfileCacheIdentity,
  right: TacticalProfileCacheIdentity
): boolean {
  return left.modelVersion === right.modelVersion &&
    left.packFeatureHash === right.packFeatureHash &&
    left.calibrationId === right.calibrationId;
}

function cellKey(cell: TacticalProfileDailyCell): string {
  return `${cell.completedDay}\u0000${cell.taskFamily}\u0000${cell.theme}`;
}

function cloneCell(cell: TacticalProfileDailyCell): TacticalProfileDailyCell {
  return {
    ...cell,
    distinctPuzzleIds: [...cell.distinctPuzzleIds],
    distinctSessionIds: [...cell.distinctSessionIds]
  };
}

function compareCells(
  left: TacticalProfileDailyCell,
  right: TacticalProfileDailyCell
): number {
  return left.completedDay.localeCompare(right.completedDay) ||
    left.taskFamily.localeCompare(right.taskFamily) ||
    left.theme.localeCompare(right.theme);
}
