import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import {
  centerTestId,
  clickTestId,
  dragTestId,
  expectReorderAnimation,
  expectRunCardInsets,
  expectTestIdHorizontalCentersAligned,
  expectTestIdText,
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
  args: { scenarioId: "practice-home" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await expectTestIdText(canvasElement, "practice-mode-standard-rating", "925");
    await expectTestIdText(canvasElement, "practice-mode-arrow-duel-rating", "875");
    await expectTestIdText(canvasElement, "practice-review-due-count", "28");
    await expectTestIdHorizontalCentersAligned(
      canvasElement,
      "practice-progress-weekly-metric",
      "practice-review-due-count"
    );
  }
};

export const TacticalProfileBuilding: Story = {
  name: "Tactical profile · building",
  args: { scenarioId: "practice-tactical-profile-building" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "training-focus-building-indicator");
    await waitForText(canvasElement, "Finding stable patterns");
  }
};

export const TacticalProfileCollectingEvidence: Story = {
  name: "Tactical profile · collecting evidence",
  args: { scenarioId: "practice-tactical-profile-collecting" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "training-focus-card");
    await waitForText(canvasElement, "More information needed");
  }
};

export const TacticalProfileBalanced: Story = {
  name: "Tactical profile · no meaningful weakness",
  args: { scenarioId: "practice-tactical-profile-balanced" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Recent play looks balanced");
  }
};

export const TacticalProfileSolveRate: Story = {
  name: "Tactical profile · solve reliability",
  args: { scenarioId: "practice-tactical-profile-solve-rate" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-signal-fork");
    await waitForText(canvasElement, "You complete these less reliably than comparable puzzles.");
  }
};

export const TacticalProfileCompletedSpeed: Story = {
  name: "Tactical profile · completed-puzzle speed",
  args: { scenarioId: "practice-tactical-profile-speed" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-signal-pin-speed");
    await waitForText(canvasElement, "You solve these correctly, but more slowly than comparable puzzles.");
  }
};

export const TacticalProfileRanked: Story = {
  name: "Tactical profile · ranked weaknesses",
  args: { scenarioId: "practice-tactical-profile-ranked" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "4 recommendations");
    await waitForText(canvasElement, "Forks is your clearest focus");
    await waitForText(canvasElement, "There are 3 more themes worth reviewing.");
  }
};

export const TacticalProfileTaskFamiliesHome: Story = {
  name: "Tactical profile · two-mode Home summary",
  args: { scenarioId: "practice-tactical-profile-task-families-home" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "2 modes with recommendations");
    await waitForText(canvasElement, "Arrow Duel also has 2 recommendations.");
    await waitForTestId(canvasElement, "training-focus-primary-mode");
  }
};

export const TacticalProfileTaskFamilies: Story = {
  name: "Tactical profile · Puzzle solving and Arrow Duel",
  args: { scenarioId: "practice-tactical-profile-task-families" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-task-family-selector");
    await waitForTestId(canvasElement, "tactical-profile-signal-arrow-pin");
    await waitForTestId(canvasElement, "tactical-profile-signal-arrow-deflection-speed");
    await waitForText(
      canvasElement,
      "Based on ordinary mixed Arrow Duel Runs. Review and focused Runs do not shape discovery."
    );
  }
};

export const TacticalProfileLimitedInventory: Story = {
  name: "Tactical profile · limited nearby puzzles",
  args: { scenarioId: "practice-tactical-profile-limited-inventory" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "focused-run-unavailable");
    await waitForText(canvasElement, "Not enough new puzzles nearby");
  }
};

export const TacticalProfileExplanation: Story = {
  name: "Tactical profile · recommendation explanation",
  args: { scenarioId: "practice-tactical-profile-explanation" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-explanation");
    await waitForText(canvasElement, "What does not decide this");
  }
};

export const TacticalProfileFocusedRun: Story = {
  name: "Tactical profile · focused Run preview",
  args: { scenarioId: "practice-tactical-profile-focused-run" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "focused-run-allocation-bar");
    await waitForText(canvasElement, "Mixed practice");
    await waitForTestId(canvasElement, "focused-run-start");
  }
};

export const TacticalProfileSuppressed: Story = {
  name: "Tactical profile · focus hidden",
  args: { scenarioId: "practice-tactical-profile-suppressed" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-suppressed");
    await waitForText(canvasElement, "Focus hidden for now");
  }
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
      "The top row shows puzzles solved, Sprint time left, and mistakes remaining. The Sprint begins when you finish this guide."
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

export const TimeoutReviewNotice: Story = {
  name: "Active session · after timeout",
  args: { scenarioId: "practice-timeout-review-notice" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await waitForTestId(canvasElement, "sprint-previous-attempt-notice");
    await waitForText(canvasElement, "Previous puzzle timed out");
    await waitForText(
      canvasElement,
      "It counted as a mistake and was added to Review."
    );
    await waitForText(canvasElement, "In Review");
    expectTestIdAbsent(canvasElement, "sprint-unclear-prompt");
  }
};

export const WrongReviewNotice: Story = {
  name: "Active session · after wrong answer",
  args: { scenarioId: "practice-wrong-review-notice" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "active-session-shell");
    await waitForTestId(canvasElement, "sprint-previous-attempt-notice");
    await waitForText(canvasElement, "Previous answer was incorrect");
    await waitForText(
      canvasElement,
      "It counted as a mistake and was added to Review."
    );
    await waitForText(canvasElement, "In Review");
    expectTestIdAbsent(canvasElement, "sprint-unclear-prompt");
  }
};

export const SlowUnclearNotice: Story = {
  name: "Active session · after Slow correct answer",
  args: { scenarioId: "practice-slow-unclear-notice" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "active-session-shell");
    await waitForTestId(canvasElement, "sprint-previous-attempt-notice");
    await waitForText(canvasElement, "Previous puzzle took too long");
    await waitForText(
      canvasElement,
      "It was automatically marked Unclear and added to Review."
    );
    await waitForText(canvasElement, "Marked Unclear");
    expectTestIdAbsent(canvasElement, "sprint-unclear-prompt");
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

export const TacticalFocusActive: Story = {
  name: "Tactical Focus · active run",
  args: { scenarioId: "practice-tactical-focus-active" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Focused Run");
    await waitForText(canvasElement, "Unrated");
    await waitForText(canvasElement, "Completed");
    await waitForText(canvasElement, "Left");
  }
};

export const TacticalFocusGuide: Story = {
  name: "Tactical Focus · first-use guide",
  args: { scenarioId: "practice-tactical-focus-guide" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Track the fixed Run");
    await waitForText(canvasElement, "Your Rating will not change.");
    await waitForText(canvasElement, "Unrated");
  }
};

export const TacticalFocusResult: Story = {
  name: "Tactical Focus · result",
  args: { scenarioId: "practice-tactical-focus-result" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Focused Run complete");
    await waitForText(canvasElement, "Planned puzzles complete");
    await waitForText(canvasElement, "Unrated");
    await waitForText(canvasElement, "Back to Practice");
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
