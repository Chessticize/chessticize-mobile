import assert from "node:assert/strict";
import test from "node:test";
import {
  findRemovedScenarioMarkers,
  validateScenarioMarkers
} from "./scenarioMarkerPolicy.ts";

test("New Scenario Marker records require registered scenarios and complete issue metadata", () => {
  const knownScenarioIds = new Set(["practice-home"]);
  assert.deepEqual(
    validateScenarioMarkers(
      {
        "practice-home": { issueNumber: 245, changeNote: "Try multiple themes." }
      },
      knownScenarioIds
    ),
    []
  );
  assert.deepEqual(
    validateScenarioMarkers(
      {
        missing: { issueNumber: 0, changeNote: "" }
      },
      knownScenarioIds
    ),
    [
      "missing: scenario is not registered.",
      "missing: issueNumber must be a positive integer.",
      "missing: changeNote must be a non-empty string."
    ]
  );
});

test("marker removal includes deleted and reassigned scenario ownership", () => {
  const baseMarkers = {
    "practice-home": { issueNumber: 245, changeNote: "First" },
    "review-due": { issueNumber: 246, changeNote: "Second" }
  };
  const currentMarkers = {
    "practice-home": { issueNumber: 245, changeNote: "Updated" },
    "review-due": { issueNumber: 247, changeNote: "Reassigned" }
  };

  assert.deepEqual(findRemovedScenarioMarkers(baseMarkers, currentMarkers), [
    { scenarioId: "review-due", issueNumber: 246 }
  ]);
  assert.deepEqual(findRemovedScenarioMarkers(baseMarkers, {}), [
    { scenarioId: "practice-home", issueNumber: 245 },
    { scenarioId: "review-due", issueNumber: 246 }
  ]);
});
