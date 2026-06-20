import type { Puzzle, SprintMode } from "../../core/src/index.ts";

export interface SelectUniquePuzzlesInput {
  puzzles: Puzzle[];
  mode: SprintMode;
  limit: number;
  minRating?: number;
  maxRating?: number;
  theme?: string;
}

export function selectUniquePuzzles(input: SelectUniquePuzzlesInput): Puzzle[] {
  const seen = new Set<string>();
  const selected: Puzzle[] = [];

  for (const puzzle of input.puzzles) {
    if (!isEligiblePuzzle(puzzle, input)) {
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
  filter: Omit<SelectUniquePuzzlesInput, "puzzles" | "limit">
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

  const firstMove = puzzle.solutionMoves[0];
  return Boolean(
    firstMove &&
      puzzle.stockfishBestMove &&
      normalizeMove(firstMove) !== normalizeMove(puzzle.stockfishBestMove)
  );
}

function puzzleFingerprint(puzzle: Puzzle): string {
  return [
    puzzle.initialFen,
    puzzle.solutionMoves.map(normalizeMove).join(" "),
    normalizeMove(puzzle.stockfishBestMove ?? "")
  ].join("|");
}

function normalizeMove(move: string): string {
  return move.trim().toLowerCase();
}
