import type { PracticeRunKind, PracticeRunRecord } from "../../../../packages/core/src/index.ts";

export type { PracticeRunKind } from "../../../../packages/core/src/index.ts";

export type PracticeRunPresentation = {
  id: string;
  ratingKey?: string;
  name: string;
  kind: PracticeRunKind;
  mode: PracticeRunRecord["mode"];
  elo: number;
  durationSeconds: number;
  perPuzzleSeconds: number;
  themes: readonly string[];
};

export type PracticeRunDraft = Omit<PracticeRunPresentation, "id"> & {
  id?: string;
};

export type PracticeRunManagementIntent =
  | { type: "add-run" }
  | { type: "cancel-edit" }
  | { type: "change-duration"; durationSeconds: number }
  | { type: "change-elo"; elo: number }
  | { type: "change-mode"; mode: "custom" | "arrow_duel" }
  | { type: "change-name"; name: string }
  | { type: "change-per-puzzle"; perPuzzleSeconds: number }
  | { type: "change-themes"; themes: string[] }
  | { type: "confirm-remove" }
  | { type: "dismiss-remove" }
  | { type: "edit-run"; runId: string }
  | { type: "move-run"; runId: string; targetRunId: string }
  | { type: "remove-run"; runId: string }
  | { type: "restore-run"; runId: string }
  | { type: "save-run" }
  | { type: "select-run"; runId: string }
  | { type: "start-selected-run" }
  | { type: "toggle-home-edit" };

export type PracticeRunManagementPresentation = {
  canSave?: boolean;
  draft: PracticeRunDraft | null;
  hiddenRuns: readonly PracticeRunPresentation[];
  homeEditing: boolean;
  nameError: string | null;
  notice: string | null;
  removeCandidateId: string | null;
  runs: readonly PracticeRunPresentation[];
  screen: "home" | "create" | "edit";
  selectedRunId: string | null;
  onIntent: (intent: PracticeRunManagementIntent) => void;
};
