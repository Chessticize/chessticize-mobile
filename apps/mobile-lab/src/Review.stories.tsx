import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import { clickTestId, openReviewQueue, waitForTestId } from "./storyPlay.ts";

const meta = {
  title: "Review",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyQueue: Story = {
  name: "Empty queue",
  args: { scenarioId: "review-empty" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await waitForTestId(canvasElement, "review-empty-state");
  }
};

export const DueQueue: Story = {
  name: "Due queue",
  args: { scenarioId: "review-due" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await waitForTestId(canvasElement, "review-due-items");
  }
};

export const OverdueQueue: Story = {
  name: "Overdue queue",
  args: { scenarioId: "review-overdue" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await waitForTestId(canvasElement, "review-overdue-count");
  }
};

export const Filters: Story = {
  args: { scenarioId: "review-filters" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await clickTestId(canvasElement, "review-filter-toggle");
    await clickTestId(canvasElement, "review-filter-overdue");
    await waitForTestId(canvasElement, "review-active-filter-summary");
  }
};

export const ReviewSession: Story = {
  name: "Review session",
  args: { scenarioId: "review-session" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await clickTestId(canvasElement, "review-start-due");
    await waitForTestId(canvasElement, "review-session");
    await waitForTestId(canvasElement, "lab-board-placeholder");
  }
};

export const FeedbackAndAnalysis: Story = {
  name: "Feedback and analysis",
  args: { scenarioId: "review-feedback-analysis" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await clickTestId(canvasElement, "review-start-due");
    await clickTestId(canvasElement, "lab-board-wrong");
    await waitForTestId(canvasElement, "review-analysis-button");
    await clickTestId(canvasElement, "review-analysis-button");
    await waitForTestId(canvasElement, "review-analysis-panel");
  }
};
