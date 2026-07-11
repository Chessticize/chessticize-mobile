import {
  buildServerEloPuzzleSelectionStrategies,
  isServerCompatibleArrowDuelPuzzle
} from "../../core/src/index.ts";
import type { Puzzle, SprintMode } from "../../core/src/index.ts";

export interface SelectUniquePuzzlesInput {
  puzzles: Puzzle[];
  mode: SprintMode;
  limit: number;
  allPuzzlesArrowDuelEligible?: boolean;
  rating?: number;
  minRating?: number;
  maxRating?: number;
  theme?: string;
  includeIds?: string[];
  excludeIds?: string[];
  randomSeed?: string | number;
}

export function selectUniquePuzzles(input: SelectUniquePuzzlesInput): Puzzle[] {
  if (input.rating !== undefined && input.minRating === undefined && input.maxRating === undefined) {
    return selectPuzzlesByServerEloFallback({ ...input, rating: input.rating });
  }

  return selectMatchingPuzzles(input, new Set<string>(), new Set(input.excludeIds ?? []));
}

function selectPuzzlesByServerEloFallback(input: SelectUniquePuzzlesInput & { rating: number }): Puzzle[] {
  const selected: Puzzle[] = [];
  const seen = new Set<string>();
  const excludedIds = new Set(input.excludeIds ?? []);
  const strategies = buildServerEloPuzzleSelectionStrategies({
    rating: input.rating,
    themes: input.theme === undefined ? [] : [input.theme]
  });

  for (const strategy of strategies) {
    if (selected.length >= input.limit) {
      break;
    }
    const additional = selectMatchingPuzzles(
      {
        puzzles: input.puzzles,
        mode: input.mode,
        limit: input.limit - selected.length,
        ...(input.allPuzzlesArrowDuelEligible === undefined
          ? {}
          : { allPuzzlesArrowDuelEligible: input.allPuzzlesArrowDuelEligible }),
        minRating: strategy.minRating,
        maxRating: strategy.maxRating,
        ...(strategy.themes.length === 0 ? {} : { theme: strategy.themes[0] }),
        ...(input.includeIds === undefined ? {} : { includeIds: input.includeIds }),
        ...(input.randomSeed === undefined
          ? {}
          : { randomSeed: `${input.randomSeed}:${strategy.minRating}:${strategy.maxRating}:${strategy.themes.join(",")}` })
      },
      seen,
      excludedIds
    );
    selected.push(...additional);
    for (const puzzle of additional) {
      excludedIds.add(puzzle.id);
    }
  }

  return selected;
}

function selectMatchingPuzzles(
  input: SelectUniquePuzzlesInput,
  seen: Set<string>,
  excludedIds: Set<string>
): Puzzle[] {
  const selected: Puzzle[] = [];
  const includedIds = input.includeIds === undefined ? undefined : new Set(input.includeIds);
  const candidates = input.randomSeed === undefined ? input.puzzles : seededShuffle(input.puzzles, input.randomSeed);

  for (const puzzle of candidates) {
    if (includedIds !== undefined && !includedIds.has(puzzle.id)) {
      continue;
    }
    if (excludedIds.has(puzzle.id) || !isEligiblePuzzle(puzzle, input)) {
      continue;
    }
    const key = puzzleFingerprint(puzzle);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(puzzle);
    if (selected.length >= input.limit) {
      break;
    }
  }

  return selected;
}

function isEligiblePuzzle(
  puzzle: Puzzle,
  filter: Omit<SelectUniquePuzzlesInput, "puzzles" | "limit" | "rating" | "excludeIds">
): boolean {
  if (puzzle.rating < (filter.minRating ?? 0) || puzzle.rating > (filter.maxRating ?? 4000)) {
    return false;
  }
  if (filter.theme && !puzzle.themes.includes(filter.theme)) {
    return false;
  }
  if (filter.mode !== "arrow_duel") {
    return true;
  }
  if (filter.allPuzzlesArrowDuelEligible) {
    return true;
  }

  return isServerCompatibleArrowDuelPuzzle(puzzle);
}

function puzzleFingerprint(puzzle: Puzzle): string {
  return [
    canonicalPositionFen(puzzle.initialFen),
    puzzle.solutionMoves.map(normalizeMove).join(" "),
    normalizeMove(puzzle.stockfishBestMove ?? "")
  ].join("|");
}

function canonicalPositionFen(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) {
    return fen.trim();
  }
  return fields.slice(0, 4).join(" ");
}

function normalizeMove(move: string): string {
  return move.trim().toLowerCase();
}

function seededShuffle<T>(items: T[], seedInput: string | number): T[] {
  const shuffled = [...items];
  let seed = hashSeed(String(seedInput));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    const current = shuffled[index] as T;
    shuffled[index] = shuffled[swapIndex] as T;
    shuffled[swapIndex] = current;
  }
  return shuffled;
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
