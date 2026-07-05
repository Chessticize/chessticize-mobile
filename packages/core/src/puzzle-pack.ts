import type { Puzzle } from "./types.ts";
import { isServerCompatibleArrowDuelPuzzle } from "./puzzle-selection-strategy.ts";

export interface PuzzlePackManifest {
  id: string;
  title: string;
  buildDate: string;
  source: string;
  sourceLicense: string;
  sourceSnapshotDate?: string;
  presolve: string;
  presolveDepth?: number;
  licenseNote: string;
  manifestHash: string;
  packFileHash?: string;
  packFileBytes?: number;
  format?: "json" | "sqlite";
  seed?: string;
  targetPuzzleCount?: number;
  puzzleCount: number;
  rating: {
    min: number;
    max: number;
  };
  themes: string[];
  themeCounts?: Record<string, number>;
  ratingBuckets?: PuzzlePackBucketManifest[];
  matePatternCounts?: Record<string, number>;
  arrowDuelCount: number;
}

export interface PuzzlePackBucketManifest {
  minRating: number;
  maxRating: number;
  puzzleCount: number;
  themeCounts: Record<string, number>;
  matePatternCounts: Record<string, number>;
}

export interface BuildPuzzlePackManifestInput {
  id: string;
  title: string;
  buildDate: string;
  source: string;
  sourceLicense: string;
  sourceSnapshotDate?: string;
  presolve: string;
  presolveDepth?: number;
  licenseNote: string;
  manifestHash: string;
  packFileHash?: string;
  packFileBytes?: number;
  format?: "json" | "sqlite";
  seed?: string;
  targetPuzzleCount?: number;
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
    ...(input.sourceSnapshotDate === undefined ? {} : { sourceSnapshotDate: input.sourceSnapshotDate }),
    presolve: input.presolve,
    ...(input.presolveDepth === undefined ? {} : { presolveDepth: input.presolveDepth }),
    licenseNote: input.licenseNote,
    manifestHash: input.manifestHash,
    ...(input.packFileHash === undefined ? {} : { packFileHash: input.packFileHash }),
    ...(input.packFileBytes === undefined ? {} : { packFileBytes: input.packFileBytes }),
    ...(input.format === undefined ? {} : { format: input.format }),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    ...(input.targetPuzzleCount === undefined ? {} : { targetPuzzleCount: input.targetPuzzleCount }),
    puzzleCount: puzzles.length,
    rating: {
      min: Math.min(...ratings),
      max: Math.max(...ratings)
    },
    themes: [...new Set(puzzles.flatMap((puzzle) => puzzle.themes))].sort(),
    themeCounts: countThemes(puzzles),
    ratingBuckets: buildRatingBuckets(puzzles),
    matePatternCounts: countThemes(puzzles, MATE_PATTERN_THEMES),
    arrowDuelCount: puzzles.filter(isServerCompatibleArrowDuelPuzzle).length
  };
}

export const MATE_PATTERN_THEMES = [
  "backRankMate",
  "smotheredMate",
  "anastasiaMate",
  "arabianMate",
  "bodenMate",
  "hookMate",
  "dovetailMate",
  "doubleBishopMate",
  "killBoxMate"
] as const;

function buildRatingBuckets(puzzles: Puzzle[]): PuzzlePackBucketManifest[] {
  const buckets = new Map<number, Puzzle[]>();
  for (const puzzle of puzzles) {
    const bucketMin = Math.floor(puzzle.rating / 100) * 100;
    const bucket = buckets.get(bucketMin) ?? [];
    bucket.push(puzzle);
    buckets.set(bucketMin, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([minRating, bucketPuzzles]) => ({
      minRating,
      maxRating: minRating + 99,
      puzzleCount: bucketPuzzles.length,
      themeCounts: countThemes(bucketPuzzles),
      matePatternCounts: countThemes(bucketPuzzles, MATE_PATTERN_THEMES)
    }));
}

function countThemes(puzzles: Puzzle[], onlyThemes?: readonly string[]): Record<string, number> {
  const allowedThemes = onlyThemes === undefined ? undefined : new Set(onlyThemes);
  const counts = new Map<string, number>();
  for (const puzzle of puzzles) {
    for (const theme of puzzle.themes) {
      if (allowedThemes !== undefined && !allowedThemes.has(theme)) {
        continue;
      }
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
