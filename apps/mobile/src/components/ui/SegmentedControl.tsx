import React from "react";
import { Pressable, Text, View } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";

// iOS-style capsule segmented control. Each segment is at least 44 pt tall and
// its label wraps under large text instead of truncating.

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  testID?: string;
};

export function SegmentedControl<T extends string>({
  accessibilityLabel,
  options,
  testID,
  value,
  onChange
}: {
  accessibilityLabel: string;
  options: readonly SegmentOption<T>[];
  testID?: string;
  value: T;
  onChange: (next: T) => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="tablist" style={styles.track} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
            testID={option.testID}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  track: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.shape.capsule,
    flexDirection: "row",
    padding: 3
  },
  segment: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    flex: 1,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget - 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  segmentSelected: {
    backgroundColor: theme.name === "dark" ? theme.colors.fillMuted : theme.colors.surface,
    ...theme.elevation.low,
    shadowOpacity: theme.name === "dark" ? 0 : 0.12
  },
  label: {
    ...theme.typography.subheadline,
    color: theme.colors.text.primary,
    textAlign: "center"
  },
  labelSelected: {
    fontWeight: theme.typography.headline.fontWeight
  }
}));
