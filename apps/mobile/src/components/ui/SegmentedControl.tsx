import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";
import { useUiHaptics } from "../../platform/uiHaptics.ts";
import { usePracticeViewport } from "../PracticeViewport.tsx";

// iOS-style capsule segmented control. Each segment is at least 44 pt tall.
// Changing the selection plays selection feedback (#609).
//
// A label wraps at word boundaries only. When the longest word of a label
// would not fit its segment at the current text size (accessibility sizes on a
// phone), the segments stack vertically, one full-width row each, like the
// other rows that stack under large text. A word is never broken.

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  // Spoken label when it differs from the visible one.
  accessibilityLabel?: string;
  testID?: string;
};

// Width of the widest character of the subheadline label (14 pt, semibold when
// selected) in em, with the segment's horizontal padding. A deliberately
// generous estimate: stacking early is harmless, breaking a word is not.
const LABEL_EM_PER_CHARACTER = 0.62;
const LABEL_FONT_SIZE = 14;
const SEGMENT_HORIZONTAL_PADDING = 20;
const TRACK_PADDING = 3;
// Until the track reports its width, assume the screen minus page margins.
const PAGE_MARGINS = 32;

export function SegmentedControl<T extends string>({
  accessibilityLabel,
  options,
  semantics = "tab",
  testID,
  value,
  onChange
}: {
  accessibilityLabel: string;
  options: readonly SegmentOption<T>[];
  // "tab" is a tablist; "radio" is a radio group, for a filter that picks one
  // of several views of the same list.
  semantics?: "tab" | "radio";
  testID?: string;
  value: T;
  onChange: (next: T) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const uiHaptics = useUiHaptics();
  const { fontScale, width: viewportWidth } = usePracticeViewport();
  const [trackWidth, setTrackWidth] = useState(0);
  const available = (trackWidth > 0 ? trackWidth : viewportWidth - PAGE_MARGINS) - 2 * TRACK_PADDING;
  const segmentWidth = available / Math.max(1, options.length);
  const longestWord = Math.max(
    1,
    ...options.flatMap((option) => option.label.split(/\s+/).map((word) => word.length))
  );
  const neededWidth = Math.ceil(
    longestWord * LABEL_EM_PER_CHARACTER * LABEL_FONT_SIZE * Math.max(1, fontScale)
  ) + SEGMENT_HORIZONTAL_PADDING;
  const stacked = neededWidth > segmentWidth;
  const radio = semantics === "radio";
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={radio ? undefined : "tablist"}
      role={radio ? "radiogroup" : undefined}
      style={[styles.track, stacked ? styles.trackStacked : null]}
      testID={testID}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityRole={radio ? "radio" : "tab"}
            accessibilityState={radio ? { checked: selected } : { selected }}
            aria-checked={radio ? selected : undefined}
            key={option.value}
            style={[
              styles.segment,
              stacked ? styles.segmentStacked : null,
              selected ? styles.segmentSelected : null
            ]}
            testID={option.testID}
            onPress={() => {
              if (!selected) {
                uiHaptics("selection");
              }
              onChange(option.value);
            }}
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
    padding: TRACK_PADDING
  },
  // A capsule radius on a tall stack would turn it into an ellipse.
  trackStacked: {
    borderRadius: theme.shape.card,
    flexDirection: "column",
    gap: 2
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
  segmentStacked: {
    alignSelf: "stretch",
    borderRadius: theme.shape.card - TRACK_PADDING,
    flex: 0
  },
  segmentSelected: {
    backgroundColor: theme.name === "dark" ? theme.colors.fillMuted : theme.colors.surface,
    ...theme.elevation.low,
    shadowOpacity: theme.name === "dark" ? 0 : 0.12
  },
  // The label spans the segment instead of shrink-wrapping its text, so it
  // keeps slack against Android width rounding (#633) and still wraps.
  label: {
    ...theme.typography.subheadline,
    alignSelf: "stretch",
    color: theme.colors.text.primary,
    textAlign: "center"
  },
  labelSelected: {
    fontWeight: theme.typography.headline.fontWeight
  }
}));
