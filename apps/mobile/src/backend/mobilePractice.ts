import type { Puzzle, PuzzlePackManifest } from "../../../../packages/core/src/index.ts";
import { MemoryStore } from "../../../../packages/storage/src/memory-store.ts";
import { PackBackedPracticeStore } from "../../../../packages/storage/src/pack-backed-practice-store.ts";
import { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type { PuzzleSource } from "../../../../packages/storage/src/puzzle-source.ts";

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
  "04Phf"
] as const;

let persistentPracticeService: PracticeService | undefined;
const seededPuzzleSources = new WeakMap<PracticeService, Set<MobilePuzzleSource>>();
const packBackedServices = new WeakSet<PracticeService>();
let persistentPracticeServicePromise: Promise<PracticeService> | undefined;

export function createMobilePracticeService(source: MobilePuzzleSource = DEFAULT_PUZZLE_SOURCE): PracticeService {
  const store = new MemoryStore();
  const service = new PracticeService(store);
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
  const userStore = DeviceSQLiteStore.open("chessticize-mobile.sqlite");
  userStore.migrate();
  return createPersistentService(
    userStore,
    new LazyPuzzleSource(() => {
      const source = DeviceSQLiteStore.openBundledReadOnlyPuzzlePack("bundled-core-pack.sqlite");
      if (!source) {
        throw new Error("Bundled puzzle pack is unavailable");
      }
      return source;
    })
  );
}

async function createPersistentMobilePracticeServiceImpl(): Promise<PracticeService> {
  if (persistentPracticeService) {
    return persistentPracticeService;
  }

  const { DeviceSQLiteStore } = require("./deviceSQLiteStore.ts") as typeof import("./deviceSQLiteStore.ts");
  const userStore = DeviceSQLiteStore.open("chessticize-mobile.sqlite");
  userStore.migrate();
  const packSource = await DeviceSQLiteStore.openReadOnlyPuzzlePack("bundled-core-pack.sqlite");
  return createPersistentService(userStore, packSource);
}

function createPersistentService(userStore: InstanceType<typeof import("./deviceSQLiteStore.ts").DeviceSQLiteStore>, packSource: PuzzleSource): PracticeService {
  const store = new PackBackedPracticeStore(userStore, packSource);
  const service = new PracticeService(store);
  packBackedServices.add(service);
  configureMobilePracticePuzzleSource(service, DEFAULT_PUZZLE_SOURCE);
  persistentPracticeService = service;
  return service;
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

  selectPuzzles(filter: Parameters<PuzzleSource["selectPuzzles"]>[0]): Puzzle[] {
    return this.current.selectPuzzles(filter);
  }

  private get current(): PuzzleSource {
    this.source ??= this.openSource();
    return this.source;
  }
}

export function configureMobilePracticePuzzleSource(service: PracticeService, source: MobilePuzzleSource): void {
  if (source === "bundledCore" && packBackedServices.has(service)) {
    service.setPuzzleSelectionScopeIds(undefined);
    return;
  }
  const puzzles = puzzlesForSource(source);
  const seededSources = seededPuzzleSources.get(service) ?? new Set<MobilePuzzleSource>();
  if (!seededSources.has(source)) {
    service.loadFixturePuzzles(puzzles);
    seededSources.add(source);
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

function puzzlesForSource(source: MobilePuzzleSource): Puzzle[] {
  if (source === "bundledCore") {
    return bundledCoreFixturePuzzles();
  }
  if (source === "familiar15") {
    return familiarPuzzles();
  }
  return regressionPuzzles;
}

function bundledCoreFixturePuzzles(): Puzzle[] {
  return require("../../../../fixtures/puzzles/bundled-core-pack.json") as Puzzle[];
}

function familiarPuzzles(): Puzzle[] {
  const byId = new Map(regressionPuzzles.map((puzzle) => [puzzle.id, puzzle]));
  const classicPuzzles = FAMILIAR_PUZZLE_IDS.flatMap((id) => {
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
