jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const ReactNative = require('react-native');

  const GestureScrollView = React.forwardRef(function GestureScrollViewMock(props, ref) {
    const { children, ...scrollProps } = props;
    const scrollViewRef = React.useRef(null);

    React.useImperativeHandle(ref, () => {
      const scrollView = scrollViewRef.current ?? {};
      scrollView.handlerTag = 1;
      return scrollView;
    }, []);

    return React.createElement(ReactNative.ScrollView, { ...scrollProps, ref: scrollViewRef }, children);
  });

  function createGestureMock() {
    const gesture = {
      config: {},
      handlers: {}
    };
    [
      'activateAfterLongPress',
      'blocksExternalGesture',
      'enabled',
      'minDistance',
      'runOnJS',
      'shouldCancelWhenOutside'
    ].forEach((name) => {
      gesture[name] = (value) => {
        gesture.config[name] = value;
        return gesture;
      };
    });
    ['onEnd', 'onFinalize', 'onStart', 'onUpdate'].forEach((name) => {
      gesture[name] = (handler) => {
        gesture.handlers[name] = handler;
        return gesture;
      };
    });
    return gesture;
  }

  function GestureDetectorMock({ children, gesture }) {
    const activeRef = React.useRef(false);
    const holdTimerRef = React.useRef(null);

    React.useEffect(() => () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    }, []);

    const finish = (success) => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (!activeRef.current) {
        gesture.handlers.onFinalize?.({}, false);
        return;
      }
      activeRef.current = false;
      gesture.handlers.onEnd?.({}, success);
      gesture.handlers.onFinalize?.({}, success);
    };
    const start = (event = {}) => {
      if (activeRef.current || gesture.config.enabled === false) {
        return;
      }
      activeRef.current = true;
      gesture.handlers.onStart?.({
        absoluteY: event.nativeEvent?.pageY ?? 0,
        translationY: 0
      });
    };

    return React.cloneElement(React.Children.only(children), {
      mockGesture: gesture,
      onMoveShouldSetPanResponder: (_event, state) => {
        if (!activeRef.current && (Math.abs(state.dx) > 10 || Math.abs(state.dy) > 10)) {
          if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
        }
        return activeRef.current;
      },
      onPanResponderGrant: start,
      onPanResponderMove: (event, state) => {
        gesture.handlers.onUpdate?.({
          absoluteY: event.nativeEvent?.pageY ?? 0,
          translationY: state.dy
        });
      },
      onPanResponderRelease: () => finish(true),
      onPanResponderTerminate: () => finish(false),
      onTouchCancel: () => finish(false),
      onTouchEnd: () => finish(true),
      onTouchStart: (event = {}) => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
        }
        activeRef.current = false;
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          start(event);
        }, gesture.config.activateAfterLongPress ?? 0);
      }
    });
  }

  return {
    Gesture: {
      Pan: createGestureMock
    },
    GestureDetector: GestureDetectorMock,
    GestureHandlerRootView(props) {
      return React.createElement('GestureHandlerRootView', props, props.children);
    },
    LegacyScrollView: GestureScrollView
  };
});

jest.mock('react-native-chessboard', () => {
  const React = require('react');
  const { Chess } = require('chess.js');

  return React.forwardRef(function ChessboardMock(props, ref) {
    const chessRef = React.useRef(new Chess(props.fen));
    const latestFenRef = React.useRef(props.fen);
    const playMoveRef = React.useRef(null);
    const deferNextResetRef = React.useRef(false);
    const pendingResetCompletionsRef = React.useRef([]);
    const [pendingPromotion, setPendingPromotion] = React.useState(null);
    const resetBoardMock = React.useMemo(() => jest.fn((fen) => {
      try {
        chessRef.current = new Chess(fen ?? latestFenRef.current);
      } catch {
        chessRef.current = new Chess(latestFenRef.current);
      }
      if (deferNextResetRef.current) {
        deferNextResetRef.current = false;
        return new Promise((resolve) => {
          pendingResetCompletionsRef.current.push(resolve);
        });
      }
      return Promise.resolve();
    }), []);
    const deferNextResetMock = React.useMemo(() => jest.fn(() => {
      deferNextResetRef.current = true;
    }), []);
    const completeResetMock = React.useMemo(() => jest.fn(() => {
      pendingResetCompletionsRef.current.shift()?.();
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
        mockCompleteReset: completeResetMock,
        mockDeferNextReset: deferNextResetMock,
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
