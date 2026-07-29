import type { SprintEndReason, SprintStatus } from "./types.ts";

export const APP_REVIEW_REQUEST_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;

export interface AppReviewRequestAttempt {
  appVersion: string;
  attemptedAt: string;
}

export interface AppReviewSprintRecord {
  id: string;
  completedAt?: string;
  endReason?: SprintEndReason;
  focused: boolean;
  rated: boolean;
  status: SprintStatus;
}

export type AppReviewRequestIneligibleReason =
  | "invalid_app_version"
  | "current_sprint_not_successful"
  | "current_sprint_not_rated"
  | "current_sprint_is_focused"
  | "not_enough_successful_sprints"
  | "not_enough_local_dates"
  | "invalid_last_attempt"
  | "same_app_version"
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
  if (
    !current ||
    current.status !== "won" ||
    !current.completedAt ||
    !Number.isFinite(Date.parse(current.completedAt))
  ) {
    return ineligible("current_sprint_not_successful");
  }
  if (current.focused) {
    return ineligible("current_sprint_is_focused");
  }
  if (!current.rated) {
    return ineligible("current_sprint_not_rated");
  }

  const successfulSessions = [
    ...new Map(
      input.sessions
        .filter(isSuccessfulRatedPuzzleSprint)
        .map((session) => [session.id, session] as const)
    ).values()
  ];
  const successfulSprintCount = successfulSessions.length;
  const successfulLocalDateCount = new Set(
    successfulSessions.map((session) =>
      localCalendarDateKey(
        new Date(session.completedAt as string),
        input.timeZone
      )
    )
  ).size;
  const counts = { successfulSprintCount, successfulLocalDateCount };

  if (successfulSprintCount < 4) {
    return ineligible("not_enough_successful_sprints", counts);
  }
  if (successfulLocalDateCount < 2) {
    return ineligible("not_enough_local_dates", counts);
  }

  if (input.lastAttempt) {
    const attemptedAtMs = Date.parse(input.lastAttempt.attemptedAt);
    if (
      input.lastAttempt.appVersion.trim().length === 0 ||
      !Number.isFinite(attemptedAtMs)
    ) {
      return ineligible("invalid_last_attempt", counts);
    }
    if (input.lastAttempt.appVersion === appVersion) {
      return ineligible("same_app_version", counts);
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

function isSuccessfulRatedPuzzleSprint(
  session: AppReviewSprintRecord
): session is AppReviewSprintRecord & { completedAt: string } {
  return session.status === "won" &&
    session.rated &&
    !session.focused &&
    typeof session.completedAt === "string" &&
    Number.isFinite(Date.parse(session.completedAt));
}

function localCalendarDateKey(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }
  const parts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value ?? "")
    .join("-");
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
