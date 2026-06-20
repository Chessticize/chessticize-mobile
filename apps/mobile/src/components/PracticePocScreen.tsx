import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import type { MoveResult } from "react-native-chessboard";
import Chessboard, { type ChessboardRef } from "react-native-chessboard";
import {
  buildSprintConfig,
  currentExpectedMove,
  defaultSprintConfig,
  serializeSprintView
} from "../../../../packages/core/src/index.ts";
import type {
  AttemptEvent,
  CurrentPuzzleState,
  PuzzleFeedback,
  SprintConfig,
  SprintMode,
  SprintState
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import { createMobilePracticeService, seededPuzzleCount } from "../backend/mobilePractice.ts";

interface Props {
  practiceService?: PracticeService;
}

type Tab = "practice" | "review" | "history" | "settings" | "packs";

type SessionFeedback = PuzzleFeedback | null;

type ArrowDuelReviewArrow = {
  move: string;
  role: "correct" | "wrong";
  selected: boolean;
  color: "green" | "red";
};

const UI_PADDING = 16;
const MIN_BOARD = 280;
const NEUTRAL_ARROW = "#475569";
const CUSTOM_DURATION_OPTIONS = [3 * 60, 5 * 60, 10 * 60] as const;
const CUSTOM_PER_PUZZLE_OPTIONS = [10, 20, 30] as const;

export function PracticePocScreen({ practiceService }: Props): React.JSX.Element {
  const service = useMemo(() => practiceService ?? createMobilePracticeService(), [practiceService]);
  const boardRef = useRef<ChessboardRef | null>(null);
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<SprintMode>("standard");
  const [tab, setTab] = useState<Tab>("practice");
  const [state, setState] = useState<SprintState | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback>(null);
  const [attempts, setAttempts] = useState<AttemptEvent[]>([]);
  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [historyWrongLast7Days, setHistoryWrongLast7Days] = useState(false);
  const [customDurationSeconds, setCustomDurationSeconds] = useState(5 * 60);
  const [customPerPuzzleSeconds, setCustomPerPuzzleSeconds] = useState(20);

  const boardSize = useMemo(() => {
    const available = Math.max(width - UI_PADDING * 2, MIN_BOARD);
    return Math.max(MIN_BOARD, Math.min(available, 560));
  }, [width]);

  const isActive = state?.status === "active";
  const isFinished = state !== null && state.status !== "active";
  const selectedConfig = useMemo(
    () => sprintConfigFor(mode, customDurationSeconds, customPerPuzzleSeconds),
    [customDurationSeconds, customPerPuzzleSeconds, mode]
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [isActive]);

  useEffect(() => {
    if (!state || state.status !== "active") {
      return;
    }

    const deadlineMs = new Date(state.deadlineAt).getTime();
    if (nowMs <= deadlineMs) {
      return;
    }

    try {
      const expired = service.submitMove("__expired__", new Date(nowMs).toISOString());
      setState(expired.state);
      setFeedback((expired.feedback as SessionFeedback) ?? null);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [nowMs, service, state]);

  function nowIso(): string {
    return new Date(nowMs).toISOString();
  }

  function refreshState(): void {
    setAttempts(service.listHistory() as AttemptEvent[]);
    setReviews(service.getDueReviews(nowIso()) as Record<string, unknown>[]);
  }

  function startSprint(nextMode: SprintMode = mode): void {
    setError(null);
    try {
      const config = sprintConfigFor(nextMode, customDurationSeconds, customPerPuzzleSeconds);
      const started = service.startSprint({
        mode: nextMode,
        durationSeconds: config.durationSeconds,
        perPuzzleSeconds: config.perPuzzleSeconds
      });
      setMode(nextMode);
      setState(started);
      setFeedback(null);
      setTab("practice");
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function abandonSprint(): void {
    if (!state || state.status !== "active") {
      return;
    }
    try {
      const nextState = service.abandonSprint(nowIso());
      setState(nextState);
      setFeedback(null);
      refreshState();
    } catch {
      // no-op; abandon is safe fallback
    }
  }

  function onBoardMove(result: MoveResult): void {
    if (!isActive) {
      return;
    }

    const move = formatUci(result.move);
    if (!move) {
      return;
    }

    try {
      const next = service.submitMove(move, nowIso());
      setState(next.state);
      setFeedback((next.feedback as SessionFeedback) ?? null);
      refreshState();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function onIllegalMove(): void {
    if (!state?.currentPuzzle) {
      return;
    }
    setFeedback({
      result: "wrong",
      puzzleSolved: false,
      submittedMove: "__illegal__",
      expectedMove: expectedMoveForCurrent(state.currentPuzzle),
      autoPlayedMoves: [],
      currentFen: state.currentPuzzle.currentFen
    });
  }

  function resetToIdle(): void {
    setState(null);
    setFeedback(null);
    setError(null);
    refreshState();
  }

  const currentPuzzle = state?.currentPuzzle;
  const sprintElapsedMs = state ? Math.max(0, nowMs - new Date(state.startedAt).getTime()) : 0;
  const remainingMs = state ? Math.max(0, new Date(state.deadlineAt).getTime() - nowMs) : 0;
  const timerText = formatDuration(Math.max(0, Math.floor(remainingMs / 1000)));
  const sessionBar = state ? (serializeSprintView(state) as Record<string, unknown>) : null;
  const puzzleHeader = currentPuzzle
    ? `${currentPuzzle.puzzle.id} · ${currentPuzzle.puzzle.rating}`
    : "No active puzzle";
  const displayedAttempts = historyWrongLast7Days
    ? attempts.filter((attempt) => {
      const completedAt = new Date(attempt.completedAt).getTime();
      const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
      return attempt.result === "wrong" && completedAt >= sevenDaysAgo;
    })
    : attempts;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Puzzle Sprint</Text>
          <Text style={styles.subtitle}>Offline fixture · {seededPuzzleCount()} puzzles</Text>
        </View>
        <Text testID="rating-label" style={styles.rating}>{`ELO ${formatRating(state)}`}</Text>
      </View>

      {!isActive ? (
        <View style={styles.tabs}>
          <TabButton active={tab === "practice"} label="Practice" testID="practice-tab" onPress={() => setTab("practice")} />
          <TabButton active={tab === "review"} label="Review" testID="review-tab" onPress={() => setTab("review")} />
          <TabButton active={tab === "history"} label="History" testID="history-tab" onPress={() => setTab("history")} />
          <TabButton active={tab === "settings"} label="Settings" testID="settings-tab" onPress={() => setTab("settings")} />
          <TabButton active={tab === "packs"} label="Packs" testID="packs-tab" onPress={() => setTab("packs")} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "practice" ? (
          <>
            <SessionStatusBar
              mode={mode}
              state={state}
              sessionBar={sessionBar}
              timerText={timerText}
              onAbandon={isActive ? abandonSprint : undefined}
            />

            {!isActive && state === null ? (
              <ModeRow
                mode={mode}
                onChange={setMode}
                disabled={false}
              />
            ) : null}

            {!isActive && state === null && mode === "custom" ? (
              <CustomSprintSetup
                durationSeconds={customDurationSeconds}
                perPuzzleSeconds={customPerPuzzleSeconds}
                targetCorrect={selectedConfig.targetCorrect}
                ratingKey={selectedConfig.ratingKey}
                onDurationChange={setCustomDurationSeconds}
                onPerPuzzleChange={setCustomPerPuzzleSeconds}
              />
            ) : null}

            {isActive ? (
              <View style={styles.boardWrapper}>
                <View testID="session-board" style={[styles.boardSurface, { width: boardSize, height: boardSize }]}>
                  {currentPuzzle?.currentFen ? (
                    <Chessboard
                      key={`${currentPuzzle.currentFen}-${state?.mistakeCount ?? 0}`}
                      ref={boardRef}
                      fen={currentPuzzle.currentFen}
                      onMove={onBoardMove}
                      onIllegalMove={onIllegalMove}
                      gestureEnabled
                      boardSize={boardSize}
                      withLetters={false}
                      withNumbers={false}
                      colors={{
                        white: "#E6E8EB",
                        black: "#7B8794",
                        lastMoveHighlight: "rgba(31, 41, 55, 0.2)",
                        checkmateHighlight: "#DC2626",
                        promotionPieceButton: "#2563EB"
                      }}
                    />
                  ) : (
                    <View style={[styles.emptyBoard, { width: boardSize, height: boardSize }]}>
                      <Text style={styles.emptyBoardText}>Ready</Text>
                    </View>
                  )}

                  {currentPuzzle?.kind === "arrow_duel" ? (
                    <ArrowCandidateOverlay
                      boardSize={boardSize}
                      candidates={currentPuzzle.candidates}
                      feedback={feedback}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}

            <Text style={styles.puzzleMeta} testID="puzzle-id-label">
              {puzzleHeader}
            </Text>

            {isActive ? (
              <Text style={styles.prompt}>
                {currentPuzzle?.kind === "arrow_duel"
                  ? "Choose one candidate move"
                  : `Expected move: ${currentExpectedMove(currentPuzzle as CurrentPuzzleState & { kind: "line" }) ?? "..."}`}
              </Text>
            ) : null}

            {isActive && currentPuzzle?.kind === "arrow_duel" ? (
              <ArrowDuelCandidateChips
                candidates={currentPuzzle.candidates}
                feedback={feedback}
              />
            ) : null}

            {state ? (
              <>
                <Text testID="session-progress" style={styles.hiddenMetric}>
                  Progress {state.correctCount} / {state.config.targetCorrect}
                </Text>
                <Text testID="session-mistakes" style={styles.hiddenMetric}>
                  Mistakes {state.mistakeCount} / {state.config.maxMistakes}
                </Text>
              </>
            ) : null}

            {feedback ? <FeedbackPanel feedback={feedback} error={error} /> : null}

            {isFinished ? (
              <SprintSummary
                state={state}
                elapsedMs={Math.min(sprintElapsedMs, state ? state.config.durationSeconds * 1000 : sprintElapsedMs)}
                onReplay={() => startSprint(mode)}
                onBack={resetToIdle}
              />
            ) : null}

            {state?.status === "active" ? null : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Start sprint"
                  testID="start-sprint-button"
                  style={styles.primaryButton}
                  onPress={() => startSprint()}
                >
                  <Text style={styles.primaryButtonText}>Start new sprint</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset local session"
                  testID="reset-session-button"
                  style={styles.secondaryButton}
                  onPress={resetToIdle}
                >
                  <Text style={styles.secondaryButtonText}>Reset</Text>
                </Pressable>
              </>
            )}
          </>
        ) : null}

        {tab === "history" ? (
          <HistoryPanel
            attempts={displayedAttempts}
            wrongLast7Days={historyWrongLast7Days}
            onToggleWrongLast7Days={() => setHistoryWrongLast7Days((current) => !current)}
          />
        ) : null}
        {tab === "review" ? <ReviewPanel reviews={reviews} /> : null}
        {tab === "settings" ? <SettingsPanel onResetRating={() => service.resetRating(selectedConfig.ratingKey)} /> : null}
        {tab === "packs" ? <PacksPanel /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeRow({
  mode,
  onChange,
  disabled
}: {
  mode: SprintMode;
  onChange: (next: SprintMode) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.modeRow}>
      <ModeButton
        active={mode === "standard"}
        label="Standard"
        testID="practice-mode-standard"
        onPress={() => {
          if (!disabled) {
            onChange("standard");
          }
        }}
      />
      <ModeButton
        active={mode === "arrow_duel"}
        label="Arrow Duel"
        testID="practice-mode-arrow-duel"
        onPress={() => {
          if (!disabled) {
            onChange("arrow_duel");
          }
        }}
      />
      <ModeButton
        active={mode === "blitz"}
        label="Blitz"
        testID="practice-mode-blitz"
        onPress={() => {
          if (!disabled) {
            onChange("blitz");
          }
        }}
      />
      <ModeButton
        active={mode === "custom"}
        label="Custom"
        testID="practice-mode-custom"
        onPress={() => {
          if (!disabled) {
            onChange("custom");
          }
        }}
      />
    </View>
  );
}

function CustomSprintSetup({
  durationSeconds,
  perPuzzleSeconds,
  targetCorrect,
  ratingKey,
  onDurationChange,
  onPerPuzzleChange
}: {
  durationSeconds: number;
  perPuzzleSeconds: number;
  targetCorrect: number;
  ratingKey: string;
  onDurationChange: (next: number) => void;
  onPerPuzzleChange: (next: number) => void;
}): React.JSX.Element {
  return (
    <View style={styles.customPanel} testID="custom-sprint-setup">
      <View style={styles.customHeader}>
        <Text style={styles.panelTitle}>Custom sprint</Text>
        <Text testID="custom-target-count" style={styles.customTarget}>
          Target {targetCorrect}
        </Text>
      </View>
      <Text style={styles.helperText}>Time control</Text>
      <View style={styles.optionRow}>
        {CUSTOM_DURATION_OPTIONS.map((option) => (
          <OptionButton
            key={option}
            active={durationSeconds === option}
            label={formatDurationLabel(option)}
            testID={`custom-duration-${option}`}
            onPress={() => onDurationChange(option)}
          />
        ))}
      </View>
      <Text style={styles.helperText}>Seconds per puzzle</Text>
      <View style={styles.optionRow}>
        {CUSTOM_PER_PUZZLE_OPTIONS.map((option) => (
          <OptionButton
            key={option}
            active={perPuzzleSeconds === option}
            label={`${option}s`}
            testID={`custom-per-puzzle-${option}`}
            onPress={() => onPerPuzzleChange(option)}
          />
        ))}
      </View>
      <View style={styles.configSummary}>
        <Text style={styles.listText}>Miss 3 and the sprint fails</Text>
        <Text style={styles.helperText}>{ratingKey}</Text>
      </View>
    </View>
  );
}

function SessionStatusBar({
  mode,
  state,
  sessionBar,
  timerText,
  onAbandon
}: {
  mode: SprintMode;
  state: SprintState | null;
  sessionBar: Record<string, unknown> | null;
  timerText: string;
  onAbandon?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.sessionBar}>
      <Text style={styles.sessionTitle}>Mode · {mode.replace("_", " ")}</Text>
      <View style={styles.sessionMetrics}>
        <Text style={styles.sessionMetric}>Status {state?.status ?? "idle"}</Text>
        <Text style={styles.sessionMetric}>Correct {state?.correctCount ?? 0}</Text>
        <Text style={styles.sessionMetric}>Mistakes {state?.mistakeCount ?? 0}</Text>
        <Text style={styles.sessionMetric}>Target {String(sessionBar?.targetCorrect ?? "-")}</Text>
        <Text style={styles.sessionMetric}>Rating {state?.ratingAfter ?? state?.ratingBefore ?? 600}</Text>
      </View>
      <View style={styles.sessionMetricRow}>
        <Text testID="session-timer" style={styles.timerText}>Time {timerText}</Text>
        {onAbandon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abandon sprint"
            testID="session-abandon"
            style={styles.ghostButton}
            onPress={onAbandon}
          >
            <Text style={styles.ghostText}>Abandon</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ArrowDuelCandidateChips({
  candidates,
  feedback
}: {
  candidates: string[];
  feedback: SessionFeedback;
}): React.JSX.Element {
  return (
    <View style={styles.candidateRow}>
      {candidates.slice(0, 2).map((candidate, index) => {
        const review = feedback?.review?.arrows.find((arrow) => arrow.move === candidate);
        const isCorrect = review?.role === "correct";
        const isWrong = review?.role === "wrong";
        const isSelected = review?.selected ?? false;
        return (
          <View
            accessibilityLabel={`Arrow Duel candidate ${index === 0 ? "A" : "B"}`}
            key={candidate}
            testID={index === 0 ? "arrow-duel-candidate-a" : "arrow-duel-candidate-b"}
            style={[
              styles.candidateButton,
              isCorrect ? styles.candidateCorrect : null,
              isWrong ? styles.candidateWrong : null,
              isSelected ? styles.candidateSelected : null
            ]}
          >
            <Text style={styles.candidateLabel}>{index === 0 ? "A" : "B"}</Text>
            <Text style={styles.candidateMove}>{candidate}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SprintSummary({
  state,
  elapsedMs,
  onReplay,
  onBack
}: {
  state: SprintState;
  elapsedMs: number;
  onReplay: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const delta = (state.ratingAfter ?? state.ratingBefore) - state.ratingBefore;
  const reason = state.endReason === "target_reached" ? "Target reached" : state.endReason;

  return (
    <View style={styles.summaryPanel} testID="sprint-summary-panel">
      <Text style={styles.summaryTitle}>{state.status === "won" ? "Sprint complete" : "Sprint failed"}</Text>
      <Text style={styles.summaryText}>Result: {reason}</Text>
      <Text style={styles.summaryText}>Solved: {state.correctCount} / {state.config.targetCorrect}</Text>
      <Text style={styles.summaryText}>Mistakes: {state.mistakeCount} / {state.config.maxMistakes}</Text>
      <Text style={styles.summaryText}>Accuracy: {Math.round((state.correctCount / Math.max(1, state.correctCount + state.mistakeCount)) * 100)}%</Text>
      <Text style={styles.summaryText}>
        Time: {formatDuration(Math.floor(elapsedMs / 1000))}
      </Text>
      <Text style={[styles.summaryText, delta >= 0 ? styles.positive : styles.errorText]}>
        ELO {delta >= 0 ? "+" : ""}
        {delta} → {state.ratingAfter ?? state.ratingBefore}
      </Text>

      <View style={styles.summaryRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play again"
          testID="play-again-button"
          style={styles.primaryButton}
          onPress={onReplay}
        >
          <Text style={styles.primaryButtonText}>Play again</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to practice"
          testID="back-practice-button"
          style={styles.secondaryButton}
          onPress={onBack}
        >
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FeedbackPanel({
  feedback,
  error
}: {
  feedback: SessionFeedback;
  error: string | null;
}): React.JSX.Element | null {
  if (!feedback && !error) {
    return null;
  }
  if (error) {
    return (
      <View style={styles.errorPanel} testID="error-panel">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  const feedbackValue = feedback;
  if (!feedbackValue) {
    return null;
  }
  return (
    <View style={styles.feedbackPanel} testID="feedback-panel">
      <Text style={styles.feedbackText}>{feedbackValue.result} · expected {feedbackValue.expectedMove}</Text>
      {feedbackValue.review ? (
        <View style={styles.arrowReview} testID="arrow-review-panel">
          {feedbackValue.review.arrows.map((arrow) => (
            <Text
              key={arrow.move}
              style={[
                styles.arrowText,
                arrow.color === "green" ? styles.correctArrow : styles.wrongArrow,
                arrow.selected ? styles.selectedMarker : null
              ]}
            >
              {arrow.role} · {arrow.move} {arrow.selected ? "(selected)" : null}
            </Text>
          ))}
        </View>
      ) : null}
      {feedbackValue.puzzleSolved ? <Text style={styles.correctText}>Puzzle solved</Text> : null}
    </View>
  );
}

function ArrowCandidateOverlay({
  boardSize,
  candidates,
  feedback
}: {
  boardSize: number;
  candidates: string[];
  feedback: SessionFeedback;
}): React.JSX.Element {
  const squareSize = boardSize / 8;
  const reviewArrows = feedback?.review?.arrows ?? [];
  const pieceMoves = reviewArrows.length
    ? reviewArrows
    : candidates.map((candidate) => ({
    move: candidate,
    role: "candidate",
    color: "neutral",
    selected: false
  }));

  return (
    <View style={[styles.arrowLayer, { width: boardSize, height: boardSize }]} pointerEvents="none">
      {pieceMoves.map((arrow) => {
        const from = arrowFromTo(arrow.move);
        if (!from) {
          return null;
        }
        return (
          <View key={`${arrow.move}`}>
            <ArrowHint
              boardSize={boardSize}
              squareSize={squareSize}
              move={arrow.move}
              stroke={
                arrow.role === "correct" ? "#16A34A" :
                  arrow.role === "wrong" ? "#DC2626" : NEUTRAL_ARROW
              }
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
  move,
  stroke,
  selected,
  from
}: {
  boardSize: number;
  squareSize: number;
  move: string;
  stroke: string;
  selected: boolean;
  from: { from: string; to: string };
}): React.JSX.Element {
  const fromPos = squareToPixel(from.from, squareSize);
  const toPos = squareToPixel(from.to, squareSize);
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const segmentSize = selected ? 10 : 8;
  const segmentCount = Math.max(3, Math.floor(len / (squareSize * 0.3)));
  const endCapSize = selected ? 18 : 16;

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
      {Array.from({ length: segmentCount }, (_, index) => {
        const t = (index + 1) / (segmentCount + 1);
        return (
          <View
            key={`${move}-${index}`}
            style={[
              styles.arrowSegment,
              {
                backgroundColor: stroke,
                borderRadius: segmentSize / 2,
                height: segmentSize,
                left: fromPos.x + dx * t - segmentSize / 2,
                top: fromPos.y + dy * t - segmentSize / 2,
                width: segmentSize
              }
            ]}
          />
        );
      })}
        <View
          style={[
            styles.arrowEndCap,
            {
              backgroundColor: stroke,
              height: endCapSize,
              left: toPos.x - endCapSize / 2,
              top: toPos.y - endCapSize / 2,
              transform: [{ rotate: `${angle + Math.PI / 4}rad` }],
              width: endCapSize
            }
          ]}
        />
    </View>
  );
}

function HistoryPanel({
  attempts,
  wrongLast7Days,
  onToggleWrongLast7Days
}: {
  attempts: AttemptEvent[];
  wrongLast7Days: boolean;
  onToggleWrongLast7Days: () => void;
}): React.JSX.Element {
  const correct = attempts.filter((attempt) => attempt.result === "correct").length;
  const wrong = attempts.filter((attempt) => attempt.result === "wrong").length;
  const accuracy = Math.round((correct / Math.max(1, correct + wrong)) * 100);

  return (
    <View style={styles.listPanel} testID="history-panel">
      <Text style={styles.panelTitle}>History</Text>
      <View style={styles.performancePanel}>
        <Text style={styles.summaryText}>Performance</Text>
        <Text style={styles.listText}>Accuracy {accuracy}% · Correct {correct} · Wrong {wrong}</Text>
      </View>
      <View style={styles.filterRow}>
        <Text style={styles.filterPill}>7 days</Text>
        <Text style={styles.filterPill}>30 days</Text>
        <Text style={styles.filterPill}>1 year</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wrong in the last 7 days"
          testID="history-filter-wrong-7-days"
          style={[styles.filterButton, wrongLast7Days ? styles.filterButtonActive : null]}
          onPress={onToggleWrongLast7Days}
        >
          <Text style={[styles.filterButtonText, wrongLast7Days ? styles.filterButtonTextActive : null]}>Wrong 7d</Text>
        </Pressable>
      </View>
      {attempts.length === 0 ? <Text style={styles.listText}>No attempts</Text> : null}
      {attempts.map((attempt) => (
        <Text key={attempt.id} style={styles.listText}>
          {attempt.puzzleId} · {attempt.mode} · {attempt.result} · {attempt.submittedMove}
        </Text>
      ))}
    </View>
  );
}

function ReviewPanel({ reviews }: { reviews: Record<string, unknown>[] }): React.JSX.Element {
  return (
    <View style={styles.listPanel} testID="review-panel">
      <Text style={styles.panelTitle}>Review</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start due review"
        testID="review-start-due"
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>Start due review</Text>
      </Pressable>
      {reviews.length === 0 ? <Text style={styles.listText}>No due reviews</Text> : null}
      {reviews.map((review) => {
        const row = review as { puzzleId: string; dueAt: string; lastResult: string };
        return (
          <Text key={`${row.puzzleId}-${row.dueAt}`} style={styles.listText}>
            {row.puzzleId} · {row.lastResult} · {row.dueAt.slice(0, 10)}
          </Text>
        );
      })}
    </View>
  );
}

function SettingsPanel({ onResetRating }: { onResetRating: () => void }): React.JSX.Element {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  return (
    <View style={styles.listPanel} testID="settings-panel">
      <Text style={styles.panelTitle}>Settings</Text>
      <View style={styles.settingRow}>
        <View>
          <Text style={styles.listText}>iCloud sync</Text>
          <Text style={styles.helperText}>{syncEnabled ? "Syncing enabled" : "Local only"}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="iCloud sync"
          accessibilityState={{ checked: syncEnabled }}
          testID="settings-icloud-sync-toggle"
          style={[styles.switchButton, syncEnabled ? styles.switchButtonActive : null]}
          onPress={() => setSyncEnabled((current) => !current)}
        >
          <Text style={[styles.switchText, syncEnabled ? styles.switchTextActive : null]}>{syncEnabled ? "On" : "Off"}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reset ELO"
        testID="settings-reset-elo"
        style={styles.secondaryButton}
        onPress={() => {
          onResetRating();
          setResetMessage("ELO reset");
        }}
      >
        <Text style={styles.secondaryButtonText}>Reset ELO</Text>
      </Pressable>
      {resetMessage ? <Text style={styles.listText}>{resetMessage}</Text> : null}
    </View>
  );
}

function PacksPanel(): React.JSX.Element {
  return (
    <View style={styles.listPanel} testID="packs-panel">
      <Text style={styles.panelTitle}>Puzzle Packs</Text>
      <Text testID="packs-installed-core" style={styles.listText}>Core pack · installed · offline</Text>
      <Text testID="packs-license-notes" style={styles.helperText}>Source: Lichess puzzle database, presolved for Chessticize.</Text>
      <View style={styles.summaryRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Import pack" testID="packs-import" style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Import</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove pack" testID="packs-remove" style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ModeButton({
  active,
  label,
  testID,
  onPress
}: {
  active: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} mode`}
      testID={testID}
      style={[styles.modeButton, active ? styles.modeButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function OptionButton({
  active,
  label,
  testID,
  onPress
}: {
  active: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      testID={testID}
      style={[styles.optionButton, active ? styles.optionButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.optionButtonText, active ? styles.optionButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function TabButton({
  active,
  label,
  testID,
  onPress
}: {
  active: boolean;
  label: string;
  testID: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} tab`}
      testID={testID}
      style={[styles.tabButton, active ? styles.tabButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function formatUci(move: MoveResult["move"]): string {
  const promotion = move.promotion ? move.promotion.toLowerCase() : "";
  return `${move.from}${move.to}${promotion}`;
}

function formatRating(state: SprintState | null): string {
  if (!state) {
    return "600";
  }
  return String(state.ratingAfter ?? state.ratingBefore);
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatDurationLabel(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function sprintConfigFor(
  mode: SprintMode,
  customDurationSeconds: number,
  customPerPuzzleSeconds: number
): SprintConfig {
  if (mode !== "custom") {
    return defaultSprintConfig(mode);
  }
  return buildSprintConfig({
    mode,
    durationSeconds: customDurationSeconds,
    perPuzzleSeconds: customPerPuzzleSeconds
  });
}

function expectedMoveForCurrent(currentPuzzle: CurrentPuzzleState): string {
  if (currentPuzzle.kind === "arrow_duel") {
    return currentPuzzle.correctMove;
  }
  return currentExpectedMove(currentPuzzle) ?? "";
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function squareToPixel(square: string, squareSize: number): { x: number; y: number } {
  if (!/^[a-h][1-8]$/.test(square)) {
    throw new Error(`Invalid square ${square}`);
  }

  const col = square.charCodeAt(0) - "a".charCodeAt(0);
  const row = 8 - Number(square[1]);
  return {
    x: col * squareSize + squareSize / 2,
    y: row * squareSize + squareSize / 2
  };
}

function arrowFromTo(move: string): { from: string; to: string } | null {
  const match = /^([a-h][1-8])([a-h][1-8])(?:[nbrqk]?)?$/.exec(move);
  if (!match) {
    return null;
  }
  return {
    from: match[1] ?? "",
    to: match[2] ?? ""
  };
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F8FAFC",
    flex: 1
  },
  header: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: UI_PADDING,
    paddingVertical: 12
  },
  title: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "700"
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2
  },
  rating: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700"
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    padding: 12
  },
  tabButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 38,
    justifyContent: "center"
  },
  tabButtonActive: {
    backgroundColor: "#1F2937",
    borderColor: "#1F2937"
  },
  tabText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600"
  },
  tabTextActive: {
    color: "#FFFFFF"
  },
  content: {
    gap: 12,
    padding: UI_PADDING,
    paddingBottom: 40
  },
  sessionBar: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 10
  },
  sessionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700"
  },
  sessionMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  sessionMetric: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700"
  },
  sessionMetricRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  timerText: {
    color: "#111827",
    fontFamily: "menlo",
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2
  },
  boardWrapper: {
    alignItems: "center",
    justifyContent: "center"
  },
  boardSurface: {
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative"
  },
  emptyBoard: {
    alignItems: "center",
    backgroundColor: "#E6E8EB",
    justifyContent: "center"
  },
  emptyBoardText: {
    color: "#64748B",
    fontSize: 18,
    fontWeight: "700"
  },
  puzzleMeta: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center"
  },
  prompt: {
    color: "#111827",
    fontSize: 16,
    marginTop: 10,
    textAlign: "center"
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  modeButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "22%",
    flexGrow: 1,
    height: 42,
    justifyContent: "center"
  },
  modeButtonActive: {
    borderColor: "#2563EB"
  },
  modeButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  modeButtonTextActive: {
    color: "#2563EB"
  },
  customPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  customHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  customTarget: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800"
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  optionButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  optionButtonActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  optionButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  optionButtonTextActive: {
    color: "#1D4ED8"
  },
  configSummary: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    flex: 1,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  ghostButton: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  ghostText: {
    color: "#1E40AF",
    fontSize: 12,
    fontWeight: "700"
  },
  summaryPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 8
  },
  summaryTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800"
  },
  summaryText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "600"
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },
  feedbackPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 12
  },
  feedbackText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700"
  },
  errorPanel: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 12
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
    fontWeight: "700"
  },
  correctText: {
    color: "#15803D",
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700"
  },
  positive: {
    color: "#15803D",
    fontWeight: "700"
  },
  hiddenMetric: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  candidateRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  candidateButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  candidateCorrect: {
    borderColor: "#16A34A",
    backgroundColor: "#F0FDF4"
  },
  candidateWrong: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2"
  },
  candidateSelected: {
    borderWidth: 2
  },
  candidateLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800"
  },
  candidateMove: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800"
  },
  arrowReview: {
    marginTop: 8,
    gap: 4
  },
  arrowText: {
    fontSize: 14,
    fontWeight: "700"
  },
  correctArrow: {
    color: "#16A34A"
  },
  wrongArrow: {
    color: "#DC2626"
  },
  selectedMarker: {
    textDecorationLine: "underline"
  },
  listPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 8
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800"
  },
  listText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600"
  },
  helperText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600"
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterPill: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  filterButton: {
    alignItems: "center",
    borderColor: "#2563EB",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  filterButtonActive: {
    backgroundColor: "#2563EB"
  },
  filterButtonText: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "800"
  },
  filterButtonTextActive: {
    color: "#FFFFFF"
  },
  performancePanel: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 4
  },
  settingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  switchButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    minWidth: 56
  },
  switchButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB"
  },
  switchText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  switchTextActive: {
    color: "#FFFFFF"
  },
  arrowLayer: {
    position: "absolute",
    top: 0,
    left: 0
  },
  arrowLineWrap: {
    left: 0,
    position: "absolute",
    top: 0
  },
  arrowSegment: {
    position: "absolute",
    opacity: 0.9
  },
  arrowEndCap: {
    borderRadius: 3,
    opacity: 0.95,
    position: "absolute"
  }
});
