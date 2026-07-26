import type {
  TacticalProfileCalibrationAssurance,
  TacticalProfileTaskFamily
} from "../../../../packages/core/src/index.ts";

export type TacticalProfileSignalKind = "solve_rate" | "speed" | "both";

export type TacticalProfileSignal = {
  id: string;
  taskFamily: TacticalProfileTaskFamily;
  themeKey: string;
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
  taskFamily: TacticalProfileTaskFamily;
  title: string;
  ratingLabel: string;
  durationLabel: string;
  totalPuzzleCount: number;
  allocations: readonly FocusedRunAllocation[];
};

export type FocusedRunUnavailable = {
  title: string;
  body: string;
};

export type TacticalProfileEvidenceCheck = {
  id: "puzzle_variety" | "session_coverage" | "signal_clarity";
  label: string;
  value: string;
  detail: string;
  status: "ready" | "building" | "watching";
  statusLabel: string;
};

export type TacticalProfileEvidenceProgress = {
  tone: "collecting" | "balanced" | "ready";
  title: string;
  body: string;
  checks: readonly TacticalProfileEvidenceCheck[];
  footnote: string;
};

export type TacticalProfileIntent =
  | { type: "open-profile" }
  | { type: "close-profile" }
  | { type: "select-task-family"; taskFamily: TacticalProfileTaskFamily }
  | { type: "explain-signal"; signalId: string }
  | { type: "preview-focused-run" }
  | { type: "start-focused-run" }
  | { type: "suppress-recommendation" }
  | { type: "restore-recommendation" };

export type TacticalProfilePresentation = {
  phase: TacticalProfilePhase;
  assurance?: TacticalProfileCalibrationAssurance;
  screen: TacticalProfileScreen;
  activeTaskFamily?: TacticalProfileTaskFamily;
  unavailableFamilies?: Readonly<
    Partial<Record<TacticalProfileTaskFamily, string>>
  >;
  homeLeadSignalId?: string;
  signals: readonly TacticalProfileSignal[];
  selectedSignalId?: string;
  evidenceProgressByTaskFamily?: Readonly<
    Partial<Record<TacticalProfileTaskFamily, TacticalProfileEvidenceProgress>>
  >;
  focusedRun?: FocusedRunPreview;
  focusedRunUnavailable?: FocusedRunUnavailable;
  onIntent: (intent: TacticalProfileIntent) => void;
};
