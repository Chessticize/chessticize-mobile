/**
 * Pure-TypeScript in-game weakness diagnosis aggregating analyzed games,
 * extracted personal puzzles, and optional ply evaluations into compact,
 * actionable insights without cluttering small samples.
 *
 * Clock timing buckets and weakness concepts aligned with
 * Chessticize/chessticize-server#629.
 */

import type { GamePuzzleMomentKind, OwnMomentKind } from "../game-puzzles/types.ts";
import { SERVER_CURATED_THEMES, curatedPuzzleThemes } from "../theme-catalog.ts";
import type { MoveClassification } from "./evaluator.ts";
import {
  classifyClockBucket,
  type ClockBucket,
  type GameTimeClass
} from "./pgn-parser.ts";

export const MIN_GAMES_FOR_DIAGNOSIS = 3;
export const MAX_DIAGNOSIS_BLINDSPOTS = 5;

export const DIAGNOSIS_TIME_CLASSES = [
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "daily"
] as const;

export type DiagnosisTimeClass = (typeof DIAGNOSIS_TIME_CLASSES)[number];

export type DiagnosisGameAnalysisStatus = "none" | "partial" | "pass1_done" | "complete";

export interface DiagnosisAnalyzedGameInput {
  id: string;
  timeClass?: GameTimeClass | string;
  userColor: "w" | "b";
  whiteAccuracy?: number;
  blackAccuracy?: number;
  analysisStatus: DiagnosisGameAnalysisStatus;
}

export interface DiagnosisUserPuzzleInput {
  gameId: string;
  gamePly?: number;
  momentKind: GamePuzzleMomentKind;
  puzzleKind: "line" | "arrow_duel";
  themes: readonly string[];
  timeClass?: GameTimeClass | string;
  clockRemainingSec?: number;
  timeSpentSec?: number;
  caliberScore?: number;
  archived?: boolean;
}

export interface DiagnosisPlyEvalInput {
  gameId: string;
  ply: number;
  color: "w" | "b";
  classification: MoveClassification;
  clockBucket?: ClockBucket;
  clockRemainingSec?: number;
  timeSpentSec?: number;
}

export interface InGameWeaknessDiagnosisInput {
  games: readonly DiagnosisAnalyzedGameInput[];
  puzzles: readonly DiagnosisUserPuzzleInput[];
  plyEvaluations?: readonly DiagnosisPlyEvalInput[];
  minGames?: number;
}

export interface TimeClassDiagnosisSummary {
  timeClass: DiagnosisTimeClass;
  gameCount: number;
  averageAccuracy?: number;
  ownMistakeCount: number;
  missedOpportunityCount: number;
  ownMistakesPerGame: number;
  missedOpportunitiesPerGame: number;
}

export interface ClockTimingBucketStat {
  bucket: ClockBucket;
  count: number;
  share: number;
  knownShare: number;
}

export interface ClockTimingBreakdown {
  totalOwnMistakes: number;
  knownClockOwnMistakes: number;
  counts: Record<ClockBucket, number>;
  shares: Record<ClockBucket, number>;
  knownShares: Record<Exclude<ClockBucket, "unknown">, number>;
  buckets: ClockTimingBucketStat[];
  source: "ply_evaluations" | "puzzles" | "mixed" | "none";
}

export type BlindspotConfidence = "emerging" | "established";

export interface InGameBlindspot {
  theme: string;
  totalCount: number;
  ownMistakeCount: number;
  missedOpportunityCount: number;
  gameCount: number;
  rawRate: number;
  smoothedRate: number;
  priorityScore: number;
  confidence: BlindspotConfidence;
  averageCaliberScore?: number;
}

export interface OwnMistakeSplit {
  own_mistake_punished: number;
  own_mistake_escaped: number;
  own_blunder_punished: number;
  own_blunder_escaped: number;
  totalOwnMistakes: number;
  totalPunished: number;
  totalEscaped: number;
  /** Fraction in [0, 1] of own mistakes/blunders that the opponent failed to punish. */
  escapedRatio: number;
  /** Percentage in [0, 100] (rounded to 1 decimal) of own mistakes/blunders that escaped punishment. */
  escapedPercent: number;
}

export type DiagnosisHeadlineKind =
  | "time_trouble"
  | "impulsive"
  | "tactical_blindspot"
  | "escaped_blunders"
  | "balanced"
  | "insufficient_data";

export interface DiagnosisHeadlineStats {
  analyzedGameCount: number;
  minGamesRequired: number;
  gamesRemaining: number;
  overallAccuracy?: number;
  dominantClockBucket?: Exclude<ClockBucket, "unknown">;
  dominantClockCount?: number;
  dominantClockKnownTotal?: number;
  dominantClockShare?: number;
  primaryBlindspotTheme?: string;
  primaryBlindspotCount?: number;
  primaryBlindspotGames?: number;
  primaryBlindspotConfidence?: BlindspotConfidence;
  escapedCount?: number;
  totalOwnMistakes?: number;
  escapedRatio?: number;
  escapedPercent?: number;
}

export interface InGameWeaknessDiagnosis {
  sufficientData: boolean;
  minGamesRequired: number;
  analyzedGameCount: number;
  totalPuzzlesAnalyzed: number;
  overallAccuracy?: number;
  timeClassSummaries: TimeClassDiagnosisSummary[];
  clockTimingBreakdown: ClockTimingBreakdown;
  topBlindspots: InGameBlindspot[];
  ownMistakeSplit: OwnMistakeSplit;
  headlineKind: DiagnosisHeadlineKind;
  headlineStats: DiagnosisHeadlineStats;
}

const OWN_MOMENT_KINDS = new Set<GamePuzzleMomentKind>([
  "own_mistake_punished",
  "own_mistake_escaped",
  "own_blunder_punished",
  "own_blunder_escaped"
]);

const OPPONENT_MISSED_MOMENT_KINDS = new Set<GamePuzzleMomentKind>([
  "opponent_mistake_missed",
  "opponent_blunder_missed"
]);

const OWN_PLY_ERROR_CLASSIFICATIONS = new Set<MoveClassification>([
  "mistake",
  "blunder",
  "missed_win"
]);

const CLOCK_BUCKETS: readonly ClockBucket[] = [
  "time_trouble",
  "impulsive",
  "deliberate",
  "unknown"
];

const CURATED_THEME_ORDER = new Map<string, number>(
  SERVER_CURATED_THEMES.map((theme, index) => [theme, index])
);

const BAYESIAN_PRIOR_STRENGTH = 4;
const BAYESIAN_PRIOR_RATE = 1 / Math.max(1, SERVER_CURATED_THEMES.length);
const CALIBER_PRIOR_WEIGHT = 3;
const CALIBER_PRIOR_MEAN = 75;
const SINGLE_SAMPLE_DAMPENER = 0.65;
const ESTABLISHED_MIN_COUNT = 3;
const ESTABLISHED_MIN_GAMES = 2;

const CLOCK_HEADLINE_MIN_KNOWN = 3;
const CLOCK_HEADLINE_MIN_SHARE = 0.4;
const ESCAPED_HEADLINE_MIN_OWN = 3;
const ESCAPED_HEADLINE_MIN_RATIO = 0.5;

/**
 * Compute a structured, local-only weakness diagnosis from analyzed games,
 * extracted user puzzles, and optional ply evaluations.
 */
export function diagnoseInGameWeaknesses(
  input: InGameWeaknessDiagnosisInput
): InGameWeaknessDiagnosis {
  const minGamesRequired =
    input.minGames !== undefined && Number.isInteger(input.minGames) && input.minGames >= 1
      ? input.minGames
      : MIN_GAMES_FOR_DIAGNOSIS;

  const analyzedGames: DiagnosisAnalyzedGameInput[] = [];
  const analyzedGameById = new Map<string, DiagnosisAnalyzedGameInput>();
  for (const game of input.games) {
    if (game.analysisStatus !== "pass1_done" && game.analysisStatus !== "complete") {
      continue;
    }
    if (analyzedGameById.has(game.id)) {
      continue;
    }
    analyzedGames.push(game);
    analyzedGameById.set(game.id, game);
  }

  const analyzedGameCount = analyzedGames.length;
  const sufficientData = analyzedGameCount >= minGamesRequired;

  const eligiblePuzzles = input.puzzles.filter((puzzle) => {
    if (puzzle.archived) {
      return false;
    }
    if (!analyzedGameById.has(puzzle.gameId)) {
      return false;
    }
    return (
      OWN_MOMENT_KINDS.has(puzzle.momentKind) ||
      OPPONENT_MISSED_MOMENT_KINDS.has(puzzle.momentKind)
    );
  });

  const overallAccuracy = computeOverallAccuracy(analyzedGames);
  const timeClassSummaries = computeTimeClassSummaries(
    analyzedGames,
    eligiblePuzzles,
    analyzedGameById
  );
  const clockTimingBreakdown = computeClockTimingBreakdown(
    analyzedGameById,
    eligiblePuzzles,
    input.plyEvaluations
  );
  const ownMistakeSplit = computeOwnMistakeSplit(eligiblePuzzles);
  const topBlindspots = sufficientData
    ? computeTopBlindspots(eligiblePuzzles)
    : [];

  const { headlineKind, headlineStats } = selectHeadline({
    sufficientData,
    analyzedGameCount,
    minGamesRequired,
    ...(overallAccuracy !== undefined ? { overallAccuracy } : {}),
    clockTimingBreakdown,
    topBlindspots,
    ownMistakeSplit
  });

  return {
    sufficientData,
    minGamesRequired,
    analyzedGameCount,
    totalPuzzlesAnalyzed: eligiblePuzzles.length,
    ...(overallAccuracy !== undefined ? { overallAccuracy } : {}),
    timeClassSummaries,
    clockTimingBreakdown,
    topBlindspots,
    ownMistakeSplit,
    headlineKind,
    headlineStats
  };
}

function normalizeDiagnosisTimeClass(value?: string): DiagnosisTimeClass | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return (DIAGNOSIS_TIME_CLASSES as readonly string[]).includes(normalized)
    ? (normalized as DiagnosisTimeClass)
    : undefined;
}

function gameUserAccuracy(game: DiagnosisAnalyzedGameInput): number | undefined {
  const accuracy = game.userColor === "w" ? game.whiteAccuracy : game.blackAccuracy;
  if (accuracy === undefined || !Number.isFinite(accuracy)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, accuracy));
}

function computeOverallAccuracy(
  games: readonly DiagnosisAnalyzedGameInput[]
): number | undefined {
  let sum = 0;
  let count = 0;
  for (const game of games) {
    const accuracy = gameUserAccuracy(game);
    if (accuracy !== undefined) {
      sum += accuracy;
      count += 1;
    }
  }
  return count > 0 ? roundTo(sum / count, 1) : undefined;
}

function computeTimeClassSummaries(
  analyzedGames: readonly DiagnosisAnalyzedGameInput[],
  puzzles: readonly DiagnosisUserPuzzleInput[],
  analyzedGameById: ReadonlyMap<string, DiagnosisAnalyzedGameInput>
): TimeClassDiagnosisSummary[] {
  const accByClass = new Map<
    DiagnosisTimeClass,
    {
      gameCount: number;
      accuracySum: number;
      accuracyCount: number;
      ownMistakeCount: number;
      missedOpportunityCount: number;
    }
  >();

  for (const game of analyzedGames) {
    const timeClass = normalizeDiagnosisTimeClass(game.timeClass);
    if (!timeClass) {
      continue;
    }
    let entry = accByClass.get(timeClass);
    if (!entry) {
      entry = {
        gameCount: 0,
        accuracySum: 0,
        accuracyCount: 0,
        ownMistakeCount: 0,
        missedOpportunityCount: 0
      };
      accByClass.set(timeClass, entry);
    }
    entry.gameCount += 1;
    const accuracy = gameUserAccuracy(game);
    if (accuracy !== undefined) {
      entry.accuracySum += accuracy;
      entry.accuracyCount += 1;
    }
  }

  for (const puzzle of puzzles) {
    const game = analyzedGameById.get(puzzle.gameId);
    const timeClass = normalizeDiagnosisTimeClass(puzzle.timeClass ?? game?.timeClass);
    if (!timeClass) {
      continue;
    }
    const entry = accByClass.get(timeClass);
    if (!entry) {
      continue;
    }
    if (OWN_MOMENT_KINDS.has(puzzle.momentKind)) {
      entry.ownMistakeCount += 1;
    } else if (OPPONENT_MISSED_MOMENT_KINDS.has(puzzle.momentKind)) {
      entry.missedOpportunityCount += 1;
    }
  }

  const summaries: TimeClassDiagnosisSummary[] = [];
  for (const timeClass of DIAGNOSIS_TIME_CLASSES) {
    const entry = accByClass.get(timeClass);
    if (!entry || entry.gameCount === 0) {
      continue;
    }
    const averageAccuracy =
      entry.accuracyCount > 0 ? roundTo(entry.accuracySum / entry.accuracyCount, 1) : undefined;
    summaries.push({
      timeClass,
      gameCount: entry.gameCount,
      ...(averageAccuracy !== undefined ? { averageAccuracy } : {}),
      ownMistakeCount: entry.ownMistakeCount,
      missedOpportunityCount: entry.missedOpportunityCount,
      ownMistakesPerGame: roundTo(entry.ownMistakeCount / entry.gameCount, 2),
      missedOpportunitiesPerGame: roundTo(entry.missedOpportunityCount / entry.gameCount, 2)
    });
  }

  return summaries;
}

function computeClockTimingBreakdown(
  analyzedGameById: ReadonlyMap<string, DiagnosisAnalyzedGameInput>,
  puzzles: readonly DiagnosisUserPuzzleInput[],
  plyEvaluations?: readonly DiagnosisPlyEvalInput[]
): ClockTimingBreakdown {
  const counts: Record<ClockBucket, number> = {
    time_trouble: 0,
    impulsive: 0,
    deliberate: 0,
    unknown: 0
  };

  const gamesWithPlyEvals = new Set<string>();
  let usedPlyEvals = false;
  let usedPuzzles = false;

  if (plyEvaluations && plyEvaluations.length > 0) {
    for (const ply of plyEvaluations) {
      const game = analyzedGameById.get(ply.gameId);
      if (!game) {
        continue;
      }
      gamesWithPlyEvals.add(game.id);
      if (ply.color !== game.userColor) {
        continue;
      }
      if (!OWN_PLY_ERROR_CLASSIFICATIONS.has(ply.classification)) {
        continue;
      }
      const timeClass = normalizeDiagnosisTimeClass(game.timeClass) ?? "unknown";
      const bucket =
        ply.clockBucket !== undefined
          ? ply.clockBucket
          : classifyClockBucket({
              ...(ply.clockRemainingSec !== undefined
                ? { clockRemainingSec: ply.clockRemainingSec }
                : {}),
              ...(ply.timeSpentSec !== undefined ? { timeSpentSec: ply.timeSpentSec } : {}),
              timeClass
            });
      counts[bucket] += 1;
      usedPlyEvals = true;
    }
  }

  for (const puzzle of puzzles) {
    if (!OWN_MOMENT_KINDS.has(puzzle.momentKind)) {
      continue;
    }
    if (gamesWithPlyEvals.has(puzzle.gameId)) {
      continue;
    }
    const game = analyzedGameById.get(puzzle.gameId);
    const timeClass =
      normalizeDiagnosisTimeClass(puzzle.timeClass ?? game?.timeClass) ?? "unknown";
    const bucket = classifyClockBucket({
      ...(puzzle.clockRemainingSec !== undefined
        ? { clockRemainingSec: puzzle.clockRemainingSec }
        : {}),
      ...(puzzle.timeSpentSec !== undefined ? { timeSpentSec: puzzle.timeSpentSec } : {}),
      timeClass
    });
    counts[bucket] += 1;
    usedPuzzles = true;
  }

  const totalOwnMistakes =
    counts.time_trouble + counts.impulsive + counts.deliberate + counts.unknown;
  const knownClockOwnMistakes = counts.time_trouble + counts.impulsive + counts.deliberate;

  const shares: Record<ClockBucket, number> = {
    time_trouble: ratio(counts.time_trouble, totalOwnMistakes),
    impulsive: ratio(counts.impulsive, totalOwnMistakes),
    deliberate: ratio(counts.deliberate, totalOwnMistakes),
    unknown: ratio(counts.unknown, totalOwnMistakes)
  };

  const knownShares: Record<Exclude<ClockBucket, "unknown">, number> = {
    time_trouble: ratio(counts.time_trouble, knownClockOwnMistakes),
    impulsive: ratio(counts.impulsive, knownClockOwnMistakes),
    deliberate: ratio(counts.deliberate, knownClockOwnMistakes)
  };

  const buckets: ClockTimingBucketStat[] = CLOCK_BUCKETS.map((bucket) => ({
    bucket,
    count: counts[bucket],
    share: shares[bucket],
    knownShare: bucket === "unknown" ? 0 : knownShares[bucket]
  }));

  const source: ClockTimingBreakdown["source"] =
    usedPlyEvals && usedPuzzles
      ? "mixed"
      : usedPlyEvals
        ? "ply_evaluations"
        : usedPuzzles
          ? "puzzles"
          : "none";

  return {
    totalOwnMistakes,
    knownClockOwnMistakes,
    counts,
    shares,
    knownShares,
    buckets,
    source
  };
}

function computeOwnMistakeSplit(
  puzzles: readonly DiagnosisUserPuzzleInput[]
): OwnMistakeSplit {
  const counts: Record<OwnMomentKind, number> = {
    own_mistake_punished: 0,
    own_mistake_escaped: 0,
    own_blunder_punished: 0,
    own_blunder_escaped: 0
  };

  for (const puzzle of puzzles) {
    if (OWN_MOMENT_KINDS.has(puzzle.momentKind)) {
      counts[puzzle.momentKind as OwnMomentKind] += 1;
    }
  }

  const totalPunished = counts.own_mistake_punished + counts.own_blunder_punished;
  const totalEscaped = counts.own_mistake_escaped + counts.own_blunder_escaped;
  const totalOwnMistakes = totalPunished + totalEscaped;
  const escapedRatio = ratio(totalEscaped, totalOwnMistakes);
  const escapedPercent = totalOwnMistakes > 0 ? roundTo((totalEscaped / totalOwnMistakes) * 100, 1) : 0;

  return {
    ...counts,
    totalOwnMistakes,
    totalPunished,
    totalEscaped,
    escapedRatio,
    escapedPercent
  };
}

function computeTopBlindspots(
  puzzles: readonly DiagnosisUserPuzzleInput[]
): InGameBlindspot[] {
  const totalActionablePuzzles = puzzles.length;
  if (totalActionablePuzzles === 0) {
    return [];
  }

  const statsByTheme = new Map<
    string,
    {
      ownMistakeCount: number;
      missedOpportunityCount: number;
      gameIds: Set<string>;
      caliberSum: number;
      caliberCount: number;
    }
  >();

  for (const puzzle of puzzles) {
    const isOwn = OWN_MOMENT_KINDS.has(puzzle.momentKind);
    const isMissed = OPPONENT_MISSED_MOMENT_KINDS.has(puzzle.momentKind);
    if (!isOwn && !isMissed) {
      continue;
    }

    const curated = curatedPuzzleThemes(puzzle.themes);
    for (const theme of curated) {
      let entry = statsByTheme.get(theme);
      if (!entry) {
        entry = {
          ownMistakeCount: 0,
          missedOpportunityCount: 0,
          gameIds: new Set<string>(),
          caliberSum: 0,
          caliberCount: 0
        };
        statsByTheme.set(theme, entry);
      }
      if (isOwn) {
        entry.ownMistakeCount += 1;
      } else {
        entry.missedOpportunityCount += 1;
      }
      entry.gameIds.add(puzzle.gameId);
      if (puzzle.caliberScore !== undefined && Number.isFinite(puzzle.caliberScore)) {
        entry.caliberSum += puzzle.caliberScore;
        entry.caliberCount += 1;
      }
    }
  }

  const blindspots: InGameBlindspot[] = [];
  for (const [theme, entry] of statsByTheme.entries()) {
    const totalCount = entry.ownMistakeCount + entry.missedOpportunityCount;
    if (totalCount <= 0) {
      continue;
    }
    const gameCount = entry.gameIds.size;
    const rawRate = ratio(totalCount, totalActionablePuzzles);
    // Empirical Bayes shrinkage toward a uniform curated-theme prior prevents 1-sample flukes
    // from dominating the top blindspot slots.
    const smoothedRate = roundTo(
      (totalCount + BAYESIAN_PRIOR_STRENGTH * BAYESIAN_PRIOR_RATE) /
        (totalActionablePuzzles + BAYESIAN_PRIOR_STRENGTH),
      4
    );
    const averageCaliberScore =
      entry.caliberCount > 0 ? roundTo(entry.caliberSum / entry.caliberCount, 1) : undefined;
    const smoothedCaliber =
      (entry.caliberSum + CALIBER_PRIOR_WEIGHT * CALIBER_PRIOR_MEAN) /
      (entry.caliberCount + CALIBER_PRIOR_WEIGHT);
    const recurrenceMultiplier = 0.6 + 0.4 * (gameCount / totalCount);
    const severityMultiplier =
      0.7 + 0.3 * Math.max(0.5, Math.min(1.5, smoothedCaliber / 100));
    const sampleDampener = totalCount >= 2 ? 1 : SINGLE_SAMPLE_DAMPENER;
    const priorityScore = roundTo(
      smoothedRate * 100 * recurrenceMultiplier * severityMultiplier * sampleDampener,
      2
    );
    const confidence: BlindspotConfidence =
      totalCount >= ESTABLISHED_MIN_COUNT && gameCount >= ESTABLISHED_MIN_GAMES
        ? "established"
        : "emerging";

    blindspots.push({
      theme,
      totalCount,
      ownMistakeCount: entry.ownMistakeCount,
      missedOpportunityCount: entry.missedOpportunityCount,
      gameCount,
      rawRate,
      smoothedRate,
      priorityScore,
      confidence,
      ...(averageCaliberScore !== undefined ? { averageCaliberScore } : {})
    });
  }

  blindspots.sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore;
    }
    if (right.totalCount !== left.totalCount) {
      return right.totalCount - left.totalCount;
    }
    if (right.gameCount !== left.gameCount) {
      return right.gameCount - left.gameCount;
    }
    if (right.ownMistakeCount !== left.ownMistakeCount) {
      return right.ownMistakeCount - left.ownMistakeCount;
    }
    return (
      (CURATED_THEME_ORDER.get(left.theme) ?? Number.MAX_SAFE_INTEGER) -
      (CURATED_THEME_ORDER.get(right.theme) ?? Number.MAX_SAFE_INTEGER)
    );
  });

  return blindspots.slice(0, MAX_DIAGNOSIS_BLINDSPOTS);
}

function selectHeadline(params: {
  sufficientData: boolean;
  analyzedGameCount: number;
  minGamesRequired: number;
  overallAccuracy?: number;
  clockTimingBreakdown: ClockTimingBreakdown;
  topBlindspots: readonly InGameBlindspot[];
  ownMistakeSplit: OwnMistakeSplit;
}): { headlineKind: DiagnosisHeadlineKind; headlineStats: DiagnosisHeadlineStats } {
  const {
    sufficientData,
    analyzedGameCount,
    minGamesRequired,
    overallAccuracy,
    clockTimingBreakdown,
    topBlindspots,
    ownMistakeSplit
  } = params;

  const baseStats: DiagnosisHeadlineStats = {
    analyzedGameCount,
    minGamesRequired,
    gamesRemaining: Math.max(0, minGamesRequired - analyzedGameCount),
    ...(overallAccuracy !== undefined ? { overallAccuracy } : {})
  };

  if (!sufficientData) {
    return {
      headlineKind: "insufficient_data",
      headlineStats: baseStats
    };
  }

  if (clockTimingBreakdown.knownClockOwnMistakes >= CLOCK_HEADLINE_MIN_KNOWN) {
    const timeTroubleShare = clockTimingBreakdown.knownShares.time_trouble;
    const impulsiveShare = clockTimingBreakdown.knownShares.impulsive;
    if (
      timeTroubleShare >= CLOCK_HEADLINE_MIN_SHARE ||
      impulsiveShare >= CLOCK_HEADLINE_MIN_SHARE
    ) {
      const winner: "time_trouble" | "impulsive" =
        timeTroubleShare >= impulsiveShare ? "time_trouble" : "impulsive";
      return {
        headlineKind: winner,
        headlineStats: {
          ...baseStats,
          dominantClockBucket: winner,
          dominantClockCount: clockTimingBreakdown.counts[winner],
          dominantClockKnownTotal: clockTimingBreakdown.knownClockOwnMistakes,
          dominantClockShare: clockTimingBreakdown.knownShares[winner]
        }
      };
    }
  }

  const primaryBlindspot = topBlindspots[0];
  if (primaryBlindspot && primaryBlindspot.confidence === "established") {
    return {
      headlineKind: "tactical_blindspot",
      headlineStats: {
        ...baseStats,
        primaryBlindspotTheme: primaryBlindspot.theme,
        primaryBlindspotCount: primaryBlindspot.totalCount,
        primaryBlindspotGames: primaryBlindspot.gameCount,
        primaryBlindspotConfidence: primaryBlindspot.confidence
      }
    };
  }

  if (
    ownMistakeSplit.totalOwnMistakes >= ESCAPED_HEADLINE_MIN_OWN &&
    ownMistakeSplit.escapedRatio >= ESCAPED_HEADLINE_MIN_RATIO
  ) {
    return {
      headlineKind: "escaped_blunders",
      headlineStats: {
        ...baseStats,
        escapedCount: ownMistakeSplit.totalEscaped,
        totalOwnMistakes: ownMistakeSplit.totalOwnMistakes,
        escapedRatio: ownMistakeSplit.escapedRatio,
        escapedPercent: ownMistakeSplit.escapedPercent
      }
    };
  }

  return {
    headlineKind: "balanced",
    headlineStats: {
      ...baseStats,
      ...(primaryBlindspot
        ? {
            primaryBlindspotTheme: primaryBlindspot.theme,
            primaryBlindspotCount: primaryBlindspot.totalCount,
            primaryBlindspotGames: primaryBlindspot.gameCount,
            primaryBlindspotConfidence: primaryBlindspot.confidence
          }
        : {}),
      ...(ownMistakeSplit.totalOwnMistakes > 0
        ? {
            escapedCount: ownMistakeSplit.totalEscaped,
            totalOwnMistakes: ownMistakeSplit.totalOwnMistakes,
            escapedRatio: ownMistakeSplit.escapedRatio,
            escapedPercent: ownMistakeSplit.escapedPercent
          }
        : {})
    }
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return roundTo(numerator / denominator, 4);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
