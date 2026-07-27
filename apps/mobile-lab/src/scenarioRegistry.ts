import type {
  MobileBackDetail,
  MobileBackPrimaryTab,
  MobileBackTab,
  MobileBackTransient
} from "../../mobile/src/navigation/mobileBackContract.ts";
import newScenarioMarkerData from "./newScenarioMarkers.json" with { type: "json" };

export type LabScenarioId =
  | "practice-home"
  | "practice-tactical-profile-building"
  | "practice-tactical-profile-collecting"
  | "practice-tactical-profile-balanced"
  | "practice-tactical-profile-solve-rate"
  | "practice-tactical-profile-speed"
  | "practice-tactical-profile-ranked"
  | "practice-tactical-profile-task-families-home"
  | "practice-tactical-profile-task-families"
  | "practice-tactical-profile-limited-inventory"
  | "practice-tactical-profile-explanation"
  | "practice-tactical-profile-focused-run"
  | "practice-tactical-profile-suppressed"
  | "practice-first-sprint-guide"
  | "practice-home-edit"
  | "practice-custom-setup"
  | "practice-run-name-validation"
  | "practice-run-standard-editor"
  | "practice-custom-rating-editor"
  | "practice-run-remove-confirmation"
  | "practice-runs-empty"
  | "practice-timing-warning"
  | "practice-timing-timeout"
  | "practice-timeout-review-notice"
  | "practice-wrong-review-notice"
  | "practice-slow-unclear-notice"
  | "practice-preparing"
  | "practice-active"
  | "practice-active-session-guide"
  | "practice-arrow-duel-guide"
  | "practice-arrow-duel-guide-only"
  | "practice-unclear-follow-up"
  | "practice-arrow-duel-prompt"
  | "practice-blunder-move-preview"
  | "practice-paused"
  | "practice-exit-confirmation"
  | "practice-summary"
  | "practice-sprint-result-goal"
  | "practice-sprint-result-replay"
  | "practice-sprint-result-extra-attempt"
  | "practice-tactical-focus-guide"
  | "practice-tactical-focus-active"
  | "practice-tactical-focus-result"
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
  | "history-progress"
  | "history-progress-weakness"
  | "history-progress-speed-weakness"
  | "history-attempt-detail"
  | "history-replay-unavailable"
  | "settings-ios-sync"
  | "settings-ios-sync-error-details"
  | "settings-ios-sync-support-bundle"
  | "settings-ios-sync-support-bundle-partial"
  | "settings-sprint-guidance"
  | "settings-android-backup"
  | "settings-notifications-denied"
  | "settings-notifications-not-determined"
  | "settings-advanced-ratings"
  | "settings-feedback-entry"
  | "settings-feedback-entry-failure"
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
  "practice-home": defineScenario("practice-home", "Practice", "Home", "practice--home", "Practice home with bordered Run cards whose trailing Ratings use uncluttered numeric values, plus a Review workload count centered in the card's right half.", "practice", ["Bordered Run cards", "Numeric trailing Ratings", "Saved run selection", "Add Run entry", "Edit mode entry", "Progress summary", "Single Review status label", "Centered Review workload count"], ["Run editor", "Review", "History", "Settings"]),
  "practice-tactical-profile-building": defineScenario("practice-tactical-profile-building", "Practice", "Tactical profile · building", "practice--tactical-profile-building", "Practice Home while the local Tactical Profile derived cache is being prepared.", "practice", ["Existing Practice Home", "Training focus card", "Profile-building state", "No recommendation"], ["Tactical Profile", "Run start", "Review"]),
  "practice-tactical-profile-collecting": defineScenario("practice-tactical-profile-collecting", "Practice", "Tactical profile · collecting evidence", "practice--tactical-profile-collecting-evidence", "Practice Home with an insufficient-data state that asks for varied mixed Runs without implying a weakness.", "practice", ["Existing Practice Home", "Collecting-evidence state", "Mixed Run guidance", "No recommendation"], ["Tactical Profile", "Run start", "Review"]),
  "practice-tactical-profile-balanced": defineScenario("practice-tactical-profile-balanced", "Practice", "Tactical profile · no clear focus yet", "practice--tactical-profile-balanced", "Practice Home when the provisional estimate has not found a repeated pattern strong enough to emphasize.", "practice", ["Existing Practice Home", "Early-estimate balanced state", "No forced action"], ["Tactical Profile", "Run start", "Review"]),
  "practice-tactical-profile-solve-rate": defineScenario("practice-tactical-profile-solve-rate", "Practice", "Tactical profile · solve reliability", "practice--tactical-profile-solve-rate", "Tactical Profile with one solve-rate weakness explained without posterior percentages or label-based evidence.", "practice", ["Tactical Profile", "Solve reliability reason", "Different-puzzle evidence", "Different-session evidence", "Focused Run preview entry", "Decline action"], ["Practice Home", "Recommendation explanation", "Focused Run preview"], "contained"),
  "practice-tactical-profile-speed": defineScenario("practice-tactical-profile-speed", "Practice", "Tactical profile · completed-puzzle speed", "practice--tactical-profile-completed-speed", "Tactical Profile with one completed-puzzle speed weakness kept separate from solve reliability and Timeout.", "practice", ["Tactical Profile", "Completed-puzzle speed reason", "Different-puzzle evidence", "Different-session evidence", "Focused Run preview entry", "Decline action"], ["Practice Home", "Recommendation explanation", "Focused Run preview"], "contained"),
  "practice-tactical-profile-ranked": defineScenario("practice-tactical-profile-ranked", "Practice", "Tactical profile · ranked weaknesses", "practice--tactical-profile-ranked", "Practice Home summarizes the clearest focus before opening a Tactical Profile capped at three visible recommendations.", "practice", ["Existing Practice Home", "Clearest-focus summary", "Recommendation count", "Three-focus display cutoff", "Two-focus Run cutoff", "Background monitoring"], ["Recommendation explanation", "Focused Run preview"], "contained"),
  "practice-tactical-profile-task-families-home": defineScenario("practice-tactical-profile-task-families-home", "Practice", "Tactical profile · two-mode Home summary", "practice--tactical-profile-task-families-home", "Practice Home keeps one Training focus card while summarizing a separate Arrow Duel recommendation lane.", "practice", ["Existing Practice Home", "Single Training focus card", "Lead mode label", "Other-mode recommendation count", "Tactical Profile entry"], ["Production navigation", "Production Run start"], "contained"),
  "practice-tactical-profile-task-families": defineScenario("practice-tactical-profile-task-families", "Practice", "Tactical profile · Puzzle solving and Arrow Duel", "practice--tactical-profile-task-families", "One Tactical Profile keeps Puzzle solving and Arrow Duel recommendations, Ratings, and Focused Runs in separate mode lanes.", "practice", ["Existing Practice Home", "Single focus card", "Mode-specific recommendation summary", "Puzzle solving and Arrow Duel selector", "Independent mode rankings", "Independent Rating anchors", "Mode-specific Focused Run preview"], ["Production navigation", "Production Run start"], "contained"),
  "practice-tactical-profile-limited-inventory": defineScenario("practice-tactical-profile-limited-inventory", "Practice", "Tactical profile · limited nearby puzzles", "practice--tactical-profile-limited-inventory", "Tactical Profile keeps a credible insight while withholding the Focused Run when current-Rating inventory cannot fill its quota safely.", "practice", ["Tactical Profile", "Current-Rating inventory gate", "No repeated-puzzle fallback", "No over-wide Rating fallback", "No focused Run CTA"], ["Practice Home", "Mixed Runs"], "contained"),
  "practice-tactical-profile-explanation": defineScenario("practice-tactical-profile-explanation", "Practice", "Tactical profile · recommendation explanation", "practice--tactical-profile-explanation", "Plain-language recommendation explanation separating comparable performance, evidence diversity, practical impact, and UI metadata.", "practice", ["Recommendation reason", "Comparable-puzzle baseline", "Evidence diversity", "Excluded UI labels", "Focused Run preview entry", "Decline action"], ["Tactical Profile", "Focused Run preview", "Practice Home"], "contained"),
  "practice-tactical-profile-focused-run": defineScenario("practice-tactical-profile-focused-run", "Practice", "Tactical profile · focused Run preview", "practice--tactical-profile-focused-run", "Focused Run preview with explicit primary, secondary, and mixed-practice quotas plus Rating and refresh guardrails.", "practice", ["Focused Run preview", "Explicit quotas", "Mixed-practice allocation", "Current-Rating anchor", "Between-Run refresh", "Start CTA", "Decline action"], ["Tactical Profile", "Production Run start"], "contained"),
  "practice-tactical-profile-suppressed": defineScenario("practice-tactical-profile-suppressed", "Practice", "Tactical profile · focus hidden", "practice--tactical-profile-suppressed", "Calm result after declining emphasis, with continued mixed-Run evidence collection and a reversible restore action.", "practice", ["Suppressed recommendation", "Continued evidence collection", "Restore action", "Back to Practice"], ["Tactical Profile", "Practice Home"], "contained"),
  "practice-first-sprint-guide": defineScenario("practice-first-sprint-guide", "Practice", "First Sprint guide", "practice--first-sprint-guide", "First-use Practice Home with an automatically expanded rule card whose dynamic title states the selected Run pass target while the supporting rules keep one aligned badge and copy column with an even vertical rhythm.", "practice", ["First-use guidance", "Dynamic Solve 15 puzzles to pass title", "Aligned supporting-rule columns", "Even supporting-rule rhythm", "Time and mistake limits", "Slow warning means the user is taking too long", "Dismiss to persistent help entry"], ["Production onboarding state", "Persistence", "Active Sprint"], "contained"),
  "practice-home-edit": defineScenario("practice-home-edit", "Practice", "Edit and reorder runs", "practice--edit-and-reorder-runs", "Home edit mode with whole-card drag, real-time animated insertion, arrow-button fallbacks, Run edit actions, and removal actions.", "practice", ["Whole-card drag", "Real-time insertion animation", "Arrow-button fallback", "Run edit actions", "Format-specific icons", "Removal entry"], ["Run editor", "Removal confirmation", "Practice home"]),
  "practice-custom-setup": defineScenario(
    "practice-custom-setup",
    "Practice",
    "New Run",
    "practice--custom-setup",
    "New named run editor that defaults to All themes, exposes the grouped server-curated 24-theme catalog, matches the web timing range, and lets linked warning and timeout defaults be adjusted before saving to Home without starting.",
    "practice",
    ["Required unique name", "Custom configuration", "Web timing range", "Linked timing defaults", "Independent warning and timeout controls", "24 curated themes", "Deterministic All-to-multiple selection", "All exclusivity", "Direct 600-2200 starting rating", "Add to Home"],
    ["Practice home", "Native run persistence", "Scored practice session"]
  ),
  "practice-run-name-validation": defineScenario("practice-run-name-validation", "Practice", "Run name validation", "practice--run-name-validation", "New Run with inline required-name validation; entering an existing name exposes the unique-name error.", "practice", ["Required-name error", "Unique-name rule", "Accessible field feedback"], ["Practice home", "Saved run"]),
  "practice-run-standard-editor": defineScenario("practice-run-standard-editor", "Practice", "Built-in Run editor", "practice--built-in-run-editor", "Existing Standard Run editor with compact per-Run Slow warning and puzzle timeout settings below Name, Format, and rating.", "practice", ["Editable unique name", "Direct 600-2200 rating entry", "Fixed Run format", "Slow warning", "Puzzle timeout", "Independent on/off controls", "No rating impact"], ["Practice home edit mode", "Production persistence"]),
  "practice-custom-rating-editor": defineScenario("practice-custom-rating-editor", "Practice", "Custom Run editor and validation", "practice--custom-rating-editor", "Existing Custom Run editor adds the same compact timing controls while retaining its inline rating validation.", "practice", ["Editable unique name", "Direct rating entry", "600-2200 validation", "Slow warning", "Puzzle timeout", "Fixed creation settings"], ["Practice home edit mode", "Production persistence"]),
  "practice-run-remove-confirmation": defineScenario("practice-run-remove-confirmation", "Practice", "Remove run confirmation", "practice--remove-run-confirmation", "Inline warning directly below the selected Run before it is removed from Home, explicitly retaining its rating and history for later restoration.", "practice", ["Inline removal warning", "Selected Run context", "Retained rating and history", "Cancel", "Confirm removal"], ["Edit runs", "Restore run"]),
  "practice-runs-empty": defineScenario("practice-runs-empty", "Practice", "Empty Home and restore", "practice--empty-home-and-restore", "Home after every run is hidden, with clear Add Run and restore paths that preserve prior ratings.", "practice", ["Empty state", "Add Run", "Retained run list", "Restore to Home"], ["New Run", "Practice home"]),
  "practice-timing-warning": defineScenario("practice-timing-warning", "Practice", "Active session · Slow", "practice--slow-warning", "The existing active-session baseline runs a real puzzle clock with the compact elapsed time changing to amber after the Slow threshold.", "practice", ["Existing active session", "Live puzzle clock", "Compact amber elapsed time", "Portrait below-board placement", "Landscape right rail"], ["Production timer", "History persistence"], "contained"),
  "practice-timing-timeout": defineScenario("practice-timing-timeout", "Practice", "Active session · Timed out handoff", "practice--puzzle-timeout", "The existing active-session baseline starts eight seconds before timeout, shows a compact countdown, locks the board under brief Timed out feedback, then resets the live puzzle clock and explains that the mistake entered Review instead of Unclear.", "practice", ["Existing active session", "Live final countdown", "Locked board overlay", "Automatic next-puzzle reset", "Post-timeout mistake, Review, and no-Unclear notice", "Portrait below-board placement", "Landscape right rail"], ["Production sprint rule", "History persistence"], "contained"),
  "practice-timeout-review-notice": defineScenario(
    "practice-timeout-review-notice",
    "Practice",
    "Active session · after timeout",
    "practice--timeout-review-notice",
    "The next puzzle replaces the Unclear question with the concise production notice explaining that the previous puzzle timed out, counted as a mistake, and was added to Review.",
    "practice",
    ["Existing active session", "Next puzzle in progress", "Read-only In Review notice", "Timeout counted as a mistake", "No Unclear question", "Portrait below-board placement", "Landscape right rail"],
    ["Production sprint rule", "History persistence"],
    "contained"
  ),
  "practice-wrong-review-notice": defineScenario(
    "practice-wrong-review-notice",
    "Practice",
    "Active session · after wrong answer",
    "practice--wrong-review-notice",
    "The next puzzle shows the production read-only notice explaining that the previous answer was incorrect, counted as a mistake, and was added to Review.",
    "practice",
    ["Existing active session", "Next puzzle in progress", "Read-only In Review notice", "Wrong counted as a mistake", "No Unclear question", "Portrait below-board placement", "Landscape right rail"],
    ["Production sprint rule", "History persistence"],
    "contained"
  ),
  "practice-slow-unclear-notice": defineScenario(
    "practice-slow-unclear-notice",
    "Practice",
    "Active session · after Slow correct answer",
    "practice--slow-unclear-notice",
    "The next puzzle shows the production read-only notice explaining that the previous puzzle took too long and was automatically marked Unclear and added to Review.",
    "practice",
    ["Existing active session", "Next puzzle in progress", "Read-only Marked Unclear notice", "Slow correct auto-marked Unclear", "Added to Review", "No manual Unclear action", "Portrait below-board placement", "Landscape right rail"],
    ["Production sprint rule", "History persistence"],
    "contained"
  ),
  "practice-preparing": defineScenario("practice-preparing", "Practice", "Preparing", "practice--preparing", "Stable preparing overlay before an Arrow Duel sprint starts.", "practice", ["Preparing overlay", "Cancel through Back intent"], ["Active sprint", "Practice home"]),
  "practice-active": defineScenario("practice-active", "Practice", "Active session", "practice--active-session", "Existing active Standard sprint with a live compact puzzle elapsed-time indicator that does not add another layout bar.", "practice", ["Sprint timer", "Live compact puzzle elapsed time", "Progress", "Board state", "Portrait below-board placement", "Landscape right rail"], ["Sprint result"]),
  "practice-active-session-guide": defineScenario("practice-active-session-guide", "Practice", "Active session · first-use guide", "practice--active-session-guide", "Four semantic first-use explanations shown before the Sprint begins. The frozen demonstration preserves the real Sprint hierarchy while keeping its direct Exit guide control available, using a height-aware portrait board, raising the portrait Timed Out callout enough to show its full red pointer above that board, retaining the real full-width portrait Unclear prompt, and routing measured board-to-rail connectors around copy toward their landscape targets.", "practice", ["No real session chessboard during guidance", "Frozen real-Sprint composition", "Always-available direct guide exit without completion", "Height-aware portrait board", "Raised portrait Timed Out callout with full pointer and board clearance", "Full-width production Unclear prompt in portrait", "Fixed-shape downward portrait arrows outside callout borders with target clearance", "Measured landscape connectors routed around copy with target clearance", "Shared session header, prompt, timer, score, and Unclear components", "SPRINT HEADER, SLOW, TIMED OUT, and UNCLEAR guidance", "Amber explains that the user is taking too long", "Current target stays bright while the Exit guide control remains available", "Current-guide-only accessibility announcement", "Timed out is explained as a mistake and Review entry, not Unclear", "Start Sprint only after the final guide"], ["Production onboarding persistence", "Active Sprint"], "contained"),
  "practice-arrow-duel-guide": defineScenario("practice-arrow-duel-guide", "Practice", "Arrow Duel · after shared guide", "practice--arrow-duel-guide", "First-ever app entry through Arrow Duel presents the four responsive shared Active Session explanations, then a frozen real Arrow Duel composition explains that the two arrows are the user's two choices. The direct Exit guide control remains available without completing Arrow Duel guidance. The portrait callout follows the board without covering it; in landscape, it stays in the board's empty lower lane and uses one straight upward connector that stops clear of the candidate origin so it cannot read as a third move arrow.", "practice", ["Guides 1–4: responsive shared Active Session guidance", "Guide 5: frozen real Arrow Duel composition", "Always-available direct guide exit without completion", "Height-aware portrait board and shared session components", "Single-line guide progress", "ARROW DUEL semantic callout", "The arrows show your two choices", "Portrait callout below the board", "Landscape callout in the empty board lane", "Straight upward landscape connector stops clear of the candidate origin", "Real candidate-arrow overlay", "Back returns from guide 5 to guide 4", "No real session position during guidance", "Start Arrow Duel after the final guide"], ["Production onboarding persistence", "Arrow Duel Sprint"], "contained"),
  "practice-arrow-duel-guide-only": defineScenario("practice-arrow-duel-guide-only", "Practice", "Arrow Duel · single first-use guide", "practice--arrow-duel-guide-only", "A user who already knows the shared Active Session controls sees one responsive Arrow Duel-specific guide the first time they enter the mode. The direct Exit guide control leaves this guidance eligible for the next Arrow Duel. The height-aware frozen real session composition identifies the two arrows as the only choices before the timer starts, with the portrait callout below the board and one straight upward landscape connector that stops clear of the candidate origin instead of appearing to be a third move arrow.", "practice", ["One guide: 1 of 1", "Always-available direct guide exit without completion", "Height-aware frozen real Arrow Duel composition", "Shared session components", "Single-line guide progress", "ARROW DUEL semantic callout", "The arrows show your two choices", "Portrait callout below the board", "Landscape callout in the empty board lane", "Straight upward landscape connector stops clear of the candidate origin", "Real candidate-arrow overlay", "Only the two shown moves count", "No real session position during guidance", "Start Arrow Duel"], ["Production onboarding persistence", "Arrow Duel Sprint"], "contained"),
  "practice-unclear-follow-up": defineScenario(
    "practice-unclear-follow-up",
    "Practice",
    "Unclear follow-up",
    "practice--unclear-follow-up",
    "Active Arrow Duel sprint after one correct attempt, showing the shared real previous-attempt Unclear question while the next puzzle remains in progress.",
    "practice",
    ["Previous-attempt clarity question", "Mark as unclear action", "Stable board and score", "Portrait footer and landscape rail placement"],
    ["Next puzzle", "History"]
  ),
  "practice-arrow-duel-prompt": defineScenario("practice-arrow-duel-prompt", "Practice", "Arrow Duel prompt card", "practice--arrow-duel-prompt", "Active Arrow Duel session with the unchanged prompt copy in a rounded card above the board and a black board-piece King.", "practice", ["Black King prompt icon", "Arrow Duel copy", "Prompt card above board", "Candidate arrows"], ["Sprint result"]),
  "practice-blunder-move-preview": defineScenario("practice-blunder-move-preview", "Practice", "Blunder move preview", "practice--blunder-move-preview", "Standard puzzle entry that animates the opponent blunder before unlocking the white-to-move Board Placeholder.", "practice", ["Blunder replay", "White King prompt icon", "Rounded prompt card above board", "Input lock"], ["Active sprint"]),
  "practice-paused": defineScenario("practice-paused", "Practice", "Paused session", "practice--paused-session", "Paused sprint with resume and abandon actions.", "practice", ["Paused state", "Resume", "Abandon"], ["Active sprint", "Sprint result"]),
  "practice-exit-confirmation": defineScenario("practice-exit-confirmation", "Practice", "Exit confirmation", "practice--exit-confirmation", "Guarded abandon confirmation over an active sprint.", "practice", ["Confirmation", "Cancel", "Confirm abandon"], ["Active sprint", "Sprint result"]),
  "practice-summary": defineScenario("practice-summary", "Practice", "Sprint summary", "practice--sprint-summary", "Completed one-puzzle sprint summary reached through the public board callback.", "practice", ["Result", "Rating change", "History and review actions"], ["Practice home", "History", "Review"]),
  "practice-sprint-result-goal": defineScenario("practice-sprint-result-goal", "Practice", "Sprint result · Goal clarity", "practice--sprint-result-goal-clarity", "Failed Sprint Result that reports two Unclear and two In Review attempts as four Replay entries while keeping Replay separate from Review scheduling.", "practice", ["Solved 11", "Solve 15 to pass", "12 attempted", "Unclear count", "In Review count", "Neutral replay entry", "Replay and Review terminology"], ["Production result wiring", "History", "Review"], "contained"),
  "practice-sprint-result-replay": defineScenario("practice-sprint-result-replay", "Practice", "Sprint result · Flagged replay", "practice--sprint-result-flagged-replay", "A four-attempt Replay reached from Sprint Result: two Unclear attempts expose Mark clear and two In Review attempts expose Remove from Review, using the existing actions instead of new status badges.", "practice", ["Sprint Result entry", "Four-attempt Replay", "Mark clear", "Remove from Review", "No replay status badges", "Previous and next navigation"], ["Production replay selection", "New replay status badges", "Practice home"], "contained"),
  "practice-sprint-result-extra-attempt": defineScenario("practice-sprint-result-extra-attempt", "Practice", "Sprint result · Extra attempt", "practice--sprint-result-extra-attempt", "Passed Sprint Result that shows Solved 15 beside the fixed pass target while explicitly reporting the user's 16 actual attempts.", "practice", ["Solved 15", "Solve 15 to pass", "16 attempted", "Accuracy", "Aligned summary counts", "Existing result actions"], ["Production result wiring", "History", "Review"], "contained"),
  "practice-tactical-focus-guide": defineScenario("practice-tactical-focus-guide", "Practice", "Tactical Focus · first-use guide", "practice--tactical-focus-guide", "The shared active-session guide adapts its header, timeout, score, and start language to a fixed Unrated Focused Run before its clock starts.", "practice", ["Focused Run header guidance", "Fixed-puzzle progress", "Unrated status", "Timeout counts as a completed puzzle", "Start Focused Run"], ["Production onboarding persistence", "Active Focused Run"], "contained"),
  "practice-tactical-focus-active": defineScenario("practice-tactical-focus-active", "Practice", "Tactical Focus · active run", "practice--tactical-focus-active", "Active fixed Tactical Focus Run that replaces pass and mistake-limit language with completed, remaining, and Unrated status while preserving the familiar board session.", "practice", ["Focused Run header", "Fixed 15-puzzle progress", "Completed and remaining counts", "Unrated status", "Rating unchanged exit copy"], ["Focused Run result", "Review"], "contained"),
  "practice-tactical-focus-result": defineScenario("practice-tactical-focus-result", "Practice", "Tactical Focus · result", "practice--tactical-focus-result", "Completed fixed Tactical Focus Run that clearly stays unrated, reports the planned-puzzle ending, and returns to Practice instead of immediately replaying stale focus.", "practice", ["Focused Run complete", "Planned puzzles complete", "Unrated Rating", "Back to Practice"], ["Practice home", "Review"], "contained"),
  "practice-reminder-prompt": defineScenario("practice-reminder-prompt", "Practice", "Review reminder prompt", "practice--review-reminder-prompt", "First-mistake notification-permission prompt driven by a maintained fake client.", "practice", ["Permission rationale", "Enable", "Dismiss"], ["Active sprint"]),
  "review-empty": defineScenario("review-empty", "Review", "Empty queue", "review--empty-queue", "Review with no due or future items.", "review", ["Empty state", "Practice return"], ["Practice"]),
  "review-due": defineScenario("review-due", "Review", "Due queue", "review--due-queue", "Deterministic due workload with multiple contexts.", "review", ["Due metrics", "Forecast", "Queue rows", "Start review"], ["Review session", "Practice"]),
  "review-overdue": defineScenario("review-overdue", "Review", "Overdue queue", "review--overdue-queue", "Overdue workload and danger treatment.", "review", ["Overdue count", "Due rows", "Forecast"], ["Review session", "Practice"]),
  "review-filters": defineScenario("review-filters", "Review", "Filters", "review--filters", "Expanded filters with an active overdue selection.", "review", ["Mode, speed, theme, and overdue filters", "Active filter summary"], ["Review session", "Practice"]),
  "review-session": defineScenario("review-session", "Review", "Review session", "review--review-session", "Due Review session using the Board Placeholder and public queue state. Portrait keeps the established stack; landscape matches Sprint with a fixed full board on the left and a scrollable header, timer, instruction, and actions rail on the right.", "review", ["Stable board through resize", "Portrait stack", "Landscape board-left control rail", "Timer", "Context", "Previous and next"], ["Review queue"]),
  "review-blunder-move-preview": defineScenario("review-blunder-move-preview", "Review", "Review blunder move preview", "review--blunder-move-preview", "Due Review entry that replays the original blunder before the user retries the puzzle as White.", "review", ["Blunder replay", "White King prompt icon", "Rounded prompt card above board", "Input lock"], ["Review queue"]),
  "review-feedback-analysis": defineScenario("review-feedback-analysis", "Review", "Feedback and analysis", "review--feedback-and-analysis", "Wrong-move feedback followed by the browser-safe fallback analysis surface.", "review", ["Move feedback", "Analysis lines", "Reset and flip controls"], ["Review session"]),
  "history-empty": defineScenario("history-empty", "History", "Empty history", "history--empty-history", "History with no attempts or rating points.", "history", ["Empty state", "Primary filters"], ["Practice", "Review", "Settings"]),
  "history-populated": defineScenario("history-populated", "History", "Populated history", "history--populated-history", "Existing populated History defaults to original Sprint attempts that need attention, defined by Unclear or Review membership, while Slow and Timed out remain attempt labels.", "history", ["Current History layout", "Sprint source default", "Needs attention default", "Unclear or Review union", "Attempt status labels", "Applied filter summary", "Curated tags"], ["Attempt detail", "Review", "Production history query"]),
  "history-filters": defineScenario("history-filters", "History", "Filters and active filters", "history--filters-and-active-filters", "One framed advanced-filter region above the Needs attention or All selector, with Unclear and In review combined as an OR-based Attention group scoped to original Sprint attempts.", "history", ["Framed advanced filters", "Attention reason OR group", "Needs attention interaction", "Sprint source default", "Selected theme names above", "Compact theme count below", "Collapsed 24-theme catalog", "Reset"], ["Replay puzzle"]),
  "history-progress": defineScenario("history-progress", "History", "Tactical progress · improving strength", "history--tactical-progress", "History adds a dedicated Progress entry leading to a separate page that shows model-estimated reliability and completed-speed gaps changing over time.", "history", ["History Progress button", "Separate progress page", "Theme selector", "Progress over time", "Matched solve reliability", "Matched completed-puzzle speed", "No clear weakness state"], ["Production navigation", "Historical aggregation", "Storage", "Training recommendation"], "contained"),
  "history-progress-weakness": defineScenario("history-progress-weakness", "History", "Tactical progress · reliability weakness", "history--tactical-progress-clear-weakness", "The separate History Progress page highlights a solve-rate weakness only after the model's evidence, impact, and diversity checks pass.", "history", ["History Progress button", "Separate progress page", "Solve reliability effect", "Matched model baseline", "Evidence, impact, and diversity explanation", "Progress trend"], ["Production navigation", "Statistical computation", "Storage", "Training recommendation"], "contained"),
  "history-progress-speed-weakness": defineScenario("history-progress-speed-weakness", "History", "Tactical progress · completed-speed weakness", "history--tactical-progress-completed-speed-weakness", "A separate History Progress state shows a theme that is solved correctly but consistently more slowly than the matched completed-puzzle baseline.", "history", ["History Progress button", "Separate progress page", "Completed-puzzle speed effect", "Reliable elapsed-time eligibility", "Matched model baseline", "Evidence, impact, and diversity explanation"], ["Production navigation", "Statistical computation", "Storage", "Training recommendation"], "contained"),
  "history-attempt-detail": defineScenario("history-attempt-detail", "History", "Replay puzzle", "history--attempt-detail", "The real puzzle Replay reached by tapping a History row, using Replay terminology and the existing Mark clear or Remove from Review actions without adding status badges.", "history", ["Replay title", "Mark clear", "Curated theme rail", "Replay and Review terminology"], ["History", "New replay status badges"]),
  "history-replay-unavailable": defineScenario("history-replay-unavailable", "History", "Replay unavailable", "history--replay-unavailable", "Corrupt Arrow Duel attempt whose candidate order cannot be reconstructed safely.", "history", ["Persisted details", "Replay-unavailable explanation"], ["History"]),
  "settings-ios-sync": defineScenario(
    "settings-ios-sync",
    "Settings",
    "iOS sync",
    "settings--ios-sync",
    "The stable iOS Settings clone with iCloud Sync, Notifications, and the Issue #247 move-feedback design.",
    "settings",
    ["iCloud Sync", "Notifications", "Sound and haptic toggles", "Move and capture audio previews", "About"],
    ["Run editor", "Native audio and haptic validation", "Stockfish diagnostics"]
  ),
  "settings-ios-sync-error-details": defineScenario(
    "settings-ios-sync-error-details",
    "Settings",
    "iCloud sync error details",
    "settings--i-cloud-sync-error-details",
    "The iOS Settings sync failure branch with a local, privacy-bounded diagnostic that the user can inspect, select, and copy for support.",
    "settings",
    ["Failed iCloud Sync status", "View Error Details entry", "Local diagnostic modal", "Selectable technical details", "Copy success feedback", "Sensitive-data confirmation", "Complete support bundle", "iOS Share Sheet handoff"],
    ["Settings", "User-controlled support message", "Native database snapshot and Share Sheet"],
    "contained"
  ),
  "settings-ios-sync-support-bundle": defineScenario(
    "settings-ios-sync-support-bundle",
    "Settings",
    "iCloud support diagnostics",
    "settings--i-cloud-sync-support-bundle",
    "The always-available iOS Settings entry under Help & Feedback for preparing support diagnostics even when no sync failure was captured.",
    "settings",
    ["Help & Feedback placement", "Email Support final row", "Persistent Settings entry", "Sensitive-data confirmation", "Consistent local SQLite snapshot", "CloudKit JSON snapshot", "Diagnostic manifest", "iOS Share Sheet handoff"],
    ["User-controlled support handoff", "Native database snapshot and Share Sheet"],
    "contained"
  ),
  "settings-ios-sync-support-bundle-partial": defineScenario(
    "settings-ios-sync-support-bundle-partial",
    "Settings",
    "iCloud support bundle · partial",
    "settings--i-cloud-sync-support-bundle-partial",
    "The support-bundle recovery branch when the local SQLite snapshot is available but CloudKit cannot return its JSON progress snapshot.",
    "settings",
    ["Sensitive-data confirmation", "CloudKit snapshot unavailable", "Explicit partial-bundle warning", "Included-file inventory", "iOS Share Sheet handoff"],
    ["iCloud sync error details", "Native database snapshot and Share Sheet"],
    "contained"
  ),
  "settings-sprint-guidance": defineScenario("settings-sprint-guidance", "Settings", "Guidance · replay Sprint and Arrow Duel guides", "settings--sprint-guide-reset", "Settings guidance action that makes the rules, active-session, and Arrow Duel guides available again without changing Runs, ratings, or History.", "settings", ["Direct Settings entry", "Guidance focused in the phone viewport", "Explicit Reset guides button", "Reset the full guidance set", "No confirmation for a reversible action", "Inline completed state", "Progress safety copy"], ["Production onboarding persistence", "Practice"], "contained"),
  "settings-android-backup": defineScenario("settings-android-backup", "Settings", "Android backup", "settings--android-backup", "Android managed-backup variant with iCloud controls omitted and a local SQLite diagnostics export under Help & Feedback.", "settings", ["Android Progress Backup", "Local SQLite support bundle", "Diagnostic manifest", "Android share handoff", "Notifications", "About"], ["Native SQLite snapshot and Android share options"]),
  "settings-notifications-denied": defineScenario("settings-notifications-denied", "Settings", "Notifications denied", "settings--notifications-denied", "Denied notification permission with a public system-settings action.", "settings", ["Permission state", "Reminder preferences", "Open settings"], ["System settings"]),
  "settings-notifications-not-determined": defineScenario("settings-notifications-not-determined", "Settings", "Notifications not determined", "settings--notifications-not-determined", "Notification permission has not yet been requested.", "settings", ["Permission request", "Reminder preferences"], ["System permission prompt"]),
  "settings-advanced-ratings": defineScenario("settings-advanced-ratings", "Settings", "Rating controls moved to runs", "settings--advanced-rating-editor", "Stable former rating-editor URL now documents Settings without rating controls; the current rating lives in each run editor.", "settings", ["Settings without Profile rating", "Run-editor ownership"], ["Built-in run editor", "Custom run editor"]),
  "settings-feedback-entry": defineScenario("settings-feedback-entry", "Settings", "Help & Feedback", "settings--feedback-entry-design", "Approved support group in production-like Settings, with GitHub feedback, Email Support, a privacy promise, and an explicit confirmation before handing off to GitHub.", "settings", ["Approved Support card", "Email Support", "Privacy promise", "External-browser confirmation"], ["GitHub Issues in the external browser"]),
  "settings-feedback-entry-failure": defineScenario("settings-feedback-entry-failure", "Settings", "Feedback handoff failure", "settings--feedback-entry-failure", "Deterministic failed browser handoff that keeps the confirmation open with an actionable retry.", "settings", ["External-browser confirmation", "Failed handoff message", "Retry action"], ["GitHub Issues in the external browser", "Settings"]),
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
    "settings-advanced-ratings": notCataloged("Issue 253 moves name and current rating editing into each Run editor."),
    "custom-rating-editor": coveredBy("practice-custom-rating-editor"),
    "sprint-session-guide": coveredBy("practice-active-session-guide"),
    "starting-practice": coveredBy("practice-preparing")
  } satisfies Record<MobileBackTransient, CatalogCoverage>,
  details: {
    "review-analysis": coveredBy("review-feedback-analysis"),
    "review-session": coveredBy("review-session"),
    "history-progress": coveredBy("history-progress"),
    "tactical-profile": coveredBy("practice-tactical-profile-ranked"),
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
