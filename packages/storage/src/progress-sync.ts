import {
  orderReviewQueue,
  preferredReviewScheduleChange,
  reviewContextKey,
  type RatingRecord,
  type ReviewScheduleChange
} from "../../core/src/index.ts";
import { clonePracticeSettings } from "./practice-settings.ts";
import {
  assignLegacyRatingGenerations,
  mergeRatingWithSprintSessions,
  reconcileRatingWithSprintSessions
} from "./rating-history.ts";
import type { AttemptHistoryRow } from "./query-types.ts";
import type {
  ExportedSprintSession,
  LocalDataImport,
  LocalDataExport,
  LocalDataImportResult,
  PracticeSettings
} from "./practice-store.ts";
import { exportReviewQueueState, normalizeImportedReviewQueueState } from "./practice-store.ts";
import { preferredSprintSession } from "./sprint-session-sync.ts";
import { cloneAttemptHistoryRow, preferredAttemptHistoryRow } from "./attempt-sync.ts";

export interface ProgressSyncSnapshot {
  schemaVersion: 1;
  deviceId: string;
  updatedAt: string;
  data: LocalDataImport;
}

export interface ProgressSyncTransport {
  fetchSnapshot(): Promise<ProgressSyncSnapshot | undefined>;
  saveSnapshot(snapshot: ProgressSyncSnapshot): Promise<void>;
}

export interface ProgressSyncStore {
  getSettings(): PracticeSettings;
  exportLocalData(): LocalDataExport;
  importLocalData(data: LocalDataImport): LocalDataImportResult;
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

export function mergeLocalDataExports(local: LocalDataExport, remote: LocalDataImport): LocalDataExport {
  const localSessions = assignLegacyRatingGenerations(local.ratings, local.sprintSessions);
  const remoteSessions = assignLegacyRatingGenerations(remote.ratings, remote.sprintSessions);
  const attempts = new Map<string, AttemptHistoryRow>();
  for (const attempt of local.attempts) {
    attempts.set(attempt.id, cloneAttemptHistoryRow(attempt));
  }
  for (const attempt of remote.attempts) {
    const previous = attempts.get(attempt.id);
    attempts.set(attempt.id, previous ? preferredAttemptHistoryRow(previous, attempt) : cloneAttemptHistoryRow(attempt));
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

  const reviewChanges = new Map<string, ReviewScheduleChange>();
  for (const exportedReview of local.reviewQueue) {
    const review = normalizeImportedReviewQueueState(exportedReview);
    mergeReviewChange(reviewChanges, { kind: "scheduled", review: { ...review } });
  }
  for (const removal of local.reviewRemovals ?? []) {
    mergeReviewChange(reviewChanges, { kind: "removed", removal: { ...removal } });
  }
  for (const importedReview of remote.reviewQueue) {
    const review = normalizeImportedReviewQueueState(importedReview);
    mergeReviewChange(reviewChanges, { kind: "scheduled", review: { ...review } });
  }
  for (const removal of remote.reviewRemovals ?? []) {
    mergeReviewChange(reviewChanges, { kind: "removed", removal: { ...removal } });
  }

  const reviews = [...reviewChanges.values()]
    .filter((change): change is Extract<ReviewScheduleChange, { kind: "scheduled" }> => change.kind === "scheduled")
    .map((change) => change.review);
  const removals = [...reviewChanges.values()]
    .filter((change): change is Extract<ReviewScheduleChange, { kind: "removed" }> => change.kind === "removed")
    .map((change) => ({ ...change.removal }))
    .sort((left, right) => reviewContextKey(left).localeCompare(reviewContextKey(right)));

  return {
    schemaVersion: 1,
    settings: clonePracticeSettings(local.settings),
    ratings: [...ratings.values()].sort((left, right) => left.key.localeCompare(right.key)),
    attempts: [...attempts.values()].sort(compareAttempts),
    reviewQueue: orderReviewQueue(reviews).map(exportReviewQueueState),
    reviewRemovals: removals,
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

function mergeReviewChange(
  changes: Map<string, ReviewScheduleChange>,
  incoming: ReviewScheduleChange
): void {
  const context = incoming.kind === "scheduled" ? incoming.review : incoming.removal;
  const key = reviewContextKey(context);
  changes.set(key, preferredReviewScheduleChange(changes.get(key), incoming));
}

function compareAttempts(left: AttemptHistoryRow, right: AttemptHistoryRow): number {
  return right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id);
}

function compareSprintSessions(left: ExportedSprintSession, right: ExportedSprintSession): number {
  return right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id);
}
