import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

export function ResultReviewImpactCard({
  count,
  countColumnTestID,
  countTestID,
  detail,
  detailTestID,
  style,
  testID
}: {
  count: number;
  countColumnTestID?: string;
  countTestID?: string;
  detail: string;
  detailTestID?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  return (
    <View style={[styles.card, style]} testID={testID}>
      <View style={styles.copy}>
        <Text style={styles.title}>In Review</Text>
        <Text style={styles.detail} testID={detailTestID}>{detail}</Text>
      </View>
      <View style={styles.countColumn} testID={countColumnTestID}>
        <Text
          style={[styles.count, count > 0 ? styles.countAttention : styles.countClear]}
          testID={countTestID}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  count: {
    fontSize: 18,
    fontWeight: "900"
  },
  countAttention: {
    color: "#991B1B"
  },
  countClear: {
    color: "#15803D"
  },
  countColumn: {
    alignItems: "center",
    justifyContent: "center",
    width: 38
  },
  detail: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2
  },
  title: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800"
  }
});
