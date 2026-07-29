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
      label: "Fork · Puzzle solving",
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
