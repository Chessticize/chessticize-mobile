import {
  applyTacticalFocusCutoffsByTaskFamily,
  buildFocusedRunPlan,
  buildSprintConfig,
  buildTacticalProfileDailyCells,
  evaluateTacticalProfile,
  namedThemesForSelection
} from "../../core/src/index.ts";
import type {
  FocusedRunPlan,
  Puzzle,
  SprintConfig,
  TacticalProfileCalibrationArtifact,
  TacticalProfileEvaluation,
  TacticalProfileTaskFamily,
  TaskFamilyRankedTacticalFocus
} from "../../core/src/index.ts";
import type { PracticeStore, ExportedSprintSession } from "./practice-store.ts";
import type { PuzzleSource } from "./puzzle-source.ts";
import type {
  TacticalProfileBuildState,
  TacticalProfileCacheIdentity,
  TacticalProfileRepository
} from "./tactical-profile-repository.ts";

export type TacticalProfileNaturalFrequency = Readonly<Record<
  TacticalProfileTaskFamily,
  Readonly<Record<string, number>>
>>;

export type TacticalProfileFocusedRunPolicy = NonNullable<
  TacticalProfileCalibrationArtifact["focusedRun"]
>;

export type TacticalProfileSnapshot = {
  phase: "building" | TacticalProfileEvaluation["phase"];
  evaluation: TacticalProfileEvaluation;
  cutoffs: ReturnType<typeof applyTacticalFocusCutoffsByTaskFamily>;
  buildState: TacticalProfileBuildState;
  unavailableFamilies: Readonly<Partial<Record<TacticalProfileTaskFamily, string>>>;
};

export type PreparedFocusedRun = {
  plan: FocusedRunPlan;
  config: SprintConfig;
  puzzles: readonly Puzzle[];
};

export type PrepareFocusedRunResult =
  | { status: "ready"; prepared: PreparedFocusedRun }
  | {
      status: "unavailable";
      reason:
        | "profile_not_ready"
        | "no_focus"
        | "no_mixed_run"
        | "no_fresh_evidence"
        | "insufficient_inventory"
        | "policy_unavailable";
    };

export type TacticalProfileServiceOptions = {
  progressStore: PracticeStore;
  puzzleSource: PuzzleSource;
  repository: TacticalProfileRepository;
  calibration: TacticalProfileCalibrationArtifact;
  naturalFrequency: TacticalProfileNaturalFrequency;
  focusedRunPolicy?: TacticalProfileFocusedRunPolicy;
  maxDirtyDaysPerRefresh?: number;
};

export class TacticalProfileService {
  private readonly progressStore: PracticeStore;
  private readonly puzzleSource: PuzzleSource;
  private readonly repository: TacticalProfileRepository;
  private readonly calibration: TacticalProfileCalibrationArtifact;
  private readonly naturalFrequency: TacticalProfileNaturalFrequency;
  private readonly focusedRunPolicy: TacticalProfileFocusedRunPolicy | undefined;
  private readonly maxDirtyDaysPerRefresh: number;

  constructor(options: TacticalProfileServiceOptions) {
    this.progressStore = options.progressStore;
    this.puzzleSource = options.puzzleSource;
    this.repository = options.repository;
    this.calibration = options.calibration;
    this.naturalFrequency = options.naturalFrequency;
    this.focusedRunPolicy = options.focusedRunPolicy;
    this.maxDirtyDaysPerRefresh = options.maxDirtyDaysPerRefresh ?? 30;
    this.repository.migrate();
  }

  getSnapshot(now = new Date().toISOString()): TacticalProfileSnapshot {
    this.ensureIdentity();
    const hadDirtyDays = this.repository.listDirtyDays(this.identity).length > 0;
    const buildState = this.refreshDirtyDays();
    const evaluatedAt =
      hadDirtyDays || buildState.evaluatedAt === undefined
        ? now
        : buildState.evaluatedAt;
    const evaluation = evaluateTacticalProfile({
      cells: this.repository.listDailyCells(this.identity),
      calibration: this.calibration,
      naturalFrequency: this.naturalFrequency,
      now: evaluatedAt,
      ...(buildState.recommendedSignalIds === undefined
        ? {}
        : { previousRecommendedSignalIds: buildState.recommendedSignalIds })
    });
    const completedBuildState = buildState.dirtyDayCount === 0
      ? {
          ...buildState,
          evaluatedAt,
          recommendedSignalIds: evaluation.signals
            .filter((signal) => signal.status === "recommended")
            .map((signal) => signal.id)
        }
      : buildState;
    if (buildState.dirtyDayCount === 0) {
      this.repository.saveBuildState(completedBuildState);
    }
    return {
      phase: buildState.dirtyDayCount > 0 ? "building" : evaluation.phase,
      evaluation,
      cutoffs: applyTacticalFocusCutoffsByTaskFamily(evaluation.rankedFocuses),
      buildState: completedBuildState,
      unavailableFamilies: unavailableFamilies(this.calibration)
    };
  }

  markAttemptDayDirty(completedAt: string): void {
    const day = utcDay(completedAt);
    if (day) {
      this.ensureIdentity();
      this.repository.markDirtyDays(this.identity, [day]);
    }
  }

  markCanonicalImportChanged(): void {
    this.repository.reset(this.identity, this.canonicalCompletedDays());
  }

  prepareFocusedRun(
    taskFamily: TacticalProfileTaskFamily,
    now = new Date().toISOString(),
    randomSeed: string | number = now
  ): PrepareFocusedRunResult {
    if (!this.focusedRunPolicy) {
      return { status: "unavailable", reason: "policy_unavailable" };
    }
    const snapshot = this.getSnapshot(now);
    if (snapshot.phase === "building") {
      return { status: "unavailable", reason: "profile_not_ready" };
    }
    const rankedFocuses = snapshot.evaluation.rankedFocuses.filter(
      (focus) => focus.taskFamily === taskFamily
    );
    if (rankedFocuses.length === 0) {
      return { status: "unavailable", reason: "no_focus" };
    }
    const sessions = this.progressStore.listSprintSessions();
    const latestMixed = latestOrdinaryMixedSession(sessions, taskFamily);
    if (!latestMixed?.config) {
      return { status: "unavailable", reason: "no_mixed_run" };
    }
    const latestFocused = latestFocusedSession(sessions, taskFamily);
    if (
      latestFocused?.completedAt &&
      latestMixed.completedAt &&
      latestFocused.completedAt >= latestMixed.completedAt
    ) {
      return { status: "unavailable", reason: "no_fresh_evidence" };
    }

    const anchor = {
      ratingKey: latestMixed.config.ratingKey,
      rating: this.progressStore.getRating(latestMixed.config.ratingKey).rating
    };
    const exclusions = this.recentAndReviewPuzzleIds(
      now,
      this.focusedRunPolicy.recentPuzzleDays
    );
    const runFocuses = distinctRunFocuses(rankedFocuses);
    const inventoryBands = this.focusedRunPolicy.ratingBandHalfWidths.map((halfWidth) => {
      const minRating = Math.max(0, anchor.rating - halfWidth);
      const maxRating = anchor.rating + halfWidth;
      const commonFilter = {
        mode: taskFamily === "arrow_duel" ? "arrow_duel" as const : "standard" as const,
        minRating,
        maxRating,
        excludeIds: exclusions,
        randomSeed,
        limit: this.focusedRunPolicy!.runSize
      };
      return {
        minRating,
        maxRating,
        availableByTheme: Object.fromEntries(
          runFocuses.map((focus) => [
            focus.theme,
            this.puzzleSource.selectPuzzles({
              ...commonFilter,
              themes: [focus.theme]
            }).length
          ])
        ),
        mixedAvailableCount: this.selectMixedPuzzles(
          commonFilter,
          runFocuses.map((focus) => focus.theme)
        ).length
      };
    });
    const planResult = buildFocusedRunPlan({
      taskFamily,
      ratingAnchor: anchor,
      rankedFocuses: runFocuses,
      runSize: this.focusedRunPolicy.runSize,
      inventoryBands,
      excludePuzzleIds: exclusions
    });
    if (planResult.status !== "ready") {
      return { status: "unavailable", reason: "insufficient_inventory" };
    }

    const prepared = this.selectPlanPuzzles(
      planResult.plan,
      latestMixed.config,
      randomSeed
    );
    return prepared
      ? { status: "ready", prepared }
      : { status: "unavailable", reason: "insufficient_inventory" };
  }

  private refreshDirtyDays(): TacticalProfileBuildState {
    this.ensureIdentity();
    const previousState = this.repository.getBuildState();
    const dirtyDays = this.repository
      .listDirtyDays(this.identity)
      .slice(0, this.maxDirtyDaysPerRefresh);
    if (dirtyDays.length === 0) {
      const ready = {
        ...this.identity,
        status: "ready" as const,
        dirtyDayCount: 0,
        ...(previousState?.watermarkDay === undefined
          ? {}
          : { watermarkDay: previousState.watermarkDay }),
        ...(previousState?.evaluatedAt === undefined
          ? {}
          : { evaluatedAt: previousState.evaluatedAt }),
        ...(previousState?.recommendedSignalIds === undefined
          ? {}
          : { recommendedSignalIds: previousState.recommendedSignalIds })
      };
      this.repository.saveBuildState(ready);
      return ready;
    }

    const attempts = dirtyDays.flatMap((day) =>
      this.progressStore.listAttempts({
        source: "sprint",
        since: `${day}T00:00:00.000Z`,
        until: `${nextUtcDay(day)}T00:00:00.000Z`
      })
    );
    const sessions = new Map(
      this.progressStore
        .getSprintSessions(attempts.map((attempt) => attempt.sessionId))
        .map((session) => [session.id, session])
    );
    const attemptsByDay = new Map<string, typeof attempts>();
    const dirtyDaySet = new Set(dirtyDays);
    for (const attempt of attempts) {
      const day = utcDay(attempt.completedAt);
      if (!day || !dirtyDaySet.has(day)) {
        continue;
      }
      const dayAttempts = attemptsByDay.get(day) ?? [];
      dayAttempts.push(attempt);
      attemptsByDay.set(day, dayAttempts);
    }
    try {
      for (const day of dirtyDays) {
        const dayAttempts = attemptsByDay.get(day) ?? [];
        const puzzles = this.readPuzzles(dayAttempts.map((attempt) => attempt.puzzleId));
        const puzzleById = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
        const cells = buildTacticalProfileDailyCells(
          dayAttempts.flatMap((attempt) => {
            const puzzle = puzzleById.get(attempt.puzzleId);
            if (!puzzle) {
              return [];
            }
            const sessionConfig = sessions.get(attempt.sessionId)?.config;
            return [{
              attempt,
              ...(sessionConfig === undefined ? {} : { sessionConfig }),
              puzzle
            }];
          }),
          this.calibration
        );
        this.repository.replaceDay(this.identity, day, cells);
      }
      const remaining = this.repository.listDirtyDays(this.identity);
      const state: TacticalProfileBuildState = {
        ...this.identity,
        status: remaining.length > 0 ? "building" : "ready",
        dirtyDayCount: remaining.length,
        watermarkDay: dirtyDays[0] as string,
        ...(previousState?.evaluatedAt === undefined
          ? {}
          : { evaluatedAt: previousState.evaluatedAt }),
        ...(previousState?.recommendedSignalIds === undefined
          ? {}
          : { recommendedSignalIds: previousState.recommendedSignalIds })
      };
      this.repository.saveBuildState(state);
      return state;
    } catch (error) {
      const state: TacticalProfileBuildState = {
        ...this.identity,
        status: "failed",
        dirtyDayCount: this.repository.listDirtyDays(this.identity).length,
        lastError: error instanceof Error ? error.message : String(error)
      };
      this.repository.saveBuildState(state);
      throw error;
    }
  }

  private ensureIdentity(): void {
    const state = this.repository.getBuildState();
    if (!state || !sameIdentity(state, this.identity)) {
      this.repository.reset(this.identity, this.canonicalCompletedDays());
    }
  }

  private canonicalCompletedDays(): string[] {
    return [...new Set(
      this.progressStore
        .listAttempts({ source: "sprint" })
        .map((attempt) => utcDay(attempt.completedAt))
        .filter((day): day is string => day !== undefined)
    )].sort();
  }

  private readPuzzles(ids: readonly string[]): Puzzle[] {
    if (this.puzzleSource.getPuzzles) {
      return this.puzzleSource.getPuzzles(ids);
    }
    return [...new Set(ids)].flatMap((id) => {
      const puzzle = this.puzzleSource.getPuzzle(id);
      return puzzle ? [puzzle] : [];
    });
  }

  private recentAndReviewPuzzleIds(now: string, recentDays: number): string[] {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - recentDays);
    return [...new Set([
      ...this.progressStore
        .listAttempts({ since: cutoff.toISOString() })
        .map((attempt) => attempt.puzzleId),
      ...this.progressStore.listReviewQueue().map((review) => review.puzzleId)
    ])].sort();
  }

  private selectMixedPuzzles(
    filter: Parameters<PuzzleSource["selectPuzzles"]>[0],
    excludedThemes: readonly string[]
  ): Puzzle[] {
    if (this.puzzleSource.selectPuzzlesExcludingThemes) {
      return this.puzzleSource.selectPuzzlesExcludingThemes(filter, excludedThemes);
    }
    const excluded = new Set(excludedThemes);
    return this.puzzleSource
      .selectPuzzles({ ...filter, limit: Math.max(filter.limit * 20, 200) })
      .filter((puzzle) => !puzzle.themes.some((theme) => excluded.has(theme)))
      .slice(0, filter.limit);
  }

  private selectPlanPuzzles(
    plan: FocusedRunPlan,
    sourceConfig: SprintConfig,
    randomSeed: string | number
  ): PreparedFocusedRun | undefined {
    const selectedIds = new Set(plan.excludePuzzleIds);
    const quotas: Puzzle[][] = [];
    for (const reason of plan.reasons) {
      const puzzles = this.puzzleSource.selectPuzzles({
        mode: plan.taskFamily === "arrow_duel" ? "arrow_duel" : "standard",
        minRating: plan.minRating,
        maxRating: plan.maxRating,
        themes: [reason.theme],
        excludeIds: [...selectedIds],
        limit: reason.count,
        randomSeed: `${randomSeed}:${reason.theme}`
      });
      if (puzzles.length !== reason.count) {
        return undefined;
      }
      puzzles.forEach((puzzle) => selectedIds.add(puzzle.id));
      quotas.push(puzzles);
    }
    const mixed = this.selectMixedPuzzles({
      mode: plan.taskFamily === "arrow_duel" ? "arrow_duel" : "standard",
      minRating: plan.minRating,
      maxRating: plan.maxRating,
      excludeIds: [...selectedIds],
      limit: plan.mixedControlCount,
      randomSeed: `${randomSeed}:mixed`
    }, plan.reasons.map((reason) => reason.theme));
    if (mixed.length !== plan.mixedControlCount) {
      return undefined;
    }
    quotas.push(mixed);
    const puzzles = weaveQuotaPuzzles(quotas);
    const config = {
      ...buildSprintConfig({
        mode: plan.taskFamily === "arrow_duel" ? "arrow_duel" : sourceConfig.mode,
        durationSeconds: sourceConfig.durationSeconds,
        perPuzzleSeconds: sourceConfig.perPuzzleSeconds,
        ...(sourceConfig.puzzleTiming === undefined
          ? {}
          : { puzzleTiming: sourceConfig.puzzleTiming }),
        targetCorrect: puzzles.length,
        maxMistakes: puzzles.length,
        maxAttempts: puzzles.length,
        ratingPolicy: "unrated",
        tacticalFocus: {
          taskFamily: plan.taskFamily,
          themes: plan.reasons.map((reason) => reason.theme),
          mixedControlCount: plan.mixedControlCount,
          ratingAnchor: plan.ratingAnchor.rating,
          minRating: plan.minRating,
          maxRating: plan.maxRating
        }
      }),
      ratingKey: plan.ratingAnchor.ratingKey
    };
    return { plan, config, puzzles };
  }

  private get identity(): TacticalProfileCacheIdentity {
    return {
      modelVersion: this.calibration.modelVersion,
      packFeatureHash: this.calibration.packFeatureHash,
      calibrationId: this.calibration.calibrationId
    };
  }
}

function nextUtcDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid Tactical Profile dirty day: ${day}`);
  }
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function latestOrdinaryMixedSession(
  sessions: readonly ExportedSprintSession[],
  taskFamily: TacticalProfileTaskFamily
): ExportedSprintSession | undefined {
  return sessions
    .filter((session) => session.completedAt !== undefined)
    .filter((session) => {
      if (!session.config || session.config.tacticalFocus !== undefined) {
        return false;
      }
      const family = session.config.mode === "arrow_duel" ? "arrow_duel" : "line";
      return family === taskFamily && namedThemesForSelection(session.config.themes).length === 0;
    })
    .sort(compareCompletedSessions)
    .at(-1);
}

function latestFocusedSession(
  sessions: readonly ExportedSprintSession[],
  taskFamily: TacticalProfileTaskFamily
): ExportedSprintSession | undefined {
  return sessions
    .filter((session) =>
      session.completedAt !== undefined &&
      session.config?.tacticalFocus?.taskFamily === taskFamily
    )
    .sort(compareCompletedSessions)
    .at(-1);
}

function compareCompletedSessions(
  left: ExportedSprintSession,
  right: ExportedSprintSession
): number {
  return (left.completedAt ?? "").localeCompare(right.completedAt ?? "") ||
    left.id.localeCompare(right.id);
}

function distinctRunFocuses(
  focuses: readonly TaskFamilyRankedTacticalFocus[]
): TaskFamilyRankedTacticalFocus[] {
  const distinct = new Map<string, TaskFamilyRankedTacticalFocus>();
  for (const focus of focuses) {
    const existing = distinct.get(focus.theme);
    distinct.set(focus.theme, existing && existing.reason !== focus.reason
      ? { ...focus, reason: "both" }
      : focus);
  }
  return [...distinct.values()].slice(0, 2);
}

function weaveQuotaPuzzles(quotas: readonly Puzzle[][]): Puzzle[] {
  const remaining = quotas.map((quota) => [...quota]);
  const nonEmptyCounts = quotas.map((quota) => quota.length).filter((count) => count > 0);
  const cycleCount = nonEmptyCounts.reduce(greatestCommonDivisor, 0);
  const perCycle = quotas.map((quota) =>
    cycleCount === 0 ? 0 : quota.length / cycleCount
  );
  const output: Puzzle[] = [];
  while (remaining.some((quota) => quota.length > 0)) {
    for (const [index, quota] of remaining.entries()) {
      output.push(...quota.splice(0, perCycle[index] ?? 0));
    }
  }
  return output;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function utcDay(timestamp: string): string | undefined {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}

function sameIdentity(
  left: TacticalProfileCacheIdentity,
  right: TacticalProfileCacheIdentity
): boolean {
  return left.modelVersion === right.modelVersion &&
    left.packFeatureHash === right.packFeatureHash &&
    left.calibrationId === right.calibrationId;
}

function unavailableFamilies(
  calibration: TacticalProfileCalibrationArtifact
): Partial<Record<TacticalProfileTaskFamily, string>> {
  return Object.fromEntries(
    Object.entries(calibration.families).flatMap(([family, value]) =>
      value.status === "unavailable" ? [[family, value.reason]] : []
    )
  );
}
