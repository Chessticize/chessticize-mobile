import { selectRecommendedGamePuzzleIds } from "../../../../../packages/core/src/index.ts";
import { USER_GAME_RATING_KEY_PREFIX } from "../../../../../packages/storage/src/game-review-store.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";

/**
 * When the user enables "Auto-add recommended game puzzles to Review" in
 * Settings, automatically enroll any eligible top-caliber puzzles for `gameId`
 * once their offline difficulty rating has been computed.
 */
export function autoEnrollRecommendedPuzzlesForGame(
  service: PracticeService | undefined,
  gameId: string
): number {
  if (!service) {
    return 0;
  }
  if (!service.getSettings().gameReview?.autoAddRecommendedToReview) {
    return 0;
  }
  const game = service.getImportedGame(gameId);
  const userRating = game
    ? game.userColor === "w"
      ? game.white.rating
      : game.black.rating
    : undefined;
  const gamePuzzles = service.listUserPuzzles({ gameId });
  if (gamePuzzles.length === 0) {
    return 0;
  }
  const recommendedIds = selectRecommendedGamePuzzleIds(gamePuzzles, {
    getUserRating: () => userRating,
    requireEstimatedRating: true
  });
  let enrolled = 0;
  for (const puzzle of gamePuzzles) {
    if (!recommendedIds.has(puzzle.id)) {
      continue;
    }
    const mode = puzzle.puzzleKind === "arrow_duel" ? "arrow_duel" : "standard";
    const ctx = {
      puzzleId: puzzle.id,
      mode,
      ratingKey: `${USER_GAME_RATING_KEY_PREFIX}my_game_puzzles:${mode}`
    } as const;
    if (!service.getReviewQueueState(ctx)) {
      service.enrollReview(ctx);
      enrolled += 1;
    }
  }
  return enrolled;
}
