import React from "react";
import { View } from "react-native";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { usePracticeViewport } from "../../mobile/src/components/PracticeViewport.tsx";
import { SprintResultScreen } from "../../mobile/src/components/SprintResultScreen.tsx";
import type { SprintResultData } from "../../mobile/src/components/sprintResultPresentation.ts";
import { LabTextSize, LARGEST_ACCESSIBILITY_FONT_SCALE } from "./LabTextSize.tsx";
import { SPRINT_RESULT_FIXTURES } from "./sprintResultRedesign/sprintResultFixtures.ts";
import {
  expectTestIdAbsent,
  expectTestIdText,
  expectTestIdsNotOverlapping,
  waitForTestId,
  waitForText
} from "./storyPlay.ts";

// Issue #609 Sprint Result in direction A. Each story renders the production
// SprintResultScreen with fixture data so every result state is reviewable on
// its own; the Practice product-clone stories (practice--sprint-summary and the
// practice--sprint-result-* stories) reach the same screen through a real
// session. Use the viewport toolbar for phone landscape and iPad, and the Theme
// toolbar for dark. Story URLs are stable from the #650 design preview.

function ResultFrame({
  data,
  initialInfoOpen
}: {
  data: SprintResultData;
  initialInfoOpen?: boolean;
}): React.JSX.Element {
  const viewport = usePracticeViewport();
  return (
    <View style={{ height: viewport.height }}>
      <SprintResultScreen
        data={data}
        {...(initialInfoOpen === undefined ? {} : { initialInfoOpen })}
        onBack={() => undefined}
        onMarkUnclear={() => undefined}
        onOpenHistory={() => undefined}
        onPlayAgain={() => undefined}
        onReplay={() => undefined}
        onReplayMistakes={() => undefined}
      />
    </View>
  );
}

const meta = {
  title: "Sprint Result redesign",
  component: ResultFrame
} satisfies Meta<typeof ResultFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = { canvasElement: HTMLElement };

async function expectHeroAndStats(canvasElement: HTMLElement, score: string, outcome: string): Promise<void> {
  await waitForTestId(canvasElement, "sprint-result-hero");
  await expectTestIdText(canvasElement, "sprint-result-outcome", outcome);
  await expectTestIdText(canvasElement, "sprint-result-solved", score);
  await waitForTestId(canvasElement, "sprint-result-stats");
  await expectTestIdsNotOverlapping(canvasElement, "sprint-result-top-bar", "sprint-result-hero");
}

export const Passed: Story = {
  args: { data: SPRINT_RESULT_FIXTURES.passed },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "15 / 15", "Sprint passed");
    await waitForText(canvasElement, "1 to review");
    await waitForText(canvasElement, "695 → 709");
    expectTestIdAbsent(canvasElement, "review-mistakes-button");
    await expectTestIdText(canvasElement, "play-again-button", "Play again");
  }
};

export const FailedMistakes: Story = {
  name: "Failed · mistakes",
  args: { data: SPRINT_RESULT_FIXTURES.failedMistakes },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "9 / 15", "Sprint failed·3 mistakes");
    await waitForText(canvasElement, "−18");
    await waitForText(canvasElement, "3 to review");
    await expectTestIdText(canvasElement, "review-mistakes-button", "Replay 3 mistakes");
  }
};

export const FailedTimeRanOut: Story = {
  name: "Failed · time ran out",
  args: { data: SPRINT_RESULT_FIXTURES.failedTime },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "13 / 15", "Sprint failed·Time ran out");
    await waitForText(canvasElement, "Was the final puzzle unclear?");
    await waitForTestId(canvasElement, "sprint-unclear-toggle");
    await waitForText(canvasElement, "1 to review");
    await expectTestIdText(canvasElement, "review-mistakes-button", "Replay 1 mistake");
  }
};

export const FailedTimeMarkedUnclear: Story = {
  name: "Failed · time ran out, marked unclear",
  args: { data: SPRINT_RESULT_FIXTURES.failedTimeMarked },
  play: async ({ canvasElement }: Canvas) => {
    await expectTestIdText(canvasElement, "sprint-unclear-marked", "Marked");
    expectTestIdAbsent(canvasElement, "sprint-unclear-toggle");
    await waitForText(canvasElement, "2 to review");
  }
};

export const Abandoned: Story = {
  args: { data: SPRINT_RESULT_FIXTURES.abandoned },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "1 / 15", "Sprint abandoned");
    await waitForText(canvasElement, "1 attempted · 100% accuracy");
    await waitForText(canvasElement, "709 → 694");
    expectTestIdAbsent(canvasElement, "sprint-result-review");
  }
};

export const ReviewAndMistakes: Story = {
  name: "Items to review and mistakes",
  args: { data: SPRINT_RESULT_FIXTURES.reviewAndMistakes },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "15 / 15", "Sprint passed");
    await waitForText(canvasElement, "3 to review");
    await waitForTestId(canvasElement, "sprint-result-review-info");
    await expectTestIdText(canvasElement, "review-mistakes-button", "Replay 2 mistakes");
    expectTestIdAbsent(canvasElement, "sprint-result-review-note");
  }
};

export const ReviewExplanation: Story = {
  name: "Review explanation (info open)",
  args: { data: SPRINT_RESULT_FIXTURES.reviewAndMistakes, initialInfoOpen: true },
  play: async ({ canvasElement }: Canvas) => {
    await waitForTestId(canvasElement, "sprint-result-review-note");
    await waitForText(canvasElement, "3 puzzles to look at again: 2 Unclear and 2 In Review (1 is both).");
    await waitForText(canvasElement, "Replaying them does not change when they come back in Review.");
  }
};

// Owner decision: with nothing to review, the review section is hidden entirely.
export const ZeroReview: Story = {
  name: "Zero review",
  args: { data: SPRINT_RESULT_FIXTURES.zeroReview },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "15 / 15", "Sprint passed");
    expectTestIdAbsent(canvasElement, "sprint-result-review");
    expectTestIdAbsent(canvasElement, "review-mistakes-button");
  }
};

export const ArrowDuel: Story = {
  name: "Arrow Duel",
  args: { data: SPRINT_RESULT_FIXTURES.arrowDuel },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "10 / 10", "Arrow Duel passed");
    await waitForText(canvasElement, "812 → 823");
    await waitForText(canvasElement, "2 to review");
  }
};

export const FocusedRun: Story = {
  name: "Focused Run",
  args: { data: SPRINT_RESULT_FIXTURES.focusedRun },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "12 / 15", "Focused Run complete");
    await waitForText(canvasElement, "Unrated");
    await waitForText(canvasElement, "709 unchanged");
    await waitForText(canvasElement, "Usually 24s");
    expectTestIdAbsent(canvasElement, "sprint-result-history-button");
    await expectTestIdText(canvasElement, "play-again-button", "Back to Practice");
  }
};

export const LargestText: Story = {
  name: "Largest accessibility text",
  args: { data: SPRINT_RESULT_FIXTURES.reviewAndMistakes },
  render: (args) => (
    <LabTextSize fontScale={LARGEST_ACCESSIBILITY_FONT_SCALE}>
      <ResultFrame {...args} />
    </LabTextSize>
  ),
  play: async ({ canvasElement }: Canvas) => {
    await waitForTestId(canvasElement, "sprint-result-rating-change");
    await waitForText(canvasElement, "3 to review");
    await waitForTestId(canvasElement, "play-again-button");
  }
};
