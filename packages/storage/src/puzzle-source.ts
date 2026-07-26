import type { Puzzle } from "../../core/src/index.ts";
import type { PuzzleSelectionFilter } from "./query-types.ts";

export interface PuzzleSource {
  countPuzzles(filter?: PuzzleSelectionFilter): number;
  getPuzzle(id: string): Puzzle | undefined;
  getPuzzles?(ids: readonly string[]): Puzzle[];
  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[];
  selectPuzzlesExcludingThemes?(
    filter: PuzzleSelectionFilter,
    excludedThemes: readonly string[]
  ): Puzzle[];
}
