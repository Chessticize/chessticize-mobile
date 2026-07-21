export type ScenarioMarkerRecord = Record<
  string,
  { issueNumber: number; changeNote: string }
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

export function createGitHubIssueStateReader({
  token,
  repository,
  fetchIssue = fetch
}: {
  token?: string;
  repository?: string;
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
