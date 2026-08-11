import type { Puzzle, SurvivalChallengeType, SurvivalLevel } from "../../core/src/index.ts";
import type { PuzzleSelectionFilter } from "./query-types.ts";

export interface RatingBandPuzzleSelection {
  halfWidth: number;
  minRating: number;
  maxRating: number;
  puzzles: Puzzle[];
}

export interface RatingBandPuzzleSelectionInput {
  filter: Omit<
    PuzzleSelectionFilter,
    "minRating" | "maxRating" | "preferredRating"
  >;
  ratingAnchor: number;
  halfWidths: readonly number[];
  excludedThemes?: readonly string[];
}

export interface SurvivalPuzzleBatchCursor {
  startPuzzleId: string;
  afterPuzzleId: string;
  wrapped: boolean;
}

export interface SurvivalPuzzleBatchInput {
  challengeType: SurvivalChallengeType;
  level: SurvivalLevel;
  limit: number;
  selectionSeed: string;
  cursor?: SurvivalPuzzleBatchCursor;
}

export interface SurvivalPuzzleBatch {
  puzzles: Puzzle[];
  cursor?: SurvivalPuzzleBatchCursor;
}

export interface PuzzleSource {
  countPuzzles(filter?: PuzzleSelectionFilter): number;
  getPuzzle(id: string): Puzzle | undefined;
  getPuzzles?(ids: readonly string[]): Puzzle[];
  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[];
  countSurvivalPuzzles(input: Pick<SurvivalPuzzleBatchInput, "challengeType" | "level">): number;
  selectSurvivalPuzzleBatch(input: SurvivalPuzzleBatchInput): SurvivalPuzzleBatch;
  selectPuzzlesForRatingBands?(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[];
  selectPuzzlesExcludingThemes?(
    filter: PuzzleSelectionFilter,
    excludedThemes: readonly string[]
  ): Puzzle[];
}
