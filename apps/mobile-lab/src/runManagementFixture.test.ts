import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunManagementFixtureState,
  runManagementFixtureReducer
} from "./runManagementFixture.ts";

test("a new run requires a unique non-empty name before it is added to Home", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "add-run" });
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
    direction: "up",
    runId: "endgame-sprint"
  });
  assert.deepEqual(moved.runs.map((run) => run.id), [
    "standard",
    "arrow-duel",
    "endgame-sprint",
    "tactics-focus"
  ]);
  assert.equal(moved.notice, "Endgame Sprint moved to position 3.");
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

test("run ELO edits reuse the Settings floor rule", () => {
  let state = createRunManagementFixtureState();
  state = runManagementFixtureReducer(state, { type: "edit-run", runId: "arrow-duel" });
  state = runManagementFixtureReducer(state, { type: "change-elo", elo: 575 });
  assert.equal(state.draft?.elo, 600);
  state = runManagementFixtureReducer(state, { type: "save-run" });
  assert.equal(state.runs.find((run) => run.id === "arrow-duel")?.elo, 600);
});

test("the empty fixture exposes every retained run for restoration", () => {
  const state = createRunManagementFixtureState("empty");
  assert.equal(state.runs.length, 0);
  assert.equal(state.hiddenRuns.length, 4);
  assert.equal(state.selectedRunId, null);
});
