import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { PieceSymbol, Square } from "chess.js";
import Chessboard, { type ChessboardRef, type MoveResult } from "react-native-chessboard";
import {
  abortMaiaGame,
  applyMaiaGameMove,
  canAbortMaiaGame,
  computeLiveMaiaClocksMs,
  computeMaiaThinkTimeMs,
  getMaiaGameTurn,
  isMaiaUserTurn,
  maiaGameOutcomeForUser,
  maiaOppositeColor,
  offerDrawToMaia,
  pauseMaiaGameClock,
  resignMaiaGame,
  resolveMaiaTimeout,
  resumeMaiaGameClock,
  selectMaiaMove,
  setMaiaGameThinkingPace,
  type HumanPolicyModel,
  type MaiaGameClocksMs,
  type MaiaGameState,
  type MaiaThinkingPace
} from "../../../../../packages/core/src/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import {
  emitCommittedMoveFeedback,
  moveFeedbackCueForMove,
  type MoveFeedbackClient
} from "../../platform/moveFeedback.ts";
import { makeStyles, useBoardAppearance, useTheme } from "../../theme/index.ts";
import { buildPracticeAdaptiveLayout, PRACTICE_UI_PADDING } from "../adaptivePracticeLayout.ts";
import { AppModal } from "../AppModal.tsx";
import { usePracticeViewport } from "../PracticeViewport.tsx";
import { SafeAreaModalBackdrop } from "../SafeAreaModalBackdrop.tsx";
import {
  BoardCoordinateOverlay,
  useBoardMoveSquareTints
} from "../practice/session/boardOverlays.tsx";
import { arrowFromTo, formatUci } from "../practice/shared/boardMove.ts";
import { chessboardColorsFor } from "../practice/shared/chessboardColors.ts";
import { chessPieceSpriteFor } from "../practice/shared/chessPieceSprite.ts";
import { BOARD_MOVE_ANIMATION_MS } from "../practice/shared/sessionTiming.ts";
import { AppText, Badge, Button, Icon, Section, SegmentedControl } from "../ui/index.tsx";
import {
  colorBadgeSymbol,
  formatMaiaClockMs,
  formatMaiaTimeControlDisplay,
  maiaEndReasonLabel,
  maiaTimeClassLabel,
  materialAdvantageFromFen
} from "./maiaPlayPresentation.ts";

export interface MaiaPlayBoardProps {
  boardSize: number;
  colors: Record<string, string | undefined>;
  draggableColor?: "w" | "b" | null;
  durations?: { move: number };
  fen: string;
  flipped: boolean;
  gestureEnabled: boolean;
  onMove: (result: MoveResult) => void;
  spriteSource?: ReturnType<typeof chessPieceSpriteFor>;
  squareHighlights?: ReturnType<typeof useBoardMoveSquareTints>;
  withLetters?: boolean;
  withNumbers?: boolean;
}

export type MaiaPlayBoardComponent = React.ComponentType<MaiaPlayBoardProps>;

const MAIA_BOARD_DURATIONS = { move: BOARD_MOVE_ANIMATION_MS } as const;

function supportsBoardRef(component: MaiaPlayBoardComponent): boolean {
  if (component === (Chessboard as unknown as MaiaPlayBoardComponent)) {
    return true;
  }
  return Boolean(component && typeof component === "object" && "$$typeof" in component);
}

export interface MaiaPlayGameViewProps {
  initialState: MaiaGameState;
  policyModel?: HumanPolicyModel | null;
  moveFeedbackClient?: MoveFeedbackClient | null;
  moveFeedbackSettings?: { soundEnabled: boolean; hapticsEnabled: boolean };
  BoardComponent?: MaiaPlayBoardComponent;
  onPersistState: (state: MaiaGameState) => void;
  onFinishGame: (state: MaiaGameState) => MaiaGameState;
  onThinkingPaceChanged: (pace: MaiaThinkingPace) => void;
  onReviewGame: (savedGameId: string) => void;
  onRematch: () => void;
  onNewSetup: () => void;
  onExit: () => void;
}

const BOARD_MIN_SIZE = 220;
const BOARD_MAX_PORTRAIT_SIZE = 480;
const BOARD_MAX_LANDSCAPE_SIZE = 520;
const LOW_TIME_MS = 20_000;

export function MaiaPlayGameView({
  initialState,
  policyModel = null,
  moveFeedbackClient = null,
  moveFeedbackSettings = { soundEnabled: true, hapticsEnabled: true },
  BoardComponent = Chessboard as unknown as MaiaPlayBoardComponent,
  onPersistState,
  onFinishGame,
  onThinkingPaceChanged,
  onReviewGame,
  onRematch,
  onNewSetup,
  onExit
}: MaiaPlayGameViewProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const { pieceSet } = useBoardAppearance();
  const viewport = usePracticeViewport();

  const [gameState, setGameState] = useState<MaiaGameState>(() =>
    resumeMaiaGameClock(initialState, Date.now())
  );
  const stateRef = useRef<MaiaGameState>(gameState);
  stateRef.current = gameState;

  const [displayClocks, setDisplayClocks] = useState<MaiaGameClocksMs | null>(() =>
    computeLiveMaiaClocksMs(gameState, Date.now())
  );
  const [maiaThinking, setMaiaThinking] = useState(false);
  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [drawNotice, setDrawNotice] = useState<string | null>(null);
  const [measuredStageWidth, setMeasuredStageWidth] = useState<number | null>(null);

  const boardRef = useRef<ChessboardRef | null>(null);
  const moveStripRef = useRef<ScrollView | null>(null);
  const maiaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maiaPendingRef = useRef<{
    gameId: string;
    ply: number;
    uci: string;
    startedAtMs: number;
  } | null>(null);
  const maiaRequestSeqRef = useRef(0);
  const maiaAnimatingRef = useRef(false);
  const suppressedBoardMovesRef = useRef<string[]>([]);
  const mountedRef = useRef(true);
  const finishedHandledRef = useRef(initialState.status !== "playing");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearMaiaTimer = useCallback(() => {
    if (maiaTimerRef.current !== null) {
      clearTimeout(maiaTimerRef.current);
      maiaTimerRef.current = null;
    }
  }, []);

  const commitState = useCallback(
    (next: MaiaGameState) => {
      let resolved = next;
      if (next.status !== "playing" && !finishedHandledRef.current) {
        finishedHandledRef.current = true;
        clearMaiaTimer();
        maiaPendingRef.current = null;
        setMaiaThinking(false);
        resolved = onFinishGame(next);
      } else if (next.status === "playing") {
        onPersistState(next);
      }
      stateRef.current = resolved;
      setGameState(resolved);
      setDisplayClocks(computeLiveMaiaClocksMs(resolved, Date.now()));
    },
    [clearMaiaTimer, onFinishGame, onPersistState]
  );

  const emitMoveCue = useCallback(
    (fenBefore: string, uci: string, actor: "user" | "opponent") => {
      if (!moveFeedbackClient) {
        return;
      }
      const cue = moveFeedbackCueForMove(fenBefore, uci) ?? "move";
      void emitCommittedMoveFeedback(
        moveFeedbackClient,
        { actor, cue },
        moveFeedbackSettings
      );
    },
    [moveFeedbackClient, moveFeedbackSettings]
  );

  const commitPendingMaiaMove = useCallback(
    (instantOverride: boolean) => {
      const pending = maiaPendingRef.current;
      const current = stateRef.current;
      if (
        !pending ||
        current.status !== "playing" ||
        current.id !== pending.gameId ||
        current.moves.length !== pending.ply
      ) {
        return;
      }
      clearMaiaTimer();
      maiaPendingRef.current = null;
      setMaiaThinking(false);

      const nowMs = Date.now();
      const fenBefore = current.currentFen;
      const elapsed = Math.max(0, nowMs - pending.startedAtMs);
      const isInstant = instantOverride || current.thinkingPace === "instant";

      try {
        const applied = applyMaiaGameMove(current, pending.uci, {
          nowMs,
          deductClockMs: isInstant ? 0 : elapsed,
          recordedThinkTimeMs: isInstant ? 0 : elapsed
        });
        const parsedMove = arrowFromTo(pending.uci);
        const board = boardRef.current;

        if (board?.move && parsedMove) {
          maiaAnimatingRef.current = true;
          suppressedBoardMovesRef.current.push(pending.uci);
          void (async () => {
            try {
              const played = await board.move({
                from: parsedMove.from as Square,
                to: parsedMove.to as Square,
                ...(parsedMove.promotion ? { promotion: parsedMove.promotion as PieceSymbol } : {})
              });
              if (!played) {
                const idx = suppressedBoardMovesRef.current.indexOf(pending.uci);
                if (idx >= 0) {
                  suppressedBoardMovesRef.current.splice(idx, 1);
                }
              }
            } catch {
              const idx = suppressedBoardMovesRef.current.indexOf(pending.uci);
              if (idx >= 0) {
                suppressedBoardMovesRef.current.splice(idx, 1);
              }
            } finally {
              maiaAnimatingRef.current = false;
            }
            if (
              !mountedRef.current ||
              stateRef.current.status !== "playing" ||
              stateRef.current.id !== pending.gameId ||
              stateRef.current.moves.length !== pending.ply
            ) {
              return;
            }
            emitMoveCue(fenBefore, pending.uci, "opponent");
            commitState(applied.state);
            board.resetBoard?.(applied.state.currentFen);
          })();
          return;
        }

        emitMoveCue(fenBefore, pending.uci, "opponent");
        commitState(applied.state);
      } catch {
        // Position changed underneath; ignore stale pending move.
      }
    },
    [clearMaiaTimer, commitState, emitMoveCue]
  );

  const gameId = gameState.id;
  const gameStatus = gameState.status;
  const gameFen = gameState.currentFen;
  const gameMovesLen = gameState.moves.length;
  const gameMaiaRating = gameState.maiaRating;
  const gameTimeClass = gameState.timeClass;
  const gameUserColor = gameState.userColor;

  // Trigger Maia move whenever it is Maia's turn in an active game.
  useEffect(() => {
    const current = stateRef.current;
    if (gameStatus !== "playing" || isMaiaUserTurn(current)) {
      clearMaiaTimer();
      maiaPendingRef.current = null;
      setMaiaThinking(false);
      return;
    }

    const requestSeq = (maiaRequestSeqRef.current += 1);
    const snapshotGameId = gameId;
    const snapshotPly = gameMovesLen;
    const snapshotFen = gameFen;
    const snapshotRating = gameMaiaRating;
    const snapshotPace = current.thinkingPace;
    const snapshotTimeClass = gameTimeClass;
    const maiaColor = maiaOppositeColor(gameUserColor);
    const liveClocks = computeLiveMaiaClocksMs(current, Date.now());
    const startedAtMs = Date.now();

    setMaiaThinking(true);
    let cancelled = false;

    const recentPositionKeys = [
      current.initialFen.split(/\s+/).slice(0, 4).join(" "),
      ...current.moves.slice(-16).map((m) => m.fenAfter.split(/\s+/).slice(0, 4).join(" "))
    ];

    void selectMaiaMove({
      fen: snapshotFen,
      maiaRating: snapshotRating,
      ply: snapshotPly,
      recentPositionKeys,
      policyModel
    }).then((choice) => {
      if (
        cancelled ||
        maiaRequestSeqRef.current !== requestSeq ||
        stateRef.current.status !== "playing" ||
        stateRef.current.id !== snapshotGameId ||
        stateRef.current.moves.length !== snapshotPly
      ) {
        return;
      }

      maiaPendingRef.current = {
        gameId: snapshotGameId,
        ply: snapshotPly,
        uci: choice.uci,
        startedAtMs
      };

      const activePace = stateRef.current.thinkingPace ?? snapshotPace;
      const delayMs = computeMaiaThinkTimeMs({
        thinkingPace: activePace,
        timeClass: snapshotTimeClass,
        ply: snapshotPly,
        top1Prob: choice.top1Prob,
        entropy: choice.entropy,
        legalMoveCount: choice.legalMoveCount,
        maiaClockRemainingMs: liveClocks ? liveClocks[maiaColor] : null
      });

      if (delayMs <= 0) {
        maiaTimerRef.current = setTimeout(() => {
          commitPendingMaiaMove(true);
        }, 120);
      } else {
        maiaTimerRef.current = setTimeout(() => {
          commitPendingMaiaMove(false);
        }, delayMs);
      }
    });

    return () => {
      cancelled = true;
      clearMaiaTimer();
    };
  }, [
    clearMaiaTimer,
    commitPendingMaiaMove,
    gameFen,
    gameId,
    gameMaiaRating,
    gameMovesLen,
    gameStatus,
    gameTimeClass,
    gameUserColor,
    policyModel
  ]);

  // Live clock ticker + timeout enforcement (with timeout-vs-insufficient-material handling).
  useEffect(() => {
    if (gameState.status !== "playing" || !gameState.clocksMs || gameState.turnStartedAtMs === null) {
      setDisplayClocks(computeLiveMaiaClocksMs(gameState, Date.now()));
      return;
    }
    const interval = setInterval(() => {
      if (maiaAnimatingRef.current) {
        return;
      }
      const current = stateRef.current;
      if (current.status !== "playing" || !current.clocksMs || current.turnStartedAtMs === null) {
        return;
      }
      const nowMs = Date.now();
      const live = computeLiveMaiaClocksMs(current, nowMs);
      setDisplayClocks(live);
      if (live) {
        const activeTurn = getMaiaGameTurn(current);
        if (live[activeTurn] <= 0) {
          const resolved = resolveMaiaTimeout(current, activeTurn, nowMs);
          commitState(resolved);
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [commitState, gameState]);

  // Pause & persist clock when app backgrounds; resume cleanly on foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const current = stateRef.current;
      if (current.status !== "playing") {
        return;
      }
      if (nextAppState === "background" || nextAppState === "inactive") {
        const paused = pauseMaiaGameClock(current, Date.now());
        stateRef.current = paused;
        setGameState(paused);
        onPersistState(paused);
      } else if (nextAppState === "active") {
        const resumed = resumeMaiaGameClock(current, Date.now());
        stateRef.current = resumed;
        setGameState(resumed);
        setDisplayClocks(computeLiveMaiaClocksMs(resumed, Date.now()));
      }
    });
    return () => subscription.remove();
  }, [onPersistState]);

  useEffect(() => {
    moveStripRef.current?.scrollToEnd({ animated: true });
  }, [gameState.moves.length]);

  const handleToggleThinkingPace = useCallback(
    (nextPace: MaiaThinkingPace) => {
      const current = stateRef.current;
      const updated = setMaiaGameThinkingPace(current, nextPace);
      stateRef.current = updated;
      setGameState(updated);
      onThinkingPaceChanged(nextPace);
      if (updated.status === "playing") {
        onPersistState(updated);
      }
      if (nextPace === "instant" && maiaPendingRef.current) {
        commitPendingMaiaMove(true);
      }
    },
    [commitPendingMaiaMove, onPersistState, onThinkingPaceChanged]
  );

  const handleUserBoardMove = useCallback(
    (result: MoveResult) => {
      const uci = formatUci(result.move);
      const suppressedIdx = suppressedBoardMovesRef.current.indexOf(uci);
      if (suppressedIdx >= 0) {
        suppressedBoardMovesRef.current.splice(suppressedIdx, 1);
        return;
      }
      if (maiaAnimatingRef.current) {
        return;
      }
      const current = stateRef.current;
      if (current.status !== "playing" || !isMaiaUserTurn(current)) {
        return;
      }
      const fenBefore = current.currentFen;
      setDrawNotice(null);
      try {
        const applied = applyMaiaGameMove(current, uci, { nowMs: Date.now() });
        emitMoveCue(fenBefore, uci, "user");
        commitState(applied.state);
      } catch {
        // Ignore illegal move echo if board raced.
      }
    },
    [commitState, emitMoveCue]
  );

  const handleOfferDraw = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "playing" || current.moves.length < 2) {
      return;
    }
    const result = offerDrawToMaia(current);
    if (result.accepted) {
      setDrawNotice(null);
      commitState(result.state);
    } else {
      stateRef.current = result.state;
      setGameState(result.state);
      onPersistState(result.state);
      setDrawNotice(t("maiaPlay.drawDeclined"));
    }
  }, [commitState, onPersistState, t]);

  const handleAbort = useCallback(() => {
    const current = stateRef.current;
    if (!canAbortMaiaGame(current)) {
      return;
    }
    const aborted = abortMaiaGame(current);
    commitState(aborted);
    onExit();
  }, [commitState, onExit]);

  const handleConfirmResign = useCallback(() => {
    setResignConfirmOpen(false);
    const current = stateRef.current;
    if (current.status !== "playing") {
      return;
    }
    commitState(resignMaiaGame(current));
  }, [commitState]);

  const handleBackOrPause = useCallback(() => {
    const current = stateRef.current;
    if (current.status === "playing") {
      if (canAbortMaiaGame(current)) {
        const aborted = abortMaiaGame(current);
        commitState(aborted);
      } else {
        const paused = pauseMaiaGameClock(current, Date.now());
        onPersistState(paused);
      }
    }
    onExit();
  }, [commitState, onExit, onPersistState]);

  const layout = useMemo(
    () =>
      buildPracticeAdaptiveLayout({
        fontScale: viewport.fontScale ?? 1,
        height: viewport.height,
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        width: viewport.width
      }),
    [viewport.fontScale, viewport.height, viewport.width]
  );

  const boardSize = useMemo(() => {
    if (layout.usesSessionRail) {
      const fallbackWidth =
        layout.contentWidth -
        PRACTICE_UI_PADDING * 2 -
        layout.sessionRailWidth -
        layout.sessionRailGap;
      const stageWidth = measuredStageWidth ?? fallbackWidth;
      const availableHeight = layout.contentHeight - 170;
      return Math.max(
        BOARD_MIN_SIZE,
        Math.floor(Math.min(stageWidth - 4, availableHeight, BOARD_MAX_LANDSCAPE_SIZE))
      );
    }
    const stageWidth = measuredStageWidth ?? layout.contentWidth - 24;
    return Math.max(BOARD_MIN_SIZE, Math.floor(Math.min(stageWidth - 4, BOARD_MAX_PORTRAIT_SIZE)));
  }, [layout, measuredStageWidth]);

  const boardColors = useMemo(() => chessboardColorsFor(theme), [theme]);
  const pieceSprite = useMemo(() => chessPieceSpriteFor(pieceSet), [pieceSet]);
  const lastMoveUci = gameState.moves[gameState.moves.length - 1]?.uci;
  const lastMove = useMemo(() => (lastMoveUci ? arrowFromTo(lastMoveUci) : null), [lastMoveUci]);
  const squareTints = useBoardMoveSquareTints(lastMove, theme.colors.board.lastMoveSquare);

  const flipped = gameState.userColor === "b";
  const maiaColor = maiaOppositeColor(gameState.userColor);
  const activeTurn = getMaiaGameTurn(gameState);
  const userTurn = isMaiaUserTurn(gameState);
  const material = useMemo(() => materialAdvantageFromFen(gameState.currentFen), [gameState.currentFen]);
  const drawAlreadyDeclined = gameState.drawDeclinedAtPly === gameState.moves.length;

  const outcome = maiaGameOutcomeForUser(gameState);
  const outcomeTitle =
    outcome === "win"
      ? t("maiaPlay.result.win")
      : outcome === "loss"
        ? t("maiaPlay.result.loss")
        : t("maiaPlay.result.draw");
  const endReasonText = maiaEndReasonLabel(gameState.endReason, t);

  const renderClock = (color: "w" | "b") => {
    if (!displayClocks) {
      return null;
    }
    const ms = displayClocks[color];
    const isActive =
      gameState.status === "playing" && activeTurn === color && gameState.turnStartedAtMs !== null;
    const isLow = ms <= LOW_TIME_MS;
    return (
      <View
        style={[
          styles.clockBox,
          isActive ? styles.clockBoxActive : null,
          isLow && isActive ? styles.clockBoxLow : null
        ]}
        testID={color === gameState.userColor ? "maia-clock-user" : "maia-clock-maia"}
      >
        <AppText
          style={[
            styles.clockText,
            isActive ? styles.clockTextActive : null,
            isLow && isActive ? styles.clockTextLow : null
          ]}
          variant="numeral"
        >
          {formatMaiaClockMs(ms)}
        </AppText>
      </View>
    );
  };

  const boardColumn = (
    <View
      style={styles.boardColumn}
      onLayout={(event) => {
        const width = Math.floor(event.nativeEvent.layout.width);
        if (width > 0) {
          setMeasuredStageWidth((prev) => (prev === width ? prev : width));
        }
      }}
    >
      <View style={styles.playerStrip} testID="maia-opponent-strip">
        <View style={styles.playerIdentity}>
          <AppText variant="headline">{`${colorBadgeSymbol(maiaColor)} Maia ${gameState.maiaRating}`}</AppText>
          {material[maiaColor] > 0 ? (
            <AppText tone="secondary" variant="footnote">{`+${material[maiaColor]}`}</AppText>
          ) : null}
          {maiaThinking && gameState.status === "playing" ? (
            <Badge label={t("maiaPlay.thinking")} tone="neutral" />
          ) : null}
        </View>
        {renderClock(maiaColor)}
      </View>

      <View
        style={[styles.boardFrame, { width: boardSize, height: boardSize }]}
        testID="maia-game-board-frame"
      >
        <BoardComponent
          // @ts-expect-error ref forwarding for Chessboard and forwardRef test boards
          ref={supportsBoardRef(BoardComponent) ? boardRef : undefined}
          boardSize={boardSize}
          colors={boardColors as Record<string, string | undefined>}
          draggableColor={userTurn ? gameState.userColor : null}
          durations={MAIA_BOARD_DURATIONS}
          fen={gameState.currentFen}
          flipped={flipped}
          gestureEnabled={userTurn}
          spriteSource={pieceSprite}
          squareHighlights={squareTints}
          withLetters={false}
          withNumbers={false}
          onMove={handleUserBoardMove}
        />
        <BoardCoordinateOverlay boardSize={boardSize} flipped={flipped} />
      </View>

      <View style={styles.playerStrip} testID="maia-user-strip">
        <View style={styles.playerIdentity}>
          <AppText variant="headline">
            {`${colorBadgeSymbol(gameState.userColor)} ${t("maiaPlay.you")} (${gameState.userRatingAfter ?? gameState.userRatingBefore})`}
          </AppText>
          {material[gameState.userColor] > 0 ? (
            <AppText tone="secondary" variant="footnote">{`+${material[gameState.userColor]}`}</AppText>
          ) : null}
        </View>
        {renderClock(gameState.userColor)}
      </View>
    </View>
  );

  const controlsColumn = (
    <View style={[styles.controlsColumn, layout.usesSessionRail ? { width: layout.sessionRailWidth } : null]}>
      <View style={styles.moveStripCard}>
        <ScrollView
          ref={moveStripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.moveStripContent}
          testID="maia-move-strip"
        >
          {gameState.moves.length === 0 ? (
            <AppText tone="secondary" variant="footnote">
              {`${maiaTimeClassLabel(gameState.timeClass, t)} · ${formatMaiaTimeControlDisplay(gameState.timeControl, t)} · ${gameState.rated ? t("maiaPlay.mode.rated") : t("maiaPlay.mode.unrated")}`}
            </AppText>
          ) : (
            gameState.moves.map((m, idx) => (
              <AppText
                key={m.ply}
                style={idx === gameState.moves.length - 1 ? styles.latestMoveText : undefined}
                tone={idx === gameState.moves.length - 1 ? "primary" : "secondary"}
                variant="footnote"
              >
                {m.color === "w" ? `${Math.floor(idx / 2) + 1}. ${m.san}` : m.san}
              </AppText>
            ))
          )}
        </ScrollView>
      </View>

      {drawNotice && gameState.status === "playing" ? (
        <AppText style={styles.drawNotice} tone="secondary" variant="footnote" testID="maia-draw-notice">
          {drawNotice}
        </AppText>
      ) : null}

      {gameState.status === "finished" ? (
        <Section style={styles.resultCard} testID="maia-game-result">
          <View style={styles.resultHeader}>
            <AppText variant="title">{outcomeTitle}</AppText>
            <AppText tone="secondary" variant="subheadline">
              {endReasonText}
            </AppText>
            {gameState.rated && gameState.userRatingAfter !== undefined ? (
              <Badge
                label={`${gameState.userRatingBefore} → ${gameState.userRatingAfter} (${(gameState.userRatingChange ?? 0) >= 0 ? "+" : ""}${gameState.userRatingChange ?? 0})`}
                tone={
                  (gameState.userRatingChange ?? 0) > 0
                    ? "positive"
                    : (gameState.userRatingChange ?? 0) < 0
                      ? "negative"
                      : "neutral"
                }
              />
            ) : null}
            <AppText tone="secondary" variant="caption">
              {t("maiaPlay.savedToGames")}
            </AppText>
          </View>

          <View style={styles.resultActions}>
            {gameState.savedGameId ? (
              <Button
                label={t("maiaPlay.action.reviewGame")}
                stretch
                testID="maia-result-review"
                onPress={() => onReviewGame(gameState.savedGameId!)}
              />
            ) : null}
            <View style={styles.resultSecondaryRow}>
              <View style={styles.flexButton}>
                <Button
                  label={t("maiaPlay.action.rematch")}
                  stretch
                  testID="maia-result-rematch"
                  variant="secondary"
                  onPress={onRematch}
                />
              </View>
              <View style={styles.flexButton}>
                <Button
                  label={t("maiaPlay.action.newSetup")}
                  stretch
                  testID="maia-result-new-setup"
                  variant="secondary"
                  onPress={onNewSetup}
                />
              </View>
            </View>
          </View>
        </Section>
      ) : (
        <View style={styles.actionRow} testID="maia-game-actions">
          {canAbortMaiaGame(gameState) ? (
            <Button
              label={t("maiaPlay.action.abort")}
              stretch
              testID="maia-action-abort"
              variant="secondary"
              onPress={handleAbort}
            />
          ) : (
            <>
              <View style={styles.flexButton}>
                <Button
                  disabled={drawAlreadyDeclined}
                  label={t("maiaPlay.action.offerDraw")}
                  stretch
                  testID="maia-action-draw"
                  variant="secondary"
                  onPress={handleOfferDraw}
                />
              </View>
              <View style={styles.flexButton}>
                <Button
                  label={t("maiaPlay.action.resign")}
                  stretch
                  testID="maia-action-resign"
                  variant="secondary"
                  onPress={() => setResignConfirmOpen(true)}
                />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root} testID="maia-play-game">
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel={t("common.back")}
          accessibilityRole="button"
          hitSlop={10}
          style={styles.backButton}
          testID="maia-game-back"
          onPress={handleBackOrPause}
        >
          <Icon color={theme.colors.text.primary} name="chevronLeft" size={20} />
          <AppText variant="subheadline">{t("common.back")}</AppText>
        </Pressable>

        {gameState.status === "playing" ? (
          <View style={styles.paceToggleWrap}>
            <SegmentedControl<MaiaThinkingPace>
              accessibilityLabel={t("maiaPlay.setup.thinkingPace")}
              options={[
                { value: "human", label: t("maiaPlay.pace.humanShort"), testID: "maia-live-pace-human" },
                { value: "instant", label: t("maiaPlay.pace.instant"), testID: "maia-live-pace-instant" }
              ]}
              semantics="radio"
              testID="maia-live-pace-toggle"
              value={gameState.thinkingPace}
              onChange={handleToggleThinkingPace}
            />
          </View>
        ) : (
          <AppText variant="headline">{t("maiaPlay.title")}</AppText>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.stageContainer,
          layout.usesSessionRail ? styles.stageContainerRail : null
        ]}
        showsVerticalScrollIndicator={false}
      >
        {boardColumn}
        {controlsColumn}
      </ScrollView>

      <AppModal
        animationType="fade"
        transparent
        visible={resignConfirmOpen}
        onRequestClose={() => setResignConfirmOpen(false)}
      >
        <SafeAreaModalBackdrop style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setResignConfirmOpen(false)} />
          <View style={styles.confirmModal} testID="maia-resign-confirm-modal">
            <AppText variant="title">{t("maiaPlay.resignConfirm.title")}</AppText>
            <AppText tone="secondary" variant="body">
              {gameState.rated
                ? t("maiaPlay.resignConfirm.bodyRated")
                : t("maiaPlay.resignConfirm.bodyUnrated")}
            </AppText>
            <View style={styles.confirmActions}>
              <View style={styles.flexButton}>
                <Button
                  label={t("common.cancel")}
                  stretch
                  testID="maia-resign-cancel"
                  variant="secondary"
                  onPress={() => setResignConfirmOpen(false)}
                />
              </View>
              <View style={styles.flexButton}>
                <Button
                  label={t("maiaPlay.action.resign")}
                  stretch
                  testID="maia-resign-confirm"
                  variant="destructive"
                  onPress={handleConfirmResign}
                />
              </View>
            </View>
          </View>
        </SafeAreaModalBackdrop>
      </AppModal>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.screen,
    paddingVertical: theme.spacing.inline,
    gap: theme.spacing.row
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36
  },
  paceToggleWrap: {
    width: 196
  },
  stageContainer: {
    paddingHorizontal: theme.spacing.row,
    paddingBottom: 32,
    gap: theme.spacing.row,
    alignItems: "center"
  },
  stageContainerRail: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.screen,
    gap: theme.spacing.section
  },
  boardColumn: {
    width: "100%",
    maxWidth: 500,
    alignItems: "center",
    gap: theme.spacing.inline
  },
  playerStrip: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    minHeight: 36
  },
  playerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.inline,
    flexShrink: 1
  },
  clockBox: {
    minWidth: 78,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.shape.control,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.default,
    alignItems: "center"
  },
  clockBoxActive: {
    backgroundColor: theme.colors.accent.s100,
    borderColor: theme.colors.accent.s600
  },
  clockBoxLow: {
    backgroundColor: theme.colors.danger.s100,
    borderColor: theme.colors.danger.s600
  },
  clockText: {
    fontSize: 16
  },
  clockTextActive: {
    color: theme.colors.accent.s600
  },
  clockTextLow: {
    color: theme.colors.danger.s600
  },
  boardFrame: {
    borderRadius: theme.shape.control,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border.default
  },
  controlsColumn: {
    width: "100%",
    maxWidth: 500,
    gap: theme.spacing.row
  },
  moveStripCard: {
    borderRadius: theme.shape.card,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.default,
    paddingHorizontal: theme.spacing.row,
    paddingVertical: 8
  },
  moveStripContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  latestMoveText: {
    fontWeight: "700"
  },
  drawNotice: {
    textAlign: "center"
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.row
  },
  flexButton: {
    flex: 1
  },
  resultCard: {
    padding: theme.spacing.screen,
    gap: theme.spacing.section
  },
  resultHeader: {
    alignItems: "center",
    gap: 6
  },
  resultActions: {
    gap: theme.spacing.inline
  },
  resultSecondaryRow: {
    flexDirection: "row",
    gap: theme.spacing.inline
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing.screen,
    backgroundColor: theme.colors.scrim
  },
  confirmModal: {
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    borderRadius: theme.shape.sheet,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.screen,
    gap: theme.spacing.section
  },
  confirmActions: {
    flexDirection: "row",
    gap: theme.spacing.row
  }
}));
