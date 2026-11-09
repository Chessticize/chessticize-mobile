import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { AppText } from "../src/components/ui/AppText";
import { TopLevelNavigationRail } from "../src/navigation/TopLevelNavigationRail";
import { ANDROID_TAB_LABEL_MAX_FONT_SCALE, TOP_LEVEL_TABS } from "../src/navigation/topLevelNavigation";
import { LARGE_TITLE_MAX_FONT_SCALE } from "../src/theme/scales";

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
