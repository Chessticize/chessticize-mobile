import { execFileSync } from "node:child_process";
import newScenarioMarkerData from "../src/newScenarioMarkers.json" with { type: "json" };
import { newScenarios, scenarioRegistry } from "../src/scenarioRegistry.ts";
import {
  assertRemovedScenarioMarkerIssuesClosed,
  createGitHubIssueStateReader,
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
  const readIssueState = createGitHubIssueStateReader({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY
  });
  const messages = await assertRemovedScenarioMarkerIssuesClosed(
    removedMarkers,
    readIssueState
  );
  for (const message of messages) {
    console.log(message);
  }
}
