import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// A full-window modal backdrop whose content stays inside the safe area. Each
// edge adds its own inset because displays such as the iPhone Duo outer screen
// reserve one side (the status-bar column) and not the opposite side.
export function SafeAreaModalBackdrop({
  children,
  style
}: React.PropsWithChildren<{ style: StyleProp<ViewStyle> }>): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const flattened = StyleSheet.flatten(style) ?? {};
  const basePadding = typeof flattened.padding === "number" ? flattened.padding : 0;

  return (
    <View
      style={[
        style,
        {
          paddingBottom: basePadding + insets.bottom,
          paddingLeft: basePadding + insets.left,
          paddingRight: basePadding + insets.right,
          paddingTop: basePadding + insets.top
        }
      ]}
    >
      {children}
    </View>
  );
}
