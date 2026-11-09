import React from "react";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "../LabScenario.tsx";
import { LabTextSize, LARGEST_ACCESSIBILITY_FONT_SCALE } from "../LabTextSize.tsx";
import {
  expectTestIdsNotOverlapping,
  openPracticeSession,
  waitForTestId,
  waitForText
} from "../storyPlay.ts";

// The active session HUD at the largest accessibility text size (#652). The Lab
// scales theme type roles (the HUD values use Numeral L); text with literal
// sizes elsewhere on the screen is not simulated, so device captures remain
// the acceptance evidence for the full screen.
const meta = {
  title: "Practice/Session HUD large text",
  component: LabScenario,
  render: (args) => (
    <LabTextSize fontScale={LARGEST_ACCESSIBILITY_FONT_SCALE}>
      <LabScenario {...args} />
    </LabTextSize>
  )
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SessionHudLargestText: Story = {
  name: "Session HUD · largest text",
  args: { scenarioId: "practice-active" },
  parameters: { __id: "practice--session-hud-largest-text" },
  play: async ({ canvasElement }) => {
    await openPracticeSession(canvasElement);
    await waitForTestId(canvasElement, "session-timer");
    await waitForTestId(canvasElement, "session-progress");
    await expectTestIdsNotOverlapping(canvasElement, "session-timer-block", "session-progress-block");
  }
};

export const FocusedRunHudLargestText: Story = {
  name: "Focused Run HUD · largest text",
  args: { scenarioId: "practice-tactical-focus-active" },
  parameters: { __id: "practice--focused-run-hud-largest-text" },
  play: async ({ canvasElement }) => {
    await waitForText(canvasElement, "Unrated");
    await waitForTestId(canvasElement, "session-timer");
    await expectTestIdsNotOverlapping(canvasElement, "session-timer-block", "session-rating-policy");
  }
};
