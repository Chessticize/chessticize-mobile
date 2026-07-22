import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRemovedScenarioMarkerIssuesClosed,
  createGitHubIssueStateReader,
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

test("marker cleanup follows issue ownership across a corrective scenario move", () => {
  const baseMarkers = {
    "practice-home": { issueNumber: 245, changeNote: "First" },
    "review-due": { issueNumber: 246, changeNote: "Second" }
  };
  const currentMarkers = {
    "practice-custom-setup": { issueNumber: 245, changeNote: "Moved to the existing product screen" },
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

test("one remaining marker cannot hide partial cleanup for the same open issue", () => {
  const baseMarkers = {
    "practice-home": { issueNumber: 245, changeNote: "First changed scenario" },
    "practice-custom-setup": { issueNumber: 245, changeNote: "Second changed scenario" }
  };
  const currentMarkers = {
    "practice-custom-setup": { issueNumber: 245, changeNote: "Still under review" }
  };

  assert.deepEqual(findRemovedScenarioMarkers(baseMarkers, currentMarkers), [
    { scenarioId: "practice-home", issueNumber: 245 }
  ]);
});

test("marker removal passes only when every linked issue is closed", async () => {
  const reads: number[] = [];
  const messages = await assertRemovedScenarioMarkerIssuesClosed(
    [
      { scenarioId: "practice-home", issueNumber: 245 },
      { scenarioId: "practice-retry", issueNumber: 245 }
    ],
    async (issueNumber) => {
      reads.push(issueNumber);
      return "closed";
    }
  );

  assert.deepEqual(reads, [245]);
  assert.deepEqual(messages, [
    "Verified marker cleanup for practice-home: issue #245 is closed.",
    "Verified marker cleanup for practice-retry: issue #245 is closed."
  ]);
});

test("marker removal fails closed for open and unknown issue states", async () => {
  await assert.rejects(
    assertRemovedScenarioMarkerIssuesClosed(
      [
        { scenarioId: "practice-home", issueNumber: 245 },
        { scenarioId: "review-due", issueNumber: 246 }
      ],
      async (issueNumber) => (issueNumber === 245 ? "open" : "unknown")
    ),
    /practice-home: issue #245 is open[\s\S]*review-due: issue #246 is unknown/
  );
});

test("GitHub issue-state reader requires auth and fails on API errors", async () => {
  assert.throws(
    () => createGitHubIssueStateReader({ token: "", repository: "owner/repo" }),
    /require GITHUB_TOKEN and GITHUB_REPOSITORY/
  );

  const readIssueState = createGitHubIssueStateReader({
    token: "secret",
    repository: "owner/repo",
    fetchIssue: async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    })
  });
  await assert.rejects(readIssueState(245), /issue #245: GitHub returned 503/);
});

test("GitHub issue-state reader maps absent response state to unknown", async () => {
  const requests: Array<{ input: string; authorization: string }> = [];
  const readIssueState = createGitHubIssueStateReader({
    token: "secret",
    repository: "owner/repo",
    fetchIssue: async (input, init) => {
      requests.push({
        input,
        authorization: init.headers.Authorization ?? ""
      });
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });

  assert.equal(await readIssueState(245), "unknown");
  assert.deepEqual(requests, [
    {
      input: "https://api.github.com/repos/owner/repo/issues/245",
      authorization: "Bearer secret"
    }
  ]);
});
