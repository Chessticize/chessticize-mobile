import {
  calculateSprintRatingChange,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  isAttemptMistake,
  normalizeRatingRecord,
  RATING_FLOOR
} from "../../core/src/index.ts";
import type { RatingRecord } from "../../core/src/index.ts";
import type { AttemptHistoryRow } from "./query-types.ts";
import type { ExportedSprintSession } from "./practice-store.ts";
import { preferredSprintSession } from "./sprint-session-sync.ts";

export interface PracticeProgressSummary {
  correctThisWeek: number;
  accuracyThisWeek: number | null;
  ratingDeltaThisWeek: number | null;
  wrongThisWeek: number;
  netThisWeek: number;
}

export function indexSprintSessionsByRatingKey(
  sprintSessions: ExportedSprintSession[]
): ReadonlyMap<string, ExportedSprintSession[]> {
  const indexed = new Map<string, ExportedSprintSession[]>();
  for (const session of sprintSessions) {
    const sessions = indexed.get(session.ratingKey);
    if (sessions) {
      sessions.push(session);
    } else {
      indexed.set(session.ratingKey, [session]);
    }
  }
  return indexed;
}

export function buildPracticeProgressSummary(
  attempts: AttemptHistoryRow[],
  sprintSessions: ExportedSprintSession[],
  nowMs: number,
  ratingKey: string
): PracticeProgressSummary {
  const weekStartMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  let correctThisWeek = 0;
  let wrongThisWeek = 0;
  for (const attempt of attempts) {
    if (attempt.ratingKey !== ratingKey || !isWithinRange(attempt.completedAt, weekStartMs, nowMs)) {
      continue;
    }
    if (attempt.result === "correct") {
      correctThisWeek += 1;
    } else if (isAttemptMistake(attempt.result)) {
      wrongThisWeek += 1;
    }
  }

  let ratingDeltaThisWeek = 0;
  let ratedSprintCount = 0;
  for (const session of sprintSessions) {
    if (
      session.ratingKey !== ratingKey ||
      session.completedAt === undefined ||
      session.ratingAfter === undefined ||
      !isWithinRange(session.completedAt, weekStartMs, nowMs)
    ) {
      continue;
    }
    ratingDeltaThisWeek += session.ratingAfter - session.ratingBefore;
    ratedSprintCount += 1;
  }

  return {
    correctThisWeek,
    accuracyThisWeek: correctThisWeek + wrongThisWeek === 0
      ? null
      : Math.round((correctThisWeek / (correctThisWeek + wrongThisWeek)) * 100),
    ratingDeltaThisWeek: ratedSprintCount === 0 ? null : ratingDeltaThisWeek,
    wrongThisWeek,
    netThisWeek: correctThisWeek - wrongThisWeek
  };
}

export function reconcileRatingWithSprintSessions(
  rating: RatingRecord,
  sprintSessions: ExportedSprintSession[]
): RatingRecord {
  const normalized = normalizeRatingRecord(rating);
  return rebuildRatingFromSessions(
    normalized,
    currentGenerationSessions(normalized, sprintSessions)
  );
}

export function mergeRatingWithSprintSessions(
  local: RatingRecord,
  incoming: RatingRecord,
  localSessions: ExportedSprintSession[],
  incomingSessions: ExportedSprintSession[]
): RatingRecord {
  const normalizedLocal = normalizeRatingRecord(local);
  const normalizedIncoming = normalizeRatingRecord(incoming);
  if (normalizedIncoming.generation !== normalizedLocal.generation) {
    return normalizedIncoming.generation > normalizedLocal.generation
      ? reconcileRatingWithSprintSessions(normalizedIncoming, incomingSessions)
      : reconcileRatingWithSprintSessions(normalizedLocal, localSessions);
  }

  const incomingIsBase = normalizedIncoming.games >= normalizedLocal.games;
  const base = incomingIsBase ? normalizedIncoming : normalizedLocal;
  const sessions = new Map<string, ExportedSprintSession>();
  for (const session of currentGenerationSessions(normalizedLocal, localSessions)) {
    sessions.set(session.id, { ...session });
  }
  for (const session of currentGenerationSessions(normalizedIncoming, incomingSessions)) {
    const previous = sessions.get(session.id);
    sessions.set(
      session.id,
      previous ? preferredSprintSession(previous, session) : { ...session }
    );
  }

  return rebuildRatingFromSessions(
    {
      ...base,
      ratingDeviation: Math.min(
        normalizedLocal.ratingDeviation ?? DEFAULT_RATING_DEVIATION,
        normalizedIncoming.ratingDeviation ?? DEFAULT_RATING_DEVIATION
      )
    },
    [...sessions.values()],
    "merged"
  );
}

export function assignLegacyRatingGenerations(
  ratings: RatingRecord[],
  sprintSessions: ExportedSprintSession[]
): ExportedSprintSession[] {
  const assigned = new Map(sprintSessions.map((session) => [session.id, { ...session }]));
  const sessionsByRatingKey = indexSprintSessionsByRatingKey([...assigned.values()]);
  for (const rating of ratings) {
    for (const session of currentGenerationSessions(
      normalizeRatingRecord(rating),
      sessionsByRatingKey.get(rating.key) ?? []
    )) {
      if (session.ratingGeneration === undefined) {
        assigned.set(session.id, {
          ...session,
          ratingGeneration: rating.generation
        });
      }
    }
  }
  return [...assigned.values()];
}

function currentGenerationSessions(
  rating: RatingRecord,
  sprintSessions: ExportedSprintSession[]
): ExportedSprintSession[] {
  if (rating.games <= 0) {
    return [];
  }
  const candidates = sprintSessions
    .filter((session) =>
      session.ratingKey === rating.key &&
      session.completedAt !== undefined &&
      session.ratingAfter !== undefined
    )
    .sort(compareSessionsNewestFirst);
  const explicitlyAssigned = candidates.filter((session) => session.ratingGeneration === rating.generation);
  const legacySlots = Math.max(0, rating.games - explicitlyAssigned.length);
  const inferredLegacy = inferLegacyGenerationSessions(
    rating,
    explicitlyAssigned,
    candidates.filter((session) => session.ratingGeneration === undefined),
    legacySlots
  );
  return [...explicitlyAssigned, ...inferredLegacy]
    .sort(compareSessionsNewestFirst)
    .slice(0, rating.games);
}

function inferLegacyGenerationSessions(
  rating: RatingRecord,
  explicitlyAssigned: ExportedSprintSession[],
  legacyCandidates: ExportedSprintSession[],
  count: number
): ExportedSprintSession[] {
  if (count <= 0) {
    return [];
  }
  if (legacyCandidates.length <= count) {
    return legacyCandidates;
  }
  let best = legacyCandidates.slice(0, count);
  let bestError = ratingReconstructionError(rating, [...explicitlyAssigned, ...best]);
  for (let start = 1; start + count <= legacyCandidates.length; start += 1) {
    const candidate = legacyCandidates.slice(start, start + count);
    const error = ratingReconstructionError(rating, [...explicitlyAssigned, ...candidate]);
    if (error < bestError) {
      best = candidate;
      bestError = error;
    }
  }
  return best;
}

function ratingReconstructionError(
  rating: RatingRecord,
  sessions: ExportedSprintSession[]
): number {
  if (sessions.length === 0) {
    return Math.abs(rating.rating);
  }
  const ordered = [...sessions].sort(compareSessionsOldestFirst);
  const reconstructed = Math.max(
    RATING_FLOOR,
    ordered[0]!.ratingBefore + ordered.reduce(
      (total, session) => total + (session.ratingAfter as number) - session.ratingBefore,
      0
    )
  );
  return Math.abs(reconstructed - rating.rating);
}

function rebuildRatingFromSessions(
  base: RatingRecord,
  sprintSessions: ExportedSprintSession[],
  coverageMode: "exact" | "merged" = "exact"
): RatingRecord {
  if (sprintSessions.length === 0) {
    return base;
  }
  const ordered = [...sprintSessions].sort(compareSessionsOldestFirst);
  const replayAnchor = ratingReplayAnchor(ordered[0]!);
  if (replayAnchor) {
    const replayedGames = replayAnchor.games + ordered.length;
    const hasSufficientCoverage = coverageMode === "merged"
      ? replayedGames >= base.games
      : replayedGames === base.games;
    return hasSufficientCoverage
      ? replayRatingFromAnchor(base, ordered, replayAnchor)
      : base;
  }
  return base;
}

function ratingReplayAnchor(
  firstSession: ExportedSprintSession
): {
  games: number;
  rating: number;
  ratingDeviation: number;
  volatility: number;
} | undefined {
  const hasReplayAnchor =
    firstSession.ratingGamesBefore !== undefined ||
    firstSession.ratingDeviationBefore !== undefined ||
    firstSession.volatilityBefore !== undefined;
  if (hasReplayAnchor) {
    if (
      !isNonNegativeInteger(firstSession.ratingGamesBefore) ||
      !isPositiveFiniteNumber(firstSession.ratingDeviationBefore) ||
      !isPositiveFiniteNumber(firstSession.volatilityBefore)
    ) {
      return undefined;
    }
    const anchor = {
      games: firstSession.ratingGamesBefore,
      rating: firstSession.ratingBefore,
      ratingDeviation: firstSession.ratingDeviationBefore,
      volatility: firstSession.volatilityBefore
    };
    return sessionMatchesReplayAnchor(firstSession, anchor) ? anchor : undefined;
  }
  if (firstSession.ratingBefore !== RATING_FLOOR) {
    return undefined;
  }
  const anchor = {
    games: 0,
    rating: RATING_FLOOR,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY
  };
  return sessionMatchesReplayAnchor(firstSession, anchor) ? anchor : undefined;
}

function sessionMatchesReplayAnchor(
  session: ExportedSprintSession,
  anchor: {
    games: number;
    rating: number;
    ratingDeviation: number;
    volatility: number;
  }
): boolean {
  const recordedChange = calculateSprintRatingChange({
    rating: anchor,
    won: session.status === "won"
  });
  return recordedChange.ratingAfter === session.ratingAfter;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function replayRatingFromAnchor(
  base: RatingRecord,
  sprintSessions: ExportedSprintSession[],
  anchor: {
    games: number;
    rating: number;
    ratingDeviation: number;
    volatility: number;
  }
): RatingRecord {
  let { games, rating, ratingDeviation, volatility } = anchor;
  for (const session of sprintSessions) {
    const change = calculateSprintRatingChange({
      rating: {
        rating,
        ratingDeviation,
        volatility,
        games
      },
      won: session.status === "won"
    });
    rating = change.ratingAfter;
    ratingDeviation = change.ratingDeviationAfter;
    volatility = change.volatilityAfter;
    games += 1;
  }
  return {
    ...base,
    rating,
    ratingDeviation,
    volatility,
    games
  };
}

function compareSessionsNewestFirst(left: ExportedSprintSession, right: ExportedSprintSession): number {
  return (right.completedAt as string).localeCompare(left.completedAt as string) || right.id.localeCompare(left.id);
}

function compareSessionsOldestFirst(left: ExportedSprintSession, right: ExportedSprintSession): number {
  return (left.completedAt as string).localeCompare(right.completedAt as string) || left.id.localeCompare(right.id);
}

function isWithinRange(value: string, startMs: number, endMs: number): boolean {
  const valueMs = new Date(value).getTime();
  return Number.isFinite(valueMs) && valueMs >= startMs && valueMs <= endMs;
}
