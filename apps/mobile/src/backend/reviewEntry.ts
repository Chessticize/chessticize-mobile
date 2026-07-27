import {
  curatedPuzzleThemes,
  type AttemptEvent,
  type HistoryAttemptView,
  type Puzzle,
  type SprintMode
} from "../../../../packages/core/src/index.ts";

export type ReviewEntry = {
  puzzle: Puzzle;
  mode: SprintMode;
  ratingKey: string;
  source: "session" | "due" | "history";
  curatedThemes: string[];
  attempt?: AttemptEvent | HistoryAttemptView;
  attention?: ReviewAttentionPresentation;
};

export type ReviewAttentionPresentation = {
  unclear: boolean;
  needsReview: boolean;
};

export function buildReviewEntry(
  input: Omit<ReviewEntry, "curatedThemes">
): ReviewEntry {
  return {
    ...input,
    curatedThemes: curatedPuzzleThemes(input.puzzle.themes)
  };
}
