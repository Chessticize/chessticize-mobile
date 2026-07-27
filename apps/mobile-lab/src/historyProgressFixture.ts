import type {
  HistoryProgressPresentation,
  HistoryStrengthSeries
} from "../../mobile/src/components/HistoryProgressSection.tsx";
import type { LabScenarioId } from "./scenarioRegistry.ts";

export type HistoryProgressScenarioId =
  | "history-progress"
  | "history-progress-weakness"
  | "history-progress-speed-weakness";

const FORK_RELIABILITY_PROGRESS: HistoryStrengthSeries = {
  id: "forks",
  label: "Forks",
  kind: "solve_rate",
  metricLabel:
    "Extra misses per 100 comparable puzzles · lower is better",
  baselineLabel: "0 = matched solve expectation",
  scaleMax: 20,
  changeLabel: "13 fewer / 100",
  changeTone: "improved",
  summary:
    "The Fork reliability gap has narrowed from 16 extra misses per 100 comparable puzzles to 3. The model matches puzzle difficulty, your Rating, and task family before estimating the gap.",
  points: [
    { label: "May 24", value: 16, valueLabel: "+16", sampleSize: 22 },
    { label: "Jun 7", value: 14, valueLabel: "+14", sampleSize: 31 },
    { label: "Jun 21", value: 11, valueLabel: "+11", sampleSize: 41 },
    { label: "Jul 5", value: 8, valueLabel: "+8", sampleSize: 52 },
    { label: "Jul 19", value: 5, valueLabel: "+5", sampleSize: 63 },
    { label: "Jul 26", value: 3, valueLabel: "+3", sampleSize: 71 }
  ]
};

const PIN_SPEED_PROGRESS: HistoryStrengthSeries = {
  id: "pins",
  label: "Pins",
  kind: "completed_speed",
  metricLabel:
    "Completed time above matched expectation · lower is better",
  baselineLabel: "1.00× = matched completed-puzzle time",
  scaleMax: 35,
  changeLabel: "24% less overhead",
  changeTone: "improved",
  summary:
    "Correctly completed Pin puzzles now take about 1.06× the matched expectation, down from 1.30×. Wrong moves and timeouts are excluded from this speed estimate.",
  points: [
    { label: "May 24", value: 30, valueLabel: "1.30×", sampleSize: 18 },
    { label: "Jun 7", value: 27, valueLabel: "1.27×", sampleSize: 25 },
    { label: "Jun 21", value: 22, valueLabel: "1.22×", sampleSize: 33 },
    { label: "Jul 5", value: 17, valueLabel: "1.17×", sampleSize: 42 },
    { label: "Jul 19", value: 11, valueLabel: "1.11×", sampleSize: 50 },
    { label: "Jul 26", value: 6, valueLabel: "1.06×", sampleSize: 57 }
  ]
};

const SKEWER_RELIABILITY_WEAKNESS: HistoryStrengthSeries = {
  id: "skewers",
  label: "Skewers",
  kind: "solve_rate",
  metricLabel:
    "Extra misses per 100 comparable puzzles · lower is better",
  baselineLabel: "0 = matched solve expectation",
  scaleMax: 24,
  changeLabel: "Gap remains +14",
  changeTone: "steady",
  summary:
    "Skewer reliability has improved slightly, but the current model estimate still shows 14 extra misses per 100 comparable puzzles.",
  points: [
    { label: "May 24", value: 20, valueLabel: "+20", sampleSize: 12 },
    { label: "Jun 7", value: 19, valueLabel: "+19", sampleSize: 16 },
    { label: "Jun 21", value: 18, valueLabel: "+18", sampleSize: 19 },
    { label: "Jul 5", value: 17, valueLabel: "+17", sampleSize: 22 },
    { label: "Jul 19", value: 15, valueLabel: "+15", sampleSize: 25 },
    { label: "Jul 26", value: 14, valueLabel: "+14", sampleSize: 26 }
  ]
};

const PIN_SPEED_WEAKNESS: HistoryStrengthSeries = {
  id: "pins",
  label: "Pins",
  kind: "completed_speed",
  metricLabel:
    "Completed time above matched expectation · lower is better",
  baselineLabel: "1.00× = matched completed-puzzle time",
  scaleMax: 40,
  changeLabel: "15% more overhead",
  changeTone: "worsened",
  summary:
    "Reliable, correctly completed Pin puzzles now take about 1.34× the matched expectation. The repeated completed-time gap is the weakness; a Slow label by itself is not.",
  points: [
    { label: "May 24", value: 19, valueLabel: "1.19×", sampleSize: 13 },
    { label: "Jun 7", value: 20, valueLabel: "1.20×", sampleSize: 17 },
    { label: "Jun 21", value: 23, valueLabel: "1.23×", sampleSize: 20 },
    { label: "Jul 5", value: 26, valueLabel: "1.26×", sampleSize: 23 },
    { label: "Jul 19", value: 31, valueLabel: "1.31×", sampleSize: 25 },
    { label: "Jul 26", value: 34, valueLabel: "1.34×", sampleSize: 26 }
  ]
};

const BASE_PRESENTATION: Omit<
  HistoryProgressPresentation,
  "initialSeriesId" | "strengths"
> = {
  assurance: "provisional",
  periodLabel: "Last 8 weeks",
  sampleLabel: "ordinary mixed Runs",
  noWeaknessLabel:
    "No theme currently passes the evidence, practical-impact, and diversity checks for either solve reliability or completed-puzzle speed."
};

export function isHistoryProgressScenario(
  scenarioId: LabScenarioId
): scenarioId is HistoryProgressScenarioId {
  return scenarioId === "history-progress"
    || scenarioId === "history-progress-weakness"
    || scenarioId === "history-progress-speed-weakness";
}

export function historyProgressPresentationFor(
  scenarioId: HistoryProgressScenarioId
): HistoryProgressPresentation {
  if (scenarioId === "history-progress") {
    return {
      ...BASE_PRESENTATION,
      initialSeriesId: "forks",
      strengths: [FORK_RELIABILITY_PROGRESS, PIN_SPEED_PROGRESS]
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
              "Completed Pin puzzles take about 34% longer than the matched model expectation after accounting for difficulty, pace, timing policy, and decision count."
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
            "Skewers are completed less reliably than the model expects after matching puzzle difficulty, your Rating, and task family."
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
