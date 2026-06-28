import React from "react";
import { Chess } from "chess.js";
import TestRenderer, { act } from "react-test-renderer";
import { PracticePocScreen, type PracticeDebugTraceEvent } from "../src/components/PracticePocScreen";
import { createMobilePracticeService, seededPuzzleCount, seededUniquePositionCount } from "../src/backend/mobilePractice";
import { fixtureNeedsAtLeast } from "../../../packages/storage/src/practice-service";
import type { ArrowDuelState, SprintState } from "../../../packages/core/src/index";

const renderers: TestRenderer.ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
  jest.useRealTimers();
});

describe("PracticePocScreen", () => {
  it("exposes the mobile app shell automation contract", () => {
    const renderer = renderScreen();

    expect(findByTestId(renderer, "practice-tab")).toBeTruthy();
    expect(findByTestId(renderer, "review-tab")).toBeTruthy();
    expect(findByTestId(renderer, "history-tab")).toBeTruthy();
    expect(findByTestId(renderer, "settings-tab")).toBeTruthy();
    expect(findByTestId(renderer, "packs-tab")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-arrow-duel")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-blitz")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-custom")).toBeTruthy();
    expectText(renderer, "Offline fixture · 15 puzzles");
  });

  it("seeds enough offline demo puzzles in random test mode to avoid exhausted fixture sprints", () => {
    const service = createMobilePracticeService("random1000");

    expect(seededPuzzleCount("random1000")).toBeGreaterThanOrEqual(1000);
    expect(seededUniquePositionCount("random1000")).toBe(seededPuzzleCount("random1000"));

    const state = service.startSprint({
      mode: "custom",
      durationSeconds: 1200,
      perPuzzleSeconds: 20
    });

    expect(state.config.targetCorrect).toBe(60);
    expect(state.puzzles.length).toBe(fixtureNeedsAtLeast(state.config));
  });

  it("keeps test-only puzzle source controls off injected production-like services", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService() });

    expect(() => findByTestId(renderer, "test-puzzle-source-control")).toThrow();
  });

  it("can switch test builds between familiar and random puzzle sources", () => {
    const renderer = renderScreen();

    expect(findByTestId(renderer, "test-puzzle-source-control")).toBeTruthy();
    expectText(renderer, "Offline fixture · 15 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-familiar15"), "borderColor", "#2563EB")).toBe(true);
    expect(() => findByTestId(renderer, "test-puzzle-source-promotionSample")).toThrow();

    press(renderer, "test-puzzle-source-random1000");
    expectText(renderer, "Offline fixture · 1000 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-random1000"), "borderColor", "#2563EB")).toBe(true);

    press(renderer, "test-puzzle-source-familiar15");
    expectText(renderer, "Offline fixture · 15 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-familiar15"), "borderColor", "#2563EB")).toBe(true);
  });

  it("accepts a non-official legal checkmate in the fixed first familiar puzzle", async () => {
    const renderer = renderScreen();

    press(renderer, "start-sprint-button");
    expectText(renderer, "Find the best move for white.");
    expectText(renderer, "0 / 15");

    await boardMove(renderer, "c2b1");

    expect(() => findByTestId(renderer, "mock-promotion-dialog")).toThrow();
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expectText(renderer, "1 / 15");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 15");

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "Standard · correct · c2b1");
  });

  it("submits standard puzzle moves through the board and records attempt history", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    const board = findByTestId(renderer, "mock-chessboard");
    const fenBeforeAutoReply = board.props.fen;
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(countPiecesInFen(board.props.fen)).toBeGreaterThan(0);
    expect(board.props.spriteSource).toBeTruthy();
    expect(board.props.colors.lastMoveHighlight).toBe("rgba(0, 0, 0, 0)");
    expect(board.props.colors.validMoveDot).toBe("rgba(15, 23, 42, 0.36)");
    expect(board.props.colors.validMoveCapture).toBe("rgba(15, 23, 42, 0.56)");
    expect(board.props.draggableColor).toBe("w");
    expect(findByTestId(renderer, "session-timer")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress")).toBeTruthy();
    expect(findByTestId(renderer, "session-strikes")).toBeTruthy();
    expect(collectText(renderer.root)).not.toContain("Expected move");
    expect(collectText(renderer.root)).not.toContain("000hf · 1485");

    await boardMove(renderer, "e2e6");
    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(fenBeforeAutoReply);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(null);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "move-feedback-overlay"), "borderWidth", 2)).toBe(false);

    await settleFeedbackSnapshot();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).not.toBe(fenBeforeAutoReply);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("w");
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(false);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBeGreaterThanOrEqual(2);

    await boardMove(renderer, "e6f7");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);
    await settleFeedbackSnapshot();

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "Standard · correct · e6f7");
    expect(collectText(renderer.root)).not.toContain("000hf · standard");
  });

  it("locks the board during an opponent reply and ignores attempted extra user moves", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    press(renderer, "start-sprint-button");

    await boardMove(renderer, "e2e6");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(null);
    expect(findByTestId(renderer, "board-input-blocker")).toBeTruthy();
    expectText(renderer, "0 / 15");

    await boardMoveWithCallback(
      findByTestId(renderer, "mock-chessboard").props.onMove,
      "e6f7",
      null
    );

    expect(trace.some((event) =>
      event.type === "move-ignored" &&
      event.reason === "board-locked" &&
      event.move === "e6f7"
    )).toBe(true);
    expectText(renderer, "0 / 15");

    await settleFeedbackSnapshot();

    expectText(renderer, "0 / 15");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("w");
    expect(() => findByTestId(renderer, "board-input-blocker")).toThrow();
    await boardMove(renderer, "e6f7");

    expectText(renderer, "1 / 15");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);

    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("b");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
  });

  it("discards opponent-piece drags during the opponent reply animation", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    press(renderer, "start-sprint-button");
    const firstBoard = findByTestId(renderer, "mock-chessboard");
    const firstPuzzleFen = firstBoard.props.fen;
    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(null);
    await boardMoveWithCallback(
      findByTestId(renderer, "mock-chessboard").props.onMove,
      "f7e8",
      mustFenAfterMove(mustFenAfterMove(firstPuzzleFen, "e2e6"), "f7e8")
    );

    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(trace.some((event) =>
      event.type === "move-ignored" &&
      event.reason === "board-locked" &&
      event.move === "f7e8"
    )).toBe(true);
    expect(trace.some((event) =>
      event.type === "board-reset" &&
      event.reason === "board-locked" &&
      event.move === "f7e8"
    )).toBe(true);

    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");

    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
  });

  it("resets illegal drags during the opponent reply animation instead of stalling the board", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(null);
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onIllegalMove("d8", "a8");
    });

    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(trace.some((event) =>
      event.type === "move-ignored" &&
      event.reason === "board-locked-illegal-move" &&
      event.move === "d8a8"
    )).toBe(true);
    expect(trace.some((event) =>
      event.type === "board-reset" &&
      event.reason === "board-locked-illegal-move" &&
      event.move === "d8a8"
    )).toBe(true);

    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");

    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
  });

  it("does not count animated opponent replies as user mistakes", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "e2e6");

    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");

    await settleFeedbackSnapshot();

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("treats per-puzzle seconds as target pace rather than a hard timeout", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    act(() => {
      jest.advanceTimersByTime(25_000);
    });

    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(false);
  });

  it("plays the first seven standard puzzles without ignored move callbacks or missing feedback", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });
    const firstSevenStandardUserMoves = [
      "e2e6",
      "e6f7",
      "f4g3",
      "a2a1",
      "a1d1",
      "c2c6",
      "c1c6",
      "d2c4",
      "f2h2",
      "g1h2",
      "b5c7",
      "f4c7",
      "e3e8",
      "e8b8",
      "b8f8"
    ];

    press(renderer, "start-sprint-button");

    for (const move of firstSevenStandardUserMoves) {
      expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
      await boardMove(renderer, move);
      expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
      expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
      expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
      expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(false);
      await settleFeedbackSnapshot();
    }

    expectText(renderer, "7 / 15");
    expect(
      trace.filter((event) =>
        event.type === "fen-mismatch" ||
        (event.type === "move-ignored" && event.reason !== "suppressed-auto-move")
      )
    ).toEqual([]);
    expect(trace.filter((event) => event.type === "move-submitted")).toHaveLength(firstSevenStandardUserMoves.length);
    expect(trace.filter((event) => event.type === "move-submitted").every((event) => event.feedbackResult === "correct")).toBe(true);
  });

  it("shows red feedback for a wrong second move in a multi-step standard puzzle", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();

    await boardMove(renderer, "e6d7");

    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 1 of 3");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "Standard · wrong · e6d7");
  });

  it("uses neutral Arrow Duel board markers without candidate chips", () => {
    const renderer = renderScreen();
    const arrow = firstArrowDuelPuzzleForTest();

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "start-sprint-button");

    expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(new Chess(arrow.currentFen).turn() === "b");
    expect(collectText(renderer.root)).not.toContain("Choose one candidate move");
    expectText(renderer, "Watch for checks, captures, and attacks!");
    const neutralArrowBodies = countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#2563EB");
    expect(neutralArrowBodies).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#2563EB")).toBe(neutralArrowBodies);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "opacity", 0.68)).toBe(neutralArrowBodies * 2);
    expect(hasStyleValue(renderer.root, "#DC2626")).toBe(false);
  });

  it("advances Arrow Duel after a correct board move", async () => {
    const renderer = renderScreen();
    const arrow = firstArrowDuelPuzzleForTest();

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "start-sprint-button");

    await boardMove(renderer, arrow.correctMove);

    expectText(renderer, "1 / 10");
    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#16A34A")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#16A34A")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#DC2626")).toBe(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#DC2626")).toBe(0);
    expect(() => findByTestId(renderer, "feedback-panel")).toThrow();
    await settleFeedbackSnapshot();
  });

  it("ignores non-candidate Arrow Duel board moves without recording attempts", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderScreen({ debugTrace: (event) => trace.push(event) });
    const arrow = firstArrowDuelPuzzleForTest();

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "start-sprint-button");

    const boardFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const nonCandidate = firstLegalNonCandidate(boardFen, arrow.candidates);

    await boardMove(renderer, nonCandidate);

    expectText(renderer, "0 / 10");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(boardFen);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expect(collectText(renderer.root)).not.toContain("expected d8a5");
    expect(trace.some((event) => event.type === "move-ignored" && event.reason === "arrow-duel-non-candidate")).toBe(true);

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("ignores illegal Standard board moves without recording attempts", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");

    const boardFen = findByTestId(renderer, "mock-chessboard").props.fen;

    await boardMove(renderer, "a1a8");

    expectText(renderer, "0 / 15");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(boardFen);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(false);

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("starts a custom sprint with the selected time control", () => {
    const renderer = renderScreen();

    press(renderer, "practice-mode-custom");
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expectText(renderer, "Target 15");

    press(renderer, "custom-duration-180");
    press(renderer, "custom-per-puzzle-30");

    expectText(renderer, "Target 6");
    expectText(renderer, "custom 3/30");

    press(renderer, "start-sprint-button");

    expectText(renderer, "Custom");
    expectText(renderer, "0 / 6");
  });

  it("settles an active sprint when the countdown expires", () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    act(() => {
      jest.advanceTimersByTime(301_000);
    });

    expectText(renderer, "Sprint failed");
    expectText(renderer, "Result: Time expired");
  });

  it("filters history to wrong attempts from the recent window", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    press(renderer, "session-abandon");

    press(renderer, "history-tab");
    expectText(renderer, "Accuracy 50% · Correct 1 · Wrong 1");
    expectText(renderer, "Standard · correct · e6f7");
    expectText(renderer, "Standard · wrong · g6g5");

    press(renderer, "history-filter-wrong-7-days");
    expectText(renderer, "Accuracy 0% · Correct 0 · Wrong 1");
    expectText(renderer, "Standard · wrong · g6g5");
    expect(collectText(renderer.root)).not.toContain("Standard · correct · e6f7");
  });

  it("shows a review button after a failed sprint with mistakes", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "c4b5");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);
    expect(collectText(renderer.root)).not.toContain("Sprint failed");

    await settleFeedbackSnapshot();

    expectText(renderer, "Sprint failed");
    expectText(renderer, "Result: Three mistakes");
    expect(findByTestId(renderer, "review-mistakes-button")).toBeTruthy();
  });

  it("reviews missed puzzles from the completed sprint using the solving board", async () => {
    const service = createMobilePracticeService("random1000");
    const recordReviewResult = jest.spyOn(service, "recordReviewResult");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(findByTestId(renderer, "review-board")).toBeTruthy();
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "review-previous").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(false);
    expect(findByTestId(renderer, "review-header-actions").findByProps({ testID: "review-reset-puzzle" })).toBeTruthy();
    press(renderer, "review-next");
    expectText(renderer, "2 / 3 · Standard");
    press(renderer, "review-previous");
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("w");
    const reviewFen = findByTestId(renderer, "mock-chessboard").props.fen;

    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);

    await boardMove(renderer, "e6f7");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "review-next").props.disabled).toBe(false);
    expect(recordReviewResult).not.toHaveBeenCalled();
    press(renderer, "review-reset-puzzle");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expectText(renderer, "1 / 3 · Standard");
    press(renderer, "review-next");
    expectText(renderer, "2 / 3 · Standard");
  });

  it("suppresses review auto-move callbacks so opponent replies animate without board resets", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");

    const resetBoard = findByTestId(renderer, "mock-chessboard").props.mockResetBoard as jest.Mock;
    resetBoard.mockClear();

    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(resetBoard).not.toHaveBeenCalled();

    await settleFeedbackSnapshot();

    expect(resetBoard).not.toHaveBeenCalled();
    expectText(renderer, "1 / 3 · Standard");
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("w");
  });

  it("opens due reviews directly without skip navigation", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expectText(renderer, "1 / 1 · Standard");
    expect(() => findByTestId(renderer, "review-next")).toThrow();
    expect(() => findByTestId(renderer, "review-previous")).toThrow();
    expect(() => findByTestId(renderer, "review-start-due")).toThrow();
    expect(() => findByTestId(renderer, "review-start-session-mistakes")).toThrow();
  });

  it("opens review analysis without mutating the active review line", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();
    press(renderer, "review-mistakes-button");

    const reviewFen = findByTestId(renderer, "mock-chessboard").props.fen;
    expect(collectText(renderer.root)).toContain("Analysis");
    expect(collectText(renderer.root)).not.toContain("Analyze this position without changing the review line.");
    expect(findByTestId(renderer, "review-reset-puzzle")).toBeTruthy();
    press(renderer, "review-analysis-button");

    expect(findByTestId(renderer, "review-analysis-line-0")).toBeTruthy();
    expect(findByTestId(renderer, "analysis-arrow-overlay")).toBeTruthy();
    expect(collectText(renderer.root)).toContain("Qxe6+");
    expect(collectText(renderer.root)).toContain("mate+");
    expect(collectText(renderer.root)).not.toContain("1. e2e6");
    expect(collectText(findByTestId(renderer, "review-analysis-line-0"))).toMatch(/^mate\+1\./);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(new Chess(reviewFen).turn());
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-reset")).toBeTruthy();
    expect(() => press(renderer, "review-analysis-forward")).toThrow("review-analysis-forward is disabled");

    press(renderer, "review-analysis-line-1");
    await flushMicrotasks();
    const candidateLineFen = findByTestId(renderer, "mock-chessboard").props.fen;
    expect(candidateLineFen).not.toBe(reviewFen);
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(false);

    press(renderer, "review-analysis-back");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);

    const analysisMove = firstLegalMoveNotIn(reviewFen, ["e2e6"]);
    const analysisFen = mustFenAfterMove(reviewFen, analysisMove);
    await boardMove(renderer, analysisMove);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(analysisFen);
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(false);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(true);

    press(renderer, "review-analysis-reset");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-line-0")).toBeTruthy();

    await boardMove(renderer, analysisMove);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(analysisFen);

    press(renderer, "review-analysis-back");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(false);

    press(renderer, "review-analysis-forward");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(analysisFen);

    press(renderer, "review-reset-puzzle");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(() => findByTestId(renderer, "review-close-analysis")).toThrow();
    expect(() => findByTestId(renderer, "review-analysis-line-0")).toThrow();
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
  });

  it("reviews Arrow Duel mistakes with analysis blunder arrows and a forced punishment line", async () => {
    const renderer = renderScreen();
    const driver = createMobilePracticeService("familiar15");
    let driverState = driver.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 3
    });
    const firstPuzzleSolution = [...requireArrowDuelState(driverState).puzzle.solutionMoves];
    const wrongMoves: string[] = [];

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "start-sprint-button");

    wrongMoves.push(currentArrowWrongMove(driverState));
    await boardMove(renderer, wrongMoves[0] as string);
    driverState = driver.submitMove(wrongMoves[0] as string).state;
    await settleFeedbackSnapshot();
    wrongMoves.push(currentArrowWrongMove(driverState));
    await boardMove(renderer, wrongMoves[1] as string);
    driverState = driver.submitMove(wrongMoves[1] as string).state;
    await settleFeedbackSnapshot();
    wrongMoves.push(currentArrowWrongMove(driverState));
    await boardMove(renderer, wrongMoves[2] as string);
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");

    expectText(renderer, "1 / 3 · Arrow Duel");
    press(renderer, "review-analysis-button");
    expect(findByTestId(renderer, "analysis-arrow-overlay")).toBeTruthy();
    expect(countStyleEntry(findByTestId(renderer, "review-board"), "backgroundColor", "#16A34A")).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "review-board"), "backgroundColor", "#DC2626")).toBeGreaterThan(0);
    press(renderer, "review-close-analysis");

    await boardMove(renderer, wrongMoves[0] as string);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);

    await settleFeedbackSnapshot();
    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
    expect(countStyleEntry(findByTestId(renderer, "review-guided-move-overlay"), "backgroundColor", "#2563EB")).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "review-guided-move-overlay"), "backgroundColor", "#16A34A")).toBe(0);
    expect(collectText(renderer.root)).not.toContain("Choose the better move");
    expect(collectText(renderer.root)).not.toContain("Follow the puzzle line");
    expectText(renderer, "Blue arrows show the next move in the punishment line. Follow them to see why the choice is bad.");

    const firstGuidedMove = firstPuzzleSolution[2];
    const firstReplyMove = firstPuzzleSolution[3];
    if (!firstGuidedMove) {
      throw new Error("Expected the first Arrow Duel fixture to have a continuation move");
    }
    if (!firstReplyMove) {
      throw new Error("Expected the first Arrow Duel fixture to have a reply after the continuation move");
    }
    const guidedStartFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const expectedAfterGuidedReply = mustFenAfterMove(
      mustFenAfterMove(guidedStartFen, firstGuidedMove),
      firstReplyMove
    );
    await boardMove(renderer, firstGuidedMove);
    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(expectedAfterGuidedReply);
    if (firstPuzzleSolution[4]) {
      expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
    }
    press(renderer, "review-reset-puzzle");
    expectText(renderer, "Choose the better move");
    expect(() => findByTestId(renderer, "review-guided-move-overlay")).toThrow();
  });

  it("ignores stale board callbacks instead of recording a correct visible move as wrong", async () => {
    const renderer = renderStandardSequenceScreen();

    press(renderer, "start-sprint-button");
    const firstBoard = findByTestId(renderer, "mock-chessboard");
    const firstPuzzleFen = firstBoard.props.fen;
    const firstBoardOnMove = firstBoard.props.onMove;
    const staleSolvedFen = mustFenAfterMove(
      mustFenAfterMove(
        mustFenAfterMove(firstPuzzleFen, "e2e6"),
        "f7f8"
      ),
      "e6f7"
    );
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();

    const secondPuzzleFen = findByTestId(renderer, "mock-chessboard").props.fen;
    expect(secondPuzzleFen).not.toBe(firstPuzzleFen);
    expectText(renderer, "1 / 15");

    await boardMoveWithCallback(firstBoardOnMove, "e6f7", staleSolvedFen);

    expectText(renderer, "1 / 15");
    expect(findByTestId(renderer, "session-strikes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "Accuracy 100% · Correct 1 · Wrong 0");
    expect(collectText(renderer.root)).not.toContain("Standard · wrong · e6f7");
  });

  it("keeps settings and packs screens locally reachable without a simulator", () => {
    const renderer = renderScreen();

    press(renderer, "settings-tab");
    expect(findByTestId(renderer, "settings-icloud-sync-toggle")).toBeTruthy();
    press(renderer, "settings-reset-elo");
    expectText(renderer, "ELO reset");

    press(renderer, "packs-tab");
    expect(findByTestId(renderer, "packs-installed-core")).toBeTruthy();
    expect(findByTestId(renderer, "packs-import")).toBeTruthy();
    expect(findByTestId(renderer, "packs-remove")).toBeTruthy();
    expect(findByTestId(renderer, "packs-license-notes")).toBeTruthy();
  });
});

function renderScreen(props: React.ComponentProps<typeof PracticePocScreen> = {}): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<PracticePocScreen {...props} />);
  });
  if (!renderer) {
    throw new Error("PracticePocScreen did not render");
  }
  renderers.push(renderer);
  return renderer;
}

function renderStandardSequenceScreen(
  props: Omit<React.ComponentProps<typeof PracticePocScreen>, "practiceService"> = {}
): TestRenderer.ReactTestRenderer {
  return renderScreen({
    ...props,
    practiceService: createMobilePracticeService("random1000")
  });
}

function firstArrowDuelPuzzleForTest(): ArrowDuelState {
  const service = createMobilePracticeService("familiar15");
  const state = service.startSprint({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    targetCorrect: 10,
    maxMistakes: 3
  });
  return requireArrowDuelState(state);
}

function currentArrowWrongMove(state: SprintState): string {
  return requireArrowDuelState(state).wrongMove;
}

function requireArrowDuelState(state: SprintState): ArrowDuelState {
  if (state.currentPuzzle?.kind !== "arrow_duel") {
    throw new Error("Expected an active Arrow Duel puzzle");
  }
  return state.currentPuzzle;
}

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    const target = findByTestId(renderer, testID);
    if (target.props.disabled) {
      throw new Error(`${testID} is disabled`);
    }
    target.props.onPress();
  });
}

async function boardMove(
  renderer: TestRenderer.ReactTestRenderer,
  move: string,
  options: { stateFen?: string | null } = {}
): Promise<void> {
  await boardMoveOnBoard(findByTestId(renderer, "mock-chessboard"), move, options);
}

async function boardMoveOnBoard(
  board: TestRenderer.ReactTestInstance,
  move: string,
  options: { stateFen?: string | null } = {}
): Promise<void> {
  if (board.props.gestureEnabled === false) {
    throw new Error(`Board gesture is disabled before ${move}`);
  }
  await act(async () => {
    const movePayload = {
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move.length > 4 ? move.slice(4, 5) : undefined
    };
    if (options.stateFen === undefined) {
      board.props.mockMove(movePayload);
    } else {
      board.props.onMove({
        move: movePayload,
        state: options.stateFen
          ? {
            fen: options.stateFen,
            isPromotion: move.length > 4
          }
          : {
            isPromotion: move.length > 4
          }
      });
    }
    await Promise.resolve();
  });
}

async function boardMoveWithCallback(
  onMove: (result: unknown) => void,
  move: string,
  stateFen: string | null
): Promise<void> {
  await act(async () => {
    onMove({
      move: {
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move.length > 4 ? move.slice(4, 5) : undefined
      },
      state: stateFen
        ? {
          fen: stateFen,
          isPromotion: move.length > 4
        }
        : {
          isPromotion: move.length > 4
        }
    });
    await Promise.resolve();
  });
}

async function settleFeedbackSnapshot(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(850);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findByTestId(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
}

function expectText(renderer: TestRenderer.ReactTestRenderer, expected: string): void {
  expect(collectText(renderer.root)).toContain(expected);
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  const ownText = node.children.filter((child): child is string => typeof child === "string").join("");
  const childText = node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .map((child) => collectText(child))
    .join("");
  return ownText + childText;
}

function hasStyleValue(node: TestRenderer.ReactTestInstance, value: string): boolean {
  const style = node.props?.style;
  if (styleContains(style, value)) {
    return true;
  }
  return node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .some((child) => hasStyleValue(child, value));
}

function countStyleValue(node: TestRenderer.ReactTestInstance, value: string): number {
  const style = node.props?.style;
  const own = styleContains(style, value) ? 1 : 0;
  return own + node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .reduce((sum, child) => sum + countStyleValue(child, value), 0);
}

function hasStyleEntry(node: TestRenderer.ReactTestInstance, key: string, value: unknown): boolean {
  return countStyleEntry(node, key, value) > 0;
}

function countStyleEntry(node: TestRenderer.ReactTestInstance, key: string, value: unknown): number {
  const style = node.props?.style;
  const own = styleEntryMatches(style, key, value) ? 1 : 0;
  return own + node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .reduce((sum, child) => sum + countStyleEntry(child, key, value), 0);
}

function styleEntryMatches(style: unknown, key: string, value: unknown): boolean {
  if (!style) {
    return false;
  }
  if (Array.isArray(style)) {
    return style.some((entry) => styleEntryMatches(entry, key, value));
  }
  if (typeof style === "object") {
    return (style as Record<string, unknown>)[key] === value;
  }
  return false;
}

function styleContains(style: unknown, value: string): boolean {
  if (!style) {
    return false;
  }
  if (Array.isArray(style)) {
    return style.some((entry) => styleContains(entry, value));
  }
  if (typeof style === "object") {
    return Object.values(style as Record<string, unknown>).some((entry) => {
      if (entry === value) {
        return true;
      }
      return styleContains(entry, value);
    });
  }
  return false;
}

function countPiecesInFen(fen: string): number {
  return new Chess(fen).board().flat().filter(Boolean).length;
}

function tryFenAfterMove(fen: string, move: string): string | null {
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      ...(move.length > 4 ? { promotion: move.slice(4, 5) } : {})
    });
    return played ? chess.fen() : null;
  } catch {
    return null;
  }
}

function mustFenAfterMove(fen: string, move: string): string {
  const nextFen = tryFenAfterMove(fen, move);
  if (!nextFen) {
    throw new Error(`Illegal test move ${move} from ${fen}`);
  }
  return nextFen;
}

function firstLegalMove(fen: string): string {
  const move = new Chess(fen).moves({ verbose: true })[0];
  if (!move) {
    throw new Error(`No legal moves from ${fen}`);
  }
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function firstLegalMoveNotIn(fen: string, excludedMoves: string[]): string {
  const excluded = new Set(excludedMoves.map((move) => move.toLowerCase()));
  const move = new Chess(fen)
    .moves({ verbose: true })
    .map((candidate) => `${candidate.from}${candidate.to}${candidate.promotion ?? ""}`)
    .find((candidate) => !excluded.has(candidate.toLowerCase()));
  if (!move) {
    throw new Error(`No legal move outside ${excludedMoves.join(", ")} from ${fen}`);
  }
  return move;
}

function firstLegalNonCandidate(fen: string, candidates: string[]): string {
  const normalizedCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  const move = new Chess(fen)
    .moves({ verbose: true })
    .map((candidate) => `${candidate.from}${candidate.to}${candidate.promotion ?? ""}`)
    .find((candidate) => !normalizedCandidates.has(candidate.toLowerCase()));
  if (!move) {
    throw new Error(`No legal non-candidate moves from ${fen}`);
  }
  return move;
}
