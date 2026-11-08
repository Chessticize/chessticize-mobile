// Mobile platform storage composition belongs outside the backend/domain seam.
import {
  defaultSprintConfig,
  type Puzzle,
  type PuzzlePackManifest,
  type SprintMode,
  type SprintState
} from "../../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../../packages/storage/src/memory-store.ts";
import { PackBackedPracticeStore } from "../../../../packages/storage/src/pack-backed-practice-store.ts";
import { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type { PracticeStore } from "../../../../packages/storage/src/practice-store.ts";
import { selectUniquePuzzlesForRatingBands } from "../../../../packages/storage/src/puzzle-selection.ts";
import {
  MemoryTacticalProfileRepository,
  type TacticalProfileRepository
} from "../../../../packages/storage/src/tactical-profile-repository.ts";
import {
  TacticalProfileService,
  tacticalProfilePackOptions
} from "../../../../packages/storage/src/tactical-profile-service.ts";
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
import { arePracticeTestControlsEnabled } from "../releaseConfig.ts";
import type { MobileTestControlCapabilities } from "./mobilePlatformCapabilities.ts";

declare const __DEV__: boolean;

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
  const service = composePackBackedMobilePracticeService(
    userStore,
    packSource,
    tacticalProfileRepository
  );
  persistentProgressDatabasePath = userStore.databasePath();
  persistentPracticeService = service;
  return service;
}

/**
 * The production service composition: a user progress store wrapped by the
 * read-only Core Pack. Exposed so tests can run the app's service against the
 * real pack with an in-memory progress store instead of the device database.
 */
export function composePackBackedMobilePracticeService(
  userStore: PracticeStore,
  packSource: PuzzleSource,
  tacticalProfileRepository: TacticalProfileRepository
): PracticeService {
  const store = new PackBackedPracticeStore(userStore, packSource);
  const service = new PracticeService(
    store,
    createTacticalProfileService(store, packSource, tacticalProfileRepository),
    survivalPracticeServiceOptions()
  );
  packBackedServices.add(service);
  configureMobilePracticePuzzleSource(service, DEFAULT_PUZZLE_SOURCE);
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
    ...tacticalProfilePackOptions(bundledCoreManifest, calibration)
  });
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

export function injectMateIn2FocusedRun(
  service: PracticeService,
  now = new Date().toISOString()
): SprintState {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error(`Mate in 2 Focused Run fixture received invalid time: ${now}`);
  }
  const fixtureId = `mate-in-2-focus-${Math.trunc(nowMs)}`;
  const discoveryStartedAtMs = nowMs - 13 * 24 * 60 * 60 * 1_000;
  const fixturePuzzles = bundledCoreFixturePuzzles();
  const mateIn2CandidateIds = fixturePuzzles
    .filter((puzzle) =>
      puzzle.themes.includes("mateIn2") &&
      puzzle.rating >= 850 &&
      puzzle.rating <= 1_000 &&
      puzzle.solutionMoves.length >= 2
    )
    .map((puzzle) => puzzle.id);
  const mixedCandidateIds = fixturePuzzles
    .filter((puzzle) =>
      !puzzle.themes.includes("mateIn2") &&
      puzzle.rating >= 850 &&
      puzzle.rating <= 1_000 &&
      puzzle.solutionMoves.length >= 2
    )
    .slice(0, 1_000)
    .map((puzzle) => puzzle.id);
  let focusedCandidates: Puzzle[] = [];
  let mixedCandidates: Puzzle[] = [];
  let discoverySessionId: string | undefined;
  try {
    service.setPuzzleSelectionScopeIds(mateIn2CandidateIds);
    const focusedDiscovery = service.startSprint({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 27,
      maxMistakes: 27,
      themes: ["mateIn2"],
      minRating: 850,
      maxRating: 1_000,
      puzzleSelectionSeed: "mate-in-2-focused-run-candidates-v1"
    }, new Date(discoveryStartedAtMs).toISOString());
    discoverySessionId = focusedDiscovery.id;
    focusedCandidates = [...focusedDiscovery.puzzles];
    service.abandonSprint(new Date(discoveryStartedAtMs + 1_000).toISOString());
    discoverySessionId = undefined;

    service.setPuzzleSelectionScopeIds(mixedCandidateIds);
    const mixedDiscovery = service.startSprint({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 27,
      maxMistakes: 27,
      minRating: 850,
      maxRating: 1_000,
      puzzleSelectionSeed: "mate-in-2-focused-run-mixed-controls-v1"
    }, new Date(discoveryStartedAtMs + 2_000).toISOString());
    discoverySessionId = mixedDiscovery.id;
    mixedCandidates = [...mixedDiscovery.puzzles];
    service.abandonSprint(new Date(discoveryStartedAtMs + 3_000).toISOString());
    discoverySessionId = undefined;
  } finally {
    const active = service.getActiveSprint();
    if (
      active !== undefined &&
      active.id === discoverySessionId &&
      (active.status === "active" || active.status === "paused")
    ) {
      service.abandonSprint(new Date(discoveryStartedAtMs + 4_000).toISOString());
    }
    configureMobilePracticePuzzleSource(service, DEFAULT_PUZZLE_SOURCE);
  }

  const evidencePuzzles = focusedCandidates.slice(0, 12).map((puzzle) => ({
    ...puzzle,
    themes: ["mateIn2"]
  }));
  // The solve head compares a theme with the player's own other attempts, so
  // the fixture also records solved mixed controls beside the missed Mate in 2
  // evidence. They are distinct from the mixed puzzles the Run itself uses.
  const controlPuzzles = mixedCandidates.slice(15, 39);
  if (
    evidencePuzzles.length < 12 ||
    focusedCandidates.length < 27 ||
    mixedCandidates.length < 15 ||
    controlPuzzles.length < 24
  ) {
    throw new Error(
      "Mate in 2 Focused Run fixture needs 27 focused and 39 mixed pack-backed puzzles"
    );
  }

  service.loadFixturePuzzles(evidencePuzzles);
  const exported = service.exportLocalData();
  const config = defaultSprintConfig("standard");
  const sprintSessions: typeof exported.sprintSessions = [];
  const attempts: typeof exported.attempts = [];

  for (let sessionIndex = 0; sessionIndex < 3; sessionIndex += 1) {
    const completedAt = new Date(
      nowMs - (12 - sessionIndex * 4) * 24 * 60 * 60 * 1_000
    ).toISOString();
    const startedAt = new Date(Date.parse(completedAt) - 4 * 60 * 1_000).toISOString();
    const sessionId = `${fixtureId}-session-${sessionIndex}`;
    sprintSessions.push({
      id: sessionId,
      mode: "standard",
      ratingKey: config.ratingKey,
      ratingGeneration: 0,
      startedAt,
      completedAt,
      status: "failed",
      correctCount: 8,
      mistakeCount: 4,
      ratingBefore: 925,
      ratingAfter: 925,
      config
    });
    for (let offset = 0; offset < 8; offset += 1) {
      const puzzle = controlPuzzles[sessionIndex * 8 + offset];
      if (!puzzle) {
        throw new Error("Mate in 2 Focused Run fixture controls are incomplete");
      }
      const expectedMove = puzzle.solutionMoves[1] ?? puzzle.solutionMoves[0] ?? "a1a2";
      attempts.push({
        id: `${fixtureId}-control-${sessionIndex * 8 + offset}`,
        source: "sprint",
        sessionId,
        puzzleId: puzzle.id,
        mode: "standard",
        ratingKey: config.ratingKey,
        result: "correct",
        submittedMove: expectedMove,
        expectedMove,
        startedAt: completedAt,
        completedAt,
        elapsedMs: 10_000,
        ratingBefore: 925
      });
    }
    for (let offset = 0; offset < 4; offset += 1) {
      const puzzle = evidencePuzzles[sessionIndex * 4 + offset];
      if (!puzzle) {
        throw new Error("Mate in 2 Focused Run fixture evidence is incomplete");
      }
      attempts.push({
        id: `${fixtureId}-attempt-${sessionIndex * 4 + offset}`,
        source: "sprint",
        sessionId,
        puzzleId: puzzle.id,
        mode: "standard",
        ratingKey: config.ratingKey,
        result: "wrong",
        submittedMove: "a1a2",
        expectedMove: puzzle.solutionMoves[1] ?? puzzle.solutionMoves[0] ?? "a1a2",
        startedAt: completedAt,
        completedAt,
        elapsedMs: 10_000,
        ratingBefore: 925
      });
    }
  }

  const currentRating = service.getRating(config.ratingKey);
  service.importLocalData({
    ...exported,
    ratings: [
      ...exported.ratings.filter((rating) => rating.key !== config.ratingKey),
      {
        ...currentRating,
        rating: 925,
        ratingDeviation: 80,
        volatility: 0.06,
        games: Math.max(12, currentRating.games)
      }
    ],
    attempts: [...exported.attempts, ...attempts],
    sprintSessions: [...exported.sprintSessions, ...sprintSessions]
  });
  service.saveSettings({
    ...service.getSettings(),
    sync: {
      iCloudEnabled: false
    },
    sprintGuides: {
      ...service.getSettings().sprintGuides,
      rulesSeen: true,
      activeSessionSeen: true,
      focusedRunSeen: true
    }
  });
  const prepared = service.prepareFocusedRun("line", now, fixtureId);
  if (prepared.status !== "ready") {
    throw new Error(`Mate in 2 Focused Run fixture is unavailable: ${prepared.reason}`);
  }
  const focusedPuzzleCount = prepared.prepared.plan.reasons.reduce(
    (count, reason) => count + reason.count,
    0
  );
  const mixedPuzzleCount = prepared.prepared.plan.mixedControlCount;
  const deterministicPuzzles = weaveFocusedRunFixturePuzzles(
    focusedCandidates.slice(12, 12 + focusedPuzzleCount),
    mixedCandidates.slice(0, mixedPuzzleCount)
  );
  if (deterministicPuzzles.length !== prepared.prepared.puzzles.length) {
    throw new Error("Mate in 2 Focused Run fixture allocation is incomplete");
  }
  return service.startPreparedFocusedRun({
    ...prepared.prepared,
    puzzles: deterministicPuzzles
  }, now);
}

function weaveFocusedRunFixturePuzzles(
  focused: readonly Puzzle[],
  mixed: readonly Puzzle[]
): Puzzle[] {
  const woven: Puzzle[] = [];
  let focusedIndex = 0;
  let mixedIndex = 0;
  const total = focused.length + mixed.length;
  for (let index = 0; index < total; index += 1) {
    const expectedMixedCount = Math.floor(((index + 1) * mixed.length) / total);
    if (mixedIndex < expectedMixedCount) {
      woven.push(mixed[mixedIndex] as Puzzle);
      mixedIndex += 1;
    } else {
      woven.push(focused[focusedIndex] as Puzzle);
      focusedIndex += 1;
    }
  }
  return woven;
}

export function createMobilePracticeTestControls(service: PracticeService):
  | MobileTestControlCapabilities
  | undefined {
  if (!arePracticeTestControlsEnabled()) {
    return undefined;
  }
  return {
    injectMateIn2FocusedRun: (now) => injectMateIn2FocusedRun(service, now),
    // Keep this a literal `__DEV__` branch: Metro inlines it as false in
    // Release bundles and drops the require, so seeded synthetic history is
    // unreachable in Production builds even with test controls enabled.
    ...(__DEV__
      ? {
          seedTacticalHistory: (scenario, now, onProgress) =>
            (require("./devTacticalHistorySeed.ts") as typeof import("./devTacticalHistorySeed.ts"))
              .seedDevTacticalHistory(service, scenario, now, onProgress)
        }
      : {})
  };
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
