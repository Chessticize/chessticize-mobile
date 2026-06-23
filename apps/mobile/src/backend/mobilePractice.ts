import type { Puzzle } from "../../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../../packages/storage/src/practice-service.ts";

const fixturePuzzles = require("../../../../fixtures/puzzles/presolved-1000.json") as Puzzle[];

export type MobilePuzzleSource = "familiar15" | "random1000";

const FAMILIAR_PUZZLE_IDS = [
  "000hf",
  "00Kbj",
  "00VoA",
  "07KI8",
  "04wsf",
  "08Hmx",
  "0AqXs",
  "0DR07",
  "01gEg",
  "00tgU",
  "04QUG",
  "063T7",
  "00qk4",
  "02nKr",
  "04Phf"
] as const;

export function createMobilePracticeService(source: MobilePuzzleSource = "familiar15"): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(puzzlesForSource(source));
  return new PracticeService(store);
}

export function seededPuzzleCount(source: MobilePuzzleSource = "familiar15"): number {
  return puzzlesForSource(source).length;
}

export function seededUniquePositionCount(source: MobilePuzzleSource = "familiar15"): number {
  return new Set(puzzlesForSource(source).map((puzzle) => canonicalPositionFen(puzzle.initialFen))).size;
}

export function shouldRandomizePuzzleSelection(source: MobilePuzzleSource): boolean {
  return source === "random1000";
}

function puzzlesForSource(source: MobilePuzzleSource): Puzzle[] {
  if (source === "familiar15") {
    return familiarPuzzles();
  }
  return fixturePuzzles;
}

function familiarPuzzles(): Puzzle[] {
  const byId = new Map(fixturePuzzles.map((puzzle) => [puzzle.id, puzzle]));
  const classicPuzzles = FAMILIAR_PUZZLE_IDS.slice(0, 14).flatMap((id) => {
    const puzzle = byId.get(id);
    return puzzle === undefined ? [] : [puzzle];
  });
  return [DUAL_MATE_IN_ONE_SAMPLE_PUZZLE, ...classicPuzzles];
}

function canonicalPositionFen(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) {
    return fen.trim();
  }
  return fields.slice(0, 4).join(" ");
}

const DUAL_MATE_IN_ONE_SAMPLE_PUZZLE: Puzzle = {
  id: "test-dual-mate-in-one",
  initialFen: "8/8/8/8/8/8/k1Q5/2K5 b - - 0 1",
  solutionMoves: ["a2a1", "c2a4"],
  rating: 800,
  themes: ["mate", "short", "regression", "multipleMate"],
  source: "synthetic",
  stockfishBestMove: "c2a4"
};
