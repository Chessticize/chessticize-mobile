import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { AppText } from "../src/components/ui/AppText";
import { TopLevelNavigationRail } from "../src/navigation/TopLevelNavigationRail";
import { ANDROID_TAB_LABEL_MAX_FONT_SCALE, TOP_LEVEL_TABS } from "../src/navigation/topLevelNavigation";
import { lightTheme } from "../src/theme";
import {
  HEADLINE_MAX_FONT_SCALE,
  LARGE_TITLE_MAX_FONT_SCALE,
  TITLE_MAX_FONT_SCALE,
  TYPE_ROLE_MAX_FONT_SCALE
} from "../src/theme/scales";
import type { TypeRole } from "../src/theme/themeTypes";

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}

describe("large text caps", () => {
  it("caps the largeTitle variant at 2x so a title word never breaks at the largest sizes", () => {
    expect(LARGE_TITLE_MAX_FONT_SCALE).toBe(2);
    const renderer = render(<AppText variant="largeTitle">Practice</AppText>);
    expect(renderer.root.findByType(Text).props.maxFontSizeMultiplier).toBe(LARGE_TITLE_MAX_FONT_SCALE);
  });

  it("applies the heading caps through AppText so body <= headline <= title <= large title at every size", () => {
    expect(TITLE_MAX_FONT_SCALE).toBe(2.8);
    expect(HEADLINE_MAX_FONT_SCALE).toBe(3.5);
    for (const variant of ["largeTitle", "title", "headline"] as const) {
      const renderer = render(<AppText variant={variant}>Heading</AppText>);
      expect(renderer.root.findByType(Text).props.maxFontSizeMultiplier).toBe(TYPE_ROLE_MAX_FONT_SCALE[variant]);
    }
    // Rendered size of a role at a system font scale, as React Native computes it.
    const size = (role: TypeRole, scale: number): number =>
      lightTheme.typography[role].fontSize * Math.min(scale, TYPE_ROLE_MAX_FONT_SCALE[role] ?? Infinity);
    for (const scale of [1, 1.5, 2, 2.5, 2.8, 3, 3.5, 3.571]) {
      expect(size("body", scale)).toBeLessThanOrEqual(size("headline", scale) + 1e-9);
      expect(size("headline", scale)).toBeLessThanOrEqual(size("title", scale) + 1e-9);
      expect(size("title", scale)).toBeLessThanOrEqual(size("largeTitle", scale) + 1e-9);
    }
    // At the largest iOS accessibility size: 54 <= 56 <= 56 <= 60.
    expect(size("largeTitle", 3.571)).toBe(60);
    expect(size("title", 3.571)).toBeCloseTo(56);
    expect(size("headline", 3.571)).toBeCloseTo(56);
  });

  it("leaves other variants uncapped and lets a caller override the title cap", () => {
    const body = render(<AppText>Body</AppText>);
    expect(body.root.findByType(Text).props.maxFontSizeMultiplier).toBeUndefined();
    const title = render(<AppText maxFontSizeMultiplier={1.5} variant="largeTitle">Result</AppText>);
    expect(title.root.findByType(Text).props.maxFontSizeMultiplier).toBe(1.5);
  });

  it("caps every navigation rail label at the bottom navigation's scale and never truncates it", () => {
    const renderer = render(
      <TopLevelNavigationRail
        dueReviewCount={0}
        insets={{ bottom: 0, left: 0, top: 0 }}
        overdueReviewCount={0}
        selectedTab="practice"
        onSelect={() => undefined}
      />
    );
    for (const item of TOP_LEVEL_TABS) {
      const label = renderer.root
        .findAllByType(Text)
        .find((text) => text.props.children === item.label);
      expect(label?.props.maxFontSizeMultiplier).toBe(ANDROID_TAB_LABEL_MAX_FONT_SCALE);
      expect(label?.props.numberOfLines).toBeUndefined();
    }
  });
});
