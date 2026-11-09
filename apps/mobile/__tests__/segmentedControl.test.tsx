import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { StyleSheet, Text, View } from "react-native";
import { SegmentedControl } from "../src/components/ui";
import { PracticeViewportProvider } from "../src/components/PracticeViewport";

const OPTIONS = [
  { label: "Needs attention", testID: "needs", value: "needs" },
  { label: "All", testID: "all", value: "all" }
] as const;

// The host element that carries a testID, below the component that forwards it.
function host(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findAll((node) => typeof node.type === "string" && node.props.testID === testID)[0];
}

function renderControl(fontScale: number, trackWidth: number, semantics?: "radio"): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      <PracticeViewportProvider value={{ fontScale, height: 667, width: 375 }}>
        <SegmentedControl
          accessibilityLabel="History view"
          options={OPTIONS}
          semantics={semantics}
          testID="control"
          value="needs"
          onChange={() => undefined}
        />
      </PracticeViewportProvider>
    );
  });
  const track = host(renderer!, "control");
  act(() => {
    track.props.onLayout({ nativeEvent: { layout: { height: 44, width: trackWidth, x: 0, y: 0 } } });
  });
  return renderer!;
}

function trackDirection(renderer: TestRenderer.ReactTestRenderer): unknown {
  const track = host(renderer, "control");
  return StyleSheet.flatten(track.props.style).flexDirection;
}

describe("SegmentedControl at large text", () => {
  it("keeps segments side by side while the longest word fits", () => {
    expect(trackDirection(renderControl(1, 343))).toBe("row");
    expect(trackDirection(renderControl(1.5, 343))).toBe("row");
  });

  it("stacks the segments before a label word would have to break, up to the largest size", () => {
    for (const fontScale of [2.5, 3.571]) {
      const renderer = renderControl(fontScale, 343);
      expect(trackDirection(renderer)).toBe("column");
      const labels = renderer.root.findAllByType(Text);
      expect(labels.map((label) => label.props.children)).toEqual(["Needs attention", "All"]);
      // The label may wrap at spaces but is never truncated or shrunk.
      for (const label of labels) {
        expect(label.props.numberOfLines).toBeUndefined();
        expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      }
      const segment = host(renderer, "needs");
      expect(StyleSheet.flatten(segment.props.style).alignSelf).toBe("stretch");
    }
  });

  it("stacks on the first frame from the screen width, before the track reports its own", () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <PracticeViewportProvider value={{ fontScale: 3.571, height: 667, width: 375 }}>
          <SegmentedControl accessibilityLabel="x" options={OPTIONS} testID="control" value="all" onChange={() => undefined} />
        </PracticeViewportProvider>
      );
    });
    expect(trackDirection(renderer!)).toBe("column");
  });

  it("exposes radio semantics and per-option spoken labels for a filter", () => {
    const renderer = renderControl(1, 343, "radio");
    const track = host(renderer, "control");
    expect(track.props.role).toBe("radiogroup");
    const all = host(renderer, "all");
    expect(all.props.accessibilityRole).toBe("radio");
    expect(all.props.accessibilityState).toEqual({ checked: false });
    expect(host(renderer, "needs").props.accessibilityState).toEqual({ checked: true });
    expect(renderer.root.findAllByType(View).length).toBeGreaterThan(0);
  });
});
