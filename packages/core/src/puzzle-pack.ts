import type { Puzzle } from "./types.ts";
import { isServerCompatibleArrowDuelPuzzle } from "./puzzle-selection-strategy.ts";
import type { TacticalProfileTaskFamily } from "./tactical-profile.ts";

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
  /** Monotonic content version used by mobile runtime cache filenames. */
  packVersion?: number;
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
  tacticalAnalysis?: PuzzlePackTacticalAnalysisManifest;
  arrowDuelCount: number;
}

export interface PuzzlePackTacticalAnalysisManifest {
  schemaVersion: 1;
  puzzleRatingDeviation: true;
  featureHash: string;
}

export interface PuzzlePackBucketManifest {
  minRating: number;
  maxRating: number;
  puzzleCount: number;
  themeCounts: Record<string, number>;
  matePatternCounts: Record<string, number>;
}

export type TacticalThemeInventoryUpperBound = {
  availableByTheme: Readonly<Record<string, number>>;
  puzzleCount: number;
};

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
  packVersion?: number;
  packFileHash?: string;
  packFileBytes?: number;
  format?: "json" | "sqlite";
  seed?: string;
  targetPuzzleCount?: number;
  tacticalAnalysis?: PuzzlePackTacticalAnalysisManifest;
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
    ...(input.packVersion === undefined ? {} : { packVersion: input.packVersion }),
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
    ...(input.tacticalAnalysis === undefined
      ? {}
      : { tacticalAnalysis: { ...input.tacticalAnalysis } }),
    arrowDuelCount: puzzles.filter(isServerCompatibleArrowDuelPuzzle).length
  };
}

/**
 * Returns the task-family theme distribution nearest the user's current Rating.
 *
 * The manifest can prove Arrow Duel's distribution only when every pack puzzle
 * is Arrow Duel eligible. A partially eligible pack needs task-family bucket
 * counts in a future manifest schema, so this helper fails closed instead of
 * silently reusing line-puzzle frequencies.
 */
export function tacticalThemeFrequencyAtRating(
  manifest: PuzzlePackManifest,
  taskFamily: TacticalProfileTaskFamily,
  rating: number
): Readonly<Record<string, number>> {
  if (!supportsTaskFamilyBucketCounts(manifest, taskFamily)) {
    return {};
  }
  const bucket = nearestRatingBucket(manifest.ratingBuckets, rating);
  if (!bucket || bucket.puzzleCount < 1) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(bucket.themeCounts).map(([theme, count]) => [
      theme,
      normalizedManifestCount(count) / bucket.puzzleCount
    ])
  );
}

/**
 * Uses whole overlapping Rating buckets as a conservative inventory upper
 * bound. It may over-count a partial edge bucket, but can never reject a Run
 * that the exact indexed query could fill.
 */
export function tacticalThemeInventoryUpperBound(
  manifest: PuzzlePackManifest,
  taskFamily: TacticalProfileTaskFamily,
  minRating: number,
  maxRating: number,
  themes: readonly string[]
): TacticalThemeInventoryUpperBound | undefined {
  if (
    !supportsTaskFamilyBucketCounts(manifest, taskFamily) ||
    !Number.isFinite(minRating) ||
    !Number.isFinite(maxRating) ||
    minRating > maxRating
  ) {
    return undefined;
  }
  const buckets = (manifest.ratingBuckets ?? []).filter(
    (bucket) => bucket.maxRating >= minRating && bucket.minRating <= maxRating
  );
  const uniqueThemes = [...new Set(
    themes.map((theme) => theme.trim()).filter((theme) => theme.length > 0)
  )];
  return {
    availableByTheme: Object.fromEntries(
      uniqueThemes.map((theme) => [
        theme,
        buckets.reduce(
          (total, bucket) =>
            total + normalizedManifestCount(bucket.themeCounts[theme]),
          0
        )
      ])
    ),
    puzzleCount: buckets.reduce(
      (total, bucket) => total + normalizedManifestCount(bucket.puzzleCount),
      0
    )
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

function supportsTaskFamilyBucketCounts(
  manifest: PuzzlePackManifest,
  taskFamily: TacticalProfileTaskFamily
): boolean {
  return taskFamily === "line" ||
    manifest.arrowDuelCount === manifest.puzzleCount;
}

function nearestRatingBucket(
  buckets: readonly PuzzlePackBucketManifest[] | undefined,
  rating: number
): PuzzlePackBucketManifest | undefined {
  if (!buckets?.length || !Number.isFinite(rating)) {
    return undefined;
  }
  return [...buckets].sort((left, right) =>
    distanceFromBucket(rating, left) - distanceFromBucket(rating, right) ||
    left.minRating - right.minRating
  )[0];
}

function distanceFromBucket(
  rating: number,
  bucket: PuzzlePackBucketManifest
): number {
  if (rating < bucket.minRating) {
    return bucket.minRating - rating;
  }
  if (rating > bucket.maxRating) {
    return rating - bucket.maxRating;
  }
  return 0;
}

function normalizedManifestCount(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : 0;
}
