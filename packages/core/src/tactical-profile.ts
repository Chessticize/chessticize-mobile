import type {
  AttemptEvent,
  Puzzle,
  SprintConfig
} from "./types.ts";
import {
  curatedPuzzleThemes,
  namedThemesForSelection
} from "./theme-catalog.ts";

export const TACTICAL_PROFILE_HOME_FOCUS_LIMIT = 1;
export const TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT = 3;
export const FOCUSED_RUN_THEME_LIMIT = 2;
export const TACTICAL_PROFILE_GLICKO_LOGIT_SCALE = 400 / Math.log(10);
export const TACTICAL_PROFILE_PACE_REFERENCE_SECONDS = 20;
export const TACTICAL_PROFILE_SLOW_REFERENCE_SECONDS = 40;

export type TacticalProfileTaskFamily = "line" | "arrow_duel";

export type TacticalFocusReason = "solve_rate" | "completed_speed" | "both";

export type RankedTacticalFocus = {
  theme: string;
  reason: TacticalFocusReason;
};

export type TaskFamilyRankedTacticalFocus = RankedTacticalFocus & {
  taskFamily: TacticalProfileTaskFamily;
};

export type TacticalFocus = {
  theme: string;
  reason: TacticalFocusReason;
};

export type TacticalFocusCutoffs = {
  home: readonly TacticalFocus[];
  profile: readonly TacticalFocus[];
  run: readonly TacticalFocus[];
  monitored: readonly TacticalFocus[];
};

export type FocusedRunRatingAnchor = {
  ratingKey: string;
  rating: number;
};

export type FocusedRunInventoryBand = {
  minRating: number;
  maxRating: number;
  availableByTheme: Readonly<Record<string, number>>;
  mixedAvailableCount: number;
};

export type FocusedRunPlan = {
  taskFamily: TacticalProfileTaskFamily;
  ratingAnchor: FocusedRunRatingAnchor;
  reasons: ReadonlyArray<TacticalFocus & { count: number }>;
  mixedControlCount: number;
  minRating: number;
  maxRating: number;
  excludePuzzleIds: readonly string[];
};

export type FocusedRunPlanUnavailableReason =
  | "no_focus"
  | "invalid_input"
  | "insufficient_inventory";

export type FocusedRunPlanResult =
  | { status: "ready"; plan: FocusedRunPlan }
  | {
      status: "unavailable";
      reason: FocusedRunPlanUnavailableReason;
      shortages: readonly FocusedRunInventoryShortage[];
    };

export type FocusedRunInventoryShortage = {
  bucket: "theme" | "mixed";
  theme?: string;
  required: number;
  available: number;
};

export type TacticalProfileRefreshEvent =
  | "eligible_mixed_run_completed"
  | "focused_run_completed"
  | "scheduled_review_completed"
  | "canonical_import_changed"
  | "unclear_changed";

export type FocusedRunPlanRefreshDecision =
  | "keep_active_run"
  | "rebuild_before_start";

export function applyTacticalFocusCutoffs(
  ranked: readonly RankedTacticalFocus[]
): TacticalFocusCutoffs {
  const distinct = distinctTacticalFocuses(ranked);
  return {
    home: distinct.slice(0, TACTICAL_PROFILE_HOME_FOCUS_LIMIT),
    profile: distinct.slice(0, TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT),
    run: distinct.slice(0, FOCUSED_RUN_THEME_LIMIT),
    monitored: distinct.slice(TACTICAL_PROFILE_VISIBLE_FOCUS_LIMIT)
  };
}

export function applyTacticalFocusCutoffsByTaskFamily(
  ranked: readonly TaskFamilyRankedTacticalFocus[]
): Readonly<Record<TacticalProfileTaskFamily, TacticalFocusCutoffs>> {
  return {
    line: applyTacticalFocusCutoffs(
      ranked
        .filter((focus) => focus.taskFamily === "line")
        .map(({ theme, reason }) => ({ theme, reason }))
    ),
    arrow_duel: applyTacticalFocusCutoffs(
      ranked
        .filter((focus) => focus.taskFamily === "arrow_duel")
        .map(({ theme, reason }) => ({ theme, reason }))
    )
  };
}

export function buildFocusedRunPlan(input: {
  taskFamily: FocusedRunPlan["taskFamily"];
  ratingAnchor: FocusedRunRatingAnchor;
  rankedFocuses: readonly RankedTacticalFocus[];
  runSize: number;
  inventoryBands: readonly FocusedRunInventoryBand[];
  excludePuzzleIds?: readonly string[];
}): FocusedRunPlanResult {
  if (!validRatingAnchor(input.ratingAnchor) || !Number.isInteger(input.runSize) || input.runSize < 1) {
    return unavailable("invalid_input");
  }

  const focuses = applyTacticalFocusCutoffs(input.rankedFocuses).run;
  if (focuses.length === 0) {
    return unavailable("no_focus");
  }

  const allocation = focusedRunAllocation(input.runSize, focuses.length);
  if (allocation === undefined) {
    return unavailable("invalid_input");
  }

  let lastShortages: readonly FocusedRunInventoryShortage[] = [];
  for (const inventory of input.inventoryBands) {
    if (!validInventoryBand(inventory, input.ratingAnchor.rating)) {
      continue;
    }
    const shortages = inventoryShortages(focuses, allocation.themeCounts, allocation.mixedCount, inventory);
    if (shortages.length > 0) {
      lastShortages = shortages;
      continue;
    }
    return {
      status: "ready",
      plan: {
        taskFamily: input.taskFamily,
        ratingAnchor: { ...input.ratingAnchor },
        reasons: focuses.map((focus, index) => ({
          ...focus,
          count: allocation.themeCounts[index] as number
        })),
        mixedControlCount: allocation.mixedCount,
        minRating: inventory.minRating,
        maxRating: inventory.maxRating,
        excludePuzzleIds: uniquePuzzleIds(input.excludePuzzleIds)
      }
    };
  }

  return {
    status: "unavailable",
    reason: "insufficient_inventory",
    shortages: lastShortages
  };
}

export function shouldReevaluateTacticalProfile(event: TacticalProfileRefreshEvent): boolean {
  return event === "eligible_mixed_run_completed" || event === "canonical_import_changed";
}

export function focusedRunPlanRefreshDecision(activeRun: boolean): FocusedRunPlanRefreshDecision {
  return activeRun ? "keep_active_run" : "rebuild_before_start";
}

export function canReofferFocusedRun(input: {
  completedFocusedRun: boolean;
  hasNewEligibleMixedSession: boolean;
}): boolean {
  return !input.completedFocusedRun || input.hasNewEligibleMixedSession;
}

function distinctTacticalFocuses(ranked: readonly RankedTacticalFocus[]): TacticalFocus[] {
  const distinct: TacticalFocus[] = [];
  const indexByTheme = new Map<string, number>();
  for (const candidate of ranked) {
    const theme = candidate.theme.trim();
    if (theme.length === 0) {
      continue;
    }
    const existingIndex = indexByTheme.get(theme);
    if (existingIndex === undefined) {
      indexByTheme.set(theme, distinct.length);
      distinct.push({ theme, reason: candidate.reason });
      continue;
    }
    const existing = distinct[existingIndex] as TacticalFocus;
    if (existing.reason !== candidate.reason) {
      distinct[existingIndex] = { ...existing, reason: "both" };
    }
  }
  return distinct;
}

function focusedRunAllocation(
  runSize: number,
  focusCount: number
): { themeCounts: readonly number[]; mixedCount: number } | undefined {
  const shares = focusCount === 1
    ? [
        { id: "primary", share: 0.7, tiePriority: 1 },
        { id: "mixed", share: 0.3, tiePriority: 2 }
      ]
    : [
        { id: "primary", share: 0.6, tiePriority: 1 },
        { id: "secondary", share: 0.2, tiePriority: 2 },
        { id: "mixed", share: 0.2, tiePriority: 3 }
      ];
  const counts = largestRemainder(runSize, shares);
  const mixedCount = counts.get("mixed") ?? 0;
  const themeCounts = focusCount === 1
    ? [counts.get("primary") ?? 0]
    : [counts.get("primary") ?? 0, counts.get("secondary") ?? 0];
  if (mixedCount < 1 || themeCounts.some((count) => count < 1)) {
    return undefined;
  }
  return { themeCounts, mixedCount };
}

function largestRemainder(
  total: number,
  shares: ReadonlyArray<{ id: string; share: number; tiePriority: number }>
): Map<string, number> {
  const allocations = shares.map((entry) => {
    const exact = total * entry.share;
    return {
      ...entry,
      count: Math.floor(exact),
      remainder: exact - Math.floor(exact)
    };
  });
  let remaining = total - allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  const order = [...allocations].sort((left, right) =>
    right.remainder - left.remainder || right.tiePriority - left.tiePriority
  );
  for (let index = 0; remaining > 0; index = (index + 1) % order.length) {
    (order[index] as typeof order[number]).count += 1;
    remaining -= 1;
  }
  return new Map(allocations.map((allocation) => [allocation.id, allocation.count]));
}

function inventoryShortages(
  focuses: readonly TacticalFocus[],
  themeCounts: readonly number[],
  mixedCount: number,
  inventory: FocusedRunInventoryBand
): FocusedRunInventoryShortage[] {
  const shortages: FocusedRunInventoryShortage[] = [];
  for (const [index, focus] of focuses.entries()) {
    const required = themeCounts[index] as number;
    const available = normalizedAvailability(inventory.availableByTheme[focus.theme]);
    if (available < required) {
      shortages.push({ bucket: "theme", theme: focus.theme, required, available });
    }
  }
  const mixedAvailable = normalizedAvailability(inventory.mixedAvailableCount);
  if (mixedAvailable < mixedCount) {
    shortages.push({
      bucket: "mixed",
      required: mixedCount,
      available: mixedAvailable
    });
  }
  return shortages;
}

function validRatingAnchor(anchor: FocusedRunRatingAnchor): boolean {
  return anchor.ratingKey.trim().length > 0 && Number.isFinite(anchor.rating);
}

function validInventoryBand(inventory: FocusedRunInventoryBand, rating: number): boolean {
  return Number.isFinite(inventory.minRating)
    && Number.isFinite(inventory.maxRating)
    && inventory.minRating <= rating
    && rating <= inventory.maxRating;
}

function normalizedAvailability(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0;
}

function uniquePuzzleIds(ids: readonly string[] | undefined): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0))];
}

function unavailable(reason: FocusedRunPlanUnavailableReason): FocusedRunPlanResult {
  return { status: "unavailable", reason, shortages: [] };
}

export type TacticalProfileCalibrationArtifact = {
  schemaVersion: 1;
  modelVersion: string;
  calibrationId: string;
  packFeatureHash: string;
  createdAt: string;
  recencyHalfLifeDays: number;
  evidence: {
    watchProbability: number;
    recommendationExitProbability: number;
    recommendationProbability: number;
    strongProbability: number;
    minDistinctPuzzles: number;
    minDistinctSessions: number;
  };
  opportunity: {
    minimumWeight: number;
    exponent: number;
  };
  focusedRun?: {
    runSize: number;
    recentPuzzleDays: number;
    ratingBandHalfWidths: readonly number[];
  };
  families: Record<TacticalProfileTaskFamily, TacticalProfileFamilyCalibration>;
};

export type TacticalProfileFamilyCalibration =
  | {
      status: "unavailable";
      reason: string;
    }
  | {
      status: "calibrated";
      solve: {
        intercept: number;
        ratingGapSlope: number;
        timeoutLogCoefficient: number;
        timeoutReferenceSeconds: number;
        themePriorSdRating: number;
        practicalDeficitRating: number;
        minExpectedFailuresPer100: number;
      };
      speed?: {
        interceptLogSeconds: number;
        relativeDifficultyCoefficient: number;
        decisionCountCoefficient: number;
        paceLogCoefficient: number;
        slowPolicyLogCoefficient: number;
        residualSd: number;
        themePriorSdLogSeconds: number;
        practicalTimeMultiplier: number;
      };
    };

export type TacticalProfileAttemptInput = {
  attempt: Pick<
    AttemptEvent,
    | "id"
    | "source"
    | "sessionId"
    | "puzzleId"
    | "mode"
    | "ratingKey"
    | "result"
    | "startedAt"
    | "completedAt"
    | "elapsedMs"
    | "timingStatus"
    | "ratingBefore"
    | "unclear"
    | "unclearUpdatedAt"
  >;
  sessionConfig?: Pick<
    SprintConfig,
    | "mode"
    | "durationSeconds"
    | "perPuzzleSeconds"
    | "puzzleTiming"
    | "targetCorrect"
    | "maxMistakes"
    | "ratingKey"
    | "themes"
    | "tacticalFocus"
  >;
  puzzle: Pick<
    Puzzle,
    "id" | "rating" | "ratingDeviation" | "themes" | "solutionMoves"
  >;
};

export type TacticalProfileAttemptClassification =
  | {
      status: "eligible";
      taskFamily: TacticalProfileTaskFamily;
    }
  | {
      status: "excluded";
      reason:
        | "scheduled_review"
        | "focused_intervention"
        | "unknown_session_config";
    };

export type TacticalProfileDailyCell = {
  modelVersion: string;
  packFeatureHash: string;
  calibrationId: string;
  completedDay: string;
  taskFamily: TacticalProfileTaskFamily;
  theme: string;
  solveScore: number;
  solveInformation: number;
  solveExpectedSuccess: number;
  solveObservedSuccess: number;
  solveSensitivity: number;
  solveWeight: number;
  speedWeightedResidual: number;
  speedPrecision: number;
  speedWeight: number;
  distinctPuzzleIds: readonly string[];
  distinctSessionIds: readonly string[];
};

export type TacticalProfileSignalStatus = "watch" | "recommended";

export type TacticalProfileModelSignal = {
  id: string;
  taskFamily: TacticalProfileTaskFamily;
  theme: string;
  reason: TacticalFocusReason;
  status: TacticalProfileSignalStatus;
  confidence: "developing" | "high" | "very_high";
  distinctPuzzleCount: number;
  distinctSessionCount: number;
  solveConfidence: number;
  speedConfidence: number;
  expectedFailuresPer100: number;
  completedTimeMultiplier: number;
  actionPriority: number;
};

export type TacticalProfileEvaluation = {
  phase: "collecting" | "balanced" | "ready";
  signals: readonly TacticalProfileModelSignal[];
  rankedFocuses: readonly TaskFamilyRankedTacticalFocus[];
  observedThemeCount: number;
};

export type SolveThemeObservation = {
  baselineProbability: number;
  sensitivity: number;
  success: 0 | 1;
  weight: number;
};

export type NormalPosterior = {
  mean: number;
  standardDeviation: number;
};

export function tacticalProfileSolveBaselineFeatures(input: {
  puzzleRating: number;
  puzzleRatingDeviation: number;
  ratingBefore: number;
  timeoutAfterSeconds: number;
  timeoutReferenceSeconds: number;
}): {
  ratingGap: number;
  sensitivity: number;
  timeoutLogRatio: number;
} {
  assertPositiveFinite("puzzle Rating Deviation", input.puzzleRatingDeviation);
  assertPositiveFinite("timeout", input.timeoutAfterSeconds);
  assertPositiveFinite("timeout reference", input.timeoutReferenceSeconds);
  if (!Number.isFinite(input.puzzleRating) || !Number.isFinite(input.ratingBefore)) {
    throw new Error("Tactical Profile Ratings must be finite");
  }
  const sensitivity =
    glickoRatingDeviationAttenuation(input.puzzleRatingDeviation) /
    TACTICAL_PROFILE_GLICKO_LOGIT_SCALE;
  return {
    ratingGap: sensitivity * (input.ratingBefore - input.puzzleRating),
    sensitivity,
    timeoutLogRatio: Math.log(
      input.timeoutAfterSeconds / input.timeoutReferenceSeconds
    )
  };
}

export function tacticalProfileSpeedBaselineFeatures(input: {
  decisionCount: number;
  perPuzzleSeconds: number;
  puzzleRating: number;
  ratingBefore: number;
  slowAfterSeconds?: number | null;
}): {
  decisionCountLog: number;
  paceLogRatio: number;
  relativeDifficulty: number;
  slowPolicyLogRatio: number;
} {
  assertPositiveFinite("decision count", input.decisionCount);
  assertPositiveFinite("Run pace", input.perPuzzleSeconds);
  if (!Number.isFinite(input.puzzleRating) || !Number.isFinite(input.ratingBefore)) {
    throw new Error("Tactical Profile Ratings must be finite");
  }
  const slowAfterSeconds =
    input.slowAfterSeconds ?? input.perPuzzleSeconds * 2;
  assertPositiveFinite("Slow threshold", slowAfterSeconds);
  return {
    relativeDifficulty:
      (input.puzzleRating - input.ratingBefore) /
      TACTICAL_PROFILE_GLICKO_LOGIT_SCALE,
    decisionCountLog: Math.log1p(input.decisionCount),
    paceLogRatio: Math.log(
      input.perPuzzleSeconds / TACTICAL_PROFILE_PACE_REFERENCE_SECONDS
    ),
    slowPolicyLogRatio: Math.log(
      slowAfterSeconds / TACTICAL_PROFILE_SLOW_REFERENCE_SECONDS
    )
  };
}

export function classifyTacticalProfileAttempt(
  input: TacticalProfileAttemptInput
): TacticalProfileAttemptClassification {
  if (input.attempt.source === "scheduled_review") {
    return { status: "excluded", reason: "scheduled_review" };
  }
  if (!input.sessionConfig) {
    return { status: "excluded", reason: "unknown_session_config" };
  }
  if (input.sessionConfig.tacticalFocus !== undefined) {
    return { status: "excluded", reason: "focused_intervention" };
  }
  if (namedThemesForSelection(input.sessionConfig.themes).length > 0) {
    return { status: "excluded", reason: "focused_intervention" };
  }
  return {
    status: "eligible",
    taskFamily: input.sessionConfig.mode === "arrow_duel" ? "arrow_duel" : "line"
  };
}

export function buildTacticalProfileDailyCells(
  inputs: readonly TacticalProfileAttemptInput[],
  calibration: TacticalProfileCalibrationArtifact
): TacticalProfileDailyCell[] {
  assertValidCalibration(calibration);
  const cells = new Map<string, MutableTacticalProfileDailyCell>();

  for (const input of inputs) {
    const classification = classifyTacticalProfileAttempt(input);
    if (classification.status !== "eligible") {
      continue;
    }
    const familyCalibration = calibration.families[classification.taskFamily];
    if (familyCalibration.status !== "calibrated") {
      continue;
    }
    const completedDay = utcCompletedDay(input.attempt.completedAt);
    if (!completedDay) {
      continue;
    }
    const themes = curatedPuzzleThemes(input.puzzle.themes);
    if (themes.length === 0) {
      continue;
    }
    const solveObservation = solveObservationFor(input, familyCalibration);
    const speedObservation = speedObservationFor(
      input,
      classification.taskFamily,
      familyCalibration
    );
    if (!solveObservation && !speedObservation) {
      continue;
    }
    const themeWeight = 1 / themes.length;

    for (const theme of themes) {
      const key = [
        calibration.modelVersion,
        calibration.packFeatureHash,
        calibration.calibrationId,
        completedDay,
        classification.taskFamily,
        theme
      ].join("\u0000");
      const cell = cells.get(key) ?? mutableDailyCell({
        calibration,
        completedDay,
        taskFamily: classification.taskFamily,
        theme
      });
      if (solveObservation) {
        const weight = themeWeight * solveObservation.weight;
        cell.solveScore += weight * solveObservation.sensitivity *
          (solveObservation.success - solveObservation.baselineProbability);
        cell.solveInformation += weight * solveObservation.sensitivity ** 2 *
          solveObservation.baselineProbability *
          (1 - solveObservation.baselineProbability);
        cell.solveExpectedSuccess += weight * solveObservation.baselineProbability;
        cell.solveObservedSuccess += weight * solveObservation.success;
        cell.solveSensitivity += weight * solveObservation.sensitivity;
        cell.solveWeight += weight;
      }
      if (speedObservation) {
        const weight = themeWeight;
        cell.speedWeightedResidual +=
          weight * speedObservation.residual / speedObservation.variance;
        cell.speedPrecision += weight / speedObservation.variance;
        cell.speedWeight += weight;
      }
      cell.distinctPuzzleIds.add(input.puzzle.id);
      cell.distinctSessionIds.add(input.attempt.sessionId);
      cells.set(key, cell);
    }
  }

  return [...cells.values()]
    .map((cell) => freezeDailyCell(cell, calibration))
    .sort(compareDailyCells);
}

export function evaluateTacticalProfile(input: {
  cells: readonly TacticalProfileDailyCell[];
  calibration: TacticalProfileCalibrationArtifact;
  naturalFrequency: Readonly<Record<
    TacticalProfileTaskFamily,
    Readonly<Record<string, number>>
  >>;
  now: string;
  previousRecommendedSignalIds?: readonly string[];
}): TacticalProfileEvaluation {
  assertValidCalibration(input.calibration);
  const nowMs = new Date(input.now).getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error("Tactical Profile evaluation time must be a valid ISO timestamp");
  }
  const aggregates = new Map<string, MutableEvaluationAggregate>();

  for (const cell of input.cells) {
    if (!sameCacheIdentity(cell, input.calibration)) {
      continue;
    }
    const familyCalibration = input.calibration.families[cell.taskFamily];
    if (familyCalibration.status !== "calibrated") {
      continue;
    }
    const decay = recencyWeight(
      cell.completedDay,
      nowMs,
      input.calibration.recencyHalfLifeDays
    );
    const key = `${cell.taskFamily}\u0000${cell.theme}`;
    const aggregate = aggregates.get(key) ?? mutableEvaluationAggregate(
      cell.taskFamily,
      cell.theme
    );
    aggregate.solveScore += decay * cell.solveScore;
    aggregate.solveInformation += decay * cell.solveInformation;
    aggregate.solveExpectedSuccess += decay * cell.solveExpectedSuccess;
    aggregate.solveObservedSuccess += decay * cell.solveObservedSuccess;
    aggregate.solveSensitivity += decay * cell.solveSensitivity;
    aggregate.solveWeight += decay * cell.solveWeight;
    aggregate.speedWeightedResidual += decay * cell.speedWeightedResidual;
    aggregate.speedPrecision += decay * cell.speedPrecision;
    aggregate.speedWeight += decay * cell.speedWeight;
    cell.distinctPuzzleIds.forEach((id) => aggregate.distinctPuzzleIds.add(id));
    cell.distinctSessionIds.forEach((id) => aggregate.distinctSessionIds.add(id));
    aggregates.set(key, aggregate);
  }

  const signals: TacticalProfileModelSignal[] = [];
  const previousRecommendedSignalIds = new Set(input.previousRecommendedSignalIds ?? []);
  for (const aggregate of aggregates.values()) {
    const familyCalibration = input.calibration.families[aggregate.taskFamily];
    if (familyCalibration.status !== "calibrated") {
      continue;
    }
    const solvePosterior = posteriorFromScoreInformation(
      aggregate.solveScore,
      aggregate.solveInformation,
      familyCalibration.solve.themePriorSdRating
    );
    const solveConfidence = normalCdf(
      (-familyCalibration.solve.practicalDeficitRating - solvePosterior.mean) /
      solvePosterior.standardDeviation
    );
    const representativeProbability = aggregate.solveWeight > 0
      ? clampProbability(aggregate.solveExpectedSuccess / aggregate.solveWeight)
      : 0.5;
    const representativeSensitivity = aggregate.solveWeight > 0
      ? aggregate.solveSensitivity / aggregate.solveWeight
      : 0;
    const expectedFailuresPer100 = Math.max(
      0,
      100 * (
        representativeProbability -
        logistic(
          logit(representativeProbability) +
          representativeSensitivity * solvePosterior.mean
        )
      )
    );
    const solveImpactPasses =
      expectedFailuresPer100 >= familyCalibration.solve.minExpectedFailuresPer100;
    const solveRecommended =
      solveConfidence >= input.calibration.evidence.recommendationProbability &&
      solveImpactPasses;

    const speedPosterior = familyCalibration.speed && aggregate.speedPrecision > 0
      ? posteriorFromWeightedNormal(
          aggregate.speedWeightedResidual,
          aggregate.speedPrecision,
          familyCalibration.speed.themePriorSdLogSeconds
        )
      : undefined;
    const speedThreshold = familyCalibration.speed
      ? Math.log(familyCalibration.speed.practicalTimeMultiplier)
      : Number.POSITIVE_INFINITY;
    const speedConfidence = speedPosterior
      ? 1 - normalCdf(
          (speedThreshold - speedPosterior.mean) /
          speedPosterior.standardDeviation
        )
      : 0;
    const completedTimeMultiplier = speedPosterior
      ? Math.exp(speedPosterior.mean)
      : 1;
    const speedRecommended =
      speedConfidence >= input.calibration.evidence.recommendationProbability &&
      completedTimeMultiplier >= (familyCalibration.speed?.practicalTimeMultiplier ?? Infinity);
    const watchConfidence = Math.max(solveConfidence, speedConfidence);
    const signalId = `${aggregate.taskFamily}:${aggregate.theme}`;
    const wasRecommended = previousRecommendedSignalIds.has(signalId);
    const minimumVisibleConfidence = wasRecommended
      ? Math.min(
          input.calibration.evidence.watchProbability,
          input.calibration.evidence.recommendationExitProbability
        )
      : input.calibration.evidence.watchProbability;
    if (watchConfidence < minimumVisibleConfidence) {
      continue;
    }

    const diversityPasses =
      aggregate.distinctPuzzleIds.size >= input.calibration.evidence.minDistinctPuzzles &&
      aggregate.distinctSessionIds.size >= input.calibration.evidence.minDistinctSessions;
    const solveRetained =
      wasRecommended &&
      solveConfidence >= input.calibration.evidence.recommendationExitProbability &&
      solveImpactPasses;
    const speedRetained =
      wasRecommended &&
      speedConfidence >= input.calibration.evidence.recommendationExitProbability &&
      completedTimeMultiplier >= (familyCalibration.speed?.practicalTimeMultiplier ?? Infinity);
    const recommended = diversityPasses &&
      (solveRecommended || speedRecommended || solveRetained || speedRetained);
    const solveWatch =
      solveConfidence >= input.calibration.evidence.watchProbability &&
      solveImpactPasses;
    const speedWatch =
      speedConfidence >= input.calibration.evidence.watchProbability &&
      completedTimeMultiplier > 1;
    const reason: TacticalFocusReason =
      ((solveRecommended || solveRetained) && (speedRecommended || speedRetained)) ||
        (solveWatch && speedWatch)
        ? "both"
        : speedRecommended || speedWatch
          ? "completed_speed"
          : "solve_rate";
    const naturalFrequency =
      normalizedNaturalFrequency(input.naturalFrequency[aggregate.taskFamily]?.[aggregate.theme]);
    const opportunityWeight = Math.max(
      input.calibration.opportunity.minimumWeight,
      naturalFrequency ** input.calibration.opportunity.exponent
    );
    const solveUtility = solveImpactPasses
      ? expectedFailuresPer100 /
        familyCalibration.solve.minExpectedFailuresPer100
      : 0;
    const speedUtility = familyCalibration.speed && completedTimeMultiplier > 1
      ? (completedTimeMultiplier - 1) /
        (familyCalibration.speed.practicalTimeMultiplier - 1)
      : 0;
    const strongestConfidence = Math.max(solveConfidence, speedConfidence);
    signals.push({
      id: signalId,
      taskFamily: aggregate.taskFamily,
      theme: aggregate.theme,
      reason,
      status: recommended ? "recommended" : "watch",
      confidence:
        strongestConfidence >= input.calibration.evidence.strongProbability
          ? "very_high"
          : strongestConfidence >= input.calibration.evidence.recommendationProbability
            ? "high"
            : "developing",
      distinctPuzzleCount: aggregate.distinctPuzzleIds.size,
      distinctSessionCount: aggregate.distinctSessionIds.size,
      solveConfidence,
      speedConfidence,
      expectedFailuresPer100,
      completedTimeMultiplier,
      actionPriority: Math.max(solveUtility, speedUtility) * opportunityWeight
    });
  }

  signals.sort((left, right) =>
    Number(right.status === "recommended") - Number(left.status === "recommended") ||
    right.actionPriority - left.actionPriority ||
    left.taskFamily.localeCompare(right.taskFamily) ||
    left.theme.localeCompare(right.theme)
  );
  const rankedFocuses = signals
    .filter((signal) => signal.status === "recommended")
    .map((signal): TaskFamilyRankedTacticalFocus => ({
      taskFamily: signal.taskFamily,
      theme: signal.theme,
      reason: signal.reason
    }));
  const hasDiverseEvidence = [...aggregates.values()].some((aggregate) =>
    aggregate.distinctPuzzleIds.size >=
      input.calibration.evidence.minDistinctPuzzles &&
    aggregate.distinctSessionIds.size >=
      input.calibration.evidence.minDistinctSessions
  );
  return {
    phase: rankedFocuses.length > 0
      ? "ready"
      : signals.length > 0 || !hasDiverseEvidence
        ? "collecting"
        : "balanced",
    signals,
    rankedFocuses,
    observedThemeCount: aggregates.size
  };
}

export function approximateSolveThemePosterior(
  observations: readonly SolveThemeObservation[],
  priorSd: number
): NormalPosterior {
  assertPositiveFinite("solve prior standard deviation", priorSd);
  let score = 0;
  let information = 0;
  for (const observation of observations) {
    if (!validSolveObservation(observation)) {
      throw new Error("Solve posterior observation is invalid");
    }
    score += observation.weight * observation.sensitivity *
      (observation.success - observation.baselineProbability);
    information += observation.weight * observation.sensitivity ** 2 *
      observation.baselineProbability * (1 - observation.baselineProbability);
  }
  return posteriorFromScoreInformation(score, information, priorSd);
}

export function exactSolveThemePosterior(
  observations: readonly SolveThemeObservation[],
  priorSd: number
): NormalPosterior {
  assertPositiveFinite("solve prior standard deviation", priorSd);
  observations.forEach((observation) => {
    if (!validSolveObservation(observation)) {
      throw new Error("Solve posterior observation is invalid");
    }
  });
  let mean = 0;
  const priorPrecision = 1 / priorSd ** 2;
  let curvature = priorPrecision;

  for (let iteration = 0; iteration < 50; iteration += 1) {
    let gradient = -mean * priorPrecision;
    curvature = priorPrecision;
    for (const observation of observations) {
      const probability = logistic(
        logit(observation.baselineProbability) +
        observation.sensitivity * mean
      );
      gradient += observation.weight * observation.sensitivity *
        (observation.success - probability);
      curvature += observation.weight * observation.sensitivity ** 2 *
        probability * (1 - probability);
    }
    const step = gradient / curvature;
    mean += step;
    if (Math.abs(step) < 1e-9) {
      break;
    }
  }
  return {
    mean,
    standardDeviation: Math.sqrt(1 / curvature)
  };
}

type MutableTacticalProfileDailyCell = Omit<
  TacticalProfileDailyCell,
  "distinctPuzzleIds" | "distinctSessionIds"
> & {
  distinctPuzzleIds: Set<string>;
  distinctSessionIds: Set<string>;
};

type MutableEvaluationAggregate = {
  taskFamily: TacticalProfileTaskFamily;
  theme: string;
  solveScore: number;
  solveInformation: number;
  solveExpectedSuccess: number;
  solveObservedSuccess: number;
  solveSensitivity: number;
  solveWeight: number;
  speedWeightedResidual: number;
  speedPrecision: number;
  speedWeight: number;
  distinctPuzzleIds: Set<string>;
  distinctSessionIds: Set<string>;
};

function mutableDailyCell(input: {
  calibration: TacticalProfileCalibrationArtifact;
  completedDay: string;
  taskFamily: TacticalProfileTaskFamily;
  theme: string;
}): MutableTacticalProfileDailyCell {
  return {
    modelVersion: input.calibration.modelVersion,
    packFeatureHash: input.calibration.packFeatureHash,
    calibrationId: input.calibration.calibrationId,
    completedDay: input.completedDay,
    taskFamily: input.taskFamily,
    theme: input.theme,
    solveScore: 0,
    solveInformation: 0,
    solveExpectedSuccess: 0,
    solveObservedSuccess: 0,
    solveSensitivity: 0,
    solveWeight: 0,
    speedWeightedResidual: 0,
    speedPrecision: 0,
    speedWeight: 0,
    distinctPuzzleIds: new Set<string>(),
    distinctSessionIds: new Set<string>()
  };
}

function freezeDailyCell(
  cell: MutableTacticalProfileDailyCell,
  calibration: TacticalProfileCalibrationArtifact
): TacticalProfileDailyCell {
  return {
    ...cell,
    distinctPuzzleIds: [...cell.distinctPuzzleIds]
      .sort()
      .slice(0, calibration.evidence.minDistinctPuzzles),
    distinctSessionIds: [...cell.distinctSessionIds]
      .sort()
      .slice(0, calibration.evidence.minDistinctSessions)
  };
}

function compareDailyCells(
  left: TacticalProfileDailyCell,
  right: TacticalProfileDailyCell
): number {
  return left.completedDay.localeCompare(right.completedDay) ||
    left.taskFamily.localeCompare(right.taskFamily) ||
    left.theme.localeCompare(right.theme);
}

function mutableEvaluationAggregate(
  taskFamily: TacticalProfileTaskFamily,
  theme: string
): MutableEvaluationAggregate {
  return {
    taskFamily,
    theme,
    solveScore: 0,
    solveInformation: 0,
    solveExpectedSuccess: 0,
    solveObservedSuccess: 0,
    solveSensitivity: 0,
    solveWeight: 0,
    speedWeightedResidual: 0,
    speedPrecision: 0,
    speedWeight: 0,
    distinctPuzzleIds: new Set<string>(),
    distinctSessionIds: new Set<string>()
  };
}

function solveObservationFor(
  input: TacticalProfileAttemptInput,
  calibration: Extract<TacticalProfileFamilyCalibration, { status: "calibrated" }>
): SolveThemeObservation | undefined {
  const ratingDeviation = input.puzzle.ratingDeviation;
  const timeoutAfterSeconds = input.sessionConfig?.puzzleTiming?.timeoutAfterSeconds;
  if (
    !Number.isFinite(input.attempt.ratingBefore) ||
    !Number.isFinite(input.puzzle.rating) ||
    !Number.isFinite(ratingDeviation) ||
    (ratingDeviation as number) <= 0 ||
    timeoutAfterSeconds === null ||
    !Number.isFinite(timeoutAfterSeconds) ||
    (timeoutAfterSeconds as number) <= 0
  ) {
    return undefined;
  }
  const features = tacticalProfileSolveBaselineFeatures({
    puzzleRating: input.puzzle.rating,
    puzzleRatingDeviation: ratingDeviation as number,
    ratingBefore: input.attempt.ratingBefore,
    timeoutAfterSeconds: timeoutAfterSeconds as number,
    timeoutReferenceSeconds: calibration.solve.timeoutReferenceSeconds
  });
  const eta =
    calibration.solve.intercept +
    calibration.solve.ratingGapSlope * features.ratingGap +
    calibration.solve.timeoutLogCoefficient *
      features.timeoutLogRatio;
  return {
    baselineProbability: logistic(eta),
    sensitivity: features.sensitivity,
    success: input.attempt.result === "correct" ? 1 : 0,
    weight: 1
  };
}

function speedObservationFor(
  input: TacticalProfileAttemptInput,
  taskFamily: TacticalProfileTaskFamily,
  calibration: Extract<TacticalProfileFamilyCalibration, { status: "calibrated" }>
): { residual: number; variance: number } | undefined {
  const speed = calibration.speed;
  const elapsedMs = input.attempt.elapsedMs;
  const sessionConfig = input.sessionConfig;
  const puzzleTiming = sessionConfig?.puzzleTiming;
  if (
    !speed ||
    input.attempt.result !== "correct" ||
    !Number.isFinite(elapsedMs) ||
    (elapsedMs as number) <= 0 ||
    !puzzleTiming ||
    puzzleTiming.timeoutAfterSeconds === null ||
    !Number.isFinite(puzzleTiming.timeoutAfterSeconds) ||
    !Number.isFinite(sessionConfig.perPuzzleSeconds) ||
    sessionConfig.perPuzzleSeconds <= 0
  ) {
    return undefined;
  }
  const decisionCount = taskFamily === "arrow_duel"
    ? 1
    : Math.max(1, Math.ceil(input.puzzle.solutionMoves.length / 2));
  const features = tacticalProfileSpeedBaselineFeatures({
    decisionCount,
    perPuzzleSeconds: sessionConfig.perPuzzleSeconds,
    puzzleRating: input.puzzle.rating,
    ratingBefore: input.attempt.ratingBefore,
    slowAfterSeconds: puzzleTiming.slowAfterSeconds
  });
  const predictedLogElapsed =
    speed.interceptLogSeconds +
    speed.relativeDifficultyCoefficient * features.relativeDifficulty +
    speed.decisionCountCoefficient * features.decisionCountLog +
    speed.paceLogCoefficient * features.paceLogRatio +
    speed.slowPolicyLogCoefficient * features.slowPolicyLogRatio;
  return {
    residual: Math.log((elapsedMs as number) / 1000) - predictedLogElapsed,
    variance: speed.residualSd ** 2
  };
}

function glickoRatingDeviationAttenuation(ratingDeviation: number): number {
  const q = Math.log(10) / 400;
  return 1 / Math.sqrt(1 + 3 * q ** 2 * ratingDeviation ** 2 / Math.PI ** 2);
}

function posteriorFromScoreInformation(
  score: number,
  information: number,
  priorSd: number
): NormalPosterior {
  const precision = information + 1 / priorSd ** 2;
  return {
    mean: score / precision,
    standardDeviation: Math.sqrt(1 / precision)
  };
}

function posteriorFromWeightedNormal(
  weightedResidual: number,
  likelihoodPrecision: number,
  priorSd: number
): NormalPosterior {
  const precision = likelihoodPrecision + 1 / priorSd ** 2;
  return {
    mean: weightedResidual / precision,
    standardDeviation: Math.sqrt(1 / precision)
  };
}

function utcCompletedDay(completedAt: string): string | undefined {
  const timestamp = new Date(completedAt);
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toISOString().slice(0, 10)
    : undefined;
}

function recencyWeight(
  completedDay: string,
  nowMs: number,
  halfLifeDays: number
): number {
  const dayMs = new Date(`${completedDay}T12:00:00.000Z`).getTime();
  const ageDays = Math.max(0, (nowMs - dayMs) / (24 * 60 * 60 * 1000));
  return 2 ** (-ageDays / halfLifeDays);
}

function sameCacheIdentity(
  cell: TacticalProfileDailyCell,
  calibration: TacticalProfileCalibrationArtifact
): boolean {
  return cell.modelVersion === calibration.modelVersion &&
    cell.packFeatureHash === calibration.packFeatureHash &&
    cell.calibrationId === calibration.calibrationId;
}

function normalizedNaturalFrequency(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value as number))
    : 0;
}

function validSolveObservation(observation: SolveThemeObservation): boolean {
  return Number.isFinite(observation.baselineProbability) &&
    observation.baselineProbability > 0 &&
    observation.baselineProbability < 1 &&
    Number.isFinite(observation.sensitivity) &&
    observation.sensitivity > 0 &&
    (observation.success === 0 || observation.success === 1) &&
    Number.isFinite(observation.weight) &&
    observation.weight > 0;
}

function assertValidCalibration(calibration: TacticalProfileCalibrationArtifact): void {
  if (
    calibration.schemaVersion !== 1 ||
    calibration.modelVersion.trim().length === 0 ||
    calibration.calibrationId.trim().length === 0 ||
    calibration.packFeatureHash.trim().length === 0
  ) {
    throw new Error("Tactical Profile calibration identity is invalid");
  }
  assertProbability(
    "watch probability",
    calibration.evidence.watchProbability
  );
  assertProbability(
    "recommendation exit probability",
    calibration.evidence.recommendationExitProbability
  );
  assertProbability(
    "recommendation probability",
    calibration.evidence.recommendationProbability
  );
  assertProbability(
    "strong probability",
    calibration.evidence.strongProbability
  );
  if (
    calibration.evidence.watchProbability >
      calibration.evidence.recommendationExitProbability ||
    calibration.evidence.recommendationExitProbability >
      calibration.evidence.recommendationProbability ||
    calibration.evidence.recommendationProbability >
      calibration.evidence.strongProbability
  ) {
    throw new Error("Tactical Profile evidence probabilities must be ordered");
  }
  assertPositiveFinite("recency half-life", calibration.recencyHalfLifeDays);
  assertPositiveFinite(
    "minimum opportunity weight",
    calibration.opportunity.minimumWeight
  );
  assertPositiveFinite("opportunity exponent", calibration.opportunity.exponent);
  if (calibration.focusedRun) {
    if (
      !Number.isInteger(calibration.focusedRun.runSize) ||
      calibration.focusedRun.runSize < 1 ||
      !Number.isInteger(calibration.focusedRun.recentPuzzleDays) ||
      calibration.focusedRun.recentPuzzleDays < 0 ||
      calibration.focusedRun.ratingBandHalfWidths.length < 1 ||
      calibration.focusedRun.ratingBandHalfWidths.some(
        (halfWidth) => !Number.isInteger(halfWidth) || halfWidth < 1
      ) ||
      calibration.focusedRun.ratingBandHalfWidths.some(
        (halfWidth, index, widths) => index > 0 && halfWidth <= (widths[index - 1] as number)
      )
    ) {
      throw new Error("Tactical Profile Focused Run policy is invalid");
    }
  }
  for (const family of Object.values(calibration.families)) {
    if (family.status !== "calibrated") {
      continue;
    }
    assertPositiveFinite(
      "solve prior standard deviation",
      family.solve.themePriorSdRating
    );
    assertPositiveFinite(
      "solve timeout reference",
      family.solve.timeoutReferenceSeconds
    );
    assertPositiveFinite(
      "solve practical deficit",
      family.solve.practicalDeficitRating
    );
    assertPositiveFinite(
      "solve practical impact",
      family.solve.minExpectedFailuresPer100
    );
    if (family.speed) {
      assertPositiveFinite("speed residual deviation", family.speed.residualSd);
      assertPositiveFinite(
        "speed prior standard deviation",
        family.speed.themePriorSdLogSeconds
      );
      if (family.speed.practicalTimeMultiplier <= 1) {
        throw new Error("Speed practical multiplier must exceed one");
      }
    }
  }
}

function assertProbability(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error(`${label} must be between zero and one`);
  }
}

function assertPositiveFinite(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
}

function logistic(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function logit(probability: number): number {
  const clamped = clampProbability(probability);
  return Math.log(clamped / (1 - clamped));
}

function clampProbability(value: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, value));
}

function normalCdf(value: number): number {
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = 0.3989422804014327 * Math.exp(-absolute * absolute / 2);
  const polynomial = t * (
    0.319381530 +
    t * (
      -0.356563782 +
      t * (
        1.781477937 +
        t * (-1.821255978 + t * 1.330274429)
      )
    )
  );
  const positiveCdf = 1 - density * polynomial;
  return value >= 0 ? positiveCdf : 1 - positiveCdf;
}
