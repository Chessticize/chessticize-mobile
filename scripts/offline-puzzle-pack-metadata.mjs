import { MATE_PATTERN_THEMES } from "../packages/core/src/index.ts";

function createMatePatternSummary() {
  return {
    totals: new Map(),
    buckets: new Map()
  };
}

function addPuzzleMatePatterns(summary, puzzle, maxRating) {
  const bucketMin = ratingBucket(puzzle.rating, maxRating);
  const bucketCounts = summary.buckets.get(bucketMin) ?? new Map();
  summary.buckets.set(bucketMin, bucketCounts);
  for (const theme of new Set(puzzle.themes)) {
    if (!MATE_PATTERN_THEMES.includes(theme)) {
      continue;
    }
    increment(summary.totals, theme);
    increment(bucketCounts, theme);
  }
}

function summarizeMatePatterns(puzzles, maxRating) {
  const summary = createMatePatternSummary();
  for (const puzzle of puzzles) {
    addPuzzleMatePatterns(summary, puzzle, maxRating);
  }
  return serializeMatePatternSummary(summary);
}

function serializeMatePatternSummary(summary) {
  return {
    totals: mapToSortedObject(summary.totals),
    buckets: new Map(
      [...summary.buckets.entries()].map(([bucket, counts]) => [
        bucket,
        mapToSortedObject(counts)
      ])
    )
  };
}

function ratingBucket(rating, maxRating) {
  return Math.min(maxRating - 100, Math.floor(rating / 100) * 100);
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToSortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
}

export {
  addPuzzleMatePatterns,
  createMatePatternSummary,
  ratingBucket,
  serializeMatePatternSummary,
  summarizeMatePatterns
};
