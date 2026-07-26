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
import type {
  ExportedSprintSession,
  LocalDataImportObserver,
  PracticeStore
} from "./practice-store.ts";
import type { AttemptHistoryRow } from "./query-types.ts";
import { selectUniquePuzzlesForRatingBands } from "./puzzle-selection.ts";
import type {
  PuzzleSource,
  RatingBandPuzzleSelection,
  RatingBandPuzzleSelectionInput
} from "./puzzle-source.ts";
import type {
  TacticalProfileBuildState,
  TacticalProfileCacheIdentity,
  TacticalProfileRepository
} from "./tactical-profile-repository.ts";

export type TacticalProfileNaturalFrequency = Readonly<Record<
  TacticalProfileTaskFamily,
  Readonly<Record<string, number>>
>>;

export type TacticalProfileNaturalFrequencyForRating = (
  taskFamily: TacticalProfileTaskFamily,
  rating: number
) => Readonly<Record<string, number>>;

export type TacticalProfileInventoryUpperBound = (
  taskFamily: TacticalProfileTaskFamily,
  minRating: number,
  maxRating: number,
  themes: readonly string[]
) => Readonly<Record<string, number>> | undefined;

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
  naturalFrequencyForRating?: TacticalProfileNaturalFrequencyForRating;
  inventoryUpperBound?: TacticalProfileInventoryUpperBound;
  focusedRunPolicy?: TacticalProfileFocusedRunPolicy;
  maxDirtyDaysPerRefresh?: number;
};

export class TacticalProfileService {
  private readonly progressStore: PracticeStore;
  private readonly puzzleSource: PuzzleSource;
  private readonly repository: TacticalProfileRepository;
  private readonly calibration: TacticalProfileCalibrationArtifact;
  private readonly naturalFrequency: TacticalProfileNaturalFrequency;
  private readonly naturalFrequencyForRating:
    | TacticalProfileNaturalFrequencyForRating
    | undefined;
  private readonly inventoryUpperBound:
    | TacticalProfileInventoryUpperBound
    | undefined;
  private readonly focusedRunPolicy: TacticalProfileFocusedRunPolicy | undefined;
  private readonly maxDirtyDaysPerRefresh: number;
  private repositoryReady = false;
  private requiresCanonicalRebuild = false;
  private lastCacheError: string | undefined;
  private observedSourceRevision: number | undefined;

  constructor(options: TacticalProfileServiceOptions) {
    this.progressStore = options.progressStore;
    this.puzzleSource = options.puzzleSource;
    this.repository = options.repository;
    this.calibration = options.calibration;
    this.naturalFrequency = options.naturalFrequency;
    this.naturalFrequencyForRating = options.naturalFrequencyForRating;
    this.inventoryUpperBound = options.inventoryUpperBound;
    this.focusedRunPolicy = options.focusedRunPolicy;
    this.maxDirtyDaysPerRefresh = options.maxDirtyDaysPerRefresh ?? 30;
    try {
      this.ensureIdentity();
    } catch (error) {
      this.recordCacheFailure(error);
    }
  }

  getSnapshot(now = new Date().toISOString()): TacticalProfileSnapshot {
    try {
      this.ensureRepositoryReady();
      return this.readSnapshot(now);
    } catch (error) {
      this.recordCacheFailure(error);
      return this.failedSnapshot();
    }
  }

  private readSnapshot(now: string): TacticalProfileSnapshot {
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
      naturalFrequency: this.currentNaturalFrequency(),
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
      try {
        this.ensureRepositoryReady();
        this.markDirtyDaysAtCurrentRevision([day]);
      } catch (error) {
        this.recordCacheFailure(error);
      }
    }
  }

  markCanonicalImportChanged(): void {
    this.requiresCanonicalRebuild = true;
    try {
      this.ensureRepositoryReady();
      this.repository.reset(
        this.identity,
        this.canonicalCompletedDays(),
        this.sourceRevision
      );
      this.requiresCanonicalRebuild = false;
      this.observedSourceRevision = this.sourceRevision;
      this.lastCacheError = undefined;
    } catch (error) {
      this.recordCacheFailure(error);
    }
  }

  beginCanonicalImport(): {
    observer: LocalDataImportObserver;
    finish: () => void;
  } {
    const dirtyDays = new Set<string>();
    const changedSessionIds = new Set<string>();
    let completed = false;
    return {
      observer: {
        onAttemptChanged: (previous, next) => {
          addCanonicalAttemptDay(dirtyDays, previous);
          addCanonicalAttemptDay(dirtyDays, next);
        },
        onSprintSessionChanged: (previous, next) => {
          if (sessionFingerprint(previous) !== sessionFingerprint(next)) {
            changedSessionIds.add(next.id);
          }
        }
      },
      finish: () => {
        if (completed) {
          return;
        }
        completed = true;
        try {
          if (changedSessionIds.size > 0) {
            for (const day of this.progressStore.listSprintAttemptUtcDays(
              [...changedSessionIds]
            )) {
              dirtyDays.add(day);
            }
          }
          this.markCanonicalDaysChanged([...dirtyDays].sort());
        } catch (error) {
          this.recordCacheFailure(error);
        }
      }
    };
  }

  private markCanonicalDaysChanged(completedDays: readonly string[]): void {
    if (completedDays.length === 0) {
      return;
    }
    try {
      this.ensureRepositoryReady();
      this.markDirtyDaysAtCurrentRevision(completedDays);
    } catch (error) {
      this.recordCacheFailure(error);
    }
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
    const latestMixed = latestOrdinaryMixedSession(
      sessions,
      taskFamily,
      (sessionId) =>
        this.progressStore.listAttempts({
          source: "sprint",
          sessionId
        }).length > 0
    );
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
    const viableHalfWidths: number[] = [];
    for (const halfWidth of this.focusedRunPolicy.ratingBandHalfWidths) {
      const minRating = Math.max(0, anchor.rating - halfWidth);
      const maxRating = anchor.rating + halfWidth;
      const upperBound = this.inventoryUpperBound?.(
        taskFamily,
        minRating,
        maxRating,
        runFocuses.map((focus) => focus.theme)
      );
      if (upperBound) {
        const preflight = buildFocusedRunPlan({
          taskFamily,
          ratingAnchor: anchor,
          rankedFocuses: runFocuses,
          runSize: this.focusedRunPolicy!.runSize,
          inventoryBands: [{
            minRating,
            maxRating,
            availableByTheme: upperBound,
            mixedAvailableCount: this.focusedRunPolicy!.runSize
          }],
          excludePuzzleIds: exclusions,
          ...(this.focusedRunPolicy!.themeShortfallBackfill === undefined
            ? {}
            : {
                themeShortfallBackfill:
                  this.focusedRunPolicy!.themeShortfallBackfill
              })
        });
        if (preflight.status !== "ready") {
          continue;
        }
      }
      viableHalfWidths.push(halfWidth);
    }
    if (viableHalfWidths.length === 0) {
      return { status: "unavailable", reason: "insufficient_inventory" };
    }
    const commonFilter = {
      mode:
        taskFamily === "arrow_duel"
          ? "arrow_duel" as const
          : "standard" as const,
      excludeIds: exclusions,
      randomSeed,
      limit: this.focusedRunPolicy.runSize
    };
    const candidatesByThemeAndBand = new Map(
      runFocuses.map((focus) => [
        focus.theme,
        this.selectRatingBandPuzzles({
          filter: {
            ...commonFilter,
            themes: [focus.theme]
          },
          ratingAnchor: anchor.rating,
          halfWidths: viableHalfWidths
        })
      ])
    );
    const mixedCandidatesByBand = this.selectRatingBandPuzzles({
      filter: commonFilter,
      ratingAnchor: anchor.rating,
      halfWidths: viableHalfWidths,
      excludedThemes: runFocuses.map((focus) => focus.theme)
    });
    for (const halfWidth of viableHalfWidths) {
      const minRating = Math.max(0, anchor.rating - halfWidth);
      const maxRating = anchor.rating + halfWidth;
      const candidatesByTheme = new Map(
        runFocuses.map((focus) => [
          focus.theme,
          candidatesByThemeAndBand
            .get(focus.theme)
            ?.find((selection) => selection.halfWidth === halfWidth)
            ?.puzzles ?? []
        ])
      );
      const mixedCandidates =
        mixedCandidatesByBand.find(
          (selection) => selection.halfWidth === halfWidth
        )?.puzzles ?? [];
      const inventoryBand = {
        minRating,
        maxRating,
        availableByTheme: Object.fromEntries(
          runFocuses.map((focus) => [
            focus.theme,
            candidatesByTheme.get(focus.theme)?.length ?? 0
          ])
        ),
        mixedAvailableCount: mixedCandidates.length
      };
      const planResult = buildFocusedRunPlan({
        taskFamily,
        ratingAnchor: anchor,
        rankedFocuses: runFocuses,
        runSize: this.focusedRunPolicy.runSize,
        inventoryBands: [inventoryBand],
        excludePuzzleIds: exclusions,
        ...(this.focusedRunPolicy.themeShortfallBackfill === undefined
          ? {}
          : {
              themeShortfallBackfill:
                this.focusedRunPolicy.themeShortfallBackfill
            })
      });
      if (planResult.status !== "ready") {
        continue;
      }
      const prepared = this.selectPlanPuzzles(
        planResult.plan,
        latestMixed.config,
        candidatesByTheme,
        mixedCandidates
      );
      if (prepared) {
        return { status: "ready", prepared };
      }
    }
    return { status: "unavailable", reason: "insufficient_inventory" };
  }

  private selectRatingBandPuzzles(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[] {
    if (this.puzzleSource.selectPuzzlesForRatingBands) {
      return this.puzzleSource.selectPuzzlesForRatingBands(input);
    }
    const widestHalfWidth = Math.max(...input.halfWidths, 0);
    const { randomSeed: _randomSeed, ...unseededFilter } =
      input.filter;
    const candidateFilter = {
      ...unseededFilter,
      minRating: Math.max(0, input.ratingAnchor - widestHalfWidth),
      maxRating: input.ratingAnchor + widestHalfWidth,
      preferredRating: input.ratingAnchor,
      limit: Math.max(input.filter.limit * 50, 200)
    };
    const candidates = input.excludedThemes === undefined
      ? this.puzzleSource.selectPuzzles(candidateFilter)
      : this.selectMixedPuzzles(
          candidateFilter,
          input.excludedThemes
        );
    return selectUniquePuzzlesForRatingBands(candidates, input);
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
        sourceRevision: previousState?.sourceRevision ?? this.sourceRevision,
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
            const session = sessions.get(attempt.sessionId);
            const sessionConfig = session?.completedAt
              ? session.config
              : undefined;
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
        sourceRevision: previousState?.sourceRevision ?? this.sourceRevision,
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
        sourceRevision: previousState?.sourceRevision ?? this.sourceRevision,
        lastError: error instanceof Error ? error.message : String(error)
      };
      this.repository.saveBuildState(state);
      throw error;
    }
  }

  private ensureIdentity(): void {
    this.ensureRepositoryReady();
    const sourceRevision = this.sourceRevision;
    if (this.requiresCanonicalRebuild) {
      this.repository.reset(
        this.identity,
        this.canonicalCompletedDays(),
        sourceRevision
      );
      this.requiresCanonicalRebuild = false;
      this.observedSourceRevision = sourceRevision;
      this.lastCacheError = undefined;
      return;
    }
    const state = this.repository.getBuildState();
    if (
      !state ||
      !sameIdentity(state, this.identity) ||
      state.sourceRevision !== sourceRevision
    ) {
      this.repository.reset(
        this.identity,
        this.canonicalCompletedDays(),
        sourceRevision
      );
      this.lastCacheError = undefined;
    }
    this.observedSourceRevision = sourceRevision;
  }

  private markDirtyDaysAtCurrentRevision(completedDays: readonly string[]): void {
    const sourceRevision = this.sourceRevision;
    const state = this.repository.getBuildState();
    if (
      this.requiresCanonicalRebuild ||
      !state ||
      !sameIdentity(state, this.identity) ||
      (
        this.observedSourceRevision !== undefined &&
        state.sourceRevision !== this.observedSourceRevision
      )
    ) {
      this.repository.reset(
        this.identity,
        this.canonicalCompletedDays(),
        sourceRevision
      );
      this.requiresCanonicalRebuild = false;
      this.observedSourceRevision = sourceRevision;
      return;
    }
    this.repository.markDirtyDays(
      this.identity,
      completedDays,
      sourceRevision
    );
    this.observedSourceRevision = sourceRevision;
  }

  private get sourceRevision(): number {
    return this.progressStore.getTacticalProfileSourceRevision();
  }

  private ensureRepositoryReady(): void {
    if (this.repositoryReady) {
      return;
    }
    this.repository.migrate();
    this.repositoryReady = true;
  }

  private recordCacheFailure(error: unknown): void {
    this.repositoryReady = false;
    this.requiresCanonicalRebuild = true;
    this.lastCacheError = error instanceof Error ? error.message : String(error);
  }

  private failedSnapshot(): TacticalProfileSnapshot {
    const reason = "Local Tactical Profile cache is temporarily unavailable";
    const evaluation: TacticalProfileEvaluation = {
      phase: "collecting",
      signals: [],
      rankedFocuses: [],
      observedThemeCount: 0
    };
    return {
      phase: "building",
      evaluation,
      cutoffs: applyTacticalFocusCutoffsByTaskFamily([]),
      buildState: {
        ...this.identity,
        status: "failed",
        dirtyDayCount: 0,
        sourceRevision: this.sourceRevision,
        lastError: this.lastCacheError ?? reason
      },
      unavailableFamilies: {
        line: reason,
        arrow_duel: reason
      }
    };
  }

  private currentNaturalFrequency(): TacticalProfileNaturalFrequency {
    if (!this.naturalFrequencyForRating) {
      return this.naturalFrequency;
    }
    const sessions = this.progressStore.listSprintSessions();
    const frequencies: Record<
      TacticalProfileTaskFamily,
      Readonly<Record<string, number>>
    > = {
      line: this.naturalFrequency.line,
      arrow_duel: this.naturalFrequency.arrow_duel
    };
    for (const taskFamily of ["line", "arrow_duel"] as const) {
      const latest = latestOrdinaryMixedSessionByConfiguration(
        sessions,
        taskFamily
      );
      if (!latest?.config) {
        continue;
      }
      const rating = this.progressStore.getRating(latest.config.ratingKey).rating;
      frequencies[taskFamily] = this.naturalFrequencyForRating(
        taskFamily,
        rating
      );
    }
    return frequencies;
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
    candidatesByTheme: ReadonlyMap<string, readonly Puzzle[]>,
    mixedCandidates: readonly Puzzle[]
  ): PreparedFocusedRun | undefined {
    const assignment = exactQuotaAssignment({
      plan,
      candidatesByTheme,
      mixedCandidates,
      minimumPuzzlesPerTheme:
        this.focusedRunPolicy?.themeShortfallBackfill?.minimumPuzzlesPerTheme
    });
    if (!assignment) {
      return undefined;
    }
    const puzzles = weaveQuotaPuzzles(assignment.quotas);
    const exactPlan = assignment.plan;
    const config = {
      ...buildSprintConfig({
        mode: exactPlan.taskFamily === "arrow_duel" ? "arrow_duel" : sourceConfig.mode,
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
          taskFamily: exactPlan.taskFamily,
          themes: exactPlan.reasons.map((reason) => reason.theme),
          mixedControlCount: exactPlan.mixedControlCount,
          ratingAnchor: exactPlan.ratingAnchor.rating,
          minRating: exactPlan.minRating,
          maxRating: exactPlan.maxRating
        }
      }),
      ratingKey: exactPlan.ratingAnchor.ratingKey
    };
    return { plan: exactPlan, config, puzzles };
  }

  private get identity(): TacticalProfileCacheIdentity {
    return {
      modelVersion: this.calibration.modelVersion,
      packFeatureHash: this.calibration.packFeatureHash,
      calibrationId: this.calibration.calibrationId
    };
  }
}

function addCanonicalAttemptDay(
  dirtyDays: Set<string>,
  attempt: AttemptHistoryRow | undefined
): void {
  if (attempt?.source !== "sprint") {
    return;
  }
  const day = utcDay(attempt.completedAt);
  if (day) {
    dirtyDays.add(day);
  }
}

function sessionFingerprint(
  session: ExportedSprintSession | undefined
): string | undefined {
  if (!session) {
    return undefined;
  }
  const config = session.config;
  const focus = config?.tacticalFocus;
  return JSON.stringify([
    session.mode,
    session.ratingKey,
    session.status,
    session.completedAt ?? null,
    config?.mode ?? null,
    config?.durationSeconds ?? null,
    config?.perPuzzleSeconds ?? null,
    config?.puzzleTiming?.slowAfterSeconds ?? null,
    config?.puzzleTiming?.timeoutAfterSeconds ?? null,
    config?.targetCorrect ?? null,
    config?.maxMistakes ?? null,
    config?.maxAttempts ?? null,
    config?.ratingKey ?? null,
    config?.ratingPolicy ?? null,
    [...(config?.themes ?? [])].sort(),
    focus
      ? [
          focus.taskFamily,
          [...focus.themes].sort(),
          focus.mixedControlCount,
          focus.ratingAnchor,
          focus.minRating,
          focus.maxRating
        ]
      : null
  ]);
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
  taskFamily: TacticalProfileTaskFamily,
  hasCanonicalAttempt: (sessionId: string) => boolean
): ExportedSprintSession | undefined {
  return ordinaryMixedSessions(sessions, taskFamily)
    .sort((left, right) => compareCompletedSessions(right, left))
    .find((session) => hasCanonicalAttempt(session.id));
}

function latestOrdinaryMixedSessionByConfiguration(
  sessions: readonly ExportedSprintSession[],
  taskFamily: TacticalProfileTaskFamily
): ExportedSprintSession | undefined {
  return ordinaryMixedSessions(sessions, taskFamily)
    .sort((left, right) => compareCompletedSessions(right, left))[0];
}

function ordinaryMixedSessions(
  sessions: readonly ExportedSprintSession[],
  taskFamily: TacticalProfileTaskFamily
): ExportedSprintSession[] {
  return sessions
    .filter((session) => session.completedAt !== undefined)
    .filter((session) => {
      if (!session.config || session.config.tacticalFocus !== undefined) {
        return false;
      }
      const family = session.config.mode === "arrow_duel" ? "arrow_duel" : "line";
      return family === taskFamily &&
        namedThemesForSelection(session.config.themes).length === 0;
    });
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

function exactQuotaAssignment(input: {
  plan: FocusedRunPlan;
  candidatesByTheme: ReadonlyMap<string, readonly Puzzle[]>;
  mixedCandidates: readonly Puzzle[];
  minimumPuzzlesPerTheme: number | undefined;
}): { plan: FocusedRunPlan; quotas: Puzzle[][] } | undefined {
  const reasons = input.plan.reasons;
  if (reasons.length < 1 || reasons.length > 2) {
    return undefined;
  }
  const excludedIds = new Set(input.plan.excludePuzzleIds);
  const candidatePools = reasons.map((reason) =>
    uniquePuzzles(input.candidatesByTheme.get(reason.theme) ?? [])
      .filter((puzzle) => !excludedIds.has(puzzle.id))
  );
  const mixedPool = uniquePuzzles(input.mixedCandidates)
    .filter((puzzle) => !excludedIds.has(puzzle.id));
  const minimumCounts = reasons.map((reason) =>
    input.minimumPuzzlesPerTheme === undefined
      ? reason.count
      : Math.min(reason.count, input.minimumPuzzlesPerTheme)
  );

  if (reasons.length === 1) {
    const reason = reasons[0] as FocusedRunPlan["reasons"][number];
    const candidates = candidatePools[0] as Puzzle[];
    for (
      let count = reason.count;
      count >= (minimumCounts[0] as number);
      count -= 1
    ) {
      const selected = candidates.slice(0, count);
      const selectedIds = new Set(selected.map((puzzle) => puzzle.id));
      const mixedCount =
        input.plan.mixedControlCount + reason.count - count;
      const mixed = mixedPool
        .filter((puzzle) => !selectedIds.has(puzzle.id))
        .slice(0, mixedCount);
      if (selected.length !== count || mixed.length !== mixedCount) {
        continue;
      }
      return {
        plan: {
          ...input.plan,
          reasons: [{ ...reason, count }],
          mixedControlCount: mixedCount
        },
        quotas: [selected, mixed]
      };
    }
    return undefined;
  }

  const primaryReason = reasons[0] as FocusedRunPlan["reasons"][number];
  const secondaryReason = reasons[1] as FocusedRunPlan["reasons"][number];
  const primaryPool = candidatePools[0] as Puzzle[];
  const secondaryPool = candidatePools[1] as Puzzle[];
  const primaryIds = new Set(primaryPool.map((puzzle) => puzzle.id));
  const secondaryIds = new Set(secondaryPool.map((puzzle) => puzzle.id));
  const primaryOnly = primaryPool.filter(
    (puzzle) => !secondaryIds.has(puzzle.id)
  );
  const secondaryOnly = secondaryPool.filter(
    (puzzle) => !primaryIds.has(puzzle.id)
  );
  const overlap = primaryPool.filter((puzzle) =>
    secondaryIds.has(puzzle.id)
  );

  for (
    let primaryCount = primaryReason.count;
    primaryCount >= (minimumCounts[0] as number);
    primaryCount -= 1
  ) {
    for (
      let secondaryCount = secondaryReason.count;
      secondaryCount >= (minimumCounts[1] as number);
      secondaryCount -= 1
    ) {
      const primaryOverlapCount = Math.max(
        0,
        primaryCount - primaryOnly.length
      );
      const secondaryOverlapCount = Math.max(
        0,
        secondaryCount - secondaryOnly.length
      );
      if (
        primaryCount > primaryPool.length ||
        secondaryCount > secondaryPool.length ||
        primaryOverlapCount + secondaryOverlapCount > overlap.length
      ) {
        continue;
      }
      const primary = [
        ...primaryOnly.slice(0, primaryCount),
        ...overlap.slice(0, primaryOverlapCount)
      ].slice(0, primaryCount);
      const usedPrimaryIds = new Set(primary.map((puzzle) => puzzle.id));
      const secondary = [
        ...secondaryOnly.slice(0, secondaryCount),
        ...overlap.filter((puzzle) => !usedPrimaryIds.has(puzzle.id))
      ].slice(0, secondaryCount);
      if (
        primary.length !== primaryCount ||
        secondary.length !== secondaryCount
      ) {
        continue;
      }
      const selectedIds = new Set([
        ...primary.map((puzzle) => puzzle.id),
        ...secondary.map((puzzle) => puzzle.id)
      ]);
      const mixedCount =
        input.plan.mixedControlCount +
        primaryReason.count - primaryCount +
        secondaryReason.count - secondaryCount;
      const mixed = mixedPool
        .filter((puzzle) => !selectedIds.has(puzzle.id))
        .slice(0, mixedCount);
      if (mixed.length !== mixedCount) {
        continue;
      }
      return {
        plan: {
          ...input.plan,
          reasons: [
            { ...primaryReason, count: primaryCount },
            { ...secondaryReason, count: secondaryCount }
          ],
          mixedControlCount: mixedCount
        },
        quotas: [primary, secondary, mixed]
      };
    }
  }
  return undefined;
}

function uniquePuzzles(puzzles: readonly Puzzle[]): Puzzle[] {
  return [...new Map(puzzles.map((puzzle) => [puzzle.id, puzzle])).values()];
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
