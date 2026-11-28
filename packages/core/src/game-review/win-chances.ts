/**
 * Winning-chances & accuracy curve utilities for game review.
 *
 * Original work Copyright 2020 lichess.org (lichess-org/lila#11148)
 * Modified work Copyright 2024-2026 chessticize.com (Chessticize/chessticize-worker)
 *
 * Licensed under the MIT License.
 */

import type { AnalysisScore } from "../engine-analysis.ts";

export type ScorePov = "white" | "black" | "sideToMove";

/**
 * Lichess sigmoid coefficient calibrated against human game outcomes (lila#11148).
 */
const WIN_CHANCES_MULTIPLIER = -0.00368208;

/**
 * Lichess move-accuracy exponential decay parameters.
 */
const MOVE_ACCURACY_SCALE = 103.1668;
const MOVE_ACCURACY_DECAY = -0.04354;
const MOVE_ACCURACY_OFFSET = -3.1669;

const MIN_VOLATILITY_WEIGHT = 0.5;
const MAX_VOLATILITY_WEIGHT = 12;

export function clamp(min: number, max: number, value: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Determine the sign (+1 or -1) of a mate score, safely distinguishing +0 (mate delivered)
 * from -0 (checkmated) while guarding against NaN.
 */
export function mateScoreSign(mate: number): -1 | 0 | 1 {
  if (Number.isNaN(mate)) {
    return 0;
  }
  if (mate > 0) {
    return 1;
  }
  if (mate < 0) {
    return -1;
  }
  return Object.is(mate, -0) ? -1 : 1;
}

/**
 * Convert an AnalysisScore to centipawns from the requested point of view.
 * Mate scores are mapped to +/- `mateCp` (default 10000).
 */
export function scoreToCentipawns(
  score: AnalysisScore,
  pov: ScorePov = "sideToMove",
  mateCp = 10000
): number {
  if (score.kind === "mate") {
    const rawMate =
      pov === "white"
        ? score.whiteMate
        : pov === "black"
          ? -score.whiteMate
          : score.sideToMoveMate;
    const sign = mateScoreSign(rawMate);
    const value = sign * Math.abs(mateCp);
    return value === 0 ? 0 : value;
  }

  const rawCp =
    pov === "white"
      ? score.whiteCentipawns
      : pov === "black"
        ? -score.whiteCentipawns
        : score.sideToMoveCentipawns;
  return rawCp === 0 ? 0 : rawCp;
}

/**
 * Convert an AnalysisScore to winning chances in [-1, +1] using the Lichess sigmoid curve.
 * Positive mate maps to +1, negative mate (including -0) maps to -1.
 */
export function winChances(
  score: AnalysisScore,
  pov: ScorePov = "sideToMove"
): number {
  if (score.kind === "mate") {
    const rawMate =
      pov === "white"
        ? score.whiteMate
        : pov === "black"
          ? -score.whiteMate
          : score.sideToMoveMate;
    return mateScoreSign(rawMate);
  }

  const cp = scoreToCentipawns(score, pov);
  if (Number.isNaN(cp)) {
    return 0;
  }
  if (cp === Number.POSITIVE_INFINITY) {
    return 1;
  }
  if (cp === Number.NEGATIVE_INFINITY) {
    return -1;
  }

  const chances = 2 / (1 + Math.exp(WIN_CHANCES_MULTIPLIER * cp)) - 1;
  return clamp(-1, 1, chances);
}

/**
 * Convert an AnalysisScore to winning percentage in [0, 100].
 */
export function winPercent(
  score: AnalysisScore,
  pov: ScorePov = "sideToMove"
): number {
  return clamp(0, 100, (winChances(score, pov) + 1) * 50);
}

/**
 * Compute single-move accuracy in [0, 100] from mover Win% before and after the move
 * using the Lichess accuracy curve.
 */
export function computeMoveAccuracy(
  winPercentBefore: number,
  winPercentAfter: number
): number {
  const winDiff = Math.max(0, winPercentBefore - winPercentAfter);
  const raw =
    MOVE_ACCURACY_SCALE * Math.exp(MOVE_ACCURACY_DECAY * winDiff) +
    MOVE_ACCURACY_OFFSET;
  return clamp(0, 100, raw);
}

export interface MoveWinPercentTransition {
  winPercentBefore: number;
  winPercentAfter: number;
  /**
   * Optional ply index into a full-game win-percent timeline used to compute
   * volatility weights. When omitted, weights are derived from the transitions directly.
   */
  timelineIndex?: number;
}

/**
 * Compute per-side Accuracy% in [0, 100] from a sequence of Win% points for that side
 * using Lichess's combination of volatility-weighted arithmetic mean and harmonic mean.
 *
 * Each consecutive pair `(winPercents[i - 1], winPercents[i])` represents a move transition.
 * Returns 0 when fewer than 2 points (0 moves) are provided.
 */
export function computeSideAccuracy(winPercents: readonly number[]): number {
  if (winPercents.length < 2) {
    return 0;
  }

  const transitions: MoveWinPercentTransition[] = [];
  for (let index = 1; index < winPercents.length; index += 1) {
    const before = winPercents[index - 1];
    const after = winPercents[index];
    if (before === undefined || after === undefined) {
      continue;
    }
    transitions.push({
      winPercentBefore: before,
      winPercentAfter: after,
      timelineIndex: index - 1
    });
  }

  return computeSideAccuracyFromTransitions(transitions, winPercents);
}

/**
 * Compute per-side Accuracy% in [0, 100] from explicit mover transitions and an optional
 * full-game Win% timeline (e.g. White's Win% at ply 0..N) for sliding-window volatility weights.
 */
export function computeSideAccuracyFromTransitions(
  transitions: readonly MoveWinPercentTransition[],
  volatilityTimeline?: readonly number[]
): number {
  if (transitions.length === 0) {
    return 0;
  }

  const moveAccuracies = transitions.map((transition) =>
    computeMoveAccuracy(transition.winPercentBefore, transition.winPercentAfter)
  );

  const timeline =
    volatilityTimeline && volatilityTimeline.length >= 2
      ? volatilityTimeline
      : buildFallbackTimeline(transitions);

  const windowSize = clamp(
    2,
    8,
    Math.min(timeline.length, Math.max(2, Math.floor(timeline.length / 10)))
  );

  const weights = transitions.map((transition, idx) => {
    const anchor = transition.timelineIndex ?? idx;
    const windowValues = sliceWindow(timeline, anchor, windowSize);
    return clamp(
      MIN_VOLATILITY_WEIGHT,
      MAX_VOLATILITY_WEIGHT,
      standardDeviation(windowValues)
    );
  });

  const weighted = weightedMean(moveAccuracies, weights);
  const harmonic = harmonicMean(moveAccuracies);
  return clamp(0, 100, (weighted + harmonic) / 2);
}

function buildFallbackTimeline(
  transitions: readonly MoveWinPercentTransition[]
): number[] {
  const first = transitions[0];
  if (!first) {
    return [];
  }
  const values = [first.winPercentBefore];
  for (const transition of transitions) {
    values.push(transition.winPercentAfter);
  }
  return values;
}

function sliceWindow(
  timeline: readonly number[],
  anchorIndex: number,
  windowSize: number
): number[] {
  if (timeline.length <= windowSize) {
    return [...timeline];
  }
  const half = Math.floor(windowSize / 2);
  let start = anchorIndex - half;
  if (start < 0) {
    start = 0;
  }
  if (start + windowSize > timeline.length) {
    start = timeline.length - windowSize;
  }
  return timeline.slice(start, start + windowSize);
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function weightedMean(
  values: readonly number[],
  weights: readonly number[]
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const weight = weights[index];
    if (value === undefined || weight === undefined) {
      continue;
    }
    weightedSum += value * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function harmonicMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let reciprocalSum = 0;
  for (const value of values) {
    if (value <= 0) {
      return 0;
    }
    reciprocalSum += 1 / value;
  }
  return reciprocalSum > 0 ? values.length / reciprocalSum : 0;
}
