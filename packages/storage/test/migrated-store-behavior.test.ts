import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PracticeService, SQLiteStore } from "../src/index.ts";
import type { Puzzle } from "../../core/src/index.ts";

const RELEASED_V0_FIXTURE = resolve(
  "packages/storage/test/fixtures/migrations/schema-v0-ios-1.0.0.sqlite"
);

// Every test below runs once per label, against the exact same PracticeService contract.
const STORE_LABELS = ["fresh-install", "migrated-legacy-v0"] as const;
type StoreLabel = (typeof STORE_LABELS)[number];

interface OpenStore {
  store: SQLiteStore;
  cleanup: () => Promise<void>;
}

async function openStore(label: StoreLabel): Promise<OpenStore> {
  const directory = await mkdtemp(join(tmpdir(), `chessticize-shared-behavior-${label}-`));
  const databasePath = join(directory, "practice.sqlite");
  if (label === "migrated-legacy-v0") {
    await copyFile(RELEASED_V0_FIXTURE, databasePath);
  }
  const store = new SQLiteStore(databasePath);
  store.migrate();
  return {
    store,
    cleanup: async () => {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  };
}

// The theme folds into the sprint's rating key, keeping this suite's data disjoint from whatever a legacy fixture already has under "standard 5/20".
function sharedBehaviorTheme(label: StoreLabel): string {
  return `shared-behavior-suite-${label}`;
}

function sharedBehaviorPuzzle(label: StoreLabel): Puzzle {
  return {
    id: `shared-behavior-suite-puzzle-${label}`,
    initialFen: "r1bqk2r/pp1nbNp1/2p1p2p/8/2BP4/1PN3P1/P3QP1P/3R1RK1 b kq - 0 19",
    solutionMoves: ["e8f7", "e2e6", "f7f8", "e6f7"],
    rating: 1485,
    themes: ["mate", "mateIn2", "middlegame", "short", sharedBehaviorTheme(label)],
    source: "synthetic"
  };
}

function ratingKey(label: StoreLabel): string {
  return `shared-behavior-suite ${label}`;
}

/** Matches `ratingKeyForConfig` for a themed "standard" sprint: "{theme} standard {minutes}/{perPuzzleSeconds}". */
function sprintRatingKey(label: StoreLabel): string {
  return `${sharedBehaviorTheme(label)} standard 5/20`;
}

for (const label of STORE_LABELS) {
  test(`[shared-behavior:${label}] settings save/read round-trip`, async () => {
    const { store, cleanup } = await openStore(label);
    try {
      const service = new PracticeService(store);
      const updated = service.saveSettings({
        sync: { iCloudEnabled: true },
        notifications: { reviewReminder: { mode: "fixed", fixedLocalTime: "09:45" } }
      });

      assert.deepEqual(updated, service.getSettings());
      assert.deepEqual(service.getSettings(), {
        sync: { iCloudEnabled: true },
        notifications: { reviewReminder: { mode: "fixed", fixedLocalTime: "09:45" } }
      });
    } finally {
      await cleanup();
    }
  });

  test(`[shared-behavior:${label}] rating set/get/reset round-trip`, async () => {
    const { store, cleanup } = await openStore(label);
    try {
      const service = new PracticeService(store);
      const key = ratingKey(label);

      const set = service.setRating(key, 1250);
      assert.equal(set.rating, 1250);
      assert.equal(service.getRating(key).rating, 1250);

      service.resetRating(key);
      assert.notEqual(service.getRating(key).rating, 1250);
    } finally {
      await cleanup();
    }
  });

  test(`[shared-behavior:${label}] a correct sprint move is recorded and updates the rating`, async () => {
    const { store, cleanup } = await openStore(label);
    try {
      const service = new PracticeService(store);
      const theme = sharedBehaviorTheme(label);
      const puzzle = sharedBehaviorPuzzle(label);
      service.setPuzzleSelectionScope([puzzle]);

      const sprint = service.startSprint(
        {
          mode: "standard",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          targetCorrect: 1,
          maxMistakes: 3,
          themes: [theme]
        },
        "2026-06-20T12:00:00.000Z"
      );
      assert.equal(sprint.currentPuzzle?.puzzle.id, puzzle.id);

      // The fixture puzzle needs two correct replies ("e2e6" then "e6f7") before
      // the engine records a completed attempt; the first reply only advances state.
      const firstReply = service.submitMove("e2e6", "2026-06-20T00:00:05.000Z");
      assert.equal((firstReply.feedback as { result?: string } | undefined)?.result, "correct");
      assert.equal(firstReply.attempt, undefined);

      const result = service.submitMove("e6f7", "2026-06-20T00:00:10.000Z");
      assert.equal((result.feedback as { result?: string } | undefined)?.result, "correct");
      assert.equal(result.attempt?.result, "correct");

      const history = service.getHistoryView({
        now: "2026-06-21T00:00:00.000Z",
        timeRange: "max",
        ratingKey: sprintRatingKey(label)
      });
      assert.deepEqual(
        history.attempts.map((attempt) => attempt.id),
        [result.attempt?.id]
      );
      assert.equal(service.getRating(sprintRatingKey(label)).games, 1);
    } finally {
      await cleanup();
    }
  });

  test(`[shared-behavior:${label}] a wrong sprint move schedules a review that a correct review clears`, async () => {
    const { store, cleanup } = await openStore(label);
    try {
      const service = new PracticeService(store);
      const theme = sharedBehaviorTheme(label);
      const puzzle = sharedBehaviorPuzzle(label);
      service.setPuzzleSelectionScope([puzzle]);

      service.startSprint(
        {
          mode: "standard",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          targetCorrect: 5,
          maxMistakes: 1,
          themes: [theme]
        },
        "2026-06-20T12:00:00.000Z"
      );
      const wrongResult = service.submitMove("c4b5", "2026-06-20T12:00:05.000Z");
      assert.equal(wrongResult.attempt?.result, "wrong");

      // getDueReviewItems returns every due item across the whole store (it is not
      // scoped by rating key), so a migrated legacy database can legitimately have
      // its own unrelated due items already in the list alongside this one.
      const dueBefore = service.getDueReviewItems("2026-06-21T12:00:05.000Z");
      assert.ok(dueBefore.some((item) => item.puzzle.id === puzzle.id));

      service.recordReviewAttempt(
        {
          puzzleId: puzzle.id,
          mode: "standard",
          ratingKey: sprintRatingKey(label),
          result: "correct",
          submittedMove: "e2e6",
          expectedMove: "e2e6",
          startedAt: "2026-06-21T12:00:00.000Z"
        },
        "2026-06-21T12:00:05.000Z"
      );

      const dueAfter = service.getDueReviewItems("2026-06-21T12:00:05.000Z");
      assert.ok(!dueAfter.some((item) => item.puzzle.id === puzzle.id));
    } finally {
      await cleanup();
    }
  });

  test(`[shared-behavior:${label}] exporting and re-importing the same data is idempotent`, async () => {
    const { store, cleanup } = await openStore(label);
    try {
      const service = new PracticeService(store);
      const theme = sharedBehaviorTheme(label);
      const puzzle = sharedBehaviorPuzzle(label);
      service.setPuzzleSelectionScope([puzzle]);
      service.startSprint(
        {
          mode: "standard",
          durationSeconds: 300,
          perPuzzleSeconds: 20,
          targetCorrect: 1,
          maxMistakes: 3,
          themes: [theme]
        },
        "2026-06-20T00:00:00.000Z"
      );
      service.submitMove("e2e6", "2026-06-20T00:00:05.000Z");
      service.submitMove("e6f7", "2026-06-20T00:00:10.000Z");

      const exported = service.exportLocalData();
      const reimported = service.importLocalData(exported);

      assert.deepEqual(reimported, {
        ratings: 0,
        attempts: 0,
        reviewQueue: 0,
        sprintSessions: 0
      });
      assert.deepEqual(service.exportLocalData(), exported);
    } finally {
      await cleanup();
    }
  });
}
