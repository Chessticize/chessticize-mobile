import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import type {
  GamePlyEvaluation,
  MoveClassification,
  ParsedGamePly
} from "../../../../../packages/core/src/index.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { AppText, Icon } from "../ui/index.tsx";
import { GAME_REVIEW_COPY } from "./gameReviewCopy.ts";
import { formatMoveNumberTag } from "./gameReviewHelpers.ts";

export interface MoveListStripProps {
  plies: readonly ParsedGamePly[];
  evalByPly: ReadonlyMap<number, GamePlyEvaluation>;
  currentPly: number;
  onSelectPly: (ply: number) => void;
  onStepFirst: () => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  onStepLast: () => void;
  onToggleFlip: () => void;
  testID?: string;
}

export function MoveListStrip({
  plies,
  evalByPly,
  currentPly,
  onSelectPly,
  onStepFirst,
  onStepPrev,
  onStepNext,
  onStepLast,
  onToggleFlip,
  testID = "game-review-move-strip"
}: MoveListStripProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const totalPlies = plies.length;
  const atStart = currentPly <= 0;
  const atEnd = currentPly >= totalPlies;

  return (
    <View style={styles.container} testID={testID}>
      <ScrollView
        contentContainerStyle={styles.movesContent}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.movesScroll}
        testID={`${testID}-scroll`}
      >
        <Pressable
          accessibilityLabel={GAME_REVIEW_COPY.moveStrip.startLabel}
          accessibilityRole="button"
          accessibilityState={{ selected: currentPly === 0 }}
          onPress={() => onSelectPly(0)}
          style={[styles.moveChip, currentPly === 0 ? styles.moveChipSelected : null]}
          testID="move-strip-ply-0"
        >
          <AppText
            maxFontSizeMultiplier={1.4}
            style={currentPly === 0 ? styles.moveChipTextSelected : styles.moveChipText}
            variant="footnote"
          >
            {GAME_REVIEW_COPY.moveStrip.startLabel}
          </AppText>
        </Pressable>
        {plies.map((ply) => {
          const selected = ply.ply === currentPly;
          const plyEval = evalByPly.get(ply.ply);
          const dotColor = classificationDotColor(plyEval?.classification, theme);
          const prefix = ply.color === "w" ? `${ply.moveNumber}. ` : "";
          const label = `${prefix}${ply.san}`;

          return (
            <Pressable
              key={`move-${ply.ply}`}
              accessibilityLabel={`${formatMoveNumberTag(ply.moveNumber, ply.color)} ${ply.san}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelectPly(ply.ply)}
              style={[styles.moveChip, selected ? styles.moveChipSelected : null]}
              testID={`move-strip-ply-${ply.ply}`}
            >
              {dotColor ? (
                <View style={[styles.classificationDot, { backgroundColor: dotColor }]} />
              ) : null}
              <AppText
                maxFontSizeMultiplier={1.4}
                style={selected ? styles.moveChipTextSelected : styles.moveChipText}
                variant="footnote"
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.controlsRow}>
        <StepButton
          accessibilityLabel={GAME_REVIEW_COPY.moveStrip.firstMoveA11y}
          disabled={atStart}
          label="<<"
          onPress={onStepFirst}
          testID="game-review-step-first"
        />
        <StepButton
          accessibilityLabel={GAME_REVIEW_COPY.moveStrip.prevMoveA11y}
          disabled={atStart}
          label="<"
          onPress={onStepPrev}
          testID="game-review-step-prev"
        />
        <StepButton
          accessibilityLabel={GAME_REVIEW_COPY.moveStrip.nextMoveA11y}
          disabled={atEnd}
          label=">"
          onPress={onStepNext}
          testID="game-review-step-next"
        />
        <StepButton
          accessibilityLabel={GAME_REVIEW_COPY.moveStrip.lastMoveA11y}
          disabled={atEnd}
          label=">>"
          onPress={onStepLast}
          testID="game-review-step-last"
        />
        <Pressable
          accessibilityLabel={GAME_REVIEW_COPY.moveStrip.flipBoardA11y}
          accessibilityRole="button"
          onPress={onToggleFlip}
          style={({ pressed }) => [styles.controlButton, pressed ? styles.pressed : null]}
          testID="game-review-flip-board"
        >
          <Icon color={theme.colors.text.primary} name="flip" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

function StepButton({
  accessibilityLabel,
  disabled,
  label,
  onPress,
  testID
}: {
  accessibilityLabel: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.controlButton,
        disabled ? styles.controlButtonDisabled : null,
        pressed && !disabled ? styles.pressed : null
      ]}
      testID={testID}
    >
      <AppText
        maxFontSizeMultiplier={1.3}
        style={styles.controlButtonText}
        variant="subheadline"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function classificationDotColor(
  classification: MoveClassification | undefined,
  theme: ReturnType<typeof useTheme>
): string | null {
  switch (classification) {
    case "blunder":
      return theme.colors.danger.s600;
    case "mistake":
      return theme.colors.caution.s700;
    case "missed_win":
      return theme.colors.warning.s500;
    case "inaccuracy":
      return theme.colors.warning.s400;
    case "great":
      return theme.colors.positive.s600;
    default:
      return null;
  }
}

const useStyles = makeStyles((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 8,
    padding: 8
  },
  movesScroll: {
    flexGrow: 0
  },
  movesContent: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2
  },
  moveChip: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.shape.capsule,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  moveChipSelected: {
    backgroundColor: theme.colors.accent.fill
  },
  moveChipText: {
    backgroundColor: theme.colors.surfaceSunken,
    color: theme.colors.text.primary,
    fontWeight: theme.fontWeight.semibold
  },
  moveChipTextSelected: {
    backgroundColor: theme.colors.accent.fill,
    color: theme.colors.text.onAccent,
    fontWeight: theme.fontWeight.bold
  },
  classificationDot: {
    borderRadius: theme.radius.pill,
    height: 7,
    width: 7
  },
  controlsRow: {
    flexDirection: "row",
    gap: 6
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.shape.control,
    flex: 1,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget
  },
  controlButtonDisabled: {
    opacity: 0.4
  },
  controlButtonText: {
    backgroundColor: theme.colors.surfaceSunken,
    color: theme.colors.text.primary,
    fontWeight: theme.fontWeight.bold
  },
  pressed: {
    opacity: 0.7
  }
}));
