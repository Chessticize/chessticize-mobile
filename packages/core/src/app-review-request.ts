import type { SprintEndReason, SprintStatus } from "./types.ts";
import { localCalendarDateKey } from "./local-date.ts";

export const APP_REVIEW_REQUEST_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const APP_REVIEW_REQUEST_MIN_SESSIONS_MULTI_DATE = 2;
export const APP_REVIEW_REQUEST_MIN_SESSIONS_SINGLE_DATE = 3;
export const APP_REVIEW_REQUEST_MIN_SURVIVAL_CORRECT = 10;

export interface AppReviewRequestAttempt {
  appVersion: string;
  attemptedAt: string;
}

export interface AppReviewSprintRecord {
  id: string;
  completedAt?: string;
  correctCount?: number;
  endReason?: SprintEndReason;
  focused: boolean;
  mistakeCount?: number;
  rated: boolean;
  status: SprintStatus;
  survival?: boolean;
  targetCorrect?: number;
}

export type AppReviewRequestIneligibleReason =
  | "invalid_app_version"
  | "current_sprint_not_successful"
  | "not_enough_successful_sprints"
  | "invalid_last_attempt"
  | "cooldown_active";

export type AppReviewRequestEligibility =
  | {
      eligible: true;
      successfulSprintCount: number;
      successfulLocalDateCount: number;
    }
  | {
      eligible: false;
      reason: AppReviewRequestIneligibleReason;
      successfulSprintCount: number;
      successfulLocalDateCount: number;
    };

export interface EvaluateAppReviewRequestEligibilityInput {
  appVersion: string;
  currentSessionId: string;
  lastAttempt?: AppReviewRequestAttempt;
  nowMs: number;
  sessions: readonly AppReviewSprintRecord[];
  timeZone?: string;
}

export function evaluateAppReviewRequestEligibility(
  input: EvaluateAppReviewRequestEligibilityInput
): AppReviewRequestEligibility {
  const appVersion = input.appVersion.trim();
  if (appVersion.length === 0) {
    return ineligible("invalid_app_version");
  }

  const current = input.sessions.find(
    (session) => session.id === input.currentSessionId
  );
  if (!current || !isPositiveCompletedPuzzleSession(current)) {
    return ineligible("current_sprint_not_successful");
  }

  const successfulSessions = [
    ...new Map(
      input.sessions
        .filter(isPositiveCompletedPuzzleSession)
        .map((session) => [session.id, session] as const)
    ).values()
  ];
  const successfulSprintCount = successfulSessions.length;
  const successfulLocalDateCount = new Set(
    successfulSessions.map((session) =>
      localCalendarDateKey(session.completedAt, input.timeZone)
    )
  ).size;
  const counts = { successfulSprintCount, successfulLocalDateCount };

  const meetsMilestone =
    successfulSprintCount >= APP_REVIEW_REQUEST_MIN_SESSIONS_SINGLE_DATE ||
    (successfulSprintCount >= APP_REVIEW_REQUEST_MIN_SESSIONS_MULTI_DATE &&
      successfulLocalDateCount >= 2);
  if (!meetsMilestone) {
    return ineligible("not_enough_successful_sprints", counts);
  }

  if (input.lastAttempt) {
    const attemptedAtMs = Date.parse(input.lastAttempt.attemptedAt);
    if (
      input.lastAttempt.appVersion.trim().length === 0 ||
      !Number.isFinite(attemptedAtMs)
    ) {
      return ineligible("invalid_last_attempt", counts);
    }
    if (input.nowMs - attemptedAtMs < APP_REVIEW_REQUEST_COOLDOWN_MS) {
      return ineligible("cooldown_active", counts);
    }
  }

  return {
    eligible: true,
    ...counts
  };
}

function isPositiveCompletedPuzzleSession(
  session: AppReviewSprintRecord
): session is AppReviewSprintRecord & { completedAt: string } {
  if (
    session.status !== "won" ||
    typeof session.completedAt !== "string" ||
    !Number.isFinite(Date.parse(session.completedAt))
  ) {
    return false;
  }

  if (session.survival) {
    if (session.endReason === "pool_cleared") {
      return true;
    }
    const correct = session.correctCount;
    if (typeof correct !== "number" || !Number.isFinite(correct) || correct <= 0) {
      return false;
    }
    if (correct >= APP_REVIEW_REQUEST_MIN_SURVIVAL_CORRECT) {
      return true;
    }
    return (
      typeof session.targetCorrect === "number" &&
      Number.isFinite(session.targetCorrect) &&
      session.targetCorrect > 0 &&
      correct >= session.targetCorrect
    );
  }

  if (session.focused) {
    const correct = session.correctCount;
    const mistakes = session.mistakeCount ?? 0;
    if (
      typeof correct !== "number" ||
      !Number.isFinite(correct) ||
      correct <= 0 ||
      !Number.isFinite(mistakes) ||
      mistakes < 0
    ) {
      return false;
    }
    return correct * 5 >= (correct + mistakes) * 3;
  }

  return true;
}

function ineligible(
  reason: AppReviewRequestIneligibleReason,
  counts: {
    successfulSprintCount: number;
    successfulLocalDateCount: number;
  } = {
    successfulSprintCount: 0,
    successfulLocalDateCount: 0
  }
): AppReviewRequestEligibility {
  return {
    eligible: false,
    reason,
    ...counts
  };
}
