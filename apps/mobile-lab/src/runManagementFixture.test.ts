import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunManagementFixtureState,
  runManagementFixtureReducer
} from "./runManagementFixture.ts";

test("a new run requires a unique non-empty name before it is added to Home", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "add-run" });
  assert.deepEqual(state.draft?.themes, ["mixed"]);
  state = runManagementFixtureReducer(state, { type: "save-run" });
  assert.equal(state.nameError, "Enter a name for this run.");
  assert.equal(state.screen, "create");

  state = runManagementFixtureReducer(state, { type: "change-name", name: " tactics focus " });
  state = runManagementFixtureReducer(state, { type: "save-run" });
  assert.equal(state.nameError, "That name is already in use. Choose a unique name.");
  assert.equal(state.runs.length, 4);

  state = runManagementFixtureReducer(state, { type: "change-name", name: "Calculation Lab" });
  state = runManagementFixtureReducer(state, { type: "save-run" });
  assert.equal(state.screen, "home");
  assert.equal(state.runs.at(-1)?.name, "Calculation Lab");
  assert.equal(state.selectedRunId, "calculation-lab");
});

test("run order changes without changing stable run identity", () => {
  const initial = createRunManagementFixtureState();
  const moved = runManagementFixtureReducer(initial, {
    type: "move-run",
    runId: "endgame-sprint",
    targetRunId: "arrow-duel"
  });
  assert.deepEqual(moved.runs.map((run) => run.id), [
    "standard",
    "endgame-sprint",
    "arrow-duel",
    "tactics-focus"
  ]);
  assert.equal(moved.notice, null);
});

test("editing an existing run changes its name and direct-entry ELO without changing identity", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "toggle-home-edit" });
  state = runManagementFixtureReducer(state, { type: "edit-run", runId: "tactics-focus" });
  const original = state.draft;
  assert.ok(original);
  assert.equal(state.homeEditing, true);
  assert.equal(state.eloInput, "1040");

  state = runManagementFixtureReducer(state, { type: "change-name", name: "Calculation Focus" });
  state = runManagementFixtureReducer(state, { type: "change-mode", mode: "arrow_duel" });
  state = runManagementFixtureReducer(state, { type: "change-themes", themes: ["endgame"] });
  state = runManagementFixtureReducer(state, { type: "change-duration", durationSeconds: 180 });
  state = runManagementFixtureReducer(state, { type: "change-per-puzzle", perPuzzleSeconds: 10 });
  assert.deepEqual(state.draft, {
    ...original,
    name: "Calculation Focus"
  });

  state = runManagementFixtureReducer(state, { type: "change-elo-input", value: "1375" });
  assert.equal(state.draft?.elo, 1375);
  assert.equal(state.eloError, null);
  state = runManagementFixtureReducer(state, { type: "save-run" });

  const saved = state.runs.find((run) => run.id === "tactics-focus");
  assert.equal(saved?.name, "Calculation Focus");
  assert.equal(saved?.elo, 1375);
  assert.equal(saved?.ratingKey, original.ratingKey);
  assert.equal(saved?.mode, original.mode);
  assert.equal(state.screen, "home");
  assert.equal(state.homeEditing, true);
});

test("saving or cancelling an ELO edit returns to Home edit mode", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "toggle-home-edit" });
  state = runManagementFixtureReducer(state, { type: "edit-run", runId: "standard" });
  state = runManagementFixtureReducer(state, { type: "cancel-edit" });
  assert.equal(state.screen, "home");
  assert.equal(state.homeEditing, true);

  state = runManagementFixtureReducer(state, { type: "edit-run", runId: "standard" });
  state = runManagementFixtureReducer(state, { type: "change-elo", elo: 950 });
  state = runManagementFixtureReducer(state, { type: "save-run" });
  assert.equal(state.screen, "home");
  assert.equal(state.homeEditing, true);
  assert.equal(state.runs.find((run) => run.id === "standard")?.elo, 950);
});

test("removing and restoring a run retains its ELO and identity", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "remove-run", runId: "standard" });
  state = runManagementFixtureReducer(state, { type: "confirm-remove" });
  assert.equal(state.runs.some((run) => run.id === "standard"), false);
  assert.equal(state.hiddenRuns.find((run) => run.id === "standard")?.elo, 925);

  state = runManagementFixtureReducer(state, { type: "restore-run", runId: "standard" });
  assert.equal(state.hiddenRuns.some((run) => run.id === "standard"), false);
  assert.equal(state.runs.at(-1)?.id, "standard");
  assert.equal(state.runs.at(-1)?.elo, 925);
});

test("direct ELO entry enforces the existing 600-2200 content range", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "edit-run", runId: "arrow-duel" });
  state = runManagementFixtureReducer(state, { type: "change-elo-input", value: "599" });
  assert.equal(state.eloError, "Enter a whole-number ELO from 600 to 2200.");
  assert.equal(state.canSave, false);

  state = runManagementFixtureReducer(state, { type: "change-elo-input", value: "2201" });
  assert.equal(state.eloError, "Enter a whole-number ELO from 600 to 2200.");
  assert.equal(state.canSave, false);

  state = runManagementFixtureReducer(state, { type: "change-elo-input", value: "1600" });
  assert.equal(state.eloError, null);
  assert.equal(state.canSave, true);
  assert.equal(state.draft?.elo, 1600);
});

test("renaming an existing run still enforces unique names", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "edit-run", runId: "tactics-focus" });
  state = runManagementFixtureReducer(state, { type: "change-name", name: " Arrow Duel " });
  state = runManagementFixtureReducer(state, { type: "save-run" });

  assert.equal(state.screen, "edit");
  assert.equal(state.nameError, "That name is already in use. Choose a unique name.");
  assert.equal(state.runs.find((run) => run.id === "tactics-focus")?.name, "Tactics Focus");
});

test("the empty fixture exposes every retained run for restoration", () => {
  const state = createRunManagementFixtureState("empty");
  assert.equal(state.runs.length, 0);
  assert.equal(state.hiddenRuns.length, 4);
  assert.equal(state.selectedRunId, null);
});
