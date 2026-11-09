import React from "react";
import { Platform, Text, type HostComponent } from "react-native";
import type { NativeProps as NativeSymbolProps } from "./ChessticizeSymbolViewNativeComponent.ts";
import { ICON_FONT_FAMILY, ICONS, type IconName } from "./iconNames.ts";

// One icon API for every platform (#609). iOS draws the SF Symbol through the
// app-local ChessticizeSymbolView Fabric component (#640); Android and the web Lab
// draw the matching Material Symbols Rounded glyph from the bundled
// ChessticizeSymbols subset font. Icons are decorative: put the accessible label on
// the surrounding control.

type IconWeight = "regular" | "semibold" | "bold";

let NativeSymbolView: HostComponent<NativeSymbolProps> | null = null;

// Loaded on first iOS use only, so Android and the web Lab never evaluate the
// native component spec.
function nativeSymbolView(): HostComponent<NativeSymbolProps> {
  NativeSymbolView ??= (
    require("./ChessticizeSymbolViewNativeComponent.ts") as {
      default: HostComponent<NativeSymbolProps>;
    }
  ).default;
  return NativeSymbolView;
}

export function Icon({
  color,
  name,
  size = 22,
  testID,
  weight = "regular"
}: {
  color: string;
  name: IconName;
  size?: number;
  testID?: string;
  weight?: IconWeight;
}): React.JSX.Element {
  const spec = ICONS[name];
  if (Platform.OS === "ios") {
    const SymbolView = nativeSymbolView();
    return (
      <SymbolView
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        pointSize={size}
        style={{ height: size, width: size }}
        symbolColor={color}
        symbolName={spec.sf}
        symbolWeight={weight}
        testID={testID}
      />
    );
  }
  return (
    <Text
      accessibilityElementsHidden
      accessible={false}
      aria-hidden
      allowFontScaling={false}
      importantForAccessibility="no-hide-descendants"
      selectable={false}
      style={{
        color,
        fontFamily: ICON_FONT_FAMILY,
        fontSize: size,
        fontWeight: "400",
        height: size,
        includeFontPadding: false,
        lineHeight: size,
        textAlign: "center",
        width: size
      }}
      testID={testID}
    >
      {String.fromCodePoint(spec.codepoint)}
    </Text>
  );
}
