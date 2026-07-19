import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import { clickTestId, waitForTestId } from "./storyPlay.ts";

const meta = {
  title: "System",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { scenarioId: "system-loading" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-mode-arrow-duel");
    await clickTestId(canvasElement, "practice-start-button");
    await waitForTestId(canvasElement, "sprint-loading-overlay");
  }
};

export const Error: Story = {
  args: { scenarioId: "system-error" },
  play: async ({ canvasElement }) => {
    await clickTestId(canvasElement, "practice-mode-standard");
    await clickTestId(canvasElement, "practice-start-button");
    await waitForTestId(canvasElement, "error-panel");
  }
};

export const FullAppFreeRoam: Story = {
  name: "Full App (free roam)",
  args: { scenarioId: "system-full-app" }
};
