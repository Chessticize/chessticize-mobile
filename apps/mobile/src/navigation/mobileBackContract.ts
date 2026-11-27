import { getActiveLocale, translate } from "../i18n/translate.ts";
import type { SupportedLocale } from "../../../../packages/core/src/index.ts";

export type MobileBackPrimaryTab = "practice" | "review" | "games" | "history" | "settings";
export type MobileBackTab = MobileBackPrimaryTab | "analysis";

export type MobileBackTransient =
  | "practice-exit-confirmation"
  | "review-reminder-prompt"
  | "history-filters"
  | "review-filters"
  | "games-import"
  | "settings-advanced-ratings"
  | "custom-rating-editor"
  | "sprint-session-guide"
  | "survival-guide-to-hub"
  | "survival-guide-to-practice"
  | "survival-hub"
  | "survival-pause"
  | "survival-records"
  | "survival-source-picker"
  | "starting-practice";

export type MobileBackOwner = MobileBackPrimaryTab;

export type MobileBackDetail =
  | { kind: "review-analysis"; owner: "history" | "review" }
  | { kind: "review-session"; owner: MobileBackOwner }
  | { kind: "game-review"; owner: "games" }
  | { kind: "history-progress"; owner: "history" }
  | { kind: "tactical-profile"; owner: "practice" }
  | { kind: "practice-run-editor"; owner: "practice" }
  | { kind: "custom-practice"; owner: "practice" }
  | { kind: "sprint-result"; owner: "practice" }
  | { kind: "stockfish-diagnostics"; owner: "settings" };

export type MobileBackState = {
  activePractice: boolean;
  activeSurvival: boolean;
  detail: MobileBackDetail | null;
  tab: MobileBackTab;
  topTransient: MobileBackTransient | null;
};

export type MobileBackActivation = "button" | "predictive";

export type MobileBackIntent =
  | { kind: "dismiss-transient"; transient: MobileBackTransient }
  | { kind: "close-analysis"; owner: "history" | "review" }
  | { kind: "return-to-owner"; owner: MobileBackOwner }
  | { kind: "pause-survival" }
  | { kind: "request-practice-exit" }
  | { kind: "return-to-practice" }
  | { kind: "delegate-platform" };

export type MobileBackDestination = {
  label: string;
  testID: string;
};

/**
 * The complete product navigation decision for Android Back. The activation
 * source is intentionally not consulted: a committed Predictive Back gesture
 * must complete the same destination as a button Back action.
 */
export function resolveMobileBackIntent(
  state: MobileBackState,
  _activation: MobileBackActivation
): MobileBackIntent {
  if (state.topTransient) {
    return { kind: "dismiss-transient", transient: state.topTransient };
  }

  if (state.detail?.kind === "review-analysis") {
    return { kind: "close-analysis", owner: state.detail.owner };
  }

  if (state.detail) {
    return { kind: "return-to-owner", owner: state.detail.owner };
  }

  if (state.activePractice && state.activeSurvival) {
    return { kind: "pause-survival" };
  }

  if (state.activePractice) {
    return { kind: "request-practice-exit" };
  }

  if (state.tab !== "practice") {
    return { kind: "return-to-practice" };
  }

  return { kind: "delegate-platform" };
}

/** A frontend-owned description of the destination revealed by a Back gesture. */
export function mobileBackDestination(
  intent: MobileBackIntent,
  state: MobileBackState,
  locale: SupportedLocale = getActiveLocale()
): MobileBackDestination | null {
  switch (intent.kind) {
    case "dismiss-transient":
      if (intent.transient === "practice-exit-confirmation") {
        return { label: translate(locale, "back.activeSprint"), testID: "active-practice" };
      }
      if (intent.transient === "starting-practice") {
        return { label: translate(locale, "back.practiceSetup"), testID: "practice-setup" };
      }
      if (intent.transient === "sprint-session-guide") {
        return { label: translate(locale, "back.practiceSetup"), testID: "practice-setup" };
      }
      if (
        intent.transient === "survival-guide-to-hub"
        || intent.transient === "survival-records"
        || intent.transient === "survival-source-picker"
      ) {
        return { label: translate(locale, "back.survivalHub"), testID: "personal-best-hub" };
      }
      if (
        intent.transient === "survival-guide-to-practice"
        || intent.transient === "survival-hub"
        || intent.transient === "survival-pause"
      ) {
        return { label: translate(locale, "tabs.practice"), testID: "practice-home" };
      }
      if (intent.transient === "custom-rating-editor") {
        return { label: translate(locale, "back.customSetup"), testID: "custom-sprint-setup" };
      }
      return {
        label: destinationLabelForTab(state.tab, locale),
        testID: `tab-${state.tab}`
      };
    case "close-analysis":
      return {
        label: intent.owner === "history"
          ? translate(locale, "back.historyReview")
          : translate(locale, "back.reviewSession"),
        testID: `${intent.owner}-review`
      };
    case "return-to-owner":
      return {
        label: destinationLabelForTab(intent.owner, locale),
        testID: `tab-${intent.owner}`
      };
    case "pause-survival":
      return { label: translate(locale, "back.survivalPause"), testID: "session-abandon-confirmation" };
    case "request-practice-exit":
      return { label: translate(locale, "back.leaveSprintConfirmation"), testID: "practice-exit-confirmation" };
    case "return-to-practice":
      return { label: translate(locale, "tabs.practice"), testID: "tab-practice" };
    case "delegate-platform":
      return null;
  }
}

function destinationLabelForTab(tab: MobileBackTab, locale: SupportedLocale): string {
  switch (tab) {
    case "practice":
      return translate(locale, "tabs.practice");
    case "review":
      return translate(locale, "tabs.review");
    case "games":
      return translate(locale, "back.games");
    case "history":
      return translate(locale, "tabs.history");
    case "settings":
    case "analysis":
      return translate(locale, "tabs.settings");
  }
}
