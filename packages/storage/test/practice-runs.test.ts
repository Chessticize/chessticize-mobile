import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Puzzle } from "../../core/src/index.ts";
import {
  ARROW_DUEL_PRACTICE_RUN_ID,
  defaultPracticeRuns,
  STANDARD_PRACTICE_RUN_ID
} from "../../core/src/index.ts";
import {
  MemoryStore,
  PracticeRunAvailabilityError,
  PracticeService,
  SQLiteStore
} from "../src/index.ts";

process.env.TZ = "UTC";

for (const backend of ["memory", "sqlite"] as const) {
  test(`${backend} practice Runs keep stable identity, independent ELO, order, archive, and history`, async () => {
    const store = backend === "memory" ? new MemoryStore() : new SQLiteStore(":memory:");
    if (store instanceof SQLiteStore) {
      store.migrate();
    }
    try {
      store.seedPuzzles(await loadFixturePuzzles());
      const service = new PracticeService(store);

      const ratingsBeforeEligibilityCheck = service.listRatings();
      assert.equal(service.countEligiblePracticeRunPuzzles({
        name: "Draft Run",
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        initialRating: 900
      }, 1), 1);
      assert.deepEqual(service.listRatings(), ratingsBeforeEligibilityCheck);

      const catalogBeforeUnavailableCreate = service.listPracticeRuns();
      assert.equal(service.canCreatePracticeRun({
        name: "Unavailable Run",
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        themes: ["theme-not-in-local-pack"],
        initialRating: 900
      }), false);
      assert.throws(() => service.createPracticeRun({
        name: "Unavailable Run",
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        themes: ["theme-not-in-local-pack"],
        initialRating: 900
      }), PracticeRunAvailabilityError);
      assert.deepEqual(service.listPracticeRuns(), catalogBeforeUnavailableCreate);
      assert.deepEqual(service.listRatings(), ratingsBeforeEligibilityCheck);

      assert.deepEqual(
        service.listPracticeRuns().map(({ id, ratingKey }) => ({ id, ratingKey })),
        [
          { id: STANDARD_PRACTICE_RUN_ID, ratingKey: "standard 5/20" },
          { id: ARROW_DUEL_PRACTICE_RUN_ID, ratingKey: "arrow_duel 5/30" }
        ]
      );

      const tactics = service.createPracticeRun({
        id: "tactics-focus",
        name: "Tactics Focus",
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 3,
        themes: ["hangingPiece"],
        initialRating: 900
      }, "2026-07-22T10:00:00.000Z");
      const copy = service.createPracticeRun({
        id: "tactics-copy",
        name: "Tactics Copy",
        mode: "custom",
        durationSeconds: 300,
        perPuzzleSeconds: 20,
        targetCorrect: 1,
        themes: ["hangingPiece"],
        initialRating: 900
      }, "2026-07-22T10:01:00.000Z");

      assert.notEqual(tactics.ratingKey, copy.ratingKey);
      assert.equal(service.getRating(tactics.ratingKey).rating, 900);
      assert.equal(service.getRating(copy.ratingKey).rating, 900);

      const standardBefore = service.getActivePracticeRun(STANDARD_PRACTICE_RUN_ID);
      const updatedStandard = service.updatePracticeRun(STANDARD_PRACTICE_RUN_ID, {
        name: "Morning Warm-up",
        rating: 1375
      }, "2026-07-22T10:01:30.000Z");
      assert.deepEqual(updatedStandard.run, {
        ...standardBefore,
        name: "Morning Warm-up",
        updatedAt: "2026-07-22T10:01:30.000Z"
      });
      assert.equal(updatedStandard.rating.rating, 1375);
      assert.equal(updatedStandard.rating.generation, 1);
      const unchangedStandard = service.updatePracticeRun(STANDARD_PRACTICE_RUN_ID, {
        name: "Morning Warm-up",
        rating: 1375
      }, "2026-07-22T10:01:45.000Z");
      assert.equal(unchangedStandard.run.updatedAt, "2026-07-22T10:01:30.000Z");
      assert.equal(unchangedStandard.rating.generation, 1);
      assert.throws(
        () => service.updatePracticeRun(STANDARD_PRACTICE_RUN_ID, {
          name: "Tactics Focus",
          rating: 1400
        }),
        /already in use/
      );
      assert.throws(
        () => service.updatePracticeRun(STANDARD_PRACTICE_RUN_ID, {
          name: "Invalid ELO",
          rating: 2201
        }),
        /at most 2200/
      );
      assert.equal(service.getActivePracticeRun(STANDARD_PRACTICE_RUN_ID).name, "Morning Warm-up");
      assert.equal(service.getRating(standardBefore.ratingKey).rating, 1375);

      const changed = service.setPracticeRunRating(tactics.id, 1025);
      assert.equal(changed.generation, 1);
      assert.equal(service.setPracticeRunRating(tactics.id, 1025).generation, 1);
      assert.equal(service.getRating(copy.ratingKey).rating, 900);

      service.reorderPracticeRun(tactics.id, STANDARD_PRACTICE_RUN_ID, "2026-07-22T10:02:00.000Z");
      assert.deepEqual(
        service.listPracticeRuns().filter((run) => !run.archived).map((run) => run.id),
        [tactics.id, STANDARD_PRACTICE_RUN_ID, ARROW_DUEL_PRACTICE_RUN_ID, copy.id]
      );

      service.archivePracticeRun(tactics.id, "2026-07-22T10:03:00.000Z");
      assert.equal(service.listPracticeRuns().find((run) => run.id === tactics.id)?.archived, true);
      assert.throws(() => service.getActivePracticeRun(tactics.id), /not available/);
      assert.equal(service.getRating(tactics.ratingKey).rating, 1025);
      service.restorePracticeRun(tactics.id, "2026-07-22T10:04:00.000Z");
      assert.equal(service.getActivePracticeRun(tactics.id).name, "Tactics Focus");
      assert.equal(service.listPracticeRuns().filter((run) => !run.archived).at(-1)?.id, tactics.id);
      assert.equal(service.getRating(tactics.ratingKey).rating, 1025);

      const sprint = service.startSprint(
        { mode: "custom", practiceRunId: tactics.id, targetCorrect: 1, puzzleSelectionSeed: "practice-run-test" },
        "2026-07-22T10:05:00.000Z"
      );
      assert.deepEqual(sprint.run, { id: tactics.id, kind: "custom", name: "Tactics Focus" });
      assert.equal(sprint.config.ratingKey, tactics.ratingKey);
      assert.equal(sprint.config.targetCorrect, 1);
      assert.deepEqual(sprint.config.themes, ["hangingPiece"]);
      service.submitMove("e6e7", "2026-07-22T10:05:05.000Z");
      service.submitMove("b3c1", "2026-07-22T10:05:10.000Z");
      service.submitMove("h6c1", "2026-07-22T10:05:15.000Z");

      assert.deepEqual(
        service.listHistory()[0] && {
          runId: service.listHistory()[0]!.runId,
          runName: service.listHistory()[0]!.runName
        },
        { runId: tactics.id, runName: "Tactics Focus" }
      );
      const exported = service.exportLocalData();
      assert.equal(exported.practiceRuns.find((run) => run.id === tactics.id)?.name, "Tactics Focus");
      assert.deepEqual(exported.sprintSessions[0]?.run, sprint.run);
      assert.equal(exported.sprintSessions[0]?.config?.ratingKey, tactics.ratingKey);

      service.updatePracticeRun(tactics.id, {
        name: "Calculation Focus",
        rating: 1025
      }, "2026-07-22T10:06:00.000Z");
      assert.equal(service.listHistory()[0]?.runName, "Tactics Focus");
      const renamedSprint = service.startSprint(
        { mode: "custom", practiceRunId: tactics.id, targetCorrect: 1, puzzleSelectionSeed: "renamed-run-test" },
        "2026-07-22T10:07:00.000Z"
      );
      assert.deepEqual(renamedSprint.run, {
        id: tactics.id,
        kind: "custom",
        name: "Calculation Focus"
      });
    } finally {
      if (store instanceof SQLiteStore) {
        store.close();
      }
    }
  });
}

test("SQLite practice Runs survive reopen with their ELO and archived state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-practice-runs-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const store = new SQLiteStore(databasePath);
    store.migrate();
    const service = new PracticeService(store);
    service.loadFixturePuzzles(await loadFixturePuzzles());
    const run = service.createPracticeRun({
      id: "saved-run",
      name: "Saved Run",
      mode: "custom",
      durationSeconds: 180,
      perPuzzleSeconds: 10,
      initialRating: 875
    }, "2026-07-22T11:00:00.000Z");
    service.updatePracticeRun(run.id, {
      name: "Renamed Saved Run",
      rating: 1125
    }, "2026-07-22T11:00:30.000Z");
    service.archivePracticeRun(run.id, "2026-07-22T11:01:00.000Z");
    store.close();

    const reopened = new SQLiteStore(databasePath);
    reopened.migrate();
    try {
      const reopenedService = new PracticeService(reopened);
      assert.equal(reopenedService.listPracticeRuns().find((candidate) => candidate.id === run.id)?.archived, true);
      assert.equal(reopenedService.listPracticeRuns().find((candidate) => candidate.id === run.id)?.name, "Renamed Saved Run");
      assert.equal(reopenedService.getRating(run.ratingKey).rating, 1125);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("practice Run sync imports catalog identity, setup, and ELO together", async () => {
  const source = new PracticeService(new MemoryStore());
  source.loadFixturePuzzles(await loadFixturePuzzles());
  const run = source.createPracticeRun({
    id: "synced-run",
    name: "Synced Run",
    mode: "custom",
    durationSeconds: 180,
    perPuzzleSeconds: 10,
    themes: ["hangingPiece"],
    initialRating: 950
  }, "2026-07-22T12:00:00.000Z");
  source.archivePracticeRun(run.id, "2026-07-22T12:01:00.000Z");

  const destination = new PracticeService(new MemoryStore());
  const imported = destination.importLocalData(source.exportLocalData());

  assert.equal(imported.practiceRuns, 1);
  assert.equal(imported.ratings, 1);
  assert.deepEqual(destination.listPracticeRuns().find((candidate) => candidate.id === run.id), {
    ...run,
    archived: true,
    updatedAt: "2026-07-22T12:01:00.000Z"
  });
  assert.equal(destination.getRating(run.ratingKey).rating, 950);
});

test("practice Run sync preserves a renamed built-in Run and its fixed identity", async () => {
  const source = new PracticeService(new MemoryStore());
  source.updatePracticeRun(STANDARD_PRACTICE_RUN_ID, {
    name: "Morning Warm-up",
    rating: 1350
  }, "2026-07-22T12:30:00.000Z");

  const destination = new PracticeService(new MemoryStore());
  destination.importLocalData(source.exportLocalData());

  assert.deepEqual(destination.getActivePracticeRun(STANDARD_PRACTICE_RUN_ID), {
    ...defaultPracticeRuns()[0]!,
    name: "Morning Warm-up",
    updatedAt: "2026-07-22T12:30:00.000Z"
  });
  assert.equal(destination.getRating("standard 5/20").rating, 1350);
});

test("SQLite import resolves concurrent duplicate Run names without a transient unique-name failure", async () => {
  const localStore = new SQLiteStore(":memory:");
  localStore.migrate();
  try {
    const local = new PracticeService(localStore);
    local.loadFixturePuzzles(await loadFixturePuzzles());
    local.createPracticeRun({
      id: "z-local",
      name: "Focus",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      initialRating: 900
    }, "2026-07-22T12:00:00.000Z");
    const remote = new PracticeService(new MemoryStore());
    remote.loadFixturePuzzles(await loadFixturePuzzles());
    remote.createPracticeRun({
      id: "a-remote",
      name: "focus",
      mode: "custom",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      initialRating: 900
    }, "2026-07-22T12:00:00.000Z");

    local.importLocalData(remote.exportLocalData());

    assert.deepEqual(
      local.listPracticeRuns().filter((run) => run.kind === "custom").map((run) => run.name),
      ["focus", "Focus (2)"]
    );
  } finally {
    localStore.close();
  }
});

async function loadFixturePuzzles(): Promise<Puzzle[]> {
  return JSON.parse(await readFile(resolve("fixtures/puzzles/presolved-sample.json"), "utf8")) as Puzzle[];
}
