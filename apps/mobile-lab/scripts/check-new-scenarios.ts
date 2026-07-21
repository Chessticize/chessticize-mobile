import { newScenarios } from "../src/scenarioRegistry.ts";

const invalidScenarios = newScenarios.filter(
  (scenario) =>
    !Number.isInteger(scenario.issueNumber) ||
    scenario.issueNumber <= 0 ||
    scenario.changeNote.trim().length === 0
);

if (invalidScenarios.length > 0) {
  console.error("New Scenario Markers must identify a positive GitHub issue and describe the change:");
  for (const scenario of invalidScenarios) {
    console.error(`- ${scenario.group} / ${scenario.title}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Validated ${newScenarios.length} issue-owned New Scenario Marker(s).`);
  for (const scenario of newScenarios) {
    console.log(`- Issue #${scenario.issueNumber}: ${scenario.group} / ${scenario.title}`);
  }
}
