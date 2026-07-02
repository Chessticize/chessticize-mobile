import type { Puzzle } from "./types.ts";
import { isServerCompatibleArrowDuelPuzzle } from "./puzzle-selection-strategy.ts";

export interface PuzzlePackManifest {
  id: string;
  title: string;
  buildDate: string;
  source: string;
  sourceLicense: string;
  presolve: string;
  licenseNote: string;
  manifestHash: string;
  puzzleCount: number;
  rating: {
    min: number;
    max: number;
  };
  themes: string[];
  arrowDuelCount: number;
}

export interface BuildPuzzlePackManifestInput {
  id: string;
  title: string;
  buildDate: string;
  source: string;
  sourceLicense: string;
  presolve: string;
  licenseNote: string;
  manifestHash: string;
}

export function buildPuzzlePackManifest(
  puzzles: Puzzle[],
  input: BuildPuzzlePackManifestInput
): PuzzlePackManifest {
  if (puzzles.length === 0) {
    throw new Error("Puzzle pack must contain at least one puzzle");
  }

  const ratings = puzzles.map((puzzle) => puzzle.rating);
  return {
    id: input.id,
    title: input.title,
    buildDate: input.buildDate,
    source: input.source,
    sourceLicense: input.sourceLicense,
    presolve: input.presolve,
    licenseNote: input.licenseNote,
    manifestHash: input.manifestHash,
    puzzleCount: puzzles.length,
    rating: {
      min: Math.min(...ratings),
      max: Math.max(...ratings)
    },
    themes: [...new Set(puzzles.flatMap((puzzle) => puzzle.themes))].sort(),
    arrowDuelCount: puzzles.filter(isServerCompatibleArrowDuelPuzzle).length
  };
}
