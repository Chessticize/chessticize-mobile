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
  const completedComparison = incoming.completedAt.localeCompare(local.completedAt);
  const preferredBase = completedComparison === 0
    ? (incoming.startedAt >= local.startedAt ? incoming : local)
    : (completedComparison > 0 ? incoming : local);
  const clarity = preferredClarity(local, incoming);
  const { unclear: _unclear, unclearUpdatedAt: _unclearUpdatedAt, ...base } = cloneAttemptHistoryRow(preferredBase);
  return {
    ...base,
    ...(clarity.updatedAt === undefined
      ? {}
      : { unclear: clarity.unclear, unclearUpdatedAt: clarity.updatedAt })
  };
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
  if (attempt.source !== "sprint" || attempt.result !== "correct" || !attempt.unclearUpdatedAt) {
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
