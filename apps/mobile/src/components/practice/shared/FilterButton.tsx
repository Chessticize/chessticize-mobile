import React from "react";
import { Pressable, Text } from "react-native";
import { makeStyles } from "../../../theme/index.ts";

export function FilterButton({
  active,
  label,
  testID,
  onPress
}: {
  active: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={4}
      testID={testID}
      style={[styles.filterButton, active ? styles.filterButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.filterButtonText, active ? styles.filterButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  filterButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14
  },
  filterButtonActive: {
    backgroundColor: theme.colors.accent.s100
  },
  filterButtonText: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary
  },
  filterButtonTextActive: {
    color: theme.colors.accent.s600,
    fontWeight: theme.typography.headline.fontWeight
  },
}));
