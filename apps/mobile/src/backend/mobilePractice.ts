import type { Puzzle, PuzzlePackManifest } from "../../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../../packages/storage/src/practice-service.ts";

const bundledCorePuzzles = require("../../../../fixtures/puzzles/bundled-core-pack.json") as Puzzle[];
const bundledCoreManifest = require("../../../../fixtures/puzzles/bundled-core-pack.manifest.json") as PuzzlePackManifest;
const regressionPuzzles = require("../../../../fixtures/puzzles/presolved-1000.json") as Puzzle[];

export type MobilePuzzleSource = "bundledCore" | "familiar15" | "random1000";
const DEFAULT_PUZZLE_SOURCE: MobilePuzzleSource = "bundledCore";

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

const persistentPracticeServices = new Map<MobilePuzzleSource, PracticeService>();

export function createMobilePracticeService(source: MobilePuzzleSource = DEFAULT_PUZZLE_SOURCE): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(puzzlesForSource(source));
  return new PracticeService(store);
}

export function createPersistentMobilePracticeService(source: MobilePuzzleSource = DEFAULT_PUZZLE_SOURCE): PracticeService {
  const existing = persistentPracticeServices.get(source);
  if (existing) {
    return existing;
  }

  const { DeviceSQLiteStore } = require("./deviceSQLiteStore.ts") as typeof import("./deviceSQLiteStore.ts");
  const store = DeviceSQLiteStore.open(databaseNameForSource(source));
  store.migrate();
  if (store.countPuzzles() === 0) {
    store.seedPuzzles(puzzlesForSource(source));
  }
  const service = new PracticeService(store);
  persistentPracticeServices.set(source, service);
  return service;
}

export function seededPuzzleCount(source: MobilePuzzleSource = DEFAULT_PUZZLE_SOURCE): number {
  return puzzlesForSource(source).length;
}

export function seededUniquePositionCount(source: MobilePuzzleSource = DEFAULT_PUZZLE_SOURCE): number {
  return new Set(puzzlesForSource(source).map((puzzle) => canonicalPositionFen(puzzle.initialFen))).size;
}

export function getBundledCorePackManifest(): PuzzlePackManifest {
  return bundledCoreManifest;
}

export function shouldRandomizePuzzleSelection(source: MobilePuzzleSource): boolean {
  return source !== "familiar15";
}

function puzzlesForSource(source: MobilePuzzleSource): Puzzle[] {
  if (source === "bundledCore") {
    return bundledCorePuzzles;
  }
  if (source === "familiar15") {
    return familiarPuzzles();
  }
  return regressionPuzzles;
}

function databaseNameForSource(source: MobilePuzzleSource): string {
  return source === DEFAULT_PUZZLE_SOURCE
    ? "chessticize-mobile.sqlite"
    : `chessticize-mobile-${source}.sqlite`;
}

function familiarPuzzles(): Puzzle[] {
  const byId = new Map(regressionPuzzles.map((puzzle) => [puzzle.id, puzzle]));
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
