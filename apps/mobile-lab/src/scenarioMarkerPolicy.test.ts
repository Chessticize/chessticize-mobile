import assert from "node:assert/strict";
import test from "node:test";
import {
  validateNewDesignMarkerReset,
  validateScenarioMarkers
} from "./scenarioMarkerPolicy.ts";

test("New Scenario Marker records require registered scenarios and complete issue metadata", () => {
  const knownScenarioIds = new Set(["practice-home"]);
  assert.deepEqual(
    validateScenarioMarkers(
      {
        "practice-home": {
          issues: [
            { issueNumber: 245, changeNote: "Try multiple themes." },
            { issueNumber: 246, changeNote: "Name the saved run." }
          ]
        }
      },
      knownScenarioIds
    ),
    []
  );
  assert.deepEqual(
    validateScenarioMarkers(
      {
        missing: {
          issues: [
            { issueNumber: 0, changeNote: "" },
            { issueNumber: 247, changeNote: "Valid ownership." },
            { issueNumber: 247, changeNote: "Duplicate ownership." }
          ]
        }
      },
      knownScenarioIds
    ),
    [
      "missing: scenario is not registered.",
      "missing: issues[0].issueNumber must be a positive integer.",
      "missing: issues[0].changeNote must be a non-empty string.",
      "missing: issue #247 is listed more than once."
    ]
  );
  assert.deepEqual(
    validateScenarioMarkers({ "practice-home": { issues: [] } }, knownScenarioIds),
    ["practice-home: issues must be a non-empty array."]
  );
  assert.deepEqual(
    validateScenarioMarkers(
      {
        "practice-home": {
          issues: [{ issueNumber: 245, changeNote: "Owned change." }],
          absorbedIssueMarkers: [
            { issueNumber: 246, count: 1 },
            { issueNumber: 245, count: 0 },
            { issueNumber: 245, count: 1 }
          ]
        }
      },
      knownScenarioIds
    ),
    [
      "practice-home: absorbedIssueMarkers[0].issueNumber must also own this scenario.",
      "practice-home: absorbedIssueMarkers[1].count must be a positive integer.",
      "practice-home: absorbedIssueMarkers issue #245 is listed more than once."
    ]
  );
});

test("a new Storybook design rejects every retained marker from earlier issues", () => {
  const baseMarkers = {
    "practice-home": {
      issues: [{ issueNumber: 245, changeNote: "Earlier Practice design" }]
    },
    "review-overdue": {
      issues: [{ issueNumber: 246, changeNote: "Earlier Review design" }]
    }
  };
  const currentMarkers = {
    "practice-home": {
      issues: [{ issueNumber: 245, changeNote: "Stale marker" }]
    },
    "review-due": {
      issues: [{ issueNumber: 520, changeNote: "Current Review Home design" }]
    }
  };

  assert.deepEqual(validateNewDesignMarkerReset(baseMarkers, currentMarkers), [
    "practice-home: reset prior issue #245 before starting the new Storybook design for #520."
  ]);
});

test("a new Storybook design passes after all earlier markers are reset", () => {
  const baseMarkers = {
    "practice-home": {
      issues: [{ issueNumber: 245, changeNote: "Earlier Practice design" }]
    },
    "review-overdue": {
      issues: [{ issueNumber: 246, changeNote: "Earlier Review design" }]
    }
  };
  const currentMarkers = {
    "review-due": {
      issues: [{ issueNumber: 520, changeNote: "Current Review Home design" }]
    }
  };

  assert.deepEqual(validateNewDesignMarkerReset(baseMarkers, currentMarkers), []);
});

test("same-issue Storybook follow-ups may move or remove their current markers", () => {
  const baseMarkers = {
    "review-overdue": {
      issues: [{ issueNumber: 520, changeNote: "Initial placement" }]
    }
  };

  assert.deepEqual(
    validateNewDesignMarkerReset(baseMarkers, {
      "review-due": {
        issues: [{ issueNumber: 520, changeNote: "Corrected Review Home placement" }]
      }
    }),
    []
  );
  assert.deepEqual(validateNewDesignMarkerReset(baseMarkers, {}), []);
});
