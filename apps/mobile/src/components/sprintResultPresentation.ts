// Sprint Result (Issue #609, direction A; approved spec in PR #650). Typed view
// data for one finished Sprint or Focused Run, the mapper from the session
// state, and the pure presentation that turns it into the screen's copy.
// Business rules (scoring, the Replay set, the mistakes within it) stay in
// @chessticize/core; this module only formats what they produce.

import {
  isAttemptMarkedUnclear,
  selectMistakeReplayItems,
  type SessionReplayItem,
  type SprintEndReason,
  type SprintResultSummary,
  type SprintState
} from "../../../../packages/core/src/index.ts";
import type { ResultStat } from "./resultStat.ts";

/** "ended": the puzzle supply ran out before the Sprint could pass or fail. */
export type SprintResultOutcome = "passed" | "failed" | "abandoned" | "ended" | "completed";

export type SprintResultData = {
  /** A rated Sprint, or an unrated Focused Run (#616). */
  kind: "sprint" | "focusedRun";
  /** Run mode for the outcome line: Standard and custom Runs say Sprint. */
  mode: "standard" | "arrowDuel";
  outcome: SprintResultOutcome;
  endReason?: SprintEndReason;
  solved: number;
  /** Sprint pass target, or a Focused Run's planned puzzle count. */
  target: number;
  attempted: number;
  accuracyPercent: number;
  ratingBefore: number;
  /** Omitted for an unrated Focused Run. */
  ratingAfter?: number;
  elapsedSeconds: number;
  bestStreak: number;
  /** Mistakes this run made (wrong and timed-out attempts). */
  mistakeCount: number;
  /** Focused Run pace (#616): this Run's average against the usual pace on its themes. */
  pace?: { averageSolveSeconds?: number; usualSolveSeconds?: number };
  review: {
    /** Everything Replay opens: the Unclear and In Review union, each attempt once. */
    count: number;
    /** Unclear attempts by source, as the explanation lists them. */
    unclear: { markedByYou: number; afterSlow: number; afterTimedOut: number };
    inReviewCount: number;
    /** Attempts that are both Unclear and In Review. */
    overlapCount: number;
  };
  /** Mistakes within the Replay set, offered as "Replay N mistakes". */
  mistakeReplayCount: number;
  /** The existing post-Sprint question about the final attempt. */
  unclearPrompt?: { question: string; marked: boolean };
};

export type StatColumn = ResultStat & {
  key: "rating" | "time" | "streak" | "pace";
};

export type SprintResultPresentation = {
  title: string;
  showTrendAction: boolean;
  outcomeLabel: string;
  /** The outcome in parts that stack at large text sizes. */
  outcomeParts: string[];
  outcomeTone: "positive" | "negative" | "neutral";
  outcomeIcon: "check" | "close" | "remove";
  solvedLabel: string;
  targetLabel: string;
  scoreAccessibilityLabel: string;
  /** 0...1 toward the pass target or planned count. */
  progress: number;
  summaryParts: string[];
  summaryLine: string;
  stats: StatColumn[];
  review: {
    count: number;
    title: string;
    explanation: string[];
    replayAccessibilityLabel: string;
  } | null;
  primaryActionLabel: string;
  /** "Replay N mistakes", or null when the run had none to replay. */
  replayMistakesLabel: string | null;
};

const MINUS = "−";
const ARROW = "→";
const DOT = " · ";

export function signedNumber(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return value < 0 ? `${MINUS}${Math.abs(value)}` : "0";
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function spokenDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return [
    minutes > 0 ? plural(minutes, "minute", "minutes") : null,
    rest > 0 || minutes === 0 ? plural(rest, "second", "seconds") : null
  ].filter((part): part is string => part !== null).join(" ");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function solveSeconds(seconds: number | undefined): string {
  return seconds === undefined ? "—" : `${Math.round(seconds)}s`;
}

/** Builds the view data from a finished session (production wiring). */
export function sprintResultDataFromSession(input: {
  state: SprintState;
  elapsedMs: number;
  replayItems: readonly SessionReplayItem[];
  resultSummary?: SprintResultSummary;
  /** Design-preview Unclear counts when no stored summary exists. */
  unclearSummary?: {
    slowMarkedCount: number;
    timedOutMarkedCount?: number;
    userMarkedCount: number;
  };
  averageSolveSeconds?: number;
  usualSolveSeconds?: number;
  unclearPrompt?: { question: string; marked: boolean } | null;
  /** Design previews count a marked prompt that fixture Replay items cannot reflect. */
  includePromptInCounts?: boolean;
}): SprintResultData {
  const { state } = input;
  const isFocusedRun = state.config.tacticalFocus !== undefined;
  const attempted = input.resultSummary?.attemptCount ?? state.correctCount + state.mistakeCount;
  const promptMarked = input.includePromptInCounts && input.unclearPrompt?.marked ? 1 : 0;
  const unclearCounts = input.resultSummary?.unclear ?? input.unclearSummary;
  const outcome: SprintResultOutcome = state.endReason === "abandoned"
    ? "abandoned"
    : state.endReason === "puzzles_exhausted"
      ? "ended"
      : isFocusedRun
      ? "completed"
      : state.status === "won" ? "passed" : "failed";
  return {
    kind: isFocusedRun ? "focusedRun" : "sprint",
    mode: state.config.mode === "arrow_duel" ? "arrowDuel" : "standard",
    outcome,
    ...(state.endReason === undefined ? {} : { endReason: state.endReason }),
    solved: state.correctCount,
    target: isFocusedRun
      ? state.config.maxAttempts ?? state.config.targetCorrect
      : state.config.targetCorrect,
    attempted,
    accuracyPercent: input.resultSummary?.accuracyPercent
      ?? Math.round((state.correctCount / Math.max(1, attempted)) * 100),
    ratingBefore: state.ratingBefore,
    ...(isFocusedRun ? {} : { ratingAfter: state.ratingAfter ?? state.ratingBefore }),
    elapsedSeconds: Math.floor(input.elapsedMs / 1000),
    bestStreak: state.bestStreak,
    mistakeCount: state.mistakeCount,
    ...(isFocusedRun
      ? {
          pace: {
            ...(input.averageSolveSeconds === undefined ? {} : { averageSolveSeconds: input.averageSolveSeconds }),
            ...(input.usualSolveSeconds === undefined ? {} : { usualSolveSeconds: input.usualSolveSeconds })
          }
        }
      : {}),
    review: {
      count: input.replayItems.length + promptMarked,
      unclear: {
        markedByYou: (unclearCounts?.userMarkedCount ?? 0) + promptMarked,
        afterSlow: unclearCounts?.slowMarkedCount ?? 0,
        afterTimedOut: unclearCounts?.timedOutMarkedCount ?? 0
      },
      inReviewCount: input.replayItems.filter((item) => item.inReview).length,
      overlapCount: input.replayItems.filter(
        (item) => item.inReview && isAttemptMarkedUnclear(item.attempt)
      ).length
    },
    mistakeReplayCount: selectMistakeReplayItems(input.replayItems).length,
    ...(input.unclearPrompt
      ? { unclearPrompt: { question: input.unclearPrompt.question, marked: input.unclearPrompt.marked } }
      : {})
  };
}

function outcomePartsFor(data: SprintResultData): string[] {
  if (data.kind === "focusedRun") {
    return [data.outcome === "abandoned" ? "Focused Run ended" : "Focused Run complete"];
  }
  const subject = data.mode === "arrowDuel" ? "Arrow Duel" : "Sprint";
  if (data.outcome === "abandoned") {
    return [`${subject} abandoned`];
  }
  if (data.outcome === "ended") {
    return [`${subject} ended`, "No more puzzles"];
  }
  if (data.outcome === "passed") {
    return [`${subject} passed`];
  }
  switch (data.endReason) {
    case "max_mistakes":
      return [`${subject} failed`, plural(data.mistakeCount, "mistake", "mistakes")];
    case "time_expired":
      return [`${subject} failed`, "Time ran out"];
    default:
      return [`${subject} failed`];
  }
}

export function unclearTotal(review: SprintResultData["review"]): number {
  return review.unclear.markedByYou + review.unclear.afterSlow + review.unclear.afterTimedOut;
}

/**
 * The explanation behind the review row's info button: the Unclear and In
 * Review union, the Unclear sources, and that Replay leaves Review scheduling
 * alone (owner-approved wording, keeping the Unclear and In Review terms).
 */
export function reviewExplanation(review: SprintResultData["review"]): string[] {
  const unclear = unclearTotal(review);
  const groups = [
    unclear > 0 ? `${unclear} Unclear` : null,
    review.inReviewCount > 0 ? `${review.inReviewCount} In Review` : null
  ].filter((part): part is string => part !== null).join(" and ");
  const sources = [
    review.unclear.markedByYou > 0 ? `${review.unclear.markedByYou} marked by you` : null,
    review.unclear.afterSlow > 0 ? `${review.unclear.afterSlow} marked after Slow` : null,
    review.unclear.afterTimedOut > 0 ? `${review.unclear.afterTimedOut} marked after Timed out` : null
  ].filter((part): part is string => part !== null);
  return [
    `${plural(review.count, "puzzle", "puzzles")} to look at again${groups ? `: ${groups}` : ""}${
      review.overlapCount > 0 ? ` (${review.overlapCount} ${review.overlapCount === 1 ? "is" : "are"} both)` : ""
    }.`,
    sources.length > 0
      ? `Unclear: ${sources.join(", ")}. Unclear does not change your Sprint result.`
      : null,
    "Replaying them does not change when they come back in Review."
  ].filter((line): line is string => line !== null);
}

export function presentSprintResult(data: SprintResultData): SprintResultPresentation {
  const isFocusedRun = data.kind === "focusedRun";
  const outcomeTone = data.outcome === "passed" || data.outcome === "completed"
    ? "positive"
    : data.outcome === "failed" ? "negative" : "neutral";
  const outcomeParts = outcomePartsFor(data);

  const ratingAfter = data.ratingAfter ?? data.ratingBefore;
  const delta = ratingAfter - data.ratingBefore;
  const ratingColumn: StatColumn = data.ratingAfter === undefined
    ? {
        key: "rating",
        label: "Rating",
        value: "Unrated",
        valueTone: "primary",
        valueIsWord: true,
        detail: `${data.ratingBefore} unchanged`,
        accessibilityLabel: `Rating unrated, ${data.ratingBefore} unchanged`
      }
    : {
        key: "rating",
        label: "Rating",
        value: signedNumber(delta),
        valueTone: delta < 0 ? "negative" : delta > 0 ? "positive" : "primary",
        // No-break spaces keep the range on one line instead of breaking at the arrow.
        detail: `${data.ratingBefore} ${ARROW} ${ratingAfter}`,
        accessibilityLabel: `Rating ${
          delta < 0 ? `minus ${-delta}` : delta > 0 ? `plus ${delta}` : "unchanged"
        }, from ${data.ratingBefore} to ${ratingAfter}`
      };
  const timeColumn: StatColumn = {
    key: "time",
    label: "Time",
    value: formatClock(data.elapsedSeconds),
    valueTone: "primary",
    accessibilityLabel: `Time ${spokenDuration(data.elapsedSeconds)}`
  };
  const average = data.pace?.averageSolveSeconds;
  const usual = data.pace?.usualSolveSeconds;
  const thirdColumn: StatColumn = data.pace
    ? {
        key: "pace",
        label: "Avg solve",
        value: solveSeconds(average),
        valueTone: "primary",
        ...(usual === undefined ? {} : { detail: `Usually ${solveSeconds(usual)}` }),
        accessibilityLabel: average === undefined
          ? "Average solve time unavailable"
          : `Average solve ${Math.round(average)} seconds${
              usual === undefined ? "" : `, usually ${Math.round(usual)} seconds on these themes`
            }`
      }
    : {
        key: "streak",
        label: "Best streak",
        value: String(data.bestStreak),
        valueTone: "primary",
        accessibilityLabel: `Best streak ${data.bestStreak}`
      };
  const summaryParts = [`${data.attempted} attempted`, `${data.accuracyPercent}% accuracy`];

  return {
    title: isFocusedRun ? "Focused Run Result" : "Sprint Result",
    showTrendAction: !isFocusedRun,
    outcomeLabel: outcomeParts.join(DOT),
    outcomeParts,
    outcomeTone,
    outcomeIcon: outcomeTone === "positive" ? "check" : outcomeTone === "negative" ? "close" : "remove",
    solvedLabel: String(data.solved),
    targetLabel: String(data.target),
    scoreAccessibilityLabel: isFocusedRun
      ? `Solved ${data.solved} of ${data.target} planned puzzles`
      : `Solved ${data.solved} of ${data.target} to pass`,
    progress: data.target > 0 ? Math.min(1, Math.max(0, data.solved / data.target)) : 0,
    summaryParts,
    summaryLine: summaryParts.join(DOT),
    stats: [ratingColumn, timeColumn, thirdColumn],
    review: data.review.count > 0
      ? {
          count: data.review.count,
          title: `${data.review.count} to review`,
          explanation: reviewExplanation(data.review),
          replayAccessibilityLabel: `Replay ${plural(data.review.count, "attempt", "attempts")} to review`
        }
      : null,
    primaryActionLabel: isFocusedRun ? "Back to Practice" : "Play again",
    replayMistakesLabel: data.mistakeReplayCount > 0
      ? `Replay ${plural(data.mistakeReplayCount, "mistake", "mistakes")}`
      : null
  };
}
