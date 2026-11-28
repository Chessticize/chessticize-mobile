import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Chessboard, { type MoveResult } from "react-native-chessboard";
import {
  defaultOnboardingGuideProgress,
  type GameHighlightMoment,
  type GamePlyEvaluation
} from "../../../../../packages/core/src/index.ts";
import type {
  GameReviewStore,
  StoredImportedGame
} from "../../../../../packages/storage/src/game-review-store.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";
import { makeStyles, useBoardAppearance, useTheme } from "../../theme/index.ts";
import { useTranslation, type TranslateFn } from "../../i18n/index.ts";
import {
  emitCommittedMoveFeedback,
  moveFeedbackCueForMove,
  type MoveFeedbackClient
} from "../../platform/moveFeedback.ts";
import { buildPracticeAdaptiveLayout, PRACTICE_UI_PADDING } from "../adaptivePracticeLayout.ts";
import { usePracticeViewport } from "../PracticeViewport.tsx";
import {
  ArrowHint,
  BoardCoordinateOverlay,
  useBoardMoveSquareTints
} from "../practice/session/boardOverlays.tsx";
import { arrowFromTo, formatUci } from "../practice/shared/boardMove.ts";
import { chessboardColorsFor } from "../practice/shared/chessboardColors.ts";
import { chessPieceSpriteFor } from "../practice/shared/chessPieceSprite.ts";
import { AppText, Badge, Button, Icon } from "../ui/index.tsx";
import { ContextualGuideCard } from "../ContextualGuideCard.tsx";
import { EvalBar } from "./EvalBar.tsx";
import { EvalGraph } from "./EvalGraph.tsx";
import {
  classificationBadgeMeta,
  formatEvalLabel,
  formatMoveNumberTag,
  formatPvMoveTokens,
  isSuboptimalClassification,
  normalizeUciMove
} from "./gameReviewHelpers.ts";
import { GameReviewSummaryCard } from "./GameReviewSummaryCard.tsx";
import type {
  GameReviewBoardArrow,
  GameReviewBoardComponent,
  GameReviewLiveEngine,
  GameReviewMode
} from "./gameReviewTypes.ts";
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
  initialPly?: number;
  initialFreeAnalysisOpen?: boolean;
  pass1Depth?: number;
  pass1Nodes?: number;
  freeAnalysisDepth?: number;
  checkpointIntervalPlies?: number;
  animateKeyMomentJump?: boolean;
  moveFeedbackClient?: MoveFeedbackClient | null;
  BoardComponent?: GameReviewBoardComponent;
  onBack?: () => void;
  onDeleteGame?: (gameId: string) => void;
  onPracticeGamePuzzles?: (
    gameId: string,
    options?: { puzzleIds?: string[]; initialIndex?: number }
  ) => void;
}

const EVAL_BAR_SIDE_WIDTH = 44;
const BOARD_FRAME_BORDER = 2;
const REVIEW_CONTENT_HORIZONTAL_PADDING = 12;
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
  initialPly,
  initialFreeAnalysisOpen,
  pass1Depth,
  pass1Nodes,
  freeAnalysisDepth,
  checkpointIntervalPlies,
  animateKeyMomentJump,
  moveFeedbackClient = null,
  BoardComponent = Chessboard as unknown as GameReviewBoardComponent,
  onBack,
  onDeleteGame,
  onPracticeGamePuzzles
}: GameReviewScreenProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const { pieceSet } = useBoardAppearance();
  const viewport = usePracticeViewport();
  const [measuredStageWidth, setMeasuredStageWidth] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [guideSeen, setGuideSeen] = useState<boolean>(
    () => practiceService.getSettings().onboarding?.gameReviewGuideSeen === true
  );

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
    ...(initialPly === undefined ? {} : { initialPly }),
    ...(initialFreeAnalysisOpen === undefined ? {} : { initialFreeAnalysisOpen }),
    ...(pass1Depth === undefined ? {} : { pass1Depth }),
    ...(pass1Nodes === undefined ? {} : { pass1Nodes }),
    ...(freeAnalysisDepth === undefined ? {} : { freeAnalysisDepth }),
    ...(checkpointIntervalPlies === undefined ? {} : { checkpointIntervalPlies }),
    ...(animateKeyMomentJump === undefined ? {} : { animateKeyMomentJump })
  });

  const useHorizontalEvalBar = layout.isLargeText || viewport.width < 360;
  const boardSize = useMemo(() => {
    const evalReserve = useHorizontalEvalBar ? 0 : EVAL_BAR_SIDE_WIDTH;
    if (layout.usesSessionRail) {
      const fallbackWidth =
        layout.contentWidth -
        PRACTICE_UI_PADDING * 2 -
        layout.sessionRailWidth -
        layout.sessionRailGap;
      const stageWidth = measuredStageWidth ?? fallbackWidth;
      const availableWidth = stageWidth - evalReserve - BOARD_FRAME_BORDER;
      const availableHeight = layout.contentHeight - 120;
      const raw = Math.min(availableWidth, availableHeight, BOARD_MAX_LANDSCAPE_SIZE);
      return Math.max(BOARD_MIN_SIZE, Math.floor(raw));
    }
    const stageWidth = measuredStageWidth ?? layout.contentWidth - REVIEW_CONTENT_HORIZONTAL_PADDING * 2;
    const availableWidth = stageWidth - evalReserve - BOARD_FRAME_BORDER;
    const raw = Math.min(availableWidth, BOARD_MAX_PORTRAIT_SIZE);
    return Math.max(BOARD_MIN_SIZE, Math.floor(raw));
  }, [layout, measuredStageWidth, useHorizontalEvalBar]);

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

  const prevBoardFenRef = useRef<string | null>(null);
  const lastMoveHapticMsRef = useRef<number>(0);
  useEffect(() => {
    const prevFen = prevBoardFenRef.current;
    prevBoardFenRef.current = controller.currentFen;
    if (prevFen === null || prevFen === controller.currentFen || !moveFeedbackClient) {
      return;
    }
    const now = Date.now();
    if (controller.isFastForwarding && now - lastMoveHapticMsRef.current < 75) {
      return;
    }
    lastMoveHapticMsRef.current = now;
    const cue =
      (controller.currentLastMoveUci
        ? moveFeedbackCueForMove(prevFen, controller.currentLastMoveUci)
        : null) ?? "move";
    void emitCommittedMoveFeedback(
      moveFeedbackClient,
      { actor: "user", cue },
      practiceService.getSettings().moveFeedback
    );
  }, [
    controller.currentFen,
    controller.currentLastMoveUci,
    controller.isFastForwarding,
    moveFeedbackClient,
    practiceService
  ]);

  const handleBoardMove = (result: MoveResult) => {
    controller.submitBoardMove(formatUci(result.move));
  };

  const isScanning =
    controller.scanPhase === "scanning_pass1" || controller.scanPhase === "extracting_pass2";

  const scanBanner = renderScanBanner({
    scanPhase: controller.scanPhase,
    completedPlies: controller.scanProgress.completedPlies,
    totalPlies: controller.scanProgress.totalPlies,
    scanError: controller.scanError,
    onResume: controller.resumeAnalysis,
    styles,
    t
  });

  const activeSelectedPly = controller.currentPly;

  const boardStage = (
    <View
      onLayout={(event) => {
        const width = Math.floor(event.nativeEvent.layout.width);
        if (width > 0) {
          setMeasuredStageWidth((prev) => (prev === width ? prev : width));
        }
      }}
      style={styles.boardSection}
      testID="game-review-board-section"
    >
      {useHorizontalEvalBar ? (
        <EvalBar
          flipped={controller.flipped}
          hidden={false}
          orientation="horizontal"
          score={controller.currentScore}
          whiteWinPercent={controller.currentWhiteWinPercent}
        />
      ) : null}

      <View style={styles.boardRow}>
        {!useHorizontalEvalBar ? (
          <EvalBar
            flipped={controller.flipped}
            hidden={false}
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
          {controller.boardArrows.length > 0 ? (
            <GameReviewArrowOverlay
              arrows={controller.boardArrows}
              boardSize={boardSize}
              flipped={controller.flipped}
            />
          ) : null}
          {!controller.whyOpen && controller.currentPlyEval && controller.currentLastMoveUci ? (
            <MoveClassificationBadgeOverlay
              boardSize={boardSize}
              classification={controller.currentPlyEval.classification}
              flipped={controller.flipped}
              moveUci={controller.currentLastMoveUci}
            />
          ) : null}
        </View>
      </View>
    </View>
  );

  const panelsContent = (
    <View style={styles.panelsStack}>
      <MoveVerdictStrip
        criticalCount={controller.criticalPlies.length}
        currentPly={activeSelectedPly}
        currentPlyEval={controller.currentPlyEval}
        hasNextCritical={controller.hasNextCritical}
        isHidingAnswer={false}
        isScanning={isScanning}
        onNextCritical={controller.jumpToNextCriticalPly}
        onToggleWhy={controller.toggleWhyRefutation}
        whyOpen={controller.whyOpen}
      />

      {controller.whyOpen ? (
        <WhyRefutationPanel
          autoPlaying={controller.whyAutoPlaying}
          baseFen={controller.whyBaseFen}
          error={controller.whyError}
          loading={controller.whyLoading}
          moves={controller.whyMoves}
          onClose={controller.closeWhyRefutation}
          onSelectStep={controller.selectWhyStep}
          onStepBackward={controller.stepWhyBackward}
          onStepForward={controller.stepWhyForward}
          onToggleAutoPlay={controller.toggleWhyAutoPlay}
          step={controller.whyStep}
        />
      ) : null}

      <EvalGraph
        onSelectPly={controller.selectPly}
        points={controller.evalGraphPoints}
        selectedPly={activeSelectedPly}
        totalPlies={controller.scanProgress.totalPlies}
      />

      <MoveListStrip
        currentPly={activeSelectedPly}
        evalByPly={controller.evalByPly}
        onSelectPly={controller.selectPly}
        onStepFirst={controller.stepFirst}
        onStepLast={controller.stepLast}
        onStepNext={controller.stepNext}
        onStepPrev={controller.stepPrev}
        onToggleFlip={controller.toggleFlip}
        plies={controller.parsedGame?.plies ?? []}
        suppressAutoScroll={controller.isFastForwarding}
      />

      {!guideSeen ? (
        <ContextualGuideCard
          body={t("onboarding.gameReviewTip.body")}
          dismissLabel={t("onboarding.gotIt")}
          dismissTestID="game-review-guide-dismiss"
          icon="whatsNew"
          testID="game-review-first-use-guide"
          title={t("onboarding.gameReviewTip.title")}
          tone="accent"
          onDismiss={() => {
            const settings = practiceService.getSettings();
            practiceService.saveSettings({
              ...settings,
              onboarding: {
                ...(settings.onboarding ?? defaultOnboardingGuideProgress()),
                gameReviewGuideSeen: true
              }
            });
            setGuideSeen(true);
          }}
        />
      ) : null}

      {controller.freeAnalysisOpen ? (
        <LiveEngineLinesPanel
          disabled={false}
          error={controller.freeAnalysisError}
          explorationPliesCount={controller.explorationPliesCount}
          fen={controller.currentFen}
          isExploringOffLine={controller.isExploringOffLine}
          lines={controller.freeAnalysisLines}
          loading={controller.freeAnalysisLoading}
          onPlayMove={controller.playEngineLineMove}
          onReturnToGame={controller.returnToGameLine}
          onToggleShowArrows={controller.toggleShowEngineArrows}
          showArrows={controller.showEngineArrows}
        />
      ) : null}

      {controller.plyEvaluations.length > 0 || controller.analysisStatus === "complete" ? (
        <GameReviewSummaryCard
          blackPlayerName={game.black.username}
          enrolledPuzzleIds={controller.enrolledPuzzleIds}
          userRating={game.userColor === "w" ? game.white.rating : game.black.rating}
          onEnrollRecommendedPuzzles={controller.enrollRecommendedPuzzlesInReview}
          onEnrollAllPuzzles={controller.enrollAllPuzzlesInReview}
          onPracticeGamePuzzles={
            onPracticeGamePuzzles ? () => onPracticeGamePuzzles(game.id) : undefined
          }
          onSelectPuzzle={(puzzle) => {
            if (onPracticeGamePuzzles) {
              const puzzleIds = controller.summary.puzzles.map((item) => item.id);
              const initialIndex = Math.max(0, puzzleIds.indexOf(puzzle.id));
              onPracticeGamePuzzles(game.id, { puzzleIds, initialIndex });
              return;
            }
            const index = controller.keyMoments.findIndex(
              (item) => item.kind === "puzzle" && item.puzzle.id === puzzle.id
            );
            if (index >= 0) {
              controller.selectKeyMoment(index);
            } else {
              controller.selectPly(puzzle.gamePly);
            }
          }}
          onToggleReviewEnrollment={controller.togglePuzzleReviewEnrollment}
          summary={controller.summary}
          whitePlayerName={game.white.username}
        />
      ) : null}

      {onDeleteGame ? (
        deleteConfirmOpen ? (
          <View style={styles.deleteConfirmCard} testID="game-review-delete-confirm">
            <AppText tone="secondary" variant="footnote">
              {t("gameReview.delete.confirmBody")}
            </AppText>
            <View style={styles.deleteConfirmActions}>
              <Button
                label={t("gameReview.delete.confirmAction")}
                size="compact"
                testID="game-review-delete-confirm-submit"
                variant="destructive"
                onPress={() => {
                  setDeleteConfirmOpen(false);
                  onDeleteGame(game.id);
                }}
              />
              <Button
                label={t("common.cancel")}
                size="compact"
                testID="game-review-delete-confirm-cancel"
                variant="secondary"
                onPress={() => setDeleteConfirmOpen(false)}
              />
            </View>
          </View>
        ) : (
          <View style={styles.deleteRow}>
            <Button
              label={t("gameReview.delete.action")}
              size="compact"
              testID="game-review-delete-game"
              variant="plain"
              onPress={() => setDeleteConfirmOpen(true)}
            />
          </View>
        )
      ) : null}
    </View>
  );

  const resolvedWhiteName =
    game.platform === "pgn" && game.white.username === "White"
      ? t("common.white")
      : game.white.username || t("common.white");
  const resolvedBlackName =
    game.platform === "pgn" && game.black.username === "Black"
      ? t("common.black")
      : game.black.username || t("common.black");
  const headerTitle = t("gameReview.header.vsTitle", {
    white: resolvedWhiteName,
    black: resolvedBlackName
  });

  return (
    <View style={styles.screen} testID="game-review-screen">
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <Button
              icon="chevronLeft"
              label={t("gameReview.header.back")}
              onPress={onBack}
              size="compact"
              testID="game-review-back"
              variant="plain"
            />
          ) : null}
          <AppText numberOfLines={1} style={styles.headerTitle} variant="headline">
            {headerTitle}
          </AppText>
          <Pressable
            accessibilityLabel={
              controller.freeAnalysisOpen
                ? t("gameReview.header.engineActive")
                : t("gameReview.header.engineToggle")
            }
            accessibilityRole="button"
            accessibilityState={{ selected: controller.freeAnalysisOpen }}
            onPress={controller.toggleFreeAnalysis}
            style={({ pressed }) => [
              styles.analysisIconButton,
              controller.freeAnalysisOpen ? styles.analysisIconButtonActive : null,
              pressed ? styles.pressed : null
            ]}
            testID="game-review-engine-toggle"
          >
            <Icon
              color={
                controller.freeAnalysisOpen
                  ? theme.colors.text.onAccent
                  : theme.colors.text.primary
              }
              name="search"
              size={18}
              weight="semibold"
            />
          </Pressable>
        </View>
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
  styles,
  t
}: {
  scanPhase: ReturnType<typeof useGameReviewController>["scanPhase"];
  completedPlies: number;
  totalPlies: number;
  scanError: string | null;
  onResume: () => void;
  styles: ReturnType<typeof useStyles>;
  t: TranslateFn;
}): React.JSX.Element | null {
  if (scanPhase === "scanning_pass1") {
    const progressPct =
      totalPlies > 0 ? Math.max(4, Math.min(100, Math.round((completedPlies / totalPlies) * 100))) : 15;
    const statusText =
      totalPlies <= 0
        ? t("gameReview.status.analyzing")
        : t("gameReview.status.analyzingPercent", {
            percent: Math.min(99, Math.round((completedPlies / totalPlies) * 100))
          });
    return (
      <View style={styles.scanProgressWrap} testID="game-review-scan-banner">
        <View style={styles.scanProgressTrack}>
          <View style={[styles.scanProgressFill, { width: `${progressPct}%` }]} />
        </View>
        <View style={styles.scanProgressRow}>
          <AppText tone="secondary" variant="caption">
            {statusText}
          </AppText>
        </View>
      </View>
    );
  }
  if (scanPhase === "extracting_pass2") {
    return (
      <View style={styles.scanProgressWrap} testID="game-review-scan-banner">
        <View style={styles.scanProgressTrack}>
          <View style={[styles.scanProgressFill, { width: "100%" }]} />
        </View>
        <View style={styles.scanProgressRow}>
          <AppText tone="secondary" variant="caption">
            {t("gameReview.status.extractingPuzzles")}
          </AppText>
        </View>
      </View>
    );
  }
  if (scanPhase === "paused") {
    const pausedLabel =
      totalPlies <= 0
        ? t("gameReview.status.paused")
        : t("gameReview.status.pausedPercent", {
            percent: Math.min(99, Math.round((completedPlies / totalPlies) * 100))
          });
    return (
      <View style={styles.scanBanner} testID="game-review-scan-paused">
        <Badge label={pausedLabel} tone="warning" />
        <Button
          label={t("gameReview.status.resume")}
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
          {scanError ?? t("gameReview.status.error")}
        </AppText>
        <Button
          label={t("gameReview.status.retry")}
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
              opacity={arrow.selected ? 0.84 : 0.42}
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

function MoveClassificationBadgeOverlay({
  boardSize,
  classification,
  flipped,
  moveUci
}: {
  boardSize: number;
  classification: GamePlyEvaluation["classification"];
  flipped: boolean;
  moveUci: string;
}): React.JSX.Element | null {
  const styles = useStyles();
  const theme = useTheme();
  const normalized = normalizeUciMove(moveUci);
  if (normalized.length < 4) {
    return null;
  }
  const destSquare = normalized.slice(2, 4);
  const fileIndex = destSquare.charCodeAt(0) - 97;
  const rankNumber = Number(destSquare[1]);
  if (fileIndex < 0 || fileIndex > 7 || !Number.isInteger(rankNumber) || rankNumber < 1 || rankNumber > 8) {
    return null;
  }
  const col = flipped ? 7 - fileIndex : fileIndex;
  const row = flipped ? rankNumber - 1 : 8 - rankNumber;
  const squareSize = boardSize / 8;
  const badgeSize = Math.max(18, Math.min(24, Math.round(squareSize * 0.44)));
  const left = Math.min(boardSize - badgeSize - 1, Math.max(1, (col + 1) * squareSize - badgeSize * 0.72));
  const top = Math.min(boardSize - badgeSize - 1, Math.max(1, row * squareSize - badgeSize * 0.22));
  const meta = classificationBadgeMeta(classification, theme.colors);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.squareBadge,
        {
          backgroundColor: meta.bgColor,
          height: badgeSize,
          left,
          minWidth: badgeSize,
          top
        }
      ]}
      testID={`game-review-square-badge-${classification}`}
    >
      <AppText
        maxFontSizeMultiplier={1.0}
        style={[styles.squareBadgeText, { color: meta.textColor }]}
        variant="caption"
      >
        {meta.glyph}
      </AppText>
    </View>
  );
}

function MoveVerdictStrip({
  criticalCount,
  currentPly,
  currentPlyEval,
  hasNextCritical,
  isHidingAnswer,
  isScanning,
  onNextCritical,
  onToggleWhy,
  whyOpen
}: {
  criticalCount: number;
  currentPly: number;
  currentPlyEval: GamePlyEvaluation | null;
  hasNextCritical: boolean;
  isHidingAnswer: boolean;
  isScanning: boolean;
  onNextCritical: () => void;
  onToggleWhy: () => void;
  whyOpen: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const canExplainWhy = Boolean(
    !isHidingAnswer && currentPlyEval && isSuboptimalClassification(currentPlyEval.classification)
  );

  let leftContent: React.JSX.Element;
  if (isHidingAnswer) {
    leftContent = (
      <AppText numberOfLines={1} tone="secondary" variant="footnote">
        {t("gameReview.header.modeKeyMoments")}
      </AppText>
    );
  } else if (currentPly <= 0) {
    leftContent = (
      <AppText numberOfLines={1} tone="secondary" variant="footnote">
        {t("gameReview.verdict.startPosition")}
      </AppText>
    );
  } else if (!currentPlyEval) {
    leftContent = (
      <AppText numberOfLines={1} tone="secondary" variant="footnote">
        {isScanning ? t("gameReview.verdict.evaluating") : "—"}
      </AppText>
    );
  } else {
    const meta = classificationBadgeMeta(currentPlyEval.classification, theme.colors);
    const classificationLabel = t(`gameReview.classification.${currentPlyEval.classification}`);
    const moveTag = `${formatMoveNumberTag(currentPlyEval.moveNumber, currentPlyEval.color)} ${currentPlyEval.san}`;
    const evalLabel = formatEvalLabel(currentPlyEval.scoreAfter);

    leftContent = (
      <View style={styles.verdictLeft}>
        <View
          style={[styles.verdictGlyph, { backgroundColor: meta.bgColor }]}
          testID="game-review-verdict-badge"
        >
          <AppText
            maxFontSizeMultiplier={1.1}
            style={[styles.verdictGlyphText, { color: meta.textColor }]}
            variant="caption"
          >
            {meta.glyph}
          </AppText>
        </View>
        <AppText numberOfLines={1} style={styles.verdictText} variant="footnote">
          {`${moveTag} · ${classificationLabel} (${evalLabel})`}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.verdictBar} testID="game-review-verdict-bar">
      <View style={styles.verdictMain}>{leftContent}</View>
      <View style={styles.criticalNavRow}>
        {canExplainWhy ? (
          <Pressable
            accessibilityLabel={t("gameReview.verdict.why")}
            accessibilityRole="button"
            accessibilityState={{ selected: whyOpen }}
            onPress={onToggleWhy}
            style={({ pressed }) => [
              styles.whyButton,
              whyOpen ? styles.whyButtonActive : null,
              pressed ? styles.pressed : null
            ]}
            testID="game-review-why-button"
          >
            <AppText
              maxFontSizeMultiplier={1.2}
              style={whyOpen ? styles.whyButtonTextActive : styles.whyButtonText}
              variant="caption"
            >
              {t("gameReview.verdict.why")}
            </AppText>
          </Pressable>
        ) : null}
        {criticalCount > 0 ? (
          <Pressable
            accessibilityLabel={t("gameReview.verdict.nextKeyA11y")}
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasNextCritical }}
            disabled={!hasNextCritical}
            onPress={onNextCritical}
            style={({ pressed }) => [
              styles.criticalNavButton,
              !hasNextCritical ? styles.criticalNavButtonDisabled : null,
              pressed && hasNextCritical ? styles.pressed : null
            ]}
            testID="game-review-next-critical"
          >
            <AppText maxFontSizeMultiplier={1.2} style={styles.criticalNavText} variant="caption">
              {t("gameReview.verdict.nextKey")}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function WhyRefutationPanel({
  autoPlaying,
  baseFen,
  error,
  loading,
  moves,
  onClose,
  onSelectStep,
  onStepBackward,
  onStepForward,
  onToggleAutoPlay,
  step
}: {
  autoPlaying: boolean;
  baseFen: string | null;
  error: string | null;
  loading: boolean;
  moves: readonly string[];
  onClose: () => void;
  onSelectStep: (step: number) => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onToggleAutoPlay: () => void;
  step: number;
}): React.JSX.Element {
  const styles = useStyles();
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView | null>(null);
  const chipOffsetsRef = useRef<Map<number, { x: number; width: number }>>(new Map());
  const scrollViewportWidthRef = useRef<number>(0);

  const tokens = useMemo(
    () => (baseFen && moves.length > 0 ? formatPvMoveTokens(baseFen, moves, 8) : []),
    [baseFen, moves]
  );

  useEffect(() => {
    const layout = chipOffsetsRef.current.get(step);
    if (!layout || !scrollRef.current?.scrollTo) {
      return;
    }
    const viewportWidth = scrollViewportWidthRef.current;
    const targetX = Math.max(0, layout.x - Math.max(0, (viewportWidth - layout.width) / 2));
    scrollRef.current.scrollTo({ x: targetX, animated: true });
  }, [step]);

  const autoPlayLabel = autoPlaying
    ? t("gameReview.why.pause")
    : step >= tokens.length && tokens.length > 0
      ? t("gameReview.why.replay")
      : t("gameReview.why.play");

  return (
    <View style={styles.whyPanel} testID="game-review-why-panel">
      <View style={styles.whyPanelHeader}>
        <AppText numberOfLines={1} style={styles.whyPanelTitle} tone="secondary" variant="caption">
          {tokens.length > 0
            ? t("gameReview.why.titleWithProgress", { step, total: tokens.length })
            : t("gameReview.why.title")}
        </AppText>
        <View style={styles.whyPanelActions}>
          {tokens.length > 0 ? (
            <>
              {tokens.length > 1 ? (
                <Pressable
                  accessibilityLabel={autoPlayLabel}
                  accessibilityRole="button"
                  onPress={onToggleAutoPlay}
                  style={({ pressed }) => [
                    styles.whyControlChip,
                    autoPlaying ? styles.whyControlChipActive : null,
                    pressed ? styles.pressed : null
                  ]}
                  testID="game-review-why-autoplay"
                >
                  <AppText
                    maxFontSizeMultiplier={1.2}
                    style={autoPlaying ? styles.whyControlTextActive : styles.whyControlText}
                    variant="caption"
                  >
                    {autoPlayLabel}
                  </AppText>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel={t("gameReview.why.prevA11y")}
                accessibilityRole="button"
                accessibilityState={{ disabled: step <= 0 }}
                disabled={step <= 0}
                onPress={onStepBackward}
                style={({ pressed }) => [
                  styles.whyControlChip,
                  step <= 0 ? styles.whyControlChipDisabled : null,
                  pressed && step > 0 ? styles.pressed : null
                ]}
                testID="game-review-why-prev"
              >
                <AppText maxFontSizeMultiplier={1.2} style={styles.whyControlText} variant="caption">
                  ‹
                </AppText>
              </Pressable>
              <Pressable
                accessibilityLabel={t("gameReview.why.nextA11y")}
                accessibilityRole="button"
                accessibilityState={{ disabled: step >= tokens.length }}
                disabled={step >= tokens.length}
                onPress={onStepForward}
                style={({ pressed }) => [
                  styles.whyControlChip,
                  step >= tokens.length ? styles.whyControlChipDisabled : null,
                  pressed && step < tokens.length ? styles.pressed : null
                ]}
                testID="game-review-why-next"
              >
                <AppText maxFontSizeMultiplier={1.2} style={styles.whyControlText} variant="caption">
                  ›
                </AppText>
              </Pressable>
            </>
          ) : null}
          <Pressable
            accessibilityLabel={t("gameReview.why.closeA11y")}
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.whyControlChip, pressed ? styles.pressed : null]}
            testID="game-review-why-close"
          >
            <AppText maxFontSizeMultiplier={1.2} style={styles.whyControlText} variant="caption">
              ×
            </AppText>
          </Pressable>
        </View>
      </View>
      {error ? (
        <AppText tone="negative" variant="footnote">
          {error}
        </AppText>
      ) : loading ? (
        <AppText testID="game-review-why-loading" tone="secondary" variant="footnote">
          {t("gameReview.why.loading")}
        </AppText>
      ) : tokens.length > 0 ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.whyMovesContent}
          horizontal
          onLayout={(event) => {
            scrollViewportWidthRef.current = event.nativeEvent.layout.width;
          }}
          showsHorizontalScrollIndicator={false}
          style={styles.whyMovesScroll}
          testID="game-review-why-san"
        >
          <Pressable
            accessibilityLabel={t("gameReview.moveStrip.start")}
            accessibilityRole="button"
            accessibilityState={{ selected: step === 0 }}
            onLayout={(event) => {
              chipOffsetsRef.current.set(0, {
                x: event.nativeEvent.layout.x,
                width: event.nativeEvent.layout.width
              });
            }}
            onPress={() => onSelectStep(0)}
            style={[styles.whyMoveChip, step === 0 ? styles.whyMoveChipSelected : null]}
            testID="game-review-why-step-0"
          >
            <AppText
              maxFontSizeMultiplier={1.3}
              style={step === 0 ? styles.whyMoveChipTextSelected : styles.whyMoveChipText}
              variant="footnote"
            >
              {t("gameReview.moveStrip.start")}
            </AppText>
          </Pressable>
          {tokens.map((token) => {
            const selected = token.step === step;
            return (
              <Pressable
                key={`why-step-${token.step}-${token.uci}`}
                accessibilityLabel={token.label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onLayout={(event) => {
                  chipOffsetsRef.current.set(token.step, {
                    x: event.nativeEvent.layout.x,
                    width: event.nativeEvent.layout.width
                  });
                }}
                onPress={() => onSelectStep(token.step)}
                style={[styles.whyMoveChip, selected ? styles.whyMoveChipSelected : null]}
                testID={`game-review-why-step-${token.step}`}
              >
                <AppText
                  maxFontSizeMultiplier={1.3}
                  style={selected ? styles.whyMoveChipTextSelected : styles.whyMoveChipText}
                  variant="footnote"
                >
                  {token.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <AppText tone="secondary" variant="footnote">
          {t("gameReview.why.unavailable")}
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: {
    backgroundColor: theme.colors.surfaceRaised,
    flex: 1
  },
  header: {
    backgroundColor: theme.colors.surfaceRaised,
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingHorizontal: REVIEW_CONTENT_HORIZONTAL_PADDING,
    paddingVertical: 6
  },
  headerTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  headerTitle: {
    flex: 1,
    textAlign: "center"
  },
  scanProgressWrap: {
    backgroundColor: theme.colors.surface,
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1
  },
  scanProgressTrack: {
    backgroundColor: theme.colors.surfaceStrong,
    height: 3,
    overflow: "hidden",
    width: "100%"
  },
  scanProgressFill: {
    backgroundColor: theme.colors.accent.fill,
    height: "100%"
  },
  scanProgressRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: PRACTICE_UI_PADDING,
    paddingVertical: 3
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
    paddingVertical: 6
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
    gap: 10,
    paddingBottom: 20,
    paddingHorizontal: REVIEW_CONTENT_HORIZONTAL_PADDING,
    paddingTop: 10
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
    gap: 10,
    paddingBottom: 16
  },
  boardSection: {
    alignItems: "center",
    gap: 6,
    width: "100%"
  },
  boardRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
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
  squareBadge: {
    alignItems: "center",
    borderColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 1.5,
    justifyContent: "center",
    paddingHorizontal: 3,
    position: "absolute",
    zIndex: 14
  },
  squareBadgeText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    lineHeight: 12,
    textAlign: "center"
  },
  verdictBar: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  verdictMain: {
    flex: 1,
    minWidth: 0
  },
  verdictLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  verdictGlyph: {
    alignItems: "center",
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 4
  },
  verdictGlyphText: {
    fontSize: 10.5,
    fontWeight: theme.fontWeight.bold,
    lineHeight: 13
  },
  verdictText: {
    color: theme.colors.text.primary,
    flex: 1,
    fontWeight: theme.fontWeight.semibold
  },
  criticalNavRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  criticalNavButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderColor: theme.colors.accent.s300,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  criticalNavButtonDisabled: {
    backgroundColor: theme.colors.surfaceSunken,
    borderColor: theme.colors.border.default,
    opacity: 0.45
  },
  criticalNavText: {
    color: theme.colors.accent.s600,
    fontWeight: theme.fontWeight.bold
  },
  analysisIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  analysisIconButtonActive: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.accent.fill
  },
  whyButton: {
    alignItems: "center",
    backgroundColor: theme.colors.danger.s50,
    borderColor: theme.colors.danger.s200,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  whyButtonActive: {
    backgroundColor: theme.colors.danger.s600,
    borderColor: theme.colors.danger.s600
  },
  whyButtonText: {
    color: theme.colors.danger.s600,
    fontWeight: theme.fontWeight.bold
  },
  whyButtonTextActive: {
    color: theme.colors.text.onTone,
    fontWeight: theme.fontWeight.bold
  },
  whyPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.danger.s200,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  whyPanelHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  whyPanelTitle: {
    flex: 1,
    fontWeight: theme.fontWeight.semibold
  },
  whyPanelActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 4
  },
  whyControlChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 26,
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  whyControlChipActive: {
    backgroundColor: theme.colors.danger.s50,
    borderColor: theme.colors.danger.s200
  },
  whyControlChipDisabled: {
    opacity: 0.4
  },
  whyControlText: {
    color: theme.colors.text.primary,
    fontWeight: theme.fontWeight.bold
  },
  whyControlTextActive: {
    color: theme.colors.danger.s600,
    fontWeight: theme.fontWeight.bold
  },
  whyMovesScroll: {
    flexGrow: 0
  },
  whyMovesContent: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2
  },
  whyMoveChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  whyMoveChipSelected: {
    backgroundColor: theme.colors.accent.fill
  },
  whyMoveChipText: {
    color: theme.colors.text.primary,
    fontWeight: theme.fontWeight.semibold
  },
  whyMoveChipTextSelected: {
    color: theme.colors.text.onAccent,
    fontWeight: theme.fontWeight.bold
  },
  pressed: {
    opacity: 0.72
  },
  panelsStack: {
    gap: 10,
    width: "100%"
  },
  deleteRow: {
    alignItems: "center",
    paddingTop: 4
  },
  deleteConfirmCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  deleteConfirmActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
}));
