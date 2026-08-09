import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario, type LabStoryPresentation } from "./LabScenario.tsx";
import {
  centerTestId,
  clickTestId,
  dragTestId,
  expectPointerDrivenRunDrag,
  expectReorderAnimation,
  expectRunCardPickedUp,
  expectRunCardInsets,
  expectRunTouchSelectionSuppressed,
  expectTestIdHorizontalCentersAligned,
  expectTestIdText,
  expectTestIdAbsent,
  expectTestIdsInOrder,
  expectRunInsertionTarget,
  expectRunPreviewShift,
  openPracticeSession,
  replaceTextTestId,
  waitForEnabledTestId,
  waitForTestId,
  waitForText,
  waitForVisibleTestId
} from "./storyPlay.ts";

const meta = {
  title: "Practice",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

const ARROW_DUEL_GUIDE_SCENARIO_ID = "practice-arrow-duel-guide" as const;
const ARROW_DUEL_GUIDE_PRESENTATIONS = {
  header: {
    storyId: "practice--arrow-duel-guide-header",
    title: "Arrow Duel · step 1 · Sprint header"
  },
  slow: {
    storyId: "practice--arrow-duel-guide-slow",
    title: "Arrow Duel · step 2 · Slow"
  },
  timedOut: {
    storyId: "practice--arrow-duel-guide-timed-out",
    title: "Arrow Duel · step 3 · Timed out"
  },
  unclear: {
    storyId: "practice--arrow-duel-guide-unclear",
    title: "Arrow Duel · step 4 · Unclear"
  },
  arrowDuelChoice: {
    storyId: "practice--arrow-duel-guide-choice",
    title: "Arrow Duel · step 5 · choose the stronger move"
  },
  arrowDuelReply: {
    storyId: "practice--arrow-duel-guide",
    title: "Arrow Duel · step 6 · find the reply"
  },
  arrowDuelGotIt: {
    storyId: "practice--arrow-duel-what-if-preparation",
    title: "Arrow Duel · first reply cue · Got it"
  }
} as const satisfies Record<string, LabStoryPresentation>;

function arrowDuelGuideArgs(
  storyPresentation: LabStoryPresentation
): {
  scenarioId: typeof ARROW_DUEL_GUIDE_SCENARIO_ID;
  storyPresentation: LabStoryPresentation;
} {
  return {
    scenarioId: ARROW_DUEL_GUIDE_SCENARIO_ID,
    storyPresentation
  };
}

async function advanceArrowDuelGuide(
  canvasElement: HTMLElement,
  step: 1 | 2 | 3 | 4 | 5 | 6
): Promise<void> {
  await waitForTestId(canvasElement, "practice-active-session-guide");
  for (let index = 1; index < step; index += 1) {
    await clickTestId(canvasElement, "practice-session-guide-start");
  }
}

async function openArrowDuelChoice(canvasElement: HTMLElement): Promise<void> {
  await clickTestId(canvasElement, "practice-mode-arrow-duel");
  await clickTestId(canvasElement, "practice-start-button");
  await waitForTestId(canvasElement, "arrow-duel-reply-challenge");
  await waitForEnabledTestId(canvasElement, "lab-board-correct");
}

async function openArrowDuelReplyCue(canvasElement: HTMLElement): Promise<void> {
  await openArrowDuelChoice(canvasElement);
  await clickTestId(canvasElement, "lab-board-correct");
  await waitForTestId(canvasElement, "arrow-duel-what-if-overlay");
  await expectTestIdText(
    canvasElement,
    "arrow-duel-what-if-detail",
    "You’ll have 10 seconds to play the best reply."
  );
  await expectTestIdText(
    canvasElement,
    "arrow-duel-what-if-settings-hint",
    "Optional · Turn off in Settings"
  );
  await waitForTestId(canvasElement, "arrow-duel-what-if-side-glyph");
}

function expectFullScreenStoryId(canvasElement: HTMLElement, storyId: string): void {
  const link = Array.from(canvasElement.ownerDocument.querySelectorAll("a")).find(
    (candidate) => candidate.textContent === "Full-screen URL"
  );
  const expectedHref = `./iframe.html?id=${storyId}&viewMode=story`;
  if (link?.getAttribute("href") !== expectedHref) {
    throw new Error(`Expected Full-screen URL to link to ${expectedHref}`);
  }
}

export const Home: Story = {
  args: { scenarioId: "practice-home" },
  play: async ({ canvasElement }) => {
    await expectTestIdText(canvasElement, "practice-mode-standard-rating", "925");
    await expectTestIdText(canvasElement, "practice-mode-arrow-duel-rating", "875");
    await expectTestIdText(canvasElement, "practice-review-due-count", "28");
    await waitForTestId(canvasElement, "training-focus-card");
    await waitForText(canvasElement, "More information needed");
    await expectTestIdHorizontalCentersAligned(
      canvasElement,
      "practice-progress-weekly-metric",
      "practice-review-due-count"
    );
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
      "practice-run-arrow-duel",
      "practice-run-endgame-sprint",
      {
        pointerType: "touch",
        targetVerticalFraction: 0.1,
        onPickup: async () => {
          await expectRunCardPickedUp(canvasElement, "practice-run-arrow-duel");
          await expectPointerDrivenRunDrag(canvasElement, "practice-run-arrow-duel");
          await expectRunTouchSelectionSuppressed(
            canvasElement,
            "practice-run-arrow-duel"
          );
          await expectTestIdText(
            canvasElement,
            "lab-run-reorder-feedback",
            "LAB previewMedium haptic requested on pickup"
          );
        },
        onPreview: async () => {
          await expectRunCardPickedUp(canvasElement, "practice-run-arrow-duel");
          await expectPointerDrivenRunDrag(canvasElement, "practice-run-arrow-duel");
          await expectTestIdText(
            canvasElement,
            "lab-run-reorder-feedback",
            "LAB previewMedium haptic requested on pickup"
          );
          await expectTestIdsInOrder(canvasElement, [
            "practice-run-standard",
            "practice-run-arrow-duel",
            "practice-run-tactics-focus",
            "practice-run-endgame-sprint"
          ]);
          await expectRunInsertionTarget(canvasElement, "practice-run-endgame-sprint", "after");
          await expectRunPreviewShift(canvasElement, "practice-run-tactics-focus", "up");
          await expectRunPreviewShift(canvasElement, "practice-run-endgame-sprint", "up");
        }
      }
    );
    await expectReorderAnimation(canvasElement);
    await expectTestIdsInOrder(canvasElement, [
      "practice-run-standard",
      "practice-run-tactics-focus",
      "practice-run-endgame-sprint",
      "practice-run-arrow-duel"
    ]);
    expectTestIdAbsent(canvasElement, "practice-run-notice");
  }
};

export const EditAndReorderRunsPickedUp: Story = {
  name: "Edit and reorder runs · picked up",
  args: {
    scenarioId: "practice-home-edit",
    runReorderPickedUpRunId: "endgame-sprint",
    storyPresentation: {
      storyId: "practice--edit-and-reorder-runs-picked-up",
      title: "Edit and reorder runs · picked up"
    }
  },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await expectRunCardPickedUp(canvasElement, "practice-run-endgame-sprint");
    await expectPointerDrivenRunDrag(canvasElement, "practice-run-endgame-sprint");
    await expectTestIdText(
      canvasElement,
      "lab-run-reorder-feedback",
      "LAB previewMedium haptic requested on pickup"
    );
  }
};

export const CustomSetup: Story = {
  name: "New Run",
  args: { scenarioId: "practice-custom-setup" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-add-run");
    await waitForTestId(canvasElement, "practice-run-editor");
    await expectTestIdText(
      canvasElement,
      "practice-run-theme-selection-detail",
      "All themes"
    );
    expectTestIdAbsent(canvasElement, "custom-theme-fork");
    await clickTestId(canvasElement, "practice-run-theme-disclosure");
    await clickTestId(canvasElement, "custom-theme-fork");
    await clickTestId(canvasElement, "custom-theme-pin");
    await expectTestIdText(
      canvasElement,
      "practice-run-theme-selection-detail",
      "Fork · Pin"
    );
    await clickTestId(canvasElement, "custom-theme-mixed");
    await clickTestId(canvasElement, "custom-mode-arrow-duel");
    expectTestIdAbsent(canvasElement, "practice-run-arrow-duel-reply-setting");
    await expectTestIdText(
      canvasElement,
      "practice-run-theme-selection-detail",
      "All themes"
    );
    await clickTestId(canvasElement, "practice-run-theme-disclosure");
    expectTestIdAbsent(canvasElement, "custom-theme-fork");
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

export const CreateArrowDuelReplySetting: Story = {
  name: "New Run · Arrow Duel reply",
  args: {
    scenarioId: "practice-custom-setup",
    storyPresentation: {
      storyId: "practice--create-arrow-duel-reply-setting",
      title: "New Run · Arrow Duel reply"
    }
  },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-add-run");
    await clickTestId(canvasElement, "custom-mode-arrow-duel");
    await waitForTestId(canvasElement, "practice-run-arrow-duel-reply-setting");
    await expectTestIdText(canvasElement, "practice-run-arrow-duel-reply-value", "On");
    await waitForText(
      canvasElement,
      "You’ll have 10 seconds by default. Choose up to 30 seconds."
    );
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
    await waitForTestId(canvasElement, "practice-run-pass-rules");
    await waitForTestId(canvasElement, "practice-run-slow-warning");
    await waitForTestId(canvasElement, "practice-run-puzzle-timeout");
  }
};

export const ArrowDuelReplySetting: Story = {
  name: "Arrow Duel Run editor · reply on",
  args: { scenarioId: "practice-run-arrow-duel-editor" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-arrow-duel");
    await waitForTestId(canvasElement, "practice-run-arrow-duel-reply-setting");
    await expectTestIdText(canvasElement, "practice-run-arrow-duel-reply-value", "On");
    await waitForText(
      canvasElement,
      "After you choose the better arrow, we play the other move so you can find the opponent’s best reply."
    );
    await waitForText(
      canvasElement,
      "This setting only changes this Run. Turn it off to go straight to the next puzzle."
    );
    await waitForText(
      canvasElement,
      "Your Sprint and puzzle timers pause while you find the reply."
    );
    await waitForText(
      canvasElement,
      "To turn this extra challenge off for every Run, go to Settings."
    );
    await waitForTestId(canvasElement, "practice-run-arrow-duel-reply-seconds");
    await centerTestId(canvasElement, "practice-run-arrow-duel-reply-setting");
  }
};

export const ArrowDuelReplyCustomTime: Story = {
  name: "Arrow Duel Run editor · custom reply time",
  args: {
    scenarioId: "practice-run-arrow-duel-editor",
    storyPresentation: {
      storyId: "practice--arrow-duel-reply-custom-time",
      title: "Arrow Duel Run editor · custom reply time"
    }
  },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-arrow-duel");
    await replaceTextTestId(
      canvasElement,
      "practice-run-arrow-duel-reply-seconds",
      "30"
    );
    await centerTestId(canvasElement, "practice-run-arrow-duel-reply-setting");
  }
};

export const ArrowDuelRunEditorReplyOff: Story = {
  name: "Arrow Duel Run editor · reply off",
  args: {
    scenarioId: "practice-run-arrow-duel-editor",
    storyPresentation: {
      storyId: "practice--arrow-duel-run-editor-reply-off",
      title: "Arrow Duel Run editor · reply off"
    }
  },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-arrow-duel");
    await clickTestId(canvasElement, "practice-run-arrow-duel-reply-toggle");
    await expectTestIdText(canvasElement, "practice-run-arrow-duel-reply-value", "Off");
    await centerTestId(canvasElement, "practice-run-arrow-duel-reply-setting");
  }
};

export const ArrowDuelRunEditorGlobalOff: Story = {
  name: "Arrow Duel Run editor · global off",
  args: {
    arrowDuelOpponentReplyGlobalEnabled: false,
    scenarioId: "practice-run-arrow-duel-editor",
    storyPresentation: {
      storyId: "practice--arrow-duel-run-editor-global-off",
      title: "Arrow Duel Run editor · global off"
    }
  },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-run-home-edit");
    await clickTestId(canvasElement, "practice-run-edit-arrow-duel");
    expectTestIdAbsent(canvasElement, "practice-run-arrow-duel-reply-setting");
    await waitForTestId(canvasElement, "practice-run-puzzle-timing");
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
    await waitForTestId(canvasElement, "session-abandon");
    await waitForTestId(canvasElement, "practice-session-guide-coach-overview");
    await waitForText(
      canvasElement,
      "The top row shows puzzles solved, Sprint time left, and mistakes remaining. At zero, the active puzzle is saved as Incomplete, not as a mistake. The Sprint begins when you finish this guide."
    );
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ActiveSessionGuideTimedOut: Story = {
  name: "Active session · first-use guide · Timed out",
  args: { scenarioId: "practice-active-session-guide" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-active-session-guide");
    await clickTestId(canvasElement, "practice-session-guide-start");
    await clickTestId(canvasElement, "practice-session-guide-start");
    await waitForTestId(canvasElement, "session-abandon");
    await waitForTestId(canvasElement, "practice-session-guide-coach-timeout");
    await waitForTestId(
      canvasElement,
      "practice-session-guide-coach-pointer-timeout-bottom"
    );
    await waitForTestId(
      canvasElement,
      "practice-session-guide-coach-pointer-timeout-bottom-line"
    );
    await waitForTestId(
      canvasElement,
      "practice-session-guide-coach-pointer-timeout-bottom-head"
    );
    await waitForText(canvasElement, "This puzzle counts as a mistake");
  }
};

export const ActiveSessionGuideExit: Story = {
  name: "Active session · first-use guide · Exit",
  args: { scenarioId: "practice-active-session-guide" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-active-session-guide");
    await clickTestId(canvasElement, "practice-session-guide-start");
    await clickTestId(canvasElement, "session-abandon");
    await waitForTestId(canvasElement, "practice-home");
    expectTestIdAbsent(canvasElement, "practice-active-session-guide");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ArrowDuelGuideHeader: Story = {
  name: ARROW_DUEL_GUIDE_PRESENTATIONS.header.title,
  args: arrowDuelGuideArgs(ARROW_DUEL_GUIDE_PRESENTATIONS.header),
  play: async ({ canvasElement }) => {
    await advanceArrowDuelGuide(canvasElement, 1);
    await waitForTestId(canvasElement, "practice-session-guide-coach-overview");
    await waitForText(canvasElement, "1 of 5");
    expectFullScreenStoryId(canvasElement, ARROW_DUEL_GUIDE_PRESENTATIONS.header.storyId);
  }
};

export const ArrowDuelGuideSlow: Story = {
  name: ARROW_DUEL_GUIDE_PRESENTATIONS.slow.title,
  args: arrowDuelGuideArgs(ARROW_DUEL_GUIDE_PRESENTATIONS.slow),
  play: async ({ canvasElement }) => {
    await advanceArrowDuelGuide(canvasElement, 2);
    await waitForTestId(canvasElement, "practice-session-guide-coach-slow");
    await waitForText(canvasElement, "2 of 5");
    await waitForText(canvasElement, "Amber means you’re taking too long");
    expectFullScreenStoryId(canvasElement, ARROW_DUEL_GUIDE_PRESENTATIONS.slow.storyId);
  }
};

export const ArrowDuelGuideTimedOut: Story = {
  name: ARROW_DUEL_GUIDE_PRESENTATIONS.timedOut.title,
  args: arrowDuelGuideArgs(ARROW_DUEL_GUIDE_PRESENTATIONS.timedOut),
  play: async ({ canvasElement }) => {
    await advanceArrowDuelGuide(canvasElement, 3);
    await waitForTestId(canvasElement, "practice-session-guide-coach-timeout");
    await waitForText(canvasElement, "3 of 5");
    await waitForText(canvasElement, "This puzzle counts as a mistake");
    expectFullScreenStoryId(canvasElement, ARROW_DUEL_GUIDE_PRESENTATIONS.timedOut.storyId);
  }
};

export const ArrowDuelGuideUnclear: Story = {
  name: ARROW_DUEL_GUIDE_PRESENTATIONS.unclear.title,
  args: arrowDuelGuideArgs(ARROW_DUEL_GUIDE_PRESENTATIONS.unclear),
  play: async ({ canvasElement }) => {
    await advanceArrowDuelGuide(canvasElement, 4);
    await waitForTestId(canvasElement, "practice-session-guide-coach-unclear");
    await waitForText(canvasElement, "4 of 5");
    await waitForText(canvasElement, "Use Mark as unclear when needed");
    expectFullScreenStoryId(canvasElement, ARROW_DUEL_GUIDE_PRESENTATIONS.unclear.storyId);
  }
};

export const ArrowDuelGuideChoice: Story = {
  name: ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelChoice.title,
  args: arrowDuelGuideArgs(ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelChoice),
  play: async ({ canvasElement }) => {
    await advanceArrowDuelGuide(canvasElement, 5);
    await waitForTestId(canvasElement, "practice-arrow-duel-guide");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-timing-demo");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-candidates");
    await waitForTestId(
      canvasElement,
      "practice-arrow-duel-guide-candidates-order-g6g7-g6e8"
    );
    await waitForTestId(canvasElement, "session-abandon");
    await waitForText(canvasElement, "5 of 6");
    await waitForText(canvasElement, "Choose the stronger move");
    expectFullScreenStoryId(canvasElement, ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelChoice.storyId);
    await centerTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ArrowDuelGuide: Story = {
  name: ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelReply.title,
  args: arrowDuelGuideArgs(ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelReply),
  play: async ({ canvasElement }) => {
    await advanceArrowDuelGuide(canvasElement, 6);
    await waitForTestId(canvasElement, "practice-arrow-duel-guide");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-timing-demo");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-reply-last-move");
    await waitForTestId(canvasElement, "session-abandon");
    await waitForText(canvasElement, "6 of 6");
    await waitForText(canvasElement, "Then reply for Black");
    await waitForText(canvasElement, "Find Black’s reply");
    await waitForTestId(canvasElement, "practice-session-guide-optional-settings-notice");
    await waitForText(
      canvasElement,
      "This extra challenge is optional — turn it off in Settings."
    );
    await waitForText(canvasElement, "Optional · Turn off in Settings");
    expectTestIdAbsent(canvasElement, "practice-arrow-duel-guide-candidates");
    expectFullScreenStoryId(canvasElement, ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelReply.storyId);
    await centerTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ArrowDuelGuideOnly: Story = {
  name: "Arrow Duel · two first-use steps",
  args: { scenarioId: "practice-arrow-duel-guide-only" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-arrow-duel-guide");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-timing-demo");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    await waitForTestId(canvasElement, "practice-arrow-duel-guide-candidates");
    await waitForTestId(canvasElement, "session-abandon");
    await waitForText(canvasElement, "1 of 2");
    await waitForText(canvasElement, "Choose the stronger move");
    await clickTestId(canvasElement, "practice-session-guide-start");
    await waitForText(canvasElement, "2 of 2");
    await waitForText(canvasElement, "Then reply for Black");
    await waitForText(canvasElement, "Find Black’s reply");
    await waitForTestId(canvasElement, "practice-session-guide-optional-settings-notice");
    await waitForText(
      canvasElement,
      "This extra challenge is optional — turn it off in Settings."
    );
    await waitForText(canvasElement, "Optional · Turn off in Settings");
    expectTestIdAbsent(canvasElement, "practice-arrow-duel-guide-candidates");
    await centerTestId(canvasElement, "practice-arrow-duel-guide-demo-board");
    expectTestIdAbsent(canvasElement, "practice-active-session-guide");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ArrowDuelWhatIfPreparation: Story = {
  name: ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelGotIt.title,
  args: {
    arrowDuelReplyPreparationConfirmationRequired: true,
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelGotIt
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelReplyCue(canvasElement);
    await waitForTestId(canvasElement, "arrow-duel-what-if-action");
    await waitForText(canvasElement, "Got it");
    expectFullScreenStoryId(
      canvasElement,
      ARROW_DUEL_GUIDE_PRESENTATIONS.arrowDuelGotIt.storyId
    );
  }
};

export const ArrowDuelGuideExit: Story = {
  name: "Arrow Duel · step 6 · Exit",
  args: { scenarioId: "practice-arrow-duel-guide" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-active-session-guide");
    for (let index = 0; index < 5; index += 1) {
      await clickTestId(canvasElement, "practice-session-guide-start");
    }
    await waitForTestId(canvasElement, "practice-arrow-duel-guide");
    await clickTestId(canvasElement, "session-abandon");
    await waitForTestId(canvasElement, "practice-home");
    expectTestIdAbsent(canvasElement, "practice-arrow-duel-guide");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const ArrowDuelGuideOnlyExit: Story = {
  name: "Arrow Duel · two first-use steps · Exit",
  args: { scenarioId: "practice-arrow-duel-guide-only" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "practice-arrow-duel-guide");
    await clickTestId(canvasElement, "session-abandon");
    await waitForTestId(canvasElement, "practice-home");
    expectTestIdAbsent(canvasElement, "practice-arrow-duel-guide");
    expectTestIdAbsent(canvasElement, "session-board");
  }
};

export const SlowWarning: Story = {
  name: "Active session · Slow",
  args: { scenarioId: "practice-timing-warning" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await waitForTestId(canvasElement, "session-puzzle-timing");
    await waitForText(canvasElement, "Puzzle 0:41");
  }
};

export const PuzzleTimeout: Story = {
  name: "Active session · Timed out handoff",
  args: { scenarioId: "practice-timing-timeout" },
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
    await clickTestId(canvasElement, "sprint-unclear-toggle");
    await waitForTestId(canvasElement, "sprint-unclear-marked");
  }
};

export const ArrowDuelPrompt: Story = {
  name: "Arrow Duel · opponent reply",
  args: { scenarioId: "practice-arrow-duel-prompt" },
  play: async ({ canvasElement }) => {
    await openArrowDuelChoice(canvasElement);
    await waitForText(canvasElement, "Black orientation");
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForText(canvasElement, "Find White’s reply");
    await waitForText(canvasElement, "Optional · Turn off in Settings");
    await waitForText(canvasElement, "Black orientation");
    await expectTestIdText(canvasElement, "arrow-duel-reply-timer", "0:10");
    await expectTestIdAbsent(canvasElement, "arrow-duel-reply-sprint-paused");
  }
};

export const ArrowDuelReplyCustomTimer: Story = {
  name: "Arrow Duel · custom reply timer",
  args: {
    arrowDuelReplySeconds: 30,
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-reply-custom-timer",
      title: "Arrow Duel · custom reply timer"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelChoice(canvasElement);
    await clickTestId(canvasElement, "lab-board-correct");
    await expectTestIdText(canvasElement, "arrow-duel-reply-timer", "0:30");
  }
};

export const ArrowDuelWhatIfNextTwoSprints: Story = {
  name: "Arrow Duel · cue · 1.5 sec",
  args: {
    arrowDuelReplyPreparationHoldMs: 60_000,
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-what-if-next-two-sprints",
      title: "Arrow Duel · cue · 1.5 sec"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelReplyCue(canvasElement);
    await expectTestIdAbsent(canvasElement, "arrow-duel-what-if-action");
  }
};

export const ArrowDuelWhatIfLaterSprints: Story = {
  name: "Arrow Duel · cue · 1 sec",
  args: {
    arrowDuelReplyPreparationHoldMs: 60_000,
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-what-if-later-sprints",
      title: "Arrow Duel · cue · 1 sec"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelReplyCue(canvasElement);
    await expectTestIdAbsent(canvasElement, "arrow-duel-what-if-action");
  }
};

export const ArrowDuelChoice: Story = {
  name: "Arrow Duel · choose the best move",
  args: {
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-choice",
      title: "Arrow Duel · choose the best move"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelChoice(canvasElement);
    await waitForText(canvasElement, "Be ready for a quick reply check.");
    await waitForTestId(canvasElement, "arrow-duel-candidate-overlay");
  }
};

export const ArrowDuelReplyCorrect: Story = {
  name: "Arrow Duel · reply correct",
  args: {
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-reply-correct",
      title: "Arrow Duel · reply correct"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelChoice(canvasElement);
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForText(canvasElement, "Find White’s reply");
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForTestId(canvasElement, "move-feedback-overlay");
    await waitForText(canvasElement, "Choose the best move");
  }
};

export const ArrowDuelWrongChoice: Story = {
  name: "Arrow Duel · wrong choice",
  args: {
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-wrong-choice",
      title: "Arrow Duel · wrong choice"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelChoice(canvasElement);
    await clickTestId(canvasElement, "lab-board-wrong");
    await waitForTestId(canvasElement, "move-feedback-overlay");
    await waitForText(canvasElement, "Choose the best move");
  }
};

export const ArrowDuelWrongReply: Story = {
  name: "Arrow Duel · wrong reply",
  args: {
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-wrong-reply",
      title: "Arrow Duel · wrong reply"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelChoice(canvasElement);
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForText(canvasElement, "Find White’s reply");
    await clickTestId(canvasElement, "lab-board-wrong");
    await waitForTestId(canvasElement, "move-feedback-overlay");
    await waitForText(canvasElement, "Choose the best move");
  }
};

export const ArrowDuelReplyTimeout: Story = {
  name: "Arrow Duel · reply timeout",
  args: {
    arrowDuelReplyAutoTimeoutMs: 750,
    scenarioId: "practice-arrow-duel-prompt",
    storyPresentation: {
      storyId: "practice--arrow-duel-reply-timeout",
      title: "Arrow Duel · reply timeout"
    }
  },
  play: async ({ canvasElement }) => {
    await openArrowDuelChoice(canvasElement);
    await clickTestId(canvasElement, "lab-board-correct");
    await waitForTestId(canvasElement, "session-puzzle-timeout-overlay");
    await waitForText(canvasElement, "Timed out");
    await waitForText(canvasElement, "Choose the best move");
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
    await waitForTestId(canvasElement, "sprint-result-review-note");
    await expectTestIdText(canvasElement, "review-mistakes-button", "Replay 4 attempts");
    await waitForVisibleTestId(canvasElement, "review-mistakes-button");
  }
};

export const SprintResultIncomplete: Story = {
  name: "Sprint result · Incomplete final puzzle",
  args: { scenarioId: "practice-sprint-result-incomplete" },
  play: async ({ canvasElement }) => {
    await expectTestIdText(
      canvasElement,
      "sprint-unclear-question",
      "Was the final puzzle unclear?"
    );
    await expectTestIdText(canvasElement, "sprint-unclear-toggle", "Mark as unclear");
    await clickTestId(canvasElement, "sprint-unclear-toggle");
    await expectTestIdText(canvasElement, "sprint-unclear-marked", "Marked");
  }
};

export const SprintResultFlaggedReplay: Story = {
  name: "Sprint result · Flagged replay",
  args: { scenarioId: "practice-sprint-result-replay" },
  play: async ({ canvasElement }) => {
    await waitForVisibleTestId(canvasElement, "review-mistakes-button");
    await clickTestId(canvasElement, "review-mistakes-button");
    await waitForTestId(canvasElement, "review-session");
    await expectTestIdText(canvasElement, "review-title", "Replay");
    expectTestIdAbsent(canvasElement, "review-source-pill");
    expectTestIdAbsent(canvasElement, "review-context-unclear");
    expectTestIdAbsent(canvasElement, "review-context-needs-review");
    await expectTestIdText(canvasElement, "review-progress", "1 / 4 · Standard");
    await expectTestIdText(canvasElement, "history-attempt-clear-unclear", "Mark clear");
    expectTestIdAbsent(canvasElement, "review-schedule-add");
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

export const AppStoreReviewRequestEligiblePuzzleMilestone: Story = {
  name: "App Store review request · eligible puzzle milestone",
  args: { scenarioId: "practice-app-store-review-request" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "sprint-summary-panel");
    await expectTestIdText(canvasElement, "sprint-result-solved", "Solved 15");
    await expectTestIdText(canvasElement, "play-again-button", "Play again");
    await waitForTestId(canvasElement, "lab-native-boundary");
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
