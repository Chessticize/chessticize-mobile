import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import {
  clickTestId,
  dragTestId,
  expectReorderAnimation,
  expectRunCardInsets,
  expectTestIdAbsent,
  expectTestIdsInOrder,
  expectUniformRunDropTarget,
  openPracticeSession,
  replaceTextTestId,
  waitForTestId
} from "./storyPlay.ts";

const meta = {
  title: "Practice",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {
  args: { scenarioId: "practice-home" }
};

export const EditAndReorderRuns: Story = {
  name: "Edit and reorder runs",
  args: { scenarioId: "practice-home-edit" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await expectRunCardInsets(canvasElement, "practice-run-standard");
    await dragTestId(
      canvasElement,
      "practice-run-endgame-sprint",
      "practice-run-arrow-duel",
      async () => expectTestIdsInOrder(canvasElement, [
        "practice-run-standard",
        "practice-run-endgame-sprint",
        "practice-run-arrow-duel",
        "practice-run-tactics-focus"
      ]).then(async () => {
        await expectReorderAnimation(canvasElement);
        await expectUniformRunDropTarget(canvasElement, "practice-run-arrow-duel");
      })
    );
    await expectTestIdsInOrder(canvasElement, [
      "practice-run-standard",
      "practice-run-endgame-sprint",
      "practice-run-arrow-duel",
      "practice-run-tactics-focus"
    ]);
    expectTestIdAbsent(canvasElement, "practice-run-notice");
  }
};

export const CustomSetup: Story = {
  name: "New Run",
  args: { scenarioId: "practice-custom-setup" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-add-run");
    await waitForTestId(canvasElement, "practice-run-editor");
    await clickTestId(canvasElement, "custom-theme-fork");
    await clickTestId(canvasElement, "custom-theme-pin");
  }
};

export const RunNameValidation: Story = {
  name: "Run name validation",
  args: { scenarioId: "practice-run-name-validation" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-add-run");
    await clickTestId(canvasElement, "practice-run-save");
    await waitForTestId(canvasElement, "practice-run-name-error");
  }
};

export const BuiltInRunEditor: Story = {
  name: "Built-in Run editor",
  args: { scenarioId: "practice-run-standard-editor" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-standard");
    await waitForTestId(canvasElement, "practice-run-name-input");
    await waitForTestId(canvasElement, "practice-run-elo-input");
    expectTestIdAbsent(canvasElement, "practice-run-elo-increase");
  }
};

export const CustomRatingEditor: Story = {
  name: "Custom Run editor and validation",
  args: { scenarioId: "practice-custom-rating-editor" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-tactics-focus");
    await waitForTestId(canvasElement, "practice-run-name-input");
    await waitForTestId(canvasElement, "practice-run-elo-input");
    expectTestIdAbsent(canvasElement, "practice-run-mode-row");
    expectTestIdAbsent(canvasElement, "practice-run-theme-row");
    expectTestIdAbsent(canvasElement, "practice-run-duration-stepper");
    expectTestIdAbsent(canvasElement, "practice-run-per-puzzle-stepper");
    await replaceTextTestId(canvasElement, "practice-run-elo-input", "2201");
    await waitForTestId(canvasElement, "practice-run-elo-error");
  }
};

export const RemoveRunConfirmation: Story = {
  name: "Remove run confirmation",
  args: { scenarioId: "practice-run-remove-confirmation" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-remove-standard");
    await waitForTestId(canvasElement, "practice-run-remove-confirmation");
    await expectTestIdsInOrder(canvasElement, [
      "practice-run-standard",
      "practice-run-remove-confirmation",
      "practice-run-arrow-duel"
    ]);
  }
};

export const EmptyHomeAndRestore: Story = {
  name: "Empty Home and restore",
  args: { scenarioId: "practice-runs-empty" }
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
  name: "Arrow Duel prompt card",
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
