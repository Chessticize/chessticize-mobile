import type { SprintMode } from "./types.ts";

export type SprintGuideKey =
  | "rules"
  | "active_session"
  | "arrow_duel"
  | "focused_run";

export type SprintGuideProgress = {
  rulesSeen: boolean;
  activeSessionSeen: boolean;
  arrowDuelSeen: boolean;
  focusedRunSeen?: boolean;
  arrowDuelReplyCueStage?: ArrowDuelReplyCueStage;
};

export type ArrowDuelReplyCueStage = 0 | 1 | 2 | 3;

export type ArrowDuelReplyCuePresentation = {
  confirmationRequired: boolean;
  holdMs: number | null;
};

export type SprintSessionGuideKey = Exclude<SprintGuideKey, "rules">;

export function defaultSprintGuideProgress(): SprintGuideProgress {
  return {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false,
    focusedRunSeen: false,
    arrowDuelReplyCueStage: 0
  };
}

export function resetSprintGuideProgress(): SprintGuideProgress {
  return defaultSprintGuideProgress();
}

export function markSprintGuideSeen(
  progress: SprintGuideProgress,
  guide: SprintGuideKey
): SprintGuideProgress {
  switch (guide) {
    case "rules":
      return { ...progress, rulesSeen: true };
    case "active_session":
      return { ...progress, activeSessionSeen: true };
    case "arrow_duel":
      return { ...progress, arrowDuelSeen: true };
    case "focused_run":
      return { ...progress, focusedRunSeen: true };
  }
}

export function acknowledgeArrowDuelReplyCue(
  progress: SprintGuideProgress
): SprintGuideProgress {
  return {
    ...progress,
    arrowDuelReplyCueStage: Math.max(1, arrowDuelReplyCueStageFor(progress)) as ArrowDuelReplyCueStage
  };
}

export function advanceArrowDuelReplyCueSprint(
  progress: SprintGuideProgress
): SprintGuideProgress {
  const stage = arrowDuelReplyCueStageFor(progress);
  return {
    ...progress,
    arrowDuelReplyCueStage: stage === 0
      ? 0
      : Math.min(3, stage + 1) as ArrowDuelReplyCueStage
  };
}

export function arrowDuelReplyCuePresentationFor(
  progress: SprintGuideProgress
): ArrowDuelReplyCuePresentation {
  const stage = arrowDuelReplyCueStageFor(progress);
  if (stage === 0) {
    return {
      confirmationRequired: true,
      holdMs: null
    };
  }
  return {
    confirmationRequired: false,
    holdMs: stage < 3 ? 1_500 : 1_000
  };
}

function arrowDuelReplyCueStageFor(
  progress: SprintGuideProgress
): ArrowDuelReplyCueStage {
  const stage = progress.arrowDuelReplyCueStage;
  return stage === 1 || stage === 2 || stage === 3 ? stage : 0;
}

// One short step of the first-use session guide. Each step points at a single
// element of the real session screen.
export type SprintSessionGuideStep =
  | "session_progress"
  | "slow_timer"
  | "mark_unclear"
  | "arrow_duel_choice"
  | "arrow_duel_reply";

export type SprintSessionGuidePlan = {
  steps: SprintSessionGuideStep[];
  // Guides recorded as seen once the player finishes the last step. Leaving
  // early records nothing, so the guide is offered again next time.
  completes: SprintSessionGuideKey[];
};

// The first-use guide shows at most this many steps before any session.
export const SPRINT_SESSION_GUIDE_MAX_STEPS = 3;

const SESSION_BASICS_STEPS: readonly SprintSessionGuideStep[] = [
  "session_progress",
  "slow_timer",
  "mark_unclear"
];

// Chooses the first-use steps for the session that is about to start.
// Standard (and Custom) Sprints teach the header, the amber slow timer and
// Mark as unclear. A first Arrow Duel teaches the stronger-move choice and,
// when the opponent reply is enabled, the reply; a player who has never seen
// any session guide also gets the header step first. The Sprint rules card on
// Practice Home already covers Slow and Timeout, so neither mode adds more.
export function sprintSessionGuidePlanFor(
  progress: SprintGuideProgress,
  mode: SprintMode,
  options: { focusedRun?: boolean; opponentReply?: boolean } = {}
): SprintSessionGuidePlan {
  const sessionGuide: SprintSessionGuideKey = options.focusedRun
    ? "focused_run"
    : "active_session";
  const sessionGuideSeen = options.focusedRun
    ? progress.focusedRunSeen === true
    : progress.activeSessionSeen;

  if (mode !== "arrow_duel") {
    return sessionGuideSeen
      ? { steps: [], completes: [] }
      : { steps: [...SESSION_BASICS_STEPS], completes: [sessionGuide] };
  }

  const arrowDuelSteps: SprintSessionGuideStep[] = progress.arrowDuelSeen
    ? []
    : [
        "arrow_duel_choice",
        ...(options.opponentReply ? ["arrow_duel_reply" as const] : [])
      ];
  if (options.focusedRun) {
    return {
      steps: [
        ...(sessionGuideSeen ? [] : ["session_progress" as const]),
        ...arrowDuelSteps
      ],
      completes: [
        ...(sessionGuideSeen ? [] : [sessionGuide]),
        ...(arrowDuelSteps.length > 0 ? ["arrow_duel" as const] : [])
      ]
    };
  }
  if (arrowDuelSteps.length === 0) {
    return { steps: [], completes: [] };
  }
  // The header step orients a brand-new player only. It does not complete the
  // shared session guide, whose slow-timer and Mark as unclear steps were not
  // shown, so a later Standard Sprint still teaches them.
  return {
    steps: [
      ...(sessionGuideSeen ? [] : ["session_progress" as const]),
      ...arrowDuelSteps
    ],
    completes: ["arrow_duel"]
  };
}

export function markSprintSessionGuidePlanSeen(
  progress: SprintGuideProgress,
  plan: SprintSessionGuidePlan
): SprintGuideProgress {
  return plan.completes.reduce(markSprintGuideSeen, progress);
}
