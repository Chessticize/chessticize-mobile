import React, { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  importChessComGames,
  importLichessGames,
  type GameImportHttpClient
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type { LinkedGameAccountPlatform } from "../../../../packages/storage/src/game-review-store.ts";
import { createPublicGameImportClient } from "../platform/publicGameImportClient.ts";
import { makeStyles, useTheme } from "../theme/index.ts";
import { useTranslation } from "../i18n/index.ts";
import type { WelcomeOnboardingContent } from "../whatsNew/whatsNewContent.ts";
import { usePracticeViewport } from "./PracticeViewport.tsx";
import { SafeAreaModalBackdrop } from "./SafeAreaModalBackdrop.tsx";
import { AppModal } from "./AppModal.tsx";
import {
  AppText,
  Badge,
  Button,
  IconTile,
  SegmentedControl,
  type SegmentOption
} from "./ui/index.tsx";
import { gameImportErrorMessage, gamePlatformLabel } from "./games/gamesPresentation.ts";

// Two-step lightweight Welcome Onboarding for brand-new 2.0 installs:
//   Step 1: Value overview (import & review online games, offline tactics, play Maia)
//   Step 2: Optional one-step Chess.com / Lichess account link & recent-game import
// Both steps can be skipped in one tap.

const REGULAR_WIDTH = 600;
const SHORT_HEIGHT = 500;
const SHEET_MAX_WIDTH = 540;
const WINDOW_MARGIN = 8;
const CENTERED_MARGIN = 24;
const SHORT_MARGIN = 12;
const TITLE_MAX_FONT_MULTIPLIER = 1.35;
const HEADLINE_LINE_HEIGHT = 21;
const TILE_SIZE = 30;
const ONBOARDING_IMPORT_LIMIT = 25;

export type WelcomeOnboardingStep = "overview" | "link_account";

export interface WelcomeOnboardingSheetProps {
  content: WelcomeOnboardingContent;
  service: PracticeService;
  visible: boolean;
  initialStep?: WelcomeOnboardingStep;
  httpClient?: GameImportHttpClient;
  onComplete: () => void;
  onCompleteAndOpenGames: () => void;
  onStoreMutated?: () => void;
}

export function WelcomeOnboardingSheet({
  content,
  service,
  visible,
  initialStep = "overview",
  httpClient,
  onComplete,
  onCompleteAndOpenGames,
  onStoreMutated
}: WelcomeOnboardingSheetProps): React.JSX.Element | null {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t } = useTranslation();
  const { fontScale, height, width } = usePracticeViewport();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollViewHeight = useRef(0);

  const [step, setStep] = useState<WelcomeOnboardingStep>(initialStep);
  const [platform, setPlatform] = useState<LinkedGameAccountPlatform>("chess_com");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importedSummary, setImportedSummary] = useState<{
    platform: LinkedGameAccountPlatform;
    username: string;
    inserted: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (visible) {
      setStep(initialStep);
      setUsername("");
      setBusy(false);
      setErrorMessage(null);
      setImportedSummary(null);
    }
  }, [initialStep, visible]);

  if (!visible) {
    return null;
  }

  const centered = width >= REGULAR_WIDTH;
  const short = height < SHORT_HEIGHT;
  const margin = short ? SHORT_MARGIN : centered ? CENTERED_MARGIN : WINDOW_MARGIN;
  const maxHeight = Math.max(240, height - insets.top - insets.bottom - margin * 2);
  const tileOffset = Math.max(0, Math.round((HEADLINE_LINE_HEIGHT * (fontScale ?? 1) - TILE_SIZE) / 2));

  const platformOptions: readonly SegmentOption<LinkedGameAccountPlatform>[] = [
    {
      label: t("games.modal.sourceChessCom"),
      testID: "welcome-onboarding-platform-chess-com",
      value: "chess_com"
    },
    {
      label: t("games.modal.sourceLichess"),
      testID: "welcome-onboarding-platform-lichess",
      value: "lichess"
    }
  ];

  const handleImportAccount = async (): Promise<void> => {
    const trimmed = username.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const client = httpClient ?? createPublicGameImportClient();
      const drafts =
        platform === "chess_com"
          ? await importChessComGames(client, {
              username: trimmed,
              maxGames: ONBOARDING_IMPORT_LIMIT
            })
          : await importLichessGames(client, {
              username: trimmed,
              maxGames: ONBOARDING_IMPORT_LIMIT
            });
      const nowIso = new Date().toISOString();
      service.upsertLinkedAccount({
        platform,
        username: trimmed,
        lastSyncedAt: nowIso
      });
      const upsert = service.upsertImportedGames(drafts, nowIso);
      onStoreMutated?.();
      setImportedSummary({
        platform,
        username: trimmed,
        inserted: upsert.inserted,
        total: drafts.length
      });
    } catch (error) {
      setErrorMessage(gameImportErrorMessage(error, locale));
    } finally {
      setBusy(false);
    }
  };

  const stepNumber = step === "overview" ? 1 : 2;

  return (
    <AppModal
      animationType="fade"
      transparent
      visible
      onRequestClose={onComplete}
    >
      <SafeAreaModalBackdrop
        style={[
          styles.backdrop,
          { justifyContent: centered ? "center" : "flex-end", padding: margin }
        ]}
      >
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { maxHeight, maxWidth: SHEET_MAX_WIDTH }]}
          testID="welcome-onboarding-sheet"
        >
          <View style={[styles.topBar, short ? styles.topBarShort : null]}>
            <View style={styles.topBarLeading}>
              {step === "link_account" ? (
                <Button
                  label={t("common.back")}
                  size="compact"
                  testID="welcome-onboarding-back"
                  variant="plain"
                  onPress={() => {
                    setStep("overview");
                    setErrorMessage(null);
                  }}
                />
              ) : null}
            </View>
            <Badge
              label={t("onboarding.stepIndicator", { current: stepNumber, total: 2 })}
              testID="welcome-onboarding-step-badge"
              tone="neutral"
            />
            <View style={styles.topBarTrailing}>
              <Button
                label={t("onboarding.skip")}
                size="compact"
                testID="welcome-onboarding-skip"
                variant="plain"
                onPress={onComplete}
              />
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            onContentSizeChange={(_, contentHeight) => {
              if (contentHeight > scrollViewHeight.current + 1 && scrollViewHeight.current > 0) {
                scrollRef.current?.flashScrollIndicators?.();
              }
            }}
            onLayout={(event) => {
              scrollViewHeight.current = event.nativeEvent.layout.height;
            }}
            contentContainerStyle={[styles.scrollContent, short ? styles.scrollContentShort : null]}
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            testID="welcome-onboarding-scroll"
          >
            {step === "overview" ? (
              <>
                <AppText
                  accessibilityRole="header"
                  maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER}
                  style={styles.title}
                  testID="welcome-onboarding-title"
                  variant="largeTitle"
                >
                  {content.title}
                </AppText>
                <View style={[styles.highlights, short ? styles.highlightsShort : null]}>
                  {content.highlights.map((highlight) => (
                    <View
                      accessible
                      accessibilityLabel={`${highlight.headline}. ${highlight.detail}`}
                      key={highlight.id}
                      style={styles.highlight}
                      testID={`welcome-onboarding-highlight-${highlight.id}`}
                    >
                      <View style={tileOffset > 0 ? { marginTop: tileOffset } : null}>
                        <IconTile name={highlight.icon} tone={highlight.tone} />
                      </View>
                      <View style={styles.highlightCopy}>
                        <AppText variant="headline">{highlight.headline}</AppText>
                        <AppText tone="secondary" variant="subheadline">
                          {highlight.detail}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
                <AppText
                  style={styles.feedbackNote}
                  testID="welcome-onboarding-feedback-note"
                  tone="secondary"
                  variant="footnote"
                >
                  {content.feedbackNote}
                </AppText>
              </>
            ) : (
              <>
                <View style={styles.linkHeader}>
                  <IconTile name="tabGames" tone="accent" />
                  <AppText
                    accessibilityRole="header"
                    maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER}
                    style={styles.title}
                    testID="welcome-onboarding-link-title"
                    variant="largeTitle"
                  >
                    {t("onboarding.linkAccount.title")}
                  </AppText>
                  <AppText style={styles.privacyNote} tone="secondary" variant="subheadline">
                    {t("onboarding.linkAccount.privacyNote")}
                  </AppText>
                </View>

                <SegmentedControl
                  accessibilityLabel={t("games.modal.sourceA11y")}
                  options={platformOptions}
                  value={platform}
                  onChange={(next) => {
                    setPlatform(next);
                    setErrorMessage(null);
                  }}
                />

                <View style={styles.inputGroup}>
                  <TextInput
                    accessibilityLabel={t("games.modal.usernameLabel")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy && importedSummary === null}
                    placeholder={t("games.modal.usernamePlaceholder")}
                    placeholderTextColor={theme.colors.text.tertiary}
                    returnKeyType="go"
                    style={styles.textInput}
                    testID="welcome-onboarding-username"
                    value={username}
                    onChangeText={(next) => {
                      setUsername(next);
                      if (errorMessage) {
                        setErrorMessage(null);
                      }
                    }}
                    onSubmitEditing={() => {
                      void handleImportAccount();
                    }}
                  />
                </View>

                {errorMessage ? (
                  <View
                    accessibilityLiveRegion="polite"
                    style={styles.errorBanner}
                    testID="welcome-onboarding-error"
                  >
                    <AppText style={styles.errorText} variant="footnote">
                      {errorMessage}
                    </AppText>
                  </View>
                ) : null}

                {importedSummary ? (
                  <View
                    accessibilityLiveRegion="polite"
                    style={styles.successBanner}
                    testID="welcome-onboarding-success"
                  >
                    <AppText style={styles.successText} variant="subheadline">
                      {t("onboarding.linkAccount.importedSummary", {
                        count: importedSummary.inserted,
                        platform: gamePlatformLabel(importedSummary.platform, locale),
                        username: importedSummary.username
                      })}
                    </AppText>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, short ? styles.footerShort : null]}>
            {step === "overview" ? (
              <>
                <Button
                  label={content.linkAccountActionLabel}
                  stretch
                  testID="welcome-onboarding-next"
                  onPress={() => setStep("link_account")}
                />
                <Button
                  label={content.startPracticingLabel}
                  stretch
                  testID="welcome-onboarding-start-practicing"
                  variant="plain"
                  onPress={onComplete}
                />
              </>
            ) : importedSummary ? (
              <>
                <Button
                  label={t("onboarding.linkAccount.reviewGames")}
                  stretch
                  testID="welcome-onboarding-open-games"
                  onPress={onCompleteAndOpenGames}
                />
                <Button
                  label={t("onboarding.linkAccount.goToPractice")}
                  stretch
                  testID="welcome-onboarding-finish-practice"
                  variant="plain"
                  onPress={onComplete}
                />
              </>
            ) : (
              <>
                <Button
                  disabled={busy || username.trim().length === 0}
                  label={
                    busy
                      ? t("games.action.syncing")
                      : t("onboarding.linkAccount.importAction")
                  }
                  stretch
                  testID="welcome-onboarding-import-submit"
                  onPress={() => {
                    void handleImportAccount();
                  }}
                />
                <Button
                  label={t("onboarding.linkAccount.skipForNow")}
                  stretch
                  testID="welcome-onboarding-skip-account"
                  variant="plain"
                  onPress={onComplete}
                />
              </>
            )}
          </View>
        </View>
      </SafeAreaModalBackdrop>
    </AppModal>
  );
}

const useStyles = makeStyles((theme) => ({
  backdrop: {
    alignItems: "center",
    backgroundColor: theme.colors.scrimSoft,
    flex: 1
  },
  sheet: {
    backgroundColor: theme.colors.surfaceFloating,
    borderRadius: theme.shape.sheet,
    overflow: "hidden",
    width: "100%"
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14
  },
  topBarShort: {
    paddingTop: 8
  },
  topBarLeading: {
    alignItems: "flex-start",
    minWidth: 68
  },
  topBarTrailing: {
    alignItems: "flex-end",
    minWidth: 68
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1
  },
  scrollContent: {
    gap: 20,
    paddingBottom: 8,
    paddingHorizontal: 28,
    paddingTop: 12
  },
  scrollContentShort: {
    gap: 12,
    paddingTop: 8
  },
  title: {
    textAlign: "center"
  },
  highlights: {
    gap: 18
  },
  highlightsShort: {
    gap: 12
  },
  highlight: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14
  },
  highlightCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  linkHeader: {
    alignItems: "center",
    gap: 10
  },
  privacyNote: {
    textAlign: "center"
  },
  feedbackNote: {
    textAlign: "center"
  },
  inputGroup: {
    gap: 8
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radius[10],
    borderWidth: 1,
    color: theme.colors.text.primary,
    fontSize: theme.fontSize[16],
    minHeight: 46,
    paddingHorizontal: theme.space[14],
    paddingVertical: theme.space[10]
  },
  errorBanner: {
    backgroundColor: theme.colors.danger.s100,
    borderRadius: theme.radius[10],
    padding: theme.space[12]
  },
  errorText: {
    color: theme.colors.danger.s600
  },
  successBanner: {
    backgroundColor: theme.colors.positive.s100,
    borderRadius: theme.radius[10],
    padding: theme.space[12]
  },
  successText: {
    color: theme.colors.positive.s600,
    fontWeight: theme.fontWeight.semibold
  },
  footer: {
    gap: 8,
    paddingBottom: 22,
    paddingHorizontal: 28,
    paddingTop: 16
  },
  footerShort: {
    gap: 4,
    paddingBottom: 14,
    paddingTop: 10
  }
}));
