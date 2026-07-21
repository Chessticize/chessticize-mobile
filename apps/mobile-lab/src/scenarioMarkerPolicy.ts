export type ScenarioMarkerRecord = Record<
  string,
  { issueNumber: number; changeNote: string }
>;

export type RemovedScenarioMarker = {
  scenarioId: string;
  issueNumber: number;
};

export function validateScenarioMarkers(
  value: unknown,
  knownScenarioIds: ReadonlySet<string>
): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["New Scenario Markers must be a JSON object."];
  }

  const errors: string[] = [];
  for (const [scenarioId, marker] of Object.entries(value)) {
    if (!knownScenarioIds.has(scenarioId)) {
      errors.push(`${scenarioId}: scenario is not registered.`);
    }
    if (typeof marker !== "object" || marker === null || Array.isArray(marker)) {
      errors.push(`${scenarioId}: marker must be an object.`);
      continue;
    }
    const { issueNumber, changeNote } = marker as Record<string, unknown>;
    if (!Number.isInteger(issueNumber) || (issueNumber as number) <= 0) {
      errors.push(`${scenarioId}: issueNumber must be a positive integer.`);
    }
    if (typeof changeNote !== "string" || changeNote.trim().length === 0) {
      errors.push(`${scenarioId}: changeNote must be a non-empty string.`);
    }
  }
  return errors;
}

export function findRemovedScenarioMarkers(
  baseMarkers: ScenarioMarkerRecord,
  currentMarkers: ScenarioMarkerRecord
): RemovedScenarioMarker[] {
  return Object.entries(baseMarkers).flatMap(([scenarioId, marker]) => {
    const currentMarker = currentMarkers[scenarioId];
    return currentMarker?.issueNumber === marker.issueNumber
      ? []
      : [{ scenarioId, issueNumber: marker.issueNumber }];
  });
}
