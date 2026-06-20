import React, { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import Chessboard from "react-native-chessboard";
import {
  currentExpectedMove,
  serializeSprintView
} from "../../../../packages/core/src/index.ts";
import type {
  ArrowDuelState,
  AttemptEvent,
  CurrentPuzzleState,
  PuzzleFeedback,
  PuzzleLineState,
  SprintMode,
  SprintState
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import { createMobilePracticeService, seededPuzzleCount } from "../backend/mobilePractice.ts";

interface Props {
  practiceService?: PracticeService;
}

type Tab = "practice" | "history" | "review";

const START_TIME = "2026-06-20T00:00:00.000Z";

export function PracticePocScreen({ practiceService }: Props): React.JSX.Element {
  const service = useMemo(() => practiceService ?? createMobilePracticeService(), [practiceService]);
  const [mode, setMode] = useState<SprintMode>("standard");
  const [tab, setTab] = useState<Tab>("practice");
  const [state, setState] = useState<SprintState | null>(null);
  const [feedback, setFeedback] = useState<PuzzleFeedback | null>(null);
  const [attempts, setAttempts] = useState<unknown[]>([]);
  const [reviews, setReviews] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  function refreshLists(): void {
    setAttempts(service.listHistory() as unknown[]);
    setReviews(service.getDueReviews("2026-06-22T00:00:00.000Z") as unknown[]);
  }

  function startSprint(nextMode = mode): void {
    try {
      setError(null);
      setFeedback(null);
      const nextState = service.startSprint(
        {
          mode: nextMode,
          durationSeconds: 300,
          perPuzzleSeconds: nextMode === "arrow_duel" ? 30 : 20,
          targetCorrect: 1,
          maxMistakes: 3,
          ...(nextMode === "standard" ? { theme: "hangingPiece" } : { minRating: 1700, maxRating: 1800 })
        },
        START_TIME
      );
      setState(nextState);
      setTab("practice");
      refreshLists();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function submitMove(move: string): void {
    try {
      setError(null);
      const result = service.submitMove(move, nextTime());
      setState(result.state.status === "active" ? result.state : result.state);
      setFeedback((result.feedback as PuzzleFeedback | undefined) ?? null);
      refreshLists();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function resetRun(): void {
    setState(null);
    setFeedback(null);
    setError(null);
    setTick(0);
    refreshLists();
  }

  function nextTime(): string {
    const nextTick = tick + 5;
    setTick(nextTick);
    return new Date(new Date(START_TIME).getTime() + nextTick * 1000).toISOString();
  }

  const currentPuzzle = state?.currentPuzzle;
  const currentFen = currentPuzzle?.currentFen ?? null;
  const sprintView = state ? (serializeSprintView(state) as Record<string, unknown>) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Chessticize</Text>
          <Text style={styles.subtitle}>Offline POC · {seededPuzzleCount()} fixture puzzles</Text>
        </View>
        <Text testID="rating-label" style={styles.rating}>
          ELO {formatRating(state)}
        </Text>
      </View>

      <View style={styles.tabs}>
        <TabButton active={tab === "practice"} label="Practice" onPress={() => setTab("practice")} />
        <TabButton active={tab === "history"} label="History" onPress={() => setTab("history")} />
        <TabButton active={tab === "review"} label="Review" onPress={() => setTab("review")} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "practice" ? (
          <>
            <View style={styles.modeRow}>
              <ModeButton active={mode === "standard"} label="Standard" onPress={() => setMode("standard")} />
              <ModeButton active={mode === "arrow_duel"} label="Arrow Duel" onPress={() => setMode("arrow_duel")} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start sprint"
                testID="start-sprint-button"
                style={styles.primaryButton}
                onPress={() => startSprint()}
              >
                <Text style={styles.primaryButtonText}>Start</Text>
              </Pressable>
            </View>

            <SessionBar state={state} sprintView={sprintView} />
            <BoardPanel currentPuzzle={currentPuzzle} fen={currentFen} />
            <MoveControls currentPuzzle={currentPuzzle} onMove={submitMove} />
            <FeedbackPanel feedback={feedback} error={error} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset local session"
              testID="reset-session-button"
              style={styles.secondaryButton}
              onPress={resetRun}
            >
              <Text style={styles.secondaryButtonText}>Reset</Text>
            </Pressable>
          </>
        ) : null}

        {tab === "history" ? <HistoryPanel attempts={attempts} /> : null}
        {tab === "review" ? <ReviewPanel reviews={reviews} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionBar({
  state,
  sprintView
}: {
  state: SprintState | null;
  sprintView: Record<string, unknown> | null;
}): React.JSX.Element {
  return (
    <View style={styles.sessionBar} testID="session-bar">
      <Text style={styles.sessionMetric}>Status {state?.status ?? "idle"}</Text>
      <Text style={styles.sessionMetric}>Correct {state?.correctCount ?? 0}</Text>
      <Text style={styles.sessionMetric}>Miss {state?.mistakeCount ?? 0}</Text>
      <Text style={styles.sessionMetric}>Target {String(sprintView?.targetCorrect ?? 1)}</Text>
    </View>
  );
}

function BoardPanel({
  currentPuzzle,
  fen
}: {
  currentPuzzle: CurrentPuzzleState | undefined;
  fen: string | null;
}): React.JSX.Element {
  return (
    <View style={styles.boardPanel} testID="board-panel">
      {fen ? (
        <Chessboard
          key={fen}
          fen={fen}
          gestureEnabled={false}
          boardSize={312}
          withLetters={false}
          withNumbers={false}
          colors={{
            white: "#EEE9DF",
            black: "#7B8F7A",
            lastMoveHighlight: "rgba(31, 41, 55, 0.18)",
            checkmateHighlight: "#B91C1C",
            promotionPieceButton: "#334155"
          }}
        />
      ) : (
        <View style={styles.emptyBoard}>
          <Text style={styles.emptyBoardText}>Ready</Text>
        </View>
      )}
      <Text testID="puzzle-id-label" style={styles.puzzleMeta}>
        {currentPuzzle ? `${currentPuzzle.puzzle.id} · ${currentPuzzle.puzzle.rating}` : "No active puzzle"}
      </Text>
    </View>
  );
}

function MoveControls({
  currentPuzzle,
  onMove
}: {
  currentPuzzle: CurrentPuzzleState | undefined;
  onMove: (move: string) => void;
}): React.JSX.Element {
  if (!currentPuzzle) {
    return (
      <View style={styles.controlPanel}>
        <Text style={styles.prompt}>Choose a mode and start.</Text>
      </View>
    );
  }

  if (currentPuzzle.kind === "arrow_duel") {
    return (
      <View style={styles.controlPanel}>
        <Text style={styles.prompt}>Select a candidate</Text>
        <View style={styles.moveGrid}>
          {currentPuzzle.candidates.map((candidate) => (
            <MoveButton key={candidate} move={candidate} onPress={onMove} />
          ))}
        </View>
      </View>
    );
  }

  const expectedMove = currentExpectedMove(currentPuzzle as PuzzleLineState);
  return (
    <View style={styles.controlPanel}>
      <Text style={styles.prompt}>Move {expectedMove ?? "complete"}</Text>
      <View style={styles.moveGrid}>
        {expectedMove ? <MoveButton move={expectedMove} onPress={onMove} /> : null}
        <MoveButton move="e6e8" tone="secondary" onPress={onMove} />
      </View>
    </View>
  );
}

function FeedbackPanel({
  feedback,
  error
}: {
  feedback: PuzzleFeedback | null;
  error: string | null;
}): React.JSX.Element {
  if (error) {
    return (
      <View style={styles.errorPanel} testID="error-panel">
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!feedback) {
    return (
      <View style={styles.feedbackPanel} testID="feedback-panel">
        <Text style={styles.feedbackText}>No attempt</Text>
      </View>
    );
  }
  return (
    <View style={styles.feedbackPanel} testID="feedback-panel">
      <Text style={styles.feedbackText}>
        {feedback.result} · expected {feedback.expectedMove}
      </Text>
      {feedback.review ? (
        <View style={styles.arrowReview} testID="arrow-review-panel">
          {feedback.review.arrows.map((arrow) => (
            <Text
              key={arrow.move}
              style={[styles.arrowText, arrow.role === "correct" ? styles.correctArrow : styles.wrongArrow]}
            >
              {arrow.role} {arrow.move} {arrow.selected ? "selected" : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HistoryPanel({ attempts }: { attempts: unknown[] }): React.JSX.Element {
  return (
    <View style={styles.listPanel} testID="history-panel">
      <Text style={styles.panelTitle}>History</Text>
      {attempts.length === 0 ? <Text style={styles.listText}>No attempts</Text> : null}
      {attempts.map((attempt) => {
        const row = attempt as AttemptEvent;
        return (
          <Text key={row.id} style={styles.listText}>
            {row.puzzleId} · {row.result} · {row.submittedMove}
          </Text>
        );
      })}
    </View>
  );
}

function ReviewPanel({ reviews }: { reviews: unknown[] }): React.JSX.Element {
  return (
    <View style={styles.listPanel} testID="review-panel">
      <Text style={styles.panelTitle}>Review</Text>
      {reviews.length === 0 ? <Text style={styles.listText}>No due reviews</Text> : null}
      {reviews.map((review) => {
        const row = review as { puzzleId: string; dueAt: string; lastResult: string };
        return (
          <Text key={row.puzzleId} style={styles.listText}>
            {row.puzzleId} · {row.lastResult} · {row.dueAt.slice(0, 10)}
          </Text>
        );
      })}
    </View>
  );
}

function ModeButton({
  active,
  label,
  onPress
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} mode`}
      testID={`${label.toLowerCase().replace(" ", "-")}-mode-button`}
      style={[styles.modeButton, active ? styles.modeButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function TabButton({
  active,
  label,
  onPress
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} tab`}
      testID={`${label.toLowerCase()}-tab`}
      style={[styles.tabButton, active ? styles.tabButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function MoveButton({
  move,
  tone = "primary",
  onPress
}: {
  move: string;
  tone?: "primary" | "secondary";
  onPress: (move: string) => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${move}`}
      testID={`move-${move}`}
      style={[styles.moveButton, tone === "secondary" ? styles.moveButtonSecondary : null]}
      onPress={() => onPress(move)}
    >
      <Text style={styles.moveButtonText}>{move}</Text>
    </Pressable>
  );
}

function formatRating(state: SprintState | null): string {
  if (!state) {
    return "600";
  }
  return String(state.ratingAfter ?? state.ratingBefore);
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F5F0"
  },
  header: {
    alignItems: "center",
    borderBottomColor: "#D8D3CA",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  title: {
    color: "#1F2937",
    fontSize: 24,
    fontWeight: "700"
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2
  },
  rating: {
    color: "#1F2937",
    fontSize: 16,
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
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    height: 40,
    justifyContent: "center"
  },
  tabButtonActive: {
    backgroundColor: "#1F2937",
    borderColor: "#1F2937"
  },
  tabText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  tabTextActive: {
    color: "#FFFFFF"
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  modeButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    height: 42,
    justifyContent: "center"
  },
  modeButtonActive: {
    backgroundColor: "#E2E8F0",
    borderColor: "#475569"
  },
  modeButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  modeButtonTextActive: {
    color: "#111827"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#1F2937",
    borderRadius: 6,
    height: 42,
    justifyContent: "center",
    minWidth: 70,
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
    borderRadius: 6,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    marginTop: 12
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  sessionBar: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
    padding: 10
  },
  sessionMetric: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700"
  },
  boardPanel: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12
  },
  emptyBoard: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#EEE9DF",
    justifyContent: "center",
    width: 312
  },
  emptyBoardText: {
    color: "#64748B",
    fontSize: 18,
    fontWeight: "700"
  },
  puzzleMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8
  },
  controlPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12
  },
  prompt: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10
  },
  moveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  moveButton: {
    alignItems: "center",
    backgroundColor: "#1F2937",
    borderRadius: 6,
    height: 42,
    justifyContent: "center",
    minWidth: 92,
    paddingHorizontal: 14
  },
  moveButtonSecondary: {
    backgroundColor: "#64748B"
  },
  moveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800"
  },
  feedbackPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12
  },
  feedbackText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700"
  },
  errorPanel: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12
  },
  errorText: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "700"
  },
  arrowReview: {
    gap: 4,
    marginTop: 8
  },
  arrowText: {
    fontSize: 13,
    fontWeight: "800"
  },
  correctArrow: {
    color: "#15803D"
  },
  wrongArrow: {
    color: "#B91C1C"
  },
  listPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  panelTitle: {
    color: "#1F2937",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10
  },
  listText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8
  }
});
