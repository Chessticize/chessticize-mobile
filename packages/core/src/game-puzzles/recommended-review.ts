import {
  classifyClockBucket,
  type GameTimeClass
} from "../game-review/pgn-parser.ts";
import type { UserGamePuzzleRatingSource } from "../types.ts";
import { isWithinReviewDifficultyBand } from "./difficulty.ts";

export const DEFAULT_MAX_RECOMMENDED_PUZZLES_PER_GAME = 2;

export interface RecommendedGamePuzzleCandidate {
  id: string;
  gameId: string;
  gamePly: number;
  rating: number;
  ratingSource?: UserGamePuzzleRatingSource;
  clockRemainingSec?: number;
  timeSpentSec?: number;
  timeClass?: string;
  caliberScore?: number;
  archived?: boolean;
}

export interface RecommendedGamePuzzleEligibilityOptions {
  userRating?: number;
  /**
   * When true (used by auto-enroll), puzzles whose rating is still a coarse
   * `game_anchor` wait until background difficulty rating finishes before
   * being auto-enrolled.
   */
  requireEstimatedRating?: boolean;
}

export interface SelectRecommendedGamePuzzlesOptions {
  getUserRating?: (gameId: string) => number | undefined;
  maxPerGame?: number;
  requireEstimatedRating?: boolean;
}

function normalizeTimeClassForClock(value: string | undefined): GameTimeClass {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "bullet" ||
    normalized === "blitz" ||
    normalized === "rapid" ||
    normalized === "classical" ||
    normalized === "daily"
  ) {
    return normalized;
  }
  return "unknown";
}

export function isEligibleForRecommendedGamePuzzleReview(
  puzzle: RecommendedGamePuzzleCandidate,
  options: RecommendedGamePuzzleEligibilityOptions = {}
): boolean {
  if (puzzle.archived) {
    return false;
  }

  const bucket = classifyClockBucket({
    ...(puzzle.clockRemainingSec !== undefined
      ? { clockRemainingSec: puzzle.clockRemainingSec }
      : {}),
    ...(puzzle.timeSpentSec !== undefined ? { timeSpentSec: puzzle.timeSpentSec } : {}),
    timeClass: normalizeTimeClassForClock(puzzle.timeClass)
  });
  if (bucket === "time_trouble" || bucket === "impulsive") {
    return false;
  }

  const hasEstimatedRating =
    puzzle.ratingSource !== undefined && puzzle.ratingSource !== "game_anchor";
  if (options.requireEstimatedRating && !hasEstimatedRating) {
    return false;
  }
  if (
    hasEstimatedRating &&
    !isWithinReviewDifficultyBand(puzzle.rating, options.userRating)
  ) {
    return false;
  }

  return true;
}

/**
 * Selects recommended game-extracted puzzles for Spaced Repetition Review:
 * 1. Excludes time-pressure (<=15s remaining, or <=10s bullet) and impulsive (<=2s spent) blunders.
 * 2. Excludes puzzles rated more than +300 above the player's game rating.
 * 3. Keeps at most `maxPerGame` (default 2) highest-caliber puzzles per game.
 */
export function selectRecommendedGamePuzzleIds(
  puzzles: readonly RecommendedGamePuzzleCandidate[],
  options: SelectRecommendedGamePuzzlesOptions = {}
): Set<string> {
  const maxPerGame = options.maxPerGame ?? DEFAULT_MAX_RECOMMENDED_PUZZLES_PER_GAME;
  if (maxPerGame <= 0 || puzzles.length === 0) {
    return new Set();
  }

  const byGame = new Map<string, RecommendedGamePuzzleCandidate[]>();
  for (const puzzle of puzzles) {
    const userRating = options.getUserRating?.(puzzle.gameId);
    if (
      !isEligibleForRecommendedGamePuzzleReview(puzzle, {
        ...(userRating !== undefined ? { userRating } : {}),
        ...(options.requireEstimatedRating !== undefined
          ? { requireEstimatedRating: options.requireEstimatedRating }
          : {})
      })
    ) {
      continue;
    }
    let list = byGame.get(puzzle.gameId);
    if (!list) {
      list = [];
      byGame.set(puzzle.gameId, list);
    }
    list.push(puzzle);
  }

  const recommended = new Set<string>();
  for (const list of byGame.values()) {
    list.sort((left, right) => {
      const scoreDiff = (right.caliberScore ?? 0) - (left.caliberScore ?? 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      if (left.gamePly !== right.gamePly) {
        return left.gamePly - right.gamePly;
      }
      return left.id.localeCompare(right.id);
    });
    for (const puzzle of list.slice(0, maxPerGame)) {
      recommended.add(puzzle.id);
    }
  }
  return recommended;
}
