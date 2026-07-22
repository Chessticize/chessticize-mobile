export type ScenarioMarkerOwnership = {
  issueNumber: number;
  changeNote: string;
};

type LegacyScenarioMarker = ScenarioMarkerOwnership;

export type ScenarioMarkerRecord = Record<
  string,
  { issues: ScenarioMarkerOwnership[] } | LegacyScenarioMarker
>;

export type RemovedScenarioMarker = {
  scenarioId: string;
  issueNumber: number;
};

export type IssueStateReader = (issueNumber: number) => Promise<string>;

type FetchIssueResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type FetchIssue = (
  input: string,
  init: { headers: Record<string, string> }
) => Promise<FetchIssueResponse>;

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
    const { issues } = marker as Record<string, unknown>;
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
  }
  return errors;
}

export function findRemovedScenarioMarkers(
  baseMarkers: ScenarioMarkerRecord,
  currentMarkers: ScenarioMarkerRecord
): RemovedScenarioMarker[] {
  const baseIssueMarkerCounts = countMarkersByIssue(baseMarkers);
  const currentIssueMarkerCounts = countMarkersByIssue(currentMarkers);
  return Object.entries(baseMarkers).flatMap(([scenarioId, marker]) => {
    const currentMarker = currentMarkers[scenarioId];
    const currentIssueNumbers = new Set(
      currentMarker ? markerOwnerships(currentMarker).map(({ issueNumber }) => issueNumber) : []
    );
    return markerOwnerships(marker).flatMap(({ issueNumber }) => {
      const isOneToOneMove = baseIssueMarkerCounts.get(issueNumber) === 1 &&
        currentIssueMarkerCounts.get(issueNumber) === 1;
      return currentIssueNumbers.has(issueNumber) || isOneToOneMove
        ? []
        : [{ scenarioId, issueNumber }];
    });
  });
}

function countMarkersByIssue(markers: ScenarioMarkerRecord): Map<number, number> {
  const counts = new Map<number, number>();
  for (const marker of Object.values(markers)) {
    for (const { issueNumber } of markerOwnerships(marker)) {
      counts.set(issueNumber, (counts.get(issueNumber) ?? 0) + 1);
    }
  }
  return counts;
}

function markerOwnerships(
  marker: ScenarioMarkerRecord[string]
): readonly ScenarioMarkerOwnership[] {
  return "issues" in marker ? marker.issues : [marker];
}

export function createGitHubIssueStateReader({
  token,
  repository,
  fetchIssue = fetch
}: {
  token?: string | undefined;
  repository?: string | undefined;
  fetchIssue?: FetchIssue;
}): IssueStateReader {
  if (!token || !repository) {
    throw new Error(
      "BASE_REF marker-removal checks require GITHUB_TOKEN and GITHUB_REPOSITORY."
    );
  }

  return async (issueNumber) => {
    const response = await fetchIssue(
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

    const issue = (await response.json()) as { state?: unknown };
    return typeof issue.state === "string" ? issue.state : "unknown";
  };
}

export async function assertRemovedScenarioMarkerIssuesClosed(
  removedMarkers: readonly RemovedScenarioMarker[],
  readIssueState: IssueStateReader
): Promise<string[]> {
  const issueStates = new Map<number, string>();
  for (const { issueNumber } of removedMarkers) {
    if (!issueStates.has(issueNumber)) {
      issueStates.set(issueNumber, await readIssueState(issueNumber));
    }
  }

  const blocked = removedMarkers.filter(
    ({ issueNumber }) => issueStates.get(issueNumber) !== "closed"
  );
  if (blocked.length > 0) {
    throw new Error(
      [
        "New Scenario Markers may be removed only after their linked issues close:",
        ...blocked.map(
          ({ scenarioId, issueNumber }) =>
            `- ${scenarioId}: issue #${issueNumber} is ${issueStates.get(issueNumber)}.`
        )
      ].join("\n")
    );
  }

  return removedMarkers.map(
    ({ scenarioId, issueNumber }) =>
      `Verified marker cleanup for ${scenarioId}: issue #${issueNumber} is closed.`
  );
}
