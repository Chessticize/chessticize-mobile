import type { Puzzle } from "../../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../../packages/storage/src/practice-service.ts";

const fixturePuzzles = require("../../../../fixtures/puzzles/presolved-sample.json") as Puzzle[];

export function createMobilePracticeService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(fixturePuzzles);
  return new PracticeService(store);
}

export function seededPuzzleCount(): number {
  return fixturePuzzles.length;
}
