import type { ExportedSprintSession } from "./practice-store.ts";

export function preferredSprintSession(
  left: ExportedSprintSession,
  right: ExportedSprintSession
): ExportedSprintSession {
  const comparison = compareSprintSessionVersions(left, right);
  const preferred = comparison >= 0 ? left : right;
  const other = comparison >= 0 ? right : left;
  const ratingGeneration = knownRatingGeneration(preferred, other);
  return {
    ...preferred,
    ...(ratingGeneration === undefined ? {} : { ratingGeneration })
  };
}

export function sameSprintSession(
  left: ExportedSprintSession | undefined,
  right: ExportedSprintSession
): boolean {
  return left !== undefined &&
    left.id === right.id &&
    left.mode === right.mode &&
    left.ratingKey === right.ratingKey &&
    left.ratingGeneration === right.ratingGeneration &&
    left.startedAt === right.startedAt &&
    left.completedAt === right.completedAt &&
    left.status === right.status &&
    left.correctCount === right.correctCount &&
    left.mistakeCount === right.mistakeCount &&
    left.ratingBefore === right.ratingBefore &&
    left.ratingAfter === right.ratingAfter;
}

function compareSprintSessionVersions(
  left: ExportedSprintSession,
  right: ExportedSprintSession
): number {
  if (isOpen(left) && isSyntheticImportedFailure(right)) {
    return 1;
  }
  if (isOpen(right) && isSyntheticImportedFailure(left)) {
    return -1;
  }
  const completedComparison = effectiveCompletedAt(left).localeCompare(effectiveCompletedAt(right));
  if (completedComparison !== 0) {
    return completedComparison;
  }
  const terminalComparison = Number(isTerminal(left)) - Number(isTerminal(right));
  if (terminalComparison !== 0) {
    return terminalComparison;
  }
  const ratedComparison = Number(left.ratingAfter !== undefined) - Number(right.ratingAfter !== undefined);
  if (ratedComparison !== 0) {
    return ratedComparison;
  }
  const progressComparison =
    left.correctCount + left.mistakeCount - right.correctCount - right.mistakeCount;
  if (progressComparison !== 0) {
    return progressComparison;
  }
  const startedComparison = left.startedAt.localeCompare(right.startedAt);
  if (startedComparison !== 0) {
    return startedComparison;
  }
  return stableSessionKey(left).localeCompare(stableSessionKey(right));
}

function effectiveCompletedAt(session: ExportedSprintSession): string {
  return session.completedAt ?? session.startedAt;
}

function isTerminal(session: ExportedSprintSession): boolean {
  return !isOpen(session);
}

function isOpen(session: ExportedSprintSession): boolean {
  return session.status === "active" || session.status === "paused";
}

function isSyntheticImportedFailure(session: ExportedSprintSession): boolean {
  return session.status === "failed" &&
    session.completedAt === session.startedAt &&
    session.ratingAfter === undefined;
}

function knownRatingGeneration(
  preferred: ExportedSprintSession,
  other: ExportedSprintSession
): number | undefined {
  if (preferred.ratingGeneration === undefined) {
    return other.ratingGeneration;
  }
  if (other.ratingGeneration === undefined) {
    return preferred.ratingGeneration;
  }
  return Math.max(preferred.ratingGeneration, other.ratingGeneration);
}

function stableSessionKey(session: ExportedSprintSession): string {
  return JSON.stringify([
    session.status,
    session.correctCount,
    session.mistakeCount,
    session.ratingBefore,
    session.ratingAfter ?? null,
    session.ratingGeneration ?? null
  ]);
}
