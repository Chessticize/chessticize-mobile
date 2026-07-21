import { execFileSync } from "node:child_process";
import newScenarioMarkerData from "../src/newScenarioMarkers.json" with { type: "json" };
import { newScenarios, scenarioRegistry } from "../src/scenarioRegistry.ts";
import {
  findRemovedScenarioMarkers,
  validateScenarioMarkers,
  type ScenarioMarkerRecord
} from "../src/scenarioMarkerPolicy.ts";

const markerErrors = validateScenarioMarkers(
  newScenarioMarkerData,
  new Set(Object.keys(scenarioRegistry))
);

if (markerErrors.length > 0) {
  console.error("Invalid New Scenario Markers:");
  for (const error of markerErrors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${newScenarios.length} issue-owned New Scenario Marker(s).`);
for (const scenario of newScenarios) {
  console.log(`- Issue #${scenario.issueNumber}: ${scenario.group} / ${scenario.title}`);
}

const baseRef = process.env.BASE_REF;
if (baseRef) {
  const baseMarkers = readBaseMarkers(baseRef);
  const removedMarkers = findRemovedScenarioMarkers(
    baseMarkers,
    newScenarioMarkerData as ScenarioMarkerRecord
  );

  if (removedMarkers.length === 0) {
    console.log("No New Scenario Markers were removed.");
  } else {
    await verifyRemovedMarkerIssuesAreClosed(removedMarkers);
  }
}

function readBaseMarkers(baseRef: string): ScenarioMarkerRecord {
  try {
    const json = execFileSync(
      "git",
      ["show", `${baseRef}:apps/mobile-lab/src/newScenarioMarkers.json`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return JSON.parse(json) as ScenarioMarkerRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("does not exist in") ||
      message.includes("exists on disk, but not in")
    ) {
      return {};
    }
    throw error;
  }
}

async function verifyRemovedMarkerIssuesAreClosed(
  removedMarkers: readonly { scenarioId: string; issueNumber: number }[]
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    throw new Error(
      "BASE_REF marker-removal checks require GITHUB_TOKEN and GITHUB_REPOSITORY."
    );
  }

  const issueStates = new Map<number, string>();
  for (const { issueNumber } of removedMarkers) {
    if (issueStates.has(issueNumber)) {
      continue;
    }
    const response = await fetch(
      `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );
    if (!response.ok) {
      throw new Error(
        `Unable to verify issue #${issueNumber}: GitHub returned ${response.status}.`
      );
    }
    const issue = (await response.json()) as { state?: string };
    issueStates.set(issueNumber, issue.state ?? "unknown");
  }

  const blocked = removedMarkers.filter(
    ({ issueNumber }) => issueStates.get(issueNumber) !== "closed"
  );
  if (blocked.length > 0) {
    console.error("New Scenario Markers may be removed only after their linked issues close:");
    for (const { scenarioId, issueNumber } of blocked) {
      console.error(`- ${scenarioId}: issue #${issueNumber} is ${issueStates.get(issueNumber)}.`);
    }
    process.exit(1);
  }

  for (const { scenarioId, issueNumber } of removedMarkers) {
    console.log(`Verified marker cleanup for ${scenarioId}: issue #${issueNumber} is closed.`);
  }
}
