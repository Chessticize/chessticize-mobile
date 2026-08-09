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
    await waitForTestId(canvasElement, "settings-move-feedback-section");
    await waitForTestId(canvasElement, "settings-move-feedback-previews");
    await waitForText(
      canvasElement,
      "Web demo only. Preview the proposed move and capture sounds; haptics require the native app. Check this tab and device volume if you do not hear them."
    );
    await waitForTestId(canvasElement, "settings-move-feedback-preview-move");
    await waitForTestId(canvasElement, "settings-move-feedback-preview-capture");
    await waitForTestId(canvasElement, "settings-guidance-section");
    await waitForText(canvasElement, "Reset guides");
    await waitForTestId(canvasElement, "settings-arrow-duel-section");
    await waitForText(canvasElement, "Find the opponent’s best reply");
    expectTestIdAbsent(canvasElement, "settings-move-feedback-preview-success");
    expectTestIdAbsent(canvasElement, "settings-move-feedback-preview-mistake");
    expectTestIdAbsent(canvasElement, "settings-move-feedback-device-note");
  }
};

export const ArrowDuelOpponentReply: Story = {
  name: "Arrow Duel · opponent reply",
  args: {
    scenarioId: "settings-ios-sync",
    storyPresentation: {
      storyId: "settings--arrow-duel-opponent-reply",
      title: "Arrow Duel · opponent reply"
    }
  },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-arrow-duel-section");
    await waitForText(
      canvasElement,
      "After you choose the better arrow, we play the other move so you can find the opponent’s best reply. Your Sprint and puzzle timers pause while you reply. You can turn this off or change the time for each Run in Edit Run."
    );
    await clickTestId(canvasElement, "settings-arrow-duel-opponent-reply-off");
    await waitForText(
      canvasElement,
      "After you choose the better arrow, you’ll go straight to the next puzzle in every Run. If you turn this back on, each Run will use the reply setting and time you previously chose."
    );
  }
};

export const ICloudSyncErrorDetails: Story = {
  name: "iCloud sync error details",
  args: { scenarioId: "settings-ios-sync-error-details" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForText(canvasElement, "iCloud sync failed");
    await clickTestId(canvasElement, "settings-sync-error-details");
    await waitForTestId(canvasElement, "settings-sync-error-details-modal");
    await waitForText(canvasElement, "The request was rate limited. Please try again later.");
    await waitForText(canvasElement, "Your progress stays private");
    await clickTestId(canvasElement, "settings-sync-error-copy");
    await waitForTestId(canvasElement, "settings-sync-error-copy-success");
    await clickTestId(canvasElement, "settings-sync-support-bundle-open");
    await waitForText(canvasElement, "This bundle contains progress data");
    await waitForText(canvasElement, "local-progress.sqlite");
    await waitForText(canvasElement, "icloud-progress-snapshot.json");
    await clickTestId(canvasElement, "settings-sync-support-bundle-prepare");
    await waitForTestId(canvasElement, "settings-sync-support-bundle-complete");
    await waitForTestId(canvasElement, "settings-sync-support-bundle-share");
  }
};

export const ICloudSyncSupportBundle: Story = {
  name: "iCloud support diagnostics",
  args: { scenarioId: "settings-ios-sync-support-bundle" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-feedback-section");
    await waitForText(canvasElement, "Email Support");
    await clickTestId(canvasElement, "settings-sync-support-bundle-entry");
    await waitForText(canvasElement, "This bundle contains progress data");
    await waitForText(canvasElement, "local-progress.sqlite");
    await waitForText(canvasElement, "icloud-progress-snapshot.json");
    await clickTestId(canvasElement, "settings-sync-support-bundle-prepare");
    await waitForTestId(canvasElement, "settings-sync-support-bundle-complete");
    await waitForTestId(canvasElement, "settings-sync-support-bundle-share");
  }
};

export const ICloudSyncSupportBundlePartial: Story = {
  name: "iCloud sync support bundle · partial",
  args: { scenarioId: "settings-ios-sync-support-bundle-partial" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await clickTestId(canvasElement, "settings-sync-error-details");
    await clickTestId(canvasElement, "settings-sync-support-bundle-open");
    await clickTestId(canvasElement, "settings-sync-support-bundle-prepare");
    await waitForTestId(canvasElement, "settings-sync-support-bundle-partial");
    await waitForText(
      canvasElement,
      "CloudKit snapshot unavailable: The request was rate limited."
    );
    await waitForText(
      canvasElement,
      "The local database and diagnostic can still help, but this bundle is not a complete reproduction."
    );
    await waitForTestId(canvasElement, "settings-sync-support-bundle-share");
  }
};

export const SprintGuideReset: Story = {
  name: "Guidance · replay Sprint and Arrow Duel guides",
  args: { scenarioId: "settings-sprint-guidance" },
  play: async ({ canvasElement }) => {
    await waitForTestId(canvasElement, "settings-guidance-section");
    await waitForTestId(canvasElement, "settings-show-sprint-guide");
    await waitForText(canvasElement, "Reset guides");
  }
};

export const AndroidBackup: Story = {
  name: "Android backup",
  args: { scenarioId: "settings-android-backup" },
  play: async ({ canvasElement }) => {
    await openSettings(canvasElement);
    await waitForTestId(canvasElement, "settings-android-backup-section");
    await waitForTestId(canvasElement, "settings-arrow-duel-section");
    await waitForTestId(canvasElement, "settings-move-feedback-section");
    expectTestIdAbsent(canvasElement, "settings-move-feedback-previews");
    await clickTestId(canvasElement, "settings-sync-support-bundle-entry");
    await waitForText(canvasElement, "local-progress.sqlite");
    await waitForText(canvasElement, "App, Android, database, and progress-protection details.");
    await clickTestId(canvasElement, "settings-sync-support-bundle-prepare");
    await waitForTestId(canvasElement, "settings-sync-support-bundle-complete");
    await waitForText(canvasElement, "Android diagnostics bundle ready");
    await waitForTestId(canvasElement, "settings-sync-support-bundle-share");
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
  name: "Rating controls moved to runs",
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
    await waitForText(canvasElement, "Email Support");
    await waitForText(canvasElement, "support@chessticize.com");
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
