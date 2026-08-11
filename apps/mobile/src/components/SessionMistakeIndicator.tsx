import React from "react";
import { StyleSheet, View } from "react-native";

export function SessionMistakeIndicator({
  count,
  max
}: {
  count: number;
  max: number;
}): React.JSX.Element {
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

const styles = StyleSheet.create({
  dot: {
    backgroundColor: "#FFFFFF",
    borderColor: "#94A3B8",
    borderRadius: 3,
    borderWidth: 1,
    height: 9,
    width: 9
  },
  dots: {
    flexDirection: "row",
    gap: 3
  },
  indicator: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 42
  },
  usedDot: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626"
  }
});
