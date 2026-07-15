export type MobileBackPrimaryTab = "practice" | "review" | "history" | "settings";
export type MobileBackTab = MobileBackPrimaryTab | "analysis";

export type MobileBackTransient =
  | "practice-exit-confirmation"
  | "review-reminder-prompt"
  | "history-filters"
  | "review-filters"
  | "settings-advanced-ratings"
  | "custom-rating-editor"
  | "starting-practice";

export type MobileBackOwner = MobileBackPrimaryTab;

export type MobileBackDetail =
  | { kind: "review-analysis"; owner: "history" | "review" }
  | { kind: "review-session"; owner: "history" | "review" }
  | { kind: "custom-practice"; owner: "practice" }
  | { kind: "sprint-result"; owner: "practice" }
  | { kind: "stockfish-diagnostics"; owner: "settings" };

export type MobileBackState = {
  activePractice: boolean;
  detail: MobileBackDetail | null;
  tab: MobileBackTab;
  topTransient: MobileBackTransient | null;
};

export type MobileBackActivation = "button" | "predictive";

export type MobileBackIntent =
  | { kind: "dismiss-transient"; transient: MobileBackTransient }
  | { kind: "close-analysis"; owner: "history" | "review" }
  | { kind: "return-to-owner"; owner: MobileBackOwner }
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
  state: MobileBackState
): MobileBackDestination | null {
  switch (intent.kind) {
    case "dismiss-transient":
      if (intent.transient === "practice-exit-confirmation") {
        return { label: "Active sprint", testID: "active-practice" };
      }
      if (intent.transient === "starting-practice") {
        return { label: "Practice setup", testID: "practice-setup" };
      }
      if (intent.transient === "custom-rating-editor") {
        return { label: "Custom setup", testID: "custom-sprint-setup" };
      }
      return {
        label: destinationLabelForTab(state.tab),
        testID: `tab-${state.tab}`
      };
    case "close-analysis":
      return {
        label: intent.owner === "history" ? "History review" : "Review session",
        testID: `${intent.owner}-review`
      };
    case "return-to-owner":
      return {
        label: destinationLabelForTab(intent.owner),
        testID: `tab-${intent.owner}`
      };
    case "request-practice-exit":
      return { label: "Leave sprint confirmation", testID: "practice-exit-confirmation" };
    case "return-to-practice":
      return { label: "Practice", testID: "tab-practice" };
    case "delegate-platform":
      return null;
  }
}

function destinationLabelForTab(tab: MobileBackTab): string {
  switch (tab) {
    case "practice":
      return "Practice";
    case "review":
      return "Review";
    case "history":
      return "History";
    case "settings":
    case "analysis":
      return "Settings";
  }
}
