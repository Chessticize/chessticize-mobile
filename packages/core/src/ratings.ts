import type { RatingRecord } from "./types.ts";

export const DEFAULT_RATING = 600;
export const RATING_FLOOR = 600;
export const DEFAULT_RATING_DEVIATION = 350;
export const DEFAULT_OPPONENT_RATING_DEVIATION = 50;
export const DEFAULT_VOLATILITY = 0.06;
export const MINIMUM_VOLATILITY = 0.04;

const GLICKO_SCALE = 173.7178;
const SYSTEM_CONSTANT = 0.5;
const CONVERGENCE_TOLERANCE = 0.000001;

export interface SprintRatingChange {
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  ratingDeviationBefore: number;
  ratingDeviationAfter: number;
  volatilityBefore: number;
  volatilityAfter: number;
}

interface SprintRatingInput {
  rating: number;
  ratingDeviation?: number | undefined;
  volatility?: number | undefined;
  games: number;
}

export function createDefaultRating(key: string): RatingRecord {
  return {
    key,
    generation: 0,
    rating: DEFAULT_RATING,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
    games: 0
  };
}

export function normalizeRatingRecord(record: RatingRecord): RatingRecord {
  return {
    ...record,
    ratingDeviation: record.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
    volatility: record.volatility ?? DEFAULT_VOLATILITY
  };
}

export function calculateSprintRatingChange(input: {
  rating: SprintRatingInput;
  won: boolean;
  floor?: number | undefined;
}): SprintRatingChange {
  const ratingBefore = input.rating.rating;
  const ratingDeviationBefore = input.rating.ratingDeviation ?? DEFAULT_RATING_DEVIATION;
  const volatilityBefore = input.rating.volatility ?? DEFAULT_VOLATILITY;
  const floor = input.floor ?? RATING_FLOOR;

  const mu = (ratingBefore - DEFAULT_RATING) / GLICKO_SCALE;
  const phi = ratingDeviationBefore / GLICKO_SCALE;
  const sigma = volatilityBefore;

  // Match the server: a sprint is one game against a system opponent at the
  // user's current rating with a stable, low opponent RD.
  const opponentMu = (ratingBefore - DEFAULT_RATING) / GLICKO_SCALE;
  const opponentPhi = DEFAULT_OPPONENT_RATING_DEVIATION / GLICKO_SCALE;
  const g = 1 / Math.sqrt(1 + (3 * opponentPhi * opponentPhi) / (Math.PI * Math.PI));
  const expected = 1 / (1 + Math.exp(-g * (mu - opponentMu)));
  const score = input.won ? 1 : 0;
  const variance = 1 / (g * g * expected * (1 - expected));
  const delta = variance * g * (score - expected);

  const volatilityLog = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const exp = Math.exp(x);
    return (
      (exp * (delta * delta - phi * phi - variance - exp)) /
        (2 * (phi * phi + variance + exp) ** 2) -
      (x - volatilityLog) / (SYSTEM_CONSTANT * SYSTEM_CONSTANT)
    );
  };

  let left = volatilityLog;
  let right: number;
  if (delta * delta > phi * phi + variance) {
    right = Math.log(delta * delta - phi * phi - variance);
  } else {
    let step = 1;
    while (f(volatilityLog - step * SYSTEM_CONSTANT) < 0) {
      step += 1;
    }
    right = volatilityLog - step * SYSTEM_CONSTANT;
  }

  let fLeft = f(left);
  let fRight = f(right);
  while (Math.abs(right - left) > CONVERGENCE_TOLERANCE) {
    const next = left + ((left - right) * fLeft) / (fRight - fLeft);
    const fNext = f(next);
    if (fNext * fRight < 0) {
      left = right;
      fLeft = fRight;
    } else {
      fLeft /= 2;
    }
    right = next;
    fRight = fNext;
  }

  const newSigma = Math.exp(left / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / variance);
  const newMu = mu + newPhi * newPhi * g * (score - expected);
  const ratingAfter = Math.max(floor, Math.round(newMu * GLICKO_SCALE + DEFAULT_RATING));
  const ratingDeviationAfter = newPhi * GLICKO_SCALE;
  const gamesAfter = input.rating.games + 1;
  const volatilityAfter = gamesAfter > 10
    ? Math.max(MINIMUM_VOLATILITY, volatilityBefore * 0.99)
    : volatilityBefore;

  return {
    ratingBefore,
    ratingAfter,
    ratingChange: ratingAfter - ratingBefore,
    ratingDeviationBefore,
    ratingDeviationAfter,
    volatilityBefore,
    volatilityAfter
  };
}

export function applySprintRatingChange(record: RatingRecord, change: SprintRatingChange): RatingRecord {
  const normalized = normalizeRatingRecord(record);
  return {
    ...normalized,
    rating: change.ratingAfter,
    ratingDeviation: change.ratingDeviationAfter,
    volatility: change.volatilityAfter,
    games: normalized.games + 1
  };
}

export function calculateRatingUpdate(input: {
  currentRating: number;
  score: 0 | 1;
  opponentRating?: number;
  kFactor?: number;
  ratingDeviation?: number;
  volatility?: number;
  games?: number;
  floor?: number;
}): number {
  return calculateSprintRatingChange({
    rating: {
      rating: input.currentRating,
      ratingDeviation: input.ratingDeviation,
      volatility: input.volatility,
      games: input.games ?? 0
    },
    won: input.score === 1,
    floor: input.floor
  }).ratingAfter;
}

export function resetRating(record: RatingRecord): RatingRecord {
  return {
    key: record.key,
    generation: record.generation + 1,
    rating: DEFAULT_RATING,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
    games: 0
  };
}
