import {
  DEFAULT_RATING_DEVIATION,
  normalizeRatingRecord,
  RATING_FLOOR
} from "../../core/src/index.ts";
import type { RatingRecord } from "../../core/src/index.ts";
import type { AttemptHistoryRow } from "./query-types.ts";
import type { ExportedSprintSession } from "./practice-store.ts";

export interface PracticeProgressSummary {
  correctThisWeek: number;
  accuracyThisWeek: number | null;
  ratingDeltaThisWeek: number | null;
  wrongThisWeek: number;
  netThisWeek: number;
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
    } else {
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
    sessions.set(session.id, previous ? preferredSession(previous, session) : { ...session });
  }

  return rebuildRatingFromSessions(
    {
      ...base,
      // A shorter history can still carry the cold-start RD (350). Reusing it
      // would erase convergence from the device that has played more games.
      // Equal-length histories may have diverged concurrently, so retain the
      // more conservative uncertainty in that case.
      ratingDeviation: normalizedIncoming.games === normalizedLocal.games
        ? Math.max(
            normalizedLocal.ratingDeviation ?? 0,
            normalizedIncoming.ratingDeviation ?? 0
          )
        : base.ratingDeviation ?? DEFAULT_RATING_DEVIATION
    },
    [...sessions.values()]
  );
}

function currentGenerationSessions(
  rating: RatingRecord,
  sprintSessions: ExportedSprintSession[]
): ExportedSprintSession[] {
  if (rating.games <= 0) {
    return [];
  }
  return sprintSessions
    .filter((session) =>
      session.ratingKey === rating.key &&
      session.completedAt !== undefined &&
      session.ratingAfter !== undefined
    )
    .sort(compareSessionsNewestFirst)
    .slice(0, rating.games);
}

function rebuildRatingFromSessions(
  base: RatingRecord,
  sprintSessions: ExportedSprintSession[]
): RatingRecord {
  if (sprintSessions.length === 0) {
    return base;
  }
  const ordered = [...sprintSessions].sort(compareSessionsOldestFirst);
  const initialRating = ordered[0]!.ratingBefore;
  const delta = ordered.reduce(
    (total, session) => total + (session.ratingAfter as number) - session.ratingBefore,
    0
  );
  return {
    ...base,
    rating: Math.max(RATING_FLOOR, initialRating + delta),
    games: ordered.length
  };
}

function compareSessionsNewestFirst(left: ExportedSprintSession, right: ExportedSprintSession): number {
  return (right.completedAt as string).localeCompare(left.completedAt as string) || right.id.localeCompare(left.id);
}

function compareSessionsOldestFirst(left: ExportedSprintSession, right: ExportedSprintSession): number {
  return (left.completedAt as string).localeCompare(right.completedAt as string) || left.id.localeCompare(right.id);
}

function preferredSession(
  local: ExportedSprintSession,
  incoming: ExportedSprintSession
): ExportedSprintSession {
  const completedComparison = (incoming.completedAt as string).localeCompare(local.completedAt as string);
  if (completedComparison !== 0) {
    return completedComparison > 0 ? { ...incoming } : { ...local };
  }
  return incoming.startedAt >= local.startedAt ? { ...incoming } : { ...local };
}

function isWithinRange(value: string, startMs: number, endMs: number): boolean {
  const valueMs = new Date(value).getTime();
  return Number.isFinite(valueMs) && valueMs >= startMs && valueMs <= endMs;
}
