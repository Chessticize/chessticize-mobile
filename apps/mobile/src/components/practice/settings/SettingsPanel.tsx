import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle
} from "react-native";
import { Chess } from "chess.js";
import {
  computeReviewReminderDecision,
  type ReviewReminderPermissionStatus,
  type ReviewReminderScheduleResult
} from "../../../platform/reviewReminderScheduler.ts";
import type { ProgressV2SyncResult } from "../../../../../../packages/storage/src/progress-sync-v2.ts";
import type { ICloudAccountStatus } from "../../../platform/iCloudProgressSync.ts";
import type { AdaptiveLayout } from "../../adaptivePracticeLayout.ts";
import type {
  MobileApplicationMetadata,
  MobilePlatformCapabilities,
  MobileStockfishCapabilities
} from "../../../platform/mobilePlatformCapabilities.ts";
import {
  analyzeFenWithUciEngine,
  type EngineAnalysisLine,
  formatWhitePerspectiveScore,
  RATING_FLOOR,
  type RatingRecord,
  stepManualRating,
  type UciEngineTransport
} from "../../../../../../packages/core/src/index.ts";
import type { ReviewReminderPreference } from "../../../../../../packages/storage/src/practice-store.ts";
import {
  ICloudSyncErrorDetails,
  type ICloudSyncErrorDetailsPresentation,
  type ICloudSyncSupportBundlePresentation,
  ICloudSyncSupportDiagnosticsEntry
} from "../../ICloudSyncErrorDetails.tsx";
import { type AppearancePreference, makeStyles, useTheme } from "../../../theme/index.ts";
import {
  type MoveFeedbackPreferences,
  type MoveFeedbackPreviewer,
  MoveFeedbackSettingsSection
} from "../../MoveFeedbackSettingsSection.tsx";
import { getBundledCorePackManifest } from "../../../platform/mobilePractice.ts";
import { useUiHaptics } from "../../../platform/uiHaptics.ts";
import { arePracticeTestControlsEnabled } from "../../../releaseConfig.ts";
import {
  AppText,
  Badge,
  Button,
  Icon,
  IconTile,
  Section,
  SegmentedControl,
  useListRowStyle
} from "../../ui/index.tsx";
import { WHATS_NEW_SETTINGS_LABEL } from "../../../whatsNew/whatsNewContent.ts";
import { SafeAreaModalBackdrop } from "../../SafeAreaModalBackdrop.tsx";
import { AppModal } from "../../AppModal.tsx";
import type { PracticeService } from "../../../../../../packages/storage/src/practice-service.ts";
import { ChevronGlyph, CloseGlyph } from "../shared/Glyphs.tsx";
import { normalizeUci } from "../../../backend/premove.ts";
import {
  ANALYSIS_DEPTH,
  errorMessage,
  FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  safeTestId,
  STACKED_ACTIONS_FONT_SCALE
} from "../shared/practiceUtils.ts";
import { usePracticeViewport } from "../../PracticeViewport.tsx";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";

const LICHESS_PUZZLE_DATABASE_URL = "https://database.lichess.org/#puzzles";

const ANALYSIS_DIAGNOSTIC_POSITIONS = [
  {
    id: "queen-capture",
    label: "Queen capture",
    fen: "r1bq1k1r/pp2b1p1/2pQ3p/8/2BP4/1PN3P1/P4P1P/3R1RK1 b - - 0 1"
  },
  {
    id: "mate-net",
    label: "Mate net",
    fen: "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1"
  },
  {
    id: "middlegame",
    label: "Middlegame",
    fen: "r1bq1rk1/pp1n1pbp/2pp1np1/4p3/2PPP3/2N2N2/PP3PPP/R1BQ1RK1 w - - 0 9"
  }
] as const;

export function reviewReminderScheduleStatusLabel(
  decision: ReturnType<typeof computeReviewReminderDecision>,
  result: ReviewReminderScheduleResult
): string {
  if (!decision || !result.scheduled) {
    return "none";
  }
  return `scheduled|${result.scheduledAt ?? decision.scheduledAt}|${decision.dueCount}|${decision.body}|${decision.route}|${decision.workloadState}|${decision.targetLocalDateTime}`;
}

export function localReminderTarget(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function progressSyncStatusMessage(result: ProgressV2SyncResult): string {
  if (result.status === "disabled") {
    return "iCloud sync is off";
  }
  const importedCount = result.imported.ratings +
    result.imported.attempts +
    result.imported.reviewQueue +
    result.imported.sprintSessions +
    result.imported.practiceRuns;
  if (importedCount === 0) {
    return "Synced";
  }
  return `Synced ${importedCount} updates`;
}

export function iCloudAccountStatusMessage(status: ICloudAccountStatus): string {
  switch (status) {
    case "available":
      return "Ready";
    case "no_account":
      return "Sign in to iCloud to sync";
    case "restricted":
      return "iCloud sync is restricted";
    case "could_not_determine":
      return "Cannot determine iCloud status";
    case "unavailable":
      return "iCloud sync is unavailable";
  }
}

export function SettingsPanel({
  advancedRatingsOpen,
  adaptiveLayout,
  appearance,
  applicationMetadata,
  arrowDuelOpponentReplyGlobalSetting,
  captureBottomInset,
  feedbackIssuesOpener,
  progressProtection,
  onOpenDiagnostics,
  onOpenNotificationSettings,
  onOpenWhatsNew,
  onAdjustRating,
  onAdvancedRatingsOpenChange,
  onRequestReviewReminderPermission,
  onResetSprintGuides,
  onSaveICloudSyncEnabled,
  onSaveReviewReminderPreference,
  onSyncICloudNow,
  iCloudSyncEnabled,
  iCloudSyncErrorDetails,
  iCloudSyncInProgress,
  iCloudSyncStatus,
  iCloudSyncSupportBundle,
  moveFeedbackPreferences,
  moveFeedbackPreviewer,
  notificationPermissionStatus,
  onAppearanceChange,
  onMoveFeedbackPreferencesChange,
  reminderPlatform,
  ratings,
  reviewReminderScheduleStatus,
  reviewReminderPreference,
  showSprintGuideReset,
  showRatingControls,
  standardRating
}: {
  advancedRatingsOpen: boolean;
  adaptiveLayout: AdaptiveLayout;
  applicationMetadata: MobileApplicationMetadata;
  arrowDuelOpponentReplyGlobalSetting?: {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
  };
  captureBottomInset?: number;
  feedbackIssuesOpener: (url: string) => Promise<void>;
  progressProtection: MobilePlatformCapabilities["progressProtection"];
  onOpenDiagnostics?: () => void;
  onOpenNotificationSettings: () => Promise<void>;
  onOpenWhatsNew: () => void;
  onAdjustRating: (ratingKey: string, nextRating: number) => RatingRecord;
  onAdvancedRatingsOpenChange: (open: boolean) => void;
  onRequestReviewReminderPermission: () => Promise<ReviewReminderPermissionStatus>;
  onResetSprintGuides: () => void;
  onSaveICloudSyncEnabled: (enabled: boolean) => void;
  onSaveReviewReminderPreference: (preference: ReviewReminderPreference) => void;
  onSyncICloudNow: () => Promise<string>;
  iCloudSyncEnabled: boolean;
  iCloudSyncErrorDetails?: ICloudSyncErrorDetailsPresentation;
  iCloudSyncInProgress: boolean;
  iCloudSyncStatus: string;
  iCloudSyncSupportBundle?: ICloudSyncSupportBundlePresentation;
  appearance: AppearancePreference;
  moveFeedbackPreferences: MoveFeedbackPreferences;
  moveFeedbackPreviewer?: MoveFeedbackPreviewer;
  notificationPermissionStatus: ReviewReminderPermissionStatus;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onMoveFeedbackPreferencesChange: (preferences: MoveFeedbackPreferences) => void;
  reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"];
  ratings: Array<{ label: string; record: RatingRecord }>;
  reviewReminderScheduleStatus: string;
  reviewReminderPreference: ReviewReminderPreference;
  showSprintGuideReset: boolean;
  showRatingControls: boolean;
  standardRating: number;
}): React.JSX.Element {
  const styles = useStyles();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sprintGuideReady, setSprintGuideReady] = useState(false);
  const bundledCoreManifest = getBundledCorePackManifest();
  const releasePageUrl = applicationMetadata.releasePageUrl;

  return (
    <View
      style={[
        styles.settingsPanel,
        adaptiveLayout.usesWideContent ? styles.settingsPanelWide : null,
        captureBottomInset === undefined
          ? null
          : {
              paddingBottom: captureBottomInset +
                (adaptiveLayout.usesWideContent ? 130 : 0)
            }
      ]}
      testID="settings-panel"
    >
      {progressProtection.kind === "icloud_sync" ? (
        <SettingsSection title="iCloud Sync" testID="settings-sync-section" wide={adaptiveLayout.usesWideContent}>
          <SettingsRow
            label="Progress Sync"
            value={iCloudSyncEnabled ? "On" : "Off"}
            detail={iCloudSyncStatus}
            testID="settings-sync-status"
          />
          <SettingsSegmentedRow
            accessibilityLabel="Progress Sync"
            options={[
              { value: "on", label: "On", testID: "settings-icloud-sync-on" },
              { value: "off", label: "Off", testID: "settings-icloud-sync-off" }
            ]}
            testID="settings-icloud-sync-controls"
            value={iCloudSyncEnabled ? "on" : "off"}
            onChange={(next) => {
              onSaveICloudSyncEnabled(next === "on");
              setStatusMessage(next === "on" ? "iCloud sync enabled" : "iCloud sync disabled");
            }}
          />
          {iCloudSyncEnabled ? (
            <>
              <SettingsActionButton
                label="Sync Now"
                detail="Merge ratings, history, and review queue with your private iCloud."
                loading={iCloudSyncInProgress}
                testID="settings-sync-now"
                onPress={() => {
                  void onSyncICloudNow().then((message) => {
                    setStatusMessage(message);
                  });
                }}
              />
              {iCloudSyncErrorDetails ? (
                <ICloudSyncErrorDetails presentation={iCloudSyncErrorDetails} />
              ) : null}
            </>
          ) : null}
        </SettingsSection>
      ) : (
        <SettingsSection
          title="Android Progress Backup"
          testID="settings-android-backup-section"
          wide={adaptiveLayout.usesWideContent}
        >
          <SettingsRow
            label="Backup & device transfer"
            value="Managed by Android"
            detail="Android can restore local progress after reinstall or device transfer when available. This is restore protection, not continuous sync."
            testID="settings-android-backup-status"
          />
        </SettingsSection>
      )}

      {arrowDuelOpponentReplyGlobalSetting ? (
        <SettingsSection
          title="Arrow Duel"
          testID="settings-arrow-duel-section"
          wide={adaptiveLayout.usesWideContent}
        >
          <SettingsRow
            label="Find the opponent’s best reply"
            value={arrowDuelOpponentReplyGlobalSetting.enabled ? "On" : "Off"}
            detail={arrowDuelOpponentReplyGlobalSetting.enabled
              ? "After a correct arrow choice, we play the other move so you can find the opponent’s best reply. New Survival Runs use this setting with no reply timer; paused sessions keep their existing rule. Other Runs follow the reply choice and time saved in Edit Run, and their timers pause during the reply."
              : "New Arrow Duel play checks only your arrow choice, including Survival. A correct choice completes the puzzle; a wrong choice enters Review. Paused sessions keep their existing rule. Turning this back on restores each saved Run’s reply choice and time."}
            testID="settings-arrow-duel-opponent-reply"
          />
          <SettingsSegmentedRow
            accessibilityLabel="Find the opponent’s best reply"
            options={[
              { value: "on", label: "On", testID: "settings-arrow-duel-opponent-reply-on" },
              { value: "off", label: "Off", testID: "settings-arrow-duel-opponent-reply-off" }
            ]}
            testID="settings-arrow-duel-opponent-reply-controls"
            value={arrowDuelOpponentReplyGlobalSetting.enabled ? "on" : "off"}
            onChange={(next) => {
              arrowDuelOpponentReplyGlobalSetting.onChange(next === "on");
              setStatusMessage(next === "on"
                ? "Opponent replies are available, including in Survival"
                : "Arrow Duel now checks only your arrow choice");
            }}
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Notifications" testID="settings-notifications-section" wide={adaptiveLayout.usesWideContent}>
        <SettingsRow
          label="Review Reminders"
          value={reviewReminderPreferenceLabel(reviewReminderPreference)}
          detail={reviewReminderSettingsDetail({
            notificationPermissionStatus,
            preference: reviewReminderPreference,
            reminderPlatform,
            scheduleStatus: reviewReminderScheduleStatus
          })}
          testID="settings-review-reminders"
        />
        <SettingsSegmentedRow
          accessibilityLabel="Review Reminders"
          options={[
            { value: "smart", label: "Smart", testID: "settings-review-reminder-smart" },
            { value: "fixed-1900", label: "19:00", testID: "settings-review-reminder-fixed-1900" },
            { value: "off", label: "Off", testID: "settings-review-reminder-off" }
          ]}
          testID="settings-review-reminder-preferences"
          value={reviewReminderPreference.mode === "smart"
            ? "smart"
            : reviewReminderPreference.mode === "off"
              ? "off"
              : reviewReminderPreference.fixedLocalTime === "19:00" ? "fixed-1900" : "other"}
          onChange={(next) => {
            if (next === "smart") {
              onSaveReviewReminderPreference({ mode: "smart" });
            } else if (next === "fixed-1900") {
              onSaveReviewReminderPreference({ mode: "fixed", fixedLocalTime: "19:00" });
            } else if (next === "off") {
              onSaveReviewReminderPreference({ mode: "off" });
            }
          }}
        />
        {notificationPermissionStatus === "not_determined" && reviewReminderPreference.mode !== "off" ? (
          <SettingsActionRow
            label="Enable Notifications"
            detail={reminderPlatform === "android"
              ? "Android shows its notification permission after this action"
              : "Ask iOS permission after your first review session"}
            testID="settings-review-reminder-enable"
            onPress={() => {
              void onRequestReviewReminderPermission().then((status) => {
                setStatusMessage(reviewReminderPermissionStatusMessage(status, reminderPlatform));
              });
            }}
          />
        ) : null}
        {notificationPermissionStatus === "denied" || notificationPermissionStatus === "channel_disabled" ? (
          <SettingsActionRow
            label={reminderPlatform === "android" ? "Open Android Notification Settings" : "Open iOS Settings"}
            detail={reminderPlatform === "android"
              ? "Restore app permission or the Review reminders channel in Android"
              : "Notifications are blocked by iOS and cannot be requested again here"}
            testID="settings-review-reminder-open-settings"
            onPress={() => {
              void onOpenNotificationSettings().then(() => {
                setStatusMessage(reminderPlatform === "android" ? "Opened Android notification settings" : "Opened iOS Settings");
              }).catch(() => {
                setStatusMessage(reminderPlatform === "android"
                  ? "Android notification settings are unavailable on this device"
                  : "iOS Settings are unavailable on this device");
              });
            }}
          />
        ) : null}
        {arePracticeTestControlsEnabled() ? (
          <Text testID="settings-review-reminder-schedule-status" style={styles.reviewDueHiddenMetric}>
            {reviewReminderScheduleStatus}
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Move Feedback"
        testID="settings-move-feedback-section"
        wide={adaptiveLayout.usesWideContent}
      >
        <MoveFeedbackSettingsSection
          preferences={moveFeedbackPreferences}
          onPreferencesChange={onMoveFeedbackPreferencesChange}
          onPreview={moveFeedbackPreviewer}
        />
      </SettingsSection>

      <SettingsSection
        title="Appearance"
        testID="settings-appearance-section"
        wide={adaptiveLayout.usesWideContent}
      >
        <SettingsSegmentedRow
          accessibilityLabel="Appearance"
          options={[
            { value: "system", label: "System", testID: "settings-appearance-system" },
            { value: "light", label: "Light", testID: "settings-appearance-light" },
            { value: "dark", label: "Dark", testID: "settings-appearance-dark" }
          ]}
          testID="settings-appearance-options"
          value={appearance}
          onChange={onAppearanceChange}
        />
      </SettingsSection>

      {showRatingControls ? (
        <SettingsSection title="Profile" testID="settings-profile-section" wide={adaptiveLayout.usesWideContent}>
          <SettingsRow
            label="Edit rating"
            value={`Rating ${standardRating}`}
            detail="Standard and Arrow Duel difficulty"
            testID="settings-standard-elo-row"
            onPress={() => onAdvancedRatingsOpenChange(!advancedRatingsOpen)}
          />
          {advancedRatingsOpen ? (
            <AdvancedRatingsPanel
              ratings={ratings}
              onAdjust={(ratingKey, nextRating) => {
                const next = onAdjustRating(ratingKey, nextRating);
                setStatusMessage(`${ratingLabelFromKey(ratingKey)} rating set to ${next.rating}`);
              }}
            />
          ) : null}
        </SettingsSection>
      ) : null}

      {showSprintGuideReset ? (
        <SettingsSection title="Guidance" testID="settings-guidance-section" wide={adaptiveLayout.usesWideContent}>
          <View style={styles.settingsBlock} testID="settings-guidance-reset-card">
            <View style={styles.settingsRowCopy}>
              <AppText variant="body">Replay practice guides</AppText>
              <AppText tone="secondary" variant="footnote">
                Reset the Sprint rules, active-session, and Arrow Duel guides so they appear again when each applies. Runs, ratings, and History stay unchanged.
              </AppText>
            </View>
            <Button
              accessibilityLabel={sprintGuideReady ? "Practice guides reset" : "Reset practice guides"}
              disabled={sprintGuideReady}
              icon={sprintGuideReady ? "check" : "restore"}
              label={sprintGuideReady ? "Guides reset" : "Reset guides"}
              size="compact"
              testID="settings-show-sprint-guide"
              variant="secondary"
              onPress={() => {
                onResetSprintGuides();
                setSprintGuideReady(true);
              }}
            />
          </View>
          {sprintGuideReady ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.settingsBlock}
              testID="settings-sprint-guide-ready"
            >
              <AppText tone="positive" variant="footnote">
                Guides reset. Each guide will replay the next time it applies.
              </AppText>
            </View>
          ) : null}
        </SettingsSection>
      ) : null}

      <FeedbackSupportCard
        feedbackIssuesUrl={applicationMetadata.feedbackIssuesUrl}
        openFeedbackIssues={feedbackIssuesOpener}
        supportBundle={iCloudSyncSupportBundle}
        supportEmail={applicationMetadata.supportEmail}
        supportEmailUrl={applicationMetadata.supportEmailUrl}
        wide={adaptiveLayout.usesWideContent}
      />

      <SettingsSection title="About" testID="settings-about-section" wide={adaptiveLayout.usesWideContent}>
        <SettingsRow
          label={WHATS_NEW_SETTINGS_LABEL}
          testID="settings-whats-new"
          onPress={onOpenWhatsNew}
        />
        <SettingsRow
          label="App Version"
          value={applicationMetadata.buildNumber
            ? `${applicationMetadata.versionName} (${applicationMetadata.buildNumber})`
            : applicationMetadata.versionName}
          testID="settings-app-version"
        />
        {releasePageUrl ? (
          <SettingsExternalLinkRow
            label="Android Releases"
            value="GitHub"
            detail="Manual Play-signed APK downloads"
            linkLabel="Open GitHub Releases"
            testID="settings-android-releases"
            onPress={() => {
              void Linking.openURL(releasePageUrl);
            }}
          />
        ) : null}
        <SettingsExternalLinkRow
          label="License"
          value="GPL-3.0-or-later"
          detail="App source license"
          linkLabel="Open license"
          testID="settings-license"
          onPress={() => {
            void Linking.openURL(applicationMetadata.sourceLicenseUrl);
          }}
        />
        <SettingsExternalLinkRow
          label="Source"
          value="GitHub"
          detail="Public Chessticize mobile repository"
          linkLabel="github.com/Chessticize/chessticize-mobile"
          testID="settings-source"
          onPress={() => {
            void Linking.openURL(applicationMetadata.sourceRepositoryUrl);
          }}
        />
        <SettingsExternalLinkRow
          label="Stockfish"
          value="Embedded"
          detail="Stockfish 18 engine source used by the app"
          linkLabel="StockfishEngine in source"
          testID="settings-stockfish-source"
          onPress={() => {
            void Linking.openURL(applicationMetadata.stockfishSourceUrl);
          }}
        />
        <SettingsExternalLinkRow
          label="Puzzle Data"
          value={bundledCoreManifest.source}
          detail={`${bundledCoreManifest.sourceLicense}. ${bundledCoreManifest.licenseNote} ${bundledCoreManifest.presolve}.`}
          linkLabel="database.lichess.org/#puzzles"
          testID="settings-puzzle-data-license"
          onPress={() => {
            void Linking.openURL(LICHESS_PUZZLE_DATABASE_URL);
          }}
        />
      </SettingsSection>

      {statusMessage ? (
        <AppText style={styles.settingsStatusText} testID="settings-status-message" tone="secondary" variant="footnote">
          {statusMessage}
        </AppText>
      ) : null}
      {onOpenDiagnostics ? (
        <Button
          accessibilityLabel="Open Stockfish diagnostics"
          label="Stockfish Diagnostics"
          size="compact"
          testID="settings-stockfish-diagnostics"
          variant="secondary"
          onPress={onOpenDiagnostics}
        />
      ) : null}
    </View>
  );
}

function FeedbackSupportCard({
  feedbackIssuesUrl,
  openFeedbackIssues,
  supportBundle,
  supportEmail,
  supportEmailUrl,
  wide
}: {
  feedbackIssuesUrl: string;
  openFeedbackIssues: (url: string) => Promise<void>;
  supportBundle?: ICloudSyncSupportBundlePresentation;
  supportEmail: string;
  supportEmailUrl: string;
  wide: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  function closeConfirmation(): void {
    setConfirmationVisible(false);
    setHandoffError(null);
  }

  async function continueToGitHub(): Promise<void> {
    setHandoffError(null);
    try {
      await openFeedbackIssues(feedbackIssuesUrl);
      setConfirmationVisible(false);
    } catch {
      setHandoffError("Couldn't open GitHub Issues. Try again.");
    }
  }

  return (
    <SettingsSection
      title="Help & Feedback"
      testID="settings-feedback-section"
      wide={wide}
    >
      <View style={styles.settingsBlock}>
        <View style={styles.feedbackSupportHeader}>
          <IconTile name="help" />
          <View style={styles.settingsRowCopy}>
            <AppText variant="headline">Help improve Chessticize</AppText>
            <AppText tone="secondary" variant="subheadline">
              Report a bug, request a feature, or see whether someone has already raised it.
            </AppText>
          </View>
        </View>
        <View style={styles.settingsRowCopy}>
          <AppText style={styles.settingsEmphasis} variant="footnote">Your data stays in the app</AppText>
          <AppText tone="secondary" variant="footnote">
            GitHub opens in your browser. Ratings, history, and puzzle data are not attached.
          </AppText>
        </View>
        <Button
          accessibilityLabel="Open GitHub Issues in browser"
          icon="external"
          label="Open GitHub Issues"
          stretch
          testID="settings-feedback-open-github"
          variant="secondary"
          onPress={() => {
            setHandoffError(null);
            setConfirmationVisible(true);
          }}
        />
        <AppText style={styles.settingsCaptionCentered} tone="secondary" variant="footnote">
          You will review and submit your issue on GitHub.
        </AppText>
      </View>
      {supportBundle ? (
        <ICloudSyncSupportDiagnosticsEntry presentation={supportBundle} />
      ) : null}
      <SettingsExternalLinkRow
        label="Email Support"
        value="Email"
        detail="Private questions and account support"
        linkLabel={supportEmail}
        testID="settings-support-email"
        onPress={() => {
          void Linking.openURL(supportEmailUrl);
        }}
      />
      {confirmationVisible ? (
        <AppModal
          animationType="fade"
          onRequestClose={closeConfirmation}
          transparent
          visible
        >
          <SafeAreaModalBackdrop style={styles.accessibleMoveModalBackdrop}>
            <ScrollView
              accessibilityViewIsModal
              contentContainerStyle={styles.feedbackHandoffContent}
              style={[styles.feedbackHandoffConfirmation, styles.feedbackHandoffCard]}
              testID="settings-feedback-handoff-confirmation"
            >
              <Badge label="EXTERNAL BROWSER" tone="accent" />
              <AppText variant="title">Continue to GitHub?</AppText>
              <AppText variant="body">
                A new issue will open on github.com in your default browser. Chessticize does not attach your account, rating, history, or puzzle data.
              </AppText>
              <View style={styles.settingsRowCopy}>
                <AppText style={styles.settingsEmphasis} variant="footnote">You stay in control</AppText>
                <AppText tone="secondary" variant="footnote">
                  Review what you share and submit it on GitHub. This is not an in-app submission.
                </AppText>
              </View>
              {handoffError ? (
                <AppText testID="settings-feedback-handoff-error" tone="negative" variant="footnote">
                  {handoffError}
                </AppText>
              ) : null}
              <View style={styles.feedbackHandoffActions}>
                <Button
                  accessibilityLabel="Stay in Settings"
                  label="Not now"
                  stretch
                  testID="settings-feedback-handoff-cancel"
                  variant="secondary"
                  onPress={closeConfirmation}
                />
                <Button
                  accessibilityLabel="Continue to GitHub Issues"
                  accessibilityRole="link"
                  icon="external"
                  label="Continue to GitHub"
                  stretch
                  testID="settings-feedback-handoff-continue"
                  onPress={() => {
                    void continueToGitHub();
                  }}
                />
              </View>
            </ScrollView>
          </SafeAreaModalBackdrop>
        </AppModal>
      ) : null}
    </SettingsSection>
  );
}

export function ReviewReminderPermissionPrompt({
  onDismiss,
  onEnable
}: {
  onDismiss: () => void;
  onEnable: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const { fontScale } = usePracticeViewport();
  const stackActions = fontScale >= STACKED_ACTIONS_FONT_SCALE;
  return (
    <View style={styles.reviewReminderPrompt} testID="review-reminder-permission-prompt">
      <View style={styles.reviewReminderPromptCopy}>
        <Text style={styles.sectionLabel}>Review reminders</Text>
        <Text style={styles.helperText}>Get a local reminder when missed puzzles are ready again.</Text>
      </View>
      <View style={[styles.confirmationActionRow, stackActions ? styles.confirmationActionsStacked : null]}>
        <Button
          accessibilityLabel="Dismiss review reminder permission prompt"
          label="Not Now"
          size="compact"
          stretch={stackActions}
          testID="review-reminder-permission-dismiss"
          variant="secondary"
          onPress={onDismiss}
        />
        <Button
          accessibilityLabel="Enable review reminders"
          label="Enable"
          size="compact"
          stretch={stackActions}
          testID="review-reminder-permission-enable"
          onPress={onEnable}
        />
      </View>
    </View>
  );
}

function SettingsSegmentedRow<T extends string>({
  accessibilityLabel,
  options,
  testID,
  value,
  onChange
}: {
  accessibilityLabel: string;
  options: ReadonlyArray<{ value: T; label: string; testID: string }>;
  testID: string;
  value: T;
  onChange: (next: T) => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.settingsControlRow}>
      <SegmentedControl
        accessibilityLabel={accessibilityLabel}
        options={options}
        testID={testID}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

function SettingsActionRow({
  detail,
  label,
  onPress,
  testID
}: {
  detail: string;
  label: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  return <SettingsRow detail={detail} label={label} testID={testID} tint="accent" onPress={onPress} />;
}

function SettingsActionButton({
  detail,
  label,
  loading,
  onPress,
  testID
}: {
  detail: string;
  label: string;
  loading: boolean;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  return (
    <View style={styles.settingsActionButtonRow}>
      <AppText style={styles.settingsActionButtonDetail} testID={`${testID}-detail`} tone="secondary" variant="footnote">
        {detail}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={loading ? "Syncing progress" : label}
        accessibilityState={{ busy: loading, disabled: loading }}
        disabled={loading}
        testID={testID}
        style={({ pressed }) => [
          styles.settingsActionButton,
          pressed && !loading ? styles.settingsActionButtonPressed : null,
          loading ? styles.settingsActionButtonDisabled : null
        ]}
        onPress={onPress}
      >
        {loading ? (
          <ActivityIndicator
            color={appTheme.colors.text.onAccent}
            size="small"
            testID={`${testID}-spinner`}
          />
        ) : null}
        <AppText style={styles.settingsActionButtonText} testID={`${testID}-label`} tone="onAccent" variant="headline">
          {loading ? "Syncing…" : label}
        </AppText>
      </Pressable>
    </View>
  );
}

function reviewReminderPreferenceLabel(preference: ReviewReminderPreference): string {
  if (preference.mode === "fixed") {
    return preference.fixedLocalTime;
  }
  if (preference.mode === "off") {
    return "Off";
  }
  return "Smart";
}

function reviewReminderSettingsDetail({
  notificationPermissionStatus,
  preference,
  reminderPlatform,
  scheduleStatus
}: {
  notificationPermissionStatus: ReviewReminderPermissionStatus;
  preference: ReviewReminderPreference;
  reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"];
  scheduleStatus: string;
}): string {
  if (reminderPlatform === "ios") {
    return reviewReminderPermissionDetail(notificationPermissionStatus);
  }
  if (preference.mode === "off") {
    return "Reminders are off. No notification is scheduled.";
  }
  switch (notificationPermissionStatus) {
    case "denied":
      return "Blocked in Android notification settings. You can restore access.";
    case "channel_disabled":
      return "The Review reminders channel is off in Android settings.";
    case "not_determined":
      return "Permission not requested. Enable from this screen when you are ready.";
    case "unavailable":
      return "Notifications unavailable on this device";
    case "authorized":
      break;
  }
  if (scheduleStatus === "error") {
    return "Android could not schedule the next reminder. Try changing the reminder setting.";
  }
  if (scheduleStatus === "pending") {
    return "Updating the next Android reminder.";
  }
  if (scheduleStatus === "none") {
    return "No review work is scheduled.";
  }
  const [, , , , , workloadState, targetLocalDateTime] = scheduleStatus.split("|");
  if (scheduleStatus.startsWith("scheduled|") && targetLocalDateTime) {
    const target = targetLocalDateTime.replace("T", " ");
    const workload = workloadState === "overdue"
      ? " Overdue review work is included."
      : workloadState === "due_today"
        ? " Today's review work is included."
        : " Future review work is included.";
    return `Target ${target} local; Android may deliver later.${workload}`;
  }
  return "Local notifications enabled";
}

function reviewReminderPermissionDetail(status: ReviewReminderPermissionStatus): string {
  switch (status) {
    case "authorized":
      return "Local notifications enabled";
    case "denied":
      return "Blocked in iOS Settings";
    case "channel_disabled":
      return "Notifications disabled in Settings";
    case "not_determined":
      return "Permission not requested";
    case "unavailable":
      return "Notifications unavailable on this device";
  }
}

function reviewReminderPermissionStatusMessage(
  status: ReviewReminderPermissionStatus,
  reminderPlatform: MobilePlatformCapabilities["reminders"]["platform"]
): string {
  switch (status) {
    case "authorized":
      return "Notifications enabled";
    case "denied":
      return reminderPlatform === "android"
        ? "Notifications blocked in Android notification settings"
        : "Notifications blocked in iOS Settings";
    case "channel_disabled":
      return "Review reminder notifications disabled in Settings";
    case "not_determined":
      return "Notification permission not requested";
    case "unavailable":
      return "Notifications unavailable";
  }
}

export function scheduledReviewAttemptCount(service: PracticeService): number {
  return service.countHistory({ source: "scheduled_review" });
}

function AdvancedRatingsPanel({
  onAdjust,
  ratings
}: {
  onAdjust: (ratingKey: string, nextRating: number) => void;
  ratings: Array<{ label: string; record: RatingRecord }>;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.advancedRatingsPanel} testID="settings-advanced-ratings-panel">
      <View style={styles.settingsRowCopy}>
        <AppText variant="headline">Difficulty controls</AppText>
        <AppText tone="secondary" variant="footnote">
          Each rating helps Chessticize choose the right puzzle difficulty.
        </AppText>
      </View>
      <View style={styles.advancedRatingRows}>
        {ratings.map(({ label, record }) => (
          <AdvancedRatingRow
            key={record.key}
            label={label}
            record={record}
            testID={`settings-advanced-rating-${safeTestId(label)}`}
            onAdjust={onAdjust}
          />
        ))}
      </View>
    </View>
  );
}

function AdvancedRatingRow({
  label,
  onAdjust,
  record,
  testID,
}: {
  label: string;
  onAdjust: (ratingKey: string, nextRating: number) => void;
  record: RatingRecord;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const decrementDisabled = record.rating <= RATING_FLOOR;
  const uiHaptics = useUiHaptics();
  return (
    <View style={styles.advancedRatingRow} testID={testID}>
      <View style={styles.advancedRatingCopy}>
        <AppText variant="body">{label}</AppText>
        <AppText tone="secondary" variant="footnote">{advancedRatingBucketLabel(label, record.key)}</AppText>
      </View>
      <View style={styles.advancedRatingControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label} rating`}
          accessibilityState={{ disabled: decrementDisabled }}
          disabled={decrementDisabled}
          testID={`${testID}-decrease`}
          style={({ pressed }) => [
            styles.settingsStepperButton,
            pressed && !decrementDisabled ? styles.settingsActionButtonPressed : null,
            decrementDisabled ? styles.disabledButton : null
          ]}
          onPress={() => {
            uiHaptics("selection");
            onAdjust(record.key, stepManualRating(record.rating, -1));
          }}
        >
          <Icon color={appTheme.colors.accent.s600} name="remove" size={18} weight="semibold" />
        </Pressable>
        <AppText style={styles.advancedRatingValue} testID={`${testID}-value`} variant="body">Rating {record.rating}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label} rating`}
          testID={`${testID}-increase`}
          style={({ pressed }) => [styles.settingsStepperButton, pressed ? styles.settingsActionButtonPressed : null]}
          onPress={() => {
            uiHaptics("selection");
            onAdjust(record.key, stepManualRating(record.rating, 1));
          }}
        >
          <Icon color={appTheme.colors.accent.s600} name="add" size={18} weight="semibold" />
        </Pressable>
      </View>
    </View>
  );
}

export function ratingLabelFromKey(ratingKey: string): string {
  if (/\barrow[_ ]duel\b/.test(ratingKey)) {
    return "Arrow Duel";
  }
  if (/\bblitz\b/.test(ratingKey)) {
    return "Blitz";
  }
  if (/\bcustom\b/.test(ratingKey)) {
    return "Custom";
  }
  return "Standard";
}

function advancedRatingBucketLabel(label: string, ratingKey: string): string {
  const speed = ratingKey.match(/\/(\d+)\b/)?.[1];
  return speed ? `${label} · ${speed}s pace` : label;
}

function SettingsSection({
  cardStyle,
  children,
  testID,
  title,
  wide = false
}: {
  cardStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID: string;
  title: string;
  wide?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Section
      header={title}
      rows
      style={wide ? styles.settingsSectionWide : null}
      surfaceStyle={cardStyle}
      testID={testID}
    >
      {children}
    </Section>
  );
}

function SettingsRow({
  destructive = false,
  detail,
  label,
  onPress,
  showDetail = true,
  testID,
  tint,
  value
}: {
  destructive?: boolean;
  detail?: string;
  label: string;
  onPress?: () => void;
  showDetail?: boolean;
  testID: string;
  tint?: "accent";
  value?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <Pressable
      accessible
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [rowStyle, styles.settingsRow, onPress && pressed ? styles.settingsRowPressed : null]}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <View style={styles.settingsRowTitleLine}>
          <AppText
            tone={tint === "accent" ? "accent" : undefined}
            style={[styles.settingsRowLabel, destructive ? styles.settingsDestructiveText : null]}
            variant="body"
          >
            {label}
          </AppText>
          {value ? <AppText style={styles.settingsRowValue} tone="secondary" variant="body">{value}</AppText> : null}
        </View>
        {detail && showDetail ? <AppText tone="secondary" variant="footnote">{detail}</AppText> : null}
        {detail && !showDetail ? (
          <View
            accessibilityLabel={detail}
            testID={`${testID}-detail`}
          />
        ) : null}
      </View>
      {onPress ? (
        <Icon color={appTheme.colors.text.tertiary} name="chevronRight" size={15} testID="chevron-right-glyph" weight="semibold" />
      ) : null}
    </Pressable>
  );
}

function SettingsExternalLinkRow({
  detail,
  label,
  linkLabel,
  onPress,
  testID,
  value
}: {
  detail: string;
  label: string;
  linkLabel: string;
  onPress: () => void;
  testID: string;
  value: string;
}): React.JSX.Element {
  const styles = useStyles();
  const appTheme = useTheme();
  const rowStyle = useListRowStyle();
  const accessibilityLabel = [label, value, detail, linkLabel].join(", ");
  return (
    <Pressable
      accessible
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [rowStyle, styles.settingsRow, pressed ? styles.settingsRowPressed : null]}
      onPress={onPress}
    >
      <View style={styles.settingsRowCopy}>
        <View style={styles.settingsRowTitleLine}>
          <AppText style={styles.settingsRowLabel} variant="body">{label}</AppText>
          <AppText style={styles.settingsRowValue} tone="secondary" variant="body">{value}</AppText>
        </View>
        <AppText tone="secondary" variant="footnote">{detail}</AppText>
        <AppText tone="accent" variant="footnote">{linkLabel}</AppText>
      </View>
      <Icon color={appTheme.colors.text.tertiary} name="external" size={15} weight="semibold" />
    </Pressable>
  );
}

type PackRowModel = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  coverage: {
    puzzles: string;
    rating: string;
    themes: string;
    arrowDuel: string;
  };
  source: string;
  presolveStatus: string;
  manifestHash: string;
  buildDate: string;
  licenseNote: string;
  status: "active" | "installed" | "optional";
  testID: string;
};

const PACK_CATALOG: PackRowModel[] = [packRowFromManifest()];

function packRowFromManifest(): PackRowModel {
  const manifest = getBundledCorePackManifest();
  const puzzleCount = formatWholeNumber(manifest.puzzleCount);
  const arrowDuelCount = formatWholeNumber(manifest.arrowDuelCount);
  const themeCount = `${formatWholeNumber(manifest.themes.length)} themes`;
  const ratingRange = `${manifest.rating.min}-${manifest.rating.max}`;
  return {
    id: manifest.id,
    title: manifest.title,
    subtitle: `${puzzleCount} puzzles · offline`,
    detail: `Rating ${ratingRange} · ${themeCount} · ${arrowDuelCount} Arrow Duel`,
    coverage: {
      puzzles: puzzleCount,
      rating: ratingRange,
      themes: themeCount,
      arrowDuel: arrowDuelCount
    },
    source: `${manifest.source} (${manifest.sourceLicense})`,
    presolveStatus: manifest.presolve,
    manifestHash: manifest.manifestHash,
    buildDate: manifest.buildDate,
    licenseNote: manifest.licenseNote,
    status: "active",
    testID: "packs-installed-core"
  };
}

// This dormant panel is intentionally retained while it is not wired into navigation.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PacksPanel(): React.JSX.Element {
  const styles = useStyles();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const installedPacks = PACK_CATALOG;
  const selectedPack = selectedPackId === null
    ? null
    : PACK_CATALOG.find((pack) => pack.id === selectedPackId) ?? null;
  const coverageSummary = summarizeInstalledPackCoverage(installedPacks);

  return (
    <View style={styles.packsPanel} testID="packs-panel">
      <View style={styles.historyHeaderRow} testID="packs-action-header">
        <Text style={styles.screenTitle}>Puzzle Packs</Text>
      </View>

      <View style={styles.packCoverageCard} testID="packs-coverage-summary">
        <View style={styles.sectionHeaderRow} testID="packs-coverage-header">
          <Text style={styles.sectionLabel}>Coverage</Text>
        </View>
        <View style={styles.packCoverageGrid}>
          <PackCoverageMetric
            label="Installed"
            value={`${installedPacks.length} ${installedPacks.length === 1 ? "pack" : "packs"}`}
            testID="packs-summary-installed"
          />
          <PackCoverageMetric label="Puzzles" value={coverageSummary.puzzles} testID="packs-summary-puzzles" />
          <PackCoverageMetric label="Rating" value={coverageSummary.rating} testID="packs-summary-rating" />
          <PackCoverageMetric label="Arrow Duel" value={coverageSummary.arrowDuel} testID="packs-summary-arrow-duel" />
        </View>
      </View>

      <PackSection title="Installed" testID="packs-installed-section">
        {installedPacks.map((pack) => (
          <PackRow
            key={pack.id}
            pack={pack}
            onOpenDetail={() => setSelectedPackId(pack.id)}
          />
        ))}
      </PackSection>

      <View style={styles.packInfoCard} testID="packs-offline-readiness">
        <Text style={styles.sectionLabel}>Offline Ready</Text>
        <Text style={styles.helperText}>
          The bundled Core Pack ships with the app and works fully offline. This version does not download additional packs.
        </Text>
      </View>

      {selectedPack ? (
        <PackDetailPanel
          pack={selectedPack}
          onClose={() => setSelectedPackId(null)}
        />
      ) : null}

      <View style={styles.packInfoCard} testID="packs-info-section">
        <Text style={styles.sectionLabel}>Pack Info</Text>
        <PackInfoRow label="Source" value="Lichess puzzle database" testID="packs-source" />
        <PackInfoRow label="Processing" value="Pre-solved for Chessticize" testID="packs-processing" />
        <PackInfoRow
          label="License notes"
          value="Lichess-derived"
          detail="Puzzle data is derived from the Lichess puzzle database and bundled for offline use with Chessticize presolve metadata."
          testID="packs-license-notes"
        />
      </View>
    </View>
  );
}

function summarizeInstalledPackCoverage(packs: PackRowModel[]): { puzzles: string; rating: string; arrowDuel: string } {
  const puzzleTotal = packs.reduce((sum, pack) => sum + parseWholeNumber(pack.coverage.puzzles), 0);
  const ratingRanges = packs
    .map((pack) => parseRatingRange(pack.coverage.rating))
    .filter((range): range is { min: number; max: number } => range !== null);
  const rating = ratingRanges.length > 0
    ? `${Math.min(...ratingRanges.map((range) => range.min))}-${Math.max(...ratingRanges.map((range) => range.max))}`
    : "n/a";
  const arrowDuelTotal = packs.reduce((sum, pack) => sum + parseWholeNumber(pack.coverage.arrowDuel), 0);

  return {
    puzzles: formatWholeNumber(puzzleTotal),
    rating,
    arrowDuel: arrowDuelTotal > 0 ? formatWholeNumber(arrowDuelTotal) : "Limited"
  };
}

function formatWholeNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseWholeNumber(value: string): number {
  const match = value.match(/[\d,]+/);
  return match ? Number(match[0].replaceAll(",", "")) : 0;
}

function parseRatingRange(value: string): { min: number; max: number } | null {
  const match = value.match(/(\d+)-(\d+)/);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}

function PackCoverageMetric({
  label,
  testID,
  value
}: {
  label: string;
  testID: string;
  value: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.packCoverageMetric} testID={testID}>
      <Text style={styles.packCoverageLabel}>{label}</Text>
      <Text style={styles.packCoverageMetricValue}>{value}</Text>
    </View>
  );
}

function PackSection({
  children,
  testID,
  title
}: {
  children: React.ReactNode;
  testID: string;
  title: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.settingsSection} testID={testID}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.settingsSectionCard}>{children}</View>
    </View>
  );
}

function PackRow({
  onOpenDetail,
  pack
}: {
  onOpenDetail: () => void;
  pack: PackRowModel;
}): React.JSX.Element {
  const styles = useStyles();
  const statusLabel = pack.status === "active" ? "Active" : pack.status === "installed" ? "Installed" : "Optional";
  const coverageLabel = `${pack.coverage.puzzles} puzzles, rating ${pack.coverage.rating}, ${pack.coverage.themes} themes, Arrow Duel ${pack.coverage.arrowDuel}`;
  const optionalCoverageSummary = `${pack.coverage.rating} · ${pack.coverage.themes} · Arrow Duel ${pack.coverage.arrowDuel}`;
  return (
    <View
      accessibilityLabel={`${pack.title}, ${statusLabel.toLowerCase()} puzzle pack, ${coverageLabel}`}
      style={styles.packRow}
      testID={pack.testID}
    >
      <View style={styles.packRowCopy}>
        <View style={styles.packTitleRow}>
          <Text style={styles.historyRowTitle}>{pack.title}</Text>
        </View>
        <Text style={styles.helperText} testID={`packs-subtitle-${pack.id}`}>{pack.coverage.puzzles} puzzles</Text>
        <Text style={styles.packRowMetaText} testID={`packs-meta-${pack.id}`}>
          {optionalCoverageSummary}
        </Text>
        <Text
          accessibilityLabel={`Rating ${pack.coverage.rating}, themes ${pack.coverage.themes}, Arrow Duel ${pack.coverage.arrowDuel}`}
          style={styles.packCoverageHiddenText}
          testID={`packs-coverage-${pack.id}`}
        >
          {""}
        </Text>
      </View>
      <View style={styles.packActionColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${pack.title} details`}
          testID={`packs-detail-${pack.id}`}
          style={styles.packDetailButton}
          onPress={onOpenDetail}
        >
          <ChevronGlyph direction="right" />
        </Pressable>
      <PackActiveMark testID={`packs-active-${pack.id}`} />
      </View>
    </View>
  );
}

function PackActiveMark({ testID }: { testID: string }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.packActiveMark} testID={testID}>
      <View style={[styles.packActiveGlyphLine, styles.packActiveGlyphShort]} />
      <View style={[styles.packActiveGlyphLine, styles.packActiveGlyphLong]} />
    </View>
  );
}

function PackDetailPanel({
  onClose,
  pack
}: {
  onClose: () => void;
  pack: PackRowModel;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.packInfoCard} testID="pack-detail-panel">
      <View style={styles.sectionHeaderRow}>
        <View style={styles.packRowCopy}>
          <Text style={styles.sectionLabel}>{pack.title}</Text>
          <Text style={styles.helperText}>{pack.subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close pack details"
          testID="pack-detail-close"
          style={styles.packsIconButton}
          onPress={onClose}
        >
          <CloseGlyph />
        </Pressable>
      </View>
      <PackInfoRow label="Puzzles" value={pack.coverage.puzzles} testID="pack-detail-puzzles" />
      <PackInfoRow label="Rating" value={pack.coverage.rating} testID="pack-detail-rating" />
      <PackInfoRow label="Themes" value={pack.coverage.themes} testID="pack-detail-themes" />
      <PackInfoRow label="Arrow Duel" value={pack.coverage.arrowDuel} testID="pack-detail-arrow-duel" />
      <PackInfoRow label="Source" value={pack.source} testID="pack-detail-source" />
      <PackInfoRow label="Presolve" value={pack.presolveStatus} testID="pack-detail-presolve" />
      <PackInfoRow label="Manifest hash" value={pack.manifestHash} testID="pack-detail-manifest-hash" />
      <PackInfoRow label="Build date" value={pack.buildDate} testID="pack-detail-build-date" />
      <Text testID="pack-detail-license-notes" style={styles.packLicenseText}>
        License notes: {pack.licenseNote}
      </Text>
    </View>
  );
}

function PackInfoRow({
  detail,
  label,
  testID,
  value
}: {
  detail?: string;
  label: string;
  testID: string;
  value: string;
}): React.JSX.Element {
  const styles = useStyles();
  const accessibilityLabel = [label, value, detail].filter(Boolean).join(", ");
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={styles.packInfoRow}
      testID={testID}
    >
      <Text style={styles.helperText}>{label}</Text>
      <Text style={styles.listText}>{value}</Text>
      {detail ? (
        <View
          accessibilityLabel={detail}
          testID={`${testID}-detail`}
        />
      ) : null}
    </View>
  );
}

export function StockfishDiagnosticsPanel({
  stockfish
}: {
  stockfish: MobileStockfishCapabilities;
}): React.JSX.Element {
  const styles = useStyles();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runId, setRunId] = useState(0);
  const [status, setStatus] = useState("Starting");
  const [lines, setLines] = useState<EngineAnalysisLine[]>([]);
  const [commands, setCommands] = useState<string[]>([]);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [firstEvalMs, setFirstEvalMs] = useState<number | null>(null);
  const selectedPosition = ANALYSIS_DIAGNOSTIC_POSITIONS[selectedIndex] ?? ANALYSIS_DIAGNOSTIC_POSITIONS[0];

  useEffect(() => {
    const transport = stockfish.createTransport();
    let cancelled = false;
    let firstUpdateSeen = false;
    const analysisController = new AbortController();
    const startedAt = Date.now();

    setLines([]);
    setCommands([]);
    setRawLines([]);
    setFirstEvalMs(null);
    setStatus("Starting");

    if (!transport) {
      setStatus("Native Stockfish unavailable");
      return;
    }

    const tracedTransport: UciEngineTransport = {
      start: () => transport.start(),
      send: (command: string) => {
        if (!cancelled) {
          setCommands((current) => [...current.slice(-7), command]);
        }
        transport.send(command);
      },
      onLine: (listener: (line: string) => void) => transport.onLine((line) => {
        if (!cancelled) {
          setRawLines((current) => [...current.slice(-5), line]);
        }
        listener(line);
      }),
      terminate: () => transport.terminate()
    };

    void stockfish.prewarm().then((prewarmed) => {
      if (analysisController.signal.aborted) {
        return [];
      }
      return analyzeFenWithUciEngine(tracedTransport, selectedPosition.fen, {
        depth: ANALYSIS_DEPTH,
        initialize: !prewarmed,
        multiPv: 4,
        newGame: !prewarmed,
        onUpdate: (nextLines) => {
          if (cancelled) {
            return;
          }
          if (!firstUpdateSeen && nextLines.length > 0) {
            firstUpdateSeen = true;
            setFirstEvalMs(Date.now() - startedAt);
          }
          setLines(nextLines);
          const depth = nextLines.reduce((maxDepth, line) => Math.max(maxDepth, line.depth), 0);
          setStatus(depth > 0 ? `Depth ${depth}/${ANALYSIS_DEPTH}` : "Analyzing");
        },
        shallowDelayMs: 500,
        shallowDepth: 8,
        signal: analysisController.signal,
        timeoutMs: 30000
      });
    }).then(
      (finalLines) => {
        if (cancelled) {
          return;
        }
        setLines(finalLines);
        const depth = finalLines.reduce((maxDepth, line) => Math.max(maxDepth, line.depth), 0);
        setStatus(depth > 0 ? `Done · Depth ${depth}` : "No engine lines");
      },
      (caught) => {
        if (!cancelled) {
          setStatus(`Error · ${errorMessage(caught)}`);
        }
      }
    );

    return () => {
      cancelled = true;
      analysisController.abort();
    };
  }, [runId, selectedPosition, stockfish]);

  return (
    <View style={styles.listPanel} testID="stockfish-diagnostics-panel">
      <View style={styles.diagnosticHeader}>
        <View style={styles.diagnosticHeaderCopy}>
          <Text style={styles.panelTitle}>Stockfish Analysis</Text>
          <Text testID="stockfish-diagnostics-status" style={styles.helperText}>
            {firstEvalMs === null ? status : `${status} · first eval ${firstEvalMs}ms`}
          </Text>
        </View>
        <Button
          accessibilityLabel="Run Stockfish diagnostics"
          label="Run"
          size="compact"
          testID="stockfish-diagnostics-run"
          variant="secondary"
          onPress={() => setRunId((current) => current + 1)}
        />
      </View>

      <View style={styles.optionRow}>
        {ANALYSIS_DIAGNOSTIC_POSITIONS.map((position, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Analyze ${position.label}`}
            key={position.id}
            testID={`stockfish-diagnostics-position-${position.id}`}
            style={[styles.optionButton, index === selectedIndex ? styles.optionButtonActive : null]}
            onPress={() => {
              setSelectedIndex(index);
              setRunId((current) => current + 1);
            }}
          >
            <Text style={[styles.optionButtonText, index === selectedIndex ? styles.optionButtonTextActive : null]}>{position.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text testID="stockfish-diagnostics-fen" style={styles.diagnosticFen}>{selectedPosition.fen}</Text>

      <View style={styles.analysisPanel}>
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <View key={`${line.multipv}-${line.move}-${line.depth}`} style={styles.analysisLineRow} testID={`stockfish-diagnostics-line-${index}`}>
              <Text style={styles.analysisEvalText}>{formatWhitePerspectiveScore(line.score)}</Text>
              <Text style={styles.analysisMoveText} numberOfLines={1}>
                {line.multipv}. {sanForDiagnosticMove(selectedPosition.fen, line.move)}
              </Text>
              <Text style={styles.analysisLineLabel} numberOfLines={1}>d{line.depth}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.helperText}>Waiting for scored engine lines.</Text>
        )}
      </View>

      {lines.length > 0 ? (
        <View style={styles.diagnosticPvPanel}>
          {lines.map((line) => (
            <Text key={`${line.multipv}-${line.move}-pv`} style={styles.diagnosticPvText} testID={`stockfish-diagnostics-pv-${line.multipv}`}>
              {formatWhitePerspectiveScore(line.score)} · d{line.depth} · {line.multipv}. {diagnosticPvSan(selectedPosition.fen, line.pv)}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.diagnosticLogPanel}>
        <Text style={styles.helperText}>Commands</Text>
        <Text testID="stockfish-diagnostics-commands" style={styles.diagnosticLogText}>{commands.join("\n") || "none"}</Text>
        <Text style={styles.helperText}>Latest UCI lines</Text>
        <Text testID="stockfish-diagnostics-raw-lines" style={styles.diagnosticLogText}>{rawLines.join("\n") || "none"}</Text>
      </View>
    </View>
  );
}

function sanForDiagnosticMove(fen: string, move: string): string {
  try {
    const chess = new Chess(fen);
    const normalized = normalizeUci(move);
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    return played?.san ?? move;
  } catch {
    return move;
  }
}

function diagnosticPvSan(fen: string, pv: string[]): string {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];
  for (const move of pv.slice(0, 8)) {
    try {
      const normalized = normalizeUci(move);
      const played = chess.move({
        from: normalized.slice(0, 2),
        to: normalized.slice(2, 4),
        ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
      });
      if (!played) {
        break;
      }
      sanMoves.push(played.san);
    } catch {
      break;
    }
  }
  return sanMoves.join(" ") || pv.join(" ");
}

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["accessibleMoveModalBackdrop", "disabledButton", "feedbackHandoffActions", "feedbackHandoffConfirmation", "helperText", "historyHeaderRow", "listText", "optionButton", "optionButtonActive", "optionButtonText", "optionButtonTextActive", "optionRow", "reviewDueHiddenMetric", "sectionLabel", "settingsRowCopy", "settingsRowPressed", "settingsSection"]),
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  screenTitle: {
    color: theme.colors.text.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28
  },
  listPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 8
  },
  panelTitle: {
    color: theme.colors.text.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  analysisPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  analysisLineRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  analysisEvalText: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 12,
    fontWeight: "800",
    minWidth: 44
  },
  analysisMoveText: {
    color: theme.colors.text.ink,
    fontFamily: "Menlo",
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1
  },
  analysisLineLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: "auto"
  },
  diagnosticHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  diagnosticHeaderCopy: {
    flex: 1
  },
  diagnosticFen: {
    color: theme.colors.text.secondary,
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 16
  },
  diagnosticPvPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 10
  },
  diagnosticPvText: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 16
  },
  diagnosticLogPanel: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10
  },
  diagnosticLogText: {
    color: theme.colors.text.strong,
    fontFamily: "Menlo",
    fontSize: 10,
    lineHeight: 14
  },
  historyRowTitle: {
    color: theme.colors.text.heading,
    fontSize: 13,
    fontWeight: "800"
  },
  settingsPanel: {
    gap: theme.spacing.section
  },
  settingsPanelWide: {
    alignSelf: "center",
    columnGap: theme.spacing.screen,
    flexDirection: "row",
    flexWrap: "wrap",
    maxWidth: 980,
    width: "100%"
  },
  settingsSectionWide: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 300
  },
  settingsSectionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  settingsBlock: {
    gap: theme.spacing.row,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  settingsControlRow: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  settingsCaptionCentered: {
    textAlign: "center"
  },
  settingsEmphasis: {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.headline.fontWeight
  },
  feedbackSupportHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.row
  },
  settingsRow: {
    justifyContent: "space-between"
  },
  // Label and value share the first line; an explanation spans the full row
  // below them so long copy never runs in a narrow column.
  // When label and value do not fit side by side (large text, long values),
  // the value moves to its own line at the trailing edge instead of being
  // squeezed until it breaks mid-word.
  settingsRowTitleLine: {
    alignItems: "flex-start",
    columnGap: theme.spacing.row,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 2
  },
  settingsRowLabel: {
    flexShrink: 1
  },
  settingsRowValue: {
    flexShrink: 0,
    marginLeft: "auto",
    maxWidth: "100%",
    textAlign: "right"
  },
  settingsActionButtonRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  settingsActionButtonDetail: {
    flex: 1,
    minWidth: 200
  },
  settingsActionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.fill,
    borderRadius: theme.shape.control,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginLeft: "auto",
    minHeight: theme.metrics.minTarget,
    minWidth: 128,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  settingsActionButtonPressed: {
    opacity: 0.85
  },
  settingsActionButtonDisabled: {
    backgroundColor: theme.colors.fillDisabled
  },
  settingsActionButtonText: {
    textAlign: "center"
  },
  settingsDestructiveText: {
    color: theme.colors.danger.s600
  },
  reviewReminderPrompt: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent.s200,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    padding: 12
  },
  reviewReminderPromptCopy: {
    flex: 1,
    gap: 2,
    minWidth: 180
  },
  // Scrolls when large text makes the hand-off taller than the screen, so its
  // buttons stay reachable.
  feedbackHandoffCard: {
    flexGrow: 0,
    flexShrink: 1
  },
  feedbackHandoffContent: {
    gap: theme.spacing.row
  },
  confirmationActionsStacked: {
    flexDirection: "column",
    width: "100%"
  },
  confirmationActionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  advancedRatingsPanel: {
    gap: theme.spacing.row,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  advancedRatingRows: {
    borderTopColor: theme.colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  advancedRatingRow: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.row,
    justifyContent: "space-between",
    minHeight: theme.metrics.rowMinHeight,
    paddingVertical: 8
  },
  advancedRatingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 140
  },
  advancedRatingControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.group,
    marginLeft: "auto"
  },
  advancedRatingValue: {
    fontVariant: ["tabular-nums"],
    textAlign: "center"
  },
  settingsStepperButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderRadius: theme.shape.capsule,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    minWidth: theme.metrics.minTarget
  },
  settingsStatusText: {
    paddingHorizontal: 16
  },
  packsPanel: {
    gap: 12
  },
  packsIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  packRow: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  packRowCopy: {
    flex: 1,
    gap: 3
  },
  packTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  packCoverageCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  packCoverageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  packCoverageMetric: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 2,
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  packCoverageLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 9,
    fontWeight: "800"
  },
  packCoverageHiddenText: FABRIC_SAFE_HIDDEN_TEXT_STYLE,
  packRowMetaText: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  packCoverageMetricValue: {
    color: theme.colors.text.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  packActiveMark: {
    alignItems: "center",
    backgroundColor: theme.colors.positive.s600,
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    position: "relative",
    width: 28
  },
  packActiveGlyphLine: {
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    height: 2.5,
    position: "absolute"
  },
  packActiveGlyphShort: {
    left: 7,
    top: 15,
    transform: [{ rotate: "45deg" }],
    width: 7
  },
  packActiveGlyphLong: {
    right: 6,
    top: 13,
    transform: [{ rotate: "-48deg" }],
    width: 13
  },
  packActionColumn: {
    alignItems: "flex-end",
    gap: 8,
    justifyContent: "center"
  },
  packDetailButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  packInfoCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  packInfoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  packLicenseText: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17
  },
}));
