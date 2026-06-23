import type { AttemptResult, SprintMode } from "../../core/src/index.ts";

export interface PuzzleSelectionFilter {
  mode: SprintMode;
  limit: number;
  rating?: number;
  minRating?: number;
  maxRating?: number;
  theme?: string;
  excludeIds?: string[];
  randomSeed?: string | number;
}

export interface HistoryFilter {
  result?: AttemptResult;
  mode?: SprintMode;
  since?: string;
  puzzleId?: string;
  sessionId?: string;
}

export interface AttemptHistoryRow {
  id: string;
  sessionId: string;
  puzzleId: string;
  mode: SprintMode;
  result: AttemptResult;
  submittedMove: string;
  expectedMove: string;
  startedAt: string;
  completedAt: string;
  ratingBefore: number;
  ratingAfter?: number;
}
