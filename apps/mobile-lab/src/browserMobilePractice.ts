import { buildPuzzlePackManifest } from "../../../packages/core/src/index.ts";
import type { PuzzlePackManifest } from "../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../packages/storage/src/memory-store.ts";
import { PracticeService } from "../../../packages/storage/src/practice-service.ts";
import { LAB_PUZZLES } from "./labPuzzles.ts";

export type MobilePuzzleSource = "bundledCore" | "familiar15" | "random1000";

const manifest: PuzzlePackManifest = buildPuzzlePackManifest(LAB_PUZZLES, {
  id: "interaction-lab",
  title: "Interaction Lab Fixtures",
  buildDate: "2026-07-18",
  source: "Deterministic synthetic positions",
  sourceLicense: "GPL-3.0-or-later",
  presolve: "Fixed lab candidates",
  licenseNote: "Development-only deterministic fixtures.",
  manifestHash: "interaction-lab-fixtures-v1",
  format: "json",
  seed: "interaction-lab-v1"
});

export function createMobilePracticeService(
  source: MobilePuzzleSource = "bundledCore"
): PracticeService {
  const service = new PracticeService(new MemoryStore());
  configureMobilePracticePuzzleSource(service, source);
  return service;
}

export function configureMobilePracticePuzzleSource(
  service: PracticeService,
  source: MobilePuzzleSource
): void {
  const puzzles = source === "familiar15" ? LAB_PUZZLES.slice(0, 3) : LAB_PUZZLES;
  service.loadFixturePuzzles(puzzles);
  service.setPuzzleSelectionScope(puzzles);
}

export function seededPuzzleCount(source: MobilePuzzleSource = "bundledCore"): number {
  return source === "familiar15" ? Math.min(3, LAB_PUZZLES.length) : LAB_PUZZLES.length;
}

export function seededUniquePositionCount(source: MobilePuzzleSource = "bundledCore"): number {
  return seededPuzzleCount(source);
}

export function getBundledCorePackManifest(): PuzzlePackManifest {
  return manifest;
}

export function shouldRandomizePuzzleSelection(source: MobilePuzzleSource): boolean {
  return source !== "familiar15";
}
