import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Icon } from "../src/components/ui/Icon";
import { ICONS } from "../src/components/ui/iconNames";
import { darkTheme } from "../src/theme";

const reactNative = require("react-native") as { Platform: { OS: string } };

function hostByTestID(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.find((node) => typeof node.type === "string" && node.props.testID === testID);
}

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}

describe("Icon", () => {
  const originalOS = reactNative.Platform.OS;

  afterEach(() => {
    reactNative.Platform.OS = originalOS;
  });

  it("renders the SF Symbol through the typed native component on iOS", () => {
    reactNative.Platform.OS = "ios";
    const renderer = render(
      <Icon color={darkTheme.colors.accent.s600} name="tabHistory" size={20} testID="icon" weight="semibold" />
    );
    const symbol = hostByTestID(renderer, "icon");

    expect(symbol.type).toBe("ChessticizeSymbolView");
    expect(symbol.props).toMatchObject({
      pointSize: 20,
      style: { height: 20, width: 20 },
      symbolColor: darkTheme.colors.accent.s600,
      symbolName: ICONS.tabHistory.sf,
      symbolWeight: "semibold",
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      pointerEvents: "none"
    });
  });

  it("keeps the bundled Material Symbols glyph on Android", () => {
    reactNative.Platform.OS = "android";
    const renderer = render(<Icon color="#123456" name="tabHistory" testID="icon" />);
    const glyph = hostByTestID(renderer, "icon");

    expect(glyph.props.children).toBe(String.fromCodePoint(ICONS.tabHistory.codepoint));
    expect(glyph.props.style).toMatchObject({ color: "#123456", fontSize: 22, width: 22, height: 22 });
  });
});
