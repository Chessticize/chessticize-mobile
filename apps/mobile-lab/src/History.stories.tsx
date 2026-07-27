import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import { clickTestId, openHistory, waitForTestId } from "./storyPlay.ts";

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
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await waitForTestId(canvasElement, "history-attempt-history-unclear");
    await waitForTestId(canvasElement, "history-attention-filter");
    await waitForTestId(canvasElement, "history-active-filter-summary");
    (canvasElement.querySelector('[data-testid="history-attention-needs-attention"]') as HTMLElement | null)?.blur();
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
    await waitForTestId(canvasElement, "history-theme-selection-detail");
    (canvasElement.querySelector('[data-testid="history-theme-disclosure"]') as HTMLElement | null)?.blur();
  }
};

export const TacticalProgress: Story = {
  name: "Tactical progress",
  args: { scenarioId: "history-progress" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-progress-button");
    await waitForTestId(canvasElement, "history-progress-screen");
    await waitForTestId(canvasElement, "history-strength-chart");
    await waitForTestId(canvasElement, "history-no-clear-weakness");
    await clickTestId(canvasElement, "history-progress-strength-pins");
  }
};

export const TacticalProgressClearWeakness: Story = {
  name: "Tactical progress · reliability weakness",
  args: { scenarioId: "history-progress-weakness" },
  tags: ["new"],
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
  tags: ["new"],
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
    await clickTestId(canvasElement, "review-analysis-button");
    await waitForTestId(canvasElement, "review-theme-rail");
  }
};

export const ReplayUnavailable: Story = {
  name: "Replay unavailable",
  args: { scenarioId: "history-replay-unavailable" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attention-all");
    await clickTestId(canvasElement, "history-attempt-history-arrow-legacy");
    await waitForTestId(canvasElement, "history-attempt-detail-replay-unavailable");
  }
};
