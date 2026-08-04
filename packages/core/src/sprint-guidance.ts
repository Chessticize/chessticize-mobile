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

export function sprintSessionGuidesFor(
  progress: SprintGuideProgress,
  mode: SprintMode,
  options: { focusedRun?: boolean } = {}
): SprintSessionGuideKey[] {
  if (options.focusedRun) {
    return [
      ...(progress.focusedRunSeen ? [] : ["focused_run" as const]),
      ...(mode === "arrow_duel" && !progress.arrowDuelSeen
        ? ["arrow_duel" as const]
        : [])
    ];
  }
  return [
    ...(progress.activeSessionSeen ? [] : ["active_session" as const]),
    ...(mode === "arrow_duel" && !progress.arrowDuelSeen
      ? ["arrow_duel" as const]
      : [])
  ];
}
