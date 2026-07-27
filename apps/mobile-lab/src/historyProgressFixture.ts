import type { HistoryProgressPresentation } from "../../mobile/src/components/HistoryProgressSection.tsx";
import type { LabScenarioId } from "./scenarioRegistry.ts";

const STRENGTHS: HistoryProgressPresentation["strengths"] = [
  {
    id: "forks",
    label: "Forks",
    metricLabel: "Solve reliability",
    changeLabel: "+20 pts",
    summary:
      "You now solve Fork puzzles more reliably than eight weeks ago. The improvement appears across several mixed Runs, not just one session.",
    points: [
      { label: "May 24", value: 48, sampleSize: 7 },
      { label: "Jun 7", value: 51, sampleSize: 8 },
      { label: "Jun 21", value: 55, sampleSize: 7 },
      { label: "Jul 5", value: 61, sampleSize: 8 },
      { label: "Jul 19", value: 65, sampleSize: 8 },
      { label: "Jul 26", value: 68, sampleSize: 8 }
    ]
  },
  {
    id: "pins",
    label: "Pins",
    metricLabel: "Solve reliability",
    changeLabel: "+5 pts",
    summary:
      "Pin performance is improving gradually and remains one of your more reliable tactical themes.",
    points: [
      { label: "May 24", value: 69, sampleSize: 6 },
      { label: "Jun 7", value: 70, sampleSize: 7 },
      { label: "Jun 21", value: 69, sampleSize: 7 },
      { label: "Jul 5", value: 72, sampleSize: 8 },
      { label: "Jul 19", value: 73, sampleSize: 7 },
      { label: "Jul 26", value: 74, sampleSize: 8 }
    ]
  },
  {
    id: "skewers",
    label: "Skewers",
    metricLabel: "Solve reliability",
    changeLabel: "+2 pts",
    summary:
      "Skewer performance has stayed nearly flat while your other well-sampled themes improved.",
    points: [
      { label: "May 24", value: 44, sampleSize: 5 },
      { label: "Jun 7", value: 45, sampleSize: 5 },
      { label: "Jun 21", value: 43, sampleSize: 4 },
      { label: "Jul 5", value: 46, sampleSize: 4 },
      { label: "Jul 19", value: 45, sampleSize: 4 },
      { label: "Jul 26", value: 46, sampleSize: 4 }
    ]
  }
];

const BASE_PRESENTATION: Omit<HistoryProgressPresentation, "initialSeriesId"> = {
  periodLabel: "Last 8 weeks",
  sampleLabel: "114 puzzles across 18 mixed Runs",
  strengths: STRENGTHS,
  noWeaknessLabel:
    "Your well-sampled themes are still within a similar range. A weakness appears only when one gap is large enough to stand apart from normal variation."
};

export function isHistoryProgressScenario(
  scenarioId: LabScenarioId
): scenarioId is "history-progress" | "history-progress-weakness" {
  return scenarioId === "history-progress"
    || scenarioId === "history-progress-weakness";
}

export function historyProgressPresentationFor(
  scenarioId: "history-progress" | "history-progress-weakness"
): HistoryProgressPresentation {
  if (scenarioId === "history-progress") {
    return {
      ...BASE_PRESENTATION,
      initialSeriesId: "forks"
    };
  }
  return {
    ...BASE_PRESENTATION,
    initialSeriesId: "skewers",
    weakness: {
      label: "Skewers",
      metricLabel: "solve reliability",
      valueLabel: "46%",
      comparisonLabel:
        "Other well-sampled themes are currently between 68% and 74%.",
      gapLabel: "22 pts behind",
      evidenceLabel: "26 Skewer puzzles across 6 mixed Runs",
      explanation:
        "This gap is large enough to stand apart from the normal ups and downs in your recent results.",
      comparisons: [
        { id: "forks", label: "Forks", value: 68 },
        { id: "pins", label: "Pins", value: 74 },
        { id: "skewers", label: "Skewers", value: 46, isWeakness: true },
        { id: "discovered-attacks", label: "Discovered", value: 70 }
      ]
    }
  };
}
