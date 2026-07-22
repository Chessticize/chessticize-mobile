import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { currentExpectedMove } from "../../../packages/core/src/index.ts";
import {
  getLabPracticeService,
  getLabPuzzleEntryPreviewPuzzleId,
  isLabPuzzleEntryPreviewEnabled
} from "./boardController.ts";

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

type EntryPreviewPhase = "idle" | "watching" | "ready";

type EntryPreviewPlan = {
  blunderMove: string;
  finalFen: string;
  initialFen: string;
  puzzleId: string;
};

type AnimatedPreviewMove = BoardMove & { glyph: string };

const BoardPlaceholder = forwardRef<BoardPlaceholderRef, BoardPlaceholderProps>(function BoardPlaceholder(
  { boardSize = 320, fen, flipped = false, gestureEnabled = true, onIllegalMove, onMove },
  ref
) {
  const chessRef = useRef(createChess(fen));
  const [displayFen, setDisplayFen] = useState(fen);
  const [entryPreviewPhase, setEntryPreviewPhase] = useState<EntryPreviewPhase>(() =>
    entryPreviewPlan(fen) ? "watching" : "idle"
  );
  const [animatedPreviewMove, setAnimatedPreviewMove] = useState<AnimatedPreviewMove | null>(null);
  const [previewLastMove, setPreviewLastMove] = useState<BoardMove | null>(null);
  const [previewReplayToken, setPreviewReplayToken] = useState(0);
  const previewProgress = useRef(new Animated.Value(0)).current;
  const previewedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const plan = entryPreviewPlan(fen);
    const previewKey = plan ? `${plan.puzzleId}:${previewReplayToken}` : null;
    if (!plan || previewedKeyRef.current === previewKey) {
      chessRef.current = createChess(fen);
      setDisplayFen(chessRef.current.fen());
      if (!plan) {
        setEntryPreviewPhase("idle");
        setPreviewLastMove(null);
      }
      return;
    }

    previewedKeyRef.current = previewKey;
    const previewChess = createChess(plan.initialFen);
    const move = parseUci(plan.blunderMove);
    const piece = previewChess.get(move.from as Square);
    if (!piece) {
      chessRef.current = createChess(plan.finalFen);
      setDisplayFen(chessRef.current.fen());
      setEntryPreviewPhase("ready");
      return;
    }

    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;
    chessRef.current = previewChess;
    setDisplayFen(previewChess.fen());
    setAnimatedPreviewMove({ ...move, glyph: pieceGlyph(piece.color, piece.type) });
    setPreviewLastMove(null);
    setEntryPreviewPhase("watching");
    previewProgress.setValue(0);

    const startTimer = setTimeout(() => {
      animation = Animated.timing(previewProgress, {
        duration: 760,
        easing: Easing.inOut(Easing.cubic),
        toValue: 1,
        useNativeDriver: false
      });
      animation.start(({ finished }) => {
        if (!finished || cancelled) {
          return;
        }
        chessRef.current = createChess(plan.finalFen);
        setDisplayFen(chessRef.current.fen());
        setAnimatedPreviewMove(null);
        setPreviewLastMove(move);
        setEntryPreviewPhase("ready");
      });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      animation?.stop();
    };
  }, [fen, previewProgress, previewReplayToken]);

  async function playMove(input: BoardMove): Promise<BoardMove | undefined> {
    if (isInputLocked(gestureEnabled) || entryPreviewPhase === "watching") {
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
  const previewPlan = entryPreviewPlan(fen);
  const locked = isInputLocked(gestureEnabled) || entryPreviewPhase === "watching";
  const animatedMoveGeometry = animatedPreviewMove
    ? previewMoveGeometry(animatedPreviewMove, boardSize, flipped)
    : null;

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
      {previewLastMove ? (
        <View pointerEvents="none" style={styles.previewMoveOverlay} testID="lab-blunder-last-move">
          <View style={[styles.previewMoveSquare, squareFrame(previewLastMove.from, boardSize, flipped)]} />
          <View style={[styles.previewMoveSquare, squareFrame(previewLastMove.to, boardSize, flipped)]} />
        </View>
      ) : null}
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>LAB ONLY · BOARD PLACEHOLDER</Text>
        </View>
        {entryPreviewPhase !== "idle" ? (
          <View
            style={[styles.previewStatus, entryPreviewPhase === "ready" ? styles.previewStatusReady : null]}
            testID={entryPreviewPhase === "ready" ? "lab-blunder-preview-complete" : "lab-blunder-preview-status"}
          >
            <Text style={styles.previewStatusText}>
              {entryPreviewPhase === "watching" ? "Watch the blunder" : "Your turn"}
            </Text>
          </View>
        ) : null}
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
          {previewPlan ? (
            <LabButton
              disabled={entryPreviewPhase !== "ready"}
              label="Replay blunder"
              testID="lab-board-replay-blunder"
              onPress={() => setPreviewReplayToken((token) => token + 1)}
            />
          ) : null}
        </View>
      </View>
      {animatedPreviewMove && animatedMoveGeometry ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.animatedPreviewPiece,
            {
              height: squareSize,
              width: squareSize,
              transform: [
                {
                  translateX: previewProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [animatedMoveGeometry.fromX, animatedMoveGeometry.toX]
                  })
                },
                {
                  translateY: previewProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [animatedMoveGeometry.fromY, animatedMoveGeometry.toY]
                  })
                }
              ]
            }
          ]}
          testID="lab-blunder-moving-piece"
        >
          <Text style={[styles.animatedPreviewPieceText, { fontSize: squareSize * 0.7 }]}>
            {animatedPreviewMove.glyph}
          </Text>
        </Animated.View>
      ) : null}
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
  const reviewExpectedMove = labDocument()
    ?.querySelector('[data-testid="review-current-expected-move"]')
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
  return !gestureEnabled || Boolean(labDocument()?.querySelector('[data-testid="board-input-blocker"]'));
}

function entryPreviewPlan(finalFen: string): EntryPreviewPlan | null {
  if (!isLabPuzzleEntryPreviewEnabled()) {
    return null;
  }
  const service = getLabPracticeService();
  const activePuzzle = service?.getActiveSprint()?.currentPuzzle;
  const reviewPuzzleId = labDocument()
    ?.querySelector('[data-testid="review-current-puzzle-id"]')
    ?.textContent
    ?.trim();
  const configuredPreviewPuzzleId = getLabPuzzleEntryPreviewPuzzleId();
  const fallbackPuzzleId = configuredPreviewPuzzleId ?? reviewPuzzleId;
  const puzzle = activePuzzle?.kind === "line"
    ? activePuzzle.puzzle
    : fallbackPuzzleId
      ? service?.getPuzzle(fallbackPuzzleId)
      : undefined;
  const blunderMove = puzzle?.solutionMoves[0];
  if (!puzzle || !blunderMove || normalizedFen(finalFen) === normalizedFen(puzzle.initialFen)) {
    return null;
  }
  return {
    blunderMove,
    finalFen,
    initialFen: puzzle.initialFen,
    puzzleId: puzzle.id
  };
}

function normalizedFen(fen: string): string {
  return createChess(fen).fen();
}

function labDocument(): {
  querySelector: (selector: string) => { textContent?: string | null } | null;
} | undefined {
  return (globalThis as typeof globalThis & {
    document?: { querySelector: (selector: string) => { textContent?: string | null } | null };
  }).document;
}

function pieceGlyph(color: Color, type: PieceSymbol): string {
  return PIECE_GLYPHS[color][type];
}

function previewMoveGeometry(move: BoardMove, boardSize: number, flipped: boolean): {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
} {
  const from = squareOrigin(move.from, boardSize, flipped);
  const to = squareOrigin(move.to, boardSize, flipped);
  return { fromX: from.left, fromY: from.top, toX: to.left, toY: to.top };
}

function squareFrame(square: string, boardSize: number, flipped: boolean): {
  height: number;
  left: number;
  top: number;
  width: number;
} {
  const origin = squareOrigin(square, boardSize, flipped);
  const size = boardSize / 8;
  return { ...origin, height: size, width: size };
}

function squareOrigin(square: string, boardSize: number, flipped: boolean): { left: number; top: number } {
  const file = Math.max(0, Math.min(7, square.charCodeAt(0) - 97));
  const rank = Math.max(1, Math.min(8, Number(square[1]) || 1));
  const displayFile = flipped ? 7 - file : file;
  const displayRank = flipped ? rank - 1 : 8 - rank;
  const size = boardSize / 8;
  return { left: displayFile * size, top: displayRank * size };
}

const PIECE_GLYPHS: Record<Color, Record<PieceSymbol, string>> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }
};

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
  previewMoveOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2
  },
  previewMoveSquare: {
    backgroundColor: "rgba(245, 158, 11, 0.28)",
    borderColor: "#D97706",
    borderWidth: 2,
    position: "absolute"
  },
  animatedPreviewPiece: {
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    top: 0,
    zIndex: 20
  },
  animatedPreviewPieceText: {
    color: "#0F172A",
    fontWeight: "700",
    textAlign: "center"
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
  previewStatus: {
    backgroundColor: "#FFF7ED",
    borderColor: "#EA580C",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  previewStatusReady: {
    backgroundColor: "#ECFDF5",
    borderColor: "#16A34A"
  },
  previewStatusText: {
    color: "#1E293B",
    fontSize: 11,
    fontWeight: "800"
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
    flexWrap: "wrap",
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
