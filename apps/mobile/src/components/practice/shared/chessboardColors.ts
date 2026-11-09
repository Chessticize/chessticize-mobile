type ChessboardColors = NonNullable<React.ComponentProps<typeof Chessboard>["colors"]>;

const chessboardColorCache = new WeakMap<Theme, ChessboardColors>();

// Stable per theme so the board does not see a new colors prop on every render.
function chessboardColorsFor(theme: Theme): ChessboardColors {
  let colors = chessboardColorCache.get(theme);
  if (colors === undefined) {
    const { board } = theme.colors;
    colors = {
      white: board.lightSquare,
      black: board.darkSquare,
      lastMoveHighlight: board.lastMoveHighlight,
      checkmateHighlight: board.checkmateHighlight,
      promotionPieceButton: board.promotionPieceButton,
      validMoveDot: board.validMoveDot,
      validMoveCapture: board.validMoveCapture,
      promotionOverlay: board.promotionOverlay,
      promotionContainer: board.promotionContainer,
      promotionBorder: board.promotionBorder,
      promotionShadow: board.promotionShadow,
      promotionPieceBorder: board.promotionPieceBorder
    };
    chessboardColorCache.set(theme, colors);
  }
  return colors;
}
