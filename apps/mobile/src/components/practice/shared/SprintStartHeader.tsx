// Close, centered title and the primary action, matching the other direction A
// sub-screens (#609). The side slots share one width so the title stays centered.
function SprintStartHeader({
  actionLabel = "Start",
  closeAccessibilityLabel,
  closeTestID,
  headerTestID,
  startAccessibilityLabel,
  startDisabled = false,
  startTestID,
  title,
  titleTestID,
  onClose,
  onStart
}: {
  actionLabel?: string;
  closeAccessibilityLabel?: string;
  closeTestID?: string;
  headerTestID: string;
  startAccessibilityLabel: string;
  startDisabled?: boolean;
  startTestID: string;
  title: string;
  titleTestID: string;
  onClose?: () => void;
  onStart: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  return (
    <View style={styles.sprintScreenHeader} testID={headerTestID}>
      {onClose ? (
        <View style={styles.sprintHeaderSideSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            hitSlop={4}
            testID={closeTestID}
            style={({ pressed }) => [styles.sprintHeaderCloseButton, pressed ? styles.sprintHeaderCloseButtonPressed : null]}
            onPress={onClose}
          >
            <Icon color={appTheme.colors.accent.s600} name="close" size={20} weight="semibold" />
          </Pressable>
        </View>
      ) : null}
      <AppText
        accessibilityRole="header"
        style={[styles.sprintScreenTitle, !onClose ? styles.sprintScreenTitleLeading : null]}
        testID={titleTestID}
        variant="headline"
      >
        {title}
      </AppText>
      <View style={[styles.sprintHeaderSideSlot, styles.sprintHeaderSideSlotTrailing]}>
        <Button
          accessibilityLabel={startAccessibilityLabel}
          disabled={startDisabled}
          label={actionLabel}
          size="compact"
          testID={startTestID}
          onPress={onStart}
        />
      </View>
    </View>
  );
}

  // Run editor and custom setup rows (#609 direction A, increment 3b).
  sprintHeaderSideSlotTrailing: {
    alignItems: "flex-end"
  },
  sprintHeaderCloseButton: {
    alignItems: "center",
    borderRadius: theme.shape.capsule,
    height: theme.metrics.minTarget,
    justifyContent: "center",
    width: theme.metrics.minTarget
  },
  sprintHeaderCloseButtonPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  sprintScreenHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.inline,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget
  },
  sprintHeaderSideSlot: {
    alignItems: "flex-start",
    minWidth: 72
  },
  sprintScreenTitle: {
    flex: 1,
    textAlign: "center"
  },
  sprintScreenTitleLeading: {
    textAlign: "left"
  },
