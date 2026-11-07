import React from "react";
import { Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { makeStyles } from "../theme/index.ts";

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
  const styles = useStyles();
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

const useStyles = makeStyles((theme) => ({
  card: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius[8],
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: theme.space[12],
    paddingVertical: theme.space[10]
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  count: {
    fontSize: theme.fontSize[18],
    fontWeight: theme.fontWeight.black
  },
  countAttention: {
    color: theme.colors.danger.s800
  },
  countClear: {
    color: theme.colors.positive.s700
  },
  countColumn: {
    alignItems: "center",
    justifyContent: "center",
    width: 38
  },
  detail: {
    color: theme.colors.text.tertiary,
    fontSize: theme.fontSize[12],
    fontWeight: theme.fontWeight.semibold,
    marginTop: theme.space[2]
  },
  title: {
    color: theme.colors.text.primary,
    fontSize: theme.fontSize[14],
    fontWeight: theme.fontWeight.heavy
  }
}));
