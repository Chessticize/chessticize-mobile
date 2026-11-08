import React from "react";
import {
  Platform,
  Text,
  processColor,
  requireNativeComponent,
  type HostComponent,
  type ViewProps
} from "react-native";
import { ICONS, type IconName } from "./iconNames.ts";

// One icon API for every platform (#609). iOS draws the SF Symbol through the
// app-local ChessticizeSymbolView; Android and the web Lab draw the matching
// Material Symbols Rounded glyph from the bundled ChessticizeSymbols subset font.
// Icons are decorative: put the accessible label on the surrounding control.

export const ICON_FONT_FAMILY = "ChessticizeSymbols";

type NativeSymbolProps = ViewProps & {
  symbolName: string;
  pointSize: number;
  symbolWeight: IconWeight;
  symbolColor: ReturnType<typeof processColor>;
};

type IconWeight = "regular" | "semibold" | "bold";

let NativeSymbolView: HostComponent<NativeSymbolProps> | null = null;

function nativeSymbolView(): HostComponent<NativeSymbolProps> {
  NativeSymbolView ??= requireNativeComponent<NativeSymbolProps>("ChessticizeSymbolView");
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
        symbolColor={processColor(color)}
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
