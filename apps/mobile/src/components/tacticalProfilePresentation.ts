export type TacticalProfileSignalKind = "solve_rate" | "speed";

export type TacticalProfileSignal = {
  id: string;
  themeLabel: string;
  kind: TacticalProfileSignalKind;
  distinctPuzzleCount: number;
  distinctSessionCount: number;
  priorityLabel: string;
  status: "recommended" | "watch";
};

export type TacticalProfilePhase =
  | "building"
  | "collecting"
  | "balanced"
  | "ready";

export type TacticalProfileScreen =
  | "home"
  | "profile"
  | "explanation"
  | "focused_run"
  | "suppressed";

export type FocusedRunAllocation = {
  id: string;
  label: string;
  puzzleCount: number;
  tone: "primary" | "secondary" | "mixed";
};

export type FocusedRunPreview = {
  title: string;
  durationLabel: string;
  totalPuzzleCount: number;
  allocations: readonly FocusedRunAllocation[];
};

export type FocusedRunUnavailable = {
  title: string;
  body: string;
};

export type TacticalProfileIntent =
  | { type: "open-profile" }
  | { type: "close-profile" }
  | { type: "explain-signal"; signalId: string }
  | { type: "preview-focused-run" }
  | { type: "start-focused-run" }
  | { type: "suppress-recommendation" }
  | { type: "restore-recommendation" };

export type TacticalProfilePresentation = {
  phase: TacticalProfilePhase;
  screen: TacticalProfileScreen;
  signals: readonly TacticalProfileSignal[];
  selectedSignalId?: string;
  focusedRun?: FocusedRunPreview;
  focusedRunUnavailable?: FocusedRunUnavailable;
  onIntent: (intent: TacticalProfileIntent) => void;
};
