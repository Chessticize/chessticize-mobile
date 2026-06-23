import { beginArrowDuelPuzzle, beginLinePuzzle } from "./puzzle-session.ts";
import type { AttemptEvent, AttemptResult, Puzzle, RatingRecord, ReviewQueueState, SprintMode } from "./types.ts";

export type HistoryTimeRange = "7d" | "30d" | "90d" | "1y" | "max";
export type PuzzleSide = "white" | "black";

export interface HistoryPageQuery {
  limit: number;
  offset?: number;
}

export interface HistoryQuery {
  now: string;
  timeRange: HistoryTimeRange;
  ratingKey: string;
  result?: AttemptResult;
  side?: PuzzleSide;
  theme?: string;
  mode?: SprintMode;
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
  correctCount: number;
  wrongCount: number;
  lastWrongAt?: string;
  nextReviewAt?: string;
}

export interface HistoryView {
  query: HistoryQuery;
  range: HistoryResolvedRange;
  page: HistoryPage;
  ratingKeys: RatingRecord[];
  availableThemes: string[];
  attempts: HistoryAttemptView[];
  elo: HistoryEloPoint[];
  puzzleStats: HistoryPuzzleStats[];
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
  if (!query.ratingKey.trim()) {
    throw new Error("ratingKey is required");
  }
  resolveHistoryRange(query.now, query.timeRange);
  const page = query.page ? validateHistoryPageQuery(query.page) : undefined;
  const normalized: HistoryQuery = {
    ...query,
    ratingKey: query.ratingKey.trim()
  };
  if (page) {
    normalized.page = page;
  }
  return normalized;
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
}): HistoryView {
  const query = validateHistoryQuery(input.query);
  const range = resolveHistoryRange(query.now, query.timeRange);
  const page = resolveHistoryPage(query.page, input.attempts.length);
  const attempts = applyHistoryPage(input.attempts, page);
  const availableThemes = input.availableThemes ?? collectThemes(input.attempts);
  return {
    query,
    range,
    page,
    ratingKeys: input.ratingKeys,
    availableThemes,
    attempts,
    elo: input.elo,
    puzzleStats: buildHistoryPuzzleStats(attempts, input.reviews)
  };
}

export function buildHistoryPuzzleStats(
  attempts: HistoryAttemptView[],
  reviews: ReviewQueueState[]
): HistoryPuzzleStats[] {
  const reviewsByPuzzle = new Map(reviews.map((review) => [review.puzzleId, review]));
  const stats = new Map<string, HistoryPuzzleStats>();

  for (const attempt of attempts) {
    const current =
      stats.get(attempt.puzzleId) ??
      {
        puzzleId: attempt.puzzleId,
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

    const review = reviewsByPuzzle.get(attempt.puzzleId);
    if (review) {
      current.nextReviewAt = review.dueAt;
    }
    stats.set(attempt.puzzleId, current);
  }

  return [...stats.values()].sort((left, right) => left.puzzleId.localeCompare(right.puzzleId));
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
