import React from "react";
import { Pressable, View, type AccessibilityState, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";
import { useTheme } from "../../theme/ThemeProvider.ts";
import { AppText } from "./AppText.tsx";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./iconNames.ts";

// A grouped-list row: optional tinted icon tile, title and subtitle, trailing
// content, and a chevron or selection check. At least 52 pt tall and grows with
// Dynamic Type. Use inside <Section rows>.

export type IconTone = "accent" | "positive" | "negative" | "warning" | "neutral";
export type RowAccessory = "chevron" | "check" | "none";

export function IconTile({ name, tone = "accent" }: { name: IconName; tone?: IconTone }): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const foreground = {
    accent: theme.colors.accent.s600,
    positive: theme.colors.positive.s600,
    negative: theme.colors.danger.s600,
    warning: theme.colors.warning.s600,
    neutral: theme.colors.text.tertiary
  }[tone];
  return (
    <View style={[styles.tile, styles[`tile_${tone}`]]}>
      <Icon color={foreground} name={name} size={18} weight="semibold" />
    </View>
  );
}

/** The inside of a row, for containers (such as a draggable card) that supply their own pressable. */
export function ListRowContent({
  accessory = "none",
  icon,
  iconTone,
  subtitle,
  subtitleLines,
  title,
  titleLines,
  titleTestID,
  trailing
}: {
  accessory?: RowAccessory;
  icon?: IconName;
  iconTone?: IconTone;
  subtitle?: string;
  subtitleLines?: number;
  title: string;
  titleLines?: number;
  titleTestID?: string;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <>
      {icon ? <IconTile name={icon} tone={iconTone} /> : null}
      <View style={styles.copy}>
        <AppText ellipsizeMode="tail" numberOfLines={titleLines} variant="headline" testID={titleTestID}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText ellipsizeMode="tail" numberOfLines={subtitleLines} variant="subheadline" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {accessory === "chevron" ? <Icon color={theme.colors.text.tertiary} name="chevronRight" size={15} weight="semibold" /> : null}
      {accessory === "check" ? <Icon color={theme.colors.accent.s600} name="check" size={18} weight="semibold" /> : null}
    </>
  );
}

export function ListRow({
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  accessory,
  disabled = false,
  icon,
  iconTone,
  onPress,
  selected,
  style,
  subtitle,
  subtitleLines,
  testID,
  title,
  titleLines,
  titleTestID,
  trailing
}: {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  accessory?: RowAccessory;
  disabled?: boolean;
  icon?: IconName;
  iconTone?: IconTone;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  subtitleLines?: number;
  testID?: string;
  title: string;
  titleLines?: number;
  titleTestID?: string;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const styles = useStyles();
  const content = (
    <ListRowContent
      accessory={accessory ?? (selected ? "check" : onPress ? "chevron" : "none")}
      icon={icon}
      iconTone={iconTone}
      subtitle={subtitle}
      subtitleLines={subtitleLines}
      title={title}
      titleLines={titleLines}
      titleTestID={titleTestID}
      trailing={trailing}
    />
  );
  if (!onPress) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessible={accessibilityLabel !== undefined}
        style={[styles.row, style]}
        testID={testID}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(", ")}
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(selected !== undefined ? { selected } : null), ...accessibilityState }}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null, disabled ? styles.disabled : null, style]}
      testID={testID}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

/** Row container style, for custom rows that must match ListRow. */
export function useListRowStyle(): ViewStyle {
  return useStyles().row;
}

const useStyles = makeStyles((theme) => ({
  row: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    gap: theme.spacing.row,
    minHeight: theme.metrics.rowMinHeight,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  pressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  disabled: {
    opacity: 0.4
  },
  copy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  tile: {
    alignItems: "center",
    borderRadius: theme.shape.tile,
    height: theme.metrics.iconTile,
    justifyContent: "center",
    width: theme.metrics.iconTile
  },
  tile_accent: {
    backgroundColor: theme.colors.accent.s100
  },
  tile_positive: {
    backgroundColor: theme.colors.positive.s100
  },
  tile_negative: {
    backgroundColor: theme.colors.danger.s100
  },
  tile_warning: {
    backgroundColor: theme.colors.warning.s100
  },
  tile_neutral: {
    backgroundColor: theme.colors.surfaceStrong
  }
}));
