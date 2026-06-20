import type { Puzzle } from "../../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../../packages/storage/src/practice-service.ts";

const fixturePuzzles = require("../../../../fixtures/puzzles/presolved-sample.json") as Puzzle[];
const DEMO_PUZZLE_TARGET = 48;
const expandedFixturePuzzles = expandFixturePuzzles(fixturePuzzles, DEMO_PUZZLE_TARGET);

export function createMobilePracticeService(): PracticeService {
  const store = new MemoryStore();
  store.seedPuzzles(expandedFixturePuzzles);
  return new PracticeService(store);
}

export function seededPuzzleCount(): number {
  return expandedFixturePuzzles.length;
}

function expandFixturePuzzles(puzzles: Puzzle[], targetCount: number): Puzzle[] {
  if (puzzles.length >= targetCount) {
    return puzzles;
  }

  const expanded = [...puzzles];
  let copyIndex = 1;
  while (expanded.length < targetCount) {
    for (const puzzle of puzzles) {
      if (expanded.length >= targetCount) {
        break;
      }
      expanded.push({
        ...puzzle,
        id: `${puzzle.id}~demo-${copyIndex.toString().padStart(2, "0")}`
      });
    }
    copyIndex += 1;
  }
  return expanded;
}
