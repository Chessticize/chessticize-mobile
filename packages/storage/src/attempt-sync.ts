import type { AttemptHistoryRow } from "./query-types.ts";

export function cloneAttemptHistoryRow(attempt: AttemptHistoryRow): AttemptHistoryRow {
  const { unclear: _unclear, unclearUpdatedAt: _unclearUpdatedAt, ...base } = attempt;
  const clarity = normalizedClarity(attempt);
  return {
    ...base,
    ...(attempt.arrowDuelCandidateOrder === undefined
      ? {}
      : { arrowDuelCandidateOrder: [...attempt.arrowDuelCandidateOrder] }),
    ...(clarity.updatedAt === undefined
      ? {}
      : { unclear: clarity.unclear, unclearUpdatedAt: clarity.updatedAt })
  };
}

export function preferredAttemptHistoryRow(
  local: AttemptHistoryRow,
  incoming: AttemptHistoryRow
): AttemptHistoryRow {
  const preferredBase = compareAttemptVersions(local, incoming) >= 0
    ? local
    : incoming;
  const clarity = preferredClarity(local, incoming);
  const { unclear: _unclear, unclearUpdatedAt: _unclearUpdatedAt, ...base } = cloneAttemptHistoryRow(preferredBase);
  return {
    ...base,
    ...(clarity.updatedAt === undefined
      ? {}
      : { unclear: clarity.unclear, unclearUpdatedAt: clarity.updatedAt })
  };
}

function compareAttemptVersions(left: AttemptHistoryRow, right: AttemptHistoryRow): number {
  const completedComparison = left.completedAt.localeCompare(right.completedAt);
  if (completedComparison !== 0) {
    return completedComparison;
  }
  const startedComparison = left.startedAt.localeCompare(right.startedAt);
  if (startedComparison !== 0) {
    return startedComparison;
  }
  const completenessComparison = attemptCompleteness(left) - attemptCompleteness(right);
  if (completenessComparison !== 0) {
    return completenessComparison;
  }
  return stableAttemptValue(left).localeCompare(stableAttemptValue(right));
}

function attemptCompleteness(attempt: AttemptHistoryRow): number {
  return Number(attempt.submittedMove !== undefined) +
    Number(attempt.elapsedMs !== undefined) +
    Number(attempt.timingStatus !== undefined) +
    Number(attempt.ratingAfter !== undefined) +
    Number(attempt.arrowDuelCandidateOrder !== undefined) +
    Number(attempt.runId !== undefined) +
    Number(attempt.runName !== undefined);
}

function stableAttemptValue(attempt: AttemptHistoryRow): string {
  return JSON.stringify([
    attempt.id,
    attempt.source,
    attempt.sessionId,
    attempt.puzzleId,
    attempt.mode,
    attempt.ratingKey,
    attempt.result,
    attempt.submittedMove ?? null,
    attempt.expectedMove,
    attempt.elapsedMs ?? null,
    attempt.timingStatus ?? null,
    attempt.ratingBefore,
    attempt.ratingAfter ?? null,
    attempt.arrowDuelCandidateOrder ?? null,
    attempt.runId ?? null,
    attempt.runName ?? null
  ]);
}

export function sameAttemptHistoryRow(
  left: AttemptHistoryRow | undefined,
  right: AttemptHistoryRow
): boolean {
  if (!left) {
    return false;
  }
  return JSON.stringify(cloneAttemptHistoryRow(left)) === JSON.stringify(cloneAttemptHistoryRow(right));
}

function preferredClarity(
  local: AttemptHistoryRow,
  incoming: AttemptHistoryRow
): { unclear: boolean; updatedAt?: string } {
  const localClarity = normalizedClarity(local);
  const incomingClarity = normalizedClarity(incoming);
  if (localClarity.updatedAt === undefined) {
    return incomingClarity;
  }
  if (incomingClarity.updatedAt === undefined) {
    return localClarity;
  }
  const comparison = incomingClarity.updatedAt.localeCompare(localClarity.updatedAt);
  if (comparison > 0) {
    return incomingClarity;
  }
  if (comparison < 0) {
    return localClarity;
  }
  return {
    unclear: localClarity.unclear && incomingClarity.unclear,
    updatedAt: localClarity.updatedAt
  };
}

function normalizedClarity(attempt: AttemptHistoryRow): { unclear: boolean; updatedAt?: string } {
  if (
    attempt.source !== "sprint" ||
    (attempt.result !== "correct" && attempt.result !== "timed_out") ||
    !attempt.unclearUpdatedAt
  ) {
    return { unclear: false };
  }
  const updatedAt = new Date(attempt.unclearUpdatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    return { unclear: false };
  }
  return {
    unclear: Boolean(attempt.unclear),
    updatedAt: updatedAt.toISOString()
  };
}
