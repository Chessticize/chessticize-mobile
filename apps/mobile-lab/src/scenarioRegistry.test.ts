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

test("Issue #247 stays on the existing Settings product clone with its approved scope", () => {
  assert.deepEqual(
    newScenarios
      .filter((scenario) => scenario.issues.some((issue) => issue.issueNumber === 247))
      .map((scenario) => scenario.id),
    ["settings-ios-sync"]
  );
  assert.deepEqual(storyTagsForScenario("settings-ios-sync"), ["new"]);
  assert.deepEqual(scenarioRegistry["settings-ios-sync"].scope.includes, [
    "iCloud Sync",
    "Notifications",
    "Sound and haptic toggles",
    "Move and capture audio previews",
    "About"
  ]);
  assert.equal(
    scenarioRegistry["practice-home"].issues?.some((issue) => issue.issueNumber === 247) ?? false,
    false
  );
});

test("Issue #337 keeps semantic Sprint guidance on the existing responsive Lab scenarios", () => {
  const activeSessionGuide = scenarioRegistry["practice-active-session-guide"];
  const arrowDuelGuide = scenarioRegistry["practice-arrow-duel-guide"];
  const firstSprintGuide = scenarioRegistry["practice-first-sprint-guide"];
  const settingsGuidance = scenarioRegistry["settings-sprint-guidance"];

  assert.ok(activeSessionGuide.scope.includes.includes(
    "SPRINT HEADER, SLOW, TIMED OUT, and UNCLEAR guidance"
  ));
  assert.ok(activeSessionGuide.scope.includes.includes(
    "Current-guide-only accessibility announcement"
  ));
  assert.ok(activeSessionGuide.scope.includes.includes(
    "Measured landscape connectors to the amber timer and Mark as unclear control"
  ));
  assert.match(activeSessionGuide.description, /terminate at the amber timer and Mark as unclear control/);
  assert.ok(arrowDuelGuide.scope.includes.includes("ARROW DUEL semantic callout"));
  assert.match(arrowDuelGuide.description, /single-line 5 of 5 guide progress/);
  assert.doesNotMatch(
    `${activeSessionGuide.description} ${arrowDuelGuide.description}`,
    /\b(?:step|tour)\b/i
  );
  assert.ok(firstSprintGuide.issues?.some(
    (issue) => issue.issueNumber === 337 && issue.changeNote.includes("fixed badge and copy columns")
  ));
  assert.ok(settingsGuidance.issues?.some(
    (issue) => issue.issueNumber === 337 && issue.changeNote.includes("immediately before Feedback")
  ));
});
