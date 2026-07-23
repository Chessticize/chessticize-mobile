import type {
  CustomSprintConfigRecord,
  PracticeRunManagementDraft as CorePracticeRunManagementDraft,
  PracticeRunManagementIntent as CorePracticeRunManagementIntent,
  PracticeRunManagementRun
} from "../../../../packages/core/src/index.ts";

export type { PracticeRunKind } from "../../../../packages/core/src/index.ts";

export type PracticeRunPresentation = PracticeRunManagementRun;
export type PracticeRunDraft = CorePracticeRunManagementDraft;
export type PracticeRunManagementIntent = CorePracticeRunManagementIntent;

export type PracticeRunManagementPresentation = {
  canSave?: boolean;
  directRunEditing?: boolean;
  draft: PracticeRunDraft | null;
  eloError?: string | null;
  eloInput?: string | null;
  hiddenRuns: readonly PracticeRunPresentation[];
  homeEditing: boolean;
  nameError: string | null;
  notice: string | null;
  previousConfigs?: readonly {
    config: CustomSprintConfigRecord;
    rating: number;
  }[];
  removeCandidateId: string | null;
  runs: readonly PracticeRunPresentation[];
  screen: "home" | "create" | "edit";
  selectedRunId: string | null;
  onIntent: (intent: PracticeRunManagementIntent) => void;
};
