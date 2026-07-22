import { beginArrowDuelPuzzle, beginLinePuzzle } from "./puzzle-session.ts";
import {
  curatedPuzzleThemes,
  namedThemesForSelection,
  puzzleMatchesAnyTheme
} from "./theme-catalog.ts";
import { isPracticeRunRatingKey } from "./practice-runs.ts";
import type { AttemptEvent, AttemptResult, AttemptSource, Puzzle, RatingRecord, ReviewQueueState, SprintMode } from "./types.ts";

export type HistoryTimeRange = "7d" | "30d" | "90d" | "1y" | "max";
export type PuzzleSide = "white" | "black";
export type HistoryReviewStatus = "queued" | "clear";

export interface HistoryPageQuery {
  limit: number;
  offset?: number;
}

export interface HistoryQuery {
  now: string;
  timeRange: HistoryTimeRange;
  ratingKey?: string;
  minRating?: number;
  maxRating?: number;
  source?: AttemptSource;
  result?: AttemptResult;
  side?: PuzzleSide;
  themes?: string[];
  /** @deprecated Accept legacy callers, then normalize to themes. */
  theme?: string;
  mode?: SprintMode;
  speedSeconds?: number;
  reviewStatus?: HistoryReviewStatus;
  unclear?: boolean;
  page?: HistoryPageQuery;
}

export interface HistoryResolvedRange {
  since?: string;
  until: string;
}

export interface HistoryPage {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface HistoryAttemptView {
  id: string;
  source: AttemptSource;
  sessionId: string;
  puzzleId: string;
  mode: SprintMode;
  ratingKey: string;
  result: AttemptResult;
  submittedMove: string;
  expectedMove: string;
  startedAt: string;
  completedAt: string;
  ratingBefore: number;
  ratingAfter?: number;
  arrowDuelCandidateOrder?: string[];
  arrowDuelCandidateOrderStatus?: "corrupt";
  unclear?: boolean;
  unclearUpdatedAt?: string;
  runId?: string;
  runName?: string;
  perPuzzleSeconds?: number;
  puzzleRating: number;
  side: PuzzleSide;
  themes: string[];
  curatedThemes: string[];
}

export interface HistoryEloPoint {
  sessionId: string;
  completedAt: string;
  ratingBefore: number;
  ratingAfter: number;
}

export interface HistoryPuzzleStats {
  puzzleId: string;
  mode: SprintMode;
  ratingKey: string;
  correctCount: number;
  wrongCount: number;
  lastWrongAt?: string;
  nextReviewDay?: string;
}

export type HistoryPerformanceMetric = "rating" | "wins-losses" | "accuracy" | "solved" | "mistake-rate" | "review-due";

export interface HistoryPerformancePoint {
  key: string;
  value: number;
  completedAt?: string;
}

export interface HistoryPerformance {
  correctCount: number;
  wrongCount: number;
  accuracyPercent: number;
  charts: Record<HistoryPerformanceMetric, HistoryPerformancePoint[]>;
}

export interface HistoryView {
  query: HistoryQuery;
  range: HistoryResolvedRange;
  page: HistoryPage;
  ratingKeys: RatingRecord[];
  availableThemes: string[];
  availableSpeeds: number[];
  unclearCount: number;
  attempts: HistoryAttemptView[];
  elo: HistoryEloPoint[];
  puzzleStats: HistoryPuzzleStats[];
  performance: HistoryPerformance;
}

export interface HistoryAttemptDetail {
  id: string;
  puzzleId: string;
  source: AttemptSource | null;
  mode: SprintMode | null;
  ratingKey: string | null;
  result: AttemptResult | null;
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number | null;
  submittedMove: string | null;
  expectedMove: string | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingAfterStatus: "absent" | "valid" | "invalid";
  ratingDelta: number | null;
  arrowDuelCandidateOrderStatus: "absent" | "valid" | "corrupt";
  dataStatus: "complete" | "partial";
}

export type HistoryAttemptReplayAvailability =
  | { status: "available"; mode: SprintMode; ratingKey: string }
  | { status: "unavailable"; reason: "invalid-context" | "puzzle-unavailable" | "arrow-candidates-unavailable" };

export function resolveHistoryRange(now: string, timeRange: HistoryTimeRange): HistoryResolvedRange {
  const end = new Date(now);
  if (Number.isNaN(end.getTime())) {
    throw new Error("now must be a valid ISO timestamp");
  }
  if (timeRange === "max") {
    return {
      until: end.toISOString()
    };
  }
  const days = historyRangeDays(timeRange);
  return {
    since: new Date(end.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    until: end.toISOString()
  };
}

export function normalizeHistoryAttemptDetail(attempt: AttemptEvent | HistoryAttemptView): HistoryAttemptDetail {
  const source = normalizeHistorySource(attempt.source);
  const mode = normalizeHistoryMode(attempt.mode);
  const ratingKey = normalizeHistoryRatingKey(attempt.ratingKey);
  const result = normalizeHistoryResult(attempt.result);
  const startedAt = normalizeHistoryTimestamp(attempt.startedAt);
  const completedAt = normalizeHistoryTimestamp(attempt.completedAt);
  const startedAtMs = startedAt === null ? Number.NaN : new Date(startedAt).getTime();
  const completedAtMs = completedAt === null ? Number.NaN : new Date(completedAt).getTime();
  const elapsedSeconds = startedAt !== null && completedAt !== null && completedAtMs >= startedAtMs
    ? Math.round((completedAtMs - startedAtMs) / 1000)
    : null;
  const submittedMove = normalizeHistoryText(attempt.submittedMove);
  const expectedMove = normalizeHistoryText(attempt.expectedMove);
  const ratingBefore = Number.isFinite(attempt.ratingBefore) ? attempt.ratingBefore : null;
  const rawRatingAfter = attempt.ratingAfter;
  const ratingAfter = typeof rawRatingAfter === "number" && Number.isFinite(rawRatingAfter)
    ? rawRatingAfter
    : null;
  const ratingAfterStatus = rawRatingAfter === undefined
    ? "absent"
    : ratingAfter !== null
      ? "valid"
      : "invalid";
  const ratingDelta = ratingBefore !== null && ratingAfter !== null ? ratingAfter - ratingBefore : null;
  const arrowDuelCandidateOrderStatus = "arrowDuelCandidateOrderStatus" in attempt &&
      attempt.arrowDuelCandidateOrderStatus === "corrupt"
    ? "corrupt"
    : attempt.arrowDuelCandidateOrder === undefined
      ? "absent"
      : "valid";
  const dataStatus = source === null || mode === null || ratingKey === null || result === null ||
      startedAt === null || completedAt === null || elapsedSeconds === null ||
      submittedMove === null || expectedMove === null || ratingBefore === null ||
      ratingAfterStatus === "invalid" || arrowDuelCandidateOrderStatus === "corrupt"
    ? "partial"
    : "complete";

  return {
    id: attempt.id,
    puzzleId: attempt.puzzleId,
    source,
    mode,
    ratingKey,
    result,
    startedAt,
    completedAt,
    elapsedSeconds,
    submittedMove,
    expectedMove,
    ratingBefore,
    ratingAfter,
    ratingAfterStatus,
    ratingDelta,
    arrowDuelCandidateOrderStatus,
    dataStatus
  };
}

export function historyAttemptReplayAvailability(input: {
  attempt: AttemptEvent | HistoryAttemptView;
  puzzle?: Puzzle;
}): HistoryAttemptReplayAvailability {
  const detail = normalizeHistoryAttemptDetail(input.attempt);
  if (detail.source === null || detail.mode === null || detail.ratingKey === null || detail.result === null) {
    return { status: "unavailable", reason: "invalid-context" };
  }
  if (!input.puzzle) {
    return { status: "unavailable", reason: "puzzle-unavailable" };
  }
  if (detail.mode !== "arrow_duel") {
    return { status: "available", mode: detail.mode, ratingKey: detail.ratingKey };
  }
  if (detail.arrowDuelCandidateOrderStatus === "corrupt") {
    return { status: "unavailable", reason: "arrow-candidates-unavailable" };
  }
  try {
    beginArrowDuelPuzzle(
      input.puzzle,
      input.attempt.arrowDuelCandidateOrder === undefined
        ? 0
        : { candidateOrder: input.attempt.arrowDuelCandidateOrder }
    );
    return { status: "available", mode: detail.mode, ratingKey: detail.ratingKey };
  } catch {
    return { status: "unavailable", reason: "arrow-candidates-unavailable" };
  }
}

function normalizeHistoryText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeHistoryRatingKey(value: unknown): string | null {
  const normalized = normalizeHistoryText(value);
  if (normalized === null || normalized !== value) {
    return null;
  }
  return isPracticeRunRatingKey(normalized)
    || /^(?:\S+ )?(?:standard|blitz|custom|arrow(?:_| )duel) (?:[1-9]\d*|[1-9]\d*s)\/[1-9]\d*$/.test(normalized)
    ? normalized
    : null;
}

export function collectHistoryRatingKeys(values: Iterable<unknown>): string[] {
  const ratingKeys = new Set<string>();
  for (const value of values) {
    const ratingKey = normalizeHistoryRatingKey(value);
    if (ratingKey !== null) {
      ratingKeys.add(ratingKey);
    }
  }
  return [...ratingKeys];
}

function normalizeHistoryTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : null;
}

function normalizeHistorySource(value: unknown): AttemptSource | null {
  return value === "sprint" || value === "scheduled_review" ? value : null;
}

function normalizeHistoryMode(value: unknown): SprintMode | null {
  return value === "standard" || value === "blitz" || value === "arrow_duel" || value === "custom"
    ? value
    : null;
}

function normalizeHistoryResult(value: unknown): AttemptResult | null {
  return value === "correct" || value === "wrong" ? value : null;
}

export function validateHistoryQuery(query: HistoryQuery): HistoryQuery {
  resolveHistoryRange(query.now, query.timeRange);
  validateOptionalRatingBound("minRating", query.minRating);
  validateOptionalRatingBound("maxRating", query.maxRating);
  if (query.speedSeconds !== undefined && (!Number.isInteger(query.speedSeconds) || query.speedSeconds <= 0)) {
    throw new Error("speedSeconds must be a positive integer");
  }
  if (query.minRating !== undefined && query.maxRating !== undefined && query.minRating > query.maxRating) {
    throw new Error("minRating must be less than or equal to maxRating");
  }
  const page = query.page ? validateHistoryPageQuery(query.page) : undefined;
  const {
    ratingKey: rawRatingKey,
    theme: legacyTheme,
    themes: rawThemes,
    ...queryWithoutRatingAndThemes
  } = query;
  const ratingKey = normalizeHistoryRatingKey(rawRatingKey?.trim());
  const themes = namedThemesForSelection([
    ...(rawThemes ?? []),
    ...(legacyTheme === undefined ? [] : [legacyTheme])
  ]);
  const normalized: HistoryQuery = {
    ...queryWithoutRatingAndThemes,
    ...(ratingKey ? { ratingKey } : {}),
    ...(themes.length > 0 ? { themes } : {})
  };
  if (page) {
    normalized.page = page;
  }
  return normalized;
}

function validateOptionalRatingBound(label: "minRating" | "maxRating", value: number | undefined): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export function resolveHistoryPage(page: HistoryPageQuery | undefined, total: number): HistoryPage {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error("history total must be a non-negative integer");
  }
  if (!page) {
    return {
      limit: total,
      offset: 0,
      total,
      hasMore: false
    };
  }
  const normalized = validateHistoryPageQuery(page);
  return {
    limit: normalized.limit,
    offset: normalized.offset ?? 0,
    total,
    hasMore: (normalized.offset ?? 0) + normalized.limit < total
  };
}

export function applyHistoryPage<T>(items: T[], page: HistoryPage): T[] {
  return items.slice(page.offset, page.offset + page.limit);
}

export function sideToMoveForHistoryPuzzle(input: { puzzle: Puzzle; mode: SprintMode }): PuzzleSide {
  const state = input.mode === "arrow_duel" ? beginArrowDuelPuzzle(input.puzzle) : beginLinePuzzle(input.puzzle);
  const activeColor = state.currentFen.split(/\s+/)[1] === "b" ? "black" : "white";
  return activeColor;
}

export function buildHistoryView(input: {
  query: HistoryQuery;
  ratingKeys: RatingRecord[];
  attempts: HistoryAttemptView[];
  elo: HistoryEloPoint[];
  reviews: ReviewQueueState[];
  availableThemes?: string[];
  availableSpeeds?: number[];
  unclearCount?: number;
  allAttemptsForOptions?: HistoryAttemptView[];
}): HistoryView {
  const query = validateHistoryQuery(input.query);
  const range = resolveHistoryRange(query.now, query.timeRange);
  const page = resolveHistoryPage(query.page, input.attempts.length);
  const attempts = applyHistoryPage(input.attempts, page);
  const attemptsForOptions = input.allAttemptsForOptions ?? input.attempts;
  const availableThemes = input.availableThemes ?? collectThemes(attemptsForOptions);
  const availableSpeeds = input.availableSpeeds ?? collectHistorySpeeds(attemptsForOptions);
  const puzzleStats = buildHistoryPuzzleStats(input.attempts, input.reviews);
  return {
    query,
    range,
    page,
    ratingKeys: input.ratingKeys,
    availableThemes,
    availableSpeeds,
    unclearCount: input.unclearCount ?? attemptsForOptions.filter((attempt) => Boolean(attempt.unclear)).length,
    attempts,
    elo: input.elo,
    puzzleStats,
    performance: buildHistoryPerformance(input.attempts, input.elo, puzzleStats)
  };
}

export function filterHistoryAttemptsForQuery(input: {
  attempts: HistoryAttemptView[];
  query: Pick<HistoryQuery, "result" | "source" | "mode" | "side" | "minRating" | "maxRating" | "theme" | "themes" | "speedSeconds" | "reviewStatus" | "unclear">;
  reviews: ReviewQueueState[];
}): HistoryAttemptView[] {
  const selectedThemes = historyThemesForQuery(input.query);
  return input.attempts
    .filter((attempt) => !input.query.result || normalizeHistoryResult(attempt.result) === input.query.result)
    .filter((attempt) => !input.query.source || normalizeHistorySource(attempt.source) === input.query.source)
    .filter((attempt) => !input.query.mode || normalizeHistoryMode(attempt.mode) === input.query.mode)
    .filter((attempt) => !input.query.side || attempt.side === input.query.side)
    .filter((attempt) => input.query.minRating === undefined || attempt.puzzleRating >= input.query.minRating)
    .filter((attempt) => input.query.maxRating === undefined || attempt.puzzleRating <= input.query.maxRating)
    .filter((attempt) => puzzleMatchesAnyTheme(attempt.themes, selectedThemes))
    .filter((attempt) => input.query.speedSeconds === undefined || historyAttemptSpeedSeconds(attempt) === input.query.speedSeconds)
    .filter((attempt) => input.query.unclear === undefined || Boolean(attempt.unclear) === input.query.unclear)
    .filter((attempt) => {
      if (input.query.reviewStatus === undefined) {
        return true;
      }
      const queued = historyAttemptHasReviewQueued(attempt, input.reviews);
      return input.query.reviewStatus === "queued" ? queued : !queued;
    });
}

export function historyThemesForQuery(
  query: Pick<HistoryQuery, "theme" | "themes">
): string[] {
  return namedThemesForSelection([
    ...(query.themes ?? []),
    ...(query.theme === undefined ? [] : [query.theme])
  ]);
}

export function historyAttemptSpeedSeconds(
  attempt: Pick<HistoryAttemptView, "ratingKey" | "perPuzzleSeconds">
): number | null {
  if (attempt.perPuzzleSeconds !== undefined) {
    return attempt.perPuzzleSeconds;
  }
  const match = normalizeHistoryRatingKey(attempt.ratingKey)?.match(/\/(\d+)\b/);
  return match ? Number(match[1]) : null;
}

export function collectHistorySpeeds(
  attempts: Array<Pick<HistoryAttemptView, "ratingKey" | "perPuzzleSeconds">>
): number[] {
  const speeds = new Set<number>();
  for (const attempt of attempts) {
    const speed = historyAttemptSpeedSeconds(attempt);
    if (speed !== null) {
      speeds.add(speed);
    }
  }
  return [...speeds].sort((left, right) => left - right);
}

export function historyAttemptHasReviewQueued(
  attempt: Pick<HistoryAttemptView, "puzzleId" | "mode" | "ratingKey" | "result">,
  reviews: ReviewQueueState[]
): boolean {
  const result = normalizeHistoryResult(attempt.result);
  const mode = normalizeHistoryMode(attempt.mode);
  const ratingKey = normalizeHistoryRatingKey(attempt.ratingKey);
  if (result !== "wrong" || mode === null || ratingKey === null) {
    return false;
  }
  return reviews.some((review) =>
    review.puzzleId === attempt.puzzleId &&
    review.mode === mode &&
    review.ratingKey === ratingKey &&
    review.dueDay.length > 0
  );
}

export function historyAttemptReviewKey(input: Pick<HistoryAttemptView | ReviewQueueState, "puzzleId" | "mode" | "ratingKey">): string {
  return `${input.puzzleId}\u0000${input.mode}\u0000${input.ratingKey}`;
}

export function buildHistoryPuzzleStats(
  attempts: HistoryAttemptView[],
  reviews: ReviewQueueState[]
): HistoryPuzzleStats[] {
  const reviewsByAttemptKey = new Map(reviews.map((review) => [historyAttemptReviewKey(review), review]));
  const stats = new Map<string, HistoryPuzzleStats>();

  for (const attempt of attempts) {
    const detail = normalizeHistoryAttemptDetail(attempt);
    if (detail.source === null || detail.result === null || detail.mode === null || detail.ratingKey === null) {
      continue;
    }
    const normalizedContext = {
      puzzleId: attempt.puzzleId,
      mode: detail.mode,
      ratingKey: detail.ratingKey
    };
    const statsKey = historyAttemptReviewKey(normalizedContext);
    const current =
      stats.get(statsKey) ??
      {
        puzzleId: attempt.puzzleId,
        mode: detail.mode,
        ratingKey: detail.ratingKey,
        correctCount: 0,
        wrongCount: 0
      };

    if (detail.result === "correct") {
      current.correctCount += 1;
    } else {
      current.wrongCount += 1;
      if (detail.completedAt !== null && (!current.lastWrongAt || detail.completedAt > current.lastWrongAt)) {
        current.lastWrongAt = detail.completedAt;
      }
    }

    const review = reviewsByAttemptKey.get(statsKey);
    if (review) {
      current.nextReviewDay = review.dueDay;
    }
    stats.set(statsKey, current);
  }

  return [...stats.values()].sort((left, right) =>
    left.puzzleId.localeCompare(right.puzzleId) ||
    left.mode.localeCompare(right.mode) ||
    left.ratingKey.localeCompare(right.ratingKey)
  );
}

export function buildHistoryPerformance(
  attempts: HistoryAttemptView[],
  elo: HistoryEloPoint[],
  puzzleStats: HistoryPuzzleStats[]
): HistoryPerformance {
  const classifiedAttempts = partitionHistoryAttemptsByResult(attempts);
  const correctCount = classifiedAttempts.filter(({ result }) => result === "correct").length;
  const wrongCount = classifiedAttempts.filter(({ result }) => result === "wrong").length;
  const total = Math.max(1, correctCount + wrongCount);
  return {
    correctCount,
    wrongCount,
    accuracyPercent: Math.round((correctCount / total) * 100),
    charts: {
      rating: elo.map((point, index) => ({
        key: `${point.sessionId}-${point.completedAt}-${index}`,
        value: point.ratingAfter,
        completedAt: point.completedAt
      })),
      "wins-losses": buildAttemptPerformanceChart(classifiedAttempts, "wins-losses"),
      accuracy: buildAttemptPerformanceChart(classifiedAttempts, "accuracy"),
      solved: buildAttemptPerformanceChart(classifiedAttempts, "solved"),
      "mistake-rate": buildAttemptPerformanceChart(classifiedAttempts, "mistake-rate"),
      "review-due": puzzleStats.map((stats, index) => ({
        key: `${historyAttemptReviewKey(stats)}-${index}`,
        value: (stats.nextReviewDay ? 1 : 0) + Math.max(0, stats.wrongCount - stats.correctCount)
      }))
    }
  };
}

interface ClassifiedHistoryAttempt {
  attempt: HistoryAttemptView;
  result: AttemptResult;
}

function partitionHistoryAttemptsByResult(attempts: HistoryAttemptView[]): ClassifiedHistoryAttempt[] {
  const classified: ClassifiedHistoryAttempt[] = [];
  for (const attempt of attempts) {
    const detail = normalizeHistoryAttemptDetail(attempt);
    if (detail.source !== null && detail.mode !== null && detail.ratingKey !== null && detail.result !== null) {
      classified.push({ attempt, result: detail.result });
    }
  }
  return classified;
}

function buildAttemptPerformanceChart(
  attempts: ClassifiedHistoryAttempt[],
  metric: Exclude<HistoryPerformanceMetric, "rating" | "review-due">
): HistoryPerformancePoint[] {
  let correct = 0;
  let wrong = 0;
  return [...attempts].reverse().map(({ attempt, result }, index) => {
    if (result === "correct") {
      correct += 1;
    } else {
      wrong += 1;
    }
    const total = Math.max(1, correct + wrong);
    const value = metric === "wins-losses"
      ? correct - wrong
      : metric === "accuracy"
        ? Math.round((correct / total) * 100)
        : metric === "mistake-rate"
          ? Math.round((wrong / total) * 100)
          : correct;
    return {
      key: `${attempt.id}-${index}`,
      value
    };
  });
}

function collectThemes(attempts: HistoryAttemptView[]): string[] {
  return curatedPuzzleThemes(attempts.flatMap((attempt) => attempt.themes));
}

function historyRangeDays(timeRange: HistoryTimeRange): number {
  if (timeRange === "7d") {
    return 7;
  }
  if (timeRange === "30d") {
    return 30;
  }
  if (timeRange === "90d") {
    return 90;
  }
  if (timeRange === "1y") {
    return 365;
  }
  throw new Error(`Unsupported history time range: ${String(timeRange)}`);
}

function validateHistoryPageQuery(page: HistoryPageQuery): HistoryPageQuery {
  if (!Number.isInteger(page.limit) || page.limit <= 0) {
    throw new Error("history page limit must be a positive integer");
  }
  const offset = page.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("history page offset must be a non-negative integer");
  }
  return {
    limit: page.limit,
    offset
  };
}
