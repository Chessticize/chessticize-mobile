import type { RatingRecord } from "./types.ts";

export const DEFAULT_RATING = 600;
export const RATING_FLOOR = 600;
export const DEFAULT_K_FACTOR = 32;

export function createDefaultRating(key: string): RatingRecord {
  return {
    key,
    generation: 0,
    rating: DEFAULT_RATING,
    games: 0
  };
}

export function calculateRatingUpdate(input: {
  currentRating: number;
  opponentRating: number;
  score: 0 | 1;
  kFactor?: number;
  floor?: number;
}): number {
  const kFactor = input.kFactor ?? DEFAULT_K_FACTOR;
  const floor = input.floor ?? RATING_FLOOR;
  const expected = 1 / (1 + 10 ** ((input.opponentRating - input.currentRating) / 400));
  const next = Math.round(input.currentRating + kFactor * (input.score - expected));
  return Math.max(floor, next);
}

export function resetRating(record: RatingRecord): RatingRecord {
  return {
    key: record.key,
    generation: record.generation + 1,
    rating: DEFAULT_RATING,
    games: 0
  };
}
