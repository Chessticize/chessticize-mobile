import React from "react";
import { Text, View } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";

// A capsule status label on a soft tone fill, or an outlined neutral label.

export type BadgeTone = "accent" | "positive" | "negative" | "warning" | "neutral";

export function Badge({
  label,
  testID,
  tone = "accent"
}: {
  label: string;
  testID?: string;
  tone?: BadgeTone;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={[styles.badge, styles[`${tone}Fill`]]} testID={testID}>
      <Text style={[styles.label, styles[`${tone}Label`]]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  badge: {
    alignSelf: "flex-start",
    borderRadius: theme.shape.capsule,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  label: {
    ...theme.typography.caption,
    fontWeight: theme.typography.headline.fontWeight
  },
  accentFill: {
    backgroundColor: theme.colors.accent.s100
  },
  accentLabel: {
    color: theme.colors.accent.s600,
    backgroundColor: theme.colors.accent.s100
  },
  positiveFill: {
    backgroundColor: theme.colors.positive.s100
  },
  positiveLabel: {
    color: theme.colors.positive.s600,
    backgroundColor: theme.colors.positive.s100
  },
  negativeFill: {
    backgroundColor: theme.colors.danger.s100
  },
  negativeLabel: {
    color: theme.colors.danger.s600,
    backgroundColor: theme.colors.danger.s100
  },
  warningFill: {
    backgroundColor: theme.colors.warning.s100
  },
  warningLabel: {
    color: theme.colors.warning.s600,
    backgroundColor: theme.colors.warning.s100
  },
  neutralFill: {
    borderColor: theme.colors.border.strong,
    borderWidth: 1
  },
  neutralLabel: {
    color: theme.colors.text.tertiary
  }
}));
