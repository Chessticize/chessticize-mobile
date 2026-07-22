import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { ISSUE_272_LAB_PUZZLE } from "./labPuzzles.ts";
import {
  navigationCoverage,
  newScenarios,
  scenarioRegistry,
  storyTagsForScenario,
  type LabScenarioId
} from "./scenarioRegistry.ts";

test("the baseline catalog has unique stable story URLs and declared scopes", () => {
  const scenarios = Object.values(scenarioRegistry);
  assert.ok(scenarios.length >= 25);
  assert.equal(new Set(scenarios.map((scenario) => scenario.storyId)).size, scenarios.length);
  for (const scenario of scenarios) {
    assert.equal(scenario.id in scenarioRegistry, true);
    assert.ok(scenario.description.length > 0);
    assert.ok(scenario.scope.includes.length > 0);
    assert.ok(scenario.scope.exits.length > 0);
  }
});

test("every typed navigation coverage entry points to a registered scenario", () => {
  const coverageEntries = [
    ...Object.values(navigationCoverage.tabs),
    ...Object.values(navigationCoverage.transients),
    ...Object.values(navigationCoverage.details)
  ];
  for (const coverage of coverageEntries) {
    if (coverage.kind === "scenario") {
      assert.ok(scenarioRegistry[coverage.scenario]);
    } else {
      assert.ok(coverage.reason.length > 0);
    }
  }
});

test("the issue #272 design slice keeps its New Scenario Markers active", () => {
  assert.deepEqual(newScenarios.map((scenario) => scenario.id), [
    "practice-blunder-move-preview",
    "review-blunder-move-preview"
  ]);
  assert.deepEqual(storyTagsForScenario("practice-home" as LabScenarioId), []);
  assert.deepEqual(storyTagsForScenario("practice-blunder-move-preview"), ["new"]);
});

test("the issue #272 preview hands the board to Black after the blunder", () => {
  const chess = new Chess(ISSUE_272_LAB_PUZZLE.initialFen);

  chess.move(ISSUE_272_LAB_PUZZLE.solutionMoves[0]!);

  assert.equal(chess.turn(), "b");
  assert.equal(chess.fen(), "4k3/4p3/8/8/8/8/3K4/8 b - - 1 1");
});
