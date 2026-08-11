// Mobile platform storage composition belongs outside the backend/domain seam.
import {
  tacticalThemeFrequencyAtRating,
  tacticalThemeInventoryUpperBound,
  type Puzzle,
  type PuzzlePackManifest,
  type SprintMode
} from "../../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../../packages/storage/src/memory-store.ts";
import { PackBackedPracticeStore } from "../../../../packages/storage/src/pack-backed-practice-store.ts";
import { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import { selectUniquePuzzlesForRatingBands } from "../../../../packages/storage/src/puzzle-selection.ts";
import {
  MemoryTacticalProfileRepository,
  type TacticalProfileRepository
} from "../../../../packages/storage/src/tactical-profile-repository.ts";
import { TacticalProfileService } from "../../../../packages/storage/src/tactical-profile-service.ts";
import type {
  PuzzleSource,
  RatingBandPuzzleSelection,
  RatingBandPuzzleSelectionInput,
  SurvivalPuzzleBatch,
  SurvivalPuzzleBatchInput
} from "../../../../packages/storage/src/puzzle-source.ts";
import {
  MOBILE_DATABASE_LAYOUT,
  bundledPuzzlePackDatabaseName,
  obsoleteBundledPuzzlePackDatabaseNames
} from "../backend/mobileDatabaseLayout.ts";
import { productionTacticalProfileCalibration } from "../backend/tacticalProfileCalibration.ts";

const bundledCoreManifest = require("../../../../fixtures/puzzles/bundled-core-pack.manifest.json") as PuzzlePackManifest;
const regressionPuzzles = require("../../../../fixtures/puzzles/presolved-1000.json") as Puzzle[];
const familiar15Manifest = require("../../../../fixtures/puzzles/familiar-15-e2e.manifest.json") as {
  puzzles: Array<{ arrowDuelFixture?: Puzzle; fixture?: Puzzle; id: string }>;
  sourceFixture: string;
};
const bundledCorePackVersion = requiredBundledCorePackVersion(bundledCoreManifest);
const bundledCorePackBytes = requiredBundledCorePackBytes(bundledCoreManifest);
const bundledCorePackDatabaseName = bundledPuzzlePackDatabaseName(bundledCorePackVersion);
const obsoleteBundledCorePackDatabaseNames = obsoleteBundledPuzzlePackDatabaseNames(
  bundledCorePackVersion
);

export type MobilePuzzleSource = "bundledCore" | "familiar15" | "random1000";
const DEFAULT_PUZZLE_SOURCE: MobilePuzzleSource = "bundledCore";
const BUNDLED_CORE_PACK_OPTIONS = {
  arrowDuelEligibility: bundledCoreManifest.arrowDuelCount === bundledCoreManifest.puzzleCount
    ? "all"
    : "all_non_promotion"
} as const;

let persistentPracticeService: PracticeService | undefined;
let persistentProgressDatabasePath: string | undefined;
const seededPuzzleSources = new WeakMap<PracticeService, Set<string>>();
const packBackedServices = new WeakSet<PracticeService>();
let persistentPracticeServicePromise: Promise<PracticeService> | undefined;

export function createMobilePracticeService(source: MobilePuzzleSource = DEFAULT_PUZZLE_SOURCE): PracticeService {
  const store = new MemoryStore();
  const service = new PracticeService(store, createTacticalProfileService(
    store,
    store,
    new MemoryTacticalProfileRepository()
  ), survivalPracticeServiceOptions());
  configureMobilePracticePuzzleSource(service, source);
  return service;
}

export async function createPersistentMobilePracticeService(): Promise<PracticeService> {
  if (persistentPracticeService) {
    return persistentPracticeService;
  }
  const syncService = createPersistentMobilePracticeServiceSync();
  if (syncService) {
    return syncService;
  }
  if (persistentPracticeServicePromise) {
    return persistentPracticeServicePromise;
  }

  persistentPracticeServicePromise = createPersistentMobilePracticeServiceImpl().catch((error) => {
    persistentPracticeServicePromise = undefined;
    throw error;
  });
  persistentPracticeService = await persistentPracticeServicePromise;
  return persistentPracticeService;
}

export function createPersistentMobilePracticeServiceSync(): PracticeService | undefined {
  if (persistentPracticeService) {
    return persistentPracticeService;
  }
  if (persistentPracticeServicePromise) {
    return undefined;
  }

  const { DeviceSQLiteStore } = require("./deviceSQLiteStore.ts") as typeof import("./deviceSQLiteStore.ts");
  if (!DeviceSQLiteStore.canOpenBundledReadOnlyPuzzlePack()) {
    return undefined;
  }
  const userStore = DeviceSQLiteStore.open(MOBILE_DATABASE_LAYOUT.progressDatabaseName);
  userStore.migrate();
  return createPersistentService(
    userStore,
    new LazyPuzzleSource(() => {
      const source = DeviceSQLiteStore.openBundledReadOnlyPuzzlePack(
        bundledCorePackDatabaseName,
        BUNDLED_CORE_PACK_OPTIONS,
        obsoleteBundledCorePackDatabaseNames
      );
      if (!source) {
        throw new Error("Bundled puzzle pack is unavailable");
      }
      return source;
    }),
    openTacticalProfileRepositoryWithFallback(
      () => DeviceSQLiteStore.openTacticalProfileRepository()
    )
  );
}

async function createPersistentMobilePracticeServiceImpl(): Promise<PracticeService> {
  if (persistentPracticeService) {
    return persistentPracticeService;
  }

  const { DeviceSQLiteStore } = require("./deviceSQLiteStore.ts") as typeof import("./deviceSQLiteStore.ts");
  const userStore = DeviceSQLiteStore.open(MOBILE_DATABASE_LAYOUT.progressDatabaseName);
  userStore.migrate();
  const packSource = await DeviceSQLiteStore.openReadOnlyPuzzlePack(
    bundledCorePackDatabaseName,
    bundledCorePackBytes,
    BUNDLED_CORE_PACK_OPTIONS,
    obsoleteBundledCorePackDatabaseNames
  );
  return createPersistentService(
    userStore,
    packSource,
    openTacticalProfileRepositoryWithFallback(
      () => DeviceSQLiteStore.openTacticalProfileRepository()
    )
  );
}

function requiredBundledCorePackVersion(manifest: PuzzlePackManifest): number {
  if (!Number.isSafeInteger(manifest.packVersion) || (manifest.packVersion ?? 0) < 1) {
    throw new Error(
      `Bundled Core Pack manifest must declare a positive packVersion; received ${String(manifest.packVersion)}`
    );
  }
  return manifest.packVersion as number;
}

function requiredBundledCorePackBytes(manifest: PuzzlePackManifest): number {
  if (!Number.isSafeInteger(manifest.packFileBytes) || (manifest.packFileBytes ?? 0) < 1) {
    throw new Error(
      `Bundled Core Pack manifest must declare a positive integer packFileBytes; received ${String(manifest.packFileBytes)}`
    );
  }
  return manifest.packFileBytes as number;
}

export function openTacticalProfileRepositoryWithFallback(
  openRepository: () => TacticalProfileRepository
): TacticalProfileRepository {
  try {
    return openRepository();
  } catch {
    return new MemoryTacticalProfileRepository();
  }
}

function createPersistentService(
  userStore: InstanceType<typeof import("./deviceSQLiteStore.ts").DeviceSQLiteStore>,
  packSource: PuzzleSource,
  tacticalProfileRepository: TacticalProfileRepository
): PracticeService {
  const store = new PackBackedPracticeStore(userStore, packSource);
  const service = new PracticeService(
    store,
    createTacticalProfileService(store, packSource, tacticalProfileRepository),
    survivalPracticeServiceOptions()
  );
  persistentProgressDatabasePath = userStore.databasePath();
  packBackedServices.add(service);
  configureMobilePracticePuzzleSource(service, DEFAULT_PUZZLE_SOURCE);
  persistentPracticeService = service;
  return service;
}

function survivalPracticeServiceOptions(): {
  survivalPackVersion: number;
  survivalPackHash: string;
} {
  return {
    survivalPackVersion: bundledCorePackVersion,
    survivalPackHash: bundledCoreManifest.packFileHash ?? bundledCoreManifest.manifestHash
  };
}

export function getPersistentMobileProgressDatabasePath(): string | undefined {
  return persistentProgressDatabasePath;
}

class LazyPuzzleSource implements PuzzleSource {
  private readonly openSource: () => PuzzleSource;
  private source: PuzzleSource | undefined;

  constructor(openSource: () => PuzzleSource) {
    this.openSource = openSource;
  }

  countPuzzles(): number {
    return this.current.countPuzzles();
  }

  getPuzzle(id: string): Puzzle | undefined {
    return this.current.getPuzzle(id);
  }

  getPuzzles(ids: readonly string[]): Puzzle[] {
    return this.current.getPuzzles?.(ids) ??
      ids.flatMap((id) => {
        const puzzle = this.current.getPuzzle(id);
        return puzzle ? [puzzle] : [];
      });
  }

  selectPuzzles(filter: Parameters<PuzzleSource["selectPuzzles"]>[0]): Puzzle[] {
    return this.current.selectPuzzles(filter);
  }

  countSurvivalPuzzles(
    input: Pick<SurvivalPuzzleBatchInput, "challengeType" | "level">
  ): number {
    return this.current.countSurvivalPuzzles(input);
  }

  selectSurvivalPuzzleBatch(input: SurvivalPuzzleBatchInput): SurvivalPuzzleBatch {
    return this.current.selectSurvivalPuzzleBatch(input);
  }

  selectPuzzlesForRatingBands(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[] {
    const source = this.current;
    if (source.selectPuzzlesForRatingBands) {
      return source.selectPuzzlesForRatingBands(input);
    }
    const widestHalfWidth = Math.max(...input.halfWidths, 0);
    const candidates = source.selectPuzzles({
      ...input.filter,
      minRating: Math.max(0, input.ratingAnchor - widestHalfWidth),
      maxRating: input.ratingAnchor + widestHalfWidth,
      preferredRating: input.ratingAnchor,
      limit: Math.max(input.filter.limit * 50, 200)
    });
    return selectUniquePuzzlesForRatingBands(candidates, input);
  }

  selectPuzzlesExcludingThemes(
    filter: Parameters<PuzzleSource["selectPuzzles"]>[0],
    excludedThemes: readonly string[]
  ): Puzzle[] {
    const source = this.current;
    if (source.selectPuzzlesExcludingThemes) {
      return source.selectPuzzlesExcludingThemes(filter, excludedThemes);
    }
    const excluded = new Set(excludedThemes);
    return source.selectPuzzles({ ...filter, limit: Math.max(filter.limit * 20, 200) })
      .filter((puzzle) => !puzzle.themes.some((theme) => excluded.has(theme)))
      .slice(0, filter.limit);
  }

  private get current(): PuzzleSource {
    this.source ??= this.openSource();
    return this.source;
  }
}

function createTacticalProfileService(
  progressStore: MemoryStore | PackBackedPracticeStore,
  puzzleSource: PuzzleSource,
  repository: ConstructorParameters<typeof TacticalProfileService>[0]["repository"]
): TacticalProfileService {
  const calibration = productionTacticalProfileCalibration(bundledCoreManifest);
  return new TacticalProfileService({
    progressStore,
    puzzleSource,
    repository,
    calibration,
    naturalFrequency: bundledNaturalFrequency(),
    naturalFrequencyForRating: (taskFamily, rating) =>
      tacticalThemeFrequencyAtRating(
        bundledCoreManifest,
        taskFamily,
        rating
      ),
    inventoryUpperBound: (taskFamily, minRating, maxRating, themes) =>
      tacticalThemeInventoryUpperBound(
        bundledCoreManifest,
        taskFamily,
        minRating,
        maxRating,
        themes
      )?.availableByTheme,
    ...(calibration.focusedRun === undefined
      ? {}
      : { focusedRunPolicy: calibration.focusedRun })
  });
}

function bundledNaturalFrequency() {
  const frequencies = Object.fromEntries(
    Object.entries(bundledCoreManifest.themeCounts ?? {}).map(([theme, count]) => [
      theme,
      count / Math.max(1, bundledCoreManifest.puzzleCount)
    ])
  );
  return {
    line: frequencies,
    arrow_duel: frequencies
  };
}

export function configureMobilePracticePuzzleSource(
  service: PracticeService,
  source: MobilePuzzleSource,
  mode: SprintMode = "standard"
): void {
  if (source === "bundledCore" && packBackedServices.has(service)) {
    service.setPuzzleSelectionScopeIds(undefined);
    return;
  }
  const puzzles = puzzlesForSource(source, mode);
  const seededSources = seededPuzzleSources.get(service) ?? new Set<string>();
  const sourceKey = source === "familiar15" ? `${source}:${mode}` : source;
  if (!seededSources.has(sourceKey)) {
    service.loadFixturePuzzles(puzzles);
    seededSources.add(sourceKey);
    seededPuzzleSources.set(service, seededSources);
  }
  service.setPuzzleSelectionScopeIds(puzzles.map((puzzle) => puzzle.id));
}

export function seededPuzzleCount(source: MobilePuzzleSource = DEFAULT_PUZZLE_SOURCE): number {
  if (source === "bundledCore") {
    return bundledCoreManifest.puzzleCount;
  }
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

function puzzlesForSource(source: MobilePuzzleSource, mode: SprintMode = "standard"): Puzzle[] {
  if (source === "bundledCore") {
    return bundledCoreFixturePuzzles();
  }
  if (source === "familiar15") {
    return familiarPuzzles(mode);
  }
  return regressionPuzzles;
}

function bundledCoreFixturePuzzles(): Puzzle[] {
  return require("../../../../fixtures/puzzles/bundled-core-pack.json") as Puzzle[];
}

function familiarPuzzles(mode: SprintMode): Puzzle[] {
  const byId = new Map(regressionPuzzles.map((puzzle) => [puzzle.id, puzzle]));
  return familiar15Manifest.puzzles.map((entry) => {
    const puzzle = mode === "arrow_duel"
      ? entry.arrowDuelFixture ?? entry.fixture ?? byId.get(entry.id)
      : entry.fixture ?? byId.get(entry.id);
    if (puzzle === undefined) {
      throw new Error(
        `Familiar 15 manifest puzzle ${entry.id} is missing from ${familiar15Manifest.sourceFixture}`
      );
    }
    return puzzle;
  });
}

function canonicalPositionFen(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) {
    return fen.trim();
  }
  return fields.slice(0, 4).join(" ");
}
