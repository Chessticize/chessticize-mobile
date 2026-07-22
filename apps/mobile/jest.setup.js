jest.mock('react-native-chessboard', () => {
  const React = require('react');
  const { Chess } = require('chess.js');

  return React.forwardRef(function ChessboardMock(props, ref) {
    const chessRef = React.useRef(new Chess(props.fen));
    const latestFenRef = React.useRef(props.fen);
    const playMoveRef = React.useRef(null);
    const [pendingPromotion, setPendingPromotion] = React.useState(null);
    const resetBoardMock = React.useMemo(() => jest.fn((fen) => {
      try {
        chessRef.current = new Chess(fen ?? latestFenRef.current);
      } catch {
        chessRef.current = new Chess(latestFenRef.current);
      }
    }), []);

    React.useEffect(() => {
      latestFenRef.current = props.fen;
      chessRef.current = new Chess(props.fen);
      setPendingPromotion(null);
    }, [props.fen]);

    function playMove({ from, to, promotion }) {
      if (!promotion && isPromotionMove(from, to)) {
        setPendingPromotion({ from, to, color: chessRef.current.turn() });
        return undefined;
      }
      const move = { from, to, promotion };
      let played = null;
      try {
        played = chessRef.current.move({ from, to, ...(promotion ? { promotion } : {}) });
      } catch {
        played = null;
      }
      if (!played) {
        props.onIllegalMove?.(from, to);
        return undefined;
      }
      props.onMove?.({
        move,
        state: {
          fen: chessRef.current.fen(),
          isPromotion: Boolean(promotion)
        }
      });
      return move;
    }

    playMoveRef.current = playMove;
    const imperativeMoveMock = React.useMemo(() => jest.fn((move) => {
      return playMoveRef.current?.(move);
    }), []);

    React.useImperativeHandle(ref, () => ({
      move: imperativeMoveMock,
      resetBoard: resetBoardMock,
      getState: () => ({
        fen: chessRef.current.fen(),
        isCheck: chessRef.current.isCheck(),
        isCheckmate: chessRef.current.isCheckmate(),
        isStalemate: chessRef.current.isStalemate(),
        isGameOver: chessRef.current.isGameOver(),
        turn: chessRef.current.turn()
      })
    }));

    return React.createElement(
      'Chessboard',
      {
        ...props,
        mockImperativeMove: imperativeMoveMock,
        mockMove: playMove,
        mockResetBoard: resetBoardMock,
        testID: 'mock-chessboard'
      },
      pendingPromotion
        ? React.createElement(
          'PromotionDialog',
          { testID: 'mock-promotion-dialog' },
          ['q', 'r', 'b', 'n'].map((piece) =>
            React.createElement(
              'PromotionChoice',
              {
                key: piece,
                testID: `mock-promotion-choice-${piece}`,
                onPress: () => {
                  const pending = pendingPromotion;
                  setPendingPromotion(null);
                  playMove({ from: pending.from, to: pending.to, promotion: piece });
                }
              },
              piece
            )
          )
        )
        : null
    );

    function isPromotionMove(from, to) {
      const piece = chessRef.current.get(from);
      if (!piece || piece.type !== 'p') {
        return false;
      }
      if (piece.color === 'w' && to[1] === '8') {
        return true;
      }
      if (piece.color === 'b' && to[1] === '1') {
        return true;
      }
      return false;
    }
  });
});
