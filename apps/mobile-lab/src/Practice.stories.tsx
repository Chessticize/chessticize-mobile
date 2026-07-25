import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import {
  centerTestId,
  clickTestId,
  dragTestId,
  expectReorderAnimation,
  expectRunCardInsets,
  expectTestIdAbsent,
  expectTestIdsInOrder,
  expectUniformRunDropTarget,
  openPracticeSession,
  replaceTextTestId,
  waitForEnabledTestId,
  waitForTestId,
  waitForText
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

export const FirstSprintGuide: Story = {
  name: "First Sprint guide",
  args: { scenarioId: "practice-first-sprint-guide" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-sprint-rules-guide");
  }
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
    await waitForTestId(canvasElement, "practice-run-pass-rules");
    await waitForTestId(canvasElement, "practice-run-slow-warning");
    await waitForTestId(canvasElement, "practice-run-puzzle-timeout");
    await clickTestId(canvasElement, "practice-run-per-puzzle-stepper-increase");
    await waitForText(canvasElement, "1:00");
    await waitForText(canvasElement, "1:30");
    await clickTestId(canvasElement, "practice-run-slow-warning-decrease");
    await waitForText(canvasElement, "0:55");
    await clickTestId(canvasElement, "practice-run-puzzle-timeout-toggle");
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
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-standard");
    await waitForTestId(canvasElement, "practice-run-name-input");
    await waitForTestId(canvasElement, "practice-run-elo-input");
    await waitForTestId(canvasElement, "practice-run-pass-rules");
    await waitForTestId(canvasElement, "practice-run-slow-warning");
    await waitForTestId(canvasElement, "practice-run-puzzle-timeout");
  }
};

export const CustomRatingEditor: Story = {
  name: "Custom Run editor and validation",
  args: { scenarioId: "practice-custom-rating-editor" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-tactics-focus");
    await waitForTestId(canvasElement, "practice-run-name-input");
    await waitForTestId(canvasElement, "practice-run-elo-input");
    await waitForTestId(canvasElement, "practice-run-pass-rules");
    await waitForTestId(canvasElement, "practice-run-slow-warning");
    await waitForTestId(canvasElement, "practice-run-puzzle-timeout");
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
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await waitForTestId(canvasElement, "session-puzzle-timing");
    await waitForText(canvasElement, "Puzzle 0:24");
  }
};

export const ActiveSessionGuide: Story = {
  name: "Active session · first-use guide",
  args: { scenarioId: "practice-active-session-guide" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-active-session-guide");
    await waitForTestId(canvasElement, "practice-session-guide-timing-demo");
    await waitForTestId(canvasElement, "practice-session-guide-demo-board");
    await waitForTestId(canvasElement, "active-session-shell");
    await waitForTestId(canvasElement, "practice-prompt");
    await waitForTestId(canvasElement, "session-score-strip");
    await waitForTestId(canvasElement, "practice-session-guide-coach-overview");
    await waitForText(
      canvasElement,
      "This is the same header you will use next"
    );
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ArrowDuelGuide: Story = {
  name: "Arrow Duel · step 5 after shared guide",
  args: { scenarioId: "practice-arrow-duel-guide" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-active-session-guide");
    await waitForText(canvasElement, "1 of 5");
    for (let index = 0; index < 4; index += 1) {
      await clickTestId(canvasElement, "practice-session-guide-start");
    }
    await waitForTestId(canvasElement, "practice-arrow-duel-guide");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-timing-demo");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-candidates");
    await waitForText(canvasElement, "5 of 5");
    await centerTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ArrowDuelGuideOnly: Story = {
  name: "Arrow Duel · single first-use step",
  args: { scenarioId: "practice-arrow-duel-guide-only" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-arrow-duel-guide");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-timing-demo");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-candidates");
    await waitForText(canvasElement, "1 of 1");
    await centerTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    expectTestIdAbsent(canvasElement, "practice-active-session-guide");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const SlowWarning: Story = {
  name: "Active session · Slow",
  args: { scenarioId: "practice-timing-warning" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await waitForTestId(canvasElement, "session-puzzle-timing");
    await waitForText(canvasElement, "Puzzle 0:41");
  }
};

export const PuzzleTimeout: Story = {
  name: "Active session · Timed out handoff",
  args: { scenarioId: "practice-timing-timeout" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await waitForTestId(canvasElement, "session-puzzle-timing");
    await waitForTestId(canvasElement, "session-puzzle-countdown");
    await waitForText(canvasElement, "8s");
  }
};

export const UnclearFollowUp: Story = {
  name: "Unclear follow-up",
  args: { scenarioId: "practice-unclear-follow-up" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-mode-arrow-duel");
    await clickTestId(canvasElement, "practice-start-button");
    await waitForTestId(canvasElement, "active-session-shell");
    await waitForEnabledTestId(canvasElement, "lab-board-correct");
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForTestId(canvasElement, "sprint-unclear-prompt");
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

export const SprintResultGoalClarity: Story = {
  name: "Sprint result · Goal clarity",
  args: { scenarioId: "practice-sprint-result-goal" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "sprint-result-goal-label");
    await waitForTestId(canvasElement, "sprint-result-solved");
    await waitForTestId(canvasElement, "sprint-unclear-toggle");
    await waitForTestId(canvasElement, "sprint-result-unclear-count-column");
    await waitForTestId(canvasElement, "sprint-result-mistakes-count-column");
  }
};

export const SprintResultExtraAttempt: Story = {
  name: "Sprint result · Extra attempt",
  args: { scenarioId: "practice-sprint-result-extra-attempt" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "sprint-result-goal-label");
    await waitForTestId(canvasElement, "sprint-result-solved");
    await waitForTestId(canvasElement, "sprint-result-unclear-count-column");
    await waitForTestId(canvasElement, "sprint-result-mistakes-count-column");
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
