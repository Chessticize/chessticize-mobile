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
  assert.ok(scenario.scope.includes.includes("Blue read-only Marked status"));
  assert.equal(scenario.isNew ?? false, false);
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

test("New Scenario Markers derive catalog tags from issue ownership", () => {
  const scenarios = Object.values(scenarioRegistry);
  assert.deepEqual(newScenarios, scenarios.filter((scenario) => scenario.isNew));
  assert.deepEqual(
    newScenarios.map((scenario) => scenario.id),
    ["review-due"]
  );
  assert.ok(scenarioRegistry["review-due"].issues?.some(
    (issue) => issue.issueNumber === 520
  ) ?? false);
  assert.equal(scenarioRegistry["review-due"].title, "Home");
  assert.equal(scenarioRegistry["review-due"].storyId, "review--due-queue");

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

test("closed Issue #482 keeps the production Incomplete states without new markers", () => {
  for (const scenarioId of [
    "history-populated",
    "history-filters",
    "practice-sprint-result-incomplete"
  ] as const) {
    const scenario = scenarioRegistry[scenarioId];
    assert.equal(
      scenario.issues?.some((issue) => issue.issueNumber === 482) ?? false,
      false
    );
    assert.deepEqual(storyTagsForScenario(scenarioId), []);
  }
  assert.ok(
    scenarioRegistry["history-populated"].scope.includes.includes("Production Incomplete outcome")
  );
  assert.ok(
    scenarioRegistry["history-populated"].scope.includes.includes("Accuracy excludes Incomplete")
  );
  assert.ok(
    scenarioRegistry["history-populated"].scope.includes.includes("Exact-attempt Unclear action")
  );
  assert.ok(
    scenarioRegistry["history-filters"].scope.includes.includes("Incomplete Result filter")
  );
  assert.ok(
    scenarioRegistry["history-filters"].scope.includes.includes("Incomplete Attention reason")
  );
  assert.ok(
    scenarioRegistry["practice-sprint-result-incomplete"].scope.includes.includes(
      "Exact final-attempt Unclear action"
    )
  );
  assert.match(
    scenarioRegistry["practice-sprint-result-incomplete"].description,
    /Was the final puzzle unclear/
  );
});

test("the issue #272 preview hands the board to White after the blunder", () => {
  const chess = new Chess(ISSUE_272_LAB_PUZZLE.initialFen);

  chess.move(ISSUE_272_LAB_PUZZLE.solutionMoves[0]!);

  assert.equal(chess.turn(), "w");
  assert.equal(chess.fen(), "8/3k4/8/8/8/8/4P3/4K3 w - - 1 2");
});

test("the closed Issue #247 clone keeps its approved Settings scope without a new marker", () => {
  assert.deepEqual(
    newScenarios
      .filter((scenario) => scenario.issues.some((issue) => issue.issueNumber === 247))
      .map((scenario) => scenario.id),
    []
  );
  assert.deepEqual(storyTagsForScenario("settings-ios-sync"), []);
  assert.deepEqual(scenarioRegistry["settings-ios-sync"].scope.includes, [
    "iCloud Sync",
    "Notifications",
    "Sound and haptic toggles",
    "Move and capture audio previews",
    "Guidance reset",
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

test("the closed Issue #250 state set stays complete without new markers", () => {
  const tacticalScenarioIds = [
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
  ] satisfies LabScenarioId[];

  for (const scenarioId of tacticalScenarioIds) {
    assert.ok(scenarioRegistry[scenarioId]);
    assert.deepEqual(storyTagsForScenario(scenarioId), []);
  }
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

test("the closed Issue #363 scenarios keep their stable URLs without Issue #363 markers", () => {
  assert.deepEqual(
    newScenarios
      .filter((scenario) => scenario.issues.some((issue) => issue.issueNumber === 363))
      .map((scenario) => scenario.id),
    []
  );
  assert.equal(
    scenarioRegistry["history-populated"].issues?.some((issue) => issue.issueNumber === 363) ?? false,
    false
  );
  assert.deepEqual(storyTagsForScenario("history-populated"), []);
  assert.deepEqual(storyTagsForScenario("history-progress"), []);
  assert.deepEqual(storyTagsForScenario("history-progress-weakness"), []);
  assert.deepEqual(storyTagsForScenario("history-progress-speed-weakness"), []);
  assert.ok(
    scenarioRegistry["history-progress"].scope.includes.includes(
      "Progress over time"
    )
  );
  assert.ok(
    scenarioRegistry["history-progress-weakness"].scope.includes.includes(
      "Solve reliability effect"
    )
  );
  assert.ok(
    scenarioRegistry["history-progress-speed-weakness"].scope.includes.includes(
      "Reliable elapsed-time eligibility"
    )
  );
  assert.ok(
    scenarioRegistry["history-progress"].scope.exits.includes(
      "Training recommendation"
    )
  );
});

test("the closed Issue #456 keeps the Tactical Progress filters without a new marker", () => {
  const scenario = scenarioRegistry["history-progress"];

  assert.equal(
    scenario.issues?.some((issue) => issue.issueNumber === 456) ?? false,
    false
  );
  assert.equal(scenario.isNew ?? false, false);
  assert.deepEqual(storyTagsForScenario(scenario.id), []);
  assert.ok(
    scenario.scope.includes.includes("Page-level theme selector")
  );
  assert.ok(
    scenario.scope.includes.includes(
      "Compact Puzzle solving and Arrow Duel selector"
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
  assert.ok(arrowDuelGuide.scope.includes.includes("Two-step Arrow Duel mental model"));
  assert.ok(arrowDuelGuide.scope.includes.includes("Guide 5: choose the stronger move"));
  assert.ok(arrowDuelGuide.scope.includes.includes("Guide 6: Find the reply for Black"));
  assert.ok(arrowDuelGuide.scope.includes.includes("Legal Qg7 and Qe8 candidate arrows"));
  assert.ok(arrowDuelGuide.scope.includes.includes("Portrait callout below the board"));
  assert.ok(arrowDuelGuide.scope.includes.includes("Landscape callout in the empty board lane"));
  assert.ok(arrowDuelGuide.scope.includes.includes(
    "Always-available direct guide exit without completion"
  ));
  assert.match(arrowDuelGuide.description, /reply for Black/);
  assert.match(arrowDuelGuide.description, /familiarity-timing internals out/);
  const arrowDuelGuideOnly = scenarioRegistry["practice-arrow-duel-guide-only"];
  assert.ok(arrowDuelGuideOnly.scope.includes.includes(
    "Always-available direct guide exit without completion"
  ));
  assert.match(arrowDuelGuideOnly.description, /eligible for the next Arrow Duel/);
  assert.doesNotMatch(
    `${activeSessionGuide.description} ${arrowDuelGuide.description}`,
    /\b(?:step|tour)\b/i
  );
  assert.deepEqual(storyTagsForScenario(firstSprintGuide.id), []);
  assert.deepEqual(storyTagsForScenario(settingsGuidance.id), []);
});

test("Practice home keeps its merged value polish in the baseline scenario", () => {
  const home = scenarioRegistry["practice-home"];

  assert.ok(home.scope.includes.includes("Numeric trailing Ratings"));
  assert.ok(home.scope.includes.includes("Single Review status label"));
  assert.ok(home.scope.includes.includes("Centered Review workload count"));
  assert.ok(home.scope.includes.includes("Training Focus card"));
  assert.ok(home.scope.includes.includes("Collecting-evidence state"));
  assert.ok(home.scope.includes.includes("Tactical Profile entry"));
  assert.match(home.description, /Training Focus collecting-evidence state/);
  assert.deepEqual(storyTagsForScenario("practice-home"), []);
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

test("closed Issue #390 keeps its Replay states without new markers", () => {
  const historyReplay = scenarioRegistry["history-attempt-detail"];
  const result = scenarioRegistry["practice-sprint-result-goal"];
  const replay = scenarioRegistry["practice-sprint-result-replay"];
  const issueScenarioIds = [
    "history-attempt-detail",
    "history-replay-unavailable",
    "practice-slow-unclear-notice",
    "practice-sprint-result-goal",
    "practice-sprint-result-replay",
    "practice-unclear-follow-up"
  ] as const;

  for (const scenarioId of issueScenarioIds) {
    const scenario = scenarioRegistry[scenarioId];
    assert.equal(
      scenario.issues?.some((issue) => issue.issueNumber === 390) ?? false,
      false
    );
    assert.deepEqual(storyTagsForScenario(scenarioId), []);
  }
  assert.match(historyReplay.description, /Replay terminology/);
  assert.equal(result.storyId, "practice--sprint-result-goal-clarity");
  assert.ok(result.scope.includes.includes("Neutral replay entry"));
  assert.match(result.description, /two Unclear and two In Review/);
  assert.equal(replay.storyId, "practice--sprint-result-flagged-replay");
  assert.ok(replay.scope.includes.includes("Four-attempt Replay"));
  assert.ok(replay.scope.includes.includes("Mark clear"));
  assert.ok(replay.scope.includes.includes("Remove from Review"));
  assert.ok(replay.scope.exits.includes("New replay status badges"));
  assert.match(replay.description, /existing actions instead of new status badges/);
});

test("closed Issue #415 keeps its stable story without a new marker", () => {
  const scenario = scenarioRegistry["practice-app-store-review-request"];

  assert.equal(
    scenario.storyId,
    "practice--app-store-review-request-eligible-puzzle-milestone"
  );
  assert.equal(scenario.isNew ?? false, false);
  assert.deepEqual(storyTagsForScenario(scenario.id), []);
  assert.equal(
    newScenarios.some((candidate) =>
      candidate.issues?.some((issue) => issue.issueNumber === 415)
    ),
    false
  );
  assert.ok(scenario.scope.includes.includes("Four successful puzzle Sprints"));
  assert.ok(scenario.scope.includes.includes("At least two local dates"));
  assert.ok(scenario.scope.includes.includes("No custom pre-prompt"));
  assert.ok(scenario.scope.exits.includes("Apple StoreKit review sheet"));
  assert.match(scenario.description, /successful puzzle Sprint Result/);
  assert.match(scenario.nativeBoundary?.detail ?? "", /puzzle result remains usable/);
  assert.doesNotMatch(
    `${scenario.title} ${scenario.description} ${scenario.nativeBoundary?.detail ?? ""}`,
    /\btactics?\b/i
  );
});
