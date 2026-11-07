import React from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/index.ts";

const BASE_SIZE = 28;

export function ResultTrophyGlyph({
  cupTestID,
  size = BASE_SIZE,
  testID
}: {
  cupTestID?: string;
  size?: number;
  testID?: string;
}): React.JSX.Element {
  const styles = useStyles();
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

const useStyles = makeStyles((theme) => ({
  base: {
    backgroundColor: theme.colors.accent.s600,
    borderRadius: theme.radius.pill,
    height: 3,
    width: 17
  },
  cup: {
    backgroundColor: theme.colors.accent.s600,
    borderBottomLeftRadius: theme.radius[7],
    borderBottomRightRadius: theme.radius[7],
    borderTopLeftRadius: theme.radius[4],
    borderTopRightRadius: theme.radius[4],
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
    borderColor: theme.colors.accent.s600,
    borderRadius: theme.radius.pill,
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
    backgroundColor: theme.colors.accent.s600,
    height: 7,
    width: 4
  }
}));
