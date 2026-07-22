import type {
  MobileBackDetail,
  MobileBackPrimaryTab,
  MobileBackTab,
  MobileBackTransient
} from "../../mobile/src/navigation/mobileBackContract.ts";
import newScenarioMarkerData from "./newScenarioMarkers.json" with { type: "json" };

export type LabScenarioId =
  | "practice-home"
  | "practice-home-edit"
  | "practice-custom-setup"
  | "practice-run-name-validation"
  | "practice-run-standard-editor"
  | "practice-custom-rating-editor"
  | "practice-run-remove-confirmation"
  | "practice-runs-empty"
  | "practice-preparing"
  | "practice-active"
  | "practice-paused"
  | "practice-exit-confirmation"
  | "practice-summary"
  | "practice-reminder-prompt"
  | "review-empty"
  | "review-due"
  | "review-overdue"
  | "review-filters"
  | "review-session"
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

type LabScenarioMetadata = {
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

export type NewScenarioIssue = {
  issueNumber: number;
  changeNote: string;
};

export type NewScenarioMarker = {
  issues: readonly NewScenarioIssue[];
};

type ScenarioMarker =
  | ({ isNew: true } & NewScenarioMarker)
  | { isNew?: false; issues?: never };

export type LabScenarioDefinition = ScenarioMarker & LabScenarioMetadata;

export const newScenarioMarkers = newScenarioMarkerData as Partial<
  Record<LabScenarioId, NewScenarioMarker>
>;

const scenarioDefinitions: Record<LabScenarioId, LabScenarioMetadata> = {
  "practice-home": defineScenario("practice-home", "Practice", "Home", "practice--home", "Practice home with vertically centered bordered Run cards, named reusable runs, deterministic ELO, and no persisted mutations.", "practice", ["Centered bordered Run cards", "Saved run selection", "Add Run entry", "Edit mode entry", "Progress summary", "Review workload strip"], ["Run editor", "Review", "History", "Settings"]),
  "practice-home-edit": defineScenario("practice-home-edit", "Practice", "Edit and reorder runs", "practice--edit-and-reorder-runs", "Home edit mode with whole-card drag, real-time animated insertion, arrow-button fallbacks, ELO-only edit actions, and removal actions.", "practice", ["Whole-card drag", "Real-time insertion animation", "Arrow-button fallback", "ELO-only edit actions", "Format-specific icons", "Removal entry"], ["ELO editor", "Removal confirmation", "Practice home"]),
  "practice-custom-setup": defineScenario(
    "practice-custom-setup",
    "Practice",
    "New Run",
    "practice--custom-setup",
    "New named run editor that defaults to All themes, exposes the grouped server-curated 24-theme catalog, and saves to Home without starting.",
    "practice",
    ["Required unique name", "Custom configuration", "24 curated themes", "Deterministic All-to-multiple selection", "All exclusivity", "Starting ELO", "Add to Home"],
    ["Practice home", "Native run persistence", "Scored practice session"]
  ),
  "practice-run-name-validation": defineScenario("practice-run-name-validation", "Practice", "Run name validation", "practice--run-name-validation", "New Run with inline required-name validation; entering an existing name exposes the unique-name error.", "practice", ["Required-name error", "Unique-name rule", "Accessible field feedback"], ["Practice home", "Saved run"]),
  "practice-run-standard-editor": defineScenario("practice-run-standard-editor", "Practice", "Built-in ELO editor", "practice--built-in-run-editor", "Existing Standard run editor names its Run, exposes only the same 25-point Current ELO rule, and returns to Home edit mode after Save or Cancel.", "practice", ["Visible Run name", "Fixed run settings", "Current ELO adjustment", "Return to Home edit mode"], ["Practice home edit mode"]),
  "practice-custom-rating-editor": defineScenario("practice-custom-rating-editor", "Practice", "Custom Run ELO editor", "practice--custom-rating-editor", "Existing Custom Run editor names its Run and exposes only Current ELO; Save or Cancel returns to Home edit mode while creation settings stay fixed.", "practice", ["Visible Run name", "Fixed run settings", "Current ELO adjustment", "Return to Home edit mode"], ["Practice home edit mode"]),
  "practice-run-remove-confirmation": defineScenario("practice-run-remove-confirmation", "Practice", "Remove run confirmation", "practice--remove-run-confirmation", "Inline warning directly below the selected Run before it is removed from Home, explicitly retaining its ELO and history for later restoration.", "practice", ["Inline removal warning", "Selected Run context", "Retained ELO and history", "Cancel", "Confirm removal"], ["Edit runs", "Restore run"]),
  "practice-runs-empty": defineScenario("practice-runs-empty", "Practice", "Empty Home and restore", "practice--empty-home-and-restore", "Home after every run is hidden, with clear Add Run and restore paths that preserve prior ELO.", "practice", ["Empty state", "Add Run", "Retained run list", "Restore to Home"], ["New Run", "Practice home"]),
  "practice-preparing": defineScenario("practice-preparing", "Practice", "Preparing", "practice--preparing", "Stable preparing overlay before an Arrow Duel sprint starts.", "practice", ["Preparing overlay", "Cancel through Back intent"], ["Active sprint", "Practice home"]),
  "practice-active": defineScenario("practice-active", "Practice", "Active session", "practice--active-session", "Active Standard sprint with the development-only Board Placeholder.", "practice", ["Timer", "Progress", "Board state", "Pause", "Accessible moves"], ["Sprint result"]),
  "practice-paused": defineScenario("practice-paused", "Practice", "Paused session", "practice--paused-session", "Paused sprint with resume and abandon actions.", "practice", ["Paused state", "Resume", "Abandon"], ["Active sprint", "Sprint result"]),
  "practice-exit-confirmation": defineScenario("practice-exit-confirmation", "Practice", "Exit confirmation", "practice--exit-confirmation", "Guarded abandon confirmation over an active sprint.", "practice", ["Confirmation", "Cancel", "Confirm abandon"], ["Active sprint", "Sprint result"]),
  "practice-summary": defineScenario("practice-summary", "Practice", "Sprint summary", "practice--sprint-summary", "Completed one-puzzle sprint summary reached through the public board callback.", "practice", ["Result", "Rating change", "History and review actions"], ["Practice home", "History", "Review"]),
  "practice-reminder-prompt": defineScenario("practice-reminder-prompt", "Practice", "Review reminder prompt", "practice--review-reminder-prompt", "First-mistake notification-permission prompt driven by a maintained fake client.", "practice", ["Permission rationale", "Enable", "Dismiss"], ["Active sprint"]),
  "review-empty": defineScenario("review-empty", "Review", "Empty queue", "review--empty-queue", "Review with no due or future items.", "review", ["Empty state", "Practice return"], ["Practice"]),
  "review-due": defineScenario("review-due", "Review", "Due queue", "review--due-queue", "Deterministic due workload with multiple contexts.", "review", ["Due metrics", "Forecast", "Queue rows", "Start review"], ["Review session", "Practice"]),
  "review-overdue": defineScenario("review-overdue", "Review", "Overdue queue", "review--overdue-queue", "Overdue workload and danger treatment.", "review", ["Overdue count", "Due rows", "Forecast"], ["Review session", "Practice"]),
  "review-filters": defineScenario("review-filters", "Review", "Filters", "review--filters", "Expanded filters with an active overdue selection.", "review", ["Mode, speed, theme, and overdue filters", "Active filter summary"], ["Review session", "Practice"]),
  "review-session": defineScenario("review-session", "Review", "Review session", "review--review-session", "Due Review session using the Board Placeholder and public queue state.", "review", ["Board", "Timer", "Context", "Previous and next"], ["Review queue"]),
  "review-feedback-analysis": defineScenario("review-feedback-analysis", "Review", "Feedback and analysis", "review--feedback-and-analysis", "Wrong-move feedback followed by the browser-safe fallback analysis surface.", "review", ["Move feedback", "Analysis lines", "Reset and flip controls"], ["Review session"]),
  "history-empty": defineScenario("history-empty", "History", "Empty history", "history--empty-history", "History with no attempts or rating points.", "history", ["Empty state", "Primary filters"], ["Practice", "Review", "Settings"]),
  "history-populated": defineScenario("history-populated", "History", "Populated history", "history--populated-history", "Deterministic attempts showing every curated theme, including a seven-theme density case.", "history", ["All curated attempt tags", "Rating chart", "Quick filters"], ["Attempt detail", "Review"]),
  "history-filters": defineScenario("history-filters", "History", "Filters and active filters", "history--filters-and-active-filters", "Expanded History filters with the complete curated theme catalog in categorized horizontal rails.", "history", ["Advanced filters", "24-theme catalog", "Active filter summary", "Reset"], ["Replay puzzle"]),
  "history-attempt-detail": defineScenario("history-attempt-detail", "History", "Replay puzzle", "history--attempt-detail", "The real puzzle replay reached by tapping a History row, with every curated puzzle theme centered in a horizontally scrollable tag rail below the board.", "history", ["Puzzle replay", "Curated theme rail", "Review enrollment"], ["History"]),
  "history-replay-unavailable": defineScenario("history-replay-unavailable", "History", "Replay unavailable", "history--replay-unavailable", "Legacy Arrow Duel attempt whose candidate order cannot be reconstructed safely.", "history", ["Persisted details", "Replay-unavailable explanation"], ["History"]),
  "settings-ios-sync": defineScenario("settings-ios-sync", "Settings", "iOS sync", "settings--ios-sync", "iOS capabilities with iCloud Sync controls, run ELO editing omitted, and no real account access.", "settings", ["iCloud Sync", "Notifications", "About"], ["Run editor", "Stockfish diagnostics"]),
  "settings-android-backup": defineScenario("settings-android-backup", "Settings", "Android backup", "settings--android-backup", "Android managed-backup variant with iCloud controls omitted.", "settings", ["Android Progress Backup", "Notifications", "About"], ["Stockfish diagnostics"]),
  "settings-notifications-denied": defineScenario("settings-notifications-denied", "Settings", "Notifications denied", "settings--notifications-denied", "Denied notification permission with a public system-settings action.", "settings", ["Permission state", "Reminder preferences", "Open settings"], ["System settings"]),
  "settings-notifications-not-determined": defineScenario("settings-notifications-not-determined", "Settings", "Notifications not determined", "settings--notifications-not-determined", "Notification permission has not yet been requested.", "settings", ["Permission request", "Reminder preferences"], ["System permission prompt"]),
  "settings-advanced-ratings": defineScenario("settings-advanced-ratings", "Settings", "ELO controls moved to runs", "settings--advanced-rating-editor", "Stable former ELO-editor URL now documents Settings without rating controls; current ELO lives in each run editor.", "settings", ["Settings without Profile ELO", "Run-editor ownership"], ["Built-in run editor", "Custom run editor"]),
  "settings-stockfish-diagnostics": defineScenario("settings-stockfish-diagnostics", "Settings", "Stockfish diagnostics", "settings--stockfish-diagnostics", "Development diagnostics with the engine boundary unavailable in the browser.", "settings", ["Diagnostic positions", "Unavailable engine state"], ["Settings"]),
  "system-loading": defineScenario("system-loading", "System", "Loading", "system--loading", "Reusable full-screen loading treatment shown through the real sprint start transition.", "system", ["Progress indicator", "Loading copy"], ["Practice"]),
  "system-error": defineScenario("system-error", "System", "Error", "system--error", "Real start failure rendered with an empty in-memory puzzle service.", "system", ["Error message", "Recovery context"], ["Practice"]),
  "system-full-app": defineScenario("system-full-app", "System", "Full App (free roam)", "system--full-app-free-roam", "Unconstrained whole-screen scenario for exploratory flow walking.", "system", ["All current tabs and non-native interactions"], ["External links", "Native-only services"])
};

export const scenarioRegistry = Object.fromEntries(
  Object.entries(scenarioDefinitions).map(([id, scenario]) => {
    const marker = newScenarioMarkers[id as LabScenarioId];
    return [id, marker ? { ...scenario, ...marker, isNew: true as const } : scenario];
  })
) as Record<LabScenarioId, LabScenarioDefinition>;

type CatalogCoverage =
  | { kind: "scenario"; scenario: LabScenarioId }
  | { kind: "not-cataloged"; reason: string };

const coveredBy = (scenario: LabScenarioId): CatalogCoverage => ({ kind: "scenario", scenario });
const notCataloged = (reason: string): CatalogCoverage => ({ kind: "not-cataloged", reason });

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
    "settings-advanced-ratings": notCataloged("Issue 253 moves Current ELO editing into each run's ELO-only editor."),
    "custom-rating-editor": coveredBy("practice-custom-rating-editor"),
    "starting-practice": coveredBy("practice-preparing")
  } satisfies Record<MobileBackTransient, CatalogCoverage>,
  details: {
    "review-analysis": coveredBy("review-feedback-analysis"),
    "review-session": coveredBy("review-session"),
    "practice-run-editor": coveredBy("practice-run-name-validation"),
    "custom-practice": coveredBy("practice-custom-setup"),
    "sprint-result": coveredBy("practice-summary"),
    "stockfish-diagnostics": coveredBy("settings-stockfish-diagnostics")
  } satisfies Record<MobileBackDetail["kind"], CatalogCoverage>
};

export type NewScenarioDefinition = LabScenarioDefinition & {
  isNew: true;
  issues: readonly NewScenarioIssue[];
};

export const newScenarios = Object.values(scenarioRegistry).filter(
  (scenario): scenario is NewScenarioDefinition => scenario.isNew === true
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
  containment: "contained" | "free-roam" = "free-roam"
): LabScenarioMetadata {
  return {
    id,
    group,
    title,
    storyId,
    description,
    scope: {
      owner,
      includes,
      exits,
      containment
    }
  };
}
