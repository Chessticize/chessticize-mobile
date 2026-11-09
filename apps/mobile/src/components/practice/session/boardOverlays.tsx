const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

const BOARD_FILES_FLIPPED = ["h", "g", "f", "e", "d", "c", "b", "a"] as const;

const BOARD_RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

const BOARD_RANKS_FLIPPED = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

function ArrowDuelWhatIfOverlay({
  actionLabel,
  compactTitle = false,
  detail,
  onAction,
  optionalSettingsHint,
  testIDPrefix,
  title = "What if you made\nthe other move?",
  titleSide,
  veryCompactTitle = false
}: {
  actionLabel?: string;
  compactTitle?: boolean;
  detail: string;
  onAction?: () => void;
  optionalSettingsHint?: string;
  testIDPrefix: string;
  title?: string;
  titleSide?: MoveSide;
  veryCompactTitle?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const accessibilityTitle = title.replace(/\s+/g, " ");
  return (
    <View
      pointerEvents={actionLabel && onAction ? "auto" : "none"}
      style={styles.arrowDuelWhatIfOverlay}
      testID={`${testIDPrefix}-what-if-overlay`}
    >
      <View
        accessible
        accessibilityLabel={`${accessibilityTitle} ${detail}${optionalSettingsHint ? ` ${optionalSettingsHint}` : ""}`}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.arrowDuelWhatIfAnnouncement}
        testID={`${testIDPrefix}-what-if-announcement`}
      >
        {titleSide ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.arrowDuelWhatIfTitleBlock}
            testID={`${testIDPrefix}-what-if-title`}
          >
            <View style={styles.arrowDuelWhatIfTitleLead}>
              <Text style={[
                styles.arrowDuelWhatIfTitleLine,
                compactTitle ? styles.arrowDuelWhatIfTitleLineCompact : null,
                veryCompactTitle ? styles.arrowDuelWhatIfTitleLineVeryCompact : null
              ]}>
                What would
              </Text>
              <View
                style={[
                  styles.arrowDuelWhatIfSideGlyphChip,
                  compactTitle ? styles.arrowDuelWhatIfSideGlyphChipCompact : null,
                  veryCompactTitle ? styles.arrowDuelWhatIfSideGlyphChipVeryCompact : null
                ]}
                testID={`${testIDPrefix}-what-if-side-glyph`}
              >
                <MoveSideGlyph
                  kingPieceSize={veryCompactTitle ? 19 : compactTitle ? 22 : 26}
                  side={titleSide}
                  testID={`${testIDPrefix}-what-if-side-king`}
                />
              </View>
              <Text style={[
                styles.arrowDuelWhatIfTitleLine,
                compactTitle ? styles.arrowDuelWhatIfTitleLineCompact : null,
                veryCompactTitle ? styles.arrowDuelWhatIfTitleLineVeryCompact : null
              ]}>
                play
              </Text>
            </View>
            <Text style={[
              styles.arrowDuelWhatIfTitleLine,
              compactTitle ? styles.arrowDuelWhatIfTitleLineCompact : null,
              veryCompactTitle ? styles.arrowDuelWhatIfTitleLineVeryCompact : null
            ]}>
              after the other move?
            </Text>
          </View>
        ) : (
          <Text
            style={styles.arrowDuelWhatIfTitle}
            testID={`${testIDPrefix}-what-if-title`}
          >
            {title}
          </Text>
        )}
        <Text
          style={styles.arrowDuelWhatIfDetail}
          testID={`${testIDPrefix}-what-if-detail`}
        >
          {detail}
        </Text>
        {optionalSettingsHint ? (
          <Text
            style={styles.arrowDuelWhatIfSettingsHint}
            testID={`${testIDPrefix}-what-if-settings-hint`}
          >
            {optionalSettingsHint}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          style={styles.arrowDuelWhatIfAction}
          testID={`${testIDPrefix}-what-if-action`}
          onPress={onAction}
        >
          <Text style={styles.arrowDuelWhatIfActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BoardInputBlocker(): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={() => undefined}
      style={styles.boardInputBlocker}
      testID="board-input-blocker"
    />
  );
}

function kingGlyphSizeForBoard(boardSize: number): number {
  return Math.max(1, Math.round(boardSize / 8));
}

function BoardCoordinateOverlay({
  boardSize,
  flipped
}: {
  boardSize: number;
  flipped: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const squareSize = boardSize / 8;
  const fontSize = Math.max(9, Math.min(12, squareSize * 0.22));
  const files = flipped ? BOARD_FILES_FLIPPED : BOARD_FILES;
  const ranks = flipped ? BOARD_RANKS_FLIPPED : BOARD_RANKS;

  return (
    <View
      pointerEvents="none"
      style={[styles.coordinateOverlay, { width: boardSize, height: boardSize }]}
      testID="board-coordinate-overlay"
    >
      {files.map((file, index) => (
        <Text
          key={`file-${file}-${index}`}
          style={[
            styles.coordinateText,
            styles.coordinateFileText,
            coordinateTextStyle(styles, 7, index),
            {
              bottom: 2,
              fontSize,
              left: index * squareSize,
              width: squareSize
            }
          ]}
          allowFontScaling={false}
          testID={`board-coordinate-file-${file}`}
        >
          {file}
        </Text>
      ))}
      {ranks.map((rank, index) => (
        <Text
          key={`rank-${rank}-${index}`}
          style={[
            styles.coordinateText,
            styles.coordinateRankText,
            coordinateTextStyle(styles, index, 0),
            {
              fontSize,
              left: 3,
              top: index * squareSize + 2
            }
          ]}
          allowFontScaling={false}
          testID={`board-coordinate-rank-${rank}`}
        >
          {rank}
        </Text>
      ))}
    </View>
  );
}

function coordinateTextStyle(styles: ReturnType<typeof useStyles>, row: number, col: number): object {
  return (row + col) % 2 === 0 ? styles.coordinateTextOnLight : styles.coordinateTextOnDark;
}

// Accessible marker for the last move. The board itself paints the tint
// beneath its pieces (`useBoardMoveSquareTints`); a tinted view here would sit
// over the piece artwork and wash it out (#629).
function LastMoveOverlay({
  boardSize,
  move,
  overlayTestID
}: {
  boardSize: number;
  move: BoardMove;
  overlayTestID: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`Last move ${move.from} to ${move.to}`}
      accessibilityRole="image"
      pointerEvents="none"
      style={[styles.arrowLayer, { width: boardSize, height: boardSize }]}
      testID={overlayTestID}
    />
  );
}

type BoardSquareTint = { square: Square; color: string };

// Tints a move's origin and target. The board draws them beneath its pieces so
// black and white piece artwork keeps its own contrast (#629).
function boardMoveSquareTints(move: BoardMove, color: string): BoardSquareTint[] {
  return [
    { square: move.from as Square, color },
    { square: move.to as Square, color }
  ];
}

// Memoized per move and color so clock re-renders leave the board layer alone.
function useBoardMoveSquareTints(move: BoardMove | null, color: string): BoardSquareTint[] | undefined {
  const from = move?.from ?? null;
  const to = move?.to ?? null;
  return useMemo(
    () => (from && to ? boardMoveSquareTints({ from, to }, color) : undefined),
    [color, from, to]
  );
}

function moveFeedbackTint(theme: Theme, result: "correct" | "wrong"): string {
  return result === "correct" ? theme.colors.positive.flash : theme.colors.danger.flash;
}

function sessionBoardAccessibilityLabel(
  side: MoveSide | null,
  lastMove: BoardMove | null
): string {
  const parts = ["Chess board"];
  if (side) {
    parts.push(sideToMoveAccessibilityLabel(side));
  }
  if (lastMove) {
    parts.push(`Last move ${lastMove.from} to ${lastMove.to}`);
  }
  return parts.join(". ");
}

// Marks the submitted move's feedback window. The board paints the correct or
// wrong tint beneath its pieces (`useBoardMoveSquareTints`).
function MoveFeedbackOverlay({ boardSize }: { boardSize: number }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      pointerEvents="none"
      style={[styles.arrowLayer, { width: boardSize, height: boardSize }]}
      testID="move-feedback-overlay"
    />
  );
}

function ArrowCandidateOverlay({
  boardSize,
  flipped,
  candidates,
  testID
}: {
  boardSize: number;
  flipped: boolean;
  candidates: string[];
  testID?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const squareSize = boardSize / 8;
  const pieceMoves = candidates.map((candidate) => ({
    move: candidate,
    role: "candidate",
    color: "neutral",
    selected: false
  }));

  return (
    <View
      accessible
      accessibilityLabel={`Arrow Duel candidates: ${candidates.join(", ")}`}
      accessibilityValue={{ text: candidates.join(", ") }}
      style={[styles.arrowLayer, { width: boardSize, height: boardSize }]}
      pointerEvents="none"
      testID={testID}
    >
      {testID ? <View testID={`${testID}-order-${candidates.join("-")}`} /> : null}
      {pieceMoves.map((arrow) => {
        const from = arrowFromTo(arrow.move);
        const arrowStyle = { stroke: appTheme.colors.accent.s600, opacity: 0.68 };
        if (!from) {
          return null;
        }
        return (
          <View key={`${arrow.move}`}>
            <ArrowHint
              boardSize={boardSize}
              squareSize={squareSize}
              flipped={flipped}
              move={arrow.move}
              stroke={arrowStyle.stroke}
              opacity={arrowStyle.opacity}
              selected={arrow.selected}
              from={from}
            />
          </View>
        );
      })}
    </View>
  );
}

function ArrowHint({
  boardSize,
  squareSize,
  flipped,
  move: _move,
  stroke,
  opacity,
  selected,
  from
}: {
  boardSize: number;
  squareSize: number;
  flipped: boolean;
  move: string;
  stroke: string;
  opacity: number;
  selected: boolean;
  from: { from: string; to: string };
}): React.JSX.Element {
  const styles = useStyles();
  const fromPos = squareToPixel(from.from, squareSize, flipped);
  const toPos = squareToPixel(from.to, squareSize, flipped);
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const strokeWidth = Math.max(7, squareSize * (selected ? 0.18 : 0.14));
  const headSize = Math.max(18, squareSize * (selected ? 0.34 : 0.3));
  const bodyLength = Math.max(0, len - squareSize * 0.42);
  const bodyStart = squareSize * 0.22;

  return (
    <View
      style={[
        styles.arrowLineWrap,
        {
          width: boardSize,
          height: boardSize
        }
      ]}
    >
      <View
        style={[
          styles.analysisArrowBody,
          {
            backgroundColor: stroke,
            height: strokeWidth,
            left: fromPos.x + Math.cos(angle) * bodyStart,
            opacity,
            top: fromPos.y - strokeWidth / 2 + Math.sin(angle) * bodyStart,
            transform: [{ rotateZ: `${angle}rad` }],
            width: bodyLength
          }
        ]}
      />
      <View
        style={[
          styles.analysisArrowHead,
          {
            borderLeftColor: stroke,
            borderLeftWidth: headSize,
            borderTopWidth: headSize * 0.52,
            borderBottomWidth: headSize * 0.52,
            left: toPos.x - headSize * 0.5,
            opacity,
            top: toPos.y - headSize * 0.52,
            transform: [{ rotateZ: `${angle}rad` }]
          }
        ]}
      />
    </View>
  );
}

function squareToTopLeft(square: string, squareSize: number, flipped: boolean): { x: number; y: number } {
  if (!/^[a-h][1-8]$/.test(square)) {
    throw new Error(`Invalid square ${square}`);
  }

  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return {
    x: col * squareSize,
    y: row * squareSize
  };
}

function squareToPixel(square: string, squareSize: number, flipped: boolean): { x: number; y: number } {
  const topLeft = squareToTopLeft(square, squareSize, flipped);
  return {
    x: topLeft.x + squareSize / 2,
    y: topLeft.y + squareSize / 2
  };
}

  boardInputBlocker: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    zIndex: 50
  },
  arrowDuelWhatIfOverlay: {
    alignItems: "center",
    backgroundColor: theme.colors.scrimStrong,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 24,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 60
  },
  arrowDuelWhatIfAnnouncement: {
    alignItems: "center",
    width: "100%"
  },
  arrowDuelWhatIfTitle: {
    color: theme.colors.text.onAccent,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
    maxWidth: 280,
    textAlign: "center",
    width: "100%"
  },
  arrowDuelWhatIfTitleBlock: {
    alignItems: "center",
    maxWidth: 280,
    width: "100%"
  },
  arrowDuelWhatIfTitleLead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  },
  arrowDuelWhatIfTitleLine: {
    color: theme.colors.text.onAccent,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
    textAlign: "center"
  },
  arrowDuelWhatIfTitleLineCompact: {
    fontSize: 20,
    lineHeight: 24
  },
  arrowDuelWhatIfTitleLineVeryCompact: {
    fontSize: 18,
    lineHeight: 22
  },
  arrowDuelWhatIfSideGlyphChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 7,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    marginHorizontal: 7,
    width: 32
  },
  arrowDuelWhatIfSideGlyphChipCompact: {
    borderRadius: 6,
    height: 28,
    marginHorizontal: 5,
    width: 28
  },
  arrowDuelWhatIfSideGlyphChipVeryCompact: {
    borderRadius: 5,
    height: 24,
    marginHorizontal: 4,
    width: 24
  },
  arrowDuelWhatIfDetail: {
    color: theme.colors.text.inverse,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 8,
    textAlign: "center"
  },
  arrowDuelWhatIfSettingsHint: {
    alignSelf: "center",
    backgroundColor: theme.colors.accent.glassFill,
    borderColor: theme.colors.accent.glassBorder,
    borderRadius: 999,
    borderWidth: 1,
    color: theme.colors.accent.s100,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 8,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
    textAlign: "center"
  },
  arrowDuelWhatIfAction: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 9,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 18
  },
  arrowDuelWhatIfActionText: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: "900"
  },
  coordinateOverlay: {
    left: 0,
    position: "absolute",
    top: 0,
    zIndex: 8
  },
  coordinateText: {
    fontWeight: "900",
    lineHeight: 12,
    position: "absolute",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1
  },
  coordinateFileText: {
    paddingRight: 3,
    textAlign: "right"
  },
  coordinateRankText: {
    textAlign: "left",
    width: 16
  },
  coordinateTextOnLight: {
    color: theme.colors.board.coordinateOnLightSquare,
    textShadowColor: theme.colors.board.coordinateHaloOnLightSquare
  },
  coordinateTextOnDark: {
    color: theme.colors.board.coordinateOnDarkSquare,
    textShadowColor: theme.colors.board.coordinateHaloOnDarkSquare
  },
  arrowLineWrap: {
    left: 0,
    position: "absolute",
    top: 0
  },
  analysisArrowBody: {
    borderRadius: 999,
    position: "absolute",
    transformOrigin: "0 50%"
  },
  analysisArrowHead: {
    borderBottomColor: "transparent",
    borderTopColor: "transparent",
    height: 0,
    position: "absolute",
    width: 0
  },
