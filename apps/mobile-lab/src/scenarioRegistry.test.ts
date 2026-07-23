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

test("the Practice catalog covers the post-correct Unclear follow-up", () => {
  const scenario = Object.values(scenarioRegistry).find(
    (candidate) => candidate.storyId === "practice--unclear-follow-up"
  );

  assert.ok(scenario);
  assert.equal(scenario.group, "Practice");
  assert.ok(scenario.scope.includes.includes("Previous-attempt clarity question"));
  assert.equal(scenario.isNew, undefined);
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

test("New Scenario Markers retain open-issue ownership on the full catalog", () => {
  const scenarios = Object.values(scenarioRegistry);
  assert.deepEqual(newScenarios, scenarios.filter((scenario) => scenario.isNew));

  for (const scenario of scenarios) {
    assert.deepEqual(
      storyTagsForScenario(scenario.id as LabScenarioId),
      scenario.isNew ? ["new"] : []
    );
    if (scenario.isNew) {
      assert.ok(scenario.issues.length > 0);
      for (const issue of scenario.issues) {
        assert.ok(Number.isInteger(issue.issueNumber));
        assert.ok(issue.issueNumber > 0);
        assert.ok(issue.changeNote.trim().length > 0);
      }
    }
  }
});

test("the issue #272 preview hands the board to White after the blunder", () => {
  const chess = new Chess(ISSUE_272_LAB_PUZZLE.initialFen);

  chess.move(ISSUE_272_LAB_PUZZLE.solutionMoves[0]!);

  assert.equal(chess.turn(), "w");
  assert.equal(chess.fen(), "8/3k4/8/8/8/8/4P3/4K3 w - - 1 2");
});

test("the active design review marks only Issue #247 move feedback as new", () => {
  assert.deepEqual(newScenarios.map((scenario) => scenario.id), ["settings-move-feedback"]);
  assert.deepEqual(storyTagsForScenario("settings-move-feedback"), ["new"]);
  assert.deepEqual(storyTagsForScenario("practice-home" as LabScenarioId), []);
});
