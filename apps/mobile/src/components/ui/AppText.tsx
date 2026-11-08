import React from "react";
import { Text, type TextProps } from "react-native";
import { makeStyles } from "../../theme/makeStyles.ts";
import type { TypeRole } from "../../theme/themeTypes.ts";

// Text in one of direction A's type roles and color roles. Sizes are Dynamic Type
// points; React Native scales them with the user's text size, so containers
// must grow with their content (minHeight, never a fixed height).

export type TextTone =
  | "primary"
  | "secondary"
  | "accent"
  | "onAccent"
  | "positive"
  | "negative"
  | "warning";

export function AppText({
  style,
  tone = "primary",
  variant = "body",
  ...props
}: TextProps & { tone?: TextTone; variant?: TypeRole }): React.JSX.Element {
  const styles = useStyles();
  return <Text {...props} style={[styles[variant], styles[tone], style]} />;
}

const useStyles = makeStyles((theme) => ({
  primary: {
    color: theme.colors.text.primary
  },
  secondary: {
    color: theme.colors.text.tertiary
  },
  accent: {
    color: theme.colors.accent.s600
  },
  onAccent: {
    color: theme.colors.text.onAccent
  },
  positive: {
    color: theme.colors.positive.s600
  },
  negative: {
    color: theme.colors.danger.s600
  },
  warning: {
    color: theme.colors.warning.s600
  },
  largeTitle: theme.typography.largeTitle,
  title: theme.typography.title,
  headline: theme.typography.headline,
  body: theme.typography.body,
  subheadline: theme.typography.subheadline,
  footnote: theme.typography.footnote,
  caption: theme.typography.caption,
  numeral: theme.typography.numeral,
  numeralLarge: theme.typography.numeralLarge
}));
