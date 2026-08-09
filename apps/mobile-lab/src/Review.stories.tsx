import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import {
  clickTestId,
  expectTestIdAbsent,
  expectTestIdHeight,
  expectTestIdVerticalCentersAligned,
  expectTestIdText,
  expectTestIdsInOrder,
  openReviewQueue,
  waitForEnabledTestId,
  waitForHiddenTestId,
  waitForTestId,
  waitForText,
  waitForVisibleTestId
} from "./storyPlay.ts";

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
  name: "Home",
  args: { scenarioId: "review-due" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await waitForVisibleTestId(canvasElement, "review-start-due");
    await waitForTestId(canvasElement, "review-due-items");
    await waitForTestId(canvasElement, "review-today-to-review-toggle");
    await waitForTestId(canvasElement, "review-due-item-lab-fork-01-standard-badge");
    await waitForTestId(canvasElement, "review-today-history");
    await waitForTestId(canvasElement, "review-completed-today-toggle");
    await waitForTestId(canvasElement, "review-today-history-items");
    await waitForVisibleTestId(canvasElement, "review-today-to-review-items-motion");
    await waitForVisibleTestId(canvasElement, "review-today-history-items-motion");
    await expectTestIdHeight(canvasElement, "review-today-to-review-toggle", 44);
    await expectTestIdHeight(canvasElement, "review-completed-today-toggle", 44);
    await expectTestIdVerticalCentersAligned(
      canvasElement,
      "review-today-to-review-toggle-count",
      "review-today-to-review-toggle-chevron"
    );
    await expectTestIdVerticalCentersAligned(
      canvasElement,
      "review-completed-today-toggle-count",
      "review-completed-today-toggle-chevron"
    );
    await waitForText(canvasElement, "First missed 1 day ago");
    await waitForText(canvasElement, "Last retry 3 days ago");
    await expectTestIdText(
      canvasElement,
      "review-due-item-lab-fork-01-standard-meta",
      "1 attempt · 1 miss · Standard · 20s pace"
    );
    await expectTestIdText(
      canvasElement,
      "review-due-item-lab-skewer-03-arrow-duel-meta",
      "3 attempts · 2 misses · Arrow Duel · 30s pace"
    );
    await expectTestIdsInOrder(canvasElement, [
      "review-filter-options-motion",
      "review-active-filter-summary",
      "review-start-due",
      "review-due-items",
      "review-today-history"
    ]);
    await expectTestIdText(canvasElement, "review-active-filter-0", "All");
    await expectTestIdText(canvasElement, "review-active-filter-1", "3 today");
    await clickTestId(canvasElement, "review-today-to-review-toggle");
    await waitForHiddenTestId(canvasElement, "review-today-to-review-items-motion");
    await expectTestIdHeight(canvasElement, "review-today-to-review-toggle", 44);
    await clickTestId(canvasElement, "review-today-to-review-toggle");
    await waitForVisibleTestId(canvasElement, "review-today-to-review-items-motion");
    await expectTestIdHeight(canvasElement, "review-today-to-review-toggle", 44);
    await clickTestId(canvasElement, "review-completed-today-toggle");
    await waitForHiddenTestId(canvasElement, "review-today-history-items-motion");
    await expectTestIdHeight(canvasElement, "review-completed-today-toggle", 44);
    await clickTestId(canvasElement, "review-completed-today-toggle");
    await waitForVisibleTestId(canvasElement, "review-today-history-items-motion");
    await expectTestIdHeight(canvasElement, "review-completed-today-toggle", 44);
    await clickTestId(canvasElement, "review-filter-toggle");
    await waitForVisibleTestId(canvasElement, "review-filter-options-motion");
    await waitForTestId(canvasElement, "review-active-filter-summary");
    await clickTestId(canvasElement, "review-filter-toggle");
    await waitForHiddenTestId(canvasElement, "review-filter-options-motion");
    await waitForTestId(canvasElement, "review-active-filter-summary");
    expectTestIdAbsent(canvasElement, "review-dev-controls");
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
    await waitForTestId(canvasElement, "review-today-to-review-toggle");
    await waitForTestId(canvasElement, "review-completed-today-toggle");
    await expectTestIdsInOrder(canvasElement, [
      "review-filter-options-motion",
      "review-active-filter-summary",
      "review-start-due",
      "review-due-items",
      "review-today-history"
    ]);
    await expectTestIdText(canvasElement, "review-active-filter-0", "All");
    await expectTestIdText(canvasElement, "review-active-filter-1", "3 today");
    await clickTestId(canvasElement, "review-filter-toggle");
    await waitForVisibleTestId(canvasElement, "review-filter-options-motion");
    await expectTestIdText(canvasElement, "review-filter-all", "All");
    await expectTestIdText(canvasElement, "review-filter-overdue", "Overdue");
    await expectTestIdText(canvasElement, "review-filter-repeat-misses", "Missed 2+ times");
    await expectTestIdText(canvasElement, "review-filter-arrow-duel", "Arrow Duel");
    expectTestIdAbsent(canvasElement, "review-filter-mode-standard");
    expectTestIdAbsent(canvasElement, "review-filter-speed-20");
    await clickTestId(canvasElement, "review-filter-repeat-misses");
    await expectTestIdText(canvasElement, "review-today-to-review-toggle-count", "1");
    await expectTestIdText(canvasElement, "review-completed-today-toggle-count", "1");
    await waitForTestId(canvasElement, "review-due-item-lab-skewer-03-arrow-duel");
    expectTestIdAbsent(canvasElement, "review-due-item-lab-fork-01-standard");
    expectTestIdAbsent(canvasElement, "review-context-list");
    await expectTestIdText(canvasElement, "review-active-filter-0", "Missed 2+ times");
    await expectTestIdText(canvasElement, "review-active-filter-1", "2 matches");
    await clickTestId(canvasElement, "review-filter-toggle");
    await waitForHiddenTestId(canvasElement, "review-filter-options-motion");
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

export const ArrowDuelReply: Story = {
  name: "Arrow Duel reply",
  args: { scenarioId: "review-arrow-duel-reply" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await clickTestId(canvasElement, "review-filter-toggle");
    await clickTestId(canvasElement, "review-filter-arrow-duel");
    await clickTestId(canvasElement, "review-start-due");
    await waitForEnabledTestId(canvasElement, "lab-board-correct");
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForTestId(canvasElement, "review-arrow-duel-reply-timer");
  }
};

export const BlunderMovePreview: Story = {
  name: "Blunder move preview",
  args: { scenarioId: "review-blunder-move-preview" },
  play: async ({ canvasElement }) => {
    await openReviewQueue(canvasElement);
    await clickTestId(canvasElement, "review-start-due");
    await waitForTestId(canvasElement, "lab-blunder-preview-complete");
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
