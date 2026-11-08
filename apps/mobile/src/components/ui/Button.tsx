import React from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";
import { useTheme } from "../../theme/ThemeProvider.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./iconNames.ts";

// Direction A buttons: rounded rectangles (radius 12) with a headline label.
// `regular` is 50 pt tall for primary page actions; `compact` meets the 44 pt
// minimum for header and toolbar actions. Labels wrap under large text rather
// than truncating, so the button grows instead of clipping.

export type ButtonVariant = "primary" | "secondary" | "plain" | "destructive";

export function Button({
  accessibilityHint,
  accessibilityLabel,
  disabled = false,
  icon,
  label,
  onPress,
  size = "regular",
  stretch = false,
  style,
  testID,
  variant = "primary"
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: IconName;
  label: string;
  onPress: () => void;
  size?: "regular" | "compact";
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: ButtonVariant;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const labelColor = {
    primary: theme.colors.text.onAccent,
    secondary: theme.colors.accent.s600,
    plain: theme.colors.accent.s600,
    destructive: theme.colors.danger.s600
  }[variant];
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={size === "compact" && variant === "plain" ? 4 : undefined}
      style={({ pressed }) => [
        styles.base,
        size === "regular" ? styles.regular : styles.compact,
        styles[variant],
        stretch ? styles.stretch : null,
        disabled && variant === "primary" ? styles.primaryDisabled : null,
        disabled && variant !== "primary" ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style
      ]}
      testID={testID}
      onPress={onPress}
    >
      <View style={styles.content}>
        {icon ? <Icon color={labelColor} name={icon} size={17} weight="semibold" /> : null}
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: theme.shape.control,
    justifyContent: "center"
  },
  regular: {
    minHeight: 50,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  compact: {
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  stretch: {
    alignSelf: "stretch"
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center"
  },
  label: {
    ...theme.typography.headline,
    flexShrink: 1,
    textAlign: "center"
  },
  primary: {
    backgroundColor: theme.colors.accent.fill
  },
  primaryLabel: {
    color: theme.colors.text.onAccent
  },
  secondary: {
    backgroundColor: theme.colors.accent.s100
  },
  // Tinted labels repeat their fill as background (invisible on the matching
  // fill) so the theme contrast audit checks the pair.
  secondaryLabel: {
    color: theme.colors.accent.s600,
    backgroundColor: theme.colors.accent.s100
  },
  plain: {
    backgroundColor: "transparent",
    paddingHorizontal: 8
  },
  plainLabel: {
    color: theme.colors.accent.s600
  },
  destructive: {
    backgroundColor: theme.colors.danger.s100
  },
  destructiveLabel: {
    color: theme.colors.danger.s600,
    backgroundColor: theme.colors.danger.s100
  },
  primaryDisabled: {
    backgroundColor: theme.colors.fillDisabled
  },
  disabled: {
    opacity: 0.4
  },
  pressed: {
    opacity: 0.7
  }
}));
