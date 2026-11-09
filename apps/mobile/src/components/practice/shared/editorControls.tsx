import React from "react";
import { Pressable, useWindowDimensions, View, type ViewStyle } from "react-native";
import { makeStyles, useTheme } from "../../../theme/index.ts";
import { Icon } from "../../ui/index.tsx";
import { useUiHaptics } from "../../../platform/uiHaptics.ts";
import { typography as baseTypography } from "../../../theme/scales.ts";
import { pickPracticeStyles } from "./practiceStyles.tsx";

// A grouped-row switch (51 x 31 pt track) with a 44 pt tall hit target. A
// toggle plays selection feedback (#609).
export function EditorSwitch({
  accessibilityLabel,
  enabled,
  testID,
  onPress
}: {
  accessibilityLabel: string;
  enabled: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const uiHaptics = useUiHaptics();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityValue={{ text: enabled ? "On" : "Off" }}
      style={styles.runTimingToggle}
      testID={testID}
      onPress={() => {
        uiHaptics("selection");
        onPress();
      }}
    >
      <View style={[styles.historyToggleTrack, enabled ? styles.historyToggleTrackActive : null]}>
        <View style={[styles.historyToggleThumb, enabled ? styles.historyToggleThumbActive : null]} />
      </View>
    </Pressable>
  );
}

// One half of a stepper: a filled 36 x 32 pt button whose hit area reaches 44 pt.
// A step plays selection feedback (#609).
export function StepperButton({
  accessibilityLabel,
  direction,
  disabled,
  testID,
  onPress
}: {
  accessibilityLabel: string;
  direction: "decrease" | "increase";
  disabled: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const uiHaptics = useUiHaptics();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={STEPPER_HIT_SLOP}
      style={({ pressed }) => [
        styles.customStepperButton,
        pressed && !disabled ? styles.customStepperButtonPressed : null,
        disabled ? styles.disabledButton : null
      ]}
      testID={testID}
      onPress={() => {
        uiHaptics("selection");
        onPress();
      }}
    >
      <Icon
        color={appTheme.colors.text.primary}
        name={direction === "decrease" ? "remove" : "add"}
        size={17}
        testID={direction === "decrease" ? "minus-glyph" : "plus-glyph"}
        weight="semibold"
      />
    </Pressable>
  );
}

const STEPPER_HIT_SLOP = { bottom: 6, left: 4, right: 4, top: 6 };

// Short numeric fields grow with the text size up to 1.5x, then cap their
// text there, so four digits never clip inside a fixed-width field.
export const NUMERIC_FIELD_MAX_TEXT_SCALE = 1.5;

// Above this text scale an editor row stacks: its label spans the row and the
// control (field, stepper or switch) sits below it, trailing.
const STACKED_EDITOR_TEXT_SCALE = 1.35;

// The user's text scale: the system font scale on a device, or the theme's
// scaled type roles in the Interaction Lab.
function useEditorTextScale(): number {
  const appTheme = useTheme();
  const { fontScale } = useWindowDimensions();
  const themeScale = appTheme.typography.body.fontSize / baseTypography.body.fontSize;
  return Math.max(1, fontScale, themeScale);
}

export function useEditorRowLayout(): {
  controls: ViewStyle;
  copy: ViewStyle;
  line: ViewStyle;
  row: ViewStyle;
  stacked: boolean;
} {
  const styles = useStyles();
  const stacked = useEditorTextScale() >= STACKED_EDITOR_TEXT_SCALE;
  return stacked
    ? {
        controls: styles.editorStackedControls,
        copy: styles.editorStackedCopy,
        line: styles.editorStackedLine,
        row: styles.editorStackedLine,
        stacked
      }
    : {
        controls: styles.editorInlineControls,
        copy: styles.editorInlineCopy,
        line: styles.editorInlineLine,
        row: styles.editorInlineRow,
        stacked
      };
}

export function useNumericFieldScale(): number {
  return Math.min(NUMERIC_FIELD_MAX_TEXT_SCALE, useEditorTextScale());
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["disabledButton"]),
  // Editor rows keep the copy and its control on one line; with large text
  // they stack, the copy spanning the row and the control trailing below it.
  editorInlineRow: {
    justifyContent: "space-between"
  },
  editorInlineLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row
  },
  editorInlineCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  editorInlineControls: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: theme.spacing.inline
  },
  editorStackedLine: {
    alignItems: "flex-end",
    flexDirection: "column",
    gap: theme.spacing.inline
  },
  editorStackedCopy: {
    alignSelf: "stretch",
    gap: 2
  },
  editorStackedControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  customStepperButtonPressed: {
    backgroundColor: theme.colors.fillMuted
  },
  runTimingToggle: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: theme.metrics.minTarget
  },
  customStepperButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 36
  },
  historyToggleTrack: {
    backgroundColor: theme.colors.fillMuted,
    borderRadius: 15.5,
    height: 31,
    padding: 2,
    width: 51
  },
  historyToggleTrackActive: {
    backgroundColor: theme.colors.accent.fill
  },
  historyToggleThumb: {
    backgroundColor: theme.colors.thumb,
    borderRadius: 13.5,
    height: 27,
    width: 27,
    ...theme.elevation.low
  },
  historyToggleThumbActive: {
    transform: [{ translateX: 20 }]
  },
}));
