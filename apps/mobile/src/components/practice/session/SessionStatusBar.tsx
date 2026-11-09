import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatCompactDuration, modeLabel, STACKED_ACTIONS_FONT_SCALE } from "../shared/practiceUtils.ts";
import type { SprintMode, SprintState } from "../../../../../../packages/core/src/index.ts";
import type { PersonalBestChallengeDesignPreview } from "../../PersonalBestChallengeDesign.tsx";
import { usePracticeViewport } from "../../PracticeViewport.tsx";
import { typography as baseTypography } from "../../../theme/scales.ts";
import { SessionMistakeIndicator } from "../../SessionMistakeIndicator.tsx";
import { CloseGlyph, MoreGlyph, PauseGlyph, PlayGlyph, SessionScoreGlyph } from "../shared/Glyphs.tsx";
import { PRACTICE_PUZZLE_TIMING_MAX_TEXT_SCALE, PRACTICE_SESSION_HUD_MAX_TEXT_SCALE } from "../../adaptivePracticeLayout.ts";
import { makeStyles } from "../../../theme/index.ts";
import { pickPracticeStyles } from "../shared/practiceStyles.tsx";
import { Button } from "../../ui/index.tsx";

export type SessionTimingState = {
  elapsedSeconds: number;
  phase: "normal" | "slow" | "timed_out";
};

export function PuzzleTimingIndicator({
  elapsedSeconds,
  onTargetLayout,
  phase,
  targetRef,
  timeoutSeconds
}: {
  elapsedSeconds: number;
  onTargetLayout?: () => void;
  phase: SessionTimingState["phase"];
  targetRef?: React.RefObject<View | null>;
  timeoutSeconds: number | null;
}): React.JSX.Element {
  const styles = useStyles();
  const label = `Puzzle ${formatCompactDuration(elapsedSeconds)}`;
  const remainingSeconds = timeoutSeconds === null ? null : timeoutSeconds - elapsedSeconds;
  const countdownSeconds = phase !== "timed_out"
    && remainingSeconds !== null
    && remainingSeconds <= 10
    ? Math.max(remainingSeconds, 1)
    : null;
  const accessibilityLabel = countdownSeconds === null
    ? label
    : `${label}, ${countdownSeconds} seconds until timeout`;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      collapsable={targetRef ? false : undefined}
      ref={targetRef}
      style={[
        styles.puzzleTimingIndicator,
        phase !== "normal" ? styles.puzzleTimingIndicatorSlow : null,
        styles.puzzleTimingIndicatorStandalone
      ]}
      testID="session-puzzle-timing"
      onLayout={onTargetLayout}
    >
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={PUZZLE_TIMING_MAX_TEXT_SCALE}
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[
          styles.puzzleTimingIndicatorText,
          phase !== "normal" ? styles.puzzleTimingIndicatorTextSlow : null
        ]}
        testID="session-puzzle-timing-label"
      >
        {label}
      </Text>
      {countdownSeconds === null ? null : (
        <Text
          accessibilityElementsHidden
          maxFontSizeMultiplier={PUZZLE_TIMING_MAX_TEXT_SCALE}
          style={styles.puzzleTimingCountdown}
          testID="session-puzzle-countdown"
        >
          {countdownSeconds}s
        </Text>
      )}
    </View>
  );
}

// An estimate of a HUD value's advance width per character, in ems: tabular
// digits and the letters of "Unrated" are about 0.6 em, and spaces and the
// slash are narrower.
const HUD_VALUE_EM_PER_CHARACTER = 0.6;

const HUD_METRIC_GAP = 6;

// Survival's mistakes block keeps this width beside the solved count.
const PERSONAL_BEST_MISTAKES_BLOCK_WIDTH = 64;

// One text size for the HUD values that share a line: the system text scale
// up to the HUD cap, reduced to what the longest value fits in its slot but
// never below the default size (shrink-to-fit handles the rest). The size is
// computed from the base type role, so the HUD reads the same in the Lab.
function hudValueTextSize({
  fontScale,
  role,
  slotWidth,
  texts
}: {
  fontScale: number;
  role: { fontSize: number; lineHeight: number };
  slotWidth: number | null;
  texts: Array<string | null>;
}): { fontSize: number; lineHeight: number } {
  let scale = Math.min(fontScale, HUD_MAX_TEXT_SCALE);
  const longest = Math.max(0, ...texts.map((text) => text?.length ?? 0));
  if (scale > 1 && slotWidth !== null && longest > 0) {
    const fittingScale = slotWidth / (longest * HUD_VALUE_EM_PER_CHARACTER * role.fontSize);
    scale = Math.max(1, Math.min(scale, fittingScale));
  }
  return {
    fontSize: Math.round(role.fontSize * scale * 10) / 10,
    lineHeight: Math.ceil(role.lineHeight * scale)
  };
}

export function SessionStatusBar({
  closeAccessibilityLabel = "Abandon sprint",
  compactMetrics = false,
  confirmAbandon,
  leaveConfirmationMinHeight,
  metricsRef,
  mode,
  stackLeaveConfirmation = false,
  personalBest,
  state,
  timerText,
  onAbandon,
  onClose,
  onConfirmAbandonChange,
  onMetricsLayout,
  onPauseAndLeave,
  onPause,
  onResume
}: {
  closeAccessibilityLabel?: string;
  compactMetrics?: boolean;
  confirmAbandon: boolean;
  // The confirmation floats in the prompt card's slot; at least that tall, it
  // covers the card instead of leaving a sliver of it showing beneath.
  leaveConfirmationMinHeight?: number;
  metricsRef?: React.RefObject<View | null>;
  stackLeaveConfirmation?: boolean;
  mode: SprintMode;
  personalBest?: PersonalBestChallengeDesignPreview;
  state: SprintState;
  timerText: string;
  onAbandon?: () => void;
  onClose?: () => void;
  onConfirmAbandonChange: (visible: boolean) => void;
  onMetricsLayout?: () => void;
  onPauseAndLeave?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const isPersonalBest = personalBest !== undefined;
  const previousSurvivalBest = personalBest?.bestScore;
  const hasNewSurvivalBest = isPersonalBest
    && state.correctCount >= 1
    && (previousSurvivalBest === null || state.correctCount > (previousSurvivalBest ?? -1));
  const savedSurvivalBest = Math.max(state.correctCount, previousSurvivalBest ?? 0);
  const completedAttempts = state.correctCount + state.mistakeCount;
  const plannedAttempts = state.config.maxAttempts ?? state.config.targetCorrect;
  const showsSessionHeaderAction = Boolean(onClose || onAbandon)
    && !(isPersonalBest && confirmAbandon);
  // HUD values never truncate at large text (#652). At accessibility sizes in
  // the narrow rail, the timer takes its own line above the other metrics; the
  // full-width phone and iPad row keeps all three on one line so a short phone
  // keeps room for the board. Values that share a line share one size, as
  // large as their slots allow up to the HUD cap, and shrink to fit as a
  // safety net.
  const { fontScale, height: viewportHeight } = usePracticeViewport();
  const insets = useSafeAreaInsets();
  const shellRef = useRef<View>(null);
  const [confirmationMaxHeight, setConfirmationMaxHeight] = useState<number | null>(null);
  const measureConfirmationSpace = useCallback(() => {
    if (state.status === "paused" || isPersonalBest) return;
    shellRef.current?.measureInWindow((_x, y, _width, height) => {
      // Keep the active board and HUD stationary. A tall confirmation scrolls
      // inside the space below the HUD, above the bottom safe area.
      const available = Math.max(1, Math.floor(viewportHeight - insets.bottom - y - height - 8));
      setConfirmationMaxHeight((current) => current === available ? current : available);
    });
  }, [insets.bottom, isPersonalBest, state.status, viewportHeight]);
  useLayoutEffect(() => {
    measureConfirmationSpace();
  }, [confirmAbandon, fontScale, measureConfirmationSpace]);
  const stacksTimer = compactMetrics && fontScale >= HUD_LARGE_TEXT_FONT_SCALE;
  // At large text the leave sheets stack their buttons full width, and the
  // abandon confirmation stacks its copy above them.
  const stacksLeaveActions = fontScale >= STACKED_ACTIONS_FONT_SCALE;
  const stacksLeaveConfirmation = stackLeaveConfirmation || stacksLeaveActions;
  const [metricsWidth, setMetricsWidth] = useState<number | null>(null);
  const progressText = isPersonalBest
    ? `${state.correctCount} solved`
    : isTacticalFocus
    ? `${completedAttempts} / ${plannedAttempts}`
    : `${state.correctCount} / ${state.config.targetCorrect}`;
  const policyText = isTacticalFocus ? "Unrated" : null;
  const hudValueRole = compactMetrics ? baseTypography.numeralRow : baseTypography.numeral;
  const sharedValueTexts = stacksTimer
    ? [progressText, policyText]
    : [progressText, isPersonalBest ? null : timerText, policyText];
  const slotWidth = (slotCount: number): number | null => metricsWidth === null
    ? null
    : (metricsWidth - HUD_METRIC_GAP * (slotCount - 1)) / slotCount;
  const sharedValueStyle = hudValueTextSize({
    fontScale,
    role: hudValueRole,
    slotWidth: isPersonalBest
      ? metricsWidth === null
        ? null
        : metricsWidth - HUD_METRIC_GAP - PERSONAL_BEST_MISTAKES_BLOCK_WIDTH
      : slotWidth(stacksTimer ? 2 : 3),
    texts: sharedValueTexts
  });
  const timerValueStyle = stacksTimer
    ? hudValueTextSize({ fontScale, role: hudValueRole, slotWidth: slotWidth(1), texts: [timerText] })
    : sharedValueStyle;
  const progressMetric = (
    <View
      accessibilityLabel={isPersonalBest
        ? `Solved ${state.correctCount}`
        : isTacticalFocus
        ? `Puzzles ${completedAttempts} of ${plannedAttempts}`
        : `Progress ${state.correctCount} of ${state.config.targetCorrect}`}
      style={[
        styles.sessionMetricBlock,
        isPersonalBest ? styles.personalBestProgressMetricBlock : null
      ]}
      testID="session-progress-block"
    >
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.5}
        numberOfLines={1}
        testID="session-progress"
        style={[
          styles.sessionProgressValue,
          styles.sessionMetricValueFill,
          styles.sessionMetricValueLeading,
          compactMetrics ? styles.sessionMetricTextCompact : null,
          sharedValueStyle
        ]}
      >
        {progressText}
      </Text>
    </View>
  );
  const timerMetric = isPersonalBest ? null : (
    <View
      accessibilityLabel={state.config.runClock === "untimed" ? `Elapsed ${timerText}` : `Timer ${timerText}`}
      style={[styles.sessionMetricBlock, stacksTimer ? styles.sessionMetricBlockFullRow : null]}
      testID="session-timer-block"
    >
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.5}
        numberOfLines={1}
        testID="session-timer"
        style={[
          styles.timerText,
          styles.sessionMetricValueFill,
          compactMetrics ? styles.sessionMetricTextCompact : null,
          timerValueStyle
        ]}
      >
        {timerText}
      </Text>
    </View>
  );
  const policyMetric = isTacticalFocus ? (
    <View
      accessibilityLabel="Rating unchanged"
      style={styles.sessionMetricBlock}
      testID="session-rating-policy"
    >
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.5}
        numberOfLines={1}
        style={[
          styles.timerText,
          styles.sessionMetricValueFill,
          styles.sessionMetricValueTrailing,
          compactMetrics ? styles.sessionMetricTextCompact : null,
          sharedValueStyle
        ]}
      >
        Unrated
      </Text>
    </View>
  ) : (
    <View
      accessibilityLabel={`Mistakes ${state.mistakeCount} of ${state.config.maxMistakes}`}
      style={[
        styles.sessionMetricBlock,
        styles.sessionMetricBlockTrailing,
        isPersonalBest ? styles.personalBestMistakesMetricBlock : null
      ]}
      testID="session-mistakes-block"
    >
      <SessionMistakeIndicator
        count={state.mistakeCount}
        max={state.config.maxMistakes}
      />
    </View>
  );
  const abandonConfirmationContent = (
    <>
      <View
        style={[
          styles.sessionAbandonCopy,
          stacksLeaveConfirmation ? styles.sessionAbandonCopyStacked : null
        ]}
      >
        <Text style={styles.listText} testID="session-abandon-title">
          {isTacticalFocus ? "Abandon Focused Run?" : "Abandon sprint?"}
        </Text>
        <Text style={styles.helperText} testID="session-abandon-description">
          {isTacticalFocus
            ? "This ends the Focused Run. Completed puzzles stay in History and your Rating stays unchanged."
            : "This ends the Sprint and records it as abandoned."}
        </Text>
      </View>
      <View
        style={[
          styles.sessionAbandonActions,
          stacksLeaveConfirmation ? styles.sessionAbandonActionsStacked : null,
          stacksLeaveActions ? styles.leaveActionsStacked : null
        ]}
      >
        <Button
          accessibilityLabel={isTacticalFocus
            ? "Cancel abandoning Focused Run"
            : "Cancel abandon sprint"}
          label="Cancel"
          size="compact"
          stretch={stacksLeaveActions}
          testID="session-abandon-cancel"
          variant="secondary"
          onPress={() => onConfirmAbandonChange(false)}
        />
        <Button
          accessibilityLabel={isTacticalFocus
            ? "Confirm abandoning Focused Run"
            : "Confirm abandon sprint"}
          label="Abandon"
          size="compact"
          stretch={stacksLeaveActions}
          testID="session-abandon-confirm"
          variant="destructive"
          onPress={() => {
            onConfirmAbandonChange(false);
            onAbandon?.();
          }}
        />
      </View>
    </>
  );
  return (
    <View
      collapsable={false}
      ref={shellRef}
      onLayout={measureConfirmationSpace}
      style={[
        styles.activeSessionShell,
        confirmAbandon ? styles.activeSessionShellRaised : null
      ]}
      testID="active-session-shell"
    >
      <View style={styles.sessionNavRow} testID="session-shell-nav">
        {showsSessionHeaderAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            testID="session-abandon"
            style={styles.sessionNavButton}
            onPress={onClose ?? (() => onConfirmAbandonChange(true))}
          >
            {isPersonalBest ? <PauseGlyph /> : <CloseGlyph />}
          </Pressable>
        ) : (
          <View style={styles.sessionNavButton} />
        )}
        <Text
          adjustsFontSizeToFit
          // iOS keeps a shrink-to-fit title's old size after a Dynamic Type
          // change; a new key measures it again at the new size.
          key={`session-title-${fontScale}`}
          maxFontSizeMultiplier={HUD_MAX_TEXT_SCALE}
          minimumFontScale={0.5}
          numberOfLines={1}
          style={styles.sessionNavTitle}
        >
          {isPersonalBest ? "Survival" : isTacticalFocus ? "Focused Run" : modeLabel(mode)}
        </Text>
        <View style={styles.sessionNavActions} testID="session-nav-actions">
          {isPersonalBest ? (
            <View style={styles.sessionNavButton} />
          ) : onPause ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTacticalFocus ? "Pause Focused Run" : "Pause sprint"}
              testID="session-pause"
              style={styles.sessionNavButton}
              onPress={onPause}
            >
              <PauseGlyph />
            </Pressable>
          ) : onResume ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTacticalFocus ? "Resume Focused Run" : "Resume sprint"}
              testID="session-resume"
              style={styles.sessionNavButton}
              onPress={onResume}
            >
              <PlayGlyph />
            </Pressable>
          ) : (
            <View style={styles.sessionNavButton} testID="session-overflow">
              <MoreGlyph />
            </View>
          )}
        </View>
      </View>

      <View
        collapsable={metricsRef ? false : undefined}
        ref={metricsRef}
        style={[
          styles.sessionActiveMetricRow,
          compactMetrics ? styles.sessionActiveMetricRowCompact : null,
          stacksTimer ? styles.sessionActiveMetricRowLargeText : null
        ]}
        testID="session-status-metrics"
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          setMetricsWidth((current) => current === width ? current : width);
          onMetricsLayout?.();
        }}
      >
        {stacksTimer ? (
          <>
            {timerMetric}
            <View style={styles.sessionMetricLargeTextRow}>
              {progressMetric}
              {policyMetric}
            </View>
          </>
        ) : (
          <>
            {progressMetric}
            {timerMetric}
            {policyMetric}
          </>
        )}
      </View>

      {/* The leave confirmation floats over the prompt card below the HUD
          instead of growing the session stack, so the counts and board never
          move into the bottom inset while it is open, at any width. */}
      {confirmAbandon && isPersonalBest ? (
        <View
          style={[styles.sessionLeaveConfirmationOverlay, styles.survivalExitSheet]}
          testID="session-abandon-confirmation"
        >
          <View style={styles.sessionAbandonCopy}>
            <Text style={styles.survivalExitTitle}>Survival paused</Text>
            <Text style={styles.survivalExitBest} testID="personal-best-exit-best">
              {hasNewSurvivalBest
                ? `New best ${savedSurvivalBest} · already saved`
                : previousSurvivalBest === null
                  ? "No best yet · solve 1 to set it"
                : `Best ${savedSurvivalBest} · saved`}
            </Text>
            <Text style={styles.helperText}>
              Your puzzle is hidden. Resume here, or leave it paused and continue any time.
            </Text>
          </View>
          <View
            style={[
              styles.survivalExitPrimaryActions,
              stacksLeaveActions ? styles.leaveActionsStacked : null
            ]}
          >
            <Button
              accessibilityLabel="Leave Survival paused"
              label="Leave paused"
              size="compact"
              stretch={stacksLeaveActions}
              style={stacksLeaveActions ? null : styles.survivalExitAction}
              testID="personal-best-pause-and-leave"
              variant="secondary"
              onPress={() => {
                onConfirmAbandonChange(false);
                onPauseAndLeave?.();
              }}
            />
            <Button
              accessibilityLabel="Resume Survival"
              label="Resume"
              size="compact"
              stretch={stacksLeaveActions}
              style={stacksLeaveActions ? null : styles.survivalExitAction}
              testID="session-abandon-cancel"
              onPress={() => {
                onResume?.();
                onConfirmAbandonChange(false);
              }}
            />
          </View>
        </View>
      ) : confirmAbandon ? (
        <View
          style={[
            styles.sessionLeaveConfirmationOverlay,
            state.status === "paused" ? styles.sessionLeaveConfirmationInFlow : null,
            styles.sessionAbandonConfirm,
            state.status !== "paused" && confirmationMaxHeight !== null
              ? { maxHeight: confirmationMaxHeight }
              : null
          ]}
          testID="session-abandon-confirmation"
        >
          {state.status === "paused" ? (
            <View style={[
              styles.sessionAbandonContent,
              stacksLeaveConfirmation ? styles.sessionAbandonConfirmStacked : null,
              leaveConfirmationMinHeight === undefined ? null : { minHeight: leaveConfirmationMinHeight }
            ]}>
              {abandonConfirmationContent}
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[
                styles.sessionAbandonContent,
                stacksLeaveConfirmation ? styles.sessionAbandonConfirmStacked : null,
                leaveConfirmationMinHeight === undefined ? null : {
                  minHeight: Math.min(leaveConfirmationMinHeight, Math.max(0, (confirmationMaxHeight ?? leaveConfirmationMinHeight + 2) - 2))
                }
              ]}
              nestedScrollEnabled
              style={styles.sessionAbandonScroll}
              testID="session-abandon-scroll"
            >
              {abandonConfirmationContent}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function SessionScoreStrip({
  compact = false,
  state
}: {
  compact?: boolean;
  state: SprintState;
}): React.JSX.Element {
  const styles = useStyles();
  const isTacticalFocus = state.config.tacticalFocus !== undefined;
  const completedCount = state.correctCount + state.mistakeCount;
  const leftCount = Math.max(
    0,
    (isTacticalFocus
      ? state.config.maxAttempts ?? state.config.targetCorrect
      : state.config.targetCorrect) -
      (isTacticalFocus ? completedCount : state.correctCount)
  );
  return (
    <View
      accessibilityLabel={isTacticalFocus
        ? `Focused Run: completed ${completedCount}, correct ${state.correctCount}, left ${leftCount}`
        : `Session score: solved ${state.correctCount}, mistakes ${state.mistakeCount}, left ${leftCount}`}
      style={[
        styles.sessionScoreStrip,
        compact ? styles.sessionScoreStripCompact : null
      ]}
      testID="session-score-strip"
    >
      <SessionScoreMetric
        label={isTacticalFocus ? "Completed" : "Solved"}
        metricTestID={isTacticalFocus ? "session-score-completed" : "session-score-solved"}
        compact={compact}
        showLabel={isTacticalFocus}
        tone="positive"
        value={isTacticalFocus ? completedCount : state.correctCount}
      />
      <SessionScoreMetric
        label={isTacticalFocus ? "Correct" : "Mistakes"}
        metricTestID={isTacticalFocus ? "session-score-correct" : "session-score-mistakes"}
        compact={compact}
        showLabel={isTacticalFocus}
        tone={isTacticalFocus ? "positive" : "negative"}
        value={isTacticalFocus ? state.correctCount : state.mistakeCount}
      />
      <SessionScoreMetric
        label="Left"
        metricTestID="session-score-left"
        compact={compact}
        showLabel={isTacticalFocus}
        tone="neutral"
        value={leftCount}
      />
    </View>
  );
}

function SessionScoreMetric({
  compact = false,
  label,
  metricTestID,
  showLabel = false,
  tone,
  value
}: {
  compact?: boolean;
  label: string;
  metricTestID: string;
  showLabel?: boolean;
  tone: "positive" | "negative" | "neutral";
  value: number;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}`}
      style={[
        styles.sessionScoreMetric,
        showLabel ? styles.sessionScoreMetricLabeled : null,
        compact ? styles.sessionScoreMetricCompact : null
      ]}
      testID={metricTestID}
    >
      {showLabel ? (
        <Text
          adjustsFontSizeToFit={compact}
          maxFontSizeMultiplier={SCORE_LABEL_MAX_TEXT_SCALE}
          minimumFontScale={0.75}
          numberOfLines={1}
          style={[
            styles.sessionScoreLabel,
            showLabel ? styles.sessionScoreTextStretch : null,
            compact ? styles.sessionScoreLabelCompact : null
          ]}
        >
          {label}
        </Text>
      ) : (
        <SessionScoreGlyph tone={tone} />
      )}
      <Text
        maxFontSizeMultiplier={SCORE_VALUE_MAX_TEXT_SCALE}
        numberOfLines={1}
        style={[styles.sessionScoreValue, showLabel ? styles.sessionScoreTextStretch : null]}
        testID={`${metricTestID}-value`}
      >
        {value}
      </Text>
    </View>
  );
}

// Session HUD at accessibility text sizes (#652): reflow at this scale, and
// let HUD values grow at most this much before they shrink to fit.
const HUD_LARGE_TEXT_FONT_SCALE = 1.5;

const HUD_MAX_TEXT_SCALE = PRACTICE_SESSION_HUD_MAX_TEXT_SCALE;

// The puzzle timing under the board grows at most this much, and board
// coordinates do not scale.
const PUZZLE_TIMING_MAX_TEXT_SCALE = PRACTICE_PUZZLE_TIMING_MAX_TEXT_SCALE;

// The uppercase score labels share a board-width strip with three columns;
// they stay at their designed size so all three read at one size, and the
// values grow only as far as the strip's slot allows.
const SCORE_LABEL_MAX_TEXT_SCALE = 1;

const SCORE_VALUE_MAX_TEXT_SCALE = 1.15;

const useStyles = makeStyles((theme) => ({
  ...pickPracticeStyles(theme, ["helperText", "listText"]),
  activeSessionShell: {
    gap: 8
  },
  // Lifts the HUD above the prompt, board and rail rows that follow it, so the
  // leave confirmation it anchors draws on top of them.
  activeSessionShellRaised: {
    elevation: 12,
    zIndex: 12
  },
  sessionLeaveConfirmationOverlay: {
    elevation: 12,
    left: 0,
    marginTop: 8,
    position: "absolute",
    right: 0,
    shadowColor: theme.colors.shadow,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: theme.name === "dark" ? 0.4 : 0.14,
    shadowRadius: 8,
    top: "100%",
    zIndex: 12
  },
  // A paused Sprint has no board or prompt to cover. Its confirmation owns
  // normal flow so native scroll bounds include the complete card.
  sessionLeaveConfirmationInFlow: {
    position: "relative",
    top: 0
  },
  sessionNavRow: {
    alignItems: "center",
    borderBottomColor: theme.colors.border.default,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingBottom: 4
  },
  sessionNavButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48
  },
  sessionNavActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    width: 48
  },
  sessionNavTitle: {
    color: theme.colors.text.ink,
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center"
  },
  sessionActiveMetricRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    minHeight: 36,
    paddingHorizontal: 0,
    paddingVertical: 1
  },
  sessionActiveMetricRowCompact: {
    gap: 2,
    paddingHorizontal: 0,
  },
  sessionActiveMetricRowLargeText: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 4
  },
  sessionMetricLargeTextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  // HUD values span their metric block so shrink-to-fit measures against
  // the block width rather than the text's own width (#652). The first and
  // last values align to the content edges; the timer stays centred.
  sessionMetricValueFill: {
    alignSelf: "stretch"
  },
  sessionMetricValueLeading: {
    textAlign: "left"
  },
  sessionMetricValueTrailing: {
    textAlign: "right"
  },
  sessionMetricBlockTrailing: {
    alignItems: "flex-end"
  },
  sessionMetricBlockFullRow: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0
  },
  sessionMetricBlock: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minWidth: 0
  },
  personalBestProgressMetricBlock: {
    alignItems: "flex-start",
    flex: 1
  },
  personalBestMistakesMetricBlock: {
    alignItems: "flex-end",
    flex: 0,
    minWidth: PERSONAL_BEST_MISTAKES_BLOCK_WIDTH
  },
  // A neutral surface keeps the tinted destructive Abandon button distinct;
  // the danger border still marks the sheet as a warning.
  sessionAbandonConfirm: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.danger.s300,
    borderRadius: 8,
    borderWidth: 1
  },
  sessionAbandonScroll: {
    borderRadius: 8,
    flexGrow: 0
  },
  sessionAbandonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  sessionAbandonCopy: {
    flex: 1,
    gap: 2
  },
  sessionAbandonConfirmStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    justifyContent: "center"
  },
  sessionAbandonCopyStacked: {
    flex: 0,
    flexBasis: "auto",
    flexShrink: 0
  },
  sessionAbandonActionsStacked: {
    justifyContent: "flex-end"
  },
  leaveActionsStacked: {
    flexDirection: "column"
  },
  sessionAbandonActions: {
    flexDirection: "row",
    gap: 8
  },
  survivalExitAction: {
    flex: 1
  },
  survivalExitBest: {
    color: theme.colors.accent.s700,
    fontSize: 14,
    fontWeight: "900"
  },
  survivalExitPrimaryActions: {
    flexDirection: "row",
    gap: 8
  },
  survivalExitSheet: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s300,
    borderRadius: 12,
    borderWidth: 1,
    gap: 11,
    padding: 12
  },
  survivalExitTitle: {
    color: theme.colors.text.primary,
    fontSize: 17,
    fontWeight: "900"
  },
  // HUD values use direction A's Numeral L (system font, tabular digits).
  sessionProgressValue: {
    ...theme.typography.numeral,
    color: theme.colors.text.ink,
    textAlign: "center"
  },
  timerText: {
    ...theme.typography.numeral,
    color: theme.colors.text.ink,
    textAlign: "center"
  },
  sessionMetricTextCompact: {
    ...theme.typography.numeralRow
  },
  puzzleTimingIndicator: {
    alignItems: "center",
    backgroundColor: theme.colors.glassStrong,
    borderColor: theme.colors.border.strong,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 26,
    paddingHorizontal: 9
  },
  puzzleTimingIndicatorStandalone: {
    alignSelf: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    minHeight: 18,
    paddingHorizontal: 0
  },
  puzzleTimingIndicatorSlow: {
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s500
  },
  puzzleTimingIndicatorText: {
    color: theme.colors.text.secondary,
    fontFamily: "menlo",
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  puzzleTimingIndicatorTextSlow: {
    color: theme.colors.warning.s700
  },
  puzzleTimingCountdown: {
    backgroundColor: theme.colors.warning.s500,
    borderRadius: 999,
    color: theme.colors.text.onTone,
    fontFamily: "menlo",
    fontSize: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    minWidth: 25,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
    textAlign: "center"
  },
  sessionScoreStrip: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  sessionScoreStripCompact: {
    paddingHorizontal: 4
  },
  sessionScoreMetric: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  },
  sessionScoreMetricLabeled: {
    flexDirection: "column",
    gap: 1
  },
  sessionScoreMetricCompact: {
    gap: 2,
    minWidth: 0
  },
  sessionScoreLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.25,
    lineHeight: 12,
    textTransform: "uppercase"
  },
  sessionScoreLabelCompact: {
    fontSize: 9,
    letterSpacing: 0
  },
  // Labeled (Focused Run) score texts span their column so a narrow strip
  // centers them without rounding their width down: see "Text width
  // rounding" in docs/ui-design/MOBILE_UI_DESIGN.md (#633).
  sessionScoreTextStretch: {
    alignSelf: "stretch",
    textAlign: "center"
  },
  sessionScoreValue: {
    color: theme.colors.text.ink,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 17
  },
}));
