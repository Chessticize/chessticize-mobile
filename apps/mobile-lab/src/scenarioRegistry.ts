import type {
  MobileBackDetail,
  MobileBackPrimaryTab,
  MobileBackTab,
  MobileBackTransient
} from "../../mobile/src/navigation/mobileBackContract.ts";
import newScenarioMarkerData from "./newScenarioMarkers.json" with { type: "json" };

export type LabScenarioId =
  | "practice-home"
  | "practice-personal-best-hub"
  | "practice-personal-best-source-run"
  | "practice-personal-best-unavailable-source"
  | "practice-personal-best-starting-level"
  | "practice-personal-best-arrow-duel"
  | "practice-personal-best-empty-home-source"
  | "practice-personal-best-guide"
  | "practice-personal-best-highest-level"
  | "practice-personal-best-leave"
  | "practice-personal-best-active"
  | "practice-personal-best-result"
  | "practice-personal-best-pool-cleared"
  | "practice-personal-best-records"
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
  | "practice-run-arrow-duel-editor"
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
  | "practice-sprint-result-incomplete"
  | "practice-sprint-result-replay"
  | "practice-sprint-result-extra-attempt"
  | "practice-app-store-review-request"
  | "practice-tactical-focus-guide"
  | "practice-tactical-focus-active"
  | "practice-tactical-focus-result"
  | "practice-reminder-prompt"
  | "review-empty"
  | "review-due"
  | "review-overdue"
  | "review-filters"
  | "review-session"
  | "review-arrow-duel-reply"
  | "review-blunder-move-preview"
  | "review-feedback-analysis"
  | "history-empty"
  | "history-populated"
  | "history-filters"
  | "history-progress"
  | "history-progress-weakness"
  | "history-progress-speed-weakness"
  | "history-attempt-detail"
  | "history-arrow-duel-replay"
  | "history-replay-unavailable"
  | "settings-ios-sync"
  | "settings-ios-sync-syncing"
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
  nativeBoundary?: {
    title: string;
    detail: string;
  };
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
  "practice-home": defineScenario("practice-home", "Practice", "Home", "practice--home", "Practice Home keeps numeric Run Ratings, Training Focus, and Tactical Profile while delegating Review workload to the dedicated Review tab. Survival stays a compact, calm whole-card entry; the first entry explains the rules, and later entries open the Hub directly. Progress and resume details remain inside that destination.", "practice", ["Existing saved Runs", "Numeric trailing Ratings", "No duplicate Review card", "Training Focus card", "Collecting-evidence state", "Tactical Profile entry", "Compact evergreen Survival entry", "At-your-own-pace invitation", "First-entry rules", "Got it opens the Hub", "Later entries skip rules", "Back does not acknowledge rules", "Single chevron", "No paused status", "No score or record", "No mistake, time, or sitting details", "No nested Survival actions", "No direct resume", "No decorative Survival badge"], ["Survival rules", "Survival Hub", "Run editor", "Review tab", "History", "Settings", "Tactical Profile"], "contained"),
  "practice-personal-best-hub": defineScenario("practice-personal-best-hub", "Practice", "Survival · Challenge Hub", "practice--personal-best-hub", "The full-page Survival Hub starts at the top, uses Back to return to Practice, lists every resumable Run, links to the dedicated Survival records page, and lets the user choose Puzzle or Arrow Duel plus any supported Core Pack level. In-progress Runs and More levels share one short animated disclosure contract. An existing type-and-level combination continues instead of offering a reset that discards mistakes; starting a new combination begins the Run directly after the user's explicit action.", "practice", ["Full-page destination", "Back to Practice", "Top-of-page entry", "All paused Survival Runs", "Last-touched ordering", "Animated in-progress disclosure", "Animated More levels disclosure", "Height fade and offset motion", "Animated chevrons", "Accessible collapsed content", "Dedicated records entry", "Continue only", "Explicit Start begins directly", "No End or reset action", "Puzzle and Arrow Duel selector", "Recommended Rating source", "Short Recommended label", "Every supported More level", "600–699 through 2100–2200", "No numeric Rating input", "No time limit", "Three mistakes", "Compact core rules"], ["Survival rules", "Active Survival Run", "Practice Home", "Survival records"], "contained"),
  "practice-personal-best-source-run": defineScenario("practice-personal-best-source-run", "Practice", "Survival · Rating source", "practice--personal-best-rating-source", "The Rating-source picker defaults Puzzle to Standard and Arrow Duel to its built-in Run, exposes only compatible mixed Runs, and explains that the source changes only the suggested Survival level.", "practice", ["Compatible mixed Runs only", "Selected source", "Rating snapshot", "Source timing shown as provenance", "Suggested-level-only helper", "Focused and themed exclusion", "Remembered per Survival type", "Paused level stays locked"], ["Survival Hub", "Run editor"], "contained"),
  "practice-personal-best-unavailable-source": defineScenario("practice-personal-best-unavailable-source", "Practice", "Survival · unavailable Rating source", "practice--survival-unavailable-rating-source", "A saved Rating-source choice that no longer exists remains visible as unavailable. Survival asks for an explicit replacement instead of silently switching to another Run.", "practice", ["Unavailable saved source", "No silent fallback", "Explicit replacement", "Start blocked until replacement", "Compatible replacement choices"], ["Rating-source picker", "Survival Hub"], "contained"),
  "practice-personal-best-starting-level": defineScenario("practice-personal-best-starting-level", "Practice", "Survival · Standard has no games", "practice--personal-best-starting-level", "When built-in Standard has no completed games, Puzzle Survival uses Standard's default Rating 600 and calls 600–699 a Starting level. It does not silently fall back to another custom Run.", "practice", ["Standard default Rating 600", "Starting level language", "600–699", "No silent custom fallback", "Explicit Use another Run", "Survival remains untimed"], ["Rating-source picker", "Survival Hub"], "contained"),
  "practice-personal-best-arrow-duel": defineScenario("practice-personal-best-arrow-duel", "Practice", "Survival · Arrow Duel setup", "practice--personal-best-arrow-duel", "Arrow Duel is a separate Survival type with its own recommended Rating and level records. Survival follows the single global opponent-reply setting: On requires an untimed reply after a correct candidate; Off completes on the candidate, with no separate Survival override.", "practice", ["Arrow Duel Survival", "Arrow Duel Rating source", "Independent level records", "Global opponent-reply preference", "Candidate-only global-off state", "Required untimed reply global-on state", "Wrong candidate ends immediately", "No Survival-specific override", "One mistake maximum per puzzle", "No time limit", "Reply-phase persistence"], ["Arrow Duel active Run", "Survival Hub", "Survival records", "Settings"], "contained"),
  "practice-personal-best-empty-home-source": defineScenario("practice-personal-best-empty-home-source", "Practice", "Survival · Empty Home source", "practice--survival-empty-home-source", "The built-in Standard Rating profile remains the default Survival source even when every saved Run is hidden from Home. With no active alternative, the redundant Use another Run action is omitted.", "practice", ["Empty Home", "Retained Standard Rating profile", "Hidden from Home explanation", "No redundant source picker", "Survival remains available"], ["Empty Home", "Restore Runs", "Survival Hub"], "contained"),
  "practice-personal-best-guide": defineScenario("practice-personal-best-guide", "Practice", "Survival · rules", "practice--personal-best-guide", "Informational Survival rules teach one fixed level, three-mistake completion, active-time-only count-up, persistent pause, immediate best updates, separate per-level records, and unchanged Rating without starting a Run.", "practice", ["One level for the whole Run", "Three mistakes", "Wrong puzzles enter Review", "Unclear is independent", "No time limit", "Active-time context only", "Persistent pause and resume", "Best updates while playing", "Per-level record", "Rating unchanged", "Got it", "No implicit start"], ["Survival Hub", "Practice Home"], "contained"),
  "practice-personal-best-highest-level": defineScenario("practice-personal-best-highest-level", "Practice", "Survival · Highest available level", "practice--survival-highest-level", "A Rating above the installed Core Pack range clamps to the capped 2100–2200 Survival level, expands every supported More level, and does not imply that 2300+ can be unlocked.", "practice", ["Rating 2348 source", "Highest available level", "2100–2200 capped bucket", "All 16 supported levels", "No disabled 2300+ levels", "Installed Core Pack explanation"], ["Core Pack inventory", "Survival Hub", "Future optional packs"], "contained"),
  "practice-personal-best-leave": defineScenario("practice-personal-best-leave", "Practice", "Survival · paused", "practice--survival-leave-options", "The paused surface hides the puzzle like an ordinary Sprint pause, confirms that a newly reached best is already saved, and offers only Resume or Leave paused. Survival cannot be ended or reset manually.", "practice", ["Hidden puzzle and board", "New best 19 already saved", "Previous best 18", "Leave paused", "Exact-puzzle persistence", "Resume", "No End Run action"], ["Paused Home", "Active Survival Run", "Survival records"], "contained"),
  "practice-personal-best-active": defineScenario("practice-personal-best-active", "Practice", "Survival · active Run", "practice--personal-best-active", "The existing board runs without a deadline or hard per-puzzle timeout. Per-puzzle active time counts up for context, and each newly reached high becomes the saved best immediately while the Run continues.", "practice", ["Existing board session", "Survival title", "No time limit", "No repeated Unrated badge", "Solved count", "Three mistake marks", "Live per-level best", "Per-puzzle active time", "Pause hides puzzle", "No manual End Run", "No Slow scoring state"], ["Paused Home", "Survival result", "Review"], "contained"),
  "practice-personal-best-result": defineScenario("practice-personal-best-result", "Practice", "Survival · new record", "practice--personal-best-result", "A normal third-mistake ending celebrates the final best at one named level. Score stays primary; active time and sittings are context only; Play again repeats the same setup while Change challenge returns to the Hub.", "practice", ["New best at named level", "Solved score", "Previous best", "Best already saved while playing", "Normal three-mistake ending", "Independent level record", "Accuracy", "Active time", "Sittings", "Review mistakes", "Play again", "Change challenge"], ["Replay", "Survival Hub", "Practice Home", "Survival records"], "contained"),
  "practice-personal-best-pool-cleared": defineScenario("practice-personal-best-pool-cleared", "Practice", "Survival · perfect clear", "practice--survival-perfect-clear", "Exhausting every eligible non-repeating puzzle in the selected level completes Survival normally as a Perfect clear. Selection, database, and decode failures never use this result.", "practice", ["Perfect clear", "Pool-cleared completion", "Large solved score", "No third-mistake copy", "Failure distinction", "Same-level best"], ["Survival Hub", "Practice Home", "Survival records"], "contained"),
  "practice-personal-best-records": defineScenario("practice-personal-best-records", "Practice", "Survival · records", "practice--personal-best-records", "Survival records live on a dedicated page reached from the Challenge Hub, keeping ordinary History focused on puzzle attempts. Compact two-column cards show each available record's level and saved best, grouped by type, without duplicating the Hub's in-progress Run management or inventing cross-level ranking.", "practice", ["Dedicated Survival page", "Challenge Hub back navigation", "No general History takeover", "Compact two-column record cards", "No recommended-level styling", "No Run-status sections or labels", "Live bests included without status labels", "Puzzle records by level", "Arrow Duel records by level", "No completed-Run count", "No cross-level ranking", "No global score", "No repeated Unrated badge"], ["Survival Hub", "Survival result", "Practice Home"], "contained"),
  "practice-tactical-profile-building": defineScenario("practice-tactical-profile-building", "Practice", "Tactical profile · building", "practice--tactical-profile-building", "Practice Home while the local Tactical Profile derived cache is being prepared.", "practice", ["Existing Practice Home", "Training focus card", "Profile-building state", "No recommendation"], ["Tactical Profile", "Run start", "Review"]),
  "practice-tactical-profile-collecting": defineScenario("practice-tactical-profile-collecting", "Practice", "Tactical profile · collecting evidence", "practice--tactical-profile-collecting-evidence", "Practice Home with an insufficient-data state that asks for varied mixed Runs without implying a weakness.", "practice", ["Existing Practice Home", "Collecting-evidence state", "Mixed Run guidance", "No recommendation"], ["Tactical Profile", "Run start", "Review"]),
  "practice-tactical-profile-balanced": defineScenario("practice-tactical-profile-balanced", "Practice", "Tactical profile · balanced", "practice--tactical-profile-balanced", "Practice Home when the provisional estimate finds recent play balanced without a repeated, meaningful weakness.", "practice", ["Existing Practice Home", "Early-estimate balanced state", "No forced action"], ["Tactical Profile", "Run start", "Review"]),
  "practice-tactical-profile-solve-rate": defineScenario("practice-tactical-profile-solve-rate", "Practice", "Tactical profile · solve reliability", "practice--tactical-profile-solve-rate", "Tactical Profile with one solve-rate weakness explained without posterior percentages or label-based evidence.", "practice", ["Tactical Profile", "Solve reliability reason", "Different-puzzle evidence", "Different-session evidence", "Focused Run preview entry", "Decline action"], ["Practice Home", "Recommendation explanation", "Focused Run preview"], "contained"),
  "practice-tactical-profile-speed": defineScenario("practice-tactical-profile-speed", "Practice", "Tactical profile · completed-puzzle speed", "practice--tactical-profile-completed-speed", "Tactical Profile with one completed-puzzle speed weakness kept separate from solve reliability and Timeout.", "practice", ["Tactical Profile", "Completed-puzzle speed reason", "Different-puzzle evidence", "Different-session evidence", "Focused Run preview entry", "Decline action"], ["Practice Home", "Recommendation explanation", "Focused Run preview"], "contained"),
  "practice-tactical-profile-ranked": defineScenario("practice-tactical-profile-ranked", "Practice", "Tactical profile · ranked weaknesses", "practice--tactical-profile-ranked", "Practice Home summarizes the clearest focus before opening a Tactical Profile capped at three visible recommendations.", "practice", ["Existing Practice Home", "Clearest-focus summary", "Recommendation count", "Three-focus display cutoff", "Two-focus Run cutoff", "Background monitoring"], ["Recommendation explanation", "Focused Run preview"], "contained"),
  "practice-tactical-profile-task-families-home": defineScenario("practice-tactical-profile-task-families-home", "Practice", "Tactical profile · two-mode Home summary", "practice--tactical-profile-task-families-home", "Practice Home keeps one Training focus card while summarizing a separate Arrow Duel recommendation lane.", "practice", ["Existing Practice Home", "Single Training focus card", "Lead mode label", "Other-mode recommendation count", "Tactical Profile entry"], ["Production navigation", "Production Run start"], "contained"),
  "practice-tactical-profile-task-families": defineScenario("practice-tactical-profile-task-families", "Practice", "Tactical profile · Puzzle solving and Arrow Duel", "practice--tactical-profile-task-families", "One Tactical Profile keeps Puzzle solving and Arrow Duel recommendations, Ratings, and Focused Runs in separate mode lanes.", "practice", ["Existing Practice Home", "Single focus card", "Mode-specific recommendation summary", "Puzzle solving and Arrow Duel selector", "Independent mode rankings", "Independent Rating anchors", "Mode-specific Focused Run preview"], ["Production navigation", "Production Run start"], "contained"),
  "practice-tactical-profile-limited-inventory": defineScenario("practice-tactical-profile-limited-inventory", "Practice", "Tactical profile · limited nearby puzzles", "practice--tactical-profile-limited-inventory", "Tactical Profile keeps a credible insight while withholding the Focused Run when current-Rating inventory cannot fill its quota safely.", "practice", ["Tactical Profile", "Current-Rating inventory gate", "No repeated-puzzle fallback", "No over-wide Rating fallback", "No focused Run CTA"], ["Practice Home", "Mixed Runs"], "contained"),
  "practice-tactical-profile-explanation": defineScenario("practice-tactical-profile-explanation", "Practice", "Tactical profile · recommendation explanation", "practice--tactical-profile-explanation", "Plain-language recommendation explanation separating comparable performance, evidence diversity, practical impact, and UI metadata.", "practice", ["Recommendation reason", "Comparable-puzzle baseline", "Evidence diversity", "Excluded UI labels", "Focused Run preview entry", "Decline action"], ["Tactical Profile", "Focused Run preview", "Practice Home"], "contained"),
  "practice-tactical-profile-focused-run": defineScenario("practice-tactical-profile-focused-run", "Practice", "Tactical profile · focused Run preview", "practice--tactical-profile-focused-run", "Focused Run preview with explicit primary, secondary, and mixed-practice quotas plus Rating and refresh guardrails.", "practice", ["Focused Run preview", "Explicit quotas", "Mixed-practice allocation", "Current-Rating anchor", "Between-Run refresh", "Start CTA", "Decline action"], ["Tactical Profile", "Production Run start"], "contained"),
  "practice-tactical-profile-suppressed": defineScenario("practice-tactical-profile-suppressed", "Practice", "Tactical profile · focus hidden", "practice--tactical-profile-suppressed", "Calm result after declining emphasis, with continued mixed-Run evidence collection and a reversible restore action.", "practice", ["Suppressed recommendation", "Continued evidence collection", "Restore action", "Back to Practice"], ["Tactical Profile", "Practice Home"], "contained"),
  "practice-first-sprint-guide": defineScenario("practice-first-sprint-guide", "Practice", "First Sprint guide", "practice--first-sprint-guide", "First-use Practice Home with an automatically expanded rule card whose dynamic title states the selected Run pass target while the supporting rules explain the neutral Incomplete result at the Sprint deadline.", "practice", ["First-use guidance", "Dynamic Solve 15 puzzles to pass title", "Aligned supporting-rule columns", "Even supporting-rule rhythm", "Time and mistake limits", "Sprint deadline saves the active puzzle as Incomplete", "Slow Incomplete also becomes Unclear", "Dismiss to persistent help entry"], ["Production onboarding state", "Persistence", "Active Sprint"], "contained"),
  "practice-home-edit": defineScenario("practice-home-edit", "Practice", "Edit and reorder runs", "practice--edit-and-reorder-runs", "Home edit mode with a full-size card that follows the pointer, a lifted picked-up state, a medium-haptic pickup preview, a card-sized dashed insertion outline before drop, animated settling, arrow-button fallbacks, Run edit actions, and removal actions.", "practice", ["Pointer-following whole-card drag", "Suppressed browser drag ghost", "Lifted picked-up card", "Medium pickup haptic preview", "Dashed insertion-slot target", "Animated drop settlement", "Arrow-button fallback", "Run edit actions", "Format-specific icons", "Removal entry"], ["Native haptic feel validation", "Run editor", "Removal confirmation", "Practice home"]),
  "practice-custom-setup": defineScenario(
    "practice-custom-setup",
    "Practice",
    "New Run",
    "practice--custom-setup",
    "New named run editor that defaults to a compact All themes summary, reveals the grouped server-curated 24-theme catalog with a short height, fade, and chevron animation, matches the web timing range, and lets linked warning and timeout defaults be adjusted. A new Arrow Duel Run inherits the global default without repeating the per-Run override before it is saved.",
    "practice",
    ["Required unique name", "Custom configuration", "Web timing range", "Linked timing defaults", "Independent warning and timeout controls", "Collapsed All themes summary", "Animated 24-theme disclosure", "Deterministic All-to-multiple selection", "All exclusivity", "Global Arrow Duel default inheritance", "No duplicate per-Run override before save", "Direct 600-2200 starting rating", "Add to Home"],
    ["Practice home", "Native run persistence", "Scored practice session"]
  ),
  "practice-run-name-validation": defineScenario("practice-run-name-validation", "Practice", "Run name validation", "practice--run-name-validation", "New Run with inline required-name validation; entering an existing name exposes the unique-name error.", "practice", ["Required-name error", "Unique-name rule", "Accessible field feedback"], ["Practice home", "Saved run"]),
  "practice-run-standard-editor": defineScenario("practice-run-standard-editor", "Practice", "Built-in Run editor", "practice--built-in-run-editor", "Existing Standard Run editor with compact per-Run Slow warning and puzzle timeout settings below Name, Format, and rating.", "practice", ["Editable unique name", "Direct 600-2200 rating entry", "Fixed Run format", "Slow warning", "Puzzle timeout", "Independent on/off controls", "No rating impact"], ["Practice home edit mode", "Production persistence"]),
  "practice-run-arrow-duel-editor": defineScenario("practice-run-arrow-duel-editor", "Practice", "Arrow Duel Run editor", "practice--arrow-duel-reply-setting", "Arrow Duel's existing Edit Run screen keeps the per-Run reply control and direct reply-time input only while the global setting is on. The copy first explains the experience, then says this setting changes only this Run and points to Settings for turning the challenge off everywhere. A separate global-off story proves the section disappears without changing the rest of Edit Run or the Run's Rating identity.", "practice", ["Existing Edit Run flow", "Visible only while global on", "User-first reply explanation", "Individual Run scope", "Straight-to-next-puzzle off behavior", "Global Settings escape hatch", "Direct reply-time input", "Ten-second default", "Thirty-second maximum", "Sprint and puzzle timers paused", "Global-off absence", "Shared Run Rating identity"], ["Production persistence", "Global setting wiring", "Active Arrow Duel"]),
  "practice-custom-rating-editor": defineScenario("practice-custom-rating-editor", "Practice", "Custom Run editor and validation", "practice--custom-rating-editor", "Existing Custom Run editor adds the same compact timing controls while retaining its inline rating validation.", "practice", ["Editable unique name", "Direct rating entry", "600-2200 validation", "Slow warning", "Puzzle timeout", "Fixed creation settings"], ["Practice home edit mode", "Production persistence"]),
  "practice-run-remove-confirmation": defineScenario("practice-run-remove-confirmation", "Practice", "Remove run confirmation", "practice--remove-run-confirmation", "Inline warning directly below the selected Run before it is removed from Home, explicitly retaining its rating and history for later restoration.", "practice", ["Inline removal warning", "Selected Run context", "Retained rating and history", "Cancel", "Confirm removal"], ["Edit runs", "Restore run"]),
  "practice-runs-empty": defineScenario("practice-runs-empty", "Practice", "Empty Home and restore", "practice--empty-home-and-restore", "Home after every saved Run is hidden keeps Add and restore paths while Survival remains available from the retained built-in Standard Rating profile.", "practice", ["Empty saved-Run state", "Survival entry", "Retained Standard Rating source", "Add Run", "Retained run list", "Restore to Home"], ["New Run", "Survival Hub", "Practice home"], "contained"),
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
  "practice-active-session-guide": defineScenario("practice-active-session-guide", "Practice", "Active session · first-use guide", "practice--active-session-guide", "Four semantic first-use explanations shown before the Sprint begins. The frozen demonstration preserves the real Sprint hierarchy while keeping its direct Exit guide control available, using a height-aware portrait board, raising the portrait Timed Out callout enough to show its full red pointer above that board, retaining the real full-width portrait Unclear prompt, and routing measured board-to-rail connectors around copy toward their landscape targets. It also explains that the active puzzle becomes neutral Incomplete when the Sprint clock reaches zero.", "practice", ["No real session chessboard during guidance", "Frozen real-Sprint composition", "Always-available direct guide exit without completion", "Height-aware portrait board", "Raised portrait Timed Out callout with full pointer and board clearance", "Full-width production Unclear prompt in portrait", "Fixed-shape downward portrait arrows outside callout borders with target clearance", "Measured landscape connectors routed around copy with target clearance", "Shared session header, prompt, timer, score, and Unclear components", "SPRINT HEADER, SLOW, TIMED OUT, and UNCLEAR guidance", "Sprint deadline saves the active puzzle as Incomplete", "Amber explains that the user is taking too long", "Current target stays bright while the Exit guide control remains available", "Current-guide-only accessibility announcement", "Timed out is explained as a mistake and Review entry, not Unclear", "Start Sprint only after the final guide"], ["Production onboarding persistence", "Active Sprint"], "contained"),
  "practice-arrow-duel-guide": defineScenario("practice-arrow-duel-guide", "Practice", "Arrow Duel · after shared guide", "practice--arrow-duel-guide", "First-ever Arrow Duel entry keeps the four shared Active Session explanations, then uses two frozen real-session compositions: choose between the legal Qg7 checkmate and Qe8 alternatives, and after Qe8 lands, reply for Black. The reply explanation ends with a separate highlighted line that bolds optional, names Settings as the escape hatch, and keeps familiarity-timing internals out. The direct Exit guide control remains available without completing Arrow Duel guidance.", "practice", ["Guides 1–4: responsive shared Active Session guidance", "Guide 5: choose the stronger move", "Guide 6: Find the reply for Black", "Highlighted optional settings line", "Settings escape hatch", "Always-available direct guide exit without completion", "Height-aware portrait board and shared session components", "Single-line guide progress", "Two-step Arrow Duel mental model", "Legal Qg7 and Qe8 candidate arrows", "Other-move last-position highlight", "Sprint time stays paused", "Misses and reply timeout go to Review", "Portrait reply callout partially overlays the board", "Landscape callout in the empty board lane", "Real candidate-arrow overlay only on the choice step", "Back traverses both Arrow Duel steps", "No real session position during guidance", "Start Arrow Duel after the final guide"], ["Production onboarding persistence", "Preparation-duration persistence", "Global setting wiring", "Arrow Duel Sprint"], "contained"),
  "practice-arrow-duel-guide-only": defineScenario("practice-arrow-duel-guide-only", "Practice", "Arrow Duel · two first-use steps", "practice--arrow-duel-guide-only", "A user who already knows the shared Active Session controls sees the two Arrow Duel-specific explanations: choose between the legal Qg7 checkmate and Qe8 alternatives, then reply for Black after Qe8. The reply explanation ends with a separate highlighted line that bolds optional, points to Settings, and keeps familiarity-timing internals out. Direct Exit keeps this guidance eligible for the next Arrow Duel.", "practice", ["Two guides: 1 of 2 and 2 of 2", "Highlighted optional settings line", "Settings escape hatch", "Always-available direct guide exit without completion", "Height-aware frozen real Arrow Duel compositions", "Shared session components", "Single-line guide progress", "Legal Qg7 and Qe8 candidate arrows", "Explicit Black reply prompt on the second step", "Sprint time stays paused", "Misses and reply timeout go to Review", "Portrait reply callout partially overlays the board", "Landscape callout in the empty board lane", "No real session position during guidance", "Start Arrow Duel"], ["Production onboarding persistence", "Preparation-duration persistence", "Global setting wiring", "Arrow Duel Sprint"], "contained"),
  "practice-unclear-follow-up": defineScenario(
    "practice-unclear-follow-up",
    "Practice",
    "Unclear follow-up",
    "practice--unclear-follow-up",
    "Active Arrow Duel sprint after one correct attempt, showing the previous attempt marked Unclear with the same blue read-only status styling used by In Review.",
    "practice",
    ["Previous-attempt clarity question", "Mark as unclear action", "Blue read-only Marked status", "Stable board and score", "Portrait footer and landscape rail placement"],
    ["Next puzzle", "History"]
  ),
  "practice-arrow-duel-prompt": defineScenario("practice-arrow-duel-prompt", "Practice", "Arrow Duel choice and reply", "practice--arrow-duel-prompt", "The Arrow Duel session documents explicit side-to-move copy across the production handoff. Before the other move animates, the full-board cue asks what the replying side would play, represents that side with the shared king glyph, and tells the player to play the best reply within the configured time. Once ready, the fixed-height prompt becomes Find White’s reply in the primary fixture while its supporting line confirms that the other move was played. Both recurring surfaces add the compact `Optional · Turn off in Settings` cue, subordinate to the reply instruction and countdown. Separate frozen stories retain the first-cue Got it interaction plus the 1.5-second and 1-second familiar states.", "practice", ["Initial two-arrow choice", "Green confirmation before handoff", "Silent undo before the other move", "Replying-side king glyph in the handoff question", "Action-focused reply-time instruction", "Optional Settings cue on every handoff", "Optional Settings cue on every ready prompt", "Fixed-height side-specific reply prompt", "Original solver perspective retained", "Reply timer starts after animation", "First cue requires Got it", "First two Sprints use a 1.5-second familiar cue", "Third and later Sprints use a 1-second cue", "Ten-second default reply", "Thirty-second maximum", "Sprint and puzzle clocks paused", "Main-line reply", "Any immediate mate accepted", "Standard-style green and red feedback", "Automatic next puzzle", "Brief timeout overlay", "Review consequence without result copy"], ["Global setting wiring", "Runtime engine"], "contained"),
  "practice-blunder-move-preview": defineScenario("practice-blunder-move-preview", "Practice", "Blunder move preview", "practice--blunder-move-preview", "Standard puzzle entry that animates the opponent blunder before unlocking the white-to-move Board Placeholder.", "practice", ["Blunder replay", "White King prompt icon", "Rounded prompt card above board", "Input lock"], ["Active sprint"]),
  "practice-paused": defineScenario("practice-paused", "Practice", "Paused session", "practice--paused-session", "Paused sprint with resume and abandon actions.", "practice", ["Paused state", "Resume", "Abandon"], ["Active sprint", "Sprint result"]),
  "practice-exit-confirmation": defineScenario("practice-exit-confirmation", "Practice", "Exit confirmation", "practice--exit-confirmation", "Guarded abandon confirmation over an active sprint.", "practice", ["Confirmation", "Cancel", "Confirm abandon"], ["Active sprint", "Sprint result"]),
  "practice-summary": defineScenario("practice-summary", "Practice", "Sprint summary", "practice--sprint-summary", "Completed one-puzzle sprint summary reached through the public board callback.", "practice", ["Result", "Rating change", "History and review actions"], ["Practice home", "History", "Review"]),
  "practice-sprint-result-goal": defineScenario("practice-sprint-result-goal", "Practice", "Sprint result · Goal clarity", "practice--sprint-result-goal-clarity", "Failed Sprint Result that reports two Unclear and two In Review attempts as four Replay entries while keeping Replay separate from Review scheduling.", "practice", ["Solved 11", "Solve 15 to pass", "12 attempted", "Unclear count", "In Review count", "Neutral replay entry", "Replay and Review terminology"], ["Production result wiring", "History", "Review"], "contained"),
  "practice-sprint-result-incomplete": defineScenario("practice-sprint-result-incomplete", "Practice", "Sprint result · Incomplete final puzzle", "practice--sprint-result-incomplete", "Failed Sprint Result asking Was the final puzzle unclear? for the exact neutral Incomplete attempt, with Mark as unclear changing to the existing Marked status without changing mistakes or Review.", "practice", ["Neutral Incomplete result", "Was the final puzzle unclear?", "Exact final-attempt Unclear action", "Mark as unclear", "Marked confirmation", "No mistake or Review implication"], ["History", "Practice home"], "contained"),
  "practice-sprint-result-replay": defineScenario("practice-sprint-result-replay", "Practice", "Sprint result · Flagged replay", "practice--sprint-result-flagged-replay", "A four-attempt Replay reached from Sprint Result: two Unclear attempts expose Mark clear and two In Review attempts expose Remove from Review, using the existing actions instead of new status badges.", "practice", ["Sprint Result entry", "Four-attempt Replay", "Mark clear", "Remove from Review", "No replay status badges", "Previous and next navigation"], ["Production replay selection", "New replay status badges", "Practice home"], "contained"),
  "practice-sprint-result-extra-attempt": defineScenario("practice-sprint-result-extra-attempt", "Practice", "Sprint result · Extra attempt", "practice--sprint-result-extra-attempt", "Passed Sprint Result that shows Solved 15 beside the fixed pass target while explicitly reporting the user's 16 actual attempts.", "practice", ["Solved 15", "Solve 15 to pass", "16 attempted", "Accuracy", "Aligned summary counts", "Existing result actions"], ["Production result wiring", "History", "Review"], "contained"),
  "practice-app-store-review-request": {
    ...defineScenario(
      "practice-app-store-review-request",
      "Practice",
      "App Store review request · eligible puzzle milestone",
      "practice--app-store-review-request-eligible-puzzle-milestone",
      "The unchanged successful puzzle Sprint Result at the native StoreKit boundary. After four successful puzzle Sprints across at least two local dates, the production app may request Apple's standard review sheet after this result has remained stable for two seconds. StoreKit may show nothing, and the result remains fully usable.",
      "practice",
      [
        "Successful puzzle Sprint Result",
        "Four successful puzzle Sprints",
        "At least two local dates",
        "Two-second idle handoff",
        "No custom pre-prompt",
        "Unchanged result when StoreKit shows nothing"
      ],
      ["Apple StoreKit review sheet", "Practice home", "Play again"],
      "contained"
    ),
    nativeBoundary: {
      title: "Apple system review sheet",
      detail: "Chessticize only requests Apple's standard StoreKit sheet. The browser does not recreate it, and the puzzle result remains usable whether or not iOS chooses to show it."
    }
  },
  "practice-tactical-focus-guide": defineScenario("practice-tactical-focus-guide", "Practice", "Tactical Focus · first-use guide", "practice--tactical-focus-guide", "The shared active-session guide adapts its header, timeout, score, and start language to a fixed Unrated Focused Run before its clock starts.", "practice", ["Focused Run header guidance", "Fixed-puzzle progress", "Unrated status", "Timeout counts as a completed puzzle", "Start Focused Run"], ["Production onboarding persistence", "Active Focused Run"], "contained"),
  "practice-tactical-focus-active": defineScenario("practice-tactical-focus-active", "Practice", "Tactical Focus · active run", "practice--tactical-focus-active", "Active fixed Tactical Focus Run that replaces pass and mistake-limit language with completed, remaining, and Unrated status while preserving the familiar board session.", "practice", ["Focused Run header", "Fixed 15-puzzle progress", "Completed and remaining counts", "Unrated status", "Rating unchanged exit copy"], ["Focused Run result", "Review"], "contained"),
  "practice-tactical-focus-result": defineScenario("practice-tactical-focus-result", "Practice", "Tactical Focus · result", "practice--tactical-focus-result", "Completed fixed Tactical Focus Run that clearly stays unrated, reports the planned-puzzle ending, and returns to Practice instead of immediately replaying stale focus.", "practice", ["Focused Run complete", "Planned puzzles complete", "Unrated Rating", "Back to Practice"], ["Practice home", "Review"], "contained"),
  "practice-reminder-prompt": defineScenario("practice-reminder-prompt", "Practice", "Review reminder prompt", "practice--review-reminder-prompt", "First-mistake notification-permission prompt driven by a maintained fake client.", "practice", ["Permission rationale", "Enable", "Dismiss"], ["Active sprint"]),
  "review-empty": defineScenario("review-empty", "Review", "Empty queue", "review--empty-queue", "Review with no due or future items.", "review", ["Empty state", "Practice return"], ["Practice"]),
  "review-due": defineScenario("review-due", "Review", "Home", "review--due-queue", "The Review tab home keeps today's scheduled retries prominent while making the Filter panel and both default-open Today sections smoothly collapsible. Filter options stay above the Review action; when they collapse, a single chip preserves only the selected filter, and the summary hides while the options are visible. Quick filters update the same two Today lists instead of switching interfaces. Stable section geometry, aligned counts, a distinct retry icon, prior attempts, misses, and recency remain visible.", "review", ["Review Home", "Due metrics", "Forecast", "Filter controls above Review action", "Collapsed selected-filter summary", "Main Review action", "Animated quick filters", "Same Today sections after filtering", "Today to review expanded by default", "Completed today expanded by default", "Fixed-height section controls", "Animated height and fade", "Animated chevrons", "Aligned section counts and chevrons", "Blue retry icon", "Attempt count", "Miss count", "First-miss recency", "Last-retry recency"], ["Production review-history derivation", "Review session", "Practice"]),
  "review-overdue": defineScenario("review-overdue", "Review", "Overdue queue", "review--overdue-queue", "Overdue workload and danger treatment.", "review", ["Overdue count", "Due rows", "Forecast"], ["Review session", "Practice"]),
  "review-filters": defineScenario("review-filters", "Review", "Filters", "review--filters", "Four action-focused quick filters use the shared short height-and-fade disclosure motion and update the existing Today to review and Completed today lists in place. Filter options stay above the Review action; when they collapse, one chip shows only the selected filter, and that summary hides while the options are visible. The alternate Due items and Review groups interface and low-value format and pace options remain removed.", "review", ["All", "Overdue", "Missed 2+ times", "Arrow Duel", "Filter controls above Review action", "Collapsed selected-filter summary", "Animated quick filters", "Same Today sections after filtering", "Active filter control", "No Due items interface", "No Review groups"], ["Review session", "Practice"]),
  "review-session": defineScenario("review-session", "Review", "Review session", "review--review-session", "Due Review session using the Board Placeholder and public queue state. Portrait keeps the established stack; landscape matches Sprint with a fixed full board on the left and a scrollable header, timer, instruction, and actions rail on the right.", "review", ["Stable board through resize", "Portrait stack", "Landscape board-left control rail", "Timer", "Context", "Previous and next"], ["Review queue"]),
  "review-arrow-duel-reply": defineScenario("review-arrow-duel-reply", "Review", "Arrow Duel reply", "review--arrow-duel-reply", "Scheduled Arrow Duel Review previews the same replying-side king glyph, action-focused timing instruction, and compact `Optional · Turn off in Settings` cue as Sprint while retaining the Run's twelve-second reply fixture. The ready prompt becomes Find Black’s reply; either stage must pass for Review to pass, and timeout receives a visible Timed out handoff before Review advances.", "review", ["Existing Review session", "Stored candidate order", "Replying-side king glyph in the handoff question", "Action-focused reply-time instruction", "Optional Settings cue", "Side-specific ready prompt", "Run-configured twelve-second countdown", "Countdown starts at input unlock", "Visible Timed out handoff", "One Review result for both stages"], ["Production copy defaults", "Production preparation-duration persistence", "Global setting wiring", "Review queue", "Replay"], "contained"),
  "review-blunder-move-preview": defineScenario("review-blunder-move-preview", "Review", "Review blunder move preview", "review--blunder-move-preview", "Due Review entry that replays the original blunder before the user retries the puzzle as White.", "review", ["Blunder replay", "White King prompt icon", "Rounded prompt card above board", "Input lock"], ["Review queue"]),
  "review-feedback-analysis": defineScenario("review-feedback-analysis", "Review", "Feedback and analysis", "review--feedback-and-analysis", "Wrong-move feedback followed by the browser-safe fallback analysis surface.", "review", ["Move feedback", "Analysis lines", "Reset and flip controls"], ["Review session"]),
  "history-empty": defineScenario("history-empty", "History", "Empty history", "history--empty-history", "History with no attempts or rating points.", "history", ["Empty state", "Primary filters"], ["Practice", "Review", "Settings"]),
  "history-populated": defineScenario("history-populated", "History", "Populated history", "history--populated-history", "Existing populated History documents the 1.3.5 Incomplete result for puzzles left unfinished when a Sprint ends. Incomplete is neutral rather than Wrong, independently needs attention, and also carries Unclear and Slow when the elapsed time crossed the Slow line.", "history", ["Current History layout", "Production Incomplete outcome", "Gray circle and white dash", "Incomplete needs attention", "Slow Incomplete also Unclear", "Accuracy excludes Incomplete", "Exact-attempt Unclear action", "Sprint source default", "Applied filter summary", "Curated tags"], ["Release QA"]),
  "history-filters": defineScenario("history-filters", "History", "Filters and active filters", "history--filters-and-active-filters", "The existing advanced-filter region and nested 24-theme catalog use the same short height, fade, and chevron disclosure motion while retaining Incomplete beside Correct and Wrong and the independent OR-based Attention reasons.", "history", ["Animated advanced filters", "Incomplete Result filter", "Incomplete Attention reason", "Attention reason OR group", "Needs attention interaction", "Sprint source default", "Selected theme names above", "Compact theme count below", "Animated 24-theme catalog", "Reset"], ["Production history query", "Replay puzzle"]),
  "history-progress": defineScenario("history-progress", "History", "Tactical progress · improving strength", "history--tactical-progress", "History adds a dedicated Progress entry leading to a separate page with compact page-level Puzzle solving, Arrow Duel, and theme filters above the result card.", "history", ["History Progress button", "Separate progress page", "Compact Puzzle solving and Arrow Duel selector", "Page-level theme selector", "Theme-only labels", "Progress over time", "Accuracy", "Solve time", "Balanced state"], ["Production navigation", "Historical aggregation", "Storage", "Training recommendation"], "contained"),
  "history-progress-weakness": defineScenario("history-progress-weakness", "History", "Tactical progress · reliability weakness", "history--tactical-progress-clear-weakness", "The separate History Progress page highlights a solve-rate weakness only after the model's evidence, impact, and diversity checks pass.", "history", ["History Progress button", "Separate progress page", "Solve reliability effect", "Matched model baseline", "Evidence, impact, and diversity explanation", "Progress trend"], ["Production navigation", "Statistical computation", "Storage", "Training recommendation"], "contained"),
  "history-progress-speed-weakness": defineScenario("history-progress-speed-weakness", "History", "Tactical progress · completed-speed weakness", "history--tactical-progress-completed-speed-weakness", "A separate History Progress state shows a theme that is solved correctly but consistently more slowly than the matched completed-puzzle baseline.", "history", ["History Progress button", "Separate progress page", "Completed-puzzle speed effect", "Reliable elapsed-time eligibility", "Matched model baseline", "Evidence, impact, and diversity explanation"], ["Production navigation", "Statistical computation", "Storage", "Training recommendation"], "contained"),
  "history-attempt-detail": defineScenario("history-attempt-detail", "History", "Replay puzzle", "history--attempt-detail", "The real puzzle Replay reached by tapping a History row, using Replay terminology and the existing Mark clear or Remove from Review actions without adding status badges.", "history", ["Replay title", "Mark clear", "Curated theme rail", "Replay and Review terminology"], ["History", "New replay status badges"]),
  "history-arrow-duel-replay": defineScenario("history-arrow-duel-replay", "History", "Arrow Duel Replay · full line", "history--arrow-duel-replay-full-line", "History Replay inherits the enabled Opponent reply rule without a countdown. A correct candidate and reply turn the remaining stored line into an unassisted puzzle from the reply side: the player makes every move for that side, opponent replies animate automatically, no guide arrow appears, and Solved waits for the complete line.", "history", ["Existing History Replay", "Stored candidate order", "Untimed opponent reply", "Unassisted reply-side continuation", "No guide arrow", "Solved only after the complete line", "No History or Review mutation"], ["History", "Analysis"], "contained"),
  "history-replay-unavailable": defineScenario("history-replay-unavailable", "History", "Replay unavailable", "history--replay-unavailable", "Corrupt Arrow Duel attempt whose candidate order cannot be reconstructed safely.", "history", ["Persisted details", "Replay-unavailable explanation"], ["History"]),
  "settings-ios-sync": defineScenario(
    "settings-ios-sync",
    "Settings",
    "iOS sync",
    "settings--ios-sync",
    "The stable iOS Settings clone presents Sync Now as an explicit button instead of a disclosure row, so the action no longer implies another page. It retains the global Find the opponent's best reply control alongside Notifications, Move Feedback, and Guidance. Its On copy explains Survival's untimed reply plus saved Run options. Its Off copy says new Arrow Duel play, including Survival, checks only the arrow choice while paused sessions retain their existing rule.",
    "settings",
    ["iCloud Sync", "Explicit Sync Now button", "No disclosure chevron", "Global Arrow Duel reply control", "Survival follows global preference", "Untimed Survival reply", "Paused Sprint and puzzle timers", "Per-Run Edit Run handoff", "Candidate-only Off explanation", "Previously chosen Run settings restored on re-enable", "Notifications", "Sound and haptic toggles", "Move and capture audio previews", "Guidance reset", "About"],
    ["Run editor", "Native audio and haptic validation", "Stockfish diagnostics"]
  ),
  "settings-ios-sync-syncing": defineScenario(
    "settings-ios-sync-syncing",
    "Settings",
    "iOS sync · syncing",
    "settings--ios-sync-syncing",
    "After Sync Now is pressed, the button becomes a disabled Syncing… state with a visible progress indicator until the current sync finishes. The previous stable sync result remains above instead of repeating Syncing, and the user stays in Settings without starting a duplicate sync.",
    "settings",
    ["Existing iCloud Sync section", "Disabled Syncing button", "Visible progress indicator", "Stable previous sync result", "Busy accessibility state", "No duplicate submission", "No navigation"],
    ["CloudKit completion timing", "Success and error result details"]
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
    ["Help & Feedback placement", "Email Support final row", "Persistent Settings entry", "Sensitive-data confirmation", "Consistent local SQLite snapshot", "Progress V2 NDJSON capture", "Optional read-only V1 JSON snapshot", "Diagnostic manifest", "iOS Share Sheet handoff"],
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
    ["Sensitive-data confirmation", "CloudKit V2 capture unavailable", "Explicit partial-bundle warning", "Included-file inventory", "iOS Share Sheet handoff"],
    ["iCloud sync error details", "Native database snapshot and Share Sheet"],
    "contained"
  ),
  "settings-sprint-guidance": defineScenario("settings-sprint-guidance", "Settings", "Guidance · replay Sprint and Arrow Duel guides", "settings--sprint-guide-reset", "Settings guidance action that makes the rules, active-session, and Arrow Duel guides available again without changing Runs, ratings, or History.", "settings", ["Direct Settings entry", "Guidance focused in the phone viewport", "Explicit Reset guides button", "Reset the full guidance set", "No confirmation for a reversible action", "Inline completed state", "Progress safety copy"], ["Production onboarding persistence", "Practice"], "contained"),
  "settings-android-backup": defineScenario("settings-android-backup", "Settings", "Android backup", "settings--android-backup", "Android managed-backup Settings keeps iCloud controls omitted and its local SQLite diagnostics export under Help & Feedback while sharing the same user-first global Arrow Duel reply control and On/Off explanation as iOS.", "settings", ["Android Progress Backup", "Global Arrow Duel reply control", "User-first On explanation", "Paused Sprint and puzzle timers", "Per-Run Edit Run handoff", "Straight-to-next-puzzle Off explanation", "Local SQLite support bundle", "Diagnostic manifest", "Android share handoff", "Notifications", "About"], ["Native SQLite snapshot and Android share options", "Global setting wiring"]),
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
    "survival-guide-to-hub": coveredBy("practice-personal-best-guide"),
    "survival-guide-to-practice": coveredBy("practice-home"),
    "survival-hub": coveredBy("practice-personal-best-hub"),
    "survival-pause": coveredBy("practice-personal-best-leave"),
    "survival-records": coveredBy("practice-personal-best-records"),
    "survival-source-picker": coveredBy("practice-personal-best-source-run"),
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
