import type {
  FocusedRunPreview,
  TacticalProfileIntent,
  TacticalProfilePresentation,
  TacticalProfileScreen,
  TacticalProfileSignal
} from "../../mobile/src/components/tacticalProfilePresentation.ts";
import type { TacticalProfileTaskFamily } from "../../../packages/core/src/index.ts";
import type { LabScenarioId } from "./scenarioRegistry.ts";

export type TacticalProfileScenarioId =
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
  | "practice-tactical-profile-suppressed";

export type TacticalProfileFixtureState = {
  screen: TacticalProfileScreen;
  selectedSignalId?: string;
  selectedTaskFamily: TacticalProfileTaskFamily;
};

const FORK_SIGNAL: TacticalProfileSignal = {
  id: "fork",
  taskFamily: "line",
  themeLabel: "Forks",
  kind: "solve_rate",
  distinctPuzzleCount: 7,
  distinctSessionCount: 3,
  priorityLabel: "Recommended · common opportunity",
  status: "recommended"
};

const PIN_SPEED_SIGNAL: TacticalProfileSignal = {
  id: "pin-speed",
  taskFamily: "line",
  themeLabel: "Pins",
  kind: "speed",
  distinctPuzzleCount: 6,
  distinctSessionCount: 3,
  priorityLabel: "Recommended · completed puzzles",
  status: "recommended"
};

const DEFLECTION_SIGNAL: TacticalProfileSignal = {
  id: "deflection",
  taskFamily: "line",
  themeLabel: "Deflection",
  kind: "solve_rate",
  distinctPuzzleCount: 5,
  distinctSessionCount: 2,
  priorityLabel: "Secondary focus",
  status: "recommended"
};

const BACK_RANK_SIGNAL: TacticalProfileSignal = {
  id: "back-rank",
  taskFamily: "line",
  themeLabel: "Back-rank mates",
  kind: "solve_rate",
  distinctPuzzleCount: 6,
  distinctSessionCount: 3,
  priorityLabel: "Monitored · below display cutoff",
  status: "recommended"
};

const SMOTHERED_MATE_SIGNAL: TacticalProfileSignal = {
  id: "smothered-mate",
  taskFamily: "line",
  themeLabel: "Smothered mates",
  kind: "solve_rate",
  distinctPuzzleCount: 4,
  distinctSessionCount: 2,
  priorityLabel: "Recommended · limited nearby supply",
  status: "recommended"
};

const ARROW_PIN_SIGNAL: TacticalProfileSignal = {
  id: "arrow-pin",
  taskFamily: "arrow_duel",
  themeLabel: "Pins",
  kind: "solve_rate",
  distinctPuzzleCount: 8,
  distinctSessionCount: 3,
  priorityLabel: "Recommended · candidate choice",
  status: "recommended"
};

const ARROW_DEFLECTION_SPEED_SIGNAL: TacticalProfileSignal = {
  id: "arrow-deflection-speed",
  taskFamily: "arrow_duel",
  themeLabel: "Deflection",
  kind: "speed",
  distinctPuzzleCount: 6,
  distinctSessionCount: 3,
  priorityLabel: "Recommended · completed choices",
  status: "recommended"
};

const SINGLE_FOCUS_RUN: FocusedRunPreview = {
  taskFamily: "line",
  title: "Fork repair",
  ratingLabel: "Puzzle-solving Rating 925",
  durationLabel: "5 min",
  totalPuzzleCount: 15,
  allocations: [
    { id: "fork", label: "Forks", puzzleCount: 10, tone: "primary" },
    { id: "mixed", label: "Mixed practice", puzzleCount: 5, tone: "mixed" }
  ]
};

const RANKED_FOCUS_RUN: FocusedRunPreview = {
  taskFamily: "line",
  title: "Tactical focus",
  ratingLabel: "Puzzle-solving Rating 925",
  durationLabel: "5 min",
  totalPuzzleCount: 15,
  allocations: [
    { id: "fork", label: "Forks", puzzleCount: 9, tone: "primary" },
    { id: "pin", label: "Pins", puzzleCount: 3, tone: "secondary" },
    { id: "mixed", label: "Mixed practice", puzzleCount: 3, tone: "mixed" }
  ]
};

const ARROW_DUEL_FOCUS_RUN: FocusedRunPreview = {
  taskFamily: "arrow_duel",
  title: "Arrow Duel focus",
  ratingLabel: "Arrow Duel Rating 875",
  durationLabel: "5 min",
  totalPuzzleCount: 15,
  allocations: [
    { id: "arrow-pin", label: "Pins", puzzleCount: 9, tone: "primary" },
    { id: "arrow-deflection", label: "Deflection", puzzleCount: 3, tone: "secondary" },
    { id: "arrow-mixed", label: "Mixed Arrow Duel", puzzleCount: 3, tone: "mixed" }
  ]
};

export function isTacticalProfileScenario(
  scenarioId: LabScenarioId
): scenarioId is TacticalProfileScenarioId {
  return scenarioId.startsWith("practice-tactical-profile-");
}

export function initialTacticalProfileFixtureState(
  scenarioId: TacticalProfileScenarioId
): TacticalProfileFixtureState {
  if (scenarioId === "practice-tactical-profile-task-families") {
    return { screen: "profile", selectedTaskFamily: "arrow_duel" };
  }
  if (scenarioId === "practice-tactical-profile-explanation") {
    return { screen: "explanation", selectedSignalId: "fork", selectedTaskFamily: "line" };
  }
  if (scenarioId === "practice-tactical-profile-focused-run") {
    return { screen: "focused_run", selectedSignalId: "fork", selectedTaskFamily: "line" };
  }
  if (scenarioId === "practice-tactical-profile-suppressed") {
    return { screen: "suppressed", selectedSignalId: "fork", selectedTaskFamily: "line" };
  }
  if (
    scenarioId === "practice-tactical-profile-solve-rate"
    || scenarioId === "practice-tactical-profile-speed"
    || scenarioId === "practice-tactical-profile-limited-inventory"
  ) {
    return { screen: "profile", selectedTaskFamily: "line" };
  }
  return { screen: "home", selectedTaskFamily: "line" };
}

export function reduceTacticalProfileFixtureState(
  current: TacticalProfileFixtureState,
  intent: TacticalProfileIntent
): TacticalProfileFixtureState {
  if (intent.type === "open-profile" || intent.type === "restore-recommendation") {
    return { ...current, screen: "profile" };
  }
  if (intent.type === "close-profile") {
    return { ...current, screen: "home" };
  }
  if (intent.type === "select-task-family") {
    const { selectedSignalId: _selectedSignalId, ...rest } = current;
    return {
      ...rest,
      selectedTaskFamily: intent.taskFamily
    };
  }
  if (intent.type === "explain-signal") {
    return { ...current, screen: "explanation", selectedSignalId: intent.signalId };
  }
  if (intent.type === "preview-focused-run" || intent.type === "start-focused-run") {
    return { ...current, screen: "focused_run" };
  }
  return { ...current, screen: "suppressed" };
}

export function tacticalProfilePresentationFor(
  scenarioId: TacticalProfileScenarioId,
  state: TacticalProfileFixtureState,
  onIntent: (intent: TacticalProfileIntent) => void
): TacticalProfilePresentation {
  const base = {
    screen: state.screen,
    activeTaskFamily: state.selectedTaskFamily,
    ...(state.selectedSignalId === undefined ? {} : { selectedSignalId: state.selectedSignalId }),
    onIntent
  };

  if (scenarioId === "practice-tactical-profile-building") {
    return { ...base, phase: "building", signals: [] };
  }
  if (scenarioId === "practice-tactical-profile-collecting") {
    return { ...base, phase: "collecting", signals: [] };
  }
  if (scenarioId === "practice-tactical-profile-balanced") {
    return { ...base, phase: "balanced", signals: [] };
  }
  if (scenarioId === "practice-tactical-profile-speed") {
    return {
      ...base,
      phase: "ready",
      signals: [PIN_SPEED_SIGNAL],
      focusedRun: {
        ...SINGLE_FOCUS_RUN,
        title: "Pin speed"
      }
    };
  }
  if (scenarioId === "practice-tactical-profile-limited-inventory") {
    return {
      ...base,
      phase: "ready",
      signals: [SMOTHERED_MATE_SIGNAL],
      focusedRunUnavailable: {
        title: "Not enough new puzzles nearby",
        body: "This focus stays in your profile, but there are not enough unseen Smothered mate puzzles near your current Rating to fill a Run without repeats or a much wider difficulty range."
      }
    };
  }
  if (
    scenarioId === "practice-tactical-profile-task-families"
    || scenarioId === "practice-tactical-profile-task-families-home"
  ) {
    return {
      ...base,
      phase: "ready",
      signals: [FORK_SIGNAL, ARROW_PIN_SIGNAL, ARROW_DEFLECTION_SPEED_SIGNAL],
      focusedRun: state.selectedTaskFamily === "arrow_duel"
        ? ARROW_DUEL_FOCUS_RUN
        : SINGLE_FOCUS_RUN
    };
  }
  if (
    scenarioId === "practice-tactical-profile-ranked"
    || scenarioId === "practice-tactical-profile-focused-run"
    || scenarioId === "practice-tactical-profile-suppressed"
  ) {
    return {
      ...base,
      phase: "ready",
      signals: [FORK_SIGNAL, PIN_SPEED_SIGNAL, DEFLECTION_SIGNAL, BACK_RANK_SIGNAL],
      focusedRun: RANKED_FOCUS_RUN
    };
  }
  return {
    ...base,
    phase: "ready",
    signals: [FORK_SIGNAL],
    focusedRun: SINGLE_FOCUS_RUN
  };
}
