import assert from "node:assert/strict";
import test from "node:test";
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

test("New Scenario Markers retain open-issue ownership on the full catalog", () => {
  const scenarios = Object.values(scenarioRegistry);
  assert.deepEqual(newScenarios, scenarios.filter((scenario) => scenario.isNew));

  for (const scenario of scenarios) {
    assert.deepEqual(
      storyTagsForScenario(scenario.id as LabScenarioId),
      scenario.isNew ? ["new"] : []
    );
    if (scenario.isNew) {
      assert.ok(Number.isInteger(scenario.issueNumber));
      assert.ok(scenario.issueNumber > 0);
      assert.ok(scenario.changeNote.trim().length > 0);
    }
  }
});

test("the multiple-theme design review has one active New Scenario Marker", () => {
  assert.deepEqual(
    newScenarios.map((scenario) => scenario.id),
    ["practice-multi-theme-choice"]
  );
  assert.deepEqual(storyTagsForScenario("practice-home" as LabScenarioId), []);
  assert.deepEqual(storyTagsForScenario("practice-multi-theme-choice"), ["new"]);
});
