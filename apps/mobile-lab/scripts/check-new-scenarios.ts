import { newScenarios } from "../src/scenarioRegistry.ts";

const markersAllowed = process.env.ALLOW_NEW_SCENARIOS === "true";

if (newScenarios.length > 0 && !markersAllowed) {
  console.error("New Scenario Markers must be cleared before a ready PR or main build:");
  for (const scenario of newScenarios) {
    console.error(`- ${scenario.group} / ${scenario.title}: ${scenario.changeNote}`);
  }
  process.exitCode = 1;
} else if (newScenarios.length > 0) {
  console.log(`Draft design review includes ${newScenarios.length} New Scenario Marker(s).`);
} else {
  console.log("No active New Scenario Markers.");
}
