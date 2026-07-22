import test from "node:test";
import assert from "node:assert/strict";
import {
  archivePracticeRun,
  createCustomPracticeRun,
  defaultPracticeRuns,
  mergePracticeRunCatalogs,
  practiceRunsFromLegacyCustomConfigs,
  practiceRunSprintConfig,
  PRACTICE_RUN_NAME_MAX_LENGTH,
  reorderPracticeRuns,
  restorePracticeRun,
  validatePracticeRunName,
  PracticeRunNameError
} from "../src/index.ts";

const NOW = "2026-07-22T18:00:00.000Z";

test("built-in Runs preserve the existing Standard and Arrow Duel rating keys", () => {
  const [standard, arrowDuel] = defaultPracticeRuns();
  assert.equal(standard?.id, "standard");
  assert.equal(standard?.ratingKey, "standard 5/20");
  assert.equal(arrowDuel?.id, "arrow-duel");
  assert.equal(arrowDuel?.ratingKey, "arrow_duel 5/30");
});

test("Custom Runs use stable independent rating keys even with identical configurations", () => {
  const existingRuns = defaultPracticeRuns();
  const first = createRun("run-a", "Tactics Focus", existingRuns);
  const second = createRun("run-b", "Fork Trainer", [...existingRuns, first]);
  assert.equal(first.ratingKey, "run:run-a");
  assert.equal(second.ratingKey, "run:run-b");
  assert.notEqual(first.ratingKey, second.ratingKey);
  assert.throws(
    () => createRun(first.id, "Third Run", [...existingRuns, first, second]),
    /already in use/
  );
  assert.throws(
    () => createRun("invalid id", "Invalid ID", [...existingRuns, first, second]),
    /opaque alphanumeric identifier/
  );
  const validInput = {
    id: "valid-input",
    name: "Valid input",
    mode: "custom" as const,
    durationSeconds: 600,
    perPuzzleSeconds: 30,
    targetCorrect: 20,
    maxMistakes: 3,
    themes: ["fork", "pin"],
    homeOrder: existingRuns.length,
    updatedAt: NOW,
    existingRuns: [...existingRuns, first, second]
  };
  for (const [field, value] of [
    ["durationSeconds", 0],
    ["perPuzzleSeconds", -1],
    ["targetCorrect", 1.5],
    ["maxMistakes", 0]
  ] as const) {
    assert.throws(
      () => createCustomPracticeRun({
        ...validInput,
        id: `invalid-${field}`,
        name: `Invalid ${field}`,
        [field]: value,
      }),
      /positive integer/
    );
  }
  assert.throws(
    () => createCustomPracticeRun({
      ...validInput,
      id: "invalid-home-order",
      name: "Invalid home order",
      homeOrder: -1,
    }),
    /non-negative integer/
  );
  assert.deepEqual(practiceRunSprintConfig(first), {
    mode: "custom",
    durationSeconds: 600,
    perPuzzleSeconds: 30,
    targetCorrect: 20,
    maxMistakes: 3,
    ratingKey: "run:run-a",
    themes: ["fork", "pin"]
  });
});

test("Run names are trimmed, required, limited, unique case-insensitively, and reserve built-ins", () => {
  const existing = [...defaultPracticeRuns(), createRun("run-a", "Tactics Focus", defaultPracticeRuns())];
  assert.equal(validatePracticeRunName("  Endgame Sprint  ", existing), "Endgame Sprint");
  assert.throws(() => validatePracticeRunName(" ", existing), errorCode("required"));
  assert.throws(() => validatePracticeRunName("tAcTiCs FoCuS", existing), errorCode("duplicate"));
  assert.throws(() => validatePracticeRunName("Standard", []), errorCode("duplicate"));
  assert.throws(() => validatePracticeRunName("x".repeat(41), existing), errorCode("too_long"));
});

test("legacy Custom Sprint configs become named Home Runs without changing their ELO buckets", () => {
  const existing = defaultPracticeRuns();
  const migrated = practiceRunsFromLegacyCustomConfigs([
    {
      id: "custom-custom-300-20-endgame+pin",
      mode: "custom",
      ratingKey: "endgame+pin custom 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["endgame", "pin"],
      lastStartedAt: "2026-07-21T12:00:00.000Z",
      playCount: 2
    },
    {
      id: "custom-arrow_duel-300-20-sacrifice",
      mode: "arrow_duel",
      ratingKey: "sacrifice arrow_duel 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["sacrifice"],
      lastStartedAt: "2026-07-09T12:00:00.000Z",
      playCount: 1
    },
    {
      id: "custom-custom-300-20-mate",
      mode: "custom",
      ratingKey: "mate custom 5/20",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 15,
      maxMistakes: 3,
      themes: ["mate"],
      lastStartedAt: "2026-07-08T12:00:00.000Z",
      playCount: 1
    }
  ], existing);

  assert.deepEqual(migrated.map((run) => ({
    name: run.name,
    mode: run.mode,
    ratingKey: run.ratingKey,
    themes: run.themes,
    homeOrder: run.homeOrder
  })), [
    {
      name: "Regular Puzzle 1",
      mode: "custom",
      ratingKey: "endgame+pin custom 5/20",
      themes: ["endgame", "pin"],
      homeOrder: 2
    },
    {
      name: "Arrow Duel 1",
      mode: "arrow_duel",
      ratingKey: "sacrifice arrow_duel 5/20",
      themes: ["sacrifice"],
      homeOrder: 3
    },
    {
      name: "Regular Puzzle 2",
      mode: "custom",
      ratingKey: "mate custom 5/20",
      themes: ["mate"],
      homeOrder: 4
    }
  ]);
  assert.equal(new Set(migrated.map((run) => run.id)).size, migrated.length);
  assert.ok(migrated.every((run) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(run.id)));
  assert.ok(migrated.every((run) => run.name.length <= PRACTICE_RUN_NAME_MAX_LENGTH));
});

test("reorder, archive, and restore preserve identity and append restored Runs", () => {
  const base = defaultPracticeRuns();
  const custom = createRun("run-a", "Tactics Focus", base);
  const reordered = reorderPracticeRuns([...base, custom], "run-a", "standard", NOW);
  assert.deepEqual(reordered.filter((run) => !run.archived).sort((a, b) => a.homeOrder - b.homeOrder).map((run) => run.id), [
    "run-a",
    "standard",
    "arrow-duel"
  ]);
  const archived = archivePracticeRun(reordered, "standard", "2026-07-22T18:01:00.000Z");
  assert.equal(archived.find((run) => run.id === "standard")?.archived, true);
  const restored = restorePracticeRun(archived, "standard", "2026-07-22T18:02:00.000Z");
  const active = restored.filter((run) => !run.archived).sort((a, b) => a.homeOrder - b.homeOrder);
  assert.equal(active.at(-1)?.id, "standard");
  assert.equal(active.at(-1)?.ratingKey, "standard 5/20");
});

test("sync merge is deterministic, uses last-write-wins per identity, and resolves concurrent names", () => {
  const base = defaultPracticeRuns();
  const local = { ...createRun("run-a", "Focus", base), updatedAt: "2026-07-22T18:30:00.000Z" };
  const remoteEdit = {
    ...local,
    name: "Focus Updated",
    archived: true,
    updatedAt: "2026-07-22T19:00:00.000Z"
  };
  const concurrentName = {
    ...createRun("run-b", "focus updated", base),
    updatedAt: "2026-07-22T18:45:00.000Z"
  };
  const left = mergePracticeRunCatalogs([...base, local], [remoteEdit, concurrentName]);
  const right = mergePracticeRunCatalogs([remoteEdit, concurrentName], [...base, local]);
  assert.deepEqual(left, right);
  assert.deepEqual(left.filter((run) => run.kind === "custom").map((run) => run.name), ["focus updated", "Focus Updated (2)"]);
  assert.equal(left.find((run) => run.id === "run-a")?.archived, true);
  assert.equal(left.find((run) => run.id === "run-a")?.name, "Focus Updated (2)");

  const tieLeft = { ...local, name: "Alpha", updatedAt: NOW };
  const tieRight = { ...local, name: "Omega", updatedAt: NOW };
  assert.deepEqual(
    mergePracticeRunCatalogs([tieLeft], [tieRight]),
    mergePracticeRunCatalogs([tieRight], [tieLeft])
  );
});

function createRun(id: string, name: string, existingRuns: ReturnType<typeof defaultPracticeRuns>) {
  return createCustomPracticeRun({
    id,
    name,
    mode: "custom",
    durationSeconds: 600,
    perPuzzleSeconds: 30,
    targetCorrect: 20,
    maxMistakes: 3,
    themes: ["pin", "fork"],
    homeOrder: existingRuns.length,
    updatedAt: NOW,
    existingRuns
  });
}

function errorCode(code: PracticeRunNameError["code"]): (error: unknown) => boolean {
  return (error) => error instanceof PracticeRunNameError && error.code === code;
}
