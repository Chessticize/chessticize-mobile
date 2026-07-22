import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import { clickTestId, openPracticeSession, waitForTestId } from "./storyPlay.ts";

const meta = {
  title: "Practice",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {
  args: { scenarioId: "practice-home" }
};

export const CustomSetup: Story = {
  name: "Custom sprint setup",
  args: { scenarioId: "practice-custom-setup" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-mode-custom");
    await waitForTestId(canvasElement, "custom-sprint-setup");
  }
};

export const CustomRatingEditor: Story = {
  name: "Custom rating editor",
  args: { scenarioId: "practice-custom-rating-editor" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-mode-custom");
    await clickTestId(canvasElement, "custom-initial-rating-row");
    await waitForTestId(canvasElement, "custom-initial-rating-editor");
  }
};

export const Preparing: Story = {
  args: { scenarioId: "practice-preparing" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-mode-arrow-duel");
    await clickTestId(canvasElement, "practice-start-button");
    await waitForTestId(canvasElement, "sprint-loading-overlay");
  }
};

export const ActiveSession: Story = {
  name: "Active session",
  args: { scenarioId: "practice-active" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
  }
};

export const ArrowDuelPrompt: Story = {
  name: "Arrow Duel prompt layout",
  args: { scenarioId: "practice-arrow-duel-prompt" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-mode-arrow-duel");
    await clickTestId(canvasElement, "practice-start-button");
    await waitForTestId(canvasElement, "session-board");
  }
};

export const BlunderMovePreview: Story = {
  name: "Blunder move preview",
  args: { scenarioId: "practice-blunder-move-preview" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await waitForTestId(canvasElement, "lab-blunder-preview-complete");
  }
};

export const PausedSession: Story = {
  name: "Paused session",
  args: { scenarioId: "practice-paused" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await clickTestId(canvasElement, "session-pause");
    await waitForTestId(canvasElement, "paused-session-panel");
  }
};

export const ExitConfirmation: Story = {
  name: "Exit confirmation",
  args: { scenarioId: "practice-exit-confirmation" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await clickTestId(canvasElement, "session-abandon");
    await waitForTestId(canvasElement, "session-abandon-confirmation");
  }
};

export const SprintSummary: Story = {
  name: "Sprint summary",
  args: { scenarioId: "practice-summary" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForTestId(canvasElement, "sprint-summary-panel");
  }
};

export const ReviewReminderPrompt: Story = {
  name: "Review reminder prompt",
  args: { scenarioId: "practice-reminder-prompt" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await clickTestId(canvasElement, "lab-board-wrong");
    await waitForTestId(canvasElement, "review-reminder-permission-prompt");
  }
};
