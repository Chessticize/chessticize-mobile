// Node composition for the simulated-player harness. It mirrors the mobile
// persistent composition: a migrated user SQLite store wrapped by
// PackBackedPracticeStore, a separate SQLite Tactical Profile cache, and the
// shipped calibration artifact with pack-derived options.
import { DatabaseSync } from "node:sqlite";
import {
  assertValidTacticalProfileCalibrationArtifact,
  type Puzzle,
  type PuzzlePackManifest,
  type TacticalProfileCalibrationArtifact
} from "../../../core/src/index.ts";
import { MemoryStore } from "../memory-store.ts";
import { PackBackedPracticeStore } from "../pack-backed-practice-store.ts";
import { PracticeService } from "../practice-service.ts";
import type { PuzzleSource } from "../puzzle-source.ts";
import { NodeSqliteDatabase, SQLiteStore } from "../sqlite-store.ts";
import { SQLiteTacticalProfileRepository } from "../tactical-profile-repository.ts";
import {
  TacticalProfileService,
  tacticalProfilePackOptions
} from "../tactical-profile-service.ts";

export type SimulationWorld = {
  practice: PracticeService;
  userStore: SQLiteStore;
  close(): void;
};

export type SimulationWorldInput = {
  manifest: PuzzlePackManifest;
  calibration: unknown;
  /** Read-only pack source. Defaults to a MemoryStore seeded with `packPuzzles`. */
  packSource?: PuzzleSource;
  packPuzzles?: readonly Puzzle[];
};

export function createSimulationWorld(input: SimulationWorldInput): SimulationWorld {
  const calibration = shippedCalibration(input.manifest, input.calibration);
  const packSource = input.packSource ?? memoryPackSource(input.packPuzzles);
  const userStore = new SQLiteStore(":memory:");
  const profileDb = new DatabaseSync(":memory:");
  try {
    userStore.migrate();
    const repository = new SQLiteTacticalProfileRepository(new NodeSqliteDatabase(profileDb));
    repository.migrate();
    const store = new PackBackedPracticeStore(userStore, packSource);
    const profile = new TacticalProfileService({
      progressStore: store,
      puzzleSource: packSource,
      repository,
      calibration,
      ...tacticalProfilePackOptions(input.manifest, calibration)
    });
    const practice = new PracticeService(store, profile);
    return {
      practice,
      userStore,
      close: () => {
        userStore.close();
        profileDb.close();
      }
    };
  } catch (error) {
    userStore.close();
    profileDb.close();
    throw error;
  }
}

/**
 * Accepts the checked-in artifact only when it matches the pack's feature
 * identity, like the app; a mismatch would silently disable both families and
 * make every detection test vacuous.
 */
function shippedCalibration(
  manifest: PuzzlePackManifest,
  candidate: unknown
): TacticalProfileCalibrationArtifact {
  assertValidTacticalProfileCalibrationArtifact(candidate);
  const packFeatureHash = manifest.tacticalAnalysis?.featureHash;
  if (candidate.packFeatureHash !== packFeatureHash) {
    throw new Error(
      `Calibration ${candidate.calibrationId} does not match the pack feature identity`
    );
  }
  return candidate;
}

function memoryPackSource(puzzles: readonly Puzzle[] | undefined): MemoryStore {
  if (!puzzles || puzzles.length === 0) {
    throw new Error("Simulation world needs a pack source or pack puzzles");
  }
  const source = new MemoryStore();
  source.seedPuzzles([...puzzles]);
  return source;
}
