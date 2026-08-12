import React from "react";
import { StyleSheet, View } from "react-native";

const BASE_SIZE = 28;
const TROPHY_COLOR = "#2563EB";

export function ResultTrophyGlyph({
  cupTestID,
  size = BASE_SIZE,
  testID
}: {
  cupTestID?: string;
  size?: number;
  testID?: string;
}): React.JSX.Element {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { height: size, width: size }]}
      testID={testID}
    >
      <View style={[styles.glyph, { transform: [{ scale: size / BASE_SIZE }] }]}>
        <View style={styles.cup} testID={cupTestID}>
          <View style={[styles.handle, styles.handleLeft]} />
          <View style={[styles.handle, styles.handleRight]} />
        </View>
        <View style={styles.stem} />
        <View style={styles.base} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: TROPHY_COLOR,
    borderRadius: 999,
    height: 3,
    width: 17
  },
  cup: {
    backgroundColor: TROPHY_COLOR,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    height: 13,
    position: "relative",
    width: 17
  },
  frame: {
    alignItems: "center",
    justifyContent: "center"
  },
  glyph: {
    alignItems: "center",
    height: BASE_SIZE,
    justifyContent: "center",
    width: BASE_SIZE
  },
  handle: {
    borderColor: TROPHY_COLOR,
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    top: 2,
    width: 8
  },
  handleLeft: {
    left: -7
  },
  handleRight: {
    right: -7
  },
  stem: {
    backgroundColor: TROPHY_COLOR,
    height: 7,
    width: 4
  }
});
