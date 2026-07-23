import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  PuzzleTimingDesignPrototype
} from "../src/components/PuzzleTimingDesignPrototype";

describe("Puzzle timing Storybook design", () => {
  it("starts with editable 2x and 3x thresholds that can be turned off independently", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<PuzzleTimingDesignPrototype screen="policy" />);
    });

    expect(textOf(renderer.root.findByProps({ testID: "timing-warning-rule" }))).toContain("0:40");
    expect(textOf(renderer.root.findByProps({ testID: "timing-warning-rule" }))).toContain("2× typical");
    expect(textOf(renderer.root.findByProps({ testID: "timing-timeout-rule" }))).toContain("1:00");
    expect(textOf(renderer.root.findByProps({ testID: "timing-timeout-rule" }))).toContain("3× typical");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Flag a slow solve on" }).props.onPress();
    });

    expect(textOf(renderer.root.findByProps({ testID: "timing-warning-rule" })))
      .toContain("Off · no automatic Slow tag");
    expect(textOf(renderer.root.findByProps({ testID: "timing-timeout-rule" }))).toContain("1:00");
    expect(textOf(renderer.root.findByProps({ testID: "timing-clarity-note" })))
      .toContain("Slow is evidence. Unclear is your note.");
  });

  it("keeps the Sprint countdown primary while puzzle time counts up through warning and timeout", async () => {
    let warning!: TestRenderer.ReactTestRenderer;
    let timeout!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      warning = TestRenderer.create(
        <PuzzleTimingDesignPrototype phase="warning" screen="active" />
      );
      timeout = TestRenderer.create(
        <PuzzleTimingDesignPrototype phase="timeout" screen="active" />
      );
    });

    expect(textOf(warning.root.findByProps({ testID: "timing-sprint-clock" }))).toContain("2:34");
    expect(textOf(warning.root.findByProps({ testID: "timing-puzzle-pace" }))).toContain("0:47");
    expect(textOf(warning.root.findByProps({ testID: "timing-warning-message" })))
      .toContain("Taking longer than your typical solve");

    expect(textOf(timeout.root.findByProps({ testID: "timing-sprint-clock" }))).toContain("2:21");
    expect(textOf(timeout.root.findByProps({ testID: "timing-puzzle-pace" }))).toContain("1:00");
    expect(textOf(timeout.root.findByProps({ testID: "timing-timeout-receipt" })))
      .toContain("ClarityNot inferred");
    expect(textOf(timeout.root.findByProps({ testID: "timing-board-timeout-overlay" })))
      .toContain("Timed out at 1:00");
  });

  it("filters timeout causes and keeps clarity separate from Review", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<PuzzleTimingDesignPrototype screen="history" />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "timing-filter-timeout" }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: "timing-attempt-timeout-pin" })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: "timing-attempt-sprint-ended" })).toBeTruthy();
    expect(textOf(renderer.root.findByProps({ testID: "timing-attempt-detail" })))
      .toContain("Puzzle limit");

    const markUnclear = renderer.root.findAll((node) =>
      node.props.accessibilityRole === "button" && textOf(node) === "Mark unclear"
    )[0];
    expect(markUnclear).toBeTruthy();
    await act(async () => {
      markUnclear!.props.onPress();
    });

    const detailText = textOf(renderer.root.findByProps({ testID: "timing-attempt-detail" }));
    expect(detailText).toContain("Marked unclear");
    expect(detailText).toContain("Not in Review");
  });

  it("shows evidence quality before creating a focus Run draft", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<PuzzleTimingDesignPrototype screen="profile" />);
    });

    expect(textOf(renderer.root.findByProps({ testID: "profile-theme-fork" })))
      .toContain("58%");
    expect(textOf(renderer.root.findByProps({ testID: "profile-theme-clearance" })))
      .toContain("Building evidence");
    expect(textOf(renderer.root.findByProps({ testID: "profile-method-note" })))
      .toContain("Use median correct active time, not raw average time.");

    await act(async () => {
      renderer.root.findByProps({ testID: "profile-create-focus-run" }).props.onPress();
    });

    expect(textOf(renderer.root.findByProps({ testID: "profile-run-draft-ready" })))
      .toContain("Forks + Pins");
  });
});

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === "string" ? child : textOf(child)
  )).join("");
}
