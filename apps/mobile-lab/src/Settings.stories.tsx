import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import { clickTestId, openSettings, waitForTestId } from "./storyPlay.ts";

const meta = {
  title: "Settings",
  component: LabScenario
} satisfies Meta<typeof LabScenario>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IosSync: Story = {
  name: "iOS sync",
  args: { scenarioId: "settings-ios-sync" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-sync-section");
  }
};

export const AndroidBackup: Story = {
  name: "Android backup",
  args: { scenarioId: "settings-android-backup" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-android-backup-section");
  }
};

export const NotificationsDenied: Story = {
  name: "Notifications denied",
  args: { scenarioId: "settings-notifications-denied" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-review-reminder-open-settings");
  }
};

export const NotificationsNotDetermined: Story = {
  name: "Notifications not determined",
  args: { scenarioId: "settings-notifications-not-determined" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-review-reminder-enable");
  }
};

export const AdvancedRatingEditor: Story = {
  name: "Advanced rating editor",
  args: { scenarioId: "settings-advanced-ratings" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await clickTestId(canvasElement, "settings-standard-elo-row");
    await waitForTestId(canvasElement, "settings-advanced-ratings-panel");
  }
};

export const StockfishDiagnostics: Story = {
  name: "Stockfish diagnostics",
  args: { scenarioId: "settings-stockfish-diagnostics" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await clickTestId(canvasElement, "settings-stockfish-diagnostics");
    await waitForTestId(canvasElement, "stockfish-diagnostics-panel");
  }
};
