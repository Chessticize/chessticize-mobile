import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";
import { AppText } from "./AppText.tsx";

// An inset grouped section: an optional title row, one opaque surface on the
// grouped background, and an optional footnote. With `rows`, each child is a
// row separated by a full-bleed hairline (edge to edge, one per boundary);
// otherwise the surface pads its content.

export function Section({
  children,
  footer,
  header,
  headerAccessory,
  headerTestID,
  rows = false,
  separatorInset = 0,
  style,
  surfaceStyle,
  testID
}: React.PropsWithChildren<{
  footer?: React.ReactNode;
  header?: string;
  headerAccessory?: React.ReactNode;
  headerTestID?: string;
  rows?: boolean;
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>): React.JSX.Element {
  const styles = useStyles();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.section, style]} testID={testID}>
      {header !== undefined || headerAccessory ? (
        <View style={styles.header}>
          {header !== undefined ? (
            <AppText accessibilityRole="header" variant="title" style={styles.headerTitle} testID={headerTestID}>
              {header}
            </AppText>
          ) : <View style={styles.headerTitle} />}
          {headerAccessory}
        </View>
      ) : null}
      <View style={[styles.surface, rows ? null : styles.padded, surfaceStyle]}>
        {rows
          ? items.map((child, index) => (
            <React.Fragment key={(React.isValidElement(child) && child.key) || index}>
              {index > 0 ? <View style={[styles.separator, { marginLeft: separatorInset }]} /> : null}
              {child}
            </React.Fragment>
          ))
          : children}
      </View>
      {footer ? (
        typeof footer === "string"
          ? <AppText variant="footnote" style={styles.footer} tone="secondary">{footer}</AppText>
          : <View style={styles.footer}>{footer}</View>
      ) : null}
    </View>
  );
}

/** The surface color and shape of a section, for containers that manage their own children. */
export function useSectionSurfaceStyle(): ViewStyle {
  return useStyles().surface;
}

const useStyles = makeStyles((theme) => ({
  section: {
    gap: theme.spacing.group,
    minWidth: 0
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 4
  },
  headerTitle: {
    flex: 1,
    flexShrink: 1
  },
  surface: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.shape.card,
    overflow: "hidden"
  },
  padded: {
    gap: theme.spacing.group,
    padding: 16
  },
  separator: {
    backgroundColor: theme.colors.border.default,
    height: StyleSheet.hairlineWidth
  },
  footer: {
    paddingHorizontal: 16
  }
}));
