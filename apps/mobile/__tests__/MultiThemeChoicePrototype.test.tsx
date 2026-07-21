import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MultiThemeChoicePrototype } from "../src/components/MultiThemeChoicePrototype";

describe("MultiThemeChoicePrototype", () => {
  it("toggles named themes independently and lets Mixed clear every named theme", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MultiThemeChoicePrototype initialSelectedThemes={["fork"]} />
      );
    });

    expect(themeChecked(renderer!, "fork")).toBe(true);
    expect(themeChecked(renderer!, "mate")).toBe(false);

    press(renderer!, "multi-theme-mate");
    expect(themeChecked(renderer!, "fork")).toBe(true);
    expect(themeChecked(renderer!, "mate")).toBe(true);

    press(renderer!, "multi-theme-fork");
    expect(themeChecked(renderer!, "fork")).toBe(false);
    expect(themeChecked(renderer!, "mate")).toBe(true);

    press(renderer!, "multi-theme-mixed");
    expect(themeChecked(renderer!, "mixed")).toBe(true);
    expect(themeChecked(renderer!, "mate")).toBe(false);
    expect(selectionCount(renderer!)).toBe("1 selected");

    press(renderer!, "multi-theme-mixed");
    expect(themeChecked(renderer!, "mixed")).toBe(false);
    expect(selectionCount(renderer!)).toBe("0 selected");
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("✓");
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Targeting");

    act(() => {
      renderer!.unmount();
    });
  });
});

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    renderer.root.findByProps({ testID }).props.onPress();
  });
}

function themeChecked(
  renderer: TestRenderer.ReactTestRenderer,
  theme: string
): boolean {
  return renderer.root.findByProps({ testID: `multi-theme-${theme}` }).props
    .accessibilityState.checked;
}

function selectionCount(renderer: TestRenderer.ReactTestRenderer): string {
  const children = renderer.root.findByProps({
    testID: "multi-theme-selection-count"
  }).props.children;
  return Array.isArray(children) ? children.join("") : String(children);
}
