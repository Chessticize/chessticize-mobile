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
};

export type SprintSessionGuideKey = Exclude<SprintGuideKey, "rules">;

export function defaultSprintGuideProgress(): SprintGuideProgress {
  return {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false,
    focusedRunSeen: false
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
