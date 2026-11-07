// The personal solve baseline ships under a new calibration identity. Existing
// users must not re-earn evidence: derived cells rebuild from canonical
// history already stored in SQLite.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Puzzle,
  PuzzlePackManifest,
  TacticalProfileCalibrationArtifact
} from "../../core/src/index.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { PackBackedPracticeStore } from "../src/pack-backed-practice-store.ts";
import { PracticeService } from "../src/practice-service.ts";
import { playSimulatedHistoryScenario } from "../src/simulation/scenarios.ts";
import { createSimulationClock } from "../src/simulation/simulated-player.ts";
import { NodeSqliteDatabase, SQLiteStore } from "../src/sqlite-store.ts";
import { SQLiteTacticalProfileRepository } from "../src/tactical-profile-repository.ts";
import {
  TacticalProfileService,
  tacticalProfilePackOptions
} from "../src/tactical-profile-service.ts";
import { SIMULATION_START } from "./simulation-fixtures.ts";

const root = resolve(import.meta.dirname, "../../..");
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const manifest = readJson<PuzzlePackManifest>("fixtures/puzzles/bundled-core-pack.manifest.json");
const shipped = readJson<TacticalProfileCalibrationArtifact>(
  "config/tactical-profile-calibration-artifact-v1.json"
);
const packPuzzles = readJson<Puzzle[]>("fixtures/puzzles/bundled-core-pack.json");

/** The artifact identity that shipped before the personal solve baseline. */
function previousArtifact(): TacticalProfileCalibrationArtifact {
  const previous = structuredClone(shipped) as TacticalProfileCalibrationArtifact;
  previous.calibrationId = "tactical-profile-v1-provisional-personal-speed";
  for (const family of Object.values(previous.families)) {
    if (family.status !== "unavailable") {
      delete family.solve.personalBaseline;
      family.solve.themePriorSdRating = 100;
    }
  }
  return previous;
}

test("the shipped personal solve baseline is provisional and has a new calibration identity", () => {
  assert.equal(shipped.calibrationId, "tactical-profile-v1-provisional-personal-solve-speed");
  assert.equal(shipped.provenance.corpusHash, null);
  assert.equal(shipped.provenance.reportHash, null);
  assert.equal(shipped.provenance.representativeOwnerApproved, false);
  for (const family of Object.values(shipped.families)) {
    assert.ok(family.status === "provisional", "the artifact stays provisional");
    assert.ok(family.solve.personalBaseline);
  }
});

test("a calibration identity change rebuilds personal solve cells from canonical SQLite history", () => {
  const userStore = new SQLiteStore(":memory:");
  const profileDb = new DatabaseSync(":memory:");
  try {
    userStore.migrate();
    const repository = new SQLiteTacticalProfileRepository(new NodeSqliteDatabase(profileDb));
    repository.migrate();
    const packSource = new MemoryStore();
    packSource.seedPuzzles(packPuzzles);
    const store = new PackBackedPracticeStore(userStore, packSource);
    const profileFor = (calibration: TacticalProfileCalibrationArtifact) =>
      new TacticalProfileService({
        progressStore: store,
        puzzleSource: packSource,
        repository,
        calibration,
        ...tacticalProfilePackOptions(manifest, calibration)
      });
    const previous = previousArtifact();
    const clock = createSimulationClock(Date.parse(SIMULATION_START));
    playSimulatedHistoryScenario({
      practice: new PracticeService(store, profileFor(previous)),
      clock,
      scenario: "weak-fork-solve",
      seed: "personal-solve-rebuild",
      plan: { arrowDuelShare: 0 }
    });
    const attemptCount = userStore.listAttempts({}).length;
    const before = profileFor(previous).getSnapshot(clock.now());
    assert.equal(
      before.evaluation.signals.some((signal) => signal.id === "line:fork"),
      false,
      "the previous fixed 50% baseline cannot see the weak fork theme"
    );
    const previousCells = repository.listDailyCells(previous);
    assert.ok(previousCells.length > 0);
    assert.ok(previousCells.every((cell) => cell.solveTheme.length === 0));

    // A fresh app launch with the new artifact on the same SQLite files.
    const rebuilt = profileFor(shipped);
    const after = rebuilt.getSnapshot(clock.now());

    assert.equal(after.phase, "ready");
    const fork = after.evaluation.signals.find((signal) => signal.id === "line:fork");
    assert.equal(fork?.status, "recommended");
    assert.equal(fork?.reason, "solve_rate");
    const cells = repository.listDailyCells(shipped);
    assert.ok(cells.some((cell) => cell.solveTheme.length > 0));
    assert.ok(cells.some((cell) => cell.solveBaseline.length > 0));
    assert.deepEqual(
      new Set(cells.map((cell) => cell.completedDay)),
      new Set(previousCells.map((cell) => cell.completedDay))
    );
    assert.throws(() => repository.listDailyCells(previous));
    // Canonical history is untouched; nothing had to be re-earned.
    assert.equal(userStore.listAttempts({}).length, attemptCount);
  } finally {
    userStore.close();
    profileDb.close();
  }
});
