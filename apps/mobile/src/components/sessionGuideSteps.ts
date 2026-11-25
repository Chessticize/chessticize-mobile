import type { SprintSessionGuideStep } from "../../../../packages/core/src/index.ts";
import { getActiveLocale, translate, type SupportedLocale } from "../i18n/index.ts";
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
  { focusedRun }: SessionGuideCopyContext,
  locale: SupportedLocale = getActiveLocale()
): SessionGuideStepCopy {
  switch (step) {
    case "session_progress":
      return focusedRun
        ? {
            detail: translate(locale, "guide.sessionProgress.focusedDetail"),
            preferred: ["below", "trailing"],
            title: translate(locale, "guide.sessionProgress.focusedTitle")
          }
        : {
            detail: translate(locale, "guide.sessionProgress.sprintDetail"),
            preferred: ["below", "trailing"],
            title: translate(locale, "guide.sessionProgress.sprintTitle")
          };
    case "slow_timer":
      return {
        detail: translate(locale, "guide.slowTimer.detail"),
        preferred: ["above", "below", "leading"],
        title: translate(locale, "guide.slowTimer.title")
      };
    case "mark_unclear":
      return {
        detail: translate(locale, "guide.markUnclear.detail"),
        preferred: ["above", "leading"],
        title: translate(locale, "guide.markUnclear.title")
      };
    case "arrow_duel_choice":
      return {
        detail: translate(locale, "guide.arrowDuelChoice.detail"),
        preferred: ["trailing", "below", "above", "leading"],
        title: translate(locale, "guide.arrowDuelChoice.title")
      };
    case "arrow_duel_reply":
      return {
        detail: focusedRun
          ? translate(locale, "guide.arrowDuelReply.focusedDetail")
          : translate(locale, "guide.arrowDuelReply.sprintDetail"),
        // Same order as the choice step, so both board steps sit in one place.
        preferred: ["trailing", "below", "above", "leading"],
        title: translate(locale, "guide.arrowDuelReply.title")
      };
  }
}

export function sessionGuideStartLabel(
  { focusedRun, mode }: SessionGuideCopyContext,
  locale: SupportedLocale = getActiveLocale()
): string {
  return focusedRun
    ? translate(locale, "guide.startFocusedRun")
    : mode === "arrow_duel"
      ? translate(locale, "guide.startArrowDuel")
      : translate(locale, "guide.startSprint");
}

// Arrow Duel steps keep their historical container test ID so store-asset and
// marketing captures can still tell the two guides apart.
export function sessionGuideContainerTestID(step: SprintSessionGuideStep): string {
  return step === "arrow_duel_choice" || step === "arrow_duel_reply"
    ? "practice-arrow-duel-guide"
    : "practice-active-session-guide";
}
