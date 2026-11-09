import React from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";
import { useTheme } from "../../theme/ThemeProvider.ts";
import { TYPE_ROLE_MAX_FONT_SCALE } from "../../theme/scales.ts";
import { useUiHaptics } from "../../platform/uiHaptics.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./iconNames.ts";

// Direction A buttons: rounded rectangles (radius 12) with a headline label.
// `regular` is 50 pt tall for primary page actions; `compact` meets the 44 pt
// minimum for header and toolbar actions. Labels wrap under large text rather
// than truncating, so the button grows instead of clipping, up to the headline
// role's text-size cap, as AppText applies it. A primary press
// plays a light impact (#609); the other variants stay silent.

export type ButtonVariant = "primary" | "secondary" | "plain" | "destructive";

export function Button({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole = "button",
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
  // A button that leaves the app (for example to a web page) is announced as a link.
  accessibilityRole?: "button" | "link";
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
  const uiHaptics = useUiHaptics();
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
      accessibilityRole={accessibilityRole}
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
      onPress={() => {
        if (variant === "primary") {
          uiHaptics("impactLight");
        }
        onPress();
      }}
    >
      <View style={styles.content}>
        {icon ? <Icon color={labelColor} name={icon} size={17} weight="semibold" /> : null}
        <Text
          maxFontSizeMultiplier={TYPE_ROLE_MAX_FONT_SCALE.headline}
          style={[styles.label, icon ? null : styles.labelFill, styles[`${variant}Label`]]}
        >
          {label}
        </Text>
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
  // The content spans the button and an icon-less label fills it, so a
  // stretched button's label has slack against Android width rounding (#633).
  // A button that hugs its label has no slack; its label still wraps by design.
  content: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center"
  },
  label: {
    ...theme.typography.headline,
    flexShrink: 1,
    textAlign: "center"
  },
  labelFill: {
    flexGrow: 1
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
