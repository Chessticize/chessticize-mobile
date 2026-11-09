import React from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import type { ArrowDuelState, CurrentPuzzleState, SprintMode } from "../../../../../../packages/core/src/index.ts";
import type { ArrowDuelReplyChallengePhase } from "../../arrowDuelReplyChallengePreview.ts";
import { type MoveSide, moveSideDisplayName, sideToMove } from "../shared/moveSide.ts";
import { MoveSideGlyph } from "../shared/Glyphs.tsx";
import { FABRIC_SAFE_HIDDEN_TEXT_STYLE, formatCompactDuration, modeLabel } from "../shared/practiceUtils.ts";
import { PRACTICE_FEEDBACK_MAX_TEXT_SCALE, PRACTICE_PROMPT_MAX_TEXT_SCALE } from "../../adaptivePracticeLayout.ts";
import { makeStyles } from "../../../theme/index.ts";

export type PreviousAttemptNoticeReason = "slow" | "timed_out" | "wrong";

const PRACTICE_PROMPT_COPY_GAP = 5;

export function PreviousAttemptNotice({
  reason
}: {
  reason: PreviousAttemptNoticeReason;
}): React.JSX.Element {
  const styles = useStyles();
  const presentation = reason === "slow"
    ? {
        detail: "It was automatically marked Unclear and added to Review.",
        status: "Marked Unclear",
        title: "Previous puzzle took too long"
      }
    : reason === "wrong"
      ? {
          detail: "It counted as a mistake and was added to Review.",
          status: "In Review",
          title: "Previous answer was incorrect"
        }
      : {
          detail: "It counted as a mistake and was added to Review.",
          status: "In Review",
          title: "Previous puzzle timed out"
        };
  return (
    <View
      accessibilityLabel={`${presentation.title}. ${presentation.detail} ${presentation.status}.`}
      accessibilityLiveRegion="polite"
      style={styles.unclearPrompt}
      testID="sprint-previous-attempt-notice"
    >
      <View style={styles.previousAttemptNoticeCopy}>
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.previousAttemptNoticeTitle}
        >
          {presentation.title}
        </Text>
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.previousAttemptNoticeDetail}
        >
          {presentation.detail}
        </Text>
      </View>
      <View
        style={styles.readOnlyAttemptStatus}
        testID="sprint-previous-attempt-notice-status"
      >
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.readOnlyAttemptStatusText}
        >
          {presentation.status}
        </Text>
      </View>
    </View>
  );
}

export function UnclearAttemptPrompt({
  marked,
  onToggle,
  onTargetLayout,
  question,
  targetArea = "action",
  targetRef
}: {
  marked: boolean;
  onToggle: () => void;
  onTargetLayout?: (event: LayoutChangeEvent) => void;
  question: string;
  targetArea?: "action" | "prompt";
  targetRef?: React.RefObject<View | null>;
}): React.JSX.Element {
  const styles = useStyles();
  const targetsPrompt = targetArea === "prompt";

  return (
    <View
      accessibilityLabel={`${question} ${marked ? "Marked as unclear." : "Mark as unclear. Activate to mark unclear."}`}
      ref={targetsPrompt ? targetRef : undefined}
      style={styles.unclearPrompt}
      testID="sprint-unclear-prompt"
      onLayout={targetsPrompt ? onTargetLayout : undefined}
    >
      <View style={styles.unclearPromptCopy}>
        <Text
          maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE}
          style={styles.unclearPromptQuestion}
          testID="sprint-unclear-question"
        >
          {question}
        </Text>
      </View>
      {marked ? (
        <View style={styles.readOnlyAttemptStatus} testID="sprint-unclear-marked">
          <Text maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE} style={styles.readOnlyAttemptStatusText}>
            Marked
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark this attempt as unclear"
          ref={targetsPrompt ? undefined : targetRef}
          style={styles.unclearPromptButton}
          testID="sprint-unclear-toggle"
          onPress={onToggle}
          onLayout={targetsPrompt ? undefined : onTargetLayout}
        >
          <Text maxFontSizeMultiplier={FEEDBACK_MAX_TEXT_SCALE} style={styles.unclearPromptButtonText}>
            Mark as unclear
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function ErrorPanel({ error }: { error: string }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={`Error. ${error}`}
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={styles.errorPanel}
      testID="error-panel"
    >
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}

export function ArrowDuelReplyChallengePrompt({
  currentPuzzle,
  explicitReplySideCopy = false,
  frameHeight,
  hideSideGlyph = false,
  kingPieceSize,
  legacyPracticePromptTestIDs = false,
  phase,
  promptSide,
  replyReady,
  replySeconds,
  rootTestID,
  settingsHint,
  showReplyTimer = true,
  testIDPrefix = "arrow-duel"
}: {
  currentPuzzle: ArrowDuelState;
  explicitReplySideCopy?: boolean;
  frameHeight: number;
  hideSideGlyph?: boolean;
  kingPieceSize: number;
  legacyPracticePromptTestIDs?: boolean;
  phase: ArrowDuelReplyChallengePhase;
  promptSide: MoveSide | null;
  replyReady: boolean;
  replySeconds: number;
  rootTestID?: string;
  settingsHint?: string;
  showReplyTimer?: boolean;
  testIDPrefix?: string;
}): React.JSX.Element {
  const styles = useStyles();
  const displayedSide = promptSide ?? sideToMove(currentPuzzle.currentFen);
  const side = displayedSide === "b" ? "black" : "white";
  const sideName = moveSideDisplayName(displayedSide);
  const expectedReply = currentPuzzle.puzzle.solutionMoves[1] ?? "";
  const copy = phase === "choice"
    ? {
        context: `For ${side}, between the two arrows.`,
        hint: "Be ready for a quick reply check.",
        title: "Choose the best move",
        tone: "neutral" as const
      }
    : {
        context: explicitReplySideCopy
          ? "The other move was played."
          : "If the tempting move was played, what happens next?",
        hint: settingsHint ?? null,
        title: explicitReplySideCopy ? `Find ${sideName}’s reply` : "Find the reply",
        tone: "reply" as const
      };

  return (
    <View
      accessibilityLabel={[copy.title, copy.context, copy.hint].filter(Boolean).join(". ")}
      style={[
        styles.promptPanel,
        { height: frameHeight },
        styles.arrowDuelReplyPromptPanel,
        copy.tone === "reply" ? styles.arrowDuelReplyPromptActive : null
      ]}
      testID={rootTestID ?? `${testIDPrefix}-reply-challenge`}
    >
      {!hideSideGlyph ? (
        <View
          style={[styles.promptIcon, { height: kingPieceSize, width: kingPieceSize }]}
          testID="practice-prompt-icon"
        >
          <MoveSideGlyph
            kingPieceSize={kingPieceSize}
            side={displayedSide}
            testID="practice-prompt-side-glyph"
          />
        </View>
      ) : null}
      <View
        style={[styles.promptCopy, styles.arrowDuelReplyPromptCopy]}
        testID="practice-prompt-copy"
      >
        <View
          style={styles.arrowDuelReplyCopyLayer}
          testID={`${testIDPrefix}-reply-copy-layer`}
        >
          <View style={styles.arrowDuelReplyTitleRow}>
            <Text
              style={styles.promptTitle}
              testID={legacyPracticePromptTestIDs
                ? "practice-prompt-title-layout"
                : `${testIDPrefix}-reply-title`}
            >
              {copy.title}
            </Text>
            {phase === "reply" && replyReady && showReplyTimer ? (
              <View
                accessibilityLabel={`${replySeconds} ${replySeconds === 1 ? "second" : "seconds"} remaining.`}
                style={styles.arrowDuelReplyTimerGroup}
                testID={`${testIDPrefix}-reply-timer-group`}
              >
                <Text style={styles.arrowDuelReplyTimer} testID={`${testIDPrefix}-reply-timer`}>
                  {formatCompactDuration(replySeconds)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={styles.promptText}
            testID={legacyPracticePromptTestIDs
              ? "practice-prompt-context"
              : `${testIDPrefix}-reply-context`}
          >
            {copy.context}
          </Text>
          <Text
            accessible={Boolean(copy.hint)}
            accessibilityElementsHidden={!copy.hint}
            importantForAccessibility={copy.hint ? "auto" : "no-hide-descendants"}
            style={[styles.promptHint, copy.hint ? null : styles.promptEmptyLayoutCopy]}
            testID={legacyPracticePromptTestIDs
              ? "practice-prompt-hint"
              : `${testIDPrefix}-reply-hint`}
          >
            {copy.hint ?? "\u00A0"}
          </Text>
          {phase === "reply" ? (
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={FABRIC_SAFE_HIDDEN_TEXT_STYLE}
              testID={`${testIDPrefix}-reply-expected-move`}
            >
              {expectedReply}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function PracticePrompt({
  currentPuzzle,
  frameHeight,
  kingPieceSize,
  mode,
  promptSide,
  solved = false,
  promptText,
  promptHint,
  promptHintNumberOfLines,
  reserveDefaultLayout = false
}: {
  currentPuzzle: CurrentPuzzleState | undefined;
  frameHeight: number;
  kingPieceSize: number;
  mode: SprintMode;
  promptSide?: MoveSide;
  solved?: boolean;
  promptText?: string | null;
  promptHint?: string | null;
  promptHintNumberOfLines?: number;
  reserveDefaultLayout?: boolean;
}): React.JSX.Element | null {
  const styles = useStyles();
  if (!currentPuzzle) {
    return null;
  }
  const displayedSide = promptSide ?? sideToMove(currentPuzzle.currentFen);
  const side = displayedSide === "b" ? "black" : "white";
  const usesArrowDuelPrompt = currentPuzzle.kind === "arrow_duel"
    || (reserveDefaultLayout && mode === "arrow_duel");
  const defaultPromptTitle = usesArrowDuelPrompt ? "Choose the best move" : "Find the best move";
  const defaultPromptContext = usesArrowDuelPrompt
    ? `For ${side}, between the two arrows.`
    : `For ${side}.`;
  const defaultPromptHint = usesArrowDuelPrompt
    ? "Watch for checks, captures, and attacks!"
    : null;
  const promptContext = promptText === undefined ? defaultPromptContext : promptText;
  const promptHintCopy = promptHint === undefined
    ? defaultPromptHint
    : promptHint;
  const promptTitle = promptText === undefined
    ? defaultPromptTitle
    : modeLabel(mode);
  const layoutPromptTitle = reserveDefaultLayout ? defaultPromptTitle : promptTitle;
  const layoutPromptContext = reserveDefaultLayout ? defaultPromptContext : promptContext;
  const layoutPromptHint = reserveDefaultLayout ? defaultPromptHint : promptHintCopy;
  const layoutCopyHidden = solved || reserveDefaultLayout;
  const layoutContextHidden = layoutCopyHidden || !layoutPromptContext;
  const layoutHintHidden = layoutCopyHidden || !layoutPromptHint;

  return (
    <View style={[styles.promptPanel, { height: frameHeight }]} testID="practice-prompt">
      <View
        style={[styles.promptIcon, { height: kingPieceSize, width: kingPieceSize }]}
        testID="practice-prompt-icon"
      >
        <MoveSideGlyph
          kingPieceSize={kingPieceSize}
          side={displayedSide}
          testID="practice-prompt-side-glyph"
        />
      </View>
      <View style={styles.promptCopy} testID="practice-prompt-copy">
        <View testID="practice-prompt-title-slot">
          <Text
            accessible={!layoutCopyHidden}
            accessibilityElementsHidden={layoutCopyHidden}
            importantForAccessibility={layoutCopyHidden ? "no-hide-descendants" : "auto"}
            maxFontSizeMultiplier={PROMPT_MAX_TEXT_SCALE}
            style={[styles.promptTitle, layoutCopyHidden ? styles.promptSolvedLayoutCopy : null]}
            testID="practice-prompt-title-layout"
          >
            {layoutPromptTitle}
          </Text>
        </View>
        <Text
          accessible={!layoutContextHidden}
          accessibilityElementsHidden={layoutContextHidden}
          importantForAccessibility={layoutContextHidden ? "no-hide-descendants" : "auto"}
          maxFontSizeMultiplier={PROMPT_MAX_TEXT_SCALE}
          style={[styles.promptText, layoutContextHidden ? styles.promptSolvedLayoutCopy : null]}
          testID="practice-prompt-context"
        >
          {layoutPromptContext ?? "\u00A0"}
        </Text>
        <Text
          accessible={!layoutHintHidden}
          accessibilityElementsHidden={layoutHintHidden}
          importantForAccessibility={layoutHintHidden ? "no-hide-descendants" : "auto"}
          maxFontSizeMultiplier={PROMPT_MAX_TEXT_SCALE}
          numberOfLines={reserveDefaultLayout ? undefined : promptHintNumberOfLines}
          style={[
            styles.promptHint,
            layoutHintHidden
              ? layoutPromptHint
                ? styles.promptSolvedLayoutCopy
                : styles.promptEmptyLayoutCopy
              : null
          ]}
          testID="practice-prompt-hint"
        >
          {layoutPromptHint ?? "\u00A0"}
        </Text>
        {reserveDefaultLayout && !solved ? (
          <View
            pointerEvents="none"
            style={[styles.promptSolvedOverlay, styles.promptMessageOverlay]}
            testID="practice-prompt-message-overlay"
          >
            <Text style={styles.promptTitle} testID="practice-prompt-message-title">
              {promptTitle}
            </Text>
            {promptContext ? (
              <Text style={styles.promptText} testID="practice-prompt-message-context">
                {promptContext}
              </Text>
            ) : null}
            {promptHintCopy ? (
              <Text
                numberOfLines={promptHintNumberOfLines}
                style={styles.promptHint}
                testID="practice-prompt-message-hint"
              >
                {promptHintCopy}
              </Text>
            ) : null}
          </View>
        ) : null}
        {solved ? (
          <View
            pointerEvents="none"
            style={styles.promptSolvedOverlay}
            testID="practice-prompt-solved-overlay"
          >
            <Text style={styles.promptTitle} testID="practice-prompt-solved-title">
              Solved
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// A phone's locked session stacks the prompt and the post-answer feedback row
// with the board, and the layout reserves their height before sizing the board
// (adaptivePracticeLayout.ts), so their copy grows less than other chrome.
const PROMPT_MAX_TEXT_SCALE = PRACTICE_PROMPT_MAX_TEXT_SCALE;

const FEEDBACK_MAX_TEXT_SCALE = PRACTICE_FEEDBACK_MAX_TEXT_SCALE;

const useStyles = makeStyles((theme) => ({
  promptPanel: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  promptIcon: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center"
  },
  arrowDuelReplyPromptActive: {
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s400
  },
  arrowDuelReplyPromptPanel: {
    alignSelf: "center",
    width: "100%"
  },
  arrowDuelReplyPromptCopy: {
    alignSelf: "stretch"
  },
  arrowDuelReplyCopyLayer: {
    bottom: 0,
    gap: PRACTICE_PROMPT_COPY_GAP,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  arrowDuelReplyTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  arrowDuelReplyTimerGroup: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 1
  },
  arrowDuelReplyTimer: {
    backgroundColor: theme.colors.accent.fill,
    borderRadius: 999,
    color: theme.colors.text.onAccent,
    fontFamily: "menlo",
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    minWidth: 42,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: "center"
  },
  unclearPrompt: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.strong,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  unclearPromptCopy: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 0
  },
  unclearPromptQuestion: {
    color: theme.colors.text.strong,
    flex: 1,
    fontSize: 12,
    fontWeight: "700"
  },
  unclearPromptButton: {
    alignItems: "center",
    backgroundColor: theme.colors.warning.s50,
    borderColor: theme.colors.warning.s500,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 8
  },
  unclearPromptButtonText: {
    color: theme.colors.warning.s700,
    fontSize: 11,
    fontWeight: "900"
  },
  previousAttemptNoticeCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0
  },
  previousAttemptNoticeTitle: {
    color: theme.colors.text.strong,
    fontSize: 12,
    fontWeight: "800"
  },
  previousAttemptNoticeDetail: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: "600"
  },
  readOnlyAttemptStatus: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s50,
    borderColor: theme.colors.accent.s300,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 8
  },
  readOnlyAttemptStatusText: {
    color: theme.colors.accent.s700,
    fontSize: 11,
    fontWeight: "900"
  },
  promptCopy: {
    flex: 1,
    gap: PRACTICE_PROMPT_COPY_GAP,
    minWidth: 0,
    position: "relative"
  },
  promptTitle: {
    color: theme.colors.text.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  promptSolvedOverlay: {
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  promptMessageOverlay: {
    gap: PRACTICE_PROMPT_COPY_GAP
  },
  promptText: {
    color: theme.colors.text.strong,
    fontSize: 12,
    fontWeight: "600"
  },
  promptHint: {
    color: theme.colors.accent.s600,
    fontSize: 12,
    fontWeight: "800"
  },
  promptSolvedLayoutCopy: {
    opacity: 0
  },
  promptEmptyLayoutCopy: {
    opacity: 0,
    position: "absolute"
  },
  errorPanel: {
    backgroundColor: theme.colors.danger.s50,
    borderColor: theme.colors.danger.s300,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 12
  },
  errorText: {
    color: theme.colors.danger.s800,
    fontSize: 14,
    fontWeight: "700"
  },
}));
