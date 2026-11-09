function SessionScoreGlyph({ tone }: { tone: "positive" | "negative" | "neutral" }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.sessionScoreIcon,
        tone === "positive" ? styles.sessionScoreDotPositive : null,
        tone === "negative" ? styles.sessionScoreDotNegative : null,
        tone === "neutral" ? styles.sessionScoreDotNeutral : null
      ]}
      testID={`session-score-${tone}-glyph`}
    >
      {tone === "positive" ? (
        <>
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCheckShort]} />
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCheckLong]} />
        </>
      ) : null}
      {tone === "negative" ? (
        <>
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCrossForward]} />
          <View style={[styles.sessionScoreGlyphLine, styles.sessionScoreCrossBackward]} />
        </>
      ) : null}
      {tone === "neutral" ? <View style={styles.sessionScoreNeutralLine} /> : null}
    </View>
  );
}

function MoveSideGlyph({
  kingPieceSize = 22,
  side,
  testID = `move-side-${side === "w" ? "white" : "black"}-glyph`
}: {
  kingPieceSize?: number;
  side: MoveSide;
  testID?: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      style={[styles.moveSideKingGlyph, { height: kingPieceSize, width: kingPieceSize }]}
      testID={testID}
    >
      <Image
        accessible={false}
        accessibilityIgnoresInvertColors
        resizeMode="stretch"
        source={CHESS_PIECE_SPRITE}
        style={[
          styles.moveSideKingSprite,
          {
            height: kingPieceSize * 2,
            left: -kingPieceSize * 5,
            top: side === "w" ? 0 : -kingPieceSize,
            width: kingPieceSize * 6
          }
        ]}
        testID={`chessboard-king-${side === "w" ? "white" : "black"}-sprite`}
      />
    </View>
  );
}

function ResultBadgeGlyph({ tone }: { tone: "correct" | "wrong" | "incomplete" }): React.JSX.Element {
  const appTheme = useTheme();
  if (tone === "correct") {
    return (
      <Icon color={appTheme.colors.positive.s600} name="check" size={18} testID="result-badge-correct-glyph" weight="semibold" />
    );
  }
  if (tone === "incomplete") {
    return (
      <Icon color={appTheme.colors.text.tertiary} name="remove" size={18} testID="result-badge-incomplete-glyph" weight="semibold" />
    );
  }
  return (
    <Icon color={appTheme.colors.danger.s600} name="close" size={18} testID="result-badge-wrong-glyph" weight="semibold" />
  );
}

function FilterGlyph({ active }: { active: boolean }): React.JSX.Element {
  const appTheme = useTheme();
  return (
    <Icon
      color={active ? appTheme.colors.accent.s600 : appTheme.colors.text.primary}
      name="filter"
      size={20}
      testID="filter-glyph"
      weight="semibold"
    />
  );
}

function CloseGlyph({
  color,
  testID = "close-glyph"
}: {
  color?: string;
  testID?: string;
} = {}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const glyphColor = color ?? appTheme.colors.text.ink;
  return (
    <View style={styles.closeGlyph} testID={testID}>
      <View style={[styles.closeGlyphLine, styles.closeGlyphForward, { backgroundColor: glyphColor }]} />
      <View style={[styles.closeGlyphLine, styles.closeGlyphBackward, { backgroundColor: glyphColor }]} />
    </View>
  );
}

function MoreGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.moreGlyph} testID="more-glyph">
      <View style={styles.moreGlyphDot} />
      <View style={styles.moreGlyphDot} />
      <View style={styles.moreGlyphDot} />
    </View>
  );
}

function PauseGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.pauseGlyph} testID="pause-glyph">
      <View style={styles.pauseGlyphBar} />
      <View style={styles.pauseGlyphBar} />
    </View>
  );
}

function PlayGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.playGlyph} testID="play-glyph" />
  );
}

function ChevronGlyph({
  direction
}: {
  direction: "down" | "left" | "right" | "up";
}): React.JSX.Element {
  const styles = useStyles();
  const directionStyle = direction === "left"
    ? styles.chevronGlyphLeft
    : direction === "right"
      ? styles.chevronGlyphRight
      : direction === "up"
        ? styles.chevronGlyphUp
        : styles.chevronGlyphDown;
  return (
    <View style={styles.chevronGlyphCanvas} testID={`chevron-${direction}-glyph`}>
      <View style={[styles.chevronGlyph, directionStyle]} />
    </View>
  );
}

function FlipGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.flipGlyph} testID="flip-glyph">
      <View style={styles.flipGlyphTrackTop} />
      <View style={styles.flipGlyphTrackBottom} />
      <View style={styles.flipGlyphHeadRight} />
      <View style={styles.flipGlyphHeadLeft} />
    </View>
  );
}

function SearchGlyph(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.searchGlyph} testID="search-glyph">
      <View style={styles.searchGlyphLens} />
      <View style={styles.searchGlyphHandle} />
    </View>
  );
}

  moveSideKingGlyph: {
    overflow: "hidden",
    position: "relative"
  },
  moveSideKingSprite: {
    position: "absolute"
  },
  sessionScoreIcon: {
    alignItems: "center",
    height: 20,
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 999,
    position: "relative",
    width: 20
  },
  sessionScoreDotPositive: {
    backgroundColor: theme.colors.positive.s600
  },
  sessionScoreDotNegative: {
    backgroundColor: theme.colors.danger.s600
  },
  sessionScoreDotNeutral: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.heavy,
    borderWidth: 1.5
  },
  sessionScoreGlyphLine: {
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    position: "absolute"
  },
  sessionScoreCheckShort: {
    height: 2,
    left: 5,
    top: 10,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  sessionScoreCheckLong: {
    height: 2,
    right: 4,
    top: 9,
    transform: [{ rotate: "-48deg" }],
    width: 10
  },
  sessionScoreCrossForward: {
    height: 2.25,
    transform: [{ rotate: "45deg" }],
    width: 10
  },
  sessionScoreCrossBackward: {
    height: 2.25,
    transform: [{ rotate: "-45deg" }],
    width: 10
  },
  sessionScoreNeutralLine: {
    backgroundColor: theme.colors.text.tertiary,
    borderRadius: 999,
    height: 2.25,
    width: 8
  },
  closeGlyph: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  closeGlyphLine: {
    backgroundColor: theme.colors.text.ink,
    borderRadius: 999,
    height: 2.25,
    position: "absolute",
    width: 16
  },
  closeGlyphForward: {
    transform: [{ rotate: "45deg" }]
  },
  closeGlyphBackward: {
    transform: [{ rotate: "-45deg" }]
  },
  moreGlyph: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
    width: 18
  },
  moreGlyphDot: {
    backgroundColor: theme.colors.text.ink,
    borderRadius: 999,
    height: 4,
    width: 4
  },
  pauseGlyph: {
    flexDirection: "row",
    gap: 4
  },
  pauseGlyphBar: {
    backgroundColor: theme.colors.text.ink,
    borderRadius: 999,
    height: 16,
    width: 4
  },
  playGlyph: {
    borderBottomColor: "transparent",
    borderBottomWidth: 8,
    borderLeftColor: theme.colors.text.ink,
    borderLeftWidth: 13,
    borderTopColor: "transparent",
    borderTopWidth: 8,
    height: 0,
    marginLeft: 3,
    width: 0
  },
  chevronGlyphCanvas: {
    alignItems: "center",
    height: 18,
    justifyContent: "center",
    width: 18
  },
  chevronGlyph: {
    borderColor: theme.colors.text.strong,
    height: 9,
    width: 9
  },
  chevronGlyphLeft: {
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  chevronGlyphRight: {
    borderRightWidth: 2.5,
    borderTopWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  chevronGlyphUp: {
    borderLeftWidth: 2.5,
    borderTopWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  chevronGlyphDown: {
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    transform: [{ rotate: "45deg" }]
  },
  flipGlyph: {
    height: 18,
    position: "relative",
    width: 18
  },
  flipGlyphTrackTop: {
    backgroundColor: theme.colors.text.strong,
    borderRadius: 999,
    height: 2,
    left: 3,
    position: "absolute",
    top: 5,
    width: 11
  },
  flipGlyphTrackBottom: {
    backgroundColor: theme.colors.text.strong,
    borderRadius: 999,
    height: 2,
    left: 4,
    position: "absolute",
    top: 11,
    width: 11
  },
  flipGlyphHeadRight: {
    borderBottomColor: "transparent",
    borderBottomWidth: 4,
    borderLeftColor: theme.colors.text.strong,
    borderLeftWidth: 5,
    borderTopColor: "transparent",
    borderTopWidth: 4,
    height: 0,
    position: "absolute",
    right: 1,
    top: 2,
    width: 0
  },
  flipGlyphHeadLeft: {
    borderBottomColor: "transparent",
    borderBottomWidth: 4,
    borderRightColor: theme.colors.text.strong,
    borderRightWidth: 5,
    borderTopColor: "transparent",
    borderTopWidth: 4,
    height: 0,
    left: 1,
    position: "absolute",
    top: 8,
    width: 0
  },
  searchGlyph: {
    height: 18,
    position: "relative",
    width: 18
  },
  searchGlyphLens: {
    borderColor: theme.colors.surfaceInverse,
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    left: 3,
    position: "absolute",
    top: 3,
    width: 10
  },
  searchGlyphHandle: {
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: 999,
    height: 2.5,
    left: 11,
    position: "absolute",
    top: 12,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
