import type { SprintSessionGuideStep } from "../../../../packages/core/src/index.ts";
import type { GuidePlacement } from "./sessionGuideGeometry.ts";

export type SessionGuideStepCopy = {
  detail: string;
  // Placements tried first for this step's target; the geometry flips to the
  // other sides when these have no room.
  preferred: readonly GuidePlacement[];
  title: string;
};

export type SessionGuideCopyContext = {
  focusedRun: boolean;
  mode: "standard" | "arrow_duel";
};

// Short copy for each first-use step (#611). Each step names one thing on the
// screen; the Sprint rules card on Practice Home covers the rest.
export function sessionGuideStepCopy(
  step: SprintSessionGuideStep,
  { focusedRun }: SessionGuideCopyContext
): SessionGuideStepCopy {
  switch (step) {
    case "session_progress":
      return focusedRun
        ? {
            detail: "Puzzles done and time so far. There’s no overall time limit.",
            preferred: ["below", "trailing"],
            title: "Track your Focused Run"
          }
        : {
            detail: "Puzzles solved, time left and mistakes left. The clock waits until you start.",
            preferred: ["below", "trailing"],
            title: "Track your Sprint"
          };
    case "slow_timer":
      return {
        detail: "Keep going. A slow correct answer still counts, but it is marked Unclear.",
        preferred: ["above", "below", "leading"],
        title: "Amber means slow"
      };
    case "mark_unclear":
      return {
        detail: "Tap it after a puzzle if the solution still doesn’t make sense to you.",
        preferred: ["above", "leading"],
        title: "Mark as unclear"
      };
    case "arrow_duel_choice":
      return {
        detail: "Two arrows, two candidate moves. Play the stronger one on the board.",
        preferred: ["trailing", "below", "above", "leading"],
        title: "Choose the stronger move"
      };
    case "arrow_duel_reply":
      return {
        detail: focusedRun
          ? "Next we play the other move. Find Black’s best reply in 10 seconds."
          : "Next we play the other move. Find Black’s best reply in 10 seconds. Sprint time pauses.",
        // Same order as the choice step, so both board steps sit in one place.
        preferred: ["trailing", "below", "above", "leading"],
        title: "Then reply for Black"
      };
  }
}

export function sessionGuideStartLabel({ focusedRun, mode }: SessionGuideCopyContext): string {
  return focusedRun
    ? "Start Focused Run"
    : mode === "arrow_duel"
      ? "Start Arrow Duel"
      : "Start Sprint";
}

// Arrow Duel steps keep their historical container test ID so store-asset and
// marketing captures can still tell the two guides apart.
export function sessionGuideContainerTestID(step: SprintSessionGuideStep): string {
  return step === "arrow_duel_choice" || step === "arrow_duel_reply"
    ? "practice-arrow-duel-guide"
    : "practice-active-session-guide";
}
