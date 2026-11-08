// Issue #609 Sprint Result redesign prototype (design only, not wired into the
// app). Typed view data for one finished Sprint or Focused Run, and the pure
// presentation that turns it into the copy the redesigned screen shows. The
// production SprintSummary in apps/mobile/src/components/PracticePocScreen.tsx
// is unchanged; this module documents what the redesign would read from it.

export type SprintResultOutcome = "passed" | "failed" | "abandoned" | "completed";

export type SprintResultEndReason =
  | "target_reached"
  | "max_mistakes"
  | "time_expired"
  | "abandoned"
  | "attempt_limit";

export type SprintResultPrototypeData = {
  /** A rated Sprint, or an unrated Focused Run (#616). */
  kind: "sprint" | "focusedRun";
  /** Run mode label for the outcome line: Standard and custom Runs say Sprint. */
  mode: "standard" | "arrowDuel";
  outcome: SprintResultOutcome;
  endReason: SprintResultEndReason;
  solved: number;
  /** Sprint pass target, or a Focused Run's planned puzzle count. */
  target: number;
  attempted: number;
  accuracyPercent: number;
  ratingBefore: number;
  /** Omitted for an unrated Focused Run. */
  ratingAfter?: number;
  elapsedSeconds: number;
  /** Sprint time limit; omitted for an untimed Focused Run (#616). */
  limitSeconds?: number;
  bestStreak: number;
  /** Focused Run pace (#616): this Run's average against the usual pace on its themes. */
  pace?: { averageSolveSeconds: number; usualSolveSeconds?: number };
  mistakeCount: number;
  review: {
    /** Unclear attempts by source, as the current result screen lists them. */
    unclear: { markedByYou: number; afterSlow: number; afterTimedOut: number };
    inReviewCount: number;
    /** Attempts that are both Unclear and In Review; Replay lists them once. */
    overlapCount: number;
  };
  /** The existing post-Sprint question about a neutral Incomplete final puzzle. */
  unclearPrompt?: { question: string };
};

export type ZeroReviewVariant = "hidden" | "line";

export type StatColumn = {
  key: "rating" | "time" | "streak" | "pace";
  label: string;
  value: string;
  valueTone: "primary" | "positive" | "negative";
  detail?: string;
  /** A word rather than a number (Unrated), drawn smaller so it fits one line. */
  valueIsWord?: boolean;
  accessibilityLabel: string;
};

export type SprintResultPresentation = {
  title: string;
  showTrendAction: boolean;
  outcomeLabel: string;
  /** The outcome in parts that may stack at large text sizes. */
  outcomeParts: string[];
  outcomeTone: "positive" | "negative" | "neutral";
  outcomeIcon: "check" | "close" | "remove";
  scoreLabel: string;
  scoreAccessibilityLabel: string;
  /** 0...1 toward the pass target or planned count. */
  progress: number;
  summaryLine: string;
  stats: StatColumn[];
  review: {
    count: number;
    title: string;
    explanation: string[];
    replayAccessibilityLabel: string;
  } | null;
  primaryActionLabel: string;
  showReplayMistakes: boolean;
  replayMistakesAccessibilityLabel: string;
};

const MINUS = "−";
const ARROW = "→";

export function signedNumber(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return value < 0 ? `${MINUS}${Math.abs(value)}` : "0";
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function spokenDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [
    minutes > 0 ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : null,
    rest > 0 || minutes === 0 ? `${rest} ${rest === 1 ? "second" : "seconds"}` : null
  ].filter((part): part is string => part !== null);
  return parts.join(" ");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The outcome, split where it may break onto two lines (never at the separator). */
function outcomePartsFor(data: SprintResultPrototypeData): string[] {
  if (data.kind === "focusedRun") {
    return [data.outcome === "abandoned" ? "Focused Run ended" : "Focused Run complete"];
  }
  const subject = data.mode === "arrowDuel" ? "Arrow Duel" : "Sprint";
  switch (data.endReason) {
    case "target_reached":
      return [`${subject} passed`];
    case "max_mistakes":
      return [`${subject} failed`, plural(data.mistakeCount, "mistake", "mistakes")];
    case "time_expired":
      return [`${subject} failed`, "Time ran out"];
    case "abandoned":
      return [`${subject} abandoned`];
    default:
      return [`${subject} complete`];
  }
}

export function unclearCount(review: SprintResultPrototypeData["review"]): number {
  return review.unclear.markedByYou + review.unclear.afterSlow + review.unclear.afterTimedOut;
}

/**
 * The explanation behind the review row's info button. It keeps the facts of
 * the current screen's note (the Unclear and In Review union, the Unclear
 * sources, and that Replay leaves Review scheduling alone) in plainer words.
 */
export function reviewExplanation(review: SprintResultPrototypeData["review"]): string[] {
  const unclear = unclearCount(review);
  const total = unclear + review.inReviewCount - review.overlapCount;
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
    `${plural(total, "puzzle", "puzzles")} to look at again: ${groups}${
      review.overlapCount > 0 ? ` (${review.overlapCount} ${review.overlapCount === 1 ? "is" : "are"} both)` : ""
    }.`,
    sources.length > 0
      ? `Unclear: ${sources.join(", ")}. Unclear does not change your Sprint result.`
      : null,
    "Replaying them does not change when they come back in Review."
  ].filter((line): line is string => line !== null);
}

export function presentSprintResult(
  data: SprintResultPrototypeData,
  options: { markedUnclear?: boolean } = {}
): SprintResultPresentation {
  const isFocusedRun = data.kind === "focusedRun";
  const extraUnclear = options.markedUnclear ? 1 : 0;
  const review = {
    ...data.review,
    unclear: { ...data.review.unclear, markedByYou: data.review.unclear.markedByYou + extraUnclear }
  };
  const reviewCount = unclearCount(review) + review.inReviewCount - review.overlapCount;
  const outcomeTone = data.outcome === "passed" || data.outcome === "completed"
    ? "positive"
    : data.outcome === "failed" ? "negative" : "neutral";

  const ratingAfter = data.ratingAfter ?? data.ratingBefore;
  const delta = ratingAfter - data.ratingBefore;
  const ratingColumn: StatColumn = data.ratingAfter === undefined
    ? {
        key: "rating",
        label: "Rating",
        value: "Unrated",
        valueIsWord: true,
        valueTone: "primary",
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
  const thirdColumn: StatColumn = data.pace
    ? {
        key: "pace",
        label: "Avg solve",
        value: `${data.pace.averageSolveSeconds}s`,
        valueTone: "primary",
        detail: data.pace.usualSolveSeconds === undefined
          ? undefined
          : `Usually ${data.pace.usualSolveSeconds}s`,
        accessibilityLabel: `Average solve ${data.pace.averageSolveSeconds} seconds${
          data.pace.usualSolveSeconds === undefined
            ? ""
            : `, usually ${data.pace.usualSolveSeconds} seconds on these themes`
        }`
      }
    : {
        key: "streak",
        label: "Best streak",
        value: String(data.bestStreak),
        valueTone: "primary",
        accessibilityLabel: `Best streak ${data.bestStreak}`
      };

  return {
    title: isFocusedRun ? "Focused Run Result" : "Sprint Result",
    showTrendAction: !isFocusedRun,
    outcomeLabel: outcomePartsFor(data).join(" \u00b7 "),
    outcomeParts: outcomePartsFor(data),
    outcomeTone,
    outcomeIcon: outcomeTone === "positive" ? "check" : outcomeTone === "negative" ? "close" : "remove",
    scoreLabel: `${data.solved} / ${data.target}`,
    scoreAccessibilityLabel: isFocusedRun
      ? `Solved ${data.solved} of ${data.target} planned puzzles`
      : `Solved ${data.solved} of ${data.target} to pass`,
    progress: data.target > 0 ? Math.min(1, Math.max(0, data.solved / data.target)) : 0,
    summaryLine: `${data.attempted} attempted · ${data.accuracyPercent}% accuracy`,
    stats: [ratingColumn, timeColumn, thirdColumn],
    review: reviewCount > 0
      ? {
          count: reviewCount,
          title: `${reviewCount} to review`,
          explanation: reviewExplanation(review),
          replayAccessibilityLabel: `Replay ${plural(reviewCount, "attempt", "attempts")} to review`
        }
      : null,
    primaryActionLabel: isFocusedRun ? "Back to Practice" : "Play again",
    showReplayMistakes: data.mistakeCount > 0,
    replayMistakesAccessibilityLabel: `Replay only the ${plural(data.mistakeCount, "mistake", "mistakes")}`
  };
}
