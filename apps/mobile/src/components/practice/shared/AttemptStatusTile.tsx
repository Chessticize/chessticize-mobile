// Status tile for a History or Review attempt row: tinted like an IconTile and
// carrying the result glyph.
function AttemptStatusTile({
  testID,
  tone
}: {
  testID: string;
  tone: "correct" | "wrong" | "incomplete" | "unknown";
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  return (
    <View
      style={[
        styles.attemptStatusTile,
        tone === "correct"
          ? styles.attemptStatusTileCorrect
          : tone === "wrong"
            ? styles.attemptStatusTileWrong
            : styles.attemptStatusTileNeutral
      ]}
      testID={testID}
    >
      {tone === "unknown" ? (
        <Icon color={appTheme.colors.text.tertiary} name="help" size={18} weight="semibold" />
      ) : (
        <ResultBadgeGlyph tone={tone} />
      )}
    </View>
  );
}

  attemptStatusTile: {
    alignItems: "center",
    borderRadius: theme.shape.tile,
    height: theme.metrics.iconTile,
    justifyContent: "center",
    width: theme.metrics.iconTile
  },
  attemptStatusTileCorrect: {
    backgroundColor: theme.colors.positive.s100
  },
  attemptStatusTileWrong: {
    backgroundColor: theme.colors.danger.s100
  },
  attemptStatusTileNeutral: {
    backgroundColor: theme.colors.surfaceStrong
  },
