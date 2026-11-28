import React, { useRef } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles } from "../theme/index.ts";
import { useTranslation } from "../i18n/index.ts";
import type { WelcomeOnboardingContent } from "../whatsNew/whatsNewContent.ts";
import { usePracticeViewport } from "./PracticeViewport.tsx";
import { SafeAreaModalBackdrop } from "./SafeAreaModalBackdrop.tsx";
import { AppModal } from "./AppModal.tsx";
import { AppText, Button, IconTile } from "./ui/index.tsx";

// Lightweight Welcome Onboarding sheet for brand-new 2.0 installs:
// introduces the new Games tab (link Chess.com / Lichess, offline Game Review,
// and personal puzzles), offline tactics, and Maia early preview, then lets the
// user jump straight into Games or start practicing on Home.

const REGULAR_WIDTH = 600;
const SHORT_HEIGHT = 500;
const SHEET_MAX_WIDTH = 540;
const WINDOW_MARGIN = 8;
const CENTERED_MARGIN = 24;
const SHORT_MARGIN = 12;
const TITLE_MAX_FONT_MULTIPLIER = 1.35;
const HEADLINE_LINE_HEIGHT = 21;
const TILE_SIZE = 30;

export interface WelcomeOnboardingSheetProps {
  content: WelcomeOnboardingContent;
  visible: boolean;
  onComplete: () => void;
  onOpenGames: () => void;
}

export function WelcomeOnboardingSheet({
  content,
  visible,
  onComplete,
  onOpenGames
}: WelcomeOnboardingSheetProps): React.JSX.Element | null {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { fontScale, height, width } = usePracticeViewport();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollViewHeight = useRef(0);

  if (!visible) {
    return null;
  }

  const centered = width >= REGULAR_WIDTH;
  const short = height < SHORT_HEIGHT;
  const margin = short ? SHORT_MARGIN : centered ? CENTERED_MARGIN : WINDOW_MARGIN;
  const maxHeight = Math.max(240, height - insets.top - insets.bottom - margin * 2);
  const tileOffset = Math.max(0, Math.round((HEADLINE_LINE_HEIGHT * (fontScale ?? 1) - TILE_SIZE) / 2));

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
            <Button
              label={t("onboarding.skip")}
              size="compact"
              testID="welcome-onboarding-skip"
              variant="plain"
              onPress={onComplete}
            />
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
            style={styles.scroll}
            testID="welcome-onboarding-scroll"
          >
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
          </ScrollView>

          <View style={[styles.footer, short ? styles.footerShort : null]}>
            <Button
              label={content.openGamesActionLabel}
              stretch
              testID="welcome-onboarding-open-games"
              onPress={onOpenGames}
            />
            <Button
              label={content.startPracticingLabel}
              stretch
              testID="welcome-onboarding-start-practicing"
              variant="plain"
              onPress={onComplete}
            />
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
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12
  },
  topBarShort: {
    paddingTop: 6
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1
  },
  scrollContent: {
    gap: 18,
    paddingBottom: 8,
    paddingHorizontal: 28,
    paddingTop: 6
  },
  scrollContentShort: {
    gap: 12,
    paddingTop: 4
  },
  title: {
    textAlign: "center"
  },
  highlights: {
    gap: 16
  },
  highlightsShort: {
    gap: 10
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
  feedbackNote: {
    textAlign: "center"
  },
  footer: {
    gap: 8,
    paddingBottom: 18,
    paddingHorizontal: 28,
    paddingTop: 12
  },
  footerShort: {
    gap: 4,
    paddingBottom: 12,
    paddingTop: 8
  }
}));
