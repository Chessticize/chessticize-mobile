export type ScenarioMarkerOwnership = {
  issueNumber: number;
  changeNote: string;
};

type LegacyScenarioMarker = ScenarioMarkerOwnership;

type AbsorbedIssueMarker = {
  count: number;
  issueNumber: number;
};

export type ScenarioMarkerRecord = Record<
  string,
  {
    absorbedIssueMarkers?: AbsorbedIssueMarker[];
    issues: ScenarioMarkerOwnership[];
  } | LegacyScenarioMarker
>;

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
    const { absorbedIssueMarkers, issues } = marker as Record<string, unknown>;
    if (!Array.isArray(issues) || issues.length === 0) {
      errors.push(`${scenarioId}: issues must be a non-empty array.`);
      continue;
    }
    const issueNumbers = new Set<number>();
    for (const [index, issue] of issues.entries()) {
      if (typeof issue !== "object" || issue === null || Array.isArray(issue)) {
        errors.push(`${scenarioId}: issues[${index}] must be an object.`);
        continue;
      }
      const { issueNumber, changeNote } = issue as Record<string, unknown>;
      if (!Number.isInteger(issueNumber) || (issueNumber as number) <= 0) {
        errors.push(`${scenarioId}: issues[${index}].issueNumber must be a positive integer.`);
      } else if (issueNumbers.has(issueNumber as number)) {
        errors.push(`${scenarioId}: issue #${issueNumber} is listed more than once.`);
      } else {
        issueNumbers.add(issueNumber as number);
      }
      if (typeof changeNote !== "string" || changeNote.trim().length === 0) {
        errors.push(`${scenarioId}: issues[${index}].changeNote must be a non-empty string.`);
      }
    }
    if (absorbedIssueMarkers === undefined) {
      continue;
    }
    if (!Array.isArray(absorbedIssueMarkers)) {
      errors.push(`${scenarioId}: absorbedIssueMarkers must be an array.`);
      continue;
    }
    const absorbedIssueNumbers = new Set<number>();
    for (const [index, absorbed] of absorbedIssueMarkers.entries()) {
      if (typeof absorbed !== "object" || absorbed === null || Array.isArray(absorbed)) {
        errors.push(`${scenarioId}: absorbedIssueMarkers[${index}] must be an object.`);
        continue;
      }
      const { issueNumber, count } = absorbed as Record<string, unknown>;
      if (!Number.isInteger(issueNumber) || (issueNumber as number) <= 0) {
        errors.push(
          `${scenarioId}: absorbedIssueMarkers[${index}].issueNumber must be a positive integer.`
        );
      } else if (!issueNumbers.has(issueNumber as number)) {
        errors.push(
          `${scenarioId}: absorbedIssueMarkers[${index}].issueNumber must also own this scenario.`
        );
      } else if (absorbedIssueNumbers.has(issueNumber as number)) {
        errors.push(
          `${scenarioId}: absorbedIssueMarkers issue #${issueNumber} is listed more than once.`
        );
      } else {
        absorbedIssueNumbers.add(issueNumber as number);
      }
      if (!Number.isInteger(count) || (count as number) <= 0) {
        errors.push(
          `${scenarioId}: absorbedIssueMarkers[${index}].count must be a positive integer.`
        );
      }
    }
  }
  return errors;
}

export function validateNewDesignMarkerReset(
  baseMarkers: ScenarioMarkerRecord,
  currentMarkers: ScenarioMarkerRecord
): string[] {
  const baseIssueNumbers = issueNumbersFor(baseMarkers);
  const currentIssueNumbers = issueNumbersFor(currentMarkers);
  const introducedIssueNumbers = [...currentIssueNumbers]
    .filter((issueNumber) => !baseIssueNumbers.has(issueNumber))
    .sort((left, right) => left - right);

  if (introducedIssueNumbers.length === 0) {
    return [];
  }

  const introducedLabel = introducedIssueNumbers
    .map((issueNumber) => `#${issueNumber}`)
    .join(", ");
  return Object.entries(currentMarkers).flatMap(([scenarioId, marker]) =>
    markerOwnerships(marker).flatMap(({ issueNumber }) =>
      baseIssueNumbers.has(issueNumber)
        ? [
            `${scenarioId}: reset prior issue #${issueNumber} before starting the new Storybook design for ${introducedLabel}.`
          ]
        : []
    )
  );
}

function issueNumbersFor(markers: ScenarioMarkerRecord): Set<number> {
  return new Set(
    Object.values(markers).flatMap((marker) =>
      markerOwnerships(marker).map(({ issueNumber }) => issueNumber)
    )
  );
}

function markerOwnerships(
  marker: ScenarioMarkerRecord[string]
): readonly ScenarioMarkerOwnership[] {
  return "issues" in marker ? marker.issues : [marker];
}
