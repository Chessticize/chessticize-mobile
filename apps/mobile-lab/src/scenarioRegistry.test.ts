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
      assert.ok(scenario.issues.length > 0);
      for (const issue of scenario.issues) {
        assert.ok(Number.isInteger(issue.issueNumber));
        assert.ok(issue.issueNumber > 0);
        assert.ok(issue.changeNote.trim().length > 0);
      }
    }
  }
});

test("issue 273 owns every theme-catalog surface including the shared New Run", () => {
  const issue273Scenarios = newScenarios.filter((scenario) =>
    scenario.issues.some(({ issueNumber }) => issueNumber === 273)
  );
  assert.deepEqual(issue273Scenarios.map((scenario) => scenario.id), [
    "practice-custom-setup",
    "history-populated",
    "history-filters",
    "history-attempt-detail"
  ]);
  assert.deepEqual(storyTagsForScenario("practice-custom-setup"), ["new"]);
  assert.deepEqual(storyTagsForScenario("history-populated"), ["new"]);
  assert.deepEqual(storyTagsForScenario("history-filters"), ["new"]);
  assert.deepEqual(storyTagsForScenario("history-attempt-detail"), ["new"]);
});

test("Issue 253 owns the complete run-management design track", () => {
  const issue253Scenarios = newScenarios.filter((scenario) =>
    scenario.issues.some(({ issueNumber }) => issueNumber === 253)
  );
  assert.deepEqual(
    issue253Scenarios.map((scenario) => scenario.id),
    [
      "practice-home",
      "practice-home-edit",
      "practice-custom-setup",
      "practice-run-name-validation",
      "practice-run-standard-editor",
      "practice-custom-rating-editor",
      "practice-run-remove-confirmation",
      "practice-runs-empty",
      "settings-advanced-ratings"
    ]
  );
  for (const scenario of issue253Scenarios) {
    assert.deepEqual(storyTagsForScenario(scenario.id), ["new"]);
  }
});
