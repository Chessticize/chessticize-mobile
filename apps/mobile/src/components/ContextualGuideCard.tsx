import React from "react";
import { View } from "react-native";
import { makeStyles } from "../theme/index.ts";
import { AppText, Button, IconTile } from "./ui/index.tsx";
import type { IconName, IconTone } from "./ui/iconNames.ts";

export interface ContextualGuideCardProps {
  icon: IconName;
  tone?: IconTone;
  title: string;
  body: string;
  dismissLabel: string;
  testID: string;
  dismissTestID: string;
  onDismiss: () => void;
}

/**
 * Compact, dismissible first-use guidance card embedded directly in a screen
 * (e.g. Games Hub or Game Review) so it explains the workflow without blocking
 * the board or interrupting interactions.
 */
export function ContextualGuideCard({
  icon,
  tone = "accent",
  title,
  body,
  dismissLabel,
  testID,
  dismissTestID,
  onDismiss
}: ContextualGuideCardProps): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        <IconTile name={icon} tone={tone} />
        <View style={styles.copy}>
          <AppText variant="headline">{title}</AppText>
          <AppText tone="secondary" variant="footnote">
            {body}
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label={dismissLabel}
          size="compact"
          testID={dismissTestID}
          variant="secondary"
          onPress={onDismiss}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.accent.s200,
    borderRadius: theme.radius[12],
    borderWidth: 1,
    gap: theme.space[10],
    padding: theme.space[12]
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: theme.space[12]
  },
  copy: {
    flex: 1,
    gap: theme.space[4],
    minWidth: 0
  },
  actions: {
    alignItems: "flex-end"
  }
}));
