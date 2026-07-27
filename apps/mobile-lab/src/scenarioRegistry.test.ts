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

test("the closed Issue #353 scenarios keep their stable URLs without new markers", () => {
  assert.deepEqual(
    newScenarios
      .filter((scenario) => scenario.issues.some((issue) => issue.issueNumber === 353))
      .map((scenario) => scenario.id),
    []
  );
  assert.deepEqual(storyTagsForScenario("settings-ios-sync-error-details"), []);
  assert.deepEqual(storyTagsForScenario("settings-ios-sync-support-bundle"), []);
  assert.deepEqual(storyTagsForScenario("settings-ios-sync-support-bundle-partial"), []);
  assert.equal(
    scenarioRegistry["settings-ios-sync-error-details"].storyId,
    "settings--i-cloud-sync-error-details"
  );
  assert.equal(
    scenarioRegistry["settings-ios-sync-support-bundle"].storyId,
    "settings--i-cloud-sync-support-bundle"
  );
  assert.equal(
    scenarioRegistry["settings-ios-sync-support-bundle-partial"].storyId,
    "settings--i-cloud-sync-support-bundle-partial"
  );
  assert.ok(
    scenarioRegistry["settings-ios-sync-support-bundle"].scope.includes.includes(
      "Help & Feedback placement"
    )
  );
  assert.ok(
    scenarioRegistry["settings-ios-sync-support-bundle-partial"].scope.includes.includes(
      "Explicit partial-bundle warning"
    )
  );
});

test("Issue #250 owns the complete Tactical Profile design state set", () => {
  assert.deepEqual(
    newScenarios
      .filter((scenario) => scenario.issues.some((issue) => issue.issueNumber === 250))
      .map((scenario) => scenario.id),
    [
      "practice-tactical-profile-building",
      "practice-tactical-profile-collecting",
      "practice-tactical-profile-balanced",
      "practice-tactical-profile-solve-rate",
      "practice-tactical-profile-speed",
      "practice-tactical-profile-ranked",
      "practice-tactical-profile-task-families-home",
      "practice-tactical-profile-task-families",
      "practice-tactical-profile-limited-inventory",
      "practice-tactical-profile-explanation",
      "practice-tactical-profile-focused-run",
      "practice-tactical-profile-suppressed",
      "practice-tactical-focus-guide",
      "practice-tactical-focus-active",
      "practice-tactical-focus-result"
    ]
  );
  assert.equal(
    scenarioRegistry["practice-tactical-profile-focused-run"].scope.includes
      .includes("Mixed-practice allocation"),
    true
  );
  assert.equal(
    scenarioRegistry["history-populated"].issues?.some((issue) => issue.issueNumber === 250) ?? false,
    false
  );
});

test("Issue #363 owns the History progress and clear-weakness flow", () => {
  assert.deepEqual(
    newScenarios
      .filter((scenario) => scenario.issues.some((issue) => issue.issueNumber === 363))
      .map((scenario) => scenario.id),
    ["history-progress", "history-progress-weakness"]
  );
  assert.deepEqual(storyTagsForScenario("history-progress"), ["new"]);
  assert.deepEqual(storyTagsForScenario("history-progress-weakness"), ["new"]);
  assert.ok(
    scenarioRegistry["history-progress"].scope.includes.includes(
      "Strength over time"
    )
  );
  assert.ok(
    scenarioRegistry["history-progress-weakness"].scope.includes.includes(
      "Plain-language statistical confidence"
    )
  );
  assert.ok(
    scenarioRegistry["history-progress"].scope.exits.includes(
      "Training recommendation"
    )
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
    "Measured landscape connectors routed around copy with target clearance"
  ));
  assert.ok(activeSessionGuide.scope.includes.includes(
    "Full-width production Unclear prompt in portrait"
  ));
  assert.ok(activeSessionGuide.scope.includes.includes(
    "Fixed-shape downward portrait arrows outside callout borders with target clearance"
  ));
  assert.ok(activeSessionGuide.scope.includes.includes(
    "Always-available direct guide exit without completion"
  ));
  assert.ok(activeSessionGuide.scope.includes.includes(
    "Raised portrait Timed Out callout with full pointer and board clearance"
  ));
  assert.match(activeSessionGuide.description, /full red pointer above that board/);
  assert.ok(arrowDuelGuide.scope.includes.includes("ARROW DUEL semantic callout"));
  assert.ok(arrowDuelGuide.scope.includes.includes("The arrows show your two choices"));
  assert.ok(arrowDuelGuide.scope.includes.includes("Portrait callout below the board"));
  assert.ok(arrowDuelGuide.scope.includes.includes("Landscape callout in the empty board lane"));
  assert.ok(arrowDuelGuide.scope.includes.includes(
    "Straight upward landscape connector stops clear of the candidate origin"
  ));
  assert.ok(arrowDuelGuide.scope.includes.includes(
    "Always-available direct guide exit without completion"
  ));
  assert.match(arrowDuelGuide.description, /two arrows are the user's two choices/);
  assert.match(arrowDuelGuide.description, /straight upward connector/);
  assert.match(arrowDuelGuide.description, /cannot read as a third move arrow/);
  const arrowDuelGuideOnly = scenarioRegistry["practice-arrow-duel-guide-only"];
  assert.ok(arrowDuelGuideOnly.scope.includes.includes(
    "Always-available direct guide exit without completion"
  ));
  assert.match(arrowDuelGuideOnly.description, /eligible for the next Arrow Duel/);
  assert.doesNotMatch(
    `${activeSessionGuide.description} ${arrowDuelGuide.description}`,
    /\b(?:step|tour)\b/i
  );
  assert.ok(firstSprintGuide.issues?.some(
    (issue) => issue.issueNumber === 337 && issue.changeNote.includes("Top-align")
  ));
  assert.ok(settingsGuidance.issues?.some(
    (issue) => issue.issueNumber === 337 && issue.changeNote.includes("immediately before Feedback")
  ));
});

test("Practice home keeps its merged value polish in the baseline scenario", () => {
  const home = scenarioRegistry["practice-home"];

  assert.ok(home.scope.includes.includes("Numeric trailing Ratings"));
  assert.ok(home.scope.includes.includes("Single Review status label"));
  assert.ok(home.scope.includes.includes("Centered Review workload count"));
  assert.ok(home.issues?.some((issue) => issue.issueNumber === 328));
  assert.equal(home.issues?.some((issue) => issue.issueNumber === 344), false);
  assert.deepEqual(storyTagsForScenario("practice-home"), ["new"]);
});

test("post-attempt handoffs explain Timeout, Wrong, and Slow-correct results", () => {
  const timedOut = scenarioRegistry["practice-timing-timeout"];
  const afterTimeout = scenarioRegistry["practice-timeout-review-notice"];
  const afterWrong = scenarioRegistry["practice-wrong-review-notice"];
  const afterSlow = scenarioRegistry["practice-slow-unclear-notice"];

  assert.ok(timedOut.scope.includes.includes("Post-timeout mistake, Review, and no-Unclear notice"));
  assert.match(timedOut.description, /explains that the mistake entered Review instead of Unclear/);
  assert.equal(afterTimeout.storyId, "practice--timeout-review-notice");
  assert.ok(afterTimeout.scope.includes.includes("Read-only In Review notice"));
  assert.ok(afterTimeout.scope.includes.includes("No Unclear question"));
  assert.match(afterTimeout.description, /replaces the Unclear question/);
  assert.equal(afterWrong.storyId, "practice--wrong-review-notice");
  assert.ok(afterWrong.scope.includes.includes("Wrong counted as a mistake"));
  assert.ok(afterWrong.scope.includes.includes("No Unclear question"));
  assert.match(afterWrong.description, /previous answer was incorrect/);
  assert.equal(afterSlow.storyId, "practice--slow-unclear-notice");
  assert.ok(afterSlow.scope.includes.includes("Slow correct auto-marked Unclear"));
  assert.ok(afterSlow.scope.includes.includes("No manual Unclear action"));
  assert.match(afterSlow.description, /automatically marked Unclear/);
});
