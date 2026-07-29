import type {
  HistoryProgressPresentation,
  HistoryStrengthSeries
} from "../../mobile/src/components/historyProgressPresentation.ts";
import type { LabScenarioId } from "./scenarioRegistry.ts";

export type HistoryProgressScenarioId =
  | "history-populated"
  | "history-progress"
  | "history-progress-weakness"
  | "history-progress-speed-weakness";

const FORK_RELIABILITY_PROGRESS: HistoryStrengthSeries = {
  id: "forks",
  themeId: "forks",
  label: "Forks",
  kind: "solve_rate",
  metricLabel: "Accuracy · higher is better",
  baselineLabel: "Eligible ordinary mixed Runs",
  scaleMax: 100,
  changeLabel: "16 points higher",
  changeTone: "improved",
  summary: "Wrong moves and timeouts count as misses.",
  points: [
    { label: "May 24", value: 78, valueLabel: "78%", sampleSize: 22 },
    { label: "Jun 7", value: 81, valueLabel: "81%", sampleSize: 31 },
    { label: "Jun 21", value: 84, valueLabel: "84%", sampleSize: 41 },
    { label: "Jul 5", value: 87, valueLabel: "87%", sampleSize: 52 },
    { label: "Jul 19", value: 91, valueLabel: "91%", sampleSize: 63 },
    { label: "Jul 26", value: 94, valueLabel: "94%", sampleSize: 71 }
  ]
};

const FORK_SPEED_PROGRESS: HistoryStrengthSeries = {
  id: "forks-speed",
  themeId: "forks",
  label: "Forks",
  kind: "completed_speed",
  metricLabel: "Solve time · lower is better",
  baselineLabel: "1.00× = provisional 30-second baseline",
  scaleMax: 140,
  changeLabel: "9% less time",
  changeTone: "improved",
  summary:
    "Only correct, before-timeout solves with reliable timing are included.",
  points: [
    { label: "May 24", value: 118, valueLabel: "1.18×", sampleSize: 18 },
    { label: "Jun 7", value: 117, valueLabel: "1.17×", sampleSize: 25 },
    { label: "Jun 21", value: 115, valueLabel: "1.15×", sampleSize: 33 },
    { label: "Jul 5", value: 113, valueLabel: "1.13×", sampleSize: 42 },
    { label: "Jul 19", value: 111, valueLabel: "1.11×", sampleSize: 50 },
    { label: "Jul 26", value: 109, valueLabel: "1.09×", sampleSize: 57 }
  ]
};

const PIN_SPEED_PROGRESS: HistoryStrengthSeries = {
  id: "pins",
  themeId: "pins",
  label: "Pins",
  kind: "completed_speed",
  metricLabel: "Solve time · lower is better",
  baselineLabel: "1.00× = provisional 30-second baseline",
  scaleMax: 140,
  changeLabel: "24% less time",
  changeTone: "improved",
  summary:
    "Only correct, before-timeout solves with reliable timing are included.",
  points: [
    { label: "May 24", value: 130, valueLabel: "1.30×", sampleSize: 18 },
    { label: "Jun 7", value: 127, valueLabel: "1.27×", sampleSize: 25 },
    { label: "Jun 21", value: 122, valueLabel: "1.22×", sampleSize: 33 },
    { label: "Jul 5", value: 117, valueLabel: "1.17×", sampleSize: 42 },
    { label: "Jul 19", value: 111, valueLabel: "1.11×", sampleSize: 50 },
    { label: "Jul 26", value: 106, valueLabel: "1.06×", sampleSize: 57 }
  ]
};

const SKEWER_RELIABILITY_WEAKNESS: HistoryStrengthSeries = {
  id: "skewers",
  themeId: "skewers",
  label: "Skewers",
  kind: "solve_rate",
  metricLabel: "Accuracy · higher is better",
  baselineLabel: "Eligible ordinary mixed Runs",
  scaleMax: 100,
  changeLabel: "7 points higher",
  changeTone: "improved",
  summary: "Wrong moves and timeouts count as misses.",
  points: [
    { label: "May 24", value: 72, valueLabel: "72%", sampleSize: 12 },
    { label: "Jun 7", value: 73, valueLabel: "73%", sampleSize: 16 },
    { label: "Jun 21", value: 74, valueLabel: "74%", sampleSize: 19 },
    { label: "Jul 5", value: 76, valueLabel: "76%", sampleSize: 22 },
    { label: "Jul 19", value: 77, valueLabel: "77%", sampleSize: 25 },
    { label: "Jul 26", value: 79, valueLabel: "79%", sampleSize: 26 }
  ]
};

const PIN_SPEED_WEAKNESS: HistoryStrengthSeries = {
  id: "pins",
  themeId: "pins",
  label: "Pins",
  kind: "completed_speed",
  metricLabel: "Solve time · lower is better",
  baselineLabel: "1.00× = provisional 30-second baseline",
  scaleMax: 150,
  changeLabel: "15% more time",
  changeTone: "worsened",
  summary:
    "Only correct, before-timeout solves with reliable timing are included.",
  points: [
    { label: "May 24", value: 119, valueLabel: "1.19×", sampleSize: 13 },
    { label: "Jun 7", value: 120, valueLabel: "1.20×", sampleSize: 17 },
    { label: "Jun 21", value: 123, valueLabel: "1.23×", sampleSize: 20 },
    { label: "Jul 5", value: 126, valueLabel: "1.26×", sampleSize: 23 },
    { label: "Jul 19", value: 131, valueLabel: "1.31×", sampleSize: 25 },
    { label: "Jul 26", value: 134, valueLabel: "1.34×", sampleSize: 26 }
  ]
};

const BASE_PRESENTATION: Omit<
  HistoryProgressPresentation,
  "initialSeriesId" | "strengths"
> = {
  assurance: "provisional",
  periodLabel: "Last 8 weeks",
  sampleLabel: "ordinary mixed Runs",
  sampleUnitLabel: "model-weighted observations",
  noWeaknessTone: "balanced",
  noWeaknessTitle: "Recent play looks balanced",
  noWeaknessLabel:
    "No theme currently shows a repeated, meaningful weakness in accuracy or solve time."
};

export function isHistoryProgressScenario(
  scenarioId: LabScenarioId
): scenarioId is HistoryProgressScenarioId {
  return scenarioId === "history-populated"
    || scenarioId === "history-progress"
    || scenarioId === "history-progress-weakness"
    || scenarioId === "history-progress-speed-weakness";
}

export function historyProgressPresentationFor(
  scenarioId: HistoryProgressScenarioId
): HistoryProgressPresentation {
  if (scenarioId === "history-populated" || scenarioId === "history-progress") {
    return {
      ...BASE_PRESENTATION,
      initialSeriesId: "forks",
      strengths: [
        FORK_RELIABILITY_PROGRESS,
        FORK_SPEED_PROGRESS,
        PIN_SPEED_PROGRESS
      ]
    };
  }
  if (scenarioId === "history-progress-speed-weakness") {
    return {
      ...BASE_PRESENTATION,
      initialSeriesId: "pins",
      strengths: [FORK_RELIABILITY_PROGRESS, PIN_SPEED_WEAKNESS],
      weakness: {
        label: "Pins",
        reason: "completed_speed",
        effects: [
          {
            kind: "completed_speed",
            valueLabel: "1.34× expected time",
            metricLabel: "on correctly completed puzzles",
            comparisonLabel:
              "Completed Pin puzzles take about 34% longer than the matched model expectation after accounting for difficulty, pace, timing policy, and decision count. Other well-sampled themes remain closer to their matched expectations."
          }
        ],
        evidenceLabel: "26 different puzzles · 6 sessions",
        explanation:
          "The completed-time effect is repeated, practically meaningful, and supported by enough different puzzles and sessions. One unusually slow solve would not be enough.",
        eligibilityLabel:
          "Only correct, before-timeout attempts with reliable elapsed time enter this speed estimate. Slow and Unclear labels do not decide it; wrong moves and timeouts stay in solve reliability."
      }
    };
  }
  return {
    ...BASE_PRESENTATION,
    initialSeriesId: "skewers",
    strengths: [
      FORK_RELIABILITY_PROGRESS,
      PIN_SPEED_PROGRESS,
      SKEWER_RELIABILITY_WEAKNESS
    ],
    weakness: {
      label: "Skewers",
      reason: "solve_rate",
      effects: [
        {
          kind: "solve_rate",
          valueLabel: "14 extra misses",
          metricLabel: "per 100 comparable puzzles",
          comparisonLabel:
            "Skewers are completed less reliably than the model expects after matching puzzle difficulty, your Rating, and task family. Other well-sampled themes remain closer to their matched solve expectations."
        }
      ],
      evidenceLabel: "26 different puzzles · 6 sessions",
      explanation:
        "The reliability effect passes the evidence, practical-impact, and diversity checks. One isolated miss would remain in Collecting evidence.",
      eligibilityLabel:
        "Correct attempts count once as successes. Wrong moves and timeouts count once as failures. Slow, Unclear, and Review membership do not decide the weakness."
    }
  };
}
