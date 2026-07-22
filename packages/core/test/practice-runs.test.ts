import test from "node:test";
import assert from "node:assert/strict";
import {
  archivePracticeRun,
  createCustomPracticeRun,
  defaultPracticeRuns,
  mergePracticeRunCatalogs,
  practiceRunSprintConfig,
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
  const local = createRun("run-a", "Focus", base);
  const remote = {
    ...createRun("run-b", "focus", base),
    archived: true,
    updatedAt: "2026-07-22T19:00:00.000Z"
  };
  const localEdit = { ...local, archived: false, updatedAt: "2026-07-22T18:30:00.000Z" };
  const left = mergePracticeRunCatalogs([...base, localEdit], [remote]);
  const right = mergePracticeRunCatalogs([remote], [...base, localEdit]);
  assert.deepEqual(left, right);
  assert.deepEqual(left.filter((run) => run.kind === "custom").map((run) => run.name), ["Focus", "focus (2)"]);
  assert.equal(left.find((run) => run.id === "run-b")?.archived, true);
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
