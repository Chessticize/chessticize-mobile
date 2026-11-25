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
  type SprintState,
  type SupportedLocale
} from "../../../../packages/core/src/index.ts";
import { getActiveLocale, translate } from "../i18n/translate.ts";
import type { ResultStat } from "./resultStat.ts";

/** "ended": the puzzle supply ran out before the Sprint could pass or fail. */
export type SprintResultOutcome = "passed" | "failed" | "abandoned" | "ended" | "completed";

export type SprintResultData = {
  /** The finished session, so its outcome haptic plays once per result. */
  sessionId?: string;
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

function spokenDuration(totalSeconds: number, locale: SupportedLocale): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return [
    minutes > 0 ? translate(locale, "common.minutesCount", { count: minutes }) : null,
    rest > 0 || minutes === 0 ? translate(locale, "common.secondsCount", { count: rest }) : null
  ].filter((part): part is string => part !== null).join(" ");
}

function solveSeconds(seconds: number | undefined, locale: SupportedLocale): string {
  return seconds === undefined ? "—" : translate(locale, "common.secondsCompact", { count: Math.round(seconds) });
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
    ...(state.id ? { sessionId: state.id } : {}),
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

function outcomePartsFor(data: SprintResultData, locale: SupportedLocale): string[] {
  if (data.kind === "focusedRun") {
    return [
      data.outcome === "abandoned"
        ? translate(locale, "sprintResult.outcomeFocusedEnded")
        : translate(locale, "sprintResult.outcomeFocusedComplete")
    ];
  }
  const subject = data.mode === "arrowDuel"
    ? translate(locale, "common.arrowDuel")
    : translate(locale, "common.sprint");
  if (data.outcome === "abandoned") {
    return [translate(locale, "sprintResult.outcomeAbandoned", { subject })];
  }
  if (data.outcome === "ended") {
    return [
      translate(locale, "sprintResult.outcomeEnded", { subject }),
      translate(locale, "sprintResult.reasonNoMorePuzzles")
    ];
  }
  if (data.outcome === "passed") {
    return [translate(locale, "sprintResult.outcomePassed", { subject })];
  }
  switch (data.endReason) {
    case "max_mistakes":
      return [
        translate(locale, "sprintResult.outcomeFailed", { subject }),
        translate(locale, "common.mistakesCount", { count: data.mistakeCount })
      ];
    case "time_expired":
      return [
        translate(locale, "sprintResult.outcomeFailed", { subject }),
        translate(locale, "sprintResult.reasonTimeRanOut")
      ];
    default:
      return [translate(locale, "sprintResult.outcomeFailed", { subject })];
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
export function reviewExplanation(
  review: SprintResultData["review"],
  locale: SupportedLocale = getActiveLocale()
): string[] {
  const unclear = unclearTotal(review);
  const groupParts = [
    unclear > 0 ? translate(locale, "sprintResult.explain.unclearCount", { count: unclear }) : null,
    review.inReviewCount > 0 ? translate(locale, "sprintResult.explain.inReviewCount", { count: review.inReviewCount }) : null
  ].filter((part): part is string => part !== null);
  const groups = groupParts.length === 2
    ? translate(locale, "sprintResult.explain.andJoin", { a: groupParts[0]!, b: groupParts[1]! })
    : (groupParts[0] ?? "");
  const sources = [
    review.unclear.markedByYou > 0
      ? translate(locale, "sprintResult.explain.markedByYou", { count: review.unclear.markedByYou })
      : null,
    review.unclear.afterSlow > 0
      ? translate(locale, "sprintResult.explain.markedAfterSlow", { count: review.unclear.afterSlow })
      : null,
    review.unclear.afterTimedOut > 0
      ? translate(locale, "sprintResult.explain.markedAfterTimedOut", { count: review.unclear.afterTimedOut })
      : null
  ].filter((part): part is string => part !== null);
  return [
    translate(locale, "sprintResult.explain.summaryLine", {
      puzzles: translate(locale, "common.puzzlesCount", { count: review.count }),
      groups: groups ? `: ${groups}` : "",
      overlap: review.overlapCount > 0
        ? translate(locale, "sprintResult.explain.bothCount", { count: review.overlapCount })
        : ""
    }),
    sources.length > 0
      ? translate(locale, "sprintResult.explain.sourcesLine", { sources: sources.join(", ") })
      : null,
    translate(locale, "sprintResult.explain.scheduleNote")
  ].filter((line): line is string => line !== null);
}

/**
 * The notification haptic the result plays when it appears (#609): success for
 * a passed Sprint, warning for a failed one. Focused Runs, ended and abandoned
 * Sprints stay silent.
 */
export function sprintResultHapticIntent(data: SprintResultData): "success" | "warning" | null {
  return data.outcome === "passed" ? "success" : data.outcome === "failed" ? "warning" : null;
}

export function presentSprintResult(
  data: SprintResultData,
  locale: SupportedLocale = getActiveLocale()
): SprintResultPresentation {
  const isFocusedRun = data.kind === "focusedRun";
  const outcomeTone = data.outcome === "passed" || data.outcome === "completed"
    ? "positive"
    : data.outcome === "failed" ? "negative" : "neutral";
  const outcomeParts = outcomePartsFor(data, locale);

  const ratingAfter = data.ratingAfter ?? data.ratingBefore;
  const delta = ratingAfter - data.ratingBefore;
  const ratingColumn: StatColumn = data.ratingAfter === undefined
    ? {
        key: "rating",
        label: translate(locale, "common.rating"),
        value: translate(locale, "sprintResult.ratingUnrated"),
        valueTone: "primary",
        valueIsWord: true,
        detail: translate(locale, "sprintResult.ratingUnchangedDetail", { rating: data.ratingBefore }),
        accessibilityLabel: translate(locale, "sprintResult.ratingUnratedA11y", { rating: data.ratingBefore })
      }
    : {
        key: "rating",
        label: translate(locale, "common.rating"),
        value: signedNumber(delta),
        valueTone: delta < 0 ? "negative" : delta > 0 ? "positive" : "primary",
        // No-break spaces keep the range on one line instead of breaking at the arrow.
        detail: `${data.ratingBefore}\u00A0${ARROW}\u00A0${ratingAfter}`,
        accessibilityLabel: translate(locale, "sprintResult.ratingChangeA11y", {
          deltaLabel: delta < 0
            ? translate(locale, "sprintResult.ratingMinusA11y", { delta: -delta })
            : delta > 0
              ? translate(locale, "sprintResult.ratingPlusA11y", { delta })
              : translate(locale, "sprintResult.ratingUnchangedWord"),
          before: data.ratingBefore,
          after: ratingAfter
        })
      };
  const timeColumn: StatColumn = {
    key: "time",
    label: translate(locale, "common.time"),
    value: formatClock(data.elapsedSeconds),
    valueTone: "primary",
    accessibilityLabel: translate(locale, "sprintResult.timeA11y", {
      duration: spokenDuration(data.elapsedSeconds, locale)
    })
  };
  const average = data.pace?.averageSolveSeconds;
  const usual = data.pace?.usualSolveSeconds;
  const thirdColumn: StatColumn = data.pace
    ? {
        key: "pace",
        label: translate(locale, "sprintResult.avgSolveLabel"),
        value: solveSeconds(average, locale),
        valueTone: "primary",
        ...(usual === undefined ? {} : {
          detail: translate(locale, "sprintResult.usuallyDetail", { time: solveSeconds(usual, locale) })
        }),
        accessibilityLabel: average === undefined
          ? translate(locale, "sprintResult.avgSolveUnavailableA11y")
          : usual === undefined
            ? translate(locale, "sprintResult.avgSolveA11y", { seconds: Math.round(average) })
            : translate(locale, "sprintResult.avgSolveWithUsualA11y", {
                seconds: Math.round(average),
                usual: Math.round(usual)
              })
      }
    : {
        key: "streak",
        label: translate(locale, "common.bestStreak"),
        value: String(data.bestStreak),
        valueTone: "primary",
        accessibilityLabel: translate(locale, "sprintResult.bestStreakA11y", { count: data.bestStreak })
      };
  const summaryParts = [
    translate(locale, "sprintResult.attemptedCount", { count: data.attempted }),
    translate(locale, "sprintResult.accuracyPercent", { percent: data.accuracyPercent })
  ];

  return {
    title: isFocusedRun
      ? translate(locale, "sprintResult.titleFocused")
      : translate(locale, "sprintResult.titleSprint"),
    showTrendAction: !isFocusedRun,
    outcomeLabel: outcomeParts.join(DOT),
    outcomeParts,
    outcomeTone,
    outcomeIcon: outcomeTone === "positive" ? "check" : outcomeTone === "negative" ? "close" : "remove",
    solvedLabel: String(data.solved),
    targetLabel: String(data.target),
    scoreAccessibilityLabel: isFocusedRun
      ? translate(locale, "sprintResult.scoreFocusedA11y", { solved: data.solved, target: data.target })
      : translate(locale, "sprintResult.scoreSprintA11y", { solved: data.solved, target: data.target }),
    progress: data.target > 0 ? Math.min(1, Math.max(0, data.solved / data.target)) : 0,
    summaryParts,
    summaryLine: summaryParts.join(DOT),
    stats: [ratingColumn, timeColumn, thirdColumn],
    review: data.review.count > 0
      ? {
          count: data.review.count,
          title: translate(locale, "sprintResult.toReviewTitle", { count: data.review.count }),
          explanation: reviewExplanation(data.review, locale),
          replayAccessibilityLabel: translate(locale, "sprintResult.replayAttemptsA11y", {
            attempts: translate(locale, "common.attemptsCount", { count: data.review.count })
          })
        }
      : null,
    primaryActionLabel: isFocusedRun
      ? translate(locale, "sprintResult.backToPractice")
      : translate(locale, "common.playAgainLower"),
    replayMistakesLabel: data.mistakeReplayCount > 0
      ? translate(locale, "sprintResult.replayMistakes", {
          mistakes: translate(locale, "common.mistakesCount", { count: data.mistakeReplayCount })
        })
      : null
  };
}
