import {
  buildHistoryView,
  curatedPuzzleThemes,
  clonePracticeRun,
  createDefaultRating,
  defaultPracticeRuns,
  defaultSprintConfig,
  enrollReviewContext,
  filterHistoryAttemptsForQuery,
  normalizeRatingRecord,
  mergePracticeRunCatalogs,
  namedThemesForSelection,
  orderReviewQueue,
  preferredReviewScheduleChange,
  removeReviewContext,
  resetRating as resetRatingRecord,
  buildSessionMistakeReview,
  reviewDayFor,
  resolveHistoryRange,
  scheduleMistakeForContext,
  scheduleReview,
  samePracticeRun,
  sameReviewContext,
  sideToMoveForHistoryPuzzle,
  survivalRunKey,
  updateAttemptUnclearState
} from "../../core/src/index.ts";
import type {
  AppReviewRequestAttempt,
  AttemptEvent,
  AttemptResult,
  CustomSprintConfigRecord,
  HistoryAttemptView,
  HistoryEloPoint,
  HistoryQuery,
  HistoryView,
  Puzzle,
  PracticeRunRecord,
  RatingRecord,
  ReviewContext,
  ReviewQueueItem,
  ReviewQueueState,
  ReviewScheduleChange,
  ReviewScheduleRemoval,
  SessionMistakeReviewItem,
  SprintState,
  SurvivalBestRecord,
  SurvivalPreferences
} from "../../core/src/index.ts";
import type { AttemptHistoryRow, HistoryFilter, PuzzleSelectionFilter } from "./query-types.ts";
import type {
  ClearSyncedHistoryResult,
  ExportedSprintSession,
  LocalDataImport,
  LocalDataImportObserver,
  LocalDataImportResult,
  LocalDataExport,
  PracticeRatingActivity,
  PracticeSettings,
  PracticeStore,
  ReviewQueueDuePromotionResult
} from "./practice-store.ts";
import type { SurvivalPuzzleBatch, SurvivalPuzzleBatchInput } from "./puzzle-source.ts";
import {
  eligibleSurvivalPuzzles,
  selectSurvivalPuzzleBatchFromPuzzles
} from "./survival-puzzle-selection.ts";
import { exportReviewQueueState, normalizeImportedReviewQueueState } from "./practice-store.ts";
import { buildPracticeProgressSummary } from "./rating-history.ts";
import { clonePracticeSettings, defaultPracticeSettings, reviewReminderPreferenceToSettings } from "./practice-settings.ts";
import type { ReviewReminderPreference } from "./practice-store.ts";
import type { ReviewReminderSettings } from "../../core/src/index.ts";
import {
  InMemoryProgressV2Persistence,
  type ProgressV2Tombstone
} from "./progress-v2-persistence.ts";
import {
  selectUniquePuzzles,
  selectUniquePuzzlesForRatingBands
} from "./puzzle-selection.ts";
import type {
  RatingBandPuzzleSelection,
  RatingBandPuzzleSelectionInput
} from "./puzzle-source.ts";
import { preferredSprintSession, sameSprintSession } from "./sprint-session-sync.ts";
import { cloneAttemptHistoryRow, preferredAttemptHistoryRow, sameAttemptHistoryRow } from "./attempt-sync.ts";
import {
  compatiblePracticeRun,
  compatiblePracticeRunMergeInputs
} from "./practice-run-sync.ts";

export class MemoryStore implements PracticeStore {
  private readonly puzzles = new Map<string, Puzzle>();
  private readonly ratings = new Map<string, RatingRecord>();
  private readonly customSprintConfigs = new Map<string, CustomSprintConfigRecord>();
  private readonly practiceRuns = new Map<string, PracticeRunRecord>(
    defaultPracticeRuns().map((run) => [run.id, run])
  );
  private readonly sessions = new Map<string, SprintState>();
  private readonly survivalBests = new Map<string, SurvivalBestRecord>();
  private survivalPreferences: SurvivalPreferences = { guideSeen: false };
  private readonly attempts: AttemptEvent[] = [];
  private readonly reviewQueue = new Map<string, ReviewQueueState>();
  private readonly reviewRemovals = new Map<string, ReviewScheduleRemoval>();
  private settings = defaultPracticeSettings();
  private appReviewRequestAttempt: AppReviewRequestAttempt | undefined;
  private tacticalProfileSourceRevision = 0;
  readonly progressV2 = new InMemoryProgressV2Persistence(
    () => this.exportProgressV2Data(),
    (tombstones) => this.applyProgressV2MemoryTombstones(tombstones)
  );

  seedPuzzles(puzzles: Puzzle[]): void {
    for (const puzzle of puzzles) {
      this.puzzles.set(puzzle.id, puzzle);
    }
  }

  countPuzzles(filter?: PuzzleSelectionFilter): number {
    return filter === undefined
      ? this.puzzles.size
      : this.selectPuzzles(filter).length;
  }

  getPuzzle(id: string): Puzzle | undefined {
    return this.puzzles.get(id);
  }

  selectPuzzles(filter: PuzzleSelectionFilter): Puzzle[] {
    return selectUniquePuzzles({
      puzzles: [...this.puzzles.values()].sort((left, right) =>
        filter.preferredRating === undefined
          ? left.rating - right.rating || left.id.localeCompare(right.id)
          : Math.abs(left.rating - filter.preferredRating) -
              Math.abs(right.rating - filter.preferredRating) ||
            left.id.localeCompare(right.id)
      ),
      mode: filter.mode,
      limit: filter.limit,
      ...(filter.rating === undefined ? {} : { rating: filter.rating }),
      ...(filter.minRating === undefined ? {} : { minRating: filter.minRating }),
      ...(filter.maxRating === undefined ? {} : { maxRating: filter.maxRating }),
      ...(filter.themes === undefined ? {} : { themes: filter.themes }),
      ...(filter.includeIds === undefined ? {} : { includeIds: filter.includeIds }),
      ...(filter.excludeIds === undefined ? {} : { excludeIds: filter.excludeIds }),
      ...(filter.randomSeed === undefined ? {} : { randomSeed: filter.randomSeed })
    });
  }

  countSurvivalPuzzles(
    input: Pick<SurvivalPuzzleBatchInput, "challengeType" | "level">
  ): number {
    return eligibleSurvivalPuzzles([...this.puzzles.values()], input).length;
  }

  selectSurvivalPuzzleBatch(input: SurvivalPuzzleBatchInput): SurvivalPuzzleBatch {
    return selectSurvivalPuzzleBatchFromPuzzles([...this.puzzles.values()], input);
  }

  selectPuzzlesForRatingBands(
    input: RatingBandPuzzleSelectionInput
  ): RatingBandPuzzleSelection[] {
    return selectUniquePuzzlesForRatingBands(
      [...this.puzzles.values()],
      input
    );
  }

  getRating(key: string): RatingRecord {
    const existing = [...this.ratings.values()]
      .filter((rating) => rating.key === key)
      .sort((left, right) => right.generation - left.generation)[0];
    if (existing) {
      return normalizeRatingRecord(existing);
    }
    const created = createDefaultRating(key);
    this.saveRating(created);
    return created;
  }

  listRatings(): RatingRecord[] {
    const latest = new Map<string, RatingRecord>();
    for (const rating of this.ratings.values()) {
      const previous = latest.get(rating.key);
      if (!previous || rating.generation > previous.generation) {
        latest.set(rating.key, rating);
      }
    }
    return [...latest.values()]
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
    this.ratings.set(
      `${record.key}\u001f${record.generation}`,
      normalizeRatingRecord(record)
    );
  }

  resetRating(key: string): RatingRecord {
    const next = resetRatingRecord(this.getRating(key));
    this.saveRating(next);
    return next;
  }

  saveCustomSprintConfig(config: CustomSprintConfigRecord): void {
    this.customSprintConfigs.set(config.id, cloneCustomSprintConfig(config));
  }

  listCustomSprintConfigs(): CustomSprintConfigRecord[] {
    return [...this.customSprintConfigs.values()]
      .map(cloneCustomSprintConfig)
      .sort((left, right) =>
        right.lastStartedAt.localeCompare(left.lastStartedAt) || left.id.localeCompare(right.id)
      );
  }

  savePracticeRun(run: PracticeRunRecord): void {
    this.practiceRuns.set(run.id, compatiblePracticeRun(run));
  }

  listPracticeRuns(): PracticeRunRecord[] {
    return [...this.practiceRuns.values()]
      .map(clonePracticeRun)
      .sort((left, right) => Number(left.archived) - Number(right.archived)
        || left.homeOrder - right.homeOrder
        || left.id.localeCompare(right.id));
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

  getAppReviewRequestAttempt(): AppReviewRequestAttempt | undefined {
    return this.appReviewRequestAttempt
      ? { ...this.appReviewRequestAttempt }
      : undefined;
  }

  saveAppReviewRequestAttempt(
    attempt: AppReviewRequestAttempt
  ): AppReviewRequestAttempt {
    this.appReviewRequestAttempt = { ...attempt };
    return { ...attempt };
  }

  createSprintSession(state: SprintState): void {
    this.sessions.set(state.id, state);
  }

  updateSprintSession(state: SprintState): void {
    const previous = this.sessions.get(state.id);
    const previouslyEligible =
      isTacticalProfileEvidenceSession(previous) &&
      this.attempts.some((attempt) =>
        attempt.source === "sprint" && attempt.sessionId === state.id
      );
    this.sessions.set(state.id, state);
    const isNowEligible =
      isTacticalProfileEvidenceSession(state) &&
      this.attempts.some((attempt) =>
        attempt.source === "sprint" && attempt.sessionId === state.id
      );
    if (!previouslyEligible && isNowEligible) {
      this.tacticalProfileSourceRevision += 1;
    }
  }

  getResumableSurvivalSprint(id: string): SprintState | undefined {
    const state = this.sessions.get(id);
    return state?.config.survival && isOpenSprint(state)
      ? cloneSprintState(state)
      : undefined;
  }

  listResumableSurvivalSprints(): SprintState[] {
    return [...this.sessions.values()]
      .filter((state) => state.config.survival !== undefined && isOpenSprint(state))
      .sort((left, right) => (
        (right.survival?.lastTouchedAt ?? right.startedAt).localeCompare(
          left.survival?.lastTouchedAt ?? left.startedAt
        ) || right.id.localeCompare(left.id)
      ))
      .map(cloneSprintState);
  }

  listResumableFocusedSprints(): SprintState[] {
    return [...this.sessions.values()]
      .filter((state) => state.config.tacticalFocus !== undefined && isOpenSprint(state))
      .sort(compareResumableFocusedSprints)
      .map(cloneSprintState);
  }

  listSurvivalBests(): SurvivalBestRecord[] {
    return [...this.survivalBests.values()]
      .map((record) => ({ ...record }))
      .sort((left, right) => (
        left.challengeType.localeCompare(right.challengeType) ||
        left.minRating - right.minRating ||
        left.ruleVersion - right.ruleVersion
      ));
  }

  saveSurvivalBest(record: SurvivalBestRecord): void {
    const key = survivalRunKey({
      challengeType: record.challengeType,
      level: { minRating: record.minRating, maxRating: record.maxRating },
      ruleVersion: record.ruleVersion
    });
    const previous = this.survivalBests.get(key);
    if (!previous || record.score > previous.score) {
      this.survivalBests.set(key, { ...record });
    }
  }

  getSurvivalPreferences(): SurvivalPreferences {
    return { ...this.survivalPreferences };
  }

  saveSurvivalPreferences(preferences: SurvivalPreferences): void {
    this.survivalPreferences = { ...preferences };
  }

  recordAttempt(attempt: AttemptEvent): void {
    this.attempts.push(cloneAttemptHistoryRow(attempt));
    if (
      attempt.source === "sprint" &&
      isTacticalProfileEvidenceSession(this.sessions.get(attempt.sessionId))
    ) {
      this.tacticalProfileSourceRevision += 1;
    }
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

  getAttempt(attemptId: string): AttemptHistoryRow | undefined {
    const attempt = this.attempts.find((candidate) => candidate.id === attemptId);
    return attempt ? this.attemptHistoryRow(attempt) : undefined;
  }

  countAttempts(filter: HistoryFilter = {}): number {
    return this.attempts.filter((attempt) => attemptMatchesHistoryFilter(attempt, filter)).length;
  }

  listAttempts(filter: HistoryFilter = {}): AttemptHistoryRow[] {
    return this.attempts
      .filter((attempt) => attemptMatchesHistoryFilter(attempt, filter))
      .map((attempt) => this.attemptHistoryRow(attempt))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id));
  }

  getPracticeProgressSummary(nowMs: number, ratingKey: string) {
    return buildPracticeProgressSummary(
      this.attempts,
      [...this.sessions.values()].map(exportedSprintSessionFromState),
      nowMs,
      ratingKey
    );
  }

  listPracticeRatingActivity(): PracticeRatingActivity[] {
    const latestByRatingKey = new Map<string, string>();
    for (const rating of this.ratings.values()) {
      if (rating.games > 0) {
        latestByRatingKey.set(rating.key, "");
      }
    }
    for (const attempt of this.attempts) {
      const previous = latestByRatingKey.get(attempt.ratingKey);
      if (!previous || attempt.completedAt > previous) {
        latestByRatingKey.set(attempt.ratingKey, attempt.completedAt);
      }
    }
    for (const session of this.sessions.values()) {
      const playedAt = session.completedAt ?? session.startedAt;
      const previous = latestByRatingKey.get(session.config.ratingKey);
      if (!previous || playedAt > previous) {
        latestByRatingKey.set(session.config.ratingKey, playedAt);
      }
    }
    return [...latestByRatingKey]
      .map(([ratingKey, lastPlayedAt]) => ({ ratingKey, lastPlayedAt }))
      .sort((left, right) =>
        right.lastPlayedAt.localeCompare(left.lastPlayedAt) || left.ratingKey.localeCompare(right.ratingKey)
      );
  }

  hasPlayedRatingKey(ratingKey: string): boolean {
    return this.attempts.some((attempt) => attempt.source === "sprint" && attempt.ratingKey === ratingKey)
      || [...this.sessions.values()].some((session) =>
        session.config.ratingKey === ratingKey && session.ratingAfter !== undefined
      );
  }

  exportLocalData(): LocalDataExport {
    return {
      schemaVersion: 1,
      settings: this.getSettings(),
      ratings: this.listRatings(),
      attempts: this.listAttempts(),
      reviewQueue: this.listReviewQueue().map(exportReviewQueueState),
      reviewRemovals: this.listReviewRemovals(),
      sprintSessions: this.listSprintSessions(),
      practiceRuns: this.listPracticeRuns()
    };
  }

  private exportProgressV2Data(): LocalDataExport {
    return {
      ...this.exportLocalData(),
      ratings: [...this.ratings.values()]
        .map((rating) => normalizeRatingRecord(rating))
        .sort((left, right) =>
          left.key.localeCompare(right.key) || left.generation - right.generation
        )
    };
  }

  listSprintSessions(): ExportedSprintSession[] {
    return [...this.sessions.values()]
      .map(exportedSprintSessionFromState)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id));
  }

  listSurvivalSessions(): ExportedSprintSession[] {
    return [...this.sessions.values()]
      .filter((session) => session.config.survival !== undefined)
      .map(exportedSprintSessionFromState)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id));
  }

  getSprintSessions(ids: readonly string[]): ExportedSprintSession[] {
    return [...new Set(ids)].flatMap((id) => {
      const session = this.sessions.get(id);
      return session ? [exportedSprintSessionFromState(session)] : [];
    });
  }

  listLatestTerminalFocusedSprintSessions(): ExportedSprintSession[] {
    const latest = new Map<
      NonNullable<SprintState["config"]["tacticalFocus"]>["taskFamily"],
      ExportedSprintSession
    >();
    for (const state of this.sessions.values()) {
      const taskFamily = state.config.tacticalFocus?.taskFamily;
      if (!taskFamily || !state.completedAt) {
        continue;
      }
      const session = exportedSprintSessionFromState(state);
      const current = latest.get(taskFamily);
      const currentCompletedAt = current?.completedAt;
      if (
        !current ||
        !currentCompletedAt ||
        state.completedAt > currentCompletedAt ||
        (
          state.completedAt === currentCompletedAt &&
          session.id > current.id
        )
      ) {
        latest.set(taskFamily, session);
      }
    }
    return (["line", "arrow_duel"] as const).flatMap((taskFamily) => {
      const session = latest.get(taskFamily);
      return session ? [session] : [];
    });
  }

  listSprintAttemptUtcDays(sessionIds: readonly string[]): string[] {
    const includedSessionIds = new Set(sessionIds);
    return [...new Set(
      this.attempts
        .filter((attempt) =>
          attempt.source === "sprint" &&
          includedSessionIds.has(attempt.sessionId)
        )
        .map((attempt) => utcDay(attempt.completedAt))
        .filter((day): day is string => day !== undefined)
    )].sort();
  }

  getTacticalProfileSourceRevision(): number {
    return this.tacticalProfileSourceRevision;
  }

  importLocalData(
    data: LocalDataImport,
    observer?: LocalDataImportObserver
  ): LocalDataImportResult {
    const changedProfileSessions: Array<{
      previous: ExportedSprintSession | undefined;
      next: ExportedSprintSession;
    }> = [];
    let eligibleAttemptChanged = false;
    const result: LocalDataImportResult = {
      ratings: 0,
      attempts: 0,
      reviewQueue: 0,
      sprintSessions: 0,
      practiceRuns: 0
    };
    this.saveSettings({
      ...this.getSettings(),
      notifications: clonePracticeSettings(data.settings).notifications,
      moveFeedback: clonePracticeSettings(data.settings).moveFeedback
    });
    const currentRuns = this.listPracticeRuns();
    const previousRuns = new Map(currentRuns.map((run) => [run.id, run]));
    const compatibleRuns = compatiblePracticeRunMergeInputs(
      currentRuns,
      data.practiceRuns ?? []
    );
    for (const run of mergePracticeRunCatalogs(
      compatibleRuns.localRuns,
      compatibleRuns.incomingRuns
    )) {
      if (!samePracticeRun(previousRuns.get(run.id), run)) {
        this.savePracticeRun(run);
        result.practiceRuns += 1;
      }
    }
    for (const rating of data.ratings) {
      const ratingMapKey = `${rating.key}\u001f${rating.generation}`;
      const previous = this.ratings.get(ratingMapKey);
      const next = previous === undefined ? rating : preferredRating(previous, rating);
      if (previous === undefined || !sameRating(previous, next)) {
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
        run: _existingRun,
        ...existingBase
      } = existing ?? {};
      this.sessions.set(next.id, {
        ...existingBase,
        id: next.id,
        config: {
          ...(next.config ?? existing?.config ?? defaultSprintConfig(next.mode)),
          ratingKey: next.ratingKey
        },
        ...(next.ratingGeneration === undefined ? {} : { ratingGeneration: next.ratingGeneration }),
        ...(next.run === undefined ? {} : { run: { ...next.run } }),
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
        ...(next.ratingGamesBefore === undefined ? {} : { ratingGamesBefore: next.ratingGamesBefore }),
        ...(next.ratingDeviationBefore === undefined ? {} : { ratingDeviationBefore: next.ratingDeviationBefore }),
        ...(next.volatilityBefore === undefined ? {} : { volatilityBefore: next.volatilityBefore }),
        ...(next.ratingAfter === undefined ? {} : { ratingAfter: next.ratingAfter })
      });
      observer?.onSprintSessionChanged(previous, next);
      changedProfileSessions.push({ previous, next });
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
      observer?.onAttemptChanged(previous, next);
      eligibleAttemptChanged ||= [previous, next].some((candidate) => {
        if (candidate?.source !== "sprint") {
          return false;
        }
        return isTacticalProfileEvidenceSession(
          this.sessions.get(candidate.sessionId)
        );
      });
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
    const eligibleSessionChanged = changedProfileSessions.some(
      ({ previous, next }) =>
        (
          isTacticalProfileEvidenceSession(previous) ||
          isTacticalProfileEvidenceSession(next)
        ) &&
        this.attempts.some((attempt) =>
          attempt.source === "sprint" && attempt.sessionId === next.id
        )
    );
    if (eligibleSessionChanged || eligibleAttemptChanged) {
      this.tacticalProfileSourceRevision += 1;
    }
    return result;
  }

  clearSyncedHistory(now: string): ClearSyncedHistoryResult {
    const evidenceSessionIds = new Set(
      [...this.sessions.values()]
        .filter(isTacticalProfileEvidenceSession)
        .map((session) => session.id)
    );
    const hadTacticalProfileEvidence = this.attempts.some(
      (attempt) =>
        attempt.source === "sprint" &&
        evidenceSessionIds.has(attempt.sessionId)
    );
    const result: ClearSyncedHistoryResult = {
      attempts: this.attempts.length,
      reviewEvents: 0,
      reviewQueue: this.reviewQueue.size,
      sprintSessions: [...this.sessions.values()].filter((session) => !isOpenSprint(session)).length
    };
    this.progressV2.stageLocalTombstones([
      ...this.attempts.map((attempt) => ({
        kind: "attempt" as const,
        entityKey: attempt.id,
        deletedAt: now
      })),
      ...[...this.sessions.values()]
        .filter((session) => !isOpenSprint(session))
        .map((session) => ({
          kind: "sprint_session" as const,
          entityKey: session.id,
          deletedAt: now
        }))
    ], now);
    this.attempts.splice(0, this.attempts.length);
    for (const review of this.reviewQueue.values()) {
      this.reviewRemovals.set(reviewQueueKey(review), {
        puzzleId: review.puzzleId,
        mode: review.mode,
        ratingKey: review.ratingKey,
        removedAt: now
      });
    }
    this.reviewQueue.clear();
    for (const [id, session] of this.sessions) {
      if (!isOpenSprint(session)) {
        this.sessions.delete(id);
      }
    }
    if (hadTacticalProfileEvidence) {
      this.tacticalProfileSourceRevision += 1;
    }
    return result;
  }

  private applyProgressV2MemoryTombstones(tombstones: readonly ProgressV2Tombstone[]): void {
    const deletedAttempts = new Set(
      tombstones.filter((item) => item.kind === "attempt").map((item) => item.entityKey)
    );
    for (let index = this.attempts.length - 1; index >= 0; index -= 1) {
      if (deletedAttempts.has(this.attempts[index]!.id)) {
        this.attempts.splice(index, 1);
      }
    }
    for (const tombstone of tombstones) {
      if (tombstone.kind === "sprint_session") {
        this.sessions.delete(tombstone.entityKey);
      } else if (tombstone.kind === "practice_run") {
        this.practiceRuns.delete(tombstone.entityKey);
      } else if (tombstone.kind === "review_schedule") {
        const [puzzleId, mode, ratingKey] = tombstone.entityKey.split("\u001f");
        if (puzzleId && mode && ratingKey) {
          const key = reviewQueueKey({ puzzleId, mode: mode as ReviewContext["mode"], ratingKey });
          this.reviewQueue.delete(key);
          this.reviewRemovals.set(key, {
            puzzleId,
            mode: mode as ReviewContext["mode"],
            ratingKey,
            removedAt: tombstone.deletedAt
          });
        }
      }
    }
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
    const { unclear: _unclear, ...queryWithoutUnclear } = query;
    const attemptsIgnoringUnclear = filterHistoryAttemptsForQuery({
      attempts: allAttempts,
      query: queryWithoutUnclear,
      reviews
    });
    const attempts = query.unclear === undefined
      ? attemptsIgnoringUnclear
      : filterHistoryAttemptsForQuery({
          attempts: attemptsIgnoringUnclear,
          query: { unclear: query.unclear },
          reviews
        });
    const unclearCount = filterHistoryAttemptsForQuery({
      attempts: attemptsIgnoringUnclear,
      query: { unclear: true },
      reviews
    }).length;
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

  private attemptHistoryRow(attempt: AttemptEvent): AttemptHistoryRow {
    const run = this.sessions.get(attempt.sessionId)?.run;
    return {
      ...(run === undefined ? {} : { runId: run.id, runName: run.name }),
      id: attempt.id,
      source: attempt.source,
      sessionId: attempt.sessionId,
      puzzleId: attempt.puzzleId,
      mode: attempt.mode,
      ratingKey: attempt.ratingKey,
      result: attempt.result,
      ...(attempt.submittedMove === undefined ? {} : { submittedMove: attempt.submittedMove }),
      expectedMove: attempt.expectedMove,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      ...(attempt.elapsedMs === undefined ? {} : { elapsedMs: attempt.elapsedMs }),
      ...(attempt.timingStatus === undefined ? {} : { timingStatus: attempt.timingStatus }),
      ratingBefore: attempt.ratingBefore,
      ...(attempt.ratingAfter === undefined ? {} : { ratingAfter: attempt.ratingAfter }),
      ...(attempt.arrowDuelCandidateOrder === undefined
        ? {}
        : { arrowDuelCandidateOrder: [...attempt.arrowDuelCandidateOrder] }),
      ...(attempt.unclearUpdatedAt === undefined
        ? {}
        : { unclear: Boolean(attempt.unclear), unclearUpdatedAt: attempt.unclearUpdatedAt })
    };
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
      ...(session?.run === undefined ? {} : { runId: session.run.id, runName: session.run.name }),
      ...(session?.config.perPuzzleSeconds === undefined
        ? {}
        : { perPuzzleSeconds: session.config.perPuzzleSeconds }),
      puzzleRating: puzzle.rating,
      side: sideToMoveForHistoryPuzzle({ puzzle, mode: attempt.mode }),
      themes: puzzle.themes,
      curatedThemes: curatedPuzzleThemes(puzzle.themes)
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

function cloneCustomSprintConfig(config: CustomSprintConfigRecord): CustomSprintConfigRecord {
  return {
    ...config,
    ...(config.themes === undefined ? {} : { themes: [...config.themes] })
  };
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
    ...(session.ratingGamesBefore === undefined ? {} : { ratingGamesBefore: session.ratingGamesBefore }),
    ...(session.ratingDeviationBefore === undefined ? {} : { ratingDeviationBefore: session.ratingDeviationBefore }),
    ...(session.volatilityBefore === undefined ? {} : { volatilityBefore: session.volatilityBefore }),
    ...(session.ratingAfter === undefined ? {} : { ratingAfter: session.ratingAfter }),
    ...(session.run === undefined ? {} : { run: { ...session.run } }),
    config: {
      ...session.config,
      ...(session.config.puzzleTiming === undefined
        ? {}
        : { puzzleTiming: { ...session.config.puzzleTiming } }),
      ...(session.config.themes === undefined ? {} : { themes: [...session.config.themes] })
    }
  };
}

function isTacticalProfileEvidenceSession(
  session:
    | Pick<SprintState, "completedAt" | "config">
    | Pick<ExportedSprintSession, "completedAt" | "config">
    | undefined
): boolean {
  return Boolean(
    session?.completedAt &&
    session.config &&
    session.config.tacticalFocus === undefined &&
    session.config.survival === undefined &&
    namedThemesForSelection(session.config.themes).length === 0
  );
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

function attemptMatchesHistoryFilter(attempt: AttemptEvent, filter: HistoryFilter): boolean {
  return (!filter.source || attempt.source === filter.source)
    && (!filter.result || attempt.result === filter.result)
    && (!filter.mode || attempt.mode === filter.mode)
    && (!filter.ratingKey || attempt.ratingKey === filter.ratingKey)
    && (!filter.since || attempt.completedAt >= filter.since)
    && (!filter.until || attempt.completedAt < filter.until)
    && (!filter.puzzleId || attempt.puzzleId === filter.puzzleId)
    && (!filter.sessionId || attempt.sessionId === filter.sessionId);
}

function utcDay(timestamp: string): string | undefined {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : undefined;
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

function cloneSprintState(state: SprintState): SprintState {
  return JSON.parse(JSON.stringify(state)) as SprintState;
}

function compareResumableFocusedSprints(left: SprintState, right: SprintState): number {
  return focusedSprintActivityAt(right).localeCompare(focusedSprintActivityAt(left)) ||
    right.id.localeCompare(left.id);
}

function focusedSprintActivityAt(state: SprintState): string {
  return state.pausedAt ?? state.currentPuzzleStartedAt ?? state.startedAt;
}
