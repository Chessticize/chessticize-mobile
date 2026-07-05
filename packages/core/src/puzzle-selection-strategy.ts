import { Chess } from "chess.js";
import type { Puzzle } from "./types.ts";

export interface EloPuzzleSelectionStrategy {
  name: string;
  minRating: number;
  maxRating: number;
  themes: string[];
}

export interface BuildEloPuzzleSelectionStrategiesInput {
  rating: number;
  themes?: string[];
}

export const SERVER_PUZZLE_MIN_RATING = 600;
export const SERVER_PUZZLE_MAX_RATING = 2200;

export function buildServerEloPuzzleSelectionStrategies(
  input: BuildEloPuzzleSelectionStrategiesInput
): EloPuzzleSelectionStrategy[] {
  const themes = input.themes ?? [];
  const rating = Math.trunc(input.rating);

  if (themes.length > 0) {
    return [
      themedStrategy("preferred", rating, 100, themes),
      themedStrategy("wider", rating, 200, themes),
      themedStrategy("much_wider", rating, 400, themes),
      themedStrategy("very_wide", rating, 600, themes),
      {
        name: "themed_full_range",
        minRating: SERVER_PUZZLE_MIN_RATING,
        maxRating: SERVER_PUZZLE_MAX_RATING,
        themes
      }
    ];
  }

  return [
    unthemedStrategy("preferred", rating, 100),
    unthemedStrategy("wider", rating, 200),
    unthemedStrategy("much_wider", rating, 400),
    unthemedStrategy("very_wide", rating, 600),
    unthemedStrategy("no_themes_preferred", rating, 100),
    unthemedStrategy("no_themes_wider", rating, 200),
    unthemedStrategy("no_themes_much_wider", rating, 400),
    {
      name: "fallback",
      minRating: SERVER_PUZZLE_MIN_RATING,
      maxRating: SERVER_PUZZLE_MAX_RATING,
      themes: []
    }
  ];
}

function themedStrategy(name: string, rating: number, radius: number, themes: string[]): EloPuzzleSelectionStrategy {
  return {
    name,
    minRating: Math.max(SERVER_PUZZLE_MIN_RATING, rating - radius),
    maxRating: rating + radius,
    themes
  };
}

function unthemedStrategy(name: string, rating: number, radius: number): EloPuzzleSelectionStrategy {
  return {
    name,
    minRating: Math.max(SERVER_PUZZLE_MIN_RATING, rating - radius),
    maxRating: rating + radius,
    themes: []
  };
}

export function isServerCompatibleArrowDuelPuzzle(puzzle: Puzzle): boolean {
  const blunderMove = puzzle.solutionMoves[0];
  const bestMove = puzzle.stockfishBestMove;
  const bestEval = puzzle.stockfishEval;
  const evalAfterBlunder = puzzle.stockfishEvalAfterFirstMove;
  if (!blunderMove || !bestMove || bestEval === undefined || evalAfterBlunder === undefined) {
    return false;
  }
  if (normalizeMove(blunderMove) === normalizeMove(bestMove)) {
    return false;
  }

  const legalMoves = legalMovesFromFen(puzzle.initialFen);
  if (legalMoves.length < 2) {
    return false;
  }
  if (!legalMoves.includes(normalizeMove(blunderMove)) || !legalMoves.includes(normalizeMove(bestMove))) {
    return false;
  }

  if (evalAfterBlunder > 0) {
    return bestEval <= 60 && evalAfterBlunder - bestEval > 200;
  }
  if (evalAfterBlunder < 0) {
    return bestEval >= -60 && bestEval - evalAfterBlunder > 200;
  }
  return false;
}

function legalMovesFromFen(fen: string): string[] {
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: true }).map((move) => normalizeMove(`${move.from}${move.to}${move.promotion ?? ""}`));
  } catch {
    return [];
  }
}

function normalizeMove(move: string): string {
  return move.trim().toLowerCase();
}
