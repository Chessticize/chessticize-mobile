import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { PracticePocScreen } from "../src/components/PracticePocScreen";

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
  });

  it("submits standard puzzle moves through the board and records attempt history", () => {
    const renderer = renderScreen();

    press(renderer, "start-sprint-button");
    expectText(renderer, "000hf · 1485");
    expect(findByTestId(renderer, "session-board")).toBeTruthy();
    expect(findByTestId(renderer, "session-timer")).toBeTruthy();
    expect(findByTestId(renderer, "session-progress")).toBeTruthy();
    expect(findByTestId(renderer, "session-mistakes")).toBeTruthy();

    boardMove(renderer, "e2e6");
    expectText(renderer, "correct · expected e2e6");

    boardMove(renderer, "e6f7");

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "000hf · standard · correct · e6f7");
  });

  it("uses neutral Arrow Duel candidates and shows colored review after selection", () => {
    const renderer = renderScreen();

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "start-sprint-button");

    expect(findByTestId(renderer, "arrow-duel-candidate-a")).toBeTruthy();
    expect(findByTestId(renderer, "arrow-duel-candidate-b")).toBeTruthy();
    expect(hasStyleValue(renderer.root, "#475569")).toBe(true);
    expect(hasStyleValue(renderer.root, "#DC2626")).toBe(false);

    boardMove(renderer, "e8f7");

    expectText(renderer, "correct · d8a5");
    expectText(renderer, "wrong · e8f7 (selected)");
    expect(hasStyleValue(renderer.root, "#16A34A")).toBe(true);
    expect(hasStyleValue(renderer.root, "#DC2626")).toBe(true);

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "000hf · arrow_duel · wrong · e8f7");
  });

  it("records non-candidate Arrow Duel board moves as wrong", () => {
    const renderer = renderScreen();

    press(renderer, "practice-mode-arrow-duel");
    press(renderer, "start-sprint-button");

    boardMove(renderer, "a1a8");
    expectText(renderer, "wrong · expected d8a5");
    expectText(renderer, "Mistakes 1 / 3");

    press(renderer, "session-abandon");
    press(renderer, "history-tab");
    expectText(renderer, "000hf · arrow_duel · wrong · a1a8");
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

    expectText(renderer, "Mode · custom");
    expectText(renderer, "Target 6");
    expectText(renderer, "Progress 0 / 6");
  });

  it("settles an active sprint when the countdown expires", () => {
    const renderer = renderScreen();

    press(renderer, "start-sprint-button");
    act(() => {
      jest.advanceTimersByTime(301_000);
    });

    expectText(renderer, "Sprint failed");
    expectText(renderer, "Result: time_expired");
  });

  it("filters history to wrong attempts from the recent window", () => {
    const renderer = renderScreen();

    press(renderer, "start-sprint-button");
    boardMove(renderer, "e2e6");
    boardMove(renderer, "e6f7");
    boardMove(renderer, "a1a8");
    press(renderer, "session-abandon");

    press(renderer, "history-tab");
    expectText(renderer, "Accuracy 50% · Correct 1 · Wrong 1");
    expectText(renderer, "000hf · standard · correct · e6f7");
    expectText(renderer, "000hf~demo-01 · standard · wrong · a1a8");

    press(renderer, "history-filter-wrong-7-days");
    expectText(renderer, "Accuracy 0% · Correct 0 · Wrong 1");
    expectText(renderer, "000hf~demo-01 · standard · wrong · a1a8");
    expect(collectText(renderer.root)).not.toContain("000hf · standard · correct · e6f7");
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

function renderScreen(): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(<PracticePocScreen />);
  });
  if (!renderer) {
    throw new Error("PracticePocScreen did not render");
  }
  renderers.push(renderer);
  return renderer;
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

function boardMove(renderer: TestRenderer.ReactTestRenderer, move: string): void {
  act(() => {
    findByTestId(renderer, "mock-chessboard").props.onMove({
      move: {
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move.length > 4 ? move.slice(4, 5) : undefined
      }
    });
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
