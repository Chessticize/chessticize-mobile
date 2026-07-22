import type {
  MobileBackDetail,
  MobileBackPrimaryTab,
  MobileBackTab,
  MobileBackTransient
} from "../../mobile/src/navigation/mobileBackContract.ts";

export type LabScenarioId =
  | "practice-home"
  | "practice-custom-setup"
  | "practice-custom-rating-editor"
  | "practice-preparing"
  | "practice-active"
  | "practice-arrow-duel-prompt"
  | "practice-blunder-move-preview"
  | "practice-paused"
  | "practice-exit-confirmation"
  | "practice-summary"
  | "practice-reminder-prompt"
  | "review-empty"
  | "review-due"
  | "review-overdue"
  | "review-filters"
  | "review-session"
  | "review-blunder-move-preview"
  | "review-feedback-analysis"
  | "history-empty"
  | "history-populated"
  | "history-filters"
  | "history-attempt-detail"
  | "history-replay-unavailable"
  | "settings-ios-sync"
  | "settings-android-backup"
  | "settings-notifications-denied"
  | "settings-notifications-not-determined"
  | "settings-advanced-ratings"
  | "settings-stockfish-diagnostics"
  | "system-loading"
  | "system-error"
  | "system-full-app";

export type LabScenarioGroup = "Practice" | "Review" | "History" | "Settings" | "System";

type ScenarioMarker =
  | { isNew: true; changeNote: string }
  | { isNew?: false; changeNote?: never };

export type LabScenarioDefinition = ScenarioMarker & {
  id: LabScenarioId;
  group: LabScenarioGroup;
  title: string;
  description: string;
  storyId: string;
  scope: {
    owner: MobileBackPrimaryTab | "system";
    includes: readonly string[];
    exits: readonly string[];
    containment: "contained" | "free-roam";
  };
};

export const scenarioRegistry: Record<LabScenarioId, LabScenarioDefinition> = {
  "practice-home": defineScenario("practice-home", "Practice", "Home", "practice--home", "Idle Practice home with deterministic ratings and no persisted progress.", "practice", ["Mode selection", "Progress summary", "Review workload strip"], ["Review", "History", "Settings"]),
  "practice-custom-setup": defineScenario("practice-custom-setup", "Practice", "Custom sprint setup", "practice--custom-setup", "Custom timing, theme, mode, rating, and start controls.", "practice", ["Custom configuration", "Steppers", "Theme choices"], ["Practice home"]),
  "practice-custom-rating-editor": defineScenario("practice-custom-rating-editor", "Practice", "Custom rating editor", "practice--custom-rating-editor", "Expanded ELO adjustment for a previously played custom rating bucket.", "practice", ["Custom setup", "Rating adjustment"], ["Practice home"]),
  "practice-preparing": defineScenario("practice-preparing", "Practice", "Preparing", "practice--preparing", "Stable preparing overlay before an Arrow Duel sprint starts.", "practice", ["Preparing overlay", "Cancel through Back intent"], ["Active sprint", "Practice home"]),
  "practice-active": defineScenario("practice-active", "Practice", "Active session", "practice--active-session", "Active Standard sprint with the development-only Board Placeholder.", "practice", ["Timer", "Progress", "Board state", "Pause", "Accessible moves"], ["Sprint result"]),
  "practice-arrow-duel-prompt": defineScenario("practice-arrow-duel-prompt", "Practice", "Arrow Duel prompt icon", "practice--arrow-duel-prompt", "Active Arrow Duel session showing the side-to-move king in the board prompt while preserving its existing placement and copy.", "practice", ["King prompt icon", "Arrow Duel copy", "Existing prompt placement", "Candidate arrows"], ["Sprint result"], { isNew: true, changeNote: "Issue #272: replace the ambiguous dark prompt logo with the side-to-move king in Arrow Duel too." }),
  "practice-blunder-move-preview": defineScenario("practice-blunder-move-preview", "Practice", "Blunder move preview", "practice--blunder-move-preview", "Standard puzzle entry that animates the opponent blunder before unlocking the Board Placeholder.", "practice", ["Blunder replay", "King side badge", "Prompt above board", "Input lock"], ["Active sprint"], { isNew: true, changeNote: "Issue #272: animate the blunder, use a king side icon, and move the prompt above the board." }),
  "practice-paused": defineScenario("practice-paused", "Practice", "Paused session", "practice--paused-session", "Paused sprint with resume and abandon actions.", "practice", ["Paused state", "Resume", "Abandon"], ["Active sprint", "Sprint result"]),
  "practice-exit-confirmation": defineScenario("practice-exit-confirmation", "Practice", "Exit confirmation", "practice--exit-confirmation", "Guarded abandon confirmation over an active sprint.", "practice", ["Confirmation", "Cancel", "Confirm abandon"], ["Active sprint", "Sprint result"]),
  "practice-summary": defineScenario("practice-summary", "Practice", "Sprint summary", "practice--sprint-summary", "Completed one-puzzle sprint summary reached through the public board callback.", "practice", ["Result", "Rating change", "History and review actions"], ["Practice home", "History", "Review"]),
  "practice-reminder-prompt": defineScenario("practice-reminder-prompt", "Practice", "Review reminder prompt", "practice--review-reminder-prompt", "First-mistake notification-permission prompt driven by a maintained fake client.", "practice", ["Permission rationale", "Enable", "Dismiss"], ["Active sprint"]),
  "review-empty": defineScenario("review-empty", "Review", "Empty queue", "review--empty-queue", "Review with no due or future items.", "review", ["Empty state", "Practice return"], ["Practice"]),
  "review-due": defineScenario("review-due", "Review", "Due queue", "review--due-queue", "Deterministic due workload with multiple contexts.", "review", ["Due metrics", "Forecast", "Queue rows", "Start review"], ["Review session", "Practice"]),
  "review-overdue": defineScenario("review-overdue", "Review", "Overdue queue", "review--overdue-queue", "Overdue workload and danger treatment.", "review", ["Overdue count", "Due rows", "Forecast"], ["Review session", "Practice"]),
  "review-filters": defineScenario("review-filters", "Review", "Filters", "review--filters", "Expanded filters with an active overdue selection.", "review", ["Mode, speed, theme, and overdue filters", "Active filter summary"], ["Review session", "Practice"]),
  "review-session": defineScenario("review-session", "Review", "Review session", "review--review-session", "Due Review session using the Board Placeholder and public queue state.", "review", ["Board", "Timer", "Context", "Previous and next"], ["Review queue"]),
  "review-blunder-move-preview": defineScenario("review-blunder-move-preview", "Review", "Review blunder move preview", "review--blunder-move-preview", "Due Review entry that replays the original blunder before the user retries the puzzle.", "review", ["Blunder replay", "King side badge", "Prompt above board", "Input lock"], ["Review queue"], { isNew: true, changeNote: "Issue #272: carry the approved puzzle-entry hierarchy into Review." }),
  "review-feedback-analysis": defineScenario("review-feedback-analysis", "Review", "Feedback and analysis", "review--feedback-and-analysis", "Wrong-move feedback followed by the browser-safe fallback analysis surface.", "review", ["Move feedback", "Analysis lines", "Reset and flip controls"], ["Review session"]),
  "history-empty": defineScenario("history-empty", "History", "Empty history", "history--empty-history", "History with no attempts or rating points.", "history", ["Empty state", "Primary filters"], ["Practice", "Review", "Settings"]),
  "history-populated": defineScenario("history-populated", "History", "Populated history", "history--populated-history", "Deterministic correct, wrong, and unclear attempts with a rating trend.", "history", ["Attempt rows", "Rating chart", "Quick filters"], ["Attempt detail", "Review"]),
  "history-filters": defineScenario("history-filters", "History", "Filters and active filters", "history--filters-and-active-filters", "Expanded history filters with a visible Wrong-only summary.", "history", ["Advanced filters", "Active filter summary", "Reset"], ["Attempt detail"]),
  "history-attempt-detail": defineScenario("history-attempt-detail", "History", "Attempt detail", "history--attempt-detail", "Replayable persisted attempt detail reached through the History row.", "history", ["Persisted result", "Moves", "Rating", "Review enrollment"], ["History"]),
  "history-replay-unavailable": defineScenario("history-replay-unavailable", "History", "Replay unavailable", "history--replay-unavailable", "Legacy Arrow Duel attempt whose candidate order cannot be reconstructed safely.", "history", ["Persisted details", "Replay-unavailable explanation"], ["History"]),
  "settings-ios-sync": defineScenario("settings-ios-sync", "Settings", "iOS sync", "settings--ios-sync", "iOS capabilities with iCloud Sync controls and no real account access.", "settings", ["iCloud Sync", "Profile", "About"], ["Stockfish diagnostics"]),
  "settings-android-backup": defineScenario("settings-android-backup", "Settings", "Android backup", "settings--android-backup", "Android managed-backup variant with iCloud controls omitted.", "settings", ["Android Progress Backup", "Notifications", "About"], ["Stockfish diagnostics"]),
  "settings-notifications-denied": defineScenario("settings-notifications-denied", "Settings", "Notifications denied", "settings--notifications-denied", "Denied notification permission with a public system-settings action.", "settings", ["Permission state", "Reminder preferences", "Open settings"], ["System settings"]),
  "settings-notifications-not-determined": defineScenario("settings-notifications-not-determined", "Settings", "Notifications not determined", "settings--notifications-not-determined", "Notification permission has not yet been requested.", "settings", ["Permission request", "Reminder preferences"], ["System permission prompt"]),
  "settings-advanced-ratings": defineScenario("settings-advanced-ratings", "Settings", "Advanced rating editor", "settings--advanced-rating-editor", "Expanded rating adjustment and reset controls.", "settings", ["Rating editor", "Adjustment controls"], ["Settings"]),
  "settings-stockfish-diagnostics": defineScenario("settings-stockfish-diagnostics", "Settings", "Stockfish diagnostics", "settings--stockfish-diagnostics", "Development diagnostics with the engine boundary unavailable in the browser.", "settings", ["Diagnostic positions", "Unavailable engine state"], ["Settings"]),
  "system-loading": defineScenario("system-loading", "System", "Loading", "system--loading", "Reusable full-screen loading treatment shown through the real sprint start transition.", "system", ["Progress indicator", "Loading copy"], ["Practice"]),
  "system-error": defineScenario("system-error", "System", "Error", "system--error", "Real start failure rendered with an empty in-memory puzzle service.", "system", ["Error message", "Recovery context"], ["Practice"]),
  "system-full-app": defineScenario("system-full-app", "System", "Full App (free roam)", "system--full-app-free-roam", "Unconstrained whole-screen scenario for exploratory flow walking.", "system", ["All current tabs and non-native interactions"], ["External links", "Native-only services"])
};

type CatalogCoverage =
  | { kind: "scenario"; scenario: LabScenarioId }
  | { kind: "not-cataloged"; reason: string };

const coveredBy = (scenario: LabScenarioId): CatalogCoverage => ({ kind: "scenario", scenario });

export const navigationCoverage = {
  tabs: {
    practice: coveredBy("practice-home"),
    review: coveredBy("review-due"),
    history: coveredBy("history-populated"),
    settings: coveredBy("settings-ios-sync"),
    analysis: coveredBy("settings-stockfish-diagnostics")
  } satisfies Record<MobileBackTab, CatalogCoverage>,
  transients: {
    "practice-exit-confirmation": coveredBy("practice-exit-confirmation"),
    "review-reminder-prompt": coveredBy("practice-reminder-prompt"),
    "history-filters": coveredBy("history-filters"),
    "review-filters": coveredBy("review-filters"),
    "settings-advanced-ratings": coveredBy("settings-advanced-ratings"),
    "custom-rating-editor": coveredBy("practice-custom-rating-editor"),
    "starting-practice": coveredBy("practice-preparing")
  } satisfies Record<MobileBackTransient, CatalogCoverage>,
  details: {
    "review-analysis": coveredBy("review-feedback-analysis"),
    "review-session": coveredBy("review-session"),
    "custom-practice": coveredBy("practice-custom-setup"),
    "sprint-result": coveredBy("practice-summary"),
    "stockfish-diagnostics": coveredBy("settings-stockfish-diagnostics")
  } satisfies Record<MobileBackDetail["kind"], CatalogCoverage>
};

export const newScenarios = Object.values(scenarioRegistry).filter(
  (scenario): scenario is LabScenarioDefinition & { isNew: true; changeNote: string } => scenario.isNew === true
);

export function storyTagsForScenario(id: LabScenarioId): string[] {
  return scenarioRegistry[id].isNew ? ["new"] : [];
}

function defineScenario(
  id: LabScenarioId,
  group: LabScenarioGroup,
  title: string,
  storyId: string,
  description: string,
  owner: MobileBackPrimaryTab | "system",
  includes: readonly string[],
  exits: readonly string[],
  marker: ScenarioMarker = {}
): LabScenarioDefinition {
  return {
    ...marker,
    id,
    group,
    title,
    storyId,
    description,
    scope: {
      owner,
      includes,
      exits,
      containment: "free-roam"
    }
  };
}
