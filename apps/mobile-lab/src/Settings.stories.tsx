import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { LabScenario } from "./LabScenario.tsx";
import {
  clickTestId,
  expectTestIdAbsent,
  openSettings,
  waitForTestId,
  waitForText
} from "./storyPlay.ts";

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
    await waitForText(canvasElement, "Sign in to iCloud to sync");
    await waitForText(canvasElement, "Permission not requested");
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

export const MoveFeedback: Story = {
  name: "Move feedback",
  args: { scenarioId: "settings-move-feedback" },
  tags: ["new"],
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-move-feedback-section");
    await waitForTestId(canvasElement, "settings-move-feedback-previews");
  }
};

export const AdvancedRatingEditor: Story = {
  name: "ELO controls moved to runs",
  args: { scenarioId: "settings-advanced-ratings" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    expectTestIdAbsent(canvasElement, "settings-standard-elo-row");
    expectTestIdAbsent(canvasElement, "settings-profile-section");
  }
};

export const FeedbackEntryDesign: Story = {
  name: "Feedback entry",
  args: { scenarioId: "settings-feedback-entry" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-feedback-section");
    await clickTestId(canvasElement, "settings-feedback-open-github");
    await waitForTestId(canvasElement, "settings-feedback-handoff-confirmation");
  }
};

export const FeedbackEntryFailure: Story = {
  name: "Feedback handoff failure",
  args: { scenarioId: "settings-feedback-entry-failure" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await clickTestId(canvasElement, "settings-feedback-open-github");
    await clickTestId(canvasElement, "settings-feedback-handoff-continue");
    await waitForTestId(canvasElement, "settings-feedback-handoff-error");
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
