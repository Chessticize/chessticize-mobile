import React from "react";
import { Pressable } from "react-native";
import { makeStyles } from "../../../theme/index.ts";
import { pickPracticeStyles } from "./practiceStyles.tsx";

// A 44-pt circular toolbar button for a destination header (filters, paging).
export function ToolbarIconButton({
  accessibilityLabel,
  accessibilityState,
  active = false,
  children,
  disabled = false,
  testID,
  onPress
}: {
  accessibilityLabel: string;
  accessibilityState?: { disabled?: boolean; expanded?: boolean };
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.toolbarIconButton,
        active ? styles.toolbarIconButtonActive : null,
        pressed && !disabled ? styles.filterButtonPressed : null,
        disabled ? styles.disabledButton : null
      ]}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["disabledButton"]),
  toolbarIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  toolbarIconButtonActive: {
    backgroundColor: theme.colors.accent.s100
  },
  filterButtonPressed: {
    opacity: 0.7
  },
}));
