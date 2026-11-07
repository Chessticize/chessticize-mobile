import React from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/index.ts";

export function SessionMistakeIndicator({
  count,
  max
}: {
  count: number;
  max: number;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessibilityLabel={`Mistakes ${count} of ${max}`}
      style={styles.indicator}
      testID="session-mistakes"
    >
      <View style={styles.dots}>
        {Array.from({ length: max }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < count ? styles.usedDot : null
            ]}
            testID={`session-mistake-dot-${index}`}
          />
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  dot: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.heavy,
    borderRadius: theme.radius[3],
    borderWidth: 1,
    height: 9,
    width: 9
  },
  dots: {
    flexDirection: "row",
    gap: theme.space[3]
  },
  indicator: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 42
  },
  usedDot: {
    backgroundColor: theme.colors.danger.s600,
    borderColor: theme.colors.danger.s600
  }
}));
