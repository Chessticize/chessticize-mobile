import React, { useMemo } from "react";
import { ScrollView, View } from "react-native";
import Chessboard, { type MoveResult } from "react-native-chessboard";
import type { GameHighlightMoment } from "../../../../../packages/core/src/index.ts";
import type {
  GameReviewStore,
  StoredImportedGame
} from "../../../../../packages/storage/src/game-review-store.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";
import { makeStyles, useBoardAppearance, useTheme } from "../../theme/index.ts";
import { buildPracticeAdaptiveLayout, PRACTICE_UI_PADDING } from "../adaptivePracticeLayout.ts";
import { usePracticeViewport } from "../PracticeViewport.tsx";
import {
  ArrowCandidateOverlay,
  ArrowHint,
  BoardCoordinateOverlay,
  useBoardMoveSquareTints
} from "../practice/session/boardOverlays.tsx";
import { arrowFromTo, formatUci } from "../practice/shared/boardMove.ts";
import { chessboardColorsFor } from "../practice/shared/chessboardColors.ts";
import { chessPieceSpriteFor } from "../practice/shared/chessPieceSprite.ts";
import { AppText, Badge, Button, SegmentedControl } from "../ui/index.tsx";
import { EvalBar } from "./EvalBar.tsx";
import { EvalGraph } from "./EvalGraph.tsx";
import { GAME_REVIEW_COPY } from "./gameReviewCopy.ts";
import { GameReviewSummaryCard } from "./GameReviewSummaryCard.tsx";
import type {
  GameReviewBoardArrow,
  GameReviewBoardComponent,
  GameReviewLiveEngine,
  GameReviewMode
} from "./gameReviewTypes.ts";
import { KeyMomentRetryCard } from "./KeyMomentRetryCard.tsx";
import { LiveEngineLinesPanel } from "./LiveEngineLinesPanel.tsx";
import { MoveListStrip } from "./MoveListStrip.tsx";
import { useGameReviewController } from "./useGameReviewController.ts";

export interface GameReviewScreenProps {
  game: StoredImportedGame;
  store: GameReviewStore;
  practiceService: PracticeService;
  engine?: GameReviewLiveEngine | null;
  initialHighlights?: readonly GameHighlightMoment[];
  initialMode?: GameReviewMode;
  initialFreeAnalysisOpen?: boolean;
  pass1Depth?: number;
  pass1Nodes?: number;
  freeAnalysisDepth?: number;
  checkpointIntervalPlies?: number;
  BoardComponent?: GameReviewBoardComponent;
  onBack?: () => void;
  onPracticeGamePuzzles?: (gameId: string) => void;
}

const EVAL_BAR_SIDE_WIDTH = 42;
const BOARD_MIN_SIZE = 220;
const BOARD_MAX_PORTRAIT_SIZE = 500;
const BOARD_MAX_LANDSCAPE_SIZE = 540;

export function GameReviewScreen({
  game,
  store,
  practiceService,
  engine = null,
  initialHighlights,
  initialMode,
  initialFreeAnalysisOpen,
  pass1Depth,
  pass1Nodes,
  freeAnalysisDepth,
  checkpointIntervalPlies,
  BoardComponent = Chessboard as unknown as GameReviewBoardComponent,
  onBack,
  onPracticeGamePuzzles
}: GameReviewScreenProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { pieceSet } = useBoardAppearance();
  const viewport = usePracticeViewport();

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

  const controller = useGameReviewController({
    game,
    store,
    practiceService,
    engine,
    ...(initialHighlights === undefined ? {} : { initialHighlights }),
    ...(initialMode === undefined ? {} : { initialMode }),
    ...(initialFreeAnalysisOpen === undefined ? {} : { initialFreeAnalysisOpen }),
    ...(pass1Depth === undefined ? {} : { pass1Depth }),
    ...(pass1Nodes === undefined ? {} : { pass1Nodes }),
    ...(freeAnalysisDepth === undefined ? {} : { freeAnalysisDepth }),
    ...(checkpointIntervalPlies === undefined ? {} : { checkpointIntervalPlies })
  });

  const useHorizontalEvalBar = layout.isLargeText || viewport.width < 360;
  const boardSize = useMemo(() => {
    const evalReserve = useHorizontalEvalBar ? 0 : EVAL_BAR_SIDE_WIDTH;
    if (layout.usesSessionRail) {
      const availableWidth =
        layout.contentWidth -
        PRACTICE_UI_PADDING * 2 -
        layout.sessionRailWidth -
        layout.sessionRailGap -
        evalReserve;
      const availableHeight = layout.contentHeight - 120;
      const raw = Math.min(availableWidth, availableHeight, BOARD_MAX_LANDSCAPE_SIZE);
      return Math.max(BOARD_MIN_SIZE, Math.floor(raw));
    }
    const availableWidth = layout.contentWidth - PRACTICE_UI_PADDING * 2 - evalReserve;
    const raw = Math.min(availableWidth, BOARD_MAX_PORTRAIT_SIZE);
    return Math.max(BOARD_MIN_SIZE, Math.floor(raw));
  }, [layout, useHorizontalEvalBar]);

  const boardColors = useMemo(() => chessboardColorsFor(theme), [theme]);
  const pieceSprite = useMemo(() => chessPieceSpriteFor(pieceSet), [pieceSet]);
  const lastMove = useMemo(
    () => (controller.currentLastMoveUci ? arrowFromTo(controller.currentLastMoveUci) : null),
    [controller.currentLastMoveUci]
  );
  const lastMoveSquareTints = useBoardMoveSquareTints(
    lastMove,
    theme.colors.board.lastMoveSquare
  );

  const handleBoardMove = (result: MoveResult) => {
    controller.submitBoardMove(formatUci(result.move));
  };

  const activePuzzleId =
    controller.activeMoment?.kind === "puzzle" ? controller.activeMoment.puzzle.id : null;
  const activeMomentInReview = activePuzzleId
    ? controller.enrolledPuzzleIds.has(activePuzzleId)
    : false;

  const isScanning =
    controller.scanPhase === "scanning_pass1" || controller.scanPhase === "extracting_pass2";

  const scanBanner = renderScanBanner({
    scanPhase: controller.scanPhase,
    completedPlies: controller.scanProgress.completedPlies,
    totalPlies: controller.scanProgress.totalPlies,
    scanError: controller.scanError,
    onResume: controller.resumeAnalysis,
    styles
  });

  const modeOptions = useMemo(
    () => [
      {
        value: "moments" as const,
        label: GAME_REVIEW_COPY.header.modeKeyMoments,
        testID: "game-review-mode-moments"
      },
      {
        value: "moves" as const,
        label: GAME_REVIEW_COPY.header.modeMoves,
        testID: "game-review-mode-moves"
      }
    ],
    []
  );

  const boardStage = (
    <View style={styles.boardSection} testID="game-review-board-section">
      {useHorizontalEvalBar ? (
        <EvalBar
          flipped={controller.flipped}
          hidden={controller.isPromptHidingAnswer}
          orientation="horizontal"
          score={controller.currentScore}
          whiteWinPercent={controller.currentWhiteWinPercent}
        />
      ) : null}

      <View style={styles.boardRow}>
        {!useHorizontalEvalBar ? (
          <EvalBar
            flipped={controller.flipped}
            hidden={controller.isPromptHidingAnswer}
            length={boardSize}
            orientation="vertical"
            score={controller.currentScore}
            whiteWinPercent={controller.currentWhiteWinPercent}
          />
        ) : null}

        <View
          style={[styles.boardFrame, { width: boardSize, height: boardSize }]}
          testID="game-review-board-frame"
        >
          <BoardComponent
            boardSize={boardSize}
            colors={boardColors as Record<string, string | undefined>}
            fen={controller.currentFen}
            flipped={controller.flipped}
            gestureEnabled={true}
            onMove={handleBoardMove}
            spriteSource={pieceSprite}
            {...(lastMoveSquareTints === undefined
              ? {}
              : { squareHighlights: lastMoveSquareTints })}
          />
          <BoardCoordinateOverlay boardSize={boardSize} flipped={controller.flipped} />
          {controller.arrowDuelCandidates ? (
            <ArrowCandidateOverlay
              boardSize={boardSize}
              candidates={controller.arrowDuelCandidates}
              flipped={controller.flipped}
              testID="game-review-arrow-duel-overlay"
            />
          ) : null}
          {controller.boardArrows.length > 0 ? (
            <GameReviewArrowOverlay
              arrows={controller.boardArrows}
              boardSize={boardSize}
              flipped={controller.flipped}
            />
          ) : null}
        </View>
      </View>
    </View>
  );

  const panelsContent = (
    <View style={styles.panelsStack}>
      <EvalGraph
        onSelectPly={controller.selectPly}
        points={controller.evalGraphPoints}
        selectedPly={controller.currentPly}
        totalPlies={controller.scanProgress.totalPlies}
      />

      {controller.mode === "moments" ? (
        <KeyMomentRetryCard
          inReview={activeMomentInReview}
          isScanning={isScanning}
          moment={controller.activeMoment}
          momentIndex={controller.activeMomentIndex}
          onNext={controller.nextKeyMoment}
          onPrev={controller.prevKeyMoment}
          onRetry={controller.retryActiveKeyMoment}
          onSelectCandidate={controller.selectArrowDuelCandidate}
          onSkip={controller.skipActiveKeyMoment}
          onStepRefutationBackward={controller.stepRefutationBackward}
          onStepRefutationForward={controller.stepRefutationForward}
          onToggleRefutation={controller.toggleRefutationPlayback}
          onToggleReviewEnrollment={() => {
            if (controller.activeMoment?.kind === "puzzle") {
              controller.togglePuzzleReviewEnrollment(controller.activeMoment.puzzle);
            }
          }}
          retryState={controller.activeRetryState}
          totalMoments={controller.keyMoments.length}
        />
      ) : null}

      <MoveListStrip
        currentPly={controller.currentPly}
        evalByPly={controller.evalByPly}
        onSelectPly={controller.selectPly}
        onStepFirst={controller.stepFirst}
        onStepLast={controller.stepLast}
        onStepNext={controller.stepNext}
        onStepPrev={controller.stepPrev}
        onToggleFlip={controller.toggleFlip}
        plies={controller.parsedGame?.plies ?? []}
      />

      {controller.freeAnalysisOpen ? (
        <LiveEngineLinesPanel
          disabled={controller.isPromptHidingAnswer}
          error={controller.freeAnalysisError}
          explorationPliesCount={controller.explorationPliesCount}
          fen={controller.currentFen}
          isExploringOffLine={controller.isExploringOffLine}
          lines={controller.freeAnalysisLines}
          loading={controller.freeAnalysisLoading}
          onPlayMove={controller.playEngineLineMove}
          onReturnToGame={controller.returnToGameLine}
        />
      ) : null}

      {controller.plyEvaluations.length > 0 || controller.analysisStatus === "complete" ? (
        <GameReviewSummaryCard
          blackPlayerName={game.black.username}
          enrolledPuzzleIds={controller.enrolledPuzzleIds}
          onPracticeGamePuzzles={
            onPracticeGamePuzzles ? () => onPracticeGamePuzzles(game.id) : undefined
          }
          onSelectPuzzle={(puzzle) => {
            const index = controller.keyMoments.findIndex(
              (item) => item.kind === "puzzle" && item.puzzle.id === puzzle.id
            );
            if (index >= 0) {
              controller.selectKeyMoment(index);
            }
          }}
          onToggleReviewEnrollment={controller.togglePuzzleReviewEnrollment}
          summary={controller.summary}
          whitePlayerName={game.white.username}
        />
      ) : null}
    </View>
  );

  const headerTitle = `${game.white.username} vs ${game.black.username}`;

  return (
    <View style={styles.screen} testID="game-review-screen">
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <Button
              icon="chevronLeft"
              label={GAME_REVIEW_COPY.header.backLabel}
              onPress={onBack}
              size="compact"
              testID="game-review-back"
              variant="plain"
            />
          ) : null}
          <AppText numberOfLines={1} style={styles.headerTitle} variant="headline">
            {headerTitle}
          </AppText>
          <Button
            label={
              controller.freeAnalysisOpen
                ? GAME_REVIEW_COPY.header.engineActiveLabel
                : GAME_REVIEW_COPY.header.engineToggle
            }
            onPress={controller.toggleFreeAnalysis}
            size="compact"
            testID="game-review-engine-toggle"
            variant={controller.freeAnalysisOpen ? "primary" : "secondary"}
          />
        </View>

        <SegmentedControl
          accessibilityLabel={GAME_REVIEW_COPY.header.modeAccessibilityLabel}
          onChange={controller.setMode}
          options={modeOptions}
          testID="game-review-mode-toggle"
          value={controller.mode}
        />
      </View>

      {scanBanner}

      {controller.parseError ? (
        <View style={styles.errorBox} testID="game-review-parse-error">
          <AppText tone="negative" variant="subheadline">
            {controller.parseError}
          </AppText>
        </View>
      ) : layout.usesSessionRail ? (
        <View style={styles.railLayout} testID="game-review-rail-layout">
          <View style={styles.railBoardColumn}>{boardStage}</View>
          <ScrollView
            contentContainerStyle={styles.railPanelsContent}
            style={[styles.railPanelsColumn, { width: layout.sessionRailWidth }]}
          >
            {panelsContent}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.portraitContent}
          style={styles.portraitScroll}
          testID="game-review-portrait-scroll"
        >
          {boardStage}
          {panelsContent}
        </ScrollView>
      )}
    </View>
  );
}

function renderScanBanner({
  scanPhase,
  completedPlies,
  totalPlies,
  scanError,
  onResume,
  styles
}: {
  scanPhase: ReturnType<typeof useGameReviewController>["scanPhase"];
  completedPlies: number;
  totalPlies: number;
  scanError: string | null;
  onResume: () => void;
  styles: ReturnType<typeof useStyles>;
}): React.JSX.Element | null {
  if (scanPhase === "scanning_pass1") {
    return (
      <View style={styles.scanBanner} testID="game-review-scan-banner">
        <Badge
          label={GAME_REVIEW_COPY.status.scanningPass1(completedPlies, totalPlies)}
          tone="accent"
        />
      </View>
    );
  }
  if (scanPhase === "extracting_pass2") {
    return (
      <View style={styles.scanBanner} testID="game-review-scan-banner">
        <Badge label={GAME_REVIEW_COPY.status.extractingPass2} tone="accent" />
      </View>
    );
  }
  if (scanPhase === "paused") {
    return (
      <View style={styles.scanBanner} testID="game-review-scan-paused">
        <Badge
          label={GAME_REVIEW_COPY.status.pausedAtCheckpoint(completedPlies, totalPlies)}
          tone="warning"
        />
        <Button
          label={GAME_REVIEW_COPY.status.resumeScan}
          onPress={onResume}
          size="compact"
          testID="game-review-resume-scan"
          variant="secondary"
        />
      </View>
    );
  }
  if (scanPhase === "error") {
    return (
      <View style={styles.scanBanner} testID="game-review-scan-error">
        <AppText style={styles.scanErrorText} tone="negative" variant="footnote">
          {scanError ?? GAME_REVIEW_COPY.status.analysisError}
        </AppText>
        <Button
          label={GAME_REVIEW_COPY.status.retryScan}
          onPress={onResume}
          size="compact"
          testID="game-review-retry-scan"
          variant="secondary"
        />
      </View>
    );
  }
  return null;
}

function GameReviewArrowOverlay({
  arrows,
  boardSize,
  flipped
}: {
  arrows: readonly GameReviewBoardArrow[];
  boardSize: number;
  flipped: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const squareSize = boardSize / 8;

  return (
    <View
      pointerEvents="none"
      style={[styles.arrowOverlay, { width: boardSize, height: boardSize }]}
      testID="game-review-arrow-overlay"
    >
      {arrows.map((arrow) => {
        const from = arrowFromTo(arrow.move);
        if (!from) {
          return null;
        }
        const stroke =
          arrow.role === "best" || arrow.role === "highlight"
            ? theme.colors.positive.s600
            : arrow.role === "blunder"
              ? theme.colors.danger.s600
              : theme.colors.accent.s600;

        return (
          <View key={`${arrow.role}-${arrow.move}`} testID={`game-review-arrow-${arrow.role}-${arrow.move}`}>
            <ArrowHint
              boardSize={boardSize}
              flipped={flipped}
              from={from}
              move={arrow.move}
              opacity={0.78}
              selected={Boolean(arrow.selected)}
              squareSize={squareSize}
              stroke={stroke}
            />
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: {
    backgroundColor: theme.colors.surfaceRaised,
    flex: 1
  },
  header: {
    backgroundColor: theme.colors.surface,
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1,
    gap: 8,
    paddingHorizontal: PRACTICE_UI_PADDING,
    paddingVertical: 10
  },
  headerTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  headerTitle: {
    flex: 1
  },
  scanBanner: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: PRACTICE_UI_PADDING,
    paddingVertical: 8
  },
  scanErrorText: {
    flex: 1
  },
  errorBox: {
    padding: PRACTICE_UI_PADDING
  },
  portraitScroll: {
    flex: 1
  },
  portraitContent: {
    gap: 12,
    padding: PRACTICE_UI_PADDING
  },
  railLayout: {
    flex: 1,
    flexDirection: "row",
    gap: 14,
    padding: PRACTICE_UI_PADDING
  },
  railBoardColumn: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start"
  },
  railPanelsColumn: {
    flexGrow: 0
  },
  railPanelsContent: {
    gap: 12,
    paddingBottom: 16
  },
  boardSection: {
    alignItems: "center",
    gap: 8,
    width: "100%"
  },
  boardRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  },
  boardFrame: {
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radius[8],
    borderWidth: 1,
    overflow: "hidden",
    position: "relative"
  },
  arrowOverlay: {
    left: 0,
    position: "absolute",
    top: 0,
    zIndex: 12
  },
  panelsStack: {
    gap: 12,
    width: "100%"
  }
}));
