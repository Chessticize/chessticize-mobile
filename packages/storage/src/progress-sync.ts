import type { RatingRecord, ReviewQueueState } from "../../core/src/index.ts";
import { clonePracticeSettings } from "./practice-settings.ts";
import {
  assignLegacyRatingGenerations,
  mergeRatingWithSprintSessions,
  reconcileRatingWithSprintSessions
} from "./rating-history.ts";
import type { AttemptHistoryRow } from "./query-types.ts";
import type {
  ExportedSprintSession,
  LocalDataExport,
  LocalDataImportResult,
  PracticeSettings
} from "./practice-store.ts";
import { preferredSprintSession } from "./sprint-session-sync.ts";

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

export class ProgressSyncConflictError extends Error {
  constructor(message = "Progress sync snapshot changed during save") {
    super(message);
    this.name = "ProgressSyncConflictError";
  }
}

const MAX_SYNC_ATTEMPTS = 3;

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

  const imported = emptyImportResult();
  let remoteUpdatedAt: string | undefined;
  for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
    const localBefore = store.exportLocalData();
    const remote = await transport.fetchSnapshot();
    if (remote) {
      addImportResult(imported, store.importLocalData(mergeLocalDataExports(localBefore, remote.data)));
      remoteUpdatedAt = remote.updatedAt;
    }
    const updatedAt = options.now ? options.now() : new Date().toISOString();
    try {
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
        ...(remoteUpdatedAt === undefined ? {} : { remoteUpdatedAt })
      };
    } catch (error) {
      if (!(error instanceof ProgressSyncConflictError) || attempt === MAX_SYNC_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw new Error("Progress sync retry loop exited unexpectedly");
}

export function mergeLocalDataExports(local: LocalDataExport, remote: LocalDataExport): LocalDataExport {
  const localSessions = assignLegacyRatingGenerations(local.ratings, local.sprintSessions);
  const remoteSessions = assignLegacyRatingGenerations(remote.ratings, remote.sprintSessions);
  const attempts = new Map<string, AttemptHistoryRow>();
  for (const attempt of local.attempts) {
    attempts.set(attempt.id, cloneAttempt(attempt));
  }
  for (const attempt of remote.attempts) {
    const previous = attempts.get(attempt.id);
    attempts.set(attempt.id, previous ? preferredAttempt(previous, attempt) : cloneAttempt(attempt));
  }

  const sprintSessions = new Map<string, ExportedSprintSession>();
  for (const session of localSessions) {
    sprintSessions.set(session.id, { ...session });
  }
  for (const session of remoteSessions) {
    const previous = sprintSessions.get(session.id);
    sprintSessions.set(session.id, previous ? preferredSprintSession(previous, session) : { ...session });
  }

  const ratings = new Map<string, RatingRecord>();
  for (const rating of local.ratings) {
    ratings.set(rating.key, reconcileRatingWithSprintSessions(rating, localSessions));
  }
  for (const rating of remote.ratings) {
    const previous = ratings.get(rating.key);
    ratings.set(
      rating.key,
      previous
        ? mergeRatingWithSprintSessions(previous, rating, localSessions, remoteSessions)
        : reconcileRatingWithSprintSessions(rating, remoteSessions)
    );
  }

  const reviewQueue = new Map<string, ReviewQueueState>();
  for (const review of local.reviewQueue) {
    reviewQueue.set(reviewQueueKey(review), { ...review });
  }
  for (const review of remote.reviewQueue) {
    const key = reviewQueueKey(review);
    reviewQueue.set(key, preferredReviewQueue(reviewQueue.get(key), review));
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

function addImportResult(target: LocalDataImportResult, incoming: LocalDataImportResult): void {
  target.ratings += incoming.ratings;
  target.attempts += incoming.attempts;
  target.reviewQueue += incoming.reviewQueue;
  target.sprintSessions += incoming.sprintSessions;
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
