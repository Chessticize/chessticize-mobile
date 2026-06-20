import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { PracticePocScreen } from "../src/components/PracticePocScreen";

describe("PracticePocScreen", () => {
  it("completes a standard multi-step sprint and records history", () => {
    const renderer = renderScreen();

    press(renderer, "start-sprint-button");
    expectText(renderer, "00008 · 1798");

    press(renderer, "move-e6e7");
    expectText(renderer, "correct · expected e6e7");

    press(renderer, "move-b3c1");
    press(renderer, "move-h6c1");

    expectText(renderer, "Status won");
    expectText(renderer, "ELO 632");

    press(renderer, "history-tab");
    expectText(renderer, "00008 · correct · h6c1");
  });

  it("shows Arrow Duel review arrows and queues a wrong puzzle for review", () => {
    const renderer = renderScreen();

    press(renderer, "arrow-duel-mode-button");
    press(renderer, "start-sprint-button");
    press(renderer, "move-f2g3");

    expectText(renderer, "correct b2b1");
    expectText(renderer, "wrong f2g3 selected");

    press(renderer, "review-tab");
    expectText(renderer, "00008 · wrong · 2026-06-21");
  });

  it("keeps invalid Arrow Duel moves out of history", () => {
    const renderer = renderScreen();

    press(renderer, "arrow-duel-mode-button");
    press(renderer, "start-sprint-button");

    expect(() => findByTestId(renderer, "move-a1a8")).toThrow();
    press(renderer, "history-tab");
    expectText(renderer, "No attempts");
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
  return renderer;
}

function press(renderer: TestRenderer.ReactTestRenderer, testID: string): void {
  act(() => {
    findByTestId(renderer, testID).props.onPress();
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
