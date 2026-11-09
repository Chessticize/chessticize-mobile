// Survival result, direction A "Grouped Native" (Issue #609). The sibling of
// the Sprint Result on the same full-screen frame (ResultScreenLayout): a top
// bar with Back, a centered hero, one stats card, the level and In Review
// rows, and the actions. A new best uses the product blue with the shared
// monochrome trophy; every other result stays neutral (Survival contract in
// docs/ui-design/SURVIVAL_CHALLENGE.md). It renders only; PracticePocScreen
// owns the session and every action, and survivalResultPresentation.ts owns
// the copy.

import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles } from "../theme/makeStyles.ts";
import { useTheme } from "../theme/ThemeProvider.ts";
import { ResultTrophyGlyph } from "./ResultTrophyGlyph.tsx";
import {
  RESULT_CAPPED_SCALE,
  ResultHeroFrame,
  ResultOutcomeLine,
  ResultProgressTrack,
  ResultScreenLayout,
  ResultStatsCard,
  ResultStatusGlyph,
  ResultSummaryLine,
  type ResultInsets
} from "./ResultScreenLayout.tsx";
import { useUiHapticOnAppear } from "../platform/uiHaptics.ts";
import {
  presentSurvivalResult,
  survivalResultHapticIntent,
  type SurvivalResultData,
  type SurvivalResultPresentation
} from "./survivalResultPresentation.ts";
import { AppText, Button, Icon, ListRow, Section } from "./ui/index.tsx";

// Stat and row numerals grow at most 2x, like the Sprint Result stats.
const NUMERAL_MAX_SCALE = 2;

const STAT_TEST_IDS: Record<string, string> = {
  sittings: "personal-best-result-sittings",
  streak: "personal-best-result-best-streak",
  time: "personal-best-result-active-time"
};

export function SurvivalResultScreen({
  data,
  notice,
  onBack,
  onDone,
  onPlayAgain,
  onReplayMistakes,
  paddingInsets,
  style
}: {
  data: SurvivalResultData;
  /** Shown above the hero, for example an error. */
  notice?: React.ReactNode;
  /** The top-left Back control; returns to Practice Home. */
  onBack: () => void;
  /** The bottom Done action; also returns to Practice Home. */
  onDone: () => void;
  onPlayAgain: () => void;
  /** Opens Replay; omitted when the Run left nothing to replay. */
  onReplayMistakes?: (() => void) | undefined;
  /** Insets to pad by. Defaults to the safe area; pass zero when the parent pads. */
  paddingInsets?: ResultInsets | undefined;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const result = presentSurvivalResult(data);
  useUiHapticOnAppear(survivalResultHapticIntent(data));
  return (
    <ResultScreenLayout
      actions={(
        <>
          {onReplayMistakes ? (
            <Button
              label={result.replayMistakesLabel}
              stretch
              testID="personal-best-result-replay"
              variant="secondary"
              onPress={onReplayMistakes}
            />
          ) : null}
          <Button
            accessibilityLabel="Play the same Survival Run again"
            label="Play again"
            stretch
            testID="personal-best-result-try-again"
            onPress={onPlayAgain}
          />
          <Button
            label="Done"
            stretch
            testID="personal-best-result-done"
            variant="plain"
            onPress={onDone}
          />
        </>
      )}
      backAccessibilityLabel="Back to Practice"
      backTestID="personal-best-result-back"
      renderDetails={({ statsLayout }) => (
        <>
          <ResultStatsCard
            columns={result.stats}
            layout={statsLayout}
            testID="personal-best-result-stats"
            testIDs={STAT_TEST_IDS}
          />
          <DetailRows result={result} />
        </>
      )}
      renderHero={({ fontScale, stacked }) => <SurvivalHero fontScale={fontScale} result={result} stacked={stacked} />}
      notice={notice}
      paddingInsets={paddingInsets}
      stats={result.stats}
      onBack={onBack}
      style={style}
      testID="personal-best-result"
      testIDPrefix="personal-best-result"
      title={result.title}
    />
  );
}

function SurvivalHero({
  fontScale,
  result,
  stacked
}: {
  fontScale: number;
  result: SurvivalResultPresentation;
  stacked: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const isBest = result.tone === "best";
  return (
    <ResultHeroFrame testID="personal-best-result-hero">
      <ResultOutcomeLine
        accessibilityLabel={result.outcomeLabel}
        glyph={(
          <ResultStatusGlyph
            backgroundColor={isBest ? theme.colors.accent.s100 : theme.colors.surfaceStrong}
            fontScale={fontScale}
            testID="personal-best-result-badge"
          >
            {(size) => isBest ? (
              // The same monochrome trophy as the in-Run NEW BEST milestone.
              <ResultTrophyGlyph size={Math.round(size * 1.25)} testID="personal-best-result-trophy" />
            ) : (
              <Icon color={theme.colors.text.tertiary} name="check" size={size} weight="bold" />
            )}
          </ResultStatusGlyph>
        )}
        parts={[result.outcomeDisplay]}
        stacked={stacked}
        testIDPrefix="personal-best-result"
      />
      <AppText
        accessibilityLabel={result.scoreAccessibilityLabel}
        maxFontSizeMultiplier={RESULT_CAPPED_SCALE}
        style={styles.centeredText}
        testID="personal-best-result-score"
        tone={isBest ? "accent" : "primary"}
        variant="display"
      >
        {result.scoreLabel}
      </AppText>
      {result.progressTowardBest === null ? null : (
        <ResultProgressTrack
          color={theme.colors.text.tertiary}
          progress={result.progressTowardBest}
          testID="personal-best-result-progress"
        />
      )}
      <AppText
        style={styles.centeredText}
        testID="personal-best-result-comparison"
        tone={isBest ? "accent" : "secondary"}
        variant="subheadline"
      >
        {result.comparison}
      </AppText>
      <ResultSummaryLine parts={result.summaryParts} stacked={stacked} testID="personal-best-result-summary" />
      {result.endReasonLines.length > 0 ? (
        <View testID="personal-best-result-end-reason">
          {result.endReasonLines.map((line) => (
            <AppText key={line} style={styles.centeredText} tone="secondary" variant="footnote">{line}</AppText>
          ))}
        </View>
      ) : null}
    </ResultHeroFrame>
  );
}

function DetailRows({ result }: { result: SurvivalResultPresentation }): React.JSX.Element {
  const review = result.review;
  return (
    <Section rows testID="personal-best-result-details">
      <ListRow
        accessibilityLabel={result.levelTitle}
        testID="personal-best-result-level"
        title={result.levelTitleDisplay}
      />
      {review ? (
        // The neutral In Review row; only its count is red (Survival contract).
        <ListRow
          accessibilityLabel={review.accessibilityLabel}
          testID="personal-best-result-review"
          title="In Review"
          trailing={(
            <AppText
              maxFontSizeMultiplier={NUMERAL_MAX_SCALE}
              numberOfLines={1}
              testID="personal-best-result-review-count"
              tone="negative"
              variant="numeral"
            >
              {String(review.count)}
            </AppText>
          )}
        />
      ) : null}
    </Section>
  );
}

const useStyles = makeStyles(() => ({
  centeredText: {
    textAlign: "center"
  }
}));
