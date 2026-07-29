import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "../LabScenario.tsx";
import { waitForTestId, waitForText } from "../storyPlay.ts";

const meta = {
  title: "Practice/Tactical Profile & Focused Runs",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

// Preserve the published Practice story URLs after moving this collection into a nested sidebar group.
export const TacticalProfileBuilding: Story = {
  name: "Building",
  args: { scenarioId: "practice-tactical-profile-building" },
  parameters: { __id: "practice--tactical-profile-building" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "training-focus-building-indicator");
    await waitForText(canvasElement, "Finding stable patterns");
  }
};

export const TacticalProfileCollectingEvidence: Story = {
  name: "Collecting evidence",
  args: { scenarioId: "practice-tactical-profile-collecting" },
  parameters: { __id: "practice--tactical-profile-collecting-evidence" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "training-focus-card");
    await waitForText(canvasElement, "More information needed");
  }
};

export const TacticalProfileBalanced: Story = {
  name: "Balanced",
  args: { scenarioId: "practice-tactical-profile-balanced" },
  parameters: { __id: "practice--tactical-profile-balanced" },
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Recent play looks balanced");
  }
};

export const TacticalProfileSolveRate: Story = {
  name: "Solve reliability",
  args: { scenarioId: "practice-tactical-profile-solve-rate" },
  parameters: { __id: "practice--tactical-profile-solve-rate" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-signal-fork");
    await waitForText(canvasElement, "You complete these less reliably than comparable puzzles.");
  }
};

export const TacticalProfileCompletedSpeed: Story = {
  name: "Completed-puzzle speed",
  args: { scenarioId: "practice-tactical-profile-speed" },
  parameters: { __id: "practice--tactical-profile-completed-speed" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-signal-pin-speed");
    await waitForText(canvasElement, "You solve these correctly, but more slowly than comparable puzzles.");
  }
};

export const TacticalProfileRanked: Story = {
  name: "Ranked weaknesses",
  args: { scenarioId: "practice-tactical-profile-ranked" },
  parameters: { __id: "practice--tactical-profile-ranked" },
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "4 recommendations");
    await waitForText(canvasElement, "Forks is your clearest focus");
    await waitForText(canvasElement, "There are 3 more themes worth reviewing.");
  }
};

export const TacticalProfileTaskFamiliesHome: Story = {
  name: "Two-mode Home summary",
  args: { scenarioId: "practice-tactical-profile-task-families-home" },
  parameters: { __id: "practice--tactical-profile-task-families-home" },
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "2 modes with recommendations");
    await waitForText(canvasElement, "Arrow Duel also has 2 recommendations.");
    await waitForTestId(canvasElement, "training-focus-primary-mode");
  }
};

export const TacticalProfileTaskFamilies: Story = {
  name: "Puzzle solving and Arrow Duel",
  args: { scenarioId: "practice-tactical-profile-task-families" },
  parameters: { __id: "practice--tactical-profile-task-families" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-task-family-selector");
    await waitForTestId(canvasElement, "tactical-profile-signal-arrow-pin");
    await waitForTestId(canvasElement, "tactical-profile-signal-arrow-deflection-speed");
    await waitForText(
      canvasElement,
      "This is an early estimate based on ordinary mixed Arrow Duel Runs. It may change as the model is validated with more players. Review and focused Runs do not shape discovery."
    );
  }
};

export const TacticalProfileLimitedInventory: Story = {
  name: "Limited nearby puzzles",
  args: { scenarioId: "practice-tactical-profile-limited-inventory" },
  parameters: { __id: "practice--tactical-profile-limited-inventory" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "focused-run-unavailable");
    await waitForText(canvasElement, "Not enough new puzzles nearby");
  }
};

export const TacticalProfileExplanation: Story = {
  name: "Recommendation explanation",
  args: { scenarioId: "practice-tactical-profile-explanation" },
  parameters: { __id: "practice--tactical-profile-explanation" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-explanation");
    await waitForText(canvasElement, "What does not decide this");
  }
};

export const TacticalProfileFocusedRun: Story = {
  name: "Focused Run preview",
  args: { scenarioId: "practice-tactical-profile-focused-run" },
  parameters: { __id: "practice--tactical-profile-focused-run" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "focused-run-allocation-bar");
    await waitForText(canvasElement, "Mixed practice");
    await waitForTestId(canvasElement, "focused-run-start");
  }
};

export const TacticalProfileSuppressed: Story = {
  name: "Focus hidden",
  args: { scenarioId: "practice-tactical-profile-suppressed" },
  parameters: { __id: "practice--tactical-profile-suppressed" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "tactical-profile-suppressed");
    await waitForText(canvasElement, "Focus hidden for now");
    await waitForTestId(canvasElement, "tactical-profile-early-estimate");
  }
};

export const TacticalFocusGuide: Story = {
  name: "Focused Run · first-use guide",
  args: { scenarioId: "practice-tactical-focus-guide" },
  parameters: { __id: "practice--tactical-focus-guide" },
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Track the fixed Run");
    await waitForText(canvasElement, "Your Rating will not change.");
    await waitForText(canvasElement, "Unrated");
  }
};

export const TacticalFocusActive: Story = {
  name: "Focused Run · active",
  args: { scenarioId: "practice-tactical-focus-active" },
  parameters: { __id: "practice--tactical-focus-active" },
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Focused Run");
    await waitForText(canvasElement, "Unrated");
    await waitForText(canvasElement, "Completed");
    await waitForText(canvasElement, "Left");
  }
};

export const TacticalFocusResult: Story = {
  name: "Focused Run · result",
  args: { scenarioId: "practice-tactical-focus-result" },
  parameters: { __id: "practice--tactical-focus-result" },
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Focused Run complete");
    await waitForText(canvasElement, "Planned puzzles complete");
    await waitForText(canvasElement, "Unrated");
    await waitForText(canvasElement, "Back to Practice");
  }
};
