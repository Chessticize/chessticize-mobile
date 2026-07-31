import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  HistoryProgressScreen,
  type HistoryProgressPresentation
} from "../src/components/HistoryProgressSection";
import { flattenTestStyle } from "../test-support/testRendererSupport";

test("renders an unavailable historical point as a gray placeholder", () => {
  const presentation: HistoryProgressPresentation = {
    periodLabel: "Last 8 weeks",
    sampleLabel: "ordinary mixed Runs",
    sampleUnitLabel: "model-weighted observations",
    initialSeriesId: "line:fork:completed_speed",
    strengths: [{
      id: "line:fork:completed_speed",
      themeId: "line:fork",
      taskFamily: "line",
      label: "Fork",
      kind: "completed_speed",
      metricLabel: "Solve time · lower is better",
      baselineLabel: "1.00× matches your comparable completed puzzles",
      scaleMax: 120,
      changeLabel: "Solve time is steady",
      changeTone: "steady",
      summary: "Completed speed uses reliable elapsed time.",
      points: [
        {
          label: "May 30",
          value: 0,
          valueLabel: "—",
          sampleSize: 0,
          unavailable: true
        },
        {
          label: "Jul 25",
          value: 108,
          valueLabel: "1.08×",
          sampleSize: 8
        }
      ]
    }],
    noWeaknessTone: "balanced",
    noWeaknessTitle: "Recent play looks balanced",
    noWeaknessLabel: "No repeated weakness."
  };
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  act(() => {
    renderer = TestRenderer.create(
      <HistoryProgressScreen onBack={() => undefined} presentation={presentation} />
    );
  });

  const root = renderer!.root;
  const placeholder = root.findByProps({ testID: "history-strength-bar-0" });
  const available = root.findByProps({ testID: "history-strength-bar-1" });

  expect(flattenTestStyle(placeholder.props.style).backgroundColor).toBe("#CBD5E1");
  expect(flattenTestStyle(available.props.style).backgroundColor).toBe("#3B82F6");
  const placeholderSample = root.findByProps({
    testID: "history-strength-sample-0"
  });
  expect(placeholderSample.props.children).toBe("n=—");
  expect(placeholderSample.props.accessibilityLabel).toBe("Unavailable");
  expect(root.findByProps({ testID: "history-strength-chart" }).props.accessibilityLabel)
    .toContain("May 30: unavailable");

  act(() => {
    renderer?.unmount();
  });
});

test("switches between Puzzle solving and Arrow Duel progress without repeating the mode in theme labels", () => {
  const presentation: HistoryProgressPresentation = {
    periodLabel: "Last 8 weeks",
    sampleLabel: "ordinary mixed Runs",
    sampleUnitLabel: "model-weighted observations",
    initialSeriesId: "line:fork:solve_rate",
    strengths: [
      {
        id: "line:fork:solve_rate",
        themeId: "line:fork",
        taskFamily: "line",
        label: "Fork",
        kind: "solve_rate",
        metricLabel: "Accuracy · higher is better",
        baselineLabel: "Recent attempts contribute more to n",
        scaleMax: 100,
        changeLabel: "Accuracy is steady",
        changeTone: "steady",
        summary: "Wrong moves and timeouts count as misses.",
        points: [{
          label: "Jul 25",
          value: 92,
          valueLabel: "92%",
          sampleSize: 14
        }]
      },
      {
        id: "line:pin:solve_rate",
        themeId: "line:pin",
        taskFamily: "line",
        label: "Pin",
        kind: "solve_rate",
        metricLabel: "Accuracy · higher is better",
        baselineLabel: "Recent attempts contribute more to n",
        scaleMax: 100,
        changeLabel: "Accuracy is steady",
        changeTone: "steady",
        summary: "Wrong moves and timeouts count as misses.",
        points: [{
          label: "Jul 25",
          value: 89,
          valueLabel: "89%",
          sampleSize: 11
        }]
      },
      {
        id: "arrow_duel:fork:solve_rate",
        themeId: "arrow_duel:fork",
        taskFamily: "arrow_duel",
        label: "Fork",
        kind: "solve_rate",
        metricLabel: "Accuracy · higher is better",
        baselineLabel: "Recent attempts contribute more to n",
        scaleMax: 100,
        changeLabel: "4 points higher",
        changeTone: "improved",
        summary: "Wrong choices and timeouts count as misses.",
        points: [{
          label: "Jul 25",
          value: 86,
          valueLabel: "86%",
          sampleSize: 12
        }]
      }
    ],
    noWeaknessTone: "balanced",
    noWeaknessTitle: "Recent play looks balanced",
    noWeaknessLabel: "No repeated weakness."
  };
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  act(() => {
    renderer = TestRenderer.create(
      <HistoryProgressScreen onBack={() => undefined} presentation={presentation} />
    );
  });

  const root = renderer!.root;
  const taskFamilySelector = root.findByProps({
    testID: "history-progress-task-family-selector"
  });
  const themeSelector = root.findByProps({
    testID: "history-strength-selector"
  });
  const progressCard = root.findByProps({
    testID: "history-strength-over-time"
  });
  expect(taskFamilySelector).toBeTruthy();
  expect(themeSelector).toBeTruthy();
  expect(() => progressCard.findByProps({
    testID: "history-progress-task-family-selector"
  })).toThrow();
  expect(() => progressCard.findByProps({
    testID: "history-strength-selector"
  })).toThrow();
  expect(collectRenderedText(taskFamilySelector)).toBe(
    "Puzzle solvingArrow Duel"
  );
  expect(root.findByProps({
    testID: "history-strength-chart"
  }).props.accessibilityLabel).toContain("Fork");
  expect(collectRenderedText(root.findByProps({
    testID: "history-progress-metric-selector"
  }))).toContain("92%");
  expect(root.findByProps({
    testID: "history-progress-strength-line:fork:solve_rate"
  }).props.accessibilityLabel).toBe("Show Fork progress");
  expect(root.findByProps({
    testID: "history-progress-strength-line:pin:solve_rate"
  }).props.accessibilityLabel).toBe("Show Pin progress");

  act(() => {
    root.findByProps({
      testID: "history-progress-task-family-arrow_duel"
    }).props.onPress();
  });

  expect(root.findByProps({
    testID: "history-strength-chart"
  }).props.accessibilityLabel).toContain("86%");
  expect(collectRenderedText(root.findByProps({
    testID: "history-progress-metric-selector"
  }))).toContain("86%");
  expect(root.findByProps({
    testID: "history-progress-strength-arrow_duel:fork:solve_rate"
  }).props.accessibilityLabel).toBe("Show Fork progress");
  expect(() => root.findByProps({
    testID: "history-progress-strength-line:pin:solve_rate"
  })).toThrow();

  act(() => {
    renderer?.unmount();
  });
});

function collectRenderedText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : collectRenderedText(child)
    )
    .join("");
}
