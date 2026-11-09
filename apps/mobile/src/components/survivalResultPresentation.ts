// Survival result (Issue #609, direction A; Survival contract in
// docs/ui-design/SURVIVAL_CHALLENGE.md). Typed view data for one finished
// Survival Run, the mapper from the session, and the pure presentation that
// turns it into the screen's copy. The score, the best and the end reason come
// from @chessticize/core and storage; this module only formats them.

import type { SprintState } from "../../../../packages/core/src/index.ts";
import type { ResultStat } from "./resultStat.ts";

export type SurvivalResultData = {
  challengeType: "puzzle" | "arrow_duel";
  level: { minRating: number; maxRating: number };
  /** A Survival Run ends only after the third mistake or when the level's pool is cleared. */
  endReason: "max_mistakes" | "pool_cleared";
  score: number;
  mistakeCount: number;
  bestStreak: number;
  activeElapsedMs: number;
  sittings: number;
  isNewBest: boolean;
  /** The best this level had when the Run started; null for a first score. */
  previousBestScore: number | null;
};

export type SurvivalResultPresentation = {
  title: string;
  /** New bests use the product blue; every other result stays neutral. */
  tone: "best" | "neutral";
  outcomeLabel: string;
  scoreLabel: string;
  scoreAccessibilityLabel: string;
  /** 0...1 toward the standing best, only while short of it. */
  progressTowardBest: number | null;
  comparison: string;
  summaryParts: string[];
  endReasonLines: string[];
  levelTitle: string;
  levelDetail: string;
  stats: ResultStat[];
  /** The neutral In Review row, or null when the Run made no mistakes. */
  review: { count: number; detail: string; accessibilityLabel: string } | null;
  replayMistakesLabel: string;
};

const DOT = " · ";

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function levelLabel(level: SurvivalResultData["level"]): string {
  return `${level.minRating}–${level.maxRating}`;
}

function challengeTypeLabel(challengeType: SurvivalResultData["challengeType"]): string {
  return challengeType === "arrow_duel" ? "Arrow Duel" : "Puzzle";
}

/** Active time as m:ss, or h:mm:ss from one hour. */
export function formatActiveTime(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function spokenActiveTime(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = seconds % 60;
  return [
    hours > 0 ? plural(hours, "hour", "hours") : null,
    minutes > 0 ? plural(minutes, "minute", "minutes") : null,
    rest > 0 || seconds === 0 ? plural(rest, "second", "seconds") : null
  ].filter((part): part is string => part !== null).join(" ");
}

/** Builds the view data from a finished Survival session (production wiring). */
export function survivalResultDataFromSession(input: {
  state: SprintState;
  challengeType: SurvivalResultData["challengeType"];
  level: SurvivalResultData["level"];
  result: {
    activeElapsedMs: number;
    endReason?: SurvivalResultData["endReason"];
    isNewBest: boolean;
    previousBestScore: number | null;
    sittings: number;
  };
}): SurvivalResultData {
  return {
    challengeType: input.challengeType,
    level: { minRating: input.level.minRating, maxRating: input.level.maxRating },
    endReason: input.result.endReason ?? "max_mistakes",
    score: input.state.correctCount,
    mistakeCount: input.state.mistakeCount,
    bestStreak: input.state.bestStreak,
    activeElapsedMs: input.result.activeElapsedMs,
    sittings: input.result.sittings,
    isNewBest: input.result.isNewBest,
    previousBestScore: input.result.previousBestScore
  };
}

export function presentSurvivalResult(data: SurvivalResultData): SurvivalResultPresentation {
  const isPerfectClear = data.endReason === "pool_cleared";
  const level = levelLabel(data.level);
  const typeLabel = challengeTypeLabel(data.challengeType);
  const scoreLabel = data.score.toLocaleString("en-US");
  const attempts = data.score + data.mistakeCount;
  const accuracy = Math.round((data.score / Math.max(1, attempts)) * 100);
  const activeTime = formatActiveTime(data.activeElapsedMs);
  const previousBest = data.previousBestScore;
  const comparison = previousBest === null
    ? "First score at this level"
    : data.isNewBest
      ? `Previous best ${previousBest.toLocaleString("en-US")}`
      : `${Math.max(0, previousBest - data.score).toLocaleString("en-US")} short of best ${previousBest.toLocaleString("en-US")}`;

  return {
    title: `${typeLabel} Result`,
    tone: data.isNewBest ? "best" : "neutral",
    outcomeLabel: isPerfectClear
      ? `Perfect clear at ${level}`
      : data.isNewBest
        ? `New best at ${level}`
        : "Run complete",
    scoreLabel,
    scoreAccessibilityLabel: `${scoreLabel} solved`,
    // Like the in-Run meter, the bar shows the way to the standing best and
    // gives way once the best is passed.
    progressTowardBest: !data.isNewBest && previousBest !== null && previousBest > 0
      ? Math.min(1, Math.max(0, data.score / previousBest))
      : null,
    comparison,
    summaryParts: [
      `${isPerfectClear ? `All ${scoreLabel}` : scoreLabel} solved`,
      `${activeTime} active`,
      plural(data.sittings, "sitting", "sittings")
    ],
    endReasonLines: isPerfectClear
      ? [
          `You cleared every available ${typeLabel} in this level.`,
          "Loading and selection errors never count as a clear."
        ]
      : [`The Run ended normally after ${plural(data.mistakeCount, "mistake", "mistakes")}.`],
    levelTitle: `${typeLabel}${DOT}${level}`,
    levelDetail: "This level keeps its own best",
    stats: [
      {
        key: "accuracy",
        label: "Accuracy",
        value: `${accuracy}%`,
        valueTone: "primary",
        accessibilityLabel: `Accuracy ${accuracy} percent`
      },
      {
        key: "time",
        label: "Active time",
        value: activeTime,
        valueTone: "primary",
        accessibilityLabel: `Active time ${spokenActiveTime(data.activeElapsedMs)}`
      },
      {
        key: "streak",
        label: "Best streak",
        value: data.bestStreak.toLocaleString("en-US"),
        valueTone: "primary",
        accessibilityLabel: `Best streak ${data.bestStreak}`
      }
    ],
    review: data.mistakeCount > 0
      ? {
          count: data.mistakeCount,
          detail: `${plural(data.mistakeCount, "mistake", "mistakes")}${DOT}Included in replay`,
          accessibilityLabel: `In Review, ${plural(data.mistakeCount, "mistake", "mistakes")}, included in replay`
        }
      : null,
    replayMistakesLabel: `Replay ${plural(data.mistakeCount, "mistake", "mistakes")}`
  };
}
