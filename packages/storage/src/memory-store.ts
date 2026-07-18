import {
  buildHistoryView,
  createDefaultRating,
  defaultSprintConfig,
  enrollReviewContext,
  filterHistoryAttemptsForQuery,
  normalizeRatingRecord,
  orderReviewQueue,
  preferredReviewScheduleChange,
  removeReviewContext,
  resetRating as resetRatingRecord,
  buildSessionMistakeReview,
  reviewDayFor,
  resolveHistoryRange,
  scheduleMistakeForContext,
  scheduleReview,
  sameReviewContext,
  sideToMoveForHistoryPuzzle,
  updateAttemptUnclearState
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
  ReviewScheduleChange,
  ReviewScheduleRemoval,
  SessionMistakeReviewItem,
  SprintState
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type { ClearLocalHistoryResult, ExportedSprintSession, LocalDataImport, LocalDataImportResult, LocalDataExport, PracticeSettings, PracticeStore, ReviewQueueDuePromotionResult } from "./practice-store.ts";
import { exportReviewQueueState, normalizeImportedReviewQueueState } from "./practice-store.ts";
import { clonePracticeSettings, defaultPracticeSettings, reviewReminderPreferenceToSettings } from "./practice-settings.ts";
import type { ReviewReminderPreference } from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";
import { selectUniquePuzzles } from "./puzzle-selection.ts";
import { preferredSprintSession, sameSprintSession } from "./sprint-session-sync.ts";
import { cloneAttemptHistoryRow, preferredAttemptHistoryRow, sameAttemptHistoryRow } from "./attempt-sync.ts";

export class MemoryStore implements PracticeStore {
  private readonly puzzles = new Map<string, Puzzle>();
  private readonly ratings = new Map<string, RatingRecord>();
  private readonly customSprintConfigs = new Map<string, CustomSprintConfigRecord>();
  private readonly sessions = new Map<string, SprintState>();
  private readonly attempts: AttemptEvent[] = [];
  private readonly reviewQueue = new Map<string, ReviewQueueState>();
  private readonly reviewRemovals = new Map<string, ReviewScheduleRemoval>();
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
    this.attempts.push(cloneAttemptHistoryRow(attempt));
  }

  setAttemptUnclear(attemptId: string, unclear: boolean, updatedAt: string): AttemptHistoryRow {
    const index = this.attempts.findIndex((attempt) => attempt.id === attemptId);
    const attempt = this.attempts[index];
    if (!attempt) {
      throw new Error(`Attempt ${attemptId} was not found`);
    }
    const next = updateAttemptUnclearState(attempt, unclear, updatedAt);
    this.attempts[index] = next;
    return cloneAttemptHistoryRow(next);
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
        ...(attempt.arrowDuelCandidateOrder === undefined ? {} : { arrowDuelCandidateOrder: [...attempt.arrowDuelCandidateOrder] }),
        ...(attempt.unclearUpdatedAt === undefined
          ? {}
          : { unclear: Boolean(attempt.unclear), unclearUpdatedAt: attempt.unclearUpdatedAt })
      }))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id));
  }

  exportLocalData(): LocalDataExport {
    return {
      schemaVersion: 1,
      settings: this.getSettings(),
      ratings: this.listRatings(),
      attempts: this.listAttempts(),
      reviewQueue: this.listReviewQueue().map(exportReviewQueueState),
      reviewRemovals: this.listReviewRemovals(),
      sprintSessions: this.listSprintSessions()
    };
  }

  listSprintSessions(): ExportedSprintSession[] {
    return [...this.sessions.values()]
      .map(exportedSprintSessionFromState)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id));
  }

  importLocalData(data: LocalDataImport): LocalDataImportResult {
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
    for (const session of data.sprintSessions) {
      const existing = this.sessions.get(session.id);
      if (existing && (session.status === "active" || session.status === "paused")) {
        continue;
      }
      const incoming = normalizedImportedSprintSession(session);
      const previous = existing ? exportedSprintSessionFromState(existing) : undefined;
      const next = previous ? preferredSprintSession(previous, incoming) : incoming;
      if (sameSprintSession(previous, next)) {
        continue;
      }
      const completedAt = next.completedAt ?? next.startedAt;
      const {
        ratingGeneration: _existingRatingGeneration,
        ratingAfter: _existingRatingAfter,
        ...existingBase
      } = existing ?? {};
      this.sessions.set(next.id, {
        ...existingBase,
        id: next.id,
        config: {
          ...(existing?.config ?? defaultSprintConfig(next.mode)),
          ratingKey: next.ratingKey
        },
        ...(next.ratingGeneration === undefined ? {} : { ratingGeneration: next.ratingGeneration }),
        status: next.status,
        startedAt: next.startedAt,
        deadlineAt: completedAt,
        completedAt,
        correctCount: next.correctCount,
        mistakeCount: next.mistakeCount,
        currentStreak: existing?.currentStreak ?? 0,
        bestStreak: existing?.bestStreak ?? 0,
        hasUserSubmittedMove: next.correctCount + next.mistakeCount > 0,
        currentPuzzleIndex: next.correctCount + next.mistakeCount,
        puzzles: existing?.puzzles ?? [],
        ratingBefore: next.ratingBefore,
        ...(next.ratingAfter === undefined ? {} : { ratingAfter: next.ratingAfter })
      });
      result.sprintSessions += 1;
    }
    for (const attempt of data.attempts) {
      const existingIndex = this.attempts.findIndex((candidate) => candidate.id === attempt.id);
      if (existingIndex < 0 && !this.getPuzzle(attempt.puzzleId)) {
        continue;
      }
      const previous = existingIndex < 0 ? undefined : cloneAttemptHistoryRow(this.attempts[existingIndex]!);
      const next = previous ? preferredAttemptHistoryRow(previous, attempt) : cloneAttemptHistoryRow(attempt);
      if (sameAttemptHistoryRow(previous, next)) {
        continue;
      }
      if (existingIndex < 0) {
        this.attempts.push(next);
      } else {
        this.attempts[existingIndex] = next;
      }
      result.attempts += 1;
    }
    const importedReviewChanges: ReviewScheduleChange[] = [
      ...data.reviewQueue.map((review): ReviewScheduleChange => ({
        kind: "scheduled",
        review: normalizeImportedReviewQueueState(review)
      })),
      ...(data.reviewRemovals ?? []).map((removal): ReviewScheduleChange => ({ kind: "removed", removal }))
    ];
    for (const change of importedReviewChanges) {
      if (!this.getPuzzle(reviewContextForChange(change).puzzleId)) {
        continue;
      }
      if (this.applyReviewScheduleChange(change)) {
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
    this.reviewRemovals.clear();
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
    this.commitScheduledReview(next);
    return next;
  }

  enrollReview(context: ReviewContext, now: string, initiatingAttemptId?: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = enrollReviewContext(context, now, previous);
    let initiatingAttempt: { index: number; next: AttemptHistoryRow } | undefined;
    if (initiatingAttemptId) {
      const index = this.attempts.findIndex((attempt) => attempt.id === initiatingAttemptId);
      const attempt = this.attempts[index];
      if (!attempt) {
        throw new Error(`Attempt ${initiatingAttemptId} was not found`);
      }
      if (!sameReviewContext(attempt, context)) {
        throw new Error("The initiating attempt must identify the same Review Context");
      }
      initiatingAttempt = { index, next: updateAttemptUnclearState(attempt, false, now) };
    }
    this.assertScheduledReviewWins(next);
    this.reviewQueue.set(reviewQueueKey(context), next);
    this.reviewRemovals.delete(reviewQueueKey(context));
    if (initiatingAttempt) {
      this.attempts[initiatingAttempt.index] = initiatingAttempt.next;
    }
    return next;
  }

  removeReview(context: ReviewContext, now: string): ReviewScheduleRemoval {
    const key = reviewQueueKey(context);
    const previousReview = this.reviewQueue.get(key);
    const previousRemoval = this.reviewRemovals.get(key);
    if (!previousReview && previousRemoval) {
      return previousRemoval;
    }
    const removal = removeReviewContext(context, now, previousReview ? undefined : previousRemoval);
    if (previousReview) {
      const winner = preferredReviewScheduleChange(
        { kind: "scheduled", review: previousReview },
        { kind: "removed", removal }
      );
      if (winner.kind !== "removed") {
        throw new Error("Review removal must not be older than the active Review Schedule");
      }
    }
    this.reviewQueue.delete(key);
    this.reviewRemovals.set(key, removal);
    return removal;
  }

  recordReviewResult(context: ReviewContext, result: AttemptResult, now: string): ReviewQueueState {
    const previous = this.getReviewQueueState(context);
    const next = previous ? scheduleReview({ previous, result, now }) : scheduleReview({ context, result, now });
    this.commitScheduledReview(next);
    return next;
  }

  getReviewQueueState(context: ReviewContext): ReviewQueueState | undefined {
    return this.reviewQueue.get(reviewQueueKey(context));
  }

  listReviewQueue(): ReviewQueueState[] {
    return orderReviewQueue([...this.reviewQueue.values()]);
  }

  pruneOrphanedReviewQueue(): number {
    let removed = 0;
    for (const review of this.reviewQueue.values()) {
      if (!this.puzzles.has(review.puzzleId)) {
        this.reviewQueue.delete(reviewQueueKey(review));
        removed += 1;
      }
    }
    for (const removal of this.reviewRemovals.values()) {
      if (!this.puzzles.has(removal.puzzleId)) {
        this.reviewRemovals.delete(reviewQueueKey(removal));
      }
    }
    return removed;
  }

  promoteNextFutureReviewsToDue(now: string): ReviewQueueDuePromotionResult {
    const today = reviewDayFor(now);
    const [nextFutureReview] = this.listReviewQueue().filter((review) => review.dueDay > today);
    if (!nextFutureReview) {
      return { promotedCount: 0 };
    }

    const promotedDate = nextFutureReview.dueDay;
    let promotedCount = 0;
    for (const review of this.reviewQueue.values()) {
      if (review.dueDay === promotedDate) {
        this.reviewQueue.set(reviewQueueKey(review), { ...review, dueDay: today });
        promotedCount += 1;
      }
    }
    return {
      promotedCount,
      promotedDate,
      dueDay: today
    };
  }

  getDueReviews(now: string): ReviewQueueState[] {
    const today = reviewDayFor(now);
    return this.listReviewQueue().filter((review) => review.dueDay <= today);
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
    const { unclear: _unclear, ...queryWithoutUnclear } = query;
    const unclearCount = filterHistoryAttemptsForQuery({
      attempts: allAttempts,
      query: queryWithoutUnclear,
      reviews
    }).filter((attempt) => Boolean(attempt.unclear)).length;
    return buildHistoryView({
      query,
      ratingKeys: this.listPlayedRatings(),
      attempts,
      unclearCount,
      elo: query.ratingKey ? this.eloPointsForRange(query.ratingKey, range.since, range.until) : [],
      reviews,
      allAttemptsForOptions: allAttempts
    });
  }

  transaction<T>(work: () => T): T {
    return work();
  }

  private listReviewRemovals(): ReviewScheduleRemoval[] {
    return [...this.reviewRemovals.values()]
      .map((removal) => ({ ...removal }))
      .sort((left, right) => reviewQueueKey(left).localeCompare(reviewQueueKey(right)));
  }

  private assertScheduledReviewWins(review: ReviewQueueState): void {
    const removal = this.reviewRemovals.get(reviewQueueKey(review));
    if (!removal) {
      return;
    }
    const winner = preferredReviewScheduleChange(
      { kind: "removed", removal },
      { kind: "scheduled", review }
    );
    if (winner.kind !== "scheduled") {
      throw new Error("Review enrollment must occur after the latest Review removal");
    }
  }

  private commitScheduledReview(review: ReviewQueueState): void {
    this.assertScheduledReviewWins(review);
    const key = reviewQueueKey(review);
    this.reviewQueue.set(key, review);
    this.reviewRemovals.delete(key);
  }

  private applyReviewScheduleChange(incoming: ReviewScheduleChange): boolean {
    const context = reviewContextForChange(incoming);
    const key = reviewQueueKey(context);
    const localReview = this.reviewQueue.get(key);
    const localRemoval = this.reviewRemovals.get(key);
    const local: ReviewScheduleChange | undefined = localRemoval
      ? { kind: "removed", removal: localRemoval }
      : localReview
        ? { kind: "scheduled", review: localReview }
        : undefined;
    const next = preferredReviewScheduleChange(local, incoming);
    if (sameReviewScheduleChange(local, next)) {
      return false;
    }
    if (next.kind === "scheduled") {
      this.reviewQueue.set(key, next.review);
      this.reviewRemovals.delete(key);
    } else {
      this.reviewQueue.delete(key);
      this.reviewRemovals.set(key, next.removal);
    }
    return true;
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

function exportedSprintSessionFromState(session: SprintState): ExportedSprintSession {
  return {
    id: session.id,
    mode: session.config.mode,
    ratingKey: session.config.ratingKey,
    ...(session.ratingGeneration === undefined ? {} : { ratingGeneration: session.ratingGeneration }),
    startedAt: session.startedAt,
    ...(session.completedAt === undefined ? {} : { completedAt: session.completedAt }),
    status: session.status,
    correctCount: session.correctCount,
    mistakeCount: session.mistakeCount,
    ratingBefore: session.ratingBefore,
    ...(session.ratingAfter === undefined ? {} : { ratingAfter: session.ratingAfter })
  };
}

function normalizedImportedSprintSession(session: ExportedSprintSession): ExportedSprintSession {
  if (session.status !== "active" && session.status !== "paused") {
    return { ...session };
  }
  return {
    ...session,
    status: "failed",
    completedAt: session.completedAt ?? session.startedAt
  };
}

function reviewQueueKey(context: ReviewContext): string {
  return `${context.puzzleId}\u0000${context.mode}\u0000${context.ratingKey}`;
}

function reviewContextForChange(change: ReviewScheduleChange): ReviewContext {
  return change.kind === "scheduled" ? change.review : change.removal;
}

function sameReviewScheduleChange(
  left: ReviewScheduleChange | undefined,
  right: ReviewScheduleChange
): boolean {
  if (!left || left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "removed" && right.kind === "removed") {
    return left.removal.removedAt === right.removal.removedAt &&
      sameReviewContext(left.removal, right.removal);
  }
  return left.kind === "scheduled" && right.kind === "scheduled" &&
    sameReviewQueue(left.review, right.review);
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

function sameReviewQueue(left: ReviewQueueState | undefined, right: ReviewQueueState): boolean {
  return left !== undefined &&
    left.puzzleId === right.puzzleId &&
    left.mode === right.mode &&
    left.ratingKey === right.ratingKey &&
    left.dueDay === right.dueDay &&
    left.intervalDays === right.intervalDays &&
    left.reviewCount === right.reviewCount &&
    left.successStreak === right.successStreak &&
    left.lapseCount === right.lapseCount &&
    left.lastResult === right.lastResult &&
    left.lastReviewedAt === right.lastReviewedAt &&
    left.enrolledAt === right.enrolledAt;
}

function isOpenSprint(session: SprintState): boolean {
  return session.status === "active" || session.status === "paused";
}
