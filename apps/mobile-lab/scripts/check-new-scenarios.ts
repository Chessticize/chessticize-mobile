import { execFileSync } from "node:child_process";
import newScenarioMarkerData from "../src/newScenarioMarkers.json" with { type: "json" };
import { newScenarios, scenarioRegistry } from "../src/scenarioRegistry.ts";
import {
  validateNewDesignMarkerReset,
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
  const issues = scenario.issues.map(({ issueNumber }) => `#${issueNumber}`).join(", ");
  console.log(`- Issues ${issues}: ${scenario.group} / ${scenario.title}`);
}

const baseRef = process.env.BASE_REF;
if (baseRef) {
  const baseMarkers = readBaseMarkers(baseRef);
  const resetErrors = validateNewDesignMarkerReset(
    baseMarkers,
    newScenarioMarkerData as ScenarioMarkerRecord
  );

  if (resetErrors.length > 0) {
    console.error("Previous New Scenario Markers must be reset:");
    for (const error of resetErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log("Validated New Scenario Marker reset for the current Storybook design.");
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
