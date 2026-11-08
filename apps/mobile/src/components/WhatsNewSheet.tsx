import React, { useRef } from "react";
import { Modal, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles } from "../theme/makeStyles.ts";
import type { WhatsNewContent } from "../whatsNew/whatsNewContent.ts";
import { usePracticeViewport } from "./PracticeViewport.tsx";
import { SafeAreaModalBackdrop } from "./SafeAreaModalBackdrop.tsx";
import { AppText, Button, IconTile } from "./ui/index.tsx";

// The one-time What's New sheet (#651). A large title, three highlights with a
// tinted icon tile, and a primary Continue button. Compact windows anchor it to
// the bottom like a system sheet; regular and landscape windows center it with a
// readable maximum width. The highlights scroll under large text; the Continue
// button stays in view.

const REGULAR_WIDTH = 600;
// A phone in landscape: tighten the spacing so the three highlights fit without scrolling.
const SHORT_HEIGHT = 500;
const SHEET_MAX_WIDTH = 540;
const WINDOW_MARGIN = 8;
const CENTERED_MARGIN = 24;
// The title scales with large text, but only so far: at the largest accessibility
// sizes a single word such as "Chessticize" would otherwise break across lines.
const TITLE_MAX_FONT_MULTIPLIER = 1.35;
const HEADLINE_LINE_HEIGHT = 21;
const TILE_SIZE = 30;
const SHORT_MARGIN = 12;

const ALL_ORIENTATIONS: React.ComponentProps<typeof Modal>["supportedOrientations"] = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right"
];

export function WhatsNewSheet({
  content,
  onContinue,
  visible
}: {
  content: WhatsNewContent;
  onContinue: () => void;
  visible: boolean;
}): React.JSX.Element | null {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
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
  // Under large text the first headline line grows taller than the 30-pt tile; keep the tile on that line.
  const tileOffset = Math.max(0, Math.round((HEADLINE_LINE_HEIGHT * (fontScale ?? 1) - TILE_SIZE) / 2));

  return (
    <Modal
      animationType="fade"
      supportedOrientations={ALL_ORIENTATIONS}
      transparent
      visible
      onRequestClose={onContinue}
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
          testID="whats-new-sheet"
        >
          <ScrollView
            ref={scrollRef}
            // Hint that more highlights wait below when large text pushes them off screen.
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
            testID="whats-new-scroll"
          >
            <AppText
              accessibilityRole="header"
              maxFontSizeMultiplier={TITLE_MAX_FONT_MULTIPLIER}
              style={styles.title}
              testID="whats-new-title"
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
                  testID={`whats-new-highlight-${highlight.id}`}
                >
                  <View style={tileOffset > 0 ? { marginTop: tileOffset } : null}>
                    <IconTile name={highlight.icon} tone={highlight.tone} />
                  </View>
                  <View style={styles.highlightCopy}>
                    <AppText variant="headline">{highlight.headline}</AppText>
                    <AppText tone="secondary" variant="subheadline">{highlight.detail}</AppText>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={[styles.footer, short ? styles.footerShort : null]}>
            <Button
              label={content.continueLabel}
              stretch
              testID="whats-new-continue"
              onPress={onContinue}
            />
          </View>
        </View>
      </SafeAreaModalBackdrop>
    </Modal>
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
  scroll: {
    flexGrow: 0,
    flexShrink: 1
  },
  scrollContent: {
    gap: 28,
    paddingBottom: 8,
    paddingHorizontal: 28,
    paddingTop: 36
  },
  scrollContentShort: {
    gap: 16,
    paddingTop: 20
  },
  title: {
    textAlign: "center"
  },
  highlights: {
    gap: 20
  },
  highlightsShort: {
    gap: 14
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
  footer: {
    paddingBottom: 24,
    paddingHorizontal: 28,
    paddingTop: 20
  },
  footerShort: {
    paddingBottom: 16,
    paddingTop: 12
  }
}));
