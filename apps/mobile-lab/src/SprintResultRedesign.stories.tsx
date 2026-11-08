import React from "react";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import {
  LabTextSize,
  LARGEST_ACCESSIBILITY_FONT_SCALE,
  SprintResultPrototype
} from "./sprintResultRedesign/SprintResultPrototype.tsx";
import { SPRINT_RESULT_FIXTURES } from "./sprintResultRedesign/sprintResultFixtures.ts";
import {
  expectTestIdAbsent,
  expectTestIdText,
  expectTestIdsNotOverlapping,
  waitForTestId,
  waitForText
} from "./storyPlay.ts";

// Issue #609 design-only prototype of the redesigned Sprint Result in direction A.
// It renders the real ui/ primitives and theme inside the Lab device frame; use
// the viewport toolbar for phone landscape and iPad, and the Theme toolbar for
// dark. The production result screen (practice--sprint-summary) is unchanged.
const meta = {
  title: "Sprint Result redesign",
  component: SprintResultPrototype
} satisfies Meta<typeof SprintResultPrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = { canvasElement: HTMLElement };

async function expectHeroAndStats(canvasElement: HTMLElement, score: string, outcome: string): Promise<void> {
  await waitForTestId(canvasElement, "sprint-result-redesign-hero");
  await expectTestIdText(canvasElement, "sprint-result-redesign-outcome", outcome);
  await expectTestIdText(canvasElement, "sprint-result-redesign-score", score);
  await waitForTestId(canvasElement, "sprint-result-redesign-stats");
  await expectTestIdsNotOverlapping(
    canvasElement,
    "sprint-result-redesign-top-bar",
    "sprint-result-redesign-hero"
  );
}

export const Passed: Story = {
  args: { data: SPRINT_RESULT_FIXTURES.passed },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "15 / 15", "Sprint passed");
    await waitForText(canvasElement, "1 to review");
    await waitForText(canvasElement, "695 → 709");
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-replay-mistakes");
    await expectTestIdText(canvasElement, "sprint-result-redesign-primary", "Play again");
  }
};

export const FailedMistakes: Story = {
  name: "Failed · mistakes",
  args: { data: SPRINT_RESULT_FIXTURES.failedMistakes },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "9 / 15", "Sprint failed · 3 mistakes");
    await waitForText(canvasElement, "−18");
    await waitForText(canvasElement, "3 to review");
    await waitForTestId(canvasElement, "sprint-result-redesign-replay-mistakes");
  }
};

export const FailedTimeRanOut: Story = {
  name: "Failed · time ran out",
  args: { data: SPRINT_RESULT_FIXTURES.failedTime },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "13 / 15", "Sprint failed · Time ran out");
    await waitForText(canvasElement, "Was the final puzzle unclear?");
    await waitForTestId(canvasElement, "sprint-result-redesign-mark-unclear");
    await waitForText(canvasElement, "1 to review");
  }
};

export const FailedTimeMarkedUnclear: Story = {
  name: "Failed · time ran out, marked unclear",
  args: { data: SPRINT_RESULT_FIXTURES.failedTime, initialMarkedUnclear: true },
  play: async ({ canvasElement }: Canvas) => {
    await expectTestIdText(canvasElement, "sprint-result-redesign-unclear-marked", "Marked");
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-mark-unclear");
    await waitForText(canvasElement, "2 to review");
  }
};

export const Abandoned: Story = {
  args: { data: SPRINT_RESULT_FIXTURES.abandoned },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "1 / 15", "Sprint abandoned");
    await waitForText(canvasElement, "1 attempted · 100% accuracy");
    await waitForText(canvasElement, "709 → 694");
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-review");
  }
};

export const ReviewAndMistakes: Story = {
  name: "Items to review and mistakes",
  args: { data: SPRINT_RESULT_FIXTURES.reviewAndMistakes },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "15 / 15", "Sprint passed");
    await waitForText(canvasElement, "3 to review");
    await waitForTestId(canvasElement, "sprint-result-redesign-review-info");
    await waitForTestId(canvasElement, "sprint-result-redesign-replay-mistakes");
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-review-explanation");
  }
};

export const ReviewExplanation: Story = {
  name: "Review explanation (info open)",
  args: { data: SPRINT_RESULT_FIXTURES.reviewAndMistakes, initialInfoOpen: true },
  play: async ({ canvasElement }: Canvas) => {
    await waitForTestId(canvasElement, "sprint-result-redesign-review-explanation");
    await waitForText(canvasElement, "3 puzzles to look at again: 2 Unclear and 2 In Review (1 is both).");
    await waitForText(canvasElement, "Replaying them does not change when they come back in Review.");
  }
};

export const ZeroReviewHidden: Story = {
  name: "Zero review · A hidden",
  args: { data: SPRINT_RESULT_FIXTURES.zeroReview, zeroReview: "hidden" },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "15 / 15", "Sprint passed");
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-review");
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-nothing-to-review");
  }
};

export const ZeroReviewLine: Story = {
  name: "Zero review · B Nothing to review",
  args: { data: SPRINT_RESULT_FIXTURES.zeroReview, zeroReview: "line" },
  play: async ({ canvasElement }: Canvas) => {
    await expectHeroAndStats(canvasElement, "15 / 15", "Sprint passed");
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-review");
    await expectTestIdText(canvasElement, "sprint-result-redesign-nothing-to-review", "Nothing to review");
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
    expectTestIdAbsent(canvasElement, "sprint-result-redesign-trend");
    await expectTestIdText(canvasElement, "sprint-result-redesign-primary", "Back to Practice");
  }
};

export const LargestText: Story = {
  name: "Largest accessibility text",
  args: { data: SPRINT_RESULT_FIXTURES.reviewAndMistakes },
  render: (args) => (
    <LabTextSize fontScale={LARGEST_ACCESSIBILITY_FONT_SCALE}>
      <SprintResultPrototype {...args} />
    </LabTextSize>
  ),
  play: async ({ canvasElement }: Canvas) => {
    await waitForTestId(canvasElement, "sprint-result-redesign-stat-rating");
    await waitForText(canvasElement, "3 to review");
    await waitForTestId(canvasElement, "sprint-result-redesign-primary");
  }
};
