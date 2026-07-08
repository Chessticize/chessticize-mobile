import { normalizeRatingRecord } from "../../core/src/index.ts";
import type { RatingRecord, ReviewQueueState } from "../../core/src/index.ts";
import { clonePracticeSettings } from "./practice-settings.ts";
import type { AttemptHistoryRow } from "./query-types.ts";
import type {
  ExportedSprintSession,
  LocalDataExport,
  LocalDataImportResult,
  PracticeSettings
} from "./practice-store.ts";

export interface ProgressSyncSnapshot {
  schemaVersion: 1;
  deviceId: string;
  updatedAt: string;
  data: LocalDataExport;
}

export interface ProgressSyncTransport {
  fetchSnapshot(): Promise<ProgressSyncSnapshot | undefined>;
  saveSnapshot(snapshot: ProgressSyncSnapshot): Promise<void>;
}

export interface ProgressSyncStore {
  getSettings(): PracticeSettings;
  exportLocalData(): LocalDataExport;
  importLocalData(data: LocalDataExport): LocalDataImportResult;
}

export interface ProgressSyncOptions {
  deviceId: string;
  now?: () => string;
}

export type ProgressSyncStatus = "disabled" | "synced";

export interface ProgressSyncResult {
  status: ProgressSyncStatus;
  imported: LocalDataImportResult;
  pushed: boolean;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

export async function syncPracticeProgress(
  store: ProgressSyncStore,
  transport: ProgressSyncTransport,
  options: ProgressSyncOptions
): Promise<ProgressSyncResult> {
  if (!store.getSettings().sync.iCloudEnabled) {
    return {
      status: "disabled",
      imported: emptyImportResult(),
      pushed: false
    };
  }

  const localBefore = store.exportLocalData();
  const remote = await transport.fetchSnapshot();
  const imported = remote
    ? store.importLocalData(mergeLocalDataExports(localBefore, remote.data))
    : emptyImportResult();
  const updatedAt = options.now ? options.now() : new Date().toISOString();
  await transport.saveSnapshot({
    schemaVersion: 1,
    deviceId: options.deviceId,
    updatedAt,
    data: store.exportLocalData()
  });

  return {
    status: "synced",
    imported,
    pushed: true,
    localUpdatedAt: updatedAt,
    ...(remote === undefined ? {} : { remoteUpdatedAt: remote.updatedAt })
  };
}

export function mergeLocalDataExports(local: LocalDataExport, remote: LocalDataExport): LocalDataExport {
  const ratings = new Map<string, RatingRecord>();
  for (const rating of local.ratings) {
    ratings.set(rating.key, normalizeRatingRecord(rating));
  }
  for (const rating of remote.ratings) {
    const previous = ratings.get(rating.key);
    ratings.set(rating.key, previous ? preferredRating(previous, rating) : normalizeRatingRecord(rating));
  }

  const attempts = new Map<string, AttemptHistoryRow>();
  for (const attempt of local.attempts) {
    attempts.set(attempt.id, cloneAttempt(attempt));
  }
  for (const attempt of remote.attempts) {
    const previous = attempts.get(attempt.id);
    attempts.set(attempt.id, previous ? preferredAttempt(previous, attempt) : cloneAttempt(attempt));
  }

  const reviewQueue = new Map<string, ReviewQueueState>();
  for (const review of local.reviewQueue) {
    reviewQueue.set(reviewQueueKey(review), { ...review });
  }
  for (const review of remote.reviewQueue) {
    const key = reviewQueueKey(review);
    reviewQueue.set(key, preferredReviewQueue(reviewQueue.get(key), review));
  }

  const sprintSessions = new Map<string, ExportedSprintSession>();
  for (const session of local.sprintSessions) {
    sprintSessions.set(session.id, { ...session });
  }
  for (const session of remote.sprintSessions) {
    const previous = sprintSessions.get(session.id);
    sprintSessions.set(session.id, previous ? preferredSprintSession(previous, session) : { ...session });
  }

  return {
    schemaVersion: 1,
    settings: clonePracticeSettings(local.settings),
    ratings: [...ratings.values()].sort((left, right) => left.key.localeCompare(right.key)),
    attempts: [...attempts.values()].sort(compareAttempts),
    reviewQueue: [...reviewQueue.values()].sort(compareReviewQueue),
    sprintSessions: [...sprintSessions.values()].sort(compareSprintSessions)
  };
}

function emptyImportResult(): LocalDataImportResult {
  return {
    ratings: 0,
    attempts: 0,
    reviewQueue: 0,
    sprintSessions: 0
  };
}

function preferredRating(local: RatingRecord, incoming: RatingRecord): RatingRecord {
  const normalizedLocal = normalizeRatingRecord(local);
  const normalizedIncoming = normalizeRatingRecord(incoming);
  if (normalizedIncoming.generation !== normalizedLocal.generation) {
    return normalizedIncoming.generation > normalizedLocal.generation ? normalizedIncoming : normalizedLocal;
  }
  if (normalizedIncoming.games !== normalizedLocal.games) {
    return normalizedIncoming.games > normalizedLocal.games ? normalizedIncoming : normalizedLocal;
  }
  return normalizedIncoming;
}

function preferredAttempt(local: AttemptHistoryRow, incoming: AttemptHistoryRow): AttemptHistoryRow {
  const completedComparison = incoming.completedAt.localeCompare(local.completedAt);
  if (completedComparison !== 0) {
    return completedComparison > 0 ? cloneAttempt(incoming) : cloneAttempt(local);
  }
  return incoming.startedAt >= local.startedAt ? cloneAttempt(incoming) : cloneAttempt(local);
}

function preferredReviewQueue(
  local: ReviewQueueState | undefined,
  incoming: ReviewQueueState
): ReviewQueueState {
  if (!local) {
    return { ...incoming };
  }
  const reviewComparison = incoming.lastReviewedAt.localeCompare(local.lastReviewedAt);
  if (reviewComparison !== 0) {
    return reviewComparison > 0 ? { ...incoming } : { ...local };
  }
  const dueComparison = incoming.dueAt.localeCompare(local.dueAt);
  if (dueComparison !== 0) {
    return dueComparison > 0 ? { ...incoming } : { ...local };
  }
  return { ...incoming };
}

function preferredSprintSession(
  local: ExportedSprintSession,
  incoming: ExportedSprintSession
): ExportedSprintSession {
  const localCompletedAt = local.completedAt ?? local.startedAt;
  const incomingCompletedAt = incoming.completedAt ?? incoming.startedAt;
  const completedComparison = incomingCompletedAt.localeCompare(localCompletedAt);
  if (completedComparison !== 0) {
    return completedComparison > 0 ? { ...incoming } : { ...local };
  }
  return incoming.startedAt >= local.startedAt ? { ...incoming } : { ...local };
}

function cloneAttempt(attempt: AttemptHistoryRow): AttemptHistoryRow {
  return {
    ...attempt,
    ...(attempt.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: [...attempt.arrowDuelCandidateOrder] })
  };
}

function reviewQueueKey(context: ReviewQueueState): string {
  return `${context.puzzleId}\u0000${context.mode}\u0000${context.ratingKey}`;
}

function compareAttempts(left: AttemptHistoryRow, right: AttemptHistoryRow): number {
  return right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id);
}

function compareReviewQueue(left: ReviewQueueState, right: ReviewQueueState): number {
  return left.dueAt.localeCompare(right.dueAt) ||
    left.puzzleId.localeCompare(right.puzzleId) ||
    left.mode.localeCompare(right.mode) ||
    left.ratingKey.localeCompare(right.ratingKey);
}

function compareSprintSessions(left: ExportedSprintSession, right: ExportedSprintSession): number {
  return right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id);
}
