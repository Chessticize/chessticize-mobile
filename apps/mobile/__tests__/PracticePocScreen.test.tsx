import React from "react";
import { Chess } from "chess.js";
import TestRenderer, { act } from "react-test-renderer";
import { PracticePocScreen, type PracticeDebugTraceEvent } from "../src/components/PracticePocScreen";
import {
  createMobilePracticeService,
  getBundledCorePackManifest,
  seededPuzzleCount,
  seededUniquePositionCount
} from "../src/backend/mobilePractice";
import { fixtureNeedsAtLeast } from "../../../packages/storage/src/practice-service";
import type { ArrowDuelState, SprintState, UciEngineTransport } from "../../../packages/core/src/index";

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
    expect(findByTestId(renderer, "practice-tab-icon")).toBeTruthy();
    expect(findByTestId(renderer, "review-tab-icon")).toBeTruthy();
    expect(findByTestId(renderer, "history-tab-icon")).toBeTruthy();
    expect(findByTestId(renderer, "packs-tab-icon")).toBeTruthy();
    expect(findByTestId(renderer, "settings-tab-icon")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-tab-icon"))).toBe("");
    expect(hasStyleEntry(findByTestId(renderer, "practice-tab-icon"), "backgroundColor", "#DBEAFE")).toBe(false);
    expect(findByTestId(renderer, "practice-tab-target-outer")).toBeTruthy();
    expect(findByTestId(renderer, "practice-tab-target-inner")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-tab-icon"))).toBe("");
    expect(collectText(renderer.root)).not.toContain("⚙");
    expect(() => findByTestId(renderer, "analysis-tab")).toThrow();
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-standard").props.accessibilityState).toEqual({ selected: true });
    expect(hasStyleEntry(findByTestId(renderer, "practice-mode-standard"), "borderColor", "#93C5FD")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-mode-standard-icon"), "backgroundColor", "#DBEAFE")).toBe(true);
    expect(findByTestId(renderer, "practice-mode-arrow-duel")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-arrow-duel").props.accessibilityState).toEqual({ selected: false });
    expect(hasStyleEntry(findByTestId(renderer, "practice-mode-arrow-duel"), "borderColor", "#93C5FD")).toBe(false);
    expect(findByTestId(renderer, "practice-mode-blitz")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-custom")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-mode-standard-icon"))).toBe("");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel-icon"))).toBe("");
    expect(collectText(findByTestId(renderer, "practice-mode-blitz-icon"))).toBe("");
    expect(collectText(findByTestId(renderer, "practice-mode-custom-icon"))).toBe("");
    expect(findByTestId(renderer, "practice-mode-standard-start")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-mode-standard-start"))).toBe("");
    expect(findByTestId(renderer, "practice-mode-standard-start").props.accessibilityRole).toBeUndefined();
    expect(findByTestId(renderer, "practice-mode-standard-details").props.accessibilityLabel).toBe("5 min · 20s pace · ELO 600");
    expect(findByTestId(renderer, "practice-mode-arrow-duel-details").props.accessibilityLabel).toBe("5 min · 30s pace · ELO 600");
    expect(collectText(findByTestId(renderer, "practice-mode-standard-rating"))).toBe("ELO 600");
    expect(collectText(findByTestId(renderer, "practice-mode-standard"))).toContain("Find the best move");
    expect(collectText(findByTestId(renderer, "practice-mode-standard"))).not.toContain("Find the best move · 5 min");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel"))).toContain("Choose the best move");
    expect(collectText(findByTestId(renderer, "practice-mode-arrow-duel"))).not.toContain("Choose the best move · 5 min");
    expect(collectText(findByTestId(renderer, "practice-mode-blitz"))).toContain("Fast time control");
    expect(collectText(findByTestId(renderer, "practice-mode-blitz"))).not.toContain("Fast time control · 5 min");
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).toContain("Time, theme, rating");
    expect(collectText(findByTestId(renderer, "practice-mode-custom"))).not.toContain("Time, theme, rating · 5 min");
    expect(findByTestId(renderer, "practice-mode-standard").props.accessibilityLabel).toBe("Standard mode, 5 min · 20s pace · ELO 600");
    expect(findByTestId(renderer, "practice-mode-arrow-duel").props.accessibilityLabel).toBe("Arrow Duel mode, 5 min · 30s pace · ELO 600");
    expect(() => findByTestId(renderer, "rating-label")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Target 15");
    expect(collectText(renderer.root)).not.toContain("standard 5/20");
    expectText(renderer, "ELO 600");
    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-tab-badge")).toThrow();
    expect(collectText(findByTestId(renderer, "practice-action-header"))).toBe("Start a Sprint");
    expect(collectText(findByTestId(renderer, "practice-home"))).not.toContain("Offline puzzle training");
    expect(findByTestId(renderer, "practice-progress-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("No rating change");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-rating-delta"), "color", "#64748B")).toBe(true);
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("0");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("Start training");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("rating No rating change");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("No attempts yet");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("No attempts yet");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-weekly-delta"), "color", "#64748B")).toBe(true);
    expect(findByTestId(renderer, "practice-review-strip")).toBeTruthy();
    expect(findByTestId(renderer, "practice-review-strip-chevron")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-review-strip-chevron"))).toBe("");
    expect(collectText(findByTestId(renderer, "practice-review-strip"))).toContain("No reviews due");
    expect(collectText(findByTestId(renderer, "practice-review-strip"))).not.toContain("Scheduled mistake reviews");
    expect(findByTestId(renderer, "practice-review-strip").props.accessibilityLabel).toContain("scheduled mistake reviews");
    expect(collectText(findByTestId(renderer, "practice-review-due-count"))).toContain("0");
    expect(collectText(findByTestId(renderer, "practice-review-due-count"))).toContain("Due today");
    expect(collectText(findByTestId(renderer, "practice-review-overdue-count"))).toContain("0");
    expect(collectText(findByTestId(renderer, "practice-review-overdue-count"))).toContain("Overdue");
    press(renderer, "review-tab");
    expect(collectText(findByTestId(renderer, "review-difficulty-easy"))).toContain("No easy reviews");
    expect(collectText(findByTestId(renderer, "review-difficulty-medium"))).toContain("No medium reviews");
    expect(collectText(findByTestId(renderer, "review-difficulty-hard"))).toContain("Stable");
    press(renderer, "practice-tab");
    expect(collectText(renderer.root)).not.toContain("Offline-ready · 3000 puzzles");
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain("Offline-ready · 3000 puzzles");
    expect(collectText(findByTestId(renderer, "practice-action-header"))).toBe("Start a Sprint");
  });

  it("summarizes recent local practice progress on the Practice home", () => {
    const service = createMobilePracticeService("familiar15");
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1, maxMistakes: 3 },
      startedAt
    );
    service.submitMove("c2b1", completedAt);

    const renderer = renderScreen({ practiceService: service });

    expect(findByTestId(renderer, "practice-progress-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("1");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("+1 net");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("100% accuracy · 0 mistakes");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toMatch(/^\+\d+ this week$/);
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toMatch(/rating \+\d+ this week/);
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("100% accuracy · 0 mistakes");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-rating-delta"), "color", "#16A34A")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-weekly-delta"), "color", "#16A34A")).toBe(true);
  });

  it("surfaces negative weekly practice progress without hiding mistakes", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      new Date(Date.now() - 120_000).toISOString()
    );
    service.submitMove("c4b5", new Date(Date.now() - 60_000).toISOString());

    const renderer = renderScreen({ practiceService: service });

    expect(collectText(findByTestId(renderer, "practice-progress-weekly-solved"))).toBe("0");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-delta"))).toBe("-1 net");
    expect(collectText(findByTestId(renderer, "practice-progress-weekly-context"))).toBe("0% accuracy · 1 mistake");
    expect(collectText(findByTestId(renderer, "practice-progress-rating-delta"))).toBe("No rating change");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("rating No rating change");
    expect(findByTestId(renderer, "practice-progress-summary").props.accessibilityLabel).toContain("0% accuracy · 1 mistake");
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-rating-delta"), "color", "#64748B")).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "practice-progress-weekly-delta"), "color", "#DC2626")).toBe(true);
  });

  it("starts a selected sprint directly from the mode row", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    press(renderer, "practice-mode-blitz");

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(testIdOrder(renderer, "session-board", "session-score-strip")).toBeLessThan(0);
    expect(testIdOrder(renderer, "session-score-strip", "practice-prompt")).toBeLessThan(0);
    expect(findByTestId(renderer, "session-score-strip").props.accessibilityLabel).toBe("Session score: solved 0, mistakes 0, left 30");
    expect(findByTestId(renderer, "session-score-positive-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "session-score-negative-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "session-score-neutral-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "session-score-solved").props.accessibilityLabel).toBe("Solved 0");
    expect(findByTestId(renderer, "session-score-mistakes").props.accessibilityLabel).toBe("Mistakes 0");
    expect(findByTestId(renderer, "session-score-left").props.accessibilityLabel).toBe("Left 30");
    expect(collectText(findByTestId(renderer, "session-score-solved-value"))).toBe("0");
    expect(collectText(findByTestId(renderer, "session-score-mistakes-value"))).toBe("0");
    expect(collectText(findByTestId(renderer, "session-score-left-value"))).toBe("30");
    expect(styleEntryMatches(findByTestId(renderer, "session-status-metrics").props.style, "borderWidth", 1)).toBe(false);
    expect(findByTestId(renderer, "session-progress-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-timer-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-rating-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-mistakes-block")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 30");
    expect(findByTestId(renderer, "session-timer-block").props.accessibilityLabel).toContain("Timer");
    expect(findByTestId(renderer, "session-rating-block").props.accessibilityLabel).toBe("ELO 600");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(findByTestId(renderer, "session-mistakes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).toBe("0030");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("Solved");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("Left");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("✓");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("×");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).not.toContain("○");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Progress");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Timer");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("0/3");
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("0 / 30");
    expect(styleEntryMatches(findByTestId(renderer, "practice-prompt").props.style, "borderWidth", 1)).toBe(false);
    expect(collectText(findByTestId(renderer, "practice-prompt-icon"))).toBe("");
    expectText(renderer, "Find the best move");
  });

  it("offers resume before starting a new sprint when the service has an active session", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 15, maxMistakes: 3 },
      new Date(Date.now()).toISOString()
    );
    const renderer = renderScreen({ practiceService: service });

    expect(findByTestId(renderer, "practice-resume-card")).toBeTruthy();
    expect(testIdOrder(renderer, "practice-resume-card", "practice-mode-standard")).toBeLessThan(0);
    expect(collectText(findByTestId(renderer, "practice-resume-card"))).toContain("Resume sprint");
    expect(collectText(findByTestId(renderer, "practice-resume-card"))).toContain("Standard · 0 solved · 15 left · 0 mistakes");
    expect(() => findByTestId(renderer, "session-board")).toThrow();

    press(renderer, "practice-resume-card");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-progress"))).toBe("0 / 15");
    expect(() => findByTestId(renderer, "practice-resume-card")).toThrow();
  });

  it("opens custom setup from the compact custom row instead of starting a scored sprint", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    press(renderer, "practice-mode-custom");

    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(() => findByTestId(renderer, "session-board")).toThrow();
    expect(() => findByTestId(renderer, "rating-label")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-close"))).toBe("");
    expectText(renderer, "Custom Sprint");
    expect(collectText(findByTestId(renderer, "custom-sprint-setup"))).not.toContain("Time, theme, rating");
  });

  it("seeds the release bundled core pack by default to avoid exhausted fixture sprints", () => {
    const service = createMobilePracticeService();
    const manifest = getBundledCorePackManifest();

    expect(seededPuzzleCount()).toBe(3000);
    expect(seededPuzzleCount()).toBe(manifest.puzzleCount);
    expect(seededUniquePositionCount()).toBe(seededPuzzleCount());
    expect(manifest.rating).toEqual({ min: 600, max: 1600 });
    expect(manifest.arrowDuelCount).toBeGreaterThanOrEqual(2000);

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
    expect(collectText(renderer.root)).not.toContain("Offline-ready · 3000 puzzles");
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain("Offline-ready · 3000 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-bundledCore"), "borderColor", "#2563EB")).toBe(true);

    press(renderer, "test-puzzle-source-familiar15");
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain("Offline-ready · 15 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-familiar15"), "borderColor", "#2563EB")).toBe(true);
    expect(() => findByTestId(renderer, "test-puzzle-source-promotionSample")).toThrow();

    press(renderer, "test-puzzle-source-random1000");
    expect(collectText(renderer.root)).not.toContain("Offline-ready · 1000 puzzles");
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain("Offline-ready · 1000 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-random1000"), "borderColor", "#2563EB")).toBe(true);

    press(renderer, "test-puzzle-source-familiar15");
    expect(findByTestId(renderer, "app-shell-header").props.accessibilityLabel).toContain("Offline-ready · 15 puzzles");
    expect(hasStyleEntry(findByTestId(renderer, "test-puzzle-source-familiar15"), "borderColor", "#2563EB")).toBe(true);
  });

  it("accepts a non-official legal checkmate in the fixed first familiar puzzle", async () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });

    startStandardSprint(renderer);
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Find the best move");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("For white.");
    expectText(renderer, "0 / 15");

    await boardMove(renderer, "c2b1");

    expect(() => findByTestId(renderer, "mock-promotion-dialog")).toThrow();
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expectText(renderer, "1 / 15");
    expectSessionMistakes(renderer, 0);

    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 15");

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectHistoryRowAccessibility(renderer, "Move c2b1");
  });

  it("submits standard puzzle moves through the board and records attempt history", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    const board = findByTestId(renderer, "mock-chessboard");
    const fenBeforeAutoReply = board.props.fen;
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(countPiecesInFen(board.props.fen)).toBeGreaterThan(0);
    expect(board.props.spriteSource).toBeTruthy();
    expect(board.props.colors.white).toBe("#E6E8EB");
    expect(board.props.colors.black).toBe("#7B8794");
    expect(board.props.colors.lastMoveHighlight).toBe("rgba(0, 0, 0, 0)");
    expect(board.props.colors.validMoveDot).toBe("rgba(15, 23, 42, 0.36)");
    expect(board.props.colors.validMoveCapture).toBe("rgba(15, 23, 42, 0.56)");
    expect(board.props.draggableColor).toBe("w");
    expect(board.props.withLetters).toBe(false);
    expect(board.props.withNumbers).toBe(false);
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain("abcdefgh");
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain("87654321");
    expect(findByTestId(renderer, "active-session-shell")).toBeTruthy();
    expect(findByTestId(renderer, "session-shell-nav")).toBeTruthy();
    expect(findByTestId(renderer, "session-status-metrics")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Progress");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Timer");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).toContain("ELO");
    expect(collectText(findByTestId(renderer, "session-status-metrics"))).not.toContain("Mistakes");
    expect(findByTestId(renderer, "session-progress-block").props.accessibilityLabel).toBe("Progress 0 of 15");
    expect(findByTestId(renderer, "session-timer-block").props.accessibilityLabel).toContain("Timer");
    expect(findByTestId(renderer, "session-rating-block").props.accessibilityLabel).toBe("ELO 600");
    expect(findByTestId(renderer, "session-mistakes-block").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(findByTestId(renderer, "session-overflow")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "session-abandon"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-overflow"))).toBe("");
    expect(collectText(findByTestId(renderer, "session-shell-nav"))).not.toContain("×");
    expect(collectText(findByTestId(renderer, "session-shell-nav"))).not.toContain("•••");
    expect(findByTestId(renderer, "session-timer")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress")).toBeTruthy();
    expect(findByTestId(renderer, "session-rating")).toBeTruthy();
    expect(() => findByTestId(renderer, "session-strikes")).toThrow();
    expect(findByTestId(renderer, "session-mistakes")).toBeTruthy();
    expect(findByTestId(renderer, "session-mistakes").props.accessibilityLabel).toBe("Mistakes 0 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(findByTestId(renderer, "session-mistake-dot-0")).toBeTruthy();
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "session-abandon").props.accessibilityLabel).toBe("Abandon sprint");
    press(renderer, "session-abandon");
    expect(findByTestId(renderer, "session-abandon-confirmation")).toBeTruthy();
    expectText(renderer, "Abandon sprint?");
    press(renderer, "session-abandon-cancel");
    expect(() => findByTestId(renderer, "session-abandon-confirmation")).toThrow();
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(collectText(renderer.root)).not.toContain("Expected move");
    expect(collectText(renderer.root)).not.toContain("000hf · 1485");

    await boardMove(renderer, "e2e6");
    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expectSessionMistakes(renderer, 0);
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
    expectSessionMistakes(renderer, 0);
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);
    await settleFeedbackSnapshot();

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expect(collectText(renderer.root)).not.toContain("000hf · standard");
  });

  it("locks the board during an opponent reply and ignores attempted extra user moves", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);

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
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);

    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe("b");
    expectSessionMistakes(renderer, 0);
  });

  it("discards opponent-piece drags during the opponent reply animation", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);
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

    expectSessionMistakes(renderer, 0);
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

    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
  });

  it("resets illegal drags during the opponent reply animation instead of stalling the board", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderStandardSequenceScreen({ debugTrace: (event) => trace.push(event) });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");

    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(false);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(null);
    act(() => {
      findByTestId(renderer, "mock-chessboard").props.onIllegalMove("d8", "a8");
    });

    expectSessionMistakes(renderer, 0);
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

    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
  });

  it("does not count animated opponent replies as user mistakes", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");

    expect(collectText(renderer.root)).not.toContain("Correct");
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expectSessionMistakes(renderer, 0);

    await settleFeedbackSnapshot();

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("treats per-puzzle seconds as target pace rather than a hard timeout", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(25_000);
    });

    await boardMove(renderer, "e2e6");

    expectSessionMistakes(renderer, 0);
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

    startStandardSprint(renderer);

    for (const move of firstSevenStandardUserMoves) {
      expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
      await boardMove(renderer, move);
      expectSessionMistakes(renderer, 0);
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

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();

    await boardMove(renderer, "e6d7");

    expectSessionMistakes(renderer, 1);
    expect(findByTestId(renderer, "session-mistakes").props.accessibilityLabel).toBe("Mistakes 1 of 3");
    expect(collectText(findByTestId(renderer, "session-mistakes"))).toBe("");
    expect(hasStyleEntry(findByTestId(renderer, "session-mistake-dot-0"), "backgroundColor", "#DC2626")).toBe(true);
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(true);
    expect(countStyleValue(renderer.root, "rgba(37, 99, 235, 0.3)")).toBe(0);

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectHistoryRowAccessibility(renderer, "Played e6d7 · Best e6f7");
  });

  it("uses neutral Arrow Duel board markers with non-revealing candidate chips", () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    const arrow = firstArrowDuelPuzzleForTest();

    press(renderer, "practice-mode-arrow-duel");

    expect(findByTestId(renderer, "mock-chessboard").props.flipped).toBe(new Chess(arrow.currentFen).turn() === "b");
    expect(collectText(renderer.root)).not.toContain("Choose one candidate move");
    expect(findByTestId(renderer, "arrow-duel-candidates")).toBeTruthy();
    expect(findByTestId(renderer, "arrow-duel-candidate-a").props.accessibilityLabel).toBe("Choose Arrow Duel candidate A");
    expect(findByTestId(renderer, "arrow-duel-candidate-b").props.accessibilityLabel).toBe("Choose Arrow Duel candidate B");
    expect(hasStyleEntry(findByTestId(renderer, "arrow-duel-candidate-a"), "width", 56)).toBe(true);
    expect(hasStyleEntry(findByTestId(renderer, "arrow-duel-candidate-a"), "height", 44)).toBe(true);
    expect(collectText(findByTestId(renderer, "arrow-duel-candidates"))).toBe("AB");
    expect(collectText(findByTestId(renderer, "practice-prompt-icon"))).toBe("");
    expect(testIdOrder(renderer, "session-board", "session-score-strip")).toBeLessThan(0);
    expect(testIdOrder(renderer, "session-score-strip", "practice-prompt")).toBeLessThan(0);
    expect(testIdOrder(renderer, "practice-prompt", "arrow-duel-candidates")).toBeLessThan(0);
    expect(findByTestId(renderer, "session-score-strip").props.accessibilityLabel).toBe("Session score: solved 0, mistakes 0, left 10");
    expect(collectText(findByTestId(renderer, "session-score-left-value"))).toBe("10");
    expect(collectText(findByTestId(renderer, "session-score-strip"))).toBe("0010");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("Choose the best move");
    expect(collectText(findByTestId(renderer, "practice-prompt"))).toContain("between the two arrows");
    expectText(renderer, "Watch for checks, captures, and attacks!");
    const neutralArrowBodies = countStyleEntry(findByTestId(renderer, "session-board"), "backgroundColor", "#2563EB");
    expect(neutralArrowBodies).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "borderLeftColor", "#2563EB")).toBe(neutralArrowBodies);
    expect(countStyleEntry(findByTestId(renderer, "session-board"), "opacity", 0.68)).toBe(neutralArrowBodies * 2);
    expect(hasStyleValue(findByTestId(renderer, "session-board"), "#DC2626")).toBe(false);
  });

  it("advances Arrow Duel after a correct board move", async () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    const arrow = firstArrowDuelPuzzleForTest();

    press(renderer, "practice-mode-arrow-duel");

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

  it("advances Arrow Duel after a correct candidate chip", async () => {
    const renderer = renderScreen({ practiceService: createMobilePracticeService("familiar15") });
    const arrow = firstArrowDuelPuzzleForTest();
    const correctCandidateId = arrow.candidates[0]?.toLowerCase() === arrow.correctMove.toLowerCase()
      ? "arrow-duel-candidate-a"
      : "arrow-duel-candidate-b";

    press(renderer, "practice-mode-arrow-duel");
    await pressAsync(renderer, correctCandidateId);

    expectText(renderer, "1 / 10");
    expect(findByTestId(renderer, "move-feedback-overlay")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "rgba(22, 163, 74, 0.34)")).toBe(true);
    expect(() => findByTestId(renderer, "arrow-duel-candidates")).toThrow();
    await settleFeedbackSnapshot();
  });

  it("ignores non-candidate Arrow Duel board moves without recording attempts", async () => {
    const trace: PracticeDebugTraceEvent[] = [];
    const renderer = renderScreen({
      debugTrace: (event) => trace.push(event),
      practiceService: createMobilePracticeService("familiar15")
    });
    const arrow = firstArrowDuelPuzzleForTest();

    press(renderer, "practice-mode-arrow-duel");

    const boardFen = findByTestId(renderer, "mock-chessboard").props.fen;
    const nonCandidate = firstLegalNonCandidate(boardFen, arrow.candidates);

    await boardMove(renderer, nonCandidate);

    expectText(renderer, "0 / 10");
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(boardFen);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();
    expect(collectText(renderer.root)).not.toContain("Incorrect");
    expect(collectText(renderer.root)).not.toContain("expected d8a5");
    expect(trace.some((event) => event.type === "move-ignored" && event.reason === "arrow-duel-non-candidate")).toBe(true);

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("ignores illegal Standard board moves without recording attempts", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);

    const boardFen = findByTestId(renderer, "mock-chessboard").props.fen;

    await boardMove(renderer, "a1a8");

    expectText(renderer, "0 / 15");
    expectSessionMistakes(renderer, 0);
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(boardFen);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();
    expect(hasStyleValue(renderer.root, "rgba(220, 38, 38, 0.32)")).toBe(false);

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
  });

  it("starts a custom sprint with the selected time control", () => {
    const renderer = renderScreen();

    press(renderer, "test-puzzle-source-familiar15");
    press(renderer, "practice-mode-custom");
    expect(findByTestId(renderer, "custom-sprint-setup")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-sprint-setup"))).not.toContain("Time, theme, rating");
    expect(() => findByTestId(renderer, "practice-home")).toThrow();
    expect(findByTestId(renderer, "custom-config-list")).toBeTruthy();
    expect(findByTestId(renderer, "custom-pack-warning")).toBeTruthy();
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-pack-warning"))).toContain("15 eligible puzzles");
    expect(collectText(findByTestId(renderer, "custom-pack-warning"))).toContain("up to 18");
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });
    expect(findByTestId(renderer, "start-sprint-button").props.disabled).toBe(false);
    expect(findByTestId(renderer, "custom-mode-row")).toBeTruthy();
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: true });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: false });
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityLabel).toBe("Regular Puzzles custom sprint mode, Board moves");
    expect(collectText(findByTestId(renderer, "custom-mode-row"))).not.toContain("Board moves");
    expect(collectText(findByTestId(renderer, "custom-mode-row"))).not.toContain("Two candidates");
    expect(findByTestId(renderer, "custom-theme-row")).toBeTruthy();
    expect(() => findByTestId(renderer, "custom-summary-card")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-summary-target"))).toBe("Estimated puzzles~15");
    expect(collectText(findByTestId(renderer, "custom-summary-rating-range"))).toBe("Rating range400 - 800");
    expect(collectText(findByTestId(renderer, "custom-mode-summary"))).toContain("Regular puzzles");
    expect(collectText(findByTestId(renderer, "custom-mistake-limit"))).toBe("Mistake limit3");
    expect(findByTestId(renderer, "custom-mistake-limit-detail").props.accessibilityLabel).toBe("Fixed by sprint scoring rules");
    expect(findByTestId(renderer, "custom-previous-configs")).toBeTruthy();
    expect(findByTestId(renderer, "custom-separate-scoring")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-separate-scoring"))).toContain("ELO 600");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~15");
    expect(() => findByTestId(renderer, "custom-target-row")).toThrow();
    expect(() => findByTestId(renderer, "custom-rating-range")).toThrow();
    expect(() => findByTestId(renderer, "custom-current-rating")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-config-list"))).toContain("Current rating");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("separate bucket");
    expect(findByTestId(renderer, "custom-separate-scoring-detail").props.accessibilityLabel).toBe("Custom · 20s pace · separate bucket");
    expect(findByTestId(renderer, "custom-mode-summary-detail").props.accessibilityLabel).toBe("Board-move puzzle sprint");
    expect(findByTestId(renderer, "custom-include-arrow-duel-detail").props.accessibilityLabel).toBe("Switches this custom sprint to Arrow Duel scoring.");
    expect(collectText(findByTestId(renderer, "custom-include-arrow-duel"))).not.toContain("Switches this custom sprint");
    expect(collectText(findByTestId(renderer, "custom-previous-custom-5-20-meta"))).toBe("Mixed · 5 min · 20s pace · Last Recently");
    expect(findByTestId(renderer, "custom-previous-custom-5-20-meta").props.accessibilityLabel).toBe("Mixed · 5 min · 20s pace · Last Recently · Custom · 20s pace");
    expect(findByTestId(renderer, "custom-previous-custom-5-20").props.accessibilityLabel).toContain("Use Custom · 20s pace custom sprint");
    expect(collectText(findByTestId(renderer, "custom-previous-custom-3-30"))).not.toContain("Custom · 30s pace");
    expect(findByTestId(renderer, "custom-previous-custom-3-30-meta").props.accessibilityLabel).toContain("Custom · 30s pace");
    expect(collectText(findByTestId(renderer, "custom-previous-custom-3-30"))).toContain("ELO");
    expect(findByTestId(renderer, "custom-previous-custom-3-30-chevron")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-previous-custom-3-30-chevron"))).toBe("");
    expect(findByTestId(renderer, "custom-previous-custom-3-30").props.accessibilityRole).toBe("button");
    press(renderer, "custom-previous-custom-3-30");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~6");
    expect(collectText(findByTestId(renderer, "custom-summary-target"))).toBe("Estimated puzzles~6");
    expect(findByTestId(renderer, "custom-separate-scoring-detail").props.accessibilityLabel).toBe("Custom · 30s pace · separate bucket");
    expect(collectText(findByTestId(renderer, "custom-separate-scoring"))).not.toContain("custom 3/30");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).toContain("3m");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).toContain("30 sec");
    press(renderer, "custom-previous-custom-5-20");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~15");
    expect(findByTestId(renderer, "custom-separate-scoring-detail").props.accessibilityLabel).toBe("Custom · 20s pace · separate bucket");
    expect(collectText(findByTestId(renderer, "custom-separate-scoring"))).not.toContain("custom 5/20");
    expect(findByTestId(renderer, "custom-include-arrow-duel")).toBeTruthy();
    expect(findByTestId(renderer, "custom-duration-stepper")).toBeTruthy();
    expect(findByTestId(renderer, "custom-per-puzzle-stepper")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "custom-duration-stepper-decrease"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-duration-stepper-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-per-puzzle-stepper-decrease"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-per-puzzle-stepper-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("−");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("＋");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("›");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("Allowed values");
    expect(() => findByTestId(renderer, "custom-mistake-limit-stepper")).toThrow();
    expect(collectText(findByTestId(renderer, "custom-include-arrow-duel-toggle"))).toBe("");
    press(renderer, "custom-theme-mate");
    expectText(renderer, "Mate");
    expect(findByTestId(renderer, "custom-broaden-theme")).toBeTruthy();
    expect(findByTestId(renderer, "custom-broaden-theme").props.accessibilityLabel).toBe("Broaden from Mate to Mixed theme");
    press(renderer, "custom-broaden-theme");
    expect(collectText(findByTestId(renderer, "custom-theme-row"))).toContain("Mixed");
    expect(() => findByTestId(renderer, "custom-broaden-theme")).toThrow();
    press(renderer, "custom-theme-mate");
    press(renderer, "custom-include-arrow-duel-toggle");
    expect(findByTestId(renderer, "custom-include-arrow-duel-toggle").props.accessibilityState).toEqual({ checked: true });
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: false });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: true });
    expect(collectText(findByTestId(renderer, "custom-mode-summary"))).toContain("Arrow Duel");
    press(renderer, "custom-include-arrow-duel-toggle");
    expect(findByTestId(renderer, "custom-include-arrow-duel-toggle").props.accessibilityState).toEqual({ checked: false });
    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: true });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: false });
    expect(collectText(findByTestId(renderer, "custom-mode-summary"))).toContain("Regular puzzles");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~15");

    press(renderer, "custom-duration-stepper-decrease");
    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~9");
    expect(findByTestId(renderer, "custom-duration-stepper-decrease").props.accessibilityState).toEqual({ disabled: true });
    press(renderer, "custom-per-puzzle-stepper-increase");

    expect(collectText(findByTestId(renderer, "custom-target-count"))).toBe("~6");
    expect(findByTestId(renderer, "custom-separate-scoring-detail").props.accessibilityLabel).toBe("Custom · 30s pace · separate bucket");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("custom 3/30");
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });

    press(renderer, "start-sprint-button");

    expectText(renderer, "Custom");
    expectText(renderer, "0 / 6");
  });

  it("shows custom sprint local pack readiness when the selected fixture has enough puzzles", () => {
    const renderer = renderScreen();

    press(renderer, "test-puzzle-source-random1000");
    press(renderer, "practice-mode-custom");

    expect(() => findByTestId(renderer, "custom-eligibility-ready")).toThrow();
    expect(() => findByTestId(renderer, "custom-pack-warning")).toThrow();
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });
  });

  it("allows custom sprint start with a local pack warning when eligible puzzles exist", () => {
    const renderer = renderScreen();

    press(renderer, "test-puzzle-source-familiar15");
    press(renderer, "practice-mode-custom");

    expect(findByTestId(renderer, "custom-pack-warning")).toBeTruthy();
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });

    press(renderer, "start-sprint-button");

    expectText(renderer, "Custom");
    expectText(renderer, "0 / 15");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
  });

  it("starts an Arrow Duel sprint from the custom mode selector", () => {
    const renderer = renderScreen();

    press(renderer, "test-puzzle-source-random1000");
    press(renderer, "practice-mode-custom");
    press(renderer, "custom-mode-arrow-duel");

    expect(findByTestId(renderer, "custom-mode-regular").props.accessibilityState).toEqual({ selected: false });
    expect(findByTestId(renderer, "custom-mode-arrow-duel").props.accessibilityState).toEqual({ selected: true });
    expect(collectText(findByTestId(renderer, "custom-mode-summary"))).toContain("Arrow Duel");
    expect(findByTestId(renderer, "custom-separate-scoring-detail").props.accessibilityLabel).toBe("Arrow Duel · 20s pace · separate bucket");
    expect(collectText(findByTestId(renderer, "custom-config-list"))).not.toContain("arrow_duel 5/20");
    expect(findByTestId(renderer, "start-sprint-button").props.accessibilityState).toEqual({ disabled: false });

    press(renderer, "start-sprint-button");

    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expectText(renderer, "Arrow Duel");
    expectText(renderer, "0 / 15");
  });

  it("settles an active sprint when the countdown expires", () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    act(() => {
      jest.advanceTimersByTime(301_000);
    });

    expectText(renderer, "Sprint failed");
    expect(collectText(findByTestId(renderer, "sprint-result-reason"))).toBe("Time expired");
    expect(findByTestId(renderer, "sprint-result-reason").props.accessibilityLabel).toBe("Result: Time expired");
    expect(collectText(renderer.root)).not.toContain("Result: Time expired");
    expect(findByTestId(renderer, "sprint-result-top-bar")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-top-bar"))).toContain("Sprint Result");
    expect(collectText(findByTestId(renderer, "sprint-result-top-bar"))).not.toContain("History");
    expect(findByTestId(renderer, "sprint-result-hero")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-status-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-failed-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-status-glyph"))).toBe("");
    expect(findByTestId(renderer, "sprint-result-solved")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-accuracy")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-rating-change")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-time")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-best-streak")).toBeTruthy();
    expect(findByTestId(renderer, "sprint-result-mistakes")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-result-details")).toThrow();
    expect(() => findByTestId(renderer, "sprint-result-rating-card")).toThrow();
    expect(collectText(findByTestId(renderer, "sprint-result-rating-range"))).toContain("600");
    expect(collectText(findByTestId(renderer, "sprint-result-rating-change"))).toContain("600 -> 600");
    expect(findByTestId(renderer, "sprint-result-review-impact")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("No new review items");
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("0");
    expect(() => findByTestId(renderer, "sprint-result-rating-snapshot")).toThrow();
    expect(findByTestId(renderer, "sprint-result-history-trend")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-result-trend-plot")).toThrow();
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).toContain("History");
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).toContain("View performance trend");
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).not.toContain("Rating Trend");
    expect(collectText(findByTestId(renderer, "sprint-result-history-trend"))).not.toContain("History keeps the full performance chart");
    expect(findByTestId(renderer, "sprint-result-history-trend").props.accessibilityLabel).toContain("rating 600 to 600");
    expect(collectText(findByTestId(renderer, "sprint-result-trend-start"))).toBe("600");
    expect(collectText(findByTestId(renderer, "sprint-result-trend-current"))).toBe("600");
    expectText(renderer, "Mistakes");
    expect(findByTestId(renderer, "sprint-result-history-button")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "sprint-result-history-button"))).toBe("");
    expect(findByTestId(renderer, "sprint-result-history-button").props.accessibilityLabel).toBe("View history trends");
    expect(findByTestId(renderer, "result-trend-glyph")).toBeTruthy();
    expect(findByTestId(renderer, "back-practice-button")).toBeTruthy();
    expect(() => findByTestId(renderer, "sprint-result-done-button")).toThrow();
    press(renderer, "sprint-result-history-trend");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    press(renderer, "practice-tab");
    press(renderer, "sprint-result-history-button");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
    expect(findByTestId(renderer, "history-performance-card")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Rating");
    expect(findByTestId(renderer, "history-chart-line")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-line-point-0")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-chart-bar-0")).toThrow();
  });

  it("filters history to wrong attempts from the recent window", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    abandonSprint(renderer);

    press(renderer, "history-tab");
    expectText(renderer, "Accuracy 50% · Correct 1 · Wrong 1");
    expect(() => findByTestId(renderer, "app-shell-header")).toThrow();
    expect(collectText(findByTestId(renderer, "history-action-header"))).not.toContain("Filters");
    expect(collectText(findByTestId(renderer, "history-action-header"))).toContain("History");
    expect(collectText(findByTestId(renderer, "history-action-header"))).not.toContain("Performance and solved puzzles");
    expect(findByTestId(renderer, "history-filter-toggle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-filter-toggle"))).toBe("");
    expect(collectText(findByTestId(renderer, "history-action-header"))).not.toContain("≡");
    expect(findByTestId(renderer, "history-filter-toggle").props.accessibilityState).toEqual({ expanded: false });
    expect(findByTestId(renderer, "history-primary-filters")).toBeTruthy();
    expect(() => findByTestId(renderer, "history-filter-summary-card")).toThrow();
    expect(findByTestId(renderer, "history-active-filter-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("7 days");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Standard · 20s pace");
    expect(findByTestId(renderer, "history-performance-card")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-performance-card"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Standard · 20s pace · 7 days");
    expect(collectText(findByTestId(renderer, "history-performance-card"))).not.toContain("standard 5/20");
    expect(findByTestId(renderer, "history-performance-chart")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-metric-filters")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-rating")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-wins-losses")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-accuracy")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-solved")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-mistake-rate")).toBeTruthy();
    expect(findByTestId(renderer, "history-chart-review-due")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Rating");
    expect(findByTestId(renderer, "history-range-filters")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-range-max"))).toBe("All Time");
    press(renderer, "history-range-max");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Standard · 20s pace · All Time");
    press(renderer, "history-range-7d");
    expect(collectText(findByTestId(renderer, "history-performance-context"))).toBe("Standard · 20s pace · 7 days");
    expect(findByTestId(renderer, "history-filter-wrong-7-days").props.accessibilityState).toEqual({ selected: false });
    expect(() => findByTestId(renderer, "history-filter-wrong-7-days-clear-glyph")).toThrow();
    expect(() => findByTestId(renderer, "history-filter-arrow-duel-only")).toThrow();
    expect(() => findByTestId(renderer, "history-advanced-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-speed-filters")).toThrow();
    expect(() => findByTestId(renderer, "history-review-status-filters")).toThrow();
    press(renderer, "history-filter-toggle");
    expect(findByTestId(renderer, "history-filter-toggle").props.accessibilityState).toEqual({ expanded: true });
    expect(findByTestId(renderer, "history-advanced-filters")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-rating-filters"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "history-rating-filters"))).not.toContain("standard 5/20");
    expect(findByTestId(renderer, "history-speed-filters")).toBeTruthy();
    expect(findByTestId(renderer, "history-speed-20")).toBeTruthy();
    expect(findByTestId(renderer, "history-review-status-filters")).toBeTruthy();
    expect(findByTestId(renderer, "history-review-status-queued")).toBeTruthy();
    expect(findByTestId(renderer, "history-review-status-clear")).toBeTruthy();
    expect(findByTestId(renderer, "history-filter-arrow-duel-only")).toBeTruthy();
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");

    press(renderer, "history-filter-arrow-duel-only");
    expectText(renderer, "0 results");
    expectNoHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expect(findByTestId(renderer, "history-filter-arrow-duel-only")).toBeTruthy();
    press(renderer, "history-mode-standard");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");

    press(renderer, "history-speed-20");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("20s pace");
    press(renderer, "history-review-status-queued");
    expectText(renderer, "Accuracy 0% · Correct 0 · Wrong 1");
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Queued");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-review-status-clear");
    expectText(renderer, "Accuracy 100% · Correct 1 · Wrong 0");
    expectHistoryRowAccessibility(renderer, "Move e6f7");
    expectNoHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    press(renderer, "history-review-status-all");

    press(renderer, "history-chart-wins-losses");
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Wins/Losses");
    expect(collectText(findByTestId(renderer, "history-chart-value"))).toBe("+0");
    expect(() => findByTestId(renderer, "history-chart-line")).toThrow();
    expect(findByTestId(renderer, "history-chart-bar-0")).toBeTruthy();
    press(renderer, "history-chart-accuracy");
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Accuracy");
    expect(collectText(findByTestId(renderer, "history-chart-value"))).toBe("50%");
    press(renderer, "history-chart-solved");
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Solved");
    expect(collectText(findByTestId(renderer, "history-chart-value"))).toBe("1");
    press(renderer, "history-chart-mistake-rate");
    expect(collectText(findByTestId(renderer, "history-chart-label"))).toBe("Mistake rate");
    expect(collectText(findByTestId(renderer, "history-chart-value"))).toBe("50%");

    press(renderer, "history-filter-wrong-7-days");
    expect(findByTestId(renderer, "history-filter-wrong-7-days").props.accessibilityLabel).toBe("Clear wrong in the last 7 days filter");
    expect(findByTestId(renderer, "history-filter-wrong-7-days").props.accessibilityState).toEqual({ selected: true });
    expect(findByTestId(renderer, "history-filter-wrong-7-days-clear-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "history-active-filter-summary"))).toContain("Wrong 7d");
    expectText(renderer, "Accuracy 0% · Correct 0 · Wrong 1");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    expectNoHistoryRowAccessibility(renderer, "Move e6f7");
    press(renderer, "history-filter-wrong-7-days");
    expect(findByTestId(renderer, "history-filter-wrong-7-days").props.accessibilityLabel).toBe("Wrong in the last 7 days");
    expect(findByTestId(renderer, "history-filter-wrong-7-days").props.accessibilityState).toEqual({ selected: false });
    expect(() => findByTestId(renderer, "history-filter-wrong-7-days-clear-glyph")).toThrow();
    expectText(renderer, "Accuracy 50% · Correct 1 · Wrong 1");
    press(renderer, "history-filter-wrong-7-days");

    press(renderer, "history-source-sprint");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");
    press(renderer, "history-mode-standard");
    expectHistoryRowAccessibility(renderer, "Played g6g5 · Best f4g3");

    const historyAttemptRow = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    )[0];
    expect(historyAttemptRow).toBeTruthy();
    const historyAttemptId = historyAttemptRow.props.testID.replace("history-attempt-", "");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-badge`))).toBe("");
    expect(hasStyleEntry(findByTestId(renderer, `history-attempt-${historyAttemptId}-badge`), "backgroundColor", "#DC2626")).toBe(true);
    expect(findByTestId(renderer, "result-badge-wrong-glyph")).toBeTruthy();
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-result`))).toBe("Wrong move");
    expect(() => findByTestId(renderer, `history-attempt-${historyAttemptId}-move`)).toThrow();
    expect(historyAttemptRow.props.accessibilityLabel).toContain("Played g6g5 · Best f4g3");
    expect(collectText(historyAttemptRow)).not.toContain("Played g6g5 · Best f4g3");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-context`))).toContain("20s pace");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-context`))).toMatch(/^[A-Z]/);
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-meta`))).toContain("Sprint · Rating");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-meta`))).toMatch(
      /Sprint · Rating \d+ · \d+s · (Today|Yesterday|\d+ days ago|\d+w ago|\d+mo ago|\d+y ago|Scheduled) · \d{4}-\d{2}-\d{2}/
    );
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-status`))).toContain("Review");
    expect(findByTestId(renderer, `history-attempt-${historyAttemptId}-chevron`)).toBeTruthy();
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-chevron`))).toBe("");
    expect(findByTestId(renderer, `history-attempt-${historyAttemptId}-status-summary`)).toBeTruthy();
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-status-summary`))).toContain("Hard");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-difficulty`))).toBe("Hard");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-review-state`))).toContain("Review");
    expect(collectText(findByTestId(renderer, `history-attempt-${historyAttemptId}-delta`))).toMatch(/^[+-]\d+$/);
    press(renderer, historyAttemptRow.props.testID);
    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(findByTestId(renderer, "review-progress").props.children.join("")).toBe("1 / 1 · Standard");
    expect(findByTestId(renderer, "review-context-strip")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-source-pill"))).toBe("History replay");
    expect(findByTestId(renderer, "review-theme-pill")).toBeTruthy();
    expect(findByTestId(renderer, "review-reset-puzzle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-exit"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-reset-puzzle"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-header-actions"))).not.toContain("↺");
    press(renderer, "review-exit");
    expect(findByTestId(renderer, "history-panel")).toBeTruthy();
  });

  it("navigates history review across the full filtered result set, not just the visible page", () => {
    const service = createMobilePracticeService("random1000");
    for (let index = 0; index < 22; index += 1) {
      service.recordReviewAttempt({
        puzzleId: "000hf",
        mode: "standard",
        ratingKey: "standard 5/20",
        result: index % 2 === 0 ? "correct" : "wrong",
        submittedMove: `a${(index % 8) + 1}a${((index + 1) % 8) + 1}`,
        expectedMove: "c4b5",
        startedAt: new Date(Date.now() - index * 1000 - 100).toISOString()
      }, new Date(Date.now() - index * 1000).toISOString());
    }
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-review");
    expectText(renderer, "1-20 of 22");
    expect(collectText(findByTestId(renderer, "history-page-previous"))).toBe("");
    expect(collectText(findByTestId(renderer, "history-page-next"))).toBe("");
    expect(findByTestId(renderer, "history-rating-range-filters")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-all")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-under1000")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-1000-1399")).toBeTruthy();
    expect(findByTestId(renderer, "history-rating-range-1400-plus")).toBeTruthy();
    press(renderer, "history-rating-range-1000-1399");
    expectText(renderer, "0 results");
    press(renderer, "history-rating-range-1400-plus");
    expectText(renderer, "1-20 of 22");
    press(renderer, "history-page-next");
    expectText(renderer, "21-22 of 22");

    const historyAttemptRow = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    )[0];
    press(renderer, historyAttemptRow.props.testID);

    expectText(renderer, "21 / 22 · Standard");
    expect(findByTestId(renderer, "review-previous").props.disabled).toBe(false);
    press(renderer, "review-previous");
    expectText(renderer, "20 / 22 · Standard");
  });

  it("keeps history analysis review on the current puzzle after a retry is solved", async () => {
    const service = createMobilePracticeService("random1000");
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    abandonSprint(renderer);

    press(renderer, "history-tab");
    const historyAttemptRows = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    );
    const correctAttemptRow = historyAttemptRows.find((row) => collectText(row).includes("Correct"));
    expect(correctAttemptRow).toBeTruthy();
    press(renderer, correctAttemptRow!.props.testID);

    const progressBeforeRetry = collectText(findByTestId(renderer, "review-progress"));
    await boardMove(renderer, "e2e6");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "e6f7");
    await settleFeedbackSnapshot();

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-progress"))).toBe(progressBeforeRetry);
    expect(service.listHistory({ source: "scheduled_review" }) as unknown[]).toHaveLength(0);
  });

  it("shows a review button after a failed sprint with mistakes", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
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
    expect(collectText(findByTestId(renderer, "sprint-result-reason"))).toBe("Three mistakes");
    expect(findByTestId(renderer, "sprint-result-reason").props.accessibilityLabel).toBe("Result: Three mistakes");
    expectText(renderer, "3 mistakes queued");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("Mistakes");
    expect(collectText(findByTestId(renderer, "sprint-result-review-impact"))).toContain("Review your mistakes");
    expect(collectText(findByTestId(renderer, "sprint-result-mistakes"))).toBe("3");
    expect(collectText(renderer.root)).not.toContain("Start new sprint");
    const reviewButton = findByTestId(renderer, "review-mistakes-button");
    const playAgainButton = findByTestId(renderer, "play-again-button");
    expect(reviewButton).toBeTruthy();
    expect(playAgainButton).toBeTruthy();
    expect(collectText(reviewButton)).toContain("Review Mistakes");
    expect(hasStyleEntry(reviewButton, "backgroundColor", "#2563EB")).toBe(true);
    expect(hasStyleEntry(playAgainButton, "backgroundColor", "#2563EB")).toBe(false);
  });

  it("reviews missed puzzles from the completed sprint using the solving board", async () => {
    const service = createMobilePracticeService("random1000");
    const recordReviewAttempt = jest.spyOn(service, "recordReviewAttempt");
    const renderer = renderScreen({ practiceService: service });

    startStandardSprint(renderer);
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
    expect(findByTestId(renderer, "mock-chessboard").props.withLetters).toBe(false);
    expect(findByTestId(renderer, "mock-chessboard").props.withNumbers).toBe(false);
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain("abcdefgh");
    expect(collectText(findByTestId(renderer, "board-coordinate-overlay"))).toContain("87654321");
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
    expect(recordReviewAttempt).not.toHaveBeenCalled();
    press(renderer, "review-reset-puzzle");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(reviewFen);
    expectText(renderer, "1 / 3 · Standard");
    press(renderer, "review-next");
    expectText(renderer, "2 / 3 · Standard");
  });

  it("suppresses review auto-move callbacks so opponent replies animate without board resets", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
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

  it("shows a review queue before starting due reviews", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-tab-badge"))).toBe("1");
    expect(hasStyleEntry(findByTestId(renderer, "review-tab-badge"), "backgroundColor", "#DC2626")).toBe(true);
    expect(() => findByTestId(renderer, "app-shell-header")).toThrow();
    expect(collectText(findByTestId(renderer, "review-action-header"))).not.toContain("Due reviews");
    expect(collectText(findByTestId(renderer, "review-action-header"))).toContain("Review");
    expect(collectText(findByTestId(renderer, "review-action-header"))).not.toContain("Scheduled mistake reviews");
    expect(findByTestId(renderer, "review-due-card")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-toggle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-filter-toggle"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-action-header"))).not.toContain("≡");
    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityState).toEqual({ expanded: false });
    expect(() => findByTestId(renderer, "review-queue-filters")).toThrow();
    expect(() => findByTestId(renderer, "review-due-items")).toThrow();
    expect(() => findByTestId(renderer, "review-context-list")).toThrow();
    expect(findByTestId(renderer, "review-difficulty-easy")).toBeTruthy();
    expect(findByTestId(renderer, "review-difficulty-medium")).toBeTruthy();
    expect(findByTestId(renderer, "review-difficulty-hard")).toBeTruthy();
    expect(findByTestId(renderer, "review-difficulty-easy").props.accessibilityLabel).toBe("Filter easy reviews, 0 reviews, No easy reviews");
    expect(findByTestId(renderer, "review-difficulty-medium").props.accessibilityLabel).toBe("Filter medium reviews, 0 reviews, No medium reviews");
    expect(findByTestId(renderer, "review-difficulty-hard").props.accessibilityLabel).toBe("Filter hard reviews, 1 review, Overdue now");
    expect(collectText(findByTestId(renderer, "review-difficulty-easy-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-difficulty-medium-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-difficulty-hard-count"))).toBe("1");
    expect(collectText(findByTestId(renderer, "review-difficulty-list"))).not.toContain("›");
    expect(collectText(findByTestId(renderer, "review-difficulty-hard"))).toContain("1");
    expect(() => findByTestId(renderer, "review-active-filter-summary")).toThrow();
    expectText(renderer, "Due Today");
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("All due · Ready now");
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("Overdue now");
    expect(collectText(findByTestId(renderer, "review-next-due"))).toBe("Oldest: 2026-06-21");
    expect(findByTestId(renderer, "review-next-due").props.accessibilityLabel).toBe("Oldest due 2026-06-21");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1");
    expect(collectText(findByTestId(renderer, "review-overdue-count"))).toBe("1");
    expect(hasStyleEntry(findByTestId(renderer, "review-overdue-count"), "fontSize", 0)).toBe(false);
    expect(collectText(findByTestId(renderer, "review-due-card"))).toContain("Overdue");
    expect(collectText(findByTestId(renderer, "review-total-count"))).toBe("1");
    expect(collectText(findByTestId(renderer, "review-due-secondary-summary"))).toBe("1 overdue · 1 total");
    expect(collectText(findByTestId(renderer, "review-difficulty-hard"))).toContain("Overdue now");
    expectText(renderer, "Oldest: 2026-06-21");
    expectText(renderer, "Start Review");
    expect(findByTestId(renderer, "review-start-due")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();

    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-filter-toggle").props.accessibilityState).toEqual({ expanded: true });
    expect(findByTestId(renderer, "review-active-filter-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("All due");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("1 overdue");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("1 total");
    expect(findByTestId(renderer, "review-queue-filters")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-all")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-overdue")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-failed")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-mode-standard")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-arrow-duel")).toBeTruthy();
    expect(findByTestId(renderer, "review-filter-speed-20")).toBeTruthy();
    expect(findByTestId(renderer, "review-due-items")).toBeTruthy();
    expect(findByTestId(renderer, "review-context-list")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-context-list"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "review-context-list"))).not.toContain("standard 5/20");
    expectText(renderer, "Last wrong 2026-06-20");
    expectText(renderer, "1d interval");
    expectText(renderer, "Standard · 20s pace");
    expect(collectText(renderer.root)).not.toContain("Source sprint:");
    expect(collectText(renderer.root)).not.toContain("Review 1 · Lapses 1");
    const dueItemRows = renderer.root.findAll(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-due-item-")
        && node.props.accessibilityRole === "button"
    );
    expect(dueItemRows.length).toBeGreaterThan(0);
    expect(dueItemRows[0]!.props.accessibilityLabel).toContain("Source sprint: Standard · 20s pace");
    expect(dueItemRows[0]!.props.accessibilityLabel).toContain("Review 1");
    expect(dueItemRows[0]!.props.accessibilityLabel).toContain("Lapses 1");
    expect(collectText(findByTestId(renderer, `${dueItemRows[0]!.props.testID}-meta`))).toContain("Due now · 1d interval · Standard · 20s pace");
    expect(collectText(findByTestId(renderer, `${dueItemRows[0]!.props.testID}-badge`))).toBe("");
    expect(findByTestId(renderer, "result-badge-alert-glyph")).toBeTruthy();

    press(renderer, "review-filter-arrow-duel");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("No matching scheduled reviews");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("Arrow Duel only");
    expect(collectText(renderer.root)).not.toContain("Last wrong 2026-06-20");
    press(renderer, "review-filter-speed-20");
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("Overdue now");
    expect(collectText(findByTestId(renderer, "review-next-due"))).toBe("Oldest: 2026-06-21");
    expect(findByTestId(renderer, "review-next-due").props.accessibilityLabel).toBe("Oldest due 2026-06-21");
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("20s pace · Ready now");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("20s pace");
    press(renderer, "review-filter-all");
    press(renderer, "review-difficulty-hard");
    expect(findByTestId(renderer, "review-difficulty-hard").props.accessibilityState).toEqual({ selected: true });
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("Overdue now");
    expect(collectText(findByTestId(renderer, "review-next-due"))).toBe("Oldest: 2026-06-21");
    expect(findByTestId(renderer, "review-next-due").props.accessibilityLabel).toBe("Oldest due 2026-06-21");
    expect(findByTestId(renderer, "review-due-card").props.accessibilityLabel).toContain("Hard reviews · Ready now");
    expect(collectText(findByTestId(renderer, "review-active-filter-summary"))).toContain("Hard reviews");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1");
    expect(collectText(findByTestId(renderer, "review-difficulty-hard"))).toContain("1");
    press(renderer, "review-difficulty-easy");
    expect(findByTestId(renderer, "review-difficulty-easy").props.accessibilityState).toEqual({ selected: true });
    expect(collectText(findByTestId(renderer, "review-due-summary"))).toBe("No matching scheduled reviews");
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("0");
    expect(collectText(findByTestId(renderer, "review-difficulty-hard"))).toContain("1");
    press(renderer, "review-filter-all");

    const filteredDueItemRows = renderer.root.findAll(
      (node) => typeof node.props.testID === "string"
        && node.props.testID.startsWith("review-due-item-")
        && node.props.accessibilityRole === "button"
    );
    expect(filteredDueItemRows.length).toBeGreaterThan(0);
    act(() => {
      filteredDueItemRows[0]?.props.onPress();
    });

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expectText(renderer, "1 / 1 · Standard");
    expect(findByTestId(renderer, "review-context-strip")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-source-pill"))).toBe("Scheduled review");
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:20");
    expect(() => findByTestId(renderer, "review-next")).toThrow();
    expect(() => findByTestId(renderer, "review-previous")).toThrow();
    expect(() => findByTestId(renderer, "review-start-session-mistakes")).toThrow();
  });

  it("offers regular practice from an empty review queue", () => {
    const renderer = renderScreen();

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(findByTestId(renderer, "review-empty-state")).toBeTruthy();
    expectText(renderer, "No reviews due today");
    expectText(renderer, "Next review appears after a missed puzzle reaches its due time");
    expect(findByTestId(renderer, "review-empty-practice")).toBeTruthy();
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });

    press(renderer, "review-empty-practice");

    expect(findByTestId(renderer, "practice-home")).toBeTruthy();
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
  });

  it("shows the next scheduled review date when the queue has nothing due yet", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2099-01-01T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2099-01-01T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-empty-state")).toBeTruthy();
    expectText(renderer, "No reviews due today");
    expectText(renderer, "Next review due 2099-01-02");
    expect(findByTestId(renderer, "review-start-due").props.accessibilityState).toEqual({ disabled: true });
  });

  it("keeps official due review contexts separate by sprint run", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    service.recordReviewResult(
      { puzzleId: "00008", mode: "arrow_duel", ratingKey: "arrow duel 5/30" },
      "wrong",
      "2026-06-20T00:00:10.000Z"
    );
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");

    expect(findByTestId(renderer, "review-panel")).toBeTruthy();
    expect(findByTestId(renderer, "review-difficulty-list")).toBeTruthy();
    expect(findByTestId(renderer, "review-start-due")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-context-list")).toThrow();
    press(renderer, "review-filter-toggle");
    expect(findByTestId(renderer, "review-context-list")).toBeTruthy();
    expect(findByTestId(renderer, "review-context-standard-standard-5-20")).toBeTruthy();
    expect(findByTestId(renderer, "review-context-arrow-duel-arrow-duel-5-30")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();

    press(renderer, "review-context-standard-standard-5-20");

    expect(findByTestId(renderer, "review-session")).toBeTruthy();
    expectText(renderer, "1 / 1 · Standard");
    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:20");
  });

  it("records official due review mistakes immediately but keeps analysis reviews unrecorded", async () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");
    await boardMove(renderer, "c4b5");

    const officialReviewAttempts = service.listHistory({ source: "scheduled_review" }) as Array<{ result: string; submittedMove: string }>;
    expect(officialReviewAttempts).toHaveLength(1);
    expect(officialReviewAttempts[0]).toMatchObject({ result: "wrong", submittedMove: "c4b5" });

    press(renderer, "review-exit");
    press(renderer, "history-tab");
    press(renderer, "history-filter-toggle");
    press(renderer, "history-source-review");
    expectHistoryRowAccessibility(renderer, "Played c4b5 · Best e2e6");
    const historyAttemptRow = renderer.root.findAll(
      (node) => typeof node.props.testID === "string" && node.props.testID.startsWith("history-attempt-")
    )[0];
    press(renderer, historyAttemptRow.props.testID);
    press(renderer, "review-analysis-button");

    expect(service.listHistory({ source: "scheduled_review" }) as unknown[]).toHaveLength(1);
  });

  it("times official due reviews using the original sprint pace", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      "2026-06-20T00:00:00.000Z"
    );
    service.submitMove("c4b5", "2026-06-20T00:00:05.000Z");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");

    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("00:20");

    act(() => {
      jest.advanceTimersByTime(20_500);
    });

    expect(collectText(findByTestId(renderer, "review-timer"))).toBe("Time expired");
    expect(service.listHistory({ source: "scheduled_review" }) as Array<{ result: string; submittedMove: string }>).toEqual([
      expect.objectContaining({ result: "wrong", submittedMove: "__timeout__" })
    ]);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
  });

  it("opens review analysis without mutating the active review line", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
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
    expect(collectText(findByTestId(renderer, "review-analysis-button"))).toBe("Analysis");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("⌕");
    press(renderer, "review-analysis-button");

    expect(findByTestId(renderer, "review-analysis-line-0")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-close-analysis"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-back"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-forward"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-reset"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-flip"))).toBe("");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("×");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("‹");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("›");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("↺");
    expect(collectText(findByTestId(renderer, "review-analysis-toolbar"))).not.toContain("⇄");
    expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe("Local hint");
    expect(findByTestId(renderer, "analysis-arrow-overlay")).toBeTruthy();
    expect(collectText(renderer.root)).toContain("Qxe6+");
    expect(collectText(renderer.root)).toContain("M1");
    expect(collectText(renderer.root)).not.toContain("1. e2e6");
    expect(collectText(findByTestId(renderer, "review-analysis-line-0"))).toMatch(/^M1.*Qxe6\+/);
    expect(findByTestId(renderer, "mock-chessboard").props.gestureEnabled).toBe(true);
    expect(findByTestId(renderer, "mock-chessboard").props.draggableColor).toBe(new Chess(reviewFen).turn());
    expect(findByTestId(renderer, "review-analysis-back").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-forward").props.disabled).toBe(true);
    expect(findByTestId(renderer, "review-analysis-reset")).toBeTruthy();
    expect(() => press(renderer, "review-analysis-forward")).toThrow("review-analysis-forward is disabled");

    press(renderer, "review-analysis-line-0");
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

  it("streams native Stockfish depth updates into review analysis rows", async () => {
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit("info depth 4 multipv 1 score mate 1 pv e2e6");
        });
      }
      if (command === "go depth 20") {
        void Promise.resolve().then(() => {
          emit("info depth 12 multipv 1 score mate 1 pv e2e6");
          emit("bestmove e2e6");
        });
      }
    });
    const renderer = renderStandardSequenceScreen({
      stockfishTransportFactory: () => stockfish.transport
    });

    startStandardSprint(renderer);
    await boardMove(renderer, "c4b5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "g6g5");
    await settleFeedbackSnapshot();
    await boardMove(renderer, "a4b6");
    await settleFeedbackSnapshot();
    press(renderer, "review-mistakes-button");

    press(renderer, "review-analysis-button");
    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 8");
      expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe("SF 18 NNUE · Depth 4/20");
      expect(collectText(findByTestId(renderer, "review-analysis-line-0"))).toMatch(/^M1.*Qxe6\+/);
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 20");
      expect(collectText(findByTestId(renderer, "review-analysis-engine-status"))).toBe("SF 18 NNUE · Depth 12");
      expect(collectText(findByTestId(renderer, "review-analysis-line-0"))).toMatch(/^M1.*Qxe6\+/);
    });
  });

  it("isolates Stockfish diagnostics with scored live rows whose order can change by depth", async () => {
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit("info depth 4 multipv 1 score cp 20 pv d8e8");
          emit("info depth 4 multipv 2 score cp 10 pv d8d6");
        });
      }
      if (command === "go depth 20") {
        void Promise.resolve().then(() => {
          emit("info depth 12 multipv 1 score cp 360 pv d8d6");
          emit("info depth 12 multipv 2 score cp -120 pv d8e8");
          emit("bestmove d8d6");
        });
      }
    });
    const renderer = renderScreen({
      practiceService: createMobilePracticeService("familiar15"),
      stockfishTransportFactory: () => stockfish.transport
    });

    press(renderer, "settings-tab");
    press(renderer, "settings-stockfish-diagnostics");
    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 8");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-status"))).toContain("Depth 4/20");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-0"))).toMatch(/^\+0\.2.*Qe8/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-1"))).toMatch(/^\+0\.1.*Qxd6/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-panel"))).not.toContain("eval --");
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitForAssertion(() => {
      expect(stockfish.commands).toContain("go depth 20");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-status"))).toContain("Done · Depth 12");
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-0"))).toMatch(/^\+3\.6.*Qxd6/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-line-1"))).toMatch(/^-1\.2.*Qe8/);
      expect(collectText(findByTestId(renderer, "stockfish-diagnostics-raw-lines"))).toContain("info depth 12 multipv 1 score cp 360 pv d8d6");
    });
  });

  it("reviews Arrow Duel mistakes with analysis blunder arrows and a forced punishment line", async () => {
    const preview = createMobilePracticeService("familiar15");
    const previewState = preview.startSprint({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 10,
      maxMistakes: 3
    });
    const firstPuzzleSolution = [...requireArrowDuelState(previewState).puzzle.solutionMoves];
    const firstGuidedMove = firstPuzzleSolution[2];
    const firstReplyMove = firstPuzzleSolution[3];
    if (!firstGuidedMove) {
      throw new Error("Expected the first Arrow Duel fixture to have a continuation move");
    }
    if (!firstReplyMove) {
      throw new Error("Expected the first Arrow Duel fixture to have a reply after the continuation move");
    }
    const stockfish = createScriptedStockfishTransport((command, emit) => {
      if (command === "go depth 8") {
        void Promise.resolve().then(() => {
          emit(`info depth 4 multipv 1 score cp 42 pv ${firstGuidedMove}`);
        });
      }
      if (command === "go depth 20") {
        void Promise.resolve().then(() => {
          emit(`info depth 12 multipv 1 score cp 64 pv ${firstGuidedMove}`);
          emit(`bestmove ${firstGuidedMove}`);
        });
      }
    });
    const service = createMobilePracticeService("familiar15");
    const renderer = renderScreen({
      practiceService: service,
      stockfishTransportFactory: () => stockfish.transport
    });
    const wrongMoves: string[] = [];

    press(renderer, "practice-mode-arrow-duel");

    wrongMoves.push(currentArrowWrongMove(activeSprintForTest(service)));
    await boardMove(renderer, wrongMoves[0] as string);
    await settleFeedbackSnapshot();
    wrongMoves.push(currentArrowWrongMove(activeSprintForTest(service)));
    await boardMove(renderer, wrongMoves[1] as string);
    await settleFeedbackSnapshot();
    wrongMoves.push(currentArrowWrongMove(activeSprintForTest(service)));
    await boardMove(renderer, wrongMoves[2] as string);
    await settleFeedbackSnapshot();

    press(renderer, "review-mistakes-button");

    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(findByTestId(renderer, "review-arrow-legend")).toBeTruthy();
    expect(findByTestId(renderer, "review-arrow-legend").props.accessibilityLabel).toBe("Green is best move, red is blunder");
    expect(() => findByTestId(renderer, "review-arrow-choice-marker")).toThrow();
    expectText(renderer, "Green = best move · Red = blunder");
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
    expect(findByTestId(renderer, "review-arrow-legend")).toBeTruthy();
    expectText(renderer, "Green = best move · Red = blunder");
    expect(findByTestId(renderer, "review-arrow-choice-marker")).toBeTruthy();
    expect(findByTestId(renderer, "review-arrow-choice-marker").props.accessibilityLabel).toBe("You chose: Red (blunder)");
    expectText(renderer, "You chose: Red (blunder)");
    expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
    expect(countStyleEntry(findByTestId(renderer, "review-guided-move-overlay"), "backgroundColor", "#2563EB")).toBeGreaterThan(0);
    expect(countStyleEntry(findByTestId(renderer, "review-guided-move-overlay"), "backgroundColor", "#16A34A")).toBe(0);
    expect(collectText(renderer.root)).not.toContain("Choose the best move");
    expect(collectText(renderer.root)).not.toContain("Find the best move");
    expect(collectText(renderer.root)).not.toContain("Follow the puzzle line");
    expectText(renderer, "Blue arrows show the next move in the punishment line. Follow them to see why the choice is bad.");
    const guidedStartFen = findByTestId(renderer, "mock-chessboard").props.fen;
    await waitForAssertion(() => {
      expect(stockfish.commands).toContain(`position fen ${guidedStartFen}`);
      const guidedCurrentEval = collectText(findByTestId(renderer, "review-guided-eval-line-0"));
      expect(guidedCurrentEval).toMatch(/^\+0\.4.*Current position/);
    });
    const analysisPanel = findByTestId(renderer, "review-analysis-panel");
    const panelOrder = analysisPanel.findAll((node) =>
      node.props.testID === "review-guided-eval-list" || node.props.testID === "review-analysis-toolbar"
    ).map((node) => node.props.testID);
    expect(panelOrder.indexOf("review-guided-eval-list")).toBeLessThan(panelOrder.indexOf("review-analysis-toolbar"));
    const guidedCurrentEval = collectText(findByTestId(renderer, "review-guided-eval-line-0"));
    expect(guidedCurrentEval).toContain("Current position");
    expect(guidedCurrentEval).not.toContain("Top move");
    expect(guidedCurrentEval).not.toContain("Candidate");
    expect(guidedCurrentEval).not.toContain("eval --");
    expect(() => findByTestId(renderer, "review-guided-eval-line-1")).toThrow();

    const expectedAfterGuidedReply = mustFenAfterMove(
      mustFenAfterMove(guidedStartFen, firstGuidedMove),
      firstReplyMove
    );
    await boardMove(renderer, firstGuidedMove);
    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(expectedAfterGuidedReply);
    let expectedCurrentFen = expectedAfterGuidedReply;
    for (let cursor = 4; cursor < firstPuzzleSolution.length; cursor += 2) {
      expect(findByTestId(renderer, "review-guided-move-overlay")).toBeTruthy();
      const guidedMove = firstPuzzleSolution[cursor];
      if (!guidedMove) {
        break;
      }
      expectedCurrentFen = mustFenAfterMove(expectedCurrentFen, guidedMove);
      const replyMove = firstPuzzleSolution[cursor + 1];
      if (replyMove) {
        expectedCurrentFen = mustFenAfterMove(expectedCurrentFen, replyMove);
      }
      await boardMove(renderer, guidedMove);
      await settleFeedbackSnapshot();
      expect(findByTestId(renderer, "mock-chessboard").props.fen).toBe(expectedCurrentFen);
    }
    const finalCurrentEval = collectText(findByTestId(renderer, "review-guided-eval-line-0"));
    expect(finalCurrentEval).toMatch(/(?:1-0|0-1)/);
    expect(finalCurrentEval).toContain("Checkmate");
    expect(finalCurrentEval).toContain("Current position");
    expect(() => findByTestId(renderer, "review-guided-eval-line-1")).toThrow();
    await settleFeedbackSnapshot();
    press(renderer, "review-reset-puzzle");
    expectText(renderer, "Choose the best move");
    expect(() => findByTestId(renderer, "review-guided-move-overlay")).toThrow();
    press(renderer, "review-exit");
    expect(findByTestId(renderer, "practice-mode-standard")).toBeTruthy();
    expect(() => findByTestId(renderer, "review-session")).toThrow();
  });

  it("keeps a wrong due Arrow Duel review on the same puzzle until Continue is pressed", async () => {
    const service = createMobilePracticeService("random1000");
    let sprintState = service.startSprint(
      {
        mode: "arrow_duel",
        durationSeconds: 300,
        perPuzzleSeconds: 30,
        targetCorrect: 10,
        maxMistakes: 3
      },
      "2026-06-20T00:00:00.000Z"
    );
    const firstPuzzleSolution = [...requireArrowDuelState(sprintState).puzzle.solutionMoves];
    const wrongMoves: string[] = [];
    wrongMoves.push(currentArrowWrongMove(sprintState));
    sprintState = service.submitMove(wrongMoves[0] as string, "2026-06-20T00:00:05.000Z").state;
    wrongMoves.push(currentArrowWrongMove(sprintState));
    sprintState = service.submitMove(wrongMoves[1] as string, "2026-06-20T00:00:10.000Z").state;
    wrongMoves.push(currentArrowWrongMove(sprintState));
    service.submitMove(wrongMoves[2] as string, "2026-06-20T00:00:15.000Z");
    const stockfish = createScriptedStockfishTransport(() => {});
    const renderer = renderScreen({
      practiceService: service,
      stockfishTransportFactory: () => stockfish.transport
    });

    press(renderer, "review-tab");
    press(renderer, "review-start-due");

    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();

    await boardMove(renderer, wrongMoves[0] as string);
    await settleFeedbackSnapshot();
    await settleFeedbackSnapshot();
    expectText(renderer, "1 / 3 · Arrow Duel");

    for (let cursor = 2; cursor < firstPuzzleSolution.length; cursor += 2) {
      const guidedMove = firstPuzzleSolution[cursor];
      if (!guidedMove) {
        break;
      }
      await boardMove(renderer, guidedMove);
      await settleFeedbackSnapshot();
    }
    await settleFeedbackSnapshot();

    expectText(renderer, "1 / 3 · Arrow Duel");
    expect(findByTestId(renderer, "review-line-continue")).toBeTruthy();
    expect(findByTestId(renderer, "review-line-continue").props.accessibilityLabel).toBe("Continue to next review");

    press(renderer, "review-line-continue");

    expectText(renderer, "2 / 3 · Arrow Duel");
    expect(() => findByTestId(renderer, "review-line-continue")).toThrow();
  });

  it("ignores stale board callbacks instead of recording a correct visible move as wrong", async () => {
    const renderer = renderStandardSequenceScreen();

    startStandardSprint(renderer);
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
    expectSessionMistakes(renderer, 0);
    expect(() => findByTestId(renderer, "move-feedback-overlay")).toThrow();

    abandonSprint(renderer);
    press(renderer, "history-tab");
    expectText(renderer, "Accuracy 100% · Correct 1 · Wrong 0");
    expect(collectText(renderer.root)).not.toContain("Standard · wrong · e6f7");
  });

  it("keeps settings and packs screens locally reachable without a simulator", () => {
    const renderer = renderScreen();

    press(renderer, "settings-tab");
    expect(() => findByTestId(renderer, "settings-action-header")).toThrow();
    expect(() => findByTestId(renderer, "settings-sync-summary-card")).toThrow();
    expect(() => findByTestId(renderer, "settings-data-summary-card")).toThrow();
    expect(findByTestId(renderer, "settings-profile-section")).toBeTruthy();
    expect(findByTestId(renderer, "settings-sync-section")).toBeTruthy();
    expect(findByTestId(renderer, "settings-data-section")).toBeTruthy();
    expect(findByTestId(renderer, "settings-packs-section")).toBeTruthy();
    expect(findByTestId(renderer, "settings-about-section")).toBeTruthy();
    expect(findByTestId(renderer, "settings-standard-elo-row")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("ELO 600");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Advanced ratings · 3 buckets");
    expect(() => findByTestId(renderer, "settings-standard-elo-row-detail")).toThrow();
    expect(collectText(findByTestId(renderer, "settings-reset-elo"))).not.toContain("Standard puzzle rating only");
    expect(findByTestId(renderer, "settings-reset-elo-detail").props.accessibilityLabel).toBe("Resets the Standard puzzle rating only");
    expect(findByTestId(renderer, "settings-sync-disclosure")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("On · Upload approval needed");
    expect(findByTestId(renderer, "settings-sync-status").props.accessibilityLabel).toBe("Practice stays local until you approve uploading existing progress.");
    expectText(renderer, "Needs approval");
    expect(findByTestId(renderer, "settings-sync-last-synced")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-sync-last-synced"))).toContain("Pending approval");
    expect(collectText(findByTestId(renderer, "settings-sync-last-synced"))).toContain("Approve upload before existing progress leaves this device");
    expect(findByTestId(renderer, "settings-icloud-sync-toggle")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-icloud-sync-toggle"))).toBe("");
    expect(findByTestId(renderer, "settings-sync-allow-upload")).toBeTruthy();
    expectText(renderer, "Required before this device uploads existing local progress.");
    press(renderer, "settings-sync-allow-upload");
    expectText(renderer, "iCloud upload allowed");
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("On · Local-first");
    expect(findByTestId(renderer, "settings-sync-status").props.accessibilityLabel).toBe("Progress can sync through iCloud. Offline practice still works.");
    expectText(renderer, "Ready");
    expect(collectText(findByTestId(renderer, "settings-sync-last-synced"))).toContain("Today, 09:28");
    expect(collectText(findByTestId(renderer, "settings-sync-last-synced"))).toContain("This device is ready for iCloud sync");
    expect(() => findByTestId(renderer, "settings-sync-allow-upload")).toThrow();
    press(renderer, "settings-icloud-sync-toggle");
    expect(findByTestId(renderer, "settings-icloud-sync-toggle").props.accessibilityState).toEqual({ checked: false });
    expect(collectText(findByTestId(renderer, "settings-sync-status"))).toContain("Off · Local only");
    expect(findByTestId(renderer, "settings-sync-status").props.accessibilityLabel).toBe("Progress remains on this device until sync is turned back on.");
    expectText(renderer, "Local only");
    expect(collectText(findByTestId(renderer, "settings-sync-last-synced"))).toContain("Sync is disabled for this device");
    press(renderer, "settings-reset-elo");
    expect(findByTestId(renderer, "settings-reset-elo-confirmation")).toBeTruthy();
    expectText(renderer, "Reset Standard puzzle ELO?");
    expectText(renderer, "Puzzle history and review schedules stay intact.");
    press(renderer, "settings-reset-elo-confirmation-cancel");
    expect(() => findByTestId(renderer, "settings-reset-elo-confirmation")).toThrow();
    press(renderer, "settings-reset-elo");
    press(renderer, "settings-reset-elo-confirmation-confirm");
    expectText(renderer, "ELO reset");
    expect(findByTestId(renderer, "settings-export-data")).toBeTruthy();
    press(renderer, "settings-export-data");
    expectText(renderer, "Export ready · 0 attempts · 0 reviews · 4 ratings");
    press(renderer, "settings-delete-local-history");
    expect(findByTestId(renderer, "settings-delete-history-confirmation")).toBeTruthy();
    expectText(renderer, "Delete local history?");
    expectText(renderer, "Ratings and puzzle packs stay intact.");
    press(renderer, "settings-delete-history-confirmation-confirm");
    expectText(renderer, "No local history to delete");
    expect(() => findByTestId(renderer, "settings-advanced-ratings")).toThrow();
    expect(() => findByTestId(renderer, "settings-advanced-ratings-panel")).toThrow();
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Advanced ratings · 3 buckets");
    press(renderer, "settings-standard-elo-row");
    expect(findByTestId(renderer, "settings-advanced-ratings-panel")).toBeTruthy();
    expectText(renderer, "Manual rating controls");
    expect(findByTestId(renderer, "settings-advanced-rating-standard")).toBeTruthy();
    expect(findByTestId(renderer, "settings-advanced-rating-arrow-duel")).toBeTruthy();
    expect(findByTestId(renderer, "settings-advanced-rating-blitz")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard"))).toContain("Standard · 20s pace");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard"))).not.toContain("standard 5/20");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-arrow-duel"))).toContain("Arrow Duel · 30s pace");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-arrow-duel"))).not.toContain("arrow duel 5/30");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 600");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-increase"))).toBe("");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-decrease"))).toBe("");
    expect(findByTestId(renderer, "settings-advanced-rating-standard-decrease").props.accessibilityState).toEqual({ disabled: true });
    expect(collectText(renderer.root)).not.toContain("Locked");
    press(renderer, "settings-advanced-rating-standard-increase");
    expectText(renderer, "Standard rating set to 625");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 625");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("ELO 625");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Advanced ratings · 3 buckets");
    expect(findByTestId(renderer, "settings-advanced-rating-standard-decrease").props.accessibilityState).toEqual({ disabled: false });
    press(renderer, "settings-advanced-rating-standard-decrease");
    expectText(renderer, "Standard rating set to 600");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 600");
    press(renderer, "settings-standard-elo-row");
    expect(() => findByTestId(renderer, "settings-advanced-ratings-panel")).toThrow();
    expect(findByTestId(renderer, "settings-manage-packs")).toBeTruthy();
    expect(findByTestId(renderer, "settings-app-version")).toBeTruthy();
    expect(findByTestId(renderer, "settings-license")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "settings-license"))).not.toContain("Stockfish integration keeps the app open source");
    expect(findByTestId(renderer, "settings-license-detail").props.accessibilityLabel).toBe("Stockfish integration keeps the app open source");
    expect(collectText(findByTestId(renderer, "settings-data-section"))).not.toContain("›");
    expect(collectText(findByTestId(renderer, "settings-packs-section"))).not.toContain("›");

    press(renderer, "settings-manage-packs");
    expect(findByTestId(renderer, "packs-panel")).toBeTruthy();
    expect(() => findByTestId(renderer, "app-shell-header")).toThrow();
    expect(collectText(findByTestId(renderer, "packs-action-header"))).toContain("Puzzle Packs");
    expect(collectText(findByTestId(renderer, "packs-action-header"))).not.toContain("Coverage");
    expect(collectText(findByTestId(renderer, "packs-action-header"))).not.toContain("Offline-ready puzzle sources");
    press(renderer, "packs-tab");
    expect(() => findByTestId(renderer, "packs-import")).toThrow();
    expect(() => findByTestId(renderer, "packs-optional-section")).toThrow();
    expect(() => findByTestId(renderer, "packs-remove")).toThrow();
    expect(findByTestId(renderer, "packs-coverage-summary")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "packs-coverage-header"))).toBe("Coverage");
    expect(collectText(findByTestId(renderer, "packs-summary-installed"))).toContain("1 pack");
    expect(collectText(findByTestId(renderer, "packs-summary-puzzles"))).toContain("3,000");
    expect(collectText(findByTestId(renderer, "packs-summary-rating"))).toContain("600-1600");
    expect(collectText(findByTestId(renderer, "packs-summary-arrow-duel"))).toContain("2,399");
    expect(findByTestId(renderer, "packs-installed-section")).toBeTruthy();
    expect(findByTestId(renderer, "packs-installed-core")).toBeTruthy();
    expect(findByTestId(renderer, "packs-installed-core").props.accessibilityLabel).toContain("Core Pack, active puzzle pack");
    expect(findByTestId(renderer, "packs-installed-core").props.accessibilityLabel).toContain("rating 600-1600");
    expect(findByTestId(renderer, "packs-active-core")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "packs-active-core"))).toBe("");
    expect(collectText(findByTestId(renderer, "packs-installed-core"))).not.toContain("Active");
    expect(collectText(findByTestId(renderer, "packs-meta-core"))).toBe("600-1600 · 59 themes · Arrow Duel 2,399");
    expect(collectText(findByTestId(renderer, "packs-subtitle-core"))).toBe("3,000 puzzles");
    expect(findByTestId(renderer, "packs-coverage-core")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "packs-coverage-core"))).toBe("");
    expect(findByTestId(renderer, "packs-coverage-core").props.accessibilityLabel).toBe("Rating 600-1600, themes 59 themes, Arrow Duel 2,399");
    expect(findByTestId(renderer, "packs-offline-readiness")).toBeTruthy();
    expectText(renderer, "The bundled Core Pack ships with the app and works fully offline. This version does not download additional packs.");
    press(renderer, "packs-detail-core");
    expect(findByTestId(renderer, "pack-detail-panel")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "pack-detail-close"))).toBe("");
    expect(collectText(findByTestId(renderer, "pack-detail-puzzles"))).toContain("3,000");
    expect(collectText(findByTestId(renderer, "pack-detail-rating"))).toContain("600-1600");
    expect(collectText(findByTestId(renderer, "pack-detail-themes"))).toContain("59 themes");
    expect(collectText(findByTestId(renderer, "pack-detail-arrow-duel"))).toContain("2,399");
    expect(findByTestId(renderer, "pack-detail-source")).toBeTruthy();
    expect(findByTestId(renderer, "pack-detail-presolve")).toBeTruthy();
    expect(findByTestId(renderer, "pack-detail-manifest-hash")).toBeTruthy();
    expect(findByTestId(renderer, "pack-detail-build-date")).toBeTruthy();
    expect(findByTestId(renderer, "pack-detail-license-notes")).toBeTruthy();
    expectText(renderer, getBundledCorePackManifest().manifestHash);
    expectText(renderer, "Derived from Lichess puzzle data with Chessticize presolve metadata.");
    expect(() => findByTestId(renderer, "pack-detail-import")).toThrow();
    expect(() => findByTestId(renderer, "pack-detail-remove")).toThrow();
    press(renderer, "pack-detail-close");
    expect(() => findByTestId(renderer, "pack-detail-panel")).toThrow();
    expect(findByTestId(renderer, "packs-license-notes")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "packs-license-notes"))).toContain("Lichess-derived");
    expect(collectText(findByTestId(renderer, "packs-info-section"))).not.toContain("Manifest");
    expect(collectText(findByTestId(renderer, "packs-info-section"))).not.toContain("Build date");
    expect(findByTestId(renderer, "packs-license-notes-detail").props.accessibilityLabel).toBe("Puzzle data is derived from the Lichess puzzle database and bundled for offline use with Chessticize presolve metadata.");
    expect(findByTestId(renderer, "packs-source")).toBeTruthy();
    expect(findByTestId(renderer, "packs-processing")).toBeTruthy();
  });

  it("opens advanced rating controls from the current Puzzle ELO row", () => {
    const renderer = renderScreen();

    press(renderer, "settings-tab");
    expect(typeof findByTestId(renderer, "settings-standard-elo-row").props.onPress).toBe("function");
    expect(collectText(findByTestId(renderer, "settings-standard-elo-row"))).toContain("Advanced ratings · 3 buckets");
    expect(() => findByTestId(renderer, "settings-standard-elo-row-detail")).toThrow();
    expect(() => findByTestId(renderer, "settings-advanced-ratings-panel")).toThrow();

    press(renderer, "settings-standard-elo-row");

    expect(findByTestId(renderer, "settings-advanced-ratings-panel")).toBeTruthy();
    expectText(renderer, "Manual rating controls");
    expect(collectText(findByTestId(renderer, "settings-advanced-rating-standard-value"))).toBe("ELO 600");
  });

  it("ships only the bundled core pack with no download or remove affordances", () => {
    const renderer = renderScreen();

    press(renderer, "packs-tab");

    expect(findByTestId(renderer, "packs-installed-core")).toBeTruthy();
    expect(findByTestId(renderer, "packs-offline-readiness")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "packs-summary-installed"))).toContain("1 pack");
    expect(() => findByTestId(renderer, "packs-import")).toThrow();
    expect(() => findByTestId(renderer, "packs-remove")).toThrow();
    expect(() => findByTestId(renderer, "packs-optional-section")).toThrow();
    expect(() => findByTestId(renderer, "packs-import-progress")).toThrow();
    expect(() => findByTestId(renderer, "packs-remove-confirmation")).toThrow();
    expect(collectText(findByTestId(renderer, "packs-panel"))).not.toContain("Import");
    expect(collectText(findByTestId(renderer, "packs-panel"))).not.toContain("Remove");
  });

  it("deletes local history and review queue from Settings while preserving rating", () => {
    const service = createMobilePracticeService("random1000");
    service.startSprint(
      { mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 5, maxMistakes: 1 },
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 120_000).toISOString()
    );
    service.submitMove("c4b5", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 60_000).toISOString());
    const ratingBefore = service.getRating("standard 5/20");
    const renderer = renderScreen({ practiceService: service });

    press(renderer, "history-tab");
    expectHistoryRowAccessibility(renderer, "Played c4b5 · Best e2e6");
    press(renderer, "review-tab");
    expect(findByTestId(renderer, "review-due-card")).toBeTruthy();
    expect(collectText(findByTestId(renderer, "review-due-count"))).toBe("1");

    press(renderer, "settings-tab");
    press(renderer, "settings-export-data");
    expectText(renderer, "Export ready · 1 attempt · 1 review · 4 ratings");
    press(renderer, "settings-delete-local-history");
    press(renderer, "settings-delete-history-confirmation-confirm");

    expectText(renderer, "Local history deleted · 1 attempt · 1 review");
    expect(service.getRating("standard 5/20")).toEqual(ratingBefore);
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
    press(renderer, "review-tab");
    expectText(renderer, "No reviews due today");
  });
});

function createScriptedStockfishTransport(
  onCommand: (command: string, emit: (line: string) => void) => void
): { commands: string[]; transport: UciEngineTransport } {
  const commands: string[] = [];
  const listeners = new Set<(line: string) => void>();
  const emit = (line: string) => {
    for (const listener of listeners) {
      listener(line);
    }
  };

  return {
    commands,
    transport: {
      start: jest.fn(async () => {}),
      send: jest.fn((command: string) => {
        commands.push(command);
        onCommand(command, emit);
      }),
      onLine: (listener: (line: string) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      terminate: jest.fn()
    }
  };
}

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

function activeSprintForTest(service: ReturnType<typeof createMobilePracticeService>): SprintState {
  const state = service.getActiveSprint();
  if (!state) {
    throw new Error("Expected an active sprint");
  }
  return state;
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

async function pressAsync(renderer: TestRenderer.ReactTestRenderer, testID: string): Promise<void> {
  await act(async () => {
    const target = findByTestId(renderer, testID);
    if (target.props.disabled) {
      throw new Error(`${testID} is disabled`);
    }
    target.props.onPress();
    await Promise.resolve();
  });
}

function startStandardSprint(renderer: TestRenderer.ReactTestRenderer): void {
  press(renderer, "practice-mode-standard");
}

function abandonSprint(renderer: TestRenderer.ReactTestRenderer): void {
  press(renderer, "session-abandon");
  expect(findByTestId(renderer, "session-abandon-confirmation")).toBeTruthy();
  press(renderer, "session-abandon-confirm");
}

function expectSessionMistakes(renderer: TestRenderer.ReactTestRenderer, count: number): void {
  expect(findByTestId(renderer, "session-score-strip").props.accessibilityLabel).toContain(`mistakes ${count}`);
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

async function waitForAssertion(assertion: () => void, attempts = 10): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushMicrotasks();
    }
  }
  throw lastError;
}

function findByTestId(renderer: TestRenderer.ReactTestRenderer, testID: string): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ testID });
}

function expectText(renderer: TestRenderer.ReactTestRenderer, expected: string): void {
  expect(collectText(renderer.root)).toContain(expected);
}

function expectHistoryRowAccessibility(renderer: TestRenderer.ReactTestRenderer, expected: string): void {
  expect(historyAttemptRows(renderer).some((row) => String(row.props.accessibilityLabel ?? "").includes(expected))).toBe(true);
}

function expectNoHistoryRowAccessibility(renderer: TestRenderer.ReactTestRenderer, expected: string): void {
  expect(historyAttemptRows(renderer).some((row) => String(row.props.accessibilityLabel ?? "").includes(expected))).toBe(false);
}

function historyAttemptRows(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(
    (node) => typeof node.props.testID === "string"
      && node.props.testID.startsWith("history-attempt-")
      && node.props.accessibilityRole === "button"
  );
}

function testIdOrder(renderer: TestRenderer.ReactTestRenderer, first: string, second: string): number {
  const testIDs = collectTestIds(renderer.root);
  return testIDs.indexOf(first) - testIDs.indexOf(second);
}

function collectTestIds(node: TestRenderer.ReactTestInstance): string[] {
  const ownTestID = typeof node.props?.testID === "string" ? [node.props.testID] : [];
  const childTestIDs = node.children
    .filter((child): child is TestRenderer.ReactTestInstance => typeof child !== "string")
    .flatMap((child) => collectTestIds(child));
  return [...ownTestID, ...childTestIDs];
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
