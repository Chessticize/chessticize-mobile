import { beginArrowDuelPuzzle, beginLinePuzzle } from "./puzzle-session.ts";
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
  theme?: string;
  mode?: SprintMode;
  speedSeconds?: number;
  reviewStatus?: HistoryReviewStatus;
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
  puzzleRating: number;
  side: PuzzleSide;
  themes: string[];
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
  nextReviewAt?: string;
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
  attempts: HistoryAttemptView[];
  elo: HistoryEloPoint[];
  puzzleStats: HistoryPuzzleStats[];
  performance: HistoryPerformance;
}

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
  const { ratingKey: rawRatingKey, ...queryWithoutRatingKey } = query;
  const ratingKey = rawRatingKey?.trim();
  const normalized: HistoryQuery = {
    ...queryWithoutRatingKey,
    ...(ratingKey ? { ratingKey } : {})
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
    attempts,
    elo: input.elo,
    puzzleStats,
    performance: buildHistoryPerformance(input.attempts, input.elo, puzzleStats)
  };
}

export function filterHistoryAttemptsForQuery(input: {
  attempts: HistoryAttemptView[];
  query: Pick<HistoryQuery, "result" | "source" | "mode" | "side" | "minRating" | "maxRating" | "theme" | "speedSeconds" | "reviewStatus">;
  reviews: ReviewQueueState[];
}): HistoryAttemptView[] {
  return input.attempts
    .filter((attempt) => !input.query.result || attempt.result === input.query.result)
    .filter((attempt) => !input.query.source || attempt.source === input.query.source)
    .filter((attempt) => !input.query.mode || attempt.mode === input.query.mode)
    .filter((attempt) => !input.query.side || attempt.side === input.query.side)
    .filter((attempt) => input.query.minRating === undefined || attempt.puzzleRating >= input.query.minRating)
    .filter((attempt) => input.query.maxRating === undefined || attempt.puzzleRating <= input.query.maxRating)
    .filter((attempt) => !input.query.theme || attempt.themes.includes(input.query.theme))
    .filter((attempt) => input.query.speedSeconds === undefined || historyAttemptSpeedSeconds(attempt) === input.query.speedSeconds)
    .filter((attempt) => {
      if (input.query.reviewStatus === undefined) {
        return true;
      }
      const queued = historyAttemptHasReviewQueued(attempt, input.reviews);
      return input.query.reviewStatus === "queued" ? queued : !queued;
    });
}

export function historyAttemptSpeedSeconds(attempt: Pick<HistoryAttemptView, "ratingKey">): number | null {
  const match = attempt.ratingKey.match(/\/(\d+)\b/);
  return match ? Number(match[1]) : null;
}

export function collectHistorySpeeds(attempts: Array<Pick<HistoryAttemptView, "ratingKey">>): number[] {
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
  if (attempt.result !== "wrong") {
    return false;
  }
  return reviews.some((review) =>
    review.puzzleId === attempt.puzzleId &&
    review.mode === attempt.mode &&
    review.ratingKey === attempt.ratingKey &&
    review.dueAt.length > 0
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
    const statsKey = historyAttemptReviewKey(attempt);
    const current =
      stats.get(statsKey) ??
      {
        puzzleId: attempt.puzzleId,
        mode: attempt.mode,
        ratingKey: attempt.ratingKey,
        correctCount: 0,
        wrongCount: 0
      };

    if (attempt.result === "correct") {
      current.correctCount += 1;
    } else {
      current.wrongCount += 1;
      if (!current.lastWrongAt || attempt.completedAt > current.lastWrongAt) {
        current.lastWrongAt = attempt.completedAt;
      }
    }

    const review = reviewsByAttemptKey.get(statsKey);
    if (review) {
      current.nextReviewAt = review.dueAt;
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
  const correctCount = attempts.filter((attempt) => attempt.result === "correct").length;
  const wrongCount = attempts.filter((attempt) => attempt.result === "wrong").length;
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
      "wins-losses": buildAttemptPerformanceChart(attempts, "wins-losses"),
      accuracy: buildAttemptPerformanceChart(attempts, "accuracy"),
      solved: buildAttemptPerformanceChart(attempts, "solved"),
      "mistake-rate": buildAttemptPerformanceChart(attempts, "mistake-rate"),
      "review-due": puzzleStats.map((stats, index) => ({
        key: `${historyAttemptReviewKey(stats)}-${index}`,
        value: (stats.nextReviewAt ? 1 : 0) + Math.max(0, stats.wrongCount - stats.correctCount)
      }))
    }
  };
}

function buildAttemptPerformanceChart(
  attempts: HistoryAttemptView[],
  metric: Exclude<HistoryPerformanceMetric, "rating" | "review-due">
): HistoryPerformancePoint[] {
  let correct = 0;
  let wrong = 0;
  return [...attempts].reverse().map((attempt, index) => {
    if (attempt.result === "correct") {
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
  return [...new Set(attempts.flatMap((attempt) => attempt.themes))].sort();
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
