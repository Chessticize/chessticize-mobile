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
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await waitForTestId(canvasElement, "history-attempt-history-unclear");
  }
};

export const FiltersAndActiveFilters: Story = {
  name: "Filters and active filters",
  args: { scenarioId: "history-filters" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-filter-toggle");
    await clickTestId(canvasElement, "history-filter-wrong-only");
    await waitForTestId(canvasElement, "history-active-filter-summary");
  }
};

export const AttemptDetail: Story = {
  name: "Attempt detail",
  args: { scenarioId: "history-attempt-detail" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attempt-history-unclear");
    await waitForTestId(canvasElement, "history-attempt-detail");
  }
};

export const ReplayUnavailable: Story = {
  name: "Replay unavailable",
  args: { scenarioId: "history-replay-unavailable" },
  play: async ({ canvasElement }) => {
    await openHistory(canvasElement);
    await clickTestId(canvasElement, "history-attempt-history-arrow-legacy");
    await waitForTestId(canvasElement, "history-attempt-detail-replay-unavailable");
  }
};
