import type { AttemptResult, AttemptSource, SprintMode } from "../../core/src/index.ts";

export interface PuzzleSelectionFilter {
  mode: SprintMode;
  limit: number;
  rating?: number;
  minRating?: number;
  maxRating?: number;
  themes?: string[];
  includeIds?: string[];
  excludeIds?: string[];
  randomSeed?: string | number;
}

export interface HistoryFilter {
  source?: AttemptSource;
  result?: AttemptResult;
  mode?: SprintMode;
  since?: string;
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
  result: AttemptResult;
  submittedMove: string;
  expectedMove: string;
  startedAt: string;
  completedAt: string;
  ratingBefore: number;
  ratingAfter?: number;
  arrowDuelCandidateOrder?: string[];
  unclear?: boolean;
  unclearUpdatedAt?: string;
}
