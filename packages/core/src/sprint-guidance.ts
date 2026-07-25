import type { SprintMode } from "./types.ts";

export type SprintGuideKey = "rules" | "active_session" | "arrow_duel";

export type SprintGuideProgress = {
  rulesSeen: boolean;
  activeSessionSeen: boolean;
  arrowDuelSeen: boolean;
};

export type SprintSessionGuideKey = Exclude<SprintGuideKey, "rules">;

export function defaultSprintGuideProgress(): SprintGuideProgress {
  return {
    rulesSeen: false,
    activeSessionSeen: false,
    arrowDuelSeen: false
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
  }
}

export function sprintSessionGuidesFor(
  progress: SprintGuideProgress,
  mode: SprintMode
): SprintSessionGuideKey[] {
  return [
    ...(progress.activeSessionSeen ? [] : ["active_session" as const]),
    ...(mode === "arrow_duel" && !progress.arrowDuelSeen
      ? ["arrow_duel" as const]
      : [])
  ];
}
