import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chess } from "chess.js";
import { currentExpectedMove } from "../../../packages/core/src/index.ts";
import { getLabPracticeService } from "./boardController.ts";

type BoardMove = {
  from: string;
  to: string;
  promotion?: string;
};

type BoardMoveResult = {
  move: BoardMove;
  state: {
    fen: string;
    isPromotion: boolean;
  };
};

type BoardPlaceholderProps = {
  boardSize?: number;
  fen: string;
  flipped?: boolean;
  gestureEnabled?: boolean;
  onIllegalMove?: (from: string, to: string) => void;
  onMove?: (result: BoardMoveResult) => void;
};

type BoardPlaceholderRef = {
  getState: () => {
    fen: string;
    isCheck: boolean;
    isCheckmate: boolean;
    isGameOver: boolean;
    isStalemate: boolean;
    turn: "b" | "w";
  };
  move: (move: BoardMove) => Promise<BoardMove | undefined>;
  resetBoard: (fen?: string) => void;
};

const BoardPlaceholder = forwardRef<BoardPlaceholderRef, BoardPlaceholderProps>(function BoardPlaceholder(
  { boardSize = 320, fen, flipped = false, gestureEnabled = true, onIllegalMove, onMove },
  ref
) {
  const chessRef = useRef(createChess(fen));
  const [displayFen, setDisplayFen] = useState(fen);

  useEffect(() => {
    chessRef.current = createChess(fen);
    setDisplayFen(chessRef.current.fen());
  }, [fen]);

  async function playMove(input: BoardMove): Promise<BoardMove | undefined> {
    if (isInputLocked(gestureEnabled)) {
      return undefined;
    }
    let played: ReturnType<Chess["move"]> | null = null;
    try {
      played = chessRef.current.move({
        from: input.from,
        to: input.to,
        ...(input.promotion ? { promotion: input.promotion } : {})
      });
    } catch {
      played = null;
    }
    if (!played) {
      onIllegalMove?.(input.from, input.to);
      return undefined;
    }
    const move: BoardMove = {
      from: played.from,
      to: played.to,
      ...(played.promotion ? { promotion: played.promotion } : {})
    };
    const nextFen = chessRef.current.fen();
    setDisplayFen(nextFen);
    onMove?.({
      move,
      state: {
        fen: nextFen,
        isPromotion: Boolean(played.promotion)
      }
    });
    return move;
  }

  function resetBoard(nextFen = fen): void {
    chessRef.current = createChess(nextFen);
    setDisplayFen(chessRef.current.fen());
  }

  useImperativeHandle(ref, () => ({
    move: playMove,
    resetBoard,
    getState: () => ({
      fen: chessRef.current.fen(),
      isCheck: chessRef.current.isCheck(),
      isCheckmate: chessRef.current.isCheckmate(),
      isGameOver: chessRef.current.isGameOver(),
      isStalemate: chessRef.current.isStalemate(),
      turn: chessRef.current.turn()
    })
  }));

  const squareSize = boardSize / 8;
  const squares = useMemo(
    () => Array.from({ length: 64 }, (_, index) => ({
      id: index,
      dark: (Math.floor(index / 8) + index % 8) % 2 === 1
    })),
    []
  );
  const expected = expectedMoveForLab();
  const locked = isInputLocked(gestureEnabled);

  return (
    <View
      accessibilityLabel={`Interaction Lab board placeholder, ${locked ? "input locked" : "input ready"}`}
      style={[styles.root, { height: boardSize, width: boardSize }]}
      testID="lab-board-placeholder"
    >
      <View style={styles.squares}>
        {squares.map((square) => (
          <View
            key={square.id}
            style={[
              styles.square,
              square.dark ? styles.darkSquare : styles.lightSquare,
              { height: squareSize, width: squareSize }
            ]}
          />
        ))}
      </View>
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>LAB ONLY · BOARD PLACEHOLDER</Text>
        </View>
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{flipped ? "Black orientation" : "White orientation"}</Text>
          <Text numberOfLines={2} style={styles.fenText}>FEN {displayFen}</Text>
          <Text style={[styles.lockText, locked ? styles.locked : styles.ready]}>
            {locked ? "Input locked" : "Input ready"}
          </Text>
        </View>
        <View style={styles.controls}>
          <LabButton
            disabled={locked || !expected}
            label="Correct move"
            testID="lab-board-correct"
            onPress={() => {
              if (expected) {
                void playMove(parseUci(expected));
              }
            }}
          />
          <LabButton
            disabled={locked}
            label="Wrong move"
            testID="lab-board-wrong"
            onPress={() => {
              const wrongMove = firstDifferentLegalMove(chessRef.current, expected);
              if (wrongMove) {
                void playMove(wrongMove);
              }
            }}
          />
          <LabButton
            disabled={locked || !expected}
            label="Complete puzzle"
            testID="lab-board-complete"
            onPress={() => {
              if (expected) {
                void playMove(parseUci(expected));
              }
            }}
          />
        </View>
      </View>
    </View>
  );
});

export default BoardPlaceholder;

function LabButton({
  disabled,
  label,
  onPress,
  testID
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.controlButton, disabled ? styles.controlButtonDisabled : null]}
      testID={testID}
    >
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

function expectedMoveForLab(): string | undefined {
  const activePuzzle = getLabPracticeService()?.getActiveSprint()?.currentPuzzle;
  if (activePuzzle?.kind === "arrow_duel") {
    return activePuzzle.correctMove;
  }
  if (activePuzzle?.kind === "line") {
    return currentExpectedMove(activePuzzle);
  }
  const reviewExpectedMove = globalThis.document
    ?.querySelector<HTMLElement>('[data-testid="review-current-expected-move"]')
    ?.textContent
    ?.trim();
  return reviewExpectedMove || undefined;
}

function firstDifferentLegalMove(chess: Chess, expected: string | undefined): BoardMove | undefined {
  const expectedNormalized = expected?.toLowerCase();
  const candidate = chess.moves({ verbose: true }).find((move) =>
    `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase() !== expectedNormalized
  );
  if (!candidate) {
    return undefined;
  }
  return {
    from: candidate.from,
    to: candidate.to,
    ...(candidate.promotion ? { promotion: candidate.promotion } : {})
  };
}

function parseUci(move: string): BoardMove {
  return {
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    ...(move.length > 4 ? { promotion: move.slice(4, 5) } : {})
  };
}

function createChess(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

function isInputLocked(gestureEnabled: boolean): boolean {
  return !gestureEnabled || Boolean(globalThis.document?.querySelector('[data-testid="board-input-blocker"]'));
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#CBD5E1",
    overflow: "hidden",
    position: "relative"
  },
  squares: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  square: {},
  lightSquare: {
    backgroundColor: "#E2E8F0"
  },
  darkSquare: {
    backgroundColor: "#94A3B8"
  },
  overlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "space-between",
    left: 0,
    padding: 8,
    position: "absolute",
    right: 0,
    top: 0
  },
  badge: {
    backgroundColor: "#FDE68A",
    borderColor: "#92400E",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeText: {
    color: "#78350F",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  stateCard: {
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderRadius: 10,
    maxWidth: "88%",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  stateTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center"
  },
  fenText: {
    color: "#CBD5E1",
    fontFamily: "monospace",
    fontSize: 9,
    marginTop: 4,
    textAlign: "center"
  },
  lockText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
    textAlign: "center"
  },
  locked: {
    color: "#FCA5A5"
  },
  ready: {
    color: "#86EFAC"
  },
  controls: {
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    width: "100%"
  },
  controlButton: {
    backgroundColor: "#FFF7ED",
    borderColor: "#C2410C",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 6
  },
  controlButtonDisabled: {
    opacity: 0.45
  },
  controlText: {
    color: "#9A3412",
    fontSize: 9,
    fontWeight: "700"
  }
});
