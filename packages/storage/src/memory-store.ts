import {
  buildHistoryView,
  createDefaultRating,
  filterHistoryAttemptsForQuery,
  normalizeRatingRecord,
  resetRating as resetRatingRecord,
  buildSessionMistakeReview,
  resolveHistoryRange,
  scheduleMistakeForContext,
  scheduleReview,
  sideToMoveForHistoryPuzzle
} from "../../core/src/index.ts";
import type {
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  HistoryAttemptView,
  HistoryEloPoint,
  HistoryQuery,
  HistoryView,
  Puzzle,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  SessionMistakeReviewItem,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type { ClearLocalHistoryResult, LocalDataImportResult, LocalDataExport, PracticeSettings, PracticeStore, ReviewQueueDuePromotionResult } from "./practice-store.ts";
import { clonePracticeSettings, defaultPracticeSettings, reviewReminderPreferenceToSettings } from "./practice-settings.ts";
import type { ReviewReminderPreference } from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";
import { selectUniquePuzzles } from "./puzzle-selection.ts";

export class MemoryStore implements PracticeStore {
  private readonly puzzles = new Map<string, Puzzle>();
  private readonly ratings = new Map<string, RatingRecord>();
  private readonly customSprintConfigs = new Map<string, CustomSprintConfigRecord>();
  private readonly sessions = new Map<string, SprintState>();
  private readonly attempts: AttemptEvent[] = [];
  private readonly reviewQueue = new Map<string, ReviewQueueState>();
  private settings = defaultPracticeSettings();

  seedPuzzles(puzzles: Puzzle[]): void {
    for (const puzzle of puzzles) {
      this.puzzles.set(puzzle.id, puzzle);
    }
  }

  countPuzzles(): number {
    return this.puzzles.size;
  }

  getPuzzle(id: string): Puzzle | undefined {
    return this.puzzles.get(id);
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    return selectUniquePuzzles({
      puzzles: [...this.puzzles.values()].sort((left, right) => left.rating - right.rating || left.id.localeCompare(right.id)),
      mode: filter.mode,
      limit: filter.limit,
      ...(filter.rating === undefined ? {} : { rating: filter.rating }),
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.theme === undefined ? {} : { theme: filter.theme }),
      ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
      ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
      ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
    });
  }

  getRating(key: string): RatingRecord {
    const existing = this.ratings.get(key);
    if (existing) {
      return normalizeRatingRecord(existing);
    }
    const created = createDefaultRating(key);
    this.ratings.set(key, created);
    return created;
  }

  listRatings(): RatingRecord[] {
    return [...this.ratings.values()]
      .map((rating) => normalizeRatingRecord(rating))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  listPlayedRatings(): RatingRecord[] {
    const playedKeys = new Set<string>();
    for (const rating of this.ratings.values()) {
      if (rating.games > 0) {
        playedKeys.add(rating.key);
      }
    }
    for (const session of this.sessions.values()) {
      if (session.completedAt && session.ratingAfter !== undefined) {
        playedKeys.add(session.config.ratingKey);
      }
    }
    return this.listRatings().filter((rating) => playedKeys.has(rating.key));
  }

  saveRating(record: RatingRecord): void {
    this.ratings.set(record.key, normalizeRatingRecord(record));
  }

  resetRating(key: string): RatingRecord {
    const next = resetRatingRecord(this.getRating(key));
    this.saveRating(next);
    return next;
  }

  saveCustomSprintConfig(config: CustomSprintConfigRecord): void {
    this.customSprintConfigs.set(config.id, config);
  }

  listCustomSprintConfigs(): CustomSprintConfigRecord[] {
    return [...this.customSprintConfigs.values()].sort((left, right) =>
      right.lastStartedAt.localeCompare(left.lastStartedAt) || left.id.localeCompare(right.id)
    );
  }

  getSettings(): PracticeSettings {
    return clonePracticeSettings(this.settings);
  }

  saveSettings(settings: PracticeSettings): void {
    this.settings = clonePracticeSettings(settings);
  }

  getReviewReminderPreference(): ReviewReminderPreference {
    return clonePracticeSettings(this.settings).notifications.reviewReminder;
  }

  saveReviewReminderPreference(preference: ReviewReminderPreference): ReviewReminderPreference {
    this.settings = clonePracticeSettings({
      ...this.settings,
      notifications: {
        ...this.settings.notifications,
        reviewReminder: preference
      }
    });
    return this.getReviewReminderPreference();
  }

  getReviewReminderSettings(): ReviewReminderSettings {
    return reviewReminderPreferenceToSettings(this.getReviewReminderPreference());
  }

  createSprintSession(state: SprintState): void {
    this.sessions.set(state.id, state);
  }

  updateSprintSession(state: SprintState): void {
    this.sessions.set(state.id, state);
  }

  recordAttempt(attempt: AttemptEvent): void {
    this.attempts.push(attempt);
  }

  listAttempts(filter: HistoryFilter = {}): AttemptHistoryRow[] {
    return this.attempts
      .filter((attempt) => !filter.source || attempt.source === filter.source)
      .filter((attempt) => !filter.result || attempt.result === filter.result)
      .filter((attempt) => !filter.mode || attempt.mode === filter.mode)
      .filter((attempt) => !filter.since || attempt.completedAt >= filter.since)
      .filter((attempt) => !filter.puzzleId || attempt.puzzleId === filter.puzzleId)
      .filter((attempt) => !filter.sessionId || attempt.sessionId === filter.sessionId)
      .map((attempt) => ({
        id: attempt.id,
        source: attempt.source,
        sessionId: attempt.sessionId,
        puzzleId: attempt.puzzleId,
        mode: attempt.mode,
        ratingKey: attempt.ratingKey,
        result: attempt.result,
        submittedMove: attempt.submittedMove,
        expectedMove: attempt.expectedMove,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        ratingBefore: attempt.ratingBefore,
        ...(attempt.ratingAfter === undefined ? {} : { ratingAfter: attempt.ratingAfter }),
        ...(attempt.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: [...attempt.arrowDuelCandidateOrder] })
      }))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id));
  }

  exportLocalData(): LocalDataExport {
    return {
      schemaVersion: 1,
      settings: this.getSettings(),
      ratings: this.listRatings(),
      attempts: this.listAttempts(),
      reviewQueue: [...this.reviewQueue.values()]
        .sort((left, right) =>
          left.dueAt.localeCompare(right.dueAt) ||
          left.puzzleId.localeCompare(right.puzzleId) ||
          left.mode.localeCompare(right.mode) ||
          left.ratingKey.localeCompare(right.ratingKey)
        ),
      sprintSessions: [...this.sessions.values()]
        .map((session) => ({
          id: session.id,
          mode: session.config.mode,
          ratingKey: session.config.ratingKey,
          startedAt: session.startedAt,
          ...(session.completedAt === undefined ? {} : { completedAt: session.completedAt }),
          status: session.status,
          correctCount: session.correctCount,
          mistakeCount: session.mistakeCount,
          ratingBefore: session.ratingBefore,
          ...(session.ratingAfter === undefined ? {} : { ratingAfter: session.ratingAfter })
        }))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id))
    };
  }

  importLocalData(data: LocalDataExport): LocalDataImportResult {
    const result: LocalDataImportResult = {
      ratings: 0,
      attempts: 0,
      reviewQueue: 0,
      sprintSessions: 0
    };
    this.saveSettings({
      ...this.getSettings(),
      notifications: clonePracticeSettings(data.settings).notifications
    });
    for (const rating of data.ratings) {
      const previous = this.getRating(rating.key);
      const next = preferredRating(previous, rating);
      if (!sameRating(previous, next)) {
        this.saveRating(next);
        result.ratings += 1;
      }
    }
    const existingAttempts = new Set(this.attempts.map((attempt) => attempt.id));
    for (const attempt of data.attempts) {
      if (existingAttempts.has(attempt.id) || !this.getPuzzle(attempt.puzzleId)) {
        continue;
      }
      this.attempts.push({
        ...attempt,
        ...(attempt.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: [...attempt.arrowDuelCandidateOrder] })
      });
      existingAttempts.add(attempt.id);
      result.attempts += 1;
    }
    for (const review of data.reviewQueue) {
      if (!this.getPuzzle(review.puzzleId)) {
        continue;
      }
      const key = reviewQueueKey(review);
      const previous = this.reviewQueue.get(key);
      const next = preferredReviewQueue(previous, review);
      if (!sameReviewQueue(previous, next)) {
        this.reviewQueue.set(key, next);
        result.reviewQueue += 1;
      }
    }
    return result;
  }

  clearLocalHistory(): ClearLocalHistoryResult {
    const result: ClearLocalHistoryResult = {
      attempts: this.attempts.length,
      reviewEvents: 0,
      reviewQueue: this.reviewQueue.size,
      sprintSessions: [...this.sessions.values()].filter((session) => !isOpenSprint(session)).length
    };
    this.attempts.splice(0, this.attempts.length);
    this.reviewQueue.clear();
    for (const [id, session] of this.sessions) {
      if (!isOpenSprint(session)) {
        this.sessions.delete(id);
      }
    }
    return result;
  }

  getSessionMistakeReview(sessionId: string): SessionMistakeReviewItem[] {
    return buildSessionMistakeReview({
      sessionId,
      attempts: this.attempts,
      puzzles: [...this.puzzles.values()]
    });
  }

  scheduleMistakeReview(context: ReviewContext, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = scheduleMistakeForContext(context, now, previous);
    this.reviewQueue.set(reviewQueueKey(context), next);
    return next;
  }

  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = previous ? scheduleReview({ previous, result, now }) : scheduleReview({ context, result, now });
    this.reviewQueue.set(reviewQueueKey(context), next);
    return next;
  }

  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined {
    return this.reviewQueue.get(reviewQueueKey(context));
  }

  listReviewQueue(): ReviewQueueState[] {
    return [...this.reviewQueue.values()].sort(compareReviewQueueState);
  }

  pruneOrphanedReviewQueue(): number {
    let removed = 0;
    for (const review of this.reviewQueue.values()) {
      if (!this.puzzles.has(review.puzzleId)) {
        this.reviewQueue.delete(reviewQueueKey(review));
        removed += 1;
      }
    }
    return removed;
  }

  promoteNextFutureReviewsToDue(now: string): ReviewQueueDuePromotionResult {
    const nowIso = new Date(now).toISOString();
    const [nextFutureReview] = this.listReviewQueue().filter((review) => review.dueAt > nowIso);
    if (!nextFutureReview) {
      return { promotedCount: 0 };
    }

    const promotedDate = nextFutureReview.dueAt.slice(0, 10);
    let promotedCount = 0;
    for (const review of this.reviewQueue.values()) {
      if (review.dueAt > nowIso && review.dueAt.slice(0, 10) === promotedDate) {
        this.reviewQueue.set(reviewQueueKey(review), { ...review, dueAt: nowIso });
        promotedCount += 1;
      }
    }
    return {
      promotedCount,
      promotedDate,
      dueAt: nowIso
    };
  }

  getDueReviews(now: string): ReviewQueueState[] {
    return this.listReviewQueue().filter((review) => review.dueAt <= now);
  }

  getDueReviewItems(now: string): ReviewQueueItem[] {
    return this.getDueReviews(now)
      .map((review) => {
        const puzzle = this.getPuzzle(review.puzzleId);
        return puzzle ? { puzzle, review } : undefined;
      })
      .filter((item): item is ReviewQueueItem => Boolean(item));
  }

  getHistoryView(query: HistoryQuery): HistoryView {
    const range = resolveHistoryRange(query.now, query.timeRange);
    const allAttempts = this.historyAttemptsForRange(query.ratingKey, range.since, range.until);
    const reviews = [...this.reviewQueue.values()];
    const attempts = filterHistoryAttemptsForQuery({ attempts: allAttempts, query, reviews });
    return buildHistoryView({
      query,
      ratingKeys: this.listPlayedRatings(),
      attempts,
      elo: query.ratingKey ? this.eloPointsForRange(query.ratingKey, range.since, range.until) : [],
      reviews,
      allAttemptsForOptions: allAttempts
    });
  }

  transaction<T>(work: () => T): T {
    return work();
  }

  private historyAttemptsForRange(ratingKey: string | undefined, since: string | undefined, until: string): HistoryAttemptView[] {
    return this.attempts
      .map((attempt) => this.toHistoryAttempt(attempt))
      .filter((attempt): attempt is HistoryAttemptView => Boolean(attempt))
      .filter((attempt) => ratingKey === undefined || attempt.ratingKey === ratingKey)
      .filter((attempt) => (since === undefined || attempt.completedAt >= since) && attempt.completedAt <= until)
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id));
  }

  private toHistoryAttempt(attempt: AttemptEvent): HistoryAttemptView | undefined {
    const session = this.sessions.get(attempt.sessionId);
    const puzzle = this.puzzles.get(attempt.puzzleId);
    if (!puzzle) {
      return undefined;
    }
    const ratingKey = attempt.ratingKey || session?.config.ratingKey;
    if (!ratingKey) {
      return undefined;
    }
    return {
      ...attempt,
      ratingKey,
      puzzleRating: puzzle.rating,
      side: sideToMoveForHistoryPuzzle({ puzzle, mode: attempt.mode }),
      themes: puzzle.themes
    };
  }

  private eloPointsForRange(ratingKey: string, since: string | undefined, until: string): HistoryEloPoint[] {
    return [...this.sessions.values()]
      .filter((session) => session.config.ratingKey === ratingKey)
      .filter((session) => session.completedAt !== undefined && session.ratingAfter !== undefined)
      .filter((session) => (since === undefined || (session.completedAt as string) >= since) && (session.completedAt as string) <= until)
      .map((session) => ({
        sessionId: session.id,
        completedAt: session.completedAt as string,
        ratingBefore: session.ratingBefore,
        ratingAfter: session.ratingAfter as number
      }))
      .sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.sessionId.localeCompare(right.sessionId));
  }
}

function reviewQueueKey(context: ReviewContext): string {
  return `${context.puzzleId}\u0000${context.mode}\u0000${context.ratingKey}`;
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

function sameRating(left: RatingRecord, right: RatingRecord): boolean {
  return left.key === right.key &&
    left.generation === right.generation &&
    left.rating === right.rating &&
    left.games === right.games &&
    left.ratingDeviation === right.ratingDeviation &&
    left.volatility === right.volatility;
}

function preferredReviewQueue(
  local: ReviewQueueState | undefined,
  incoming: ReviewQueueState
): ReviewQueueState {
  if (!local) {
    return incoming;
  }
  const reviewComparison = incoming.lastReviewedAt.localeCompare(local.lastReviewedAt);
  if (reviewComparison !== 0) {
    return reviewComparison > 0 ? incoming : local;
  }
  const dueComparison = incoming.dueAt.localeCompare(local.dueAt);
  if (dueComparison !== 0) {
    return dueComparison > 0 ? incoming : local;
  }
  return incoming;
}

function sameReviewQueue(left: ReviewQueueState | undefined, right: ReviewQueueState): boolean {
  return left !== undefined &&
    left.puzzleId === right.puzzleId &&
    left.mode === right.mode &&
    left.ratingKey === right.ratingKey &&
    left.dueAt === right.dueAt &&
    left.intervalHours === right.intervalHours &&
    left.reviewCount === right.reviewCount &&
    left.successStreak === right.successStreak &&
    left.lapseCount === right.lapseCount &&
    left.lastResult === right.lastResult &&
    left.lastReviewedAt === right.lastReviewedAt;
}

function isOpenSprint(session: SprintState): boolean {
  return session.status === "active" || session.status === "paused";
}

function compareReviewQueueState(left: ReviewQueueState, right: ReviewQueueState): number {
  return left.dueAt.localeCompare(right.dueAt) ||
    left.puzzleId.localeCompare(right.puzzleId) ||
    left.mode.localeCompare(right.mode) ||
    left.ratingKey.localeCompare(right.ratingKey);
}
