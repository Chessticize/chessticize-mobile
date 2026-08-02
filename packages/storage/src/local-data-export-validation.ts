import type {
  ExportedReviewQueueState,
  ExportedSprintSession,
  LocalDataExport,
  PracticeSettings
} from "./practice-store.ts";
import type { ProgressSyncSnapshot } from "./progress-sync.ts";
import type {
  PracticeRunRecord,
  RatingRecord,
  ReviewScheduleRemoval,
  SprintConfig
} from "../../core/src/index.ts";
import type { AttemptHistoryRow } from "./query-types.ts";

const SPRINT_MODES = new Set(["standard", "blitz", "arrow_duel", "custom"]);
const SPRINT_STATUSES = new Set(["active", "paused", "won", "failed", "abandoned"]);
const ATTEMPT_RESULTS = new Set(["correct", "wrong", "timed_out", "incomplete"]);
const ATTEMPT_SOURCES = new Set(["sprint", "scheduled_review"]);
const TIMING_STATUSES = new Set(["slow", "timed_out"]);
const PRACTICE_RUN_KINDS = new Set(["standard", "arrow_duel", "custom"]);

export function isCanonicalProgressSyncSnapshot(
  value: unknown
): value is ProgressSyncSnapshot & { data: LocalDataExport } {
  return isRecord(value) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.deviceId) &&
    isIsoDate(value.updatedAt) &&
    isCanonicalLocalDataExport(value.data);
}

export function isCanonicalLocalDataExport(
  value: unknown
): value is LocalDataExport {
  return isRecord(value) &&
    value.schemaVersion === 1 &&
    isPracticeSettings(value.settings) &&
    isArrayOf(value.ratings, isRatingRecord) &&
    isArrayOf(value.attempts, isAttemptHistoryRow) &&
    isArrayOf(value.reviewQueue, isExportedReviewQueueState) &&
    isOptionalArrayOf(value.reviewRemovals, isReviewScheduleRemoval) &&
    isArrayOf(value.sprintSessions, isExportedSprintSession) &&
    isArrayOf(value.practiceRuns, isPracticeRunRecord);
}

function isPracticeSettings(value: unknown): value is PracticeSettings {
  if (!isRecord(value)) return false;
  const sync = value.sync;
  const notifications = value.notifications;
  const moveFeedback = value.moveFeedback;
  const sprintGuides = value.sprintGuides;
  if (
    !isRecord(sync) ||
    typeof sync.iCloudEnabled !== "boolean" ||
    !isRecord(notifications) ||
    !isReviewReminder(notifications.reviewReminder) ||
    !isRecord(moveFeedback) ||
    typeof moveFeedback.soundEnabled !== "boolean" ||
    typeof moveFeedback.hapticsEnabled !== "boolean" ||
    !isRecord(sprintGuides)
  ) {
    return false;
  }
  return typeof sprintGuides.rulesSeen === "boolean" &&
    typeof sprintGuides.activeSessionSeen === "boolean" &&
    typeof sprintGuides.arrowDuelSeen === "boolean" &&
    isOptional(sprintGuides.focusedRunSeen, isBoolean);
}

function isReviewReminder(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.mode === "smart" || value.mode === "off") return true;
  return value.mode === "fixed" && isNonEmptyString(value.fixedLocalTime);
}

function isRatingRecord(value: unknown): value is RatingRecord {
  return isRecord(value) &&
    isNonEmptyString(value.key) &&
    isNonNegativeInteger(value.generation) &&
    isFiniteNumber(value.rating) &&
    isOptional(value.ratingDeviation, isFiniteNumber) &&
    isOptional(value.volatility, isFiniteNumber) &&
    isNonNegativeInteger(value.games);
}

function isAttemptHistoryRow(value: unknown): value is AttemptHistoryRow {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isOneOf(value.source, ATTEMPT_SOURCES) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.puzzleId) &&
    isOneOf(value.mode, SPRINT_MODES) &&
    isNonEmptyString(value.ratingKey) &&
    isOneOf(value.result, ATTEMPT_RESULTS) &&
    isOptional(value.submittedMove, isString) &&
    isString(value.expectedMove) &&
    isIsoDate(value.startedAt) &&
    isIsoDate(value.completedAt) &&
    isOptional(value.elapsedMs, isNonNegativeFiniteNumber) &&
    isOptional(value.timingStatus, (candidate) => isOneOf(candidate, TIMING_STATUSES)) &&
    isFiniteNumber(value.ratingBefore) &&
    isOptional(value.ratingAfter, isFiniteNumber) &&
    isOptional(value.arrowDuelCandidateOrder, isStringArray) &&
    isOptional(value.unclear, isBoolean) &&
    isOptional(value.unclearUpdatedAt, isIsoDate) &&
    isOptional(value.runId, isNonEmptyString) &&
    isOptional(value.runName, isNonEmptyString);
}

function isExportedReviewQueueState(
  value: unknown
): value is ExportedReviewQueueState {
  return isReviewContext(value) &&
    isReviewDay(value.dueDay) &&
    isPositiveFiniteNumber(value.intervalDays) &&
    isNonNegativeInteger(value.reviewCount) &&
    isNonNegativeInteger(value.successStreak) &&
    isNonNegativeInteger(value.lapseCount) &&
    (value.lastResult === null || value.lastResult === "correct" || value.lastResult === "wrong") &&
    (value.lastReviewedAt === null || isIsoDate(value.lastReviewedAt)) &&
    isOptional(value.enrolledAt, isIsoDate) &&
    isIsoDate(value.dueAt) &&
    isPositiveFiniteNumber(value.intervalHours);
}

function isReviewScheduleRemoval(
  value: unknown
): value is ReviewScheduleRemoval {
  return isReviewContext(value) && isIsoDate(value.removedAt);
}

function isReviewContext(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    isNonEmptyString(value.puzzleId) &&
    isOneOf(value.mode, SPRINT_MODES) &&
    isNonEmptyString(value.ratingKey);
}

function isExportedSprintSession(
  value: unknown
): value is ExportedSprintSession {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isOneOf(value.mode, SPRINT_MODES) &&
    isNonEmptyString(value.ratingKey) &&
    isOptional(value.ratingGeneration, isNonNegativeInteger) &&
    isIsoDate(value.startedAt) &&
    isOptional(value.completedAt, isIsoDate) &&
    isOneOf(value.status, SPRINT_STATUSES) &&
    isNonNegativeInteger(value.correctCount) &&
    isNonNegativeInteger(value.mistakeCount) &&
    isFiniteNumber(value.ratingBefore) &&
    isOptional(value.ratingAfter, isFiniteNumber) &&
    isOptionalRatingReplayAnchor(value) &&
    isOptional(value.run, isPracticeRunSnapshot) &&
    isOptional(value.config, isStoredSprintSessionConfig);
}

function isOptionalRatingReplayAnchor(value: Record<string, unknown>): boolean {
  const anchor = [
    value.ratingGamesBefore,
    value.ratingDeviationBefore,
    value.volatilityBefore
  ];
  if (anchor.every((field) => field === undefined)) return true;
  return isNonNegativeInteger(value.ratingGamesBefore) &&
    isPositiveFiniteNumber(value.ratingDeviationBefore) &&
    isPositiveFiniteNumber(value.volatilityBefore);
}

function isPracticeRunSnapshot(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isOneOf(value.kind, PRACTICE_RUN_KINDS) &&
    isNonEmptyString(value.name);
}

function isStoredSprintSessionConfig(value: unknown): boolean {
  return isSprintConfig(value) || isSyntheticSessionConfig(value);
}

function isSyntheticSessionConfig(value: unknown): boolean {
  return isRecord(value) &&
    (value.source === "scheduled_review" || value.source === "icloud_sync") &&
    isOneOf(value.mode, SPRINT_MODES) &&
    isNonEmptyString(value.ratingKey);
}

function isSprintConfig(value: unknown): value is SprintConfig {
  return isRecord(value) &&
    isOneOf(value.mode, SPRINT_MODES) &&
    isPositiveFiniteNumber(value.durationSeconds) &&
    isPositiveFiniteNumber(value.perPuzzleSeconds) &&
    isOptional(value.puzzleTiming, isPuzzleTimingPolicy) &&
    isPositiveInteger(value.targetCorrect) &&
    isNonNegativeInteger(value.maxMistakes) &&
    isNonEmptyString(value.ratingKey) &&
    isOptional(value.themes, isStringArray) &&
    isOptional(value.maxAttempts, isPositiveInteger) &&
    isOptional(value.ratingPolicy, (candidate) =>
      candidate === "rated" || candidate === "unrated"
    ) &&
    isOptional(value.tacticalFocus, isTacticalFocus);
}

function isTacticalFocus(value: unknown): boolean {
  return isRecord(value) &&
    (value.taskFamily === "line" || value.taskFamily === "arrow_duel") &&
    isStringArray(value.themes) &&
    isNonNegativeInteger(value.mixedControlCount) &&
    isFiniteNumber(value.ratingAnchor) &&
    isFiniteNumber(value.minRating) &&
    isFiniteNumber(value.maxRating);
}

function isPracticeRunRecord(value: unknown): value is PracticeRunRecord {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isOneOf(value.kind, PRACTICE_RUN_KINDS) &&
    isNonEmptyString(value.name) &&
    (value.mode === "standard" || value.mode === "custom" || value.mode === "arrow_duel") &&
    isNonEmptyString(value.ratingKey) &&
    isPositiveFiniteNumber(value.durationSeconds) &&
    isPositiveFiniteNumber(value.perPuzzleSeconds) &&
    isOptional(value.puzzleTiming, isPuzzleTimingPolicy) &&
    isPositiveInteger(value.targetCorrect) &&
    isNonNegativeInteger(value.maxMistakes) &&
    isOptional(value.themes, isStringArray) &&
    isFiniteNumber(value.homeOrder) &&
    typeof value.archived === "boolean" &&
    isIsoDate(value.updatedAt);
}

function isPuzzleTimingPolicy(value: unknown): boolean {
  return isRecord(value) &&
    (value.slowAfterSeconds === null || isPositiveFiniteNumber(value.slowAfterSeconds)) &&
    (value.timeoutAfterSeconds === null || isPositiveFiniteNumber(value.timeoutAfterSeconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArrayOf<T>(
  value: unknown,
  predicate: (candidate: unknown) => candidate is T
): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

function isOptionalArrayOf<T>(
  value: unknown,
  predicate: (candidate: unknown) => candidate is T
): boolean {
  return value === undefined || isArrayOf(value, predicate);
}

function isOptional(
  value: unknown,
  predicate: (candidate: unknown) => boolean
): boolean {
  return value === undefined || predicate(value);
}

function isOneOf(value: unknown, allowed: ReadonlySet<string>): value is string {
  return typeof value === "string" && allowed.has(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isReviewDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}
