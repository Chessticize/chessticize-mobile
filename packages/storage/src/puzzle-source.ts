import type { Puzzle } from "../../core/src/index.ts";
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

export interface PuzzleSource {
  countPuzzles(filter?: PuzzleSelectionFilter): number;
  getPuzzle(id: string): Puzzle | undefined;
  getPuzzles?(ids: readonly string[]): Puzzle[];
  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[];
  selectPuzzlesForRatingBands?(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[];
  selectPuzzlesExcludingThemes?(
    filter: PuzzleSelectionFilter,
    excludedThemes: readonly string[]
  ): Puzzle[];
}
