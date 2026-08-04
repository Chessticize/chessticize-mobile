import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import {
  clickTestId,
  expectTestIdAbsent,
  expectTestIdText,
  openHistory,
  waitForEnabledTestId,
  waitForTestId,
  waitForText
} from "./storyPlay.ts";

const meta = {
  title: "History",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyHistory: Story = {
  name: "Empty history",
  args: { scenarioId: "history-empty" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await waitForTestId(canvasElement, "history-empty-state");
  }
};

export const PopulatedHistory: Story = {
  name: "Populated history",
  args: { scenarioId: "history-populated" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await waitForTestId(canvasElement, "history-attempt-history-unclear");
    await waitForTestId(canvasElement, "history-attempt-history-timeout");
    await waitForTestId(canvasElement, "history-attempt-history-incomplete-fast");
    await waitForTestId(canvasElement, "history-attempt-history-incomplete-slow");
    await waitForTestId(canvasElement, "history-attention-filter");
    await waitForTestId(canvasElement, "history-active-filter-summary");
    await waitForTestId(canvasElement, "history-progress-button");
    (canvasElement.querySelector('[data-testid="history-attention-needs-attention"]') as HTMLElement | null)?.blur();
    (canvasElement.querySelector('[data-testid="history-tab"]') as HTMLElement | null)?.blur();
  }
};

export const FiltersAndActiveFilters: Story = {
  name: "Filters and active filters",
  args: { scenarioId: "history-filters" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-filter-toggle");
    await waitForTestId(canvasElement, "history-attention-needs-attention");
    await waitForTestId(canvasElement, "history-theme-disclosure");
    await clickTestId(canvasElement, "history-theme-disclosure");
    await clickTestId(canvasElement, "history-theme-pin");
    await clickTestId(canvasElement, "history-theme-skewer");
    await clickTestId(canvasElement, "history-theme-promotion");
    await clickTestId(canvasElement, "history-theme-disclosure");
    await clickTestId(canvasElement, "history-result-incomplete");
    await waitForTestId(canvasElement, "history-attempt-history-incomplete-fast");
    expectTestIdAbsent(canvasElement, "history-attempt-history-timeout");
    expectTestIdAbsent(canvasElement, "history-attempt-history-wrong");
    await waitForTestId(canvasElement, "history-theme-selection-detail");
    (canvasElement.querySelector('[data-testid="history-theme-disclosure"]') as HTMLElement | null)?.blur();
    (canvasElement.querySelector('[data-testid="history-result-incomplete"]') as HTMLElement | null)?.blur();
  }
};

export const TacticalProgress: Story = {
  name: "Tactical progress",
  args: { scenarioId: "history-progress" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-progress-button");
    await waitForTestId(canvasElement, "history-progress-screen");
    await waitForTestId(canvasElement, "history-strength-chart");
    await waitForTestId(canvasElement, "history-no-clear-weakness");
    await waitForTestId(canvasElement, "history-progress-task-family-selector");
    await clickTestId(canvasElement, "history-progress-task-family-arrow_duel");
    await waitForTestId(
      canvasElement,
      "history-progress-strength-arrow-duel-advanced-pawn"
    );
    expectTestIdAbsent(canvasElement, "history-progress-strength-pins");
    await clickTestId(canvasElement, "history-progress-metric-completed_speed");
    (canvasElement.querySelector(
      '[data-testid="history-progress-metric-completed_speed"]'
    ) as HTMLElement | null)?.blur();
    await clickTestId(canvasElement, "history-progress-metric-solve_rate");
    (canvasElement.querySelector(
      '[data-testid="history-progress-metric-solve_rate"]'
    ) as HTMLElement | null)?.blur();
  }
};

export const TacticalProgressClearWeakness: Story = {
  name: "Tactical progress · reliability weakness",
  args: { scenarioId: "history-progress-weakness" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-progress-button");
    await waitForTestId(canvasElement, "history-progress-screen");
    await waitForTestId(canvasElement, "history-clear-weakness");
    await waitForTestId(canvasElement, "history-weakness-effect-solve_rate");
  }
};

export const TacticalProgressCompletedSpeedWeakness: Story = {
  name: "Tactical progress · completed-speed weakness",
  args: { scenarioId: "history-progress-speed-weakness" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-progress-button");
    await waitForTestId(canvasElement, "history-progress-screen");
    await waitForTestId(canvasElement, "history-clear-weakness");
    await waitForTestId(canvasElement, "history-weakness-effect-completed_speed");
  }
};

export const AttemptDetail: Story = {
  name: "Replay puzzle",
  args: { scenarioId: "history-attempt-detail" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attempt-history-unclear");
    await waitForTestId(canvasElement, "review-session");
    await expectTestIdText(canvasElement, "review-title", "Replay");
    expectTestIdAbsent(canvasElement, "review-source-pill");
    expectTestIdAbsent(canvasElement, "review-context-unclear");
    expectTestIdAbsent(canvasElement, "review-context-needs-review");
    await expectTestIdText(canvasElement, "history-attempt-clear-unclear", "Mark clear");
    await clickTestId(canvasElement, "review-analysis-button");
    await waitForTestId(canvasElement, "review-theme-rail");
  }
};

export const ArrowDuelReplayFullLine: Story = {
  name: "Arrow Duel Replay · full line",
  args: { scenarioId: "history-arrow-duel-replay" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attention-all");
    await clickTestId(canvasElement, "history-attempt-history-arrow-duel-replay");
    await waitForEnabledTestId(canvasElement, "lab-board-correct");
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForEnabledTestId(canvasElement, "lab-board-correct");
    expectTestIdAbsent(canvasElement, "review-arrow-duel-reply-timer");
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForText(canvasElement, "Find the best move");
    await waitForText(canvasElement, "For white.");
    expectTestIdAbsent(canvasElement, "review-guided-move-overlay");
    expectTestIdAbsent(canvasElement, "practice-prompt-solved-overlay");
  }
};

export const ArrowDuelReplayPunishmentLine: Story = {
  name: "Arrow Duel Replay · punishment line",
  args: {
    scenarioId: "history-arrow-duel-replay",
    storyPresentation: {
      storyId: "history--arrow-duel-replay-punishment-line",
      title: "Arrow Duel Replay · punishment line"
    }
  },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attention-all");
    await clickTestId(canvasElement, "history-attempt-history-arrow-duel-replay");
    await waitForEnabledTestId(canvasElement, "lab-board-wrong");
    await clickTestId(canvasElement, "lab-board-wrong");
    await waitForTestId(canvasElement, "review-guided-move-overlay");
    await waitForText(canvasElement, "Follow the blue line to see why this move fails.");
  }
};

export const ArrowDuelReplaySolved: Story = {
  name: "Arrow Duel Replay · solved",
  args: {
    scenarioId: "history-arrow-duel-replay",
    storyPresentation: {
      storyId: "history--arrow-duel-replay-solved",
      title: "Arrow Duel Replay · solved"
    }
  },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attention-all");
    await clickTestId(canvasElement, "history-attempt-history-arrow-duel-replay");
    for (let moveIndex = 0; moveIndex < 4; moveIndex += 1) {
      await waitForEnabledTestId(canvasElement, "lab-board-correct");
      await clickTestId(canvasElement, "lab-board-correct");
    }
    await waitForText(canvasElement, "Solved");
  }
};

export const ReplayUnavailable: Story = {
  name: "Replay unavailable",
  args: { scenarioId: "history-replay-unavailable" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attention-all");
    await clickTestId(canvasElement, "history-attempt-history-arrow-legacy");
    await waitForTestId(canvasElement, "history-replay-unavailable");
    await expectTestIdText(canvasElement, "review-title", "Replay");
  }
};
