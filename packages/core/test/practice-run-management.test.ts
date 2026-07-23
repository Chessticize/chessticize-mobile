import assert from "node:assert/strict";
import test from "node:test";
import {
  createPracticeRunManagementController,
  type PracticeRunManagementAdapter,
  type PracticeRunManagementCatalog,
  type PracticeRunManagementCommand,
  type PracticeRunManagementCommandResult,
  type PracticeRunManagementDraft,
  type PracticeRunManagementRun
} from "../src/index.ts";

test("Run management creates a uniquely named multi-theme Run through its public interface", () => {
  const adapter = new FakeRunManagementAdapter();
  const controller = createPracticeRunManagementController(adapter);

  controller.dispatch({ type: "add-run" });
  controller.dispatch({ type: "toggle-theme", theme: "fork" });
  controller.dispatch({ type: "toggle-theme", theme: "pin" });
  controller.dispatch({ type: "save-run" });
  assert.equal(controller.getSnapshot().nameError, "Enter a name for this run.");

  controller.dispatch({ type: "change-name", name: " tactics focus " });
  controller.dispatch({ type: "save-run" });
  assert.equal(
    controller.getSnapshot().nameError,
    "That name is already in use. Choose a unique name."
  );

  controller.dispatch({ type: "change-name", name: " Calculation Lab " });
  controller.dispatch({ type: "save-run" });

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.screen, "home");
  assert.equal(snapshot.selectedRunId, "calculation-lab");
  assert.deepEqual(snapshot.runs.at(-1), {
    id: "calculation-lab",
    ratingKey: "run:calculation-lab",
    name: "Calculation Lab",
    kind: "custom",
    mode: "custom",
    elo: 900,
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    themes: ["fork", "pin"]
  });
  assert.equal(adapter.commands.at(-1)?.type, "create-run");
});

test("editing preserves fixed Run settings while validating direct ELO input", () => {
  const adapter = new FakeRunManagementAdapter();
  const controller = createPracticeRunManagementController(adapter);

  controller.dispatch({ type: "toggle-home-edit" });
  controller.dispatch({ type: "edit-run", runId: "tactics-focus" });
  const original = controller.getSnapshot().draft;
  assert.ok(original);

  controller.dispatch({ type: "change-mode", mode: "arrow_duel" });
  controller.dispatch({ type: "toggle-theme", theme: "endgame" });
  controller.dispatch({ type: "change-duration", durationSeconds: 180 });
  controller.dispatch({ type: "change-per-puzzle", perPuzzleSeconds: 10 });
  assert.deepEqual(controller.getSnapshot().draft, original);

  controller.dispatch({ type: "change-name", name: "Calculation Focus" });
  controller.dispatch({ type: "change-elo-input", value: "2201" });
  assert.equal(
    controller.getSnapshot().eloError,
    "Enter a whole-number ELO from 600 to 2200."
  );
  assert.equal(controller.getSnapshot().canSave, false);

  controller.dispatch({ type: "change-elo-input", value: "1375" });
  controller.dispatch({ type: "save-run" });

  const saved = controller.getSnapshot().runs.find((run) => run.id === "tactics-focus");
  assert.deepEqual(saved, {
    ...original,
    id: "tactics-focus",
    name: "Calculation Focus",
    elo: 1375
  });
  assert.equal(controller.getSnapshot().homeEditing, true);
  assert.equal(adapter.commands.at(-1)?.type, "update-run");
});

test("reorder, archive, and restore retain stable Run identity and ELO", () => {
  const adapter = new FakeRunManagementAdapter();
  const controller = createPracticeRunManagementController(adapter);

  controller.dispatch({
    type: "move-run",
    runId: "endgame-sprint",
    targetRunId: "arrow-duel"
  });
  assert.deepEqual(controller.getSnapshot().runs.map((run) => run.id), [
    "standard",
    "endgame-sprint",
    "arrow-duel",
    "tactics-focus"
  ]);

  controller.dispatch({ type: "remove-run", runId: "standard" });
  controller.dispatch({ type: "confirm-remove" });
  assert.equal(controller.getSnapshot().runs.some((run) => run.id === "standard"), false);
  assert.equal(
    controller.getSnapshot().hiddenRuns.find((run) => run.id === "standard")?.elo,
    925
  );

  controller.dispatch({ type: "restore-run", runId: "standard" });
  assert.equal(controller.getSnapshot().hiddenRuns.some((run) => run.id === "standard"), false);
  assert.equal(controller.getSnapshot().runs.at(-1)?.id, "standard");
  assert.equal(controller.getSnapshot().runs.at(-1)?.elo, 925);
});

test("previous configurations, start effects, and refresh stay outside React", () => {
  const adapter = new FakeRunManagementAdapter();
  const controller = createPracticeRunManagementController(adapter);

  controller.dispatch({ type: "add-run" });
  controller.dispatch({ type: "prefill-previous-config", configId: "previous-arrow" });
  assert.deepEqual(controller.getSnapshot().draft, {
    name: "",
    kind: "custom",
    mode: "arrow_duel",
    elo: 1110,
    durationSeconds: 180,
    perPuzzleSeconds: 10,
    themes: ["fork", "pin"]
  });
  controller.dispatch({ type: "cancel-edit" });

  controller.dispatch({ type: "select-run", runId: "tactics-focus" });
  assert.deepEqual(controller.dispatch({ type: "start-selected-run" }), {
    type: "start-run",
    runId: "tactics-focus"
  });

  adapter.catalog.runs = adapter.catalog.runs.filter((run) => run.id !== "tactics-focus");
  controller.refresh();
  assert.equal(controller.getSnapshot().selectedRunId, "standard");
});

class FakeRunManagementAdapter implements PracticeRunManagementAdapter {
  readonly commands: PracticeRunManagementCommand[] = [];
  catalog: MutableCatalog = {
    hiddenRuns: [],
    previousConfigs: [
      {
        config: {
          id: "previous-arrow",
          mode: "arrow_duel",
          ratingKey: "fork+pin arrow_duel 3/10",
          durationSeconds: 180,
          perPuzzleSeconds: 10,
          targetCorrect: 18,
          maxMistakes: 3,
          themes: ["pin", "fork"],
          lastStartedAt: "2026-07-22T12:00:00.000Z",
          playCount: 1
        },
        rating: 1110
      }
    ],
    runs: baseRuns()
  };

  canCreate(_draft: PracticeRunManagementDraft): boolean {
    return true;
  }

  execute(command: PracticeRunManagementCommand): PracticeRunManagementCommandResult {
    this.commands.push(command);
    let changedRunId: string;
    switch (command.type) {
      case "create-run": {
        changedRunId = uniqueRunId(command.draft.name, this.catalog);
        this.catalog.runs.push({
          ...command.draft,
          id: changedRunId,
          ratingKey: `run:${changedRunId}`,
          name: command.draft.name.trim(),
          themes: [...command.draft.themes]
        });
        break;
      }
      case "update-run":
        changedRunId = command.runId;
        this.catalog.runs = this.catalog.runs.map((run) => run.id === command.runId
          ? { ...run, name: command.name.trim(), elo: command.elo }
          : run);
        break;
      case "reorder-run": {
        changedRunId = command.runId;
        const from = this.catalog.runs.findIndex((run) => run.id === command.runId);
        const to = this.catalog.runs.findIndex((run) => run.id === command.targetRunId);
        const [moved] = this.catalog.runs.splice(from, 1);
        assert.ok(moved);
        this.catalog.runs.splice(to, 0, moved);
        break;
      }
      case "archive-run": {
        changedRunId = command.runId;
        const archived = this.catalog.runs.find((run) => run.id === command.runId);
        assert.ok(archived);
        this.catalog.runs = this.catalog.runs.filter((run) => run.id !== command.runId);
        this.catalog.hiddenRuns.push(archived);
        break;
      }
      case "restore-run": {
        changedRunId = command.runId;
        const restored = this.catalog.hiddenRuns.find((run) => run.id === command.runId);
        assert.ok(restored);
        this.catalog.hiddenRuns = this.catalog.hiddenRuns.filter(
          (run) => run.id !== command.runId
        );
        this.catalog.runs.push(restored);
        break;
      }
    }
    return {
      catalog: this.read(),
      changedRunId
    };
  }

  read(): PracticeRunManagementCatalog {
    return {
      hiddenRuns: this.catalog.hiddenRuns.map(cloneRun),
      previousConfigs: this.catalog.previousConfigs.map(({ config, rating }) => ({
        config: {
          ...config,
          ...(config.themes === undefined ? {} : { themes: [...config.themes] })
        },
        rating
      })),
      runs: this.catalog.runs.map(cloneRun)
    };
  }
}

type MutableCatalog = {
  hiddenRuns: PracticeRunManagementRun[];
  previousConfigs: PracticeRunManagementCatalog["previousConfigs"];
  runs: PracticeRunManagementRun[];
};

function baseRuns(): PracticeRunManagementRun[] {
  return [
    run("standard", "Standard", "standard", "standard", 925, 300, 20, ["mixed"]),
    run("arrow-duel", "Arrow Duel", "arrow_duel", "arrow_duel", 875, 300, 20, ["mixed"]),
    run("tactics-focus", "Tactics Focus", "custom", "custom", 1040, 600, 30, ["fork", "pin"]),
    run("endgame-sprint", "Endgame Sprint", "custom", "custom", 810, 180, 10, ["endgame"])
  ];
}

function run(
  id: string,
  name: string,
  kind: PracticeRunManagementRun["kind"],
  mode: PracticeRunManagementRun["mode"],
  elo: number,
  durationSeconds: number,
  perPuzzleSeconds: number,
  themes: readonly string[]
): PracticeRunManagementRun {
  return {
    id,
    ratingKey: kind === "custom" ? `run:${id}` : `${mode} 5/20`,
    name,
    kind,
    mode,
    elo,
    durationSeconds,
    perPuzzleSeconds,
    themes
  };
}

function uniqueRunId(name: string, catalog: MutableCatalog): string {
  const base = name.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-");
  const ids = new Set([...catalog.runs, ...catalog.hiddenRuns].map((run) => run.id));
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function cloneRun(run: PracticeRunManagementRun): PracticeRunManagementRun {
  return { ...run, themes: [...run.themes] };
}
