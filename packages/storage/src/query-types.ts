import type {
  AttemptOutcome,
  AttemptSource,
  AttemptTimingStatus,
  SprintMode
} from "../../core/src/index.ts";

export interface PuzzleSelectionFilter {
  mode: SprintMode;
  limit: number;
  rating?: number;
  preferredRating?: number;
  minRating?: number;
  maxRating?: number;
  themes?: string[];
  includeIds?: string[];
  excludeIds?: string[];
  randomSeed?: string | number;
}

export interface HistoryFilter {
  source?: AttemptSource;
  result?: AttemptOutcome;
  mode?: SprintMode;
  since?: string;
  until?: string;
  puzzleId?: string;
  sessionId?: string;
}

export interface AttemptHistoryRow {
  id: string;
  source: AttemptSource;
  sessionId: string;
  puzzleId: string;
  mode: SprintMode;
  ratingKey: string;
  result: AttemptOutcome;
  submittedMove?: string;
  expectedMove: string;
  startedAt: string;
  completedAt: string;
  elapsedMs?: number;
  timingStatus?: AttemptTimingStatus;
  ratingBefore: number;
  ratingAfter?: number;
  arrowDuelCandidateOrder?: string[];
  unclear?: boolean;
  unclearUpdatedAt?: string;
  runId?: string;
  runName?: string;
}
