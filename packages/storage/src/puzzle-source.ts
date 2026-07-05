import type { Puzzle } from "../../core/src/index.ts";
import type { PuzzleSelectionFilter } from "./query-types.ts";

export interface PuzzleSource {
  countPuzzles(): number;
  getPuzzle(id: string): Puzzle | undefined;
  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[];
}
