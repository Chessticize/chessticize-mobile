import React from "react";
import { Pressable, View } from "react-native";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { AppText, Badge, Button } from "../ui/index.tsx";
import { GAME_REVIEW_COPY } from "./gameReviewCopy.ts";
import {
  classificationBadgeMeta,
  formatMoveNumberTag,
  formatPvSanLine,
  uciToSan
} from "./gameReviewHelpers.ts";
import type { KeyMomentItem, KeyMomentRetryState } from "./gameReviewTypes.ts";

export interface KeyMomentRetryCardProps {
  moment: KeyMomentItem | null;
  retryState: KeyMomentRetryState | null;
  momentIndex: number;
  totalMoments: number;
  isScanning: boolean;
  inReview: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onSelectCandidate: (uci: string) => void;
  onToggleRefutation: () => void;
  onStepRefutationBackward: () => void;
  onStepRefutationForward: () => void;
  onToggleReviewEnrollment: () => void;
  testID?: string;
}

export function KeyMomentRetryCard({
  moment,
  retryState,
  momentIndex,
  totalMoments,
  isScanning,
  inReview,
  onPrev,
  onNext,
  onSkip,
  onRetry,
  onSelectCandidate,
  onToggleRefutation,
  onStepRefutationBackward,
  onStepRefutationForward,
  onToggleReviewEnrollment,
  testID = "game-review-key-moment-card"
}: KeyMomentRetryCardProps): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();

  if (!moment || !retryState) {
    return (
      <View style={styles.card} testID={testID}>
        <AppText testID={`${testID}-empty`} tone="secondary" variant="subheadline">
          {isScanning
            ? GAME_REVIEW_COPY.keyMoments.emptyScanning
            : GAME_REVIEW_COPY.keyMoments.emptyNone}
        </AppText>
      </View>
    );
  }

  const hasPrev = momentIndex > 0;
  const hasNext = momentIndex < totalMoments - 1;

  if (moment.kind === "highlight") {
    const color = moment.ply % 2 === 1 ? "w" : "b";
    const moveLabel = formatMoveNumberTag(moment.moveNumber, color);

    return (
      <View style={[styles.card, styles.cardPositive]} testID={testID}>
        <HeaderBar
          current={momentIndex + 1}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onNext={onNext}
          onPrev={onPrev}
          total={totalMoments}
        />
        <View style={styles.statusRow}>
          <Badge
            label={GAME_REVIEW_COPY.keyMoments.highlightTitle}
            testID="key-moment-highlight-badge"
            tone="positive"
          />
        </View>
        <AppText testID="key-moment-highlight-detail" variant="subheadline">
          {GAME_REVIEW_COPY.keyMoments.highlightDetail(moveLabel, moment.highlight.san)}
        </AppText>
      </View>
    );
  }

  if (moment.kind === "swing") {
    const moveLabel = formatMoveNumberTag(moment.moveNumber, moment.color);
    const meta = classificationBadgeMeta(moment.classification, theme.colors);
    const tone =
      moment.classification === "blunder" || moment.classification === "missed_win"
        ? "negative"
        : "warning";

    return (
      <View style={[styles.card, styles.cardDanger]} testID={testID}>
        <HeaderBar
          current={momentIndex + 1}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onNext={onNext}
          onPrev={onPrev}
          total={totalMoments}
        />
        <View style={styles.statusRow}>
          <Badge
            label={`${meta.glyph} ${meta.label}`}
            testID="key-moment-swing-badge"
            tone={tone}
          />
          <AppText tone="secondary" variant="footnote">
            {`${moveLabel} ${moment.playedMoveSan} (${moment.evalAfterLabel})`}
          </AppText>
        </View>
        {moment.bestMoveSan ? (
          <AppText testID="key-moment-swing-best" variant="subheadline">
            {GAME_REVIEW_COPY.verdict.bestWas(moment.bestMoveSan)}
          </AppText>
        ) : null}
      </View>
    );
  }

  const { puzzle } = moment;
  const isArrowDuel = puzzle.puzzleKind === "arrow_duel";
  const hasPunishmentLine = retryState.punishmentLine.length > 0;
  const refutationSanLine =
    hasPunishmentLine && retryState.punishmentStartFen
      ? formatPvSanLine(retryState.punishmentStartFen, retryState.punishmentLine, 6)
      : "";

  const isMultiMoveInProgress =
    !isArrowDuel &&
    retryState.status === "prompt" &&
    (retryState.lineState?.playedMoves.length ?? 0) > 1;

  const promptCue = isArrowDuel
    ? moment.playedMoveSan
      ? GAME_REVIEW_COPY.keyMoments.arrowDuelCue(moment.playedMoveSan)
      : GAME_REVIEW_COPY.keyMoments.arrowDuelCueFallback
    : isMultiMoveInProgress
      ? GAME_REVIEW_COPY.keyMoments.lineContinuationCue
      : GAME_REVIEW_COPY.keyMoments.lineCue(moment.playedMoveSan);

  const cardToneStyle =
    retryState.status === "solved"
      ? styles.cardPositive
      : retryState.status === "failed"
        ? styles.cardDanger
        : null;

  return (
    <View style={[styles.card, cardToneStyle]} testID={testID}>
      <HeaderBar
        current={momentIndex + 1}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={retryState.status === "prompt" ? onSkip : undefined}
        total={totalMoments}
      />

      <View style={styles.badgesRow}>
        <Badge
          label={
            isArrowDuel
              ? GAME_REVIEW_COPY.summary.kindArrowDuel
              : GAME_REVIEW_COPY.summary.kindLine
          }
          testID="key-moment-kind-badge"
          tone="accent"
        />
        <Badge
          label={GAME_REVIEW_COPY.summary.moveNumberLabel(moment.moveNumber)}
          tone="neutral"
        />
        {moment.escapedPunishment ? (
          <Badge
            label={GAME_REVIEW_COPY.keyMoments.escapedTag}
            testID="key-moment-escaped-badge"
            tone="warning"
          />
        ) : null}
      </View>

      {retryState.status === "prompt" ? (
        <View style={styles.bodyStack}>
          <AppText testID="key-moment-prompt-cue" variant="headline">
            {promptCue}
          </AppText>
          {isArrowDuel && retryState.candidates && retryState.candidates.length === 2 ? (
            <View style={styles.candidatesRow} testID="key-moment-arrow-duel-candidates">
              {retryState.candidates.map((candidateUci) => {
                const san = uciToSan(moment.decisionFen, candidateUci);
                return (
                  <Pressable
                    key={candidateUci}
                    accessibilityLabel={san}
                    accessibilityRole="button"
                    onPress={() => onSelectCandidate(candidateUci)}
                    style={({ pressed }) => [
                      styles.candidatePill,
                      pressed ? styles.pressed : null
                    ]}
                    testID={`key-moment-candidate-${candidateUci}`}
                  >
                    <AppText style={styles.candidatePillText} variant="headline">
                      {san}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {retryState.status === "solved" ? (
        <View style={styles.bodyStack} testID="key-moment-solved-state">
          <View style={styles.statusRow}>
            <Badge label={GAME_REVIEW_COPY.keyMoments.solvedTitle} tone="positive" />
            {moment.bestEvalLabel && moment.playedEvalLabel ? (
              <AppText testID="key-moment-eval-comparison" tone="secondary" variant="footnote">
                {GAME_REVIEW_COPY.keyMoments.evalComparison(
                  moment.bestEvalLabel,
                  moment.playedEvalLabel
                )}
              </AppText>
            ) : moment.bestMoveSan ? (
              <AppText tone="secondary" variant="footnote">
                {GAME_REVIEW_COPY.keyMoments.bestMoveReveal(moment.bestMoveSan, moment.bestEvalLabel)}
              </AppText>
            ) : null}
          </View>

          {retryState.showingRefutation && hasPunishmentLine ? (
            <RefutationStepper
              currentStep={retryState.refutationStep}
              onBackward={onStepRefutationBackward}
              onForward={onStepRefutationForward}
              sanLine={refutationSanLine}
              totalSteps={retryState.punishmentLine.length}
            />
          ) : null}

          <View style={styles.actionsRow}>
            {hasPunishmentLine ? (
              <Button
                label={
                  retryState.showingRefutation
                    ? GAME_REVIEW_COPY.keyMoments.hideRefutation
                    : GAME_REVIEW_COPY.keyMoments.showRefutation
                }
                onPress={onToggleRefutation}
                size="compact"
                testID="key-moment-refutation-toggle"
                variant="secondary"
              />
            ) : null}
            <Button
              label={
                inReview
                  ? GAME_REVIEW_COPY.keyMoments.inReview
                  : GAME_REVIEW_COPY.keyMoments.addToReview
              }
              onPress={onToggleReviewEnrollment}
              size="compact"
              testID="key-moment-review-toggle"
              variant={inReview ? "plain" : "secondary"}
            />
          </View>
        </View>
      ) : null}

      {retryState.status === "failed" ? (
        <View style={styles.bodyStack} testID="key-moment-failed-state">
          <View style={styles.statusRow}>
            <Badge label={GAME_REVIEW_COPY.keyMoments.failedTitle} tone="negative" />
            {inReview ? (
              <Badge
                label={GAME_REVIEW_COPY.keyMoments.addedToReview}
                testID="key-moment-auto-enrolled-badge"
                tone="warning"
              />
            ) : null}
          </View>

          {moment.bestMoveSan ? (
            <AppText testID="key-moment-best-reveal" variant="headline">
              {GAME_REVIEW_COPY.keyMoments.bestMoveReveal(moment.bestMoveSan, moment.bestEvalLabel)}
            </AppText>
          ) : null}

          {hasPunishmentLine ? (
            <RefutationStepper
              currentStep={retryState.refutationStep}
              onBackward={onStepRefutationBackward}
              onForward={onStepRefutationForward}
              sanLine={refutationSanLine}
              totalSteps={retryState.punishmentLine.length}
            />
          ) : null}

          <View style={styles.actionsRow}>
            <Button
              label={GAME_REVIEW_COPY.keyMoments.retryAgain}
              onPress={onRetry}
              size="compact"
              testID="key-moment-retry-button"
              variant="secondary"
            />
            <Button
              label={
                inReview
                  ? GAME_REVIEW_COPY.keyMoments.removeFromReview
                  : GAME_REVIEW_COPY.keyMoments.addToReview
              }
              onPress={onToggleReviewEnrollment}
              size="compact"
              testID="key-moment-review-toggle"
              variant={inReview ? "plain" : "secondary"}
            />
          </View>
        </View>
      ) : null}

      {retryState.status === "skipped" ? (
        <View style={styles.bodyStack} testID="key-moment-skipped-state">
          <View style={styles.statusRow}>
            <Badge label={GAME_REVIEW_COPY.keyMoments.skippedTitle} tone="neutral" />
            {moment.bestMoveSan ? (
              <AppText testID="key-moment-best-reveal" variant="subheadline">
                {GAME_REVIEW_COPY.keyMoments.bestMoveReveal(
                  moment.bestMoveSan,
                  moment.bestEvalLabel
                )}
              </AppText>
            ) : null}
          </View>
          <View style={styles.actionsRow}>
            <Button
              label={GAME_REVIEW_COPY.keyMoments.retryAgain}
              onPress={onRetry}
              size="compact"
              testID="key-moment-retry-button"
              variant="secondary"
            />
            <Button
              label={
                inReview
                  ? GAME_REVIEW_COPY.keyMoments.inReview
                  : GAME_REVIEW_COPY.keyMoments.addToReview
              }
              onPress={onToggleReviewEnrollment}
              size="compact"
              testID="key-moment-review-toggle"
              variant={inReview ? "plain" : "secondary"}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function HeaderBar({
  current,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onSkip
}: {
  current: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip?: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.headerRow}>
      <AppText testID="key-moment-counter" tone="secondary" variant="footnote">
        {GAME_REVIEW_COPY.keyMoments.counter(current, total)}
      </AppText>
      <View style={styles.headerNavRow}>
        <Button
          disabled={!hasPrev}
          label={GAME_REVIEW_COPY.keyMoments.prev}
          onPress={onPrev}
          size="compact"
          testID="key-moment-prev"
          variant="plain"
        />
        <Button
          disabled={!hasNext}
          label={GAME_REVIEW_COPY.keyMoments.next}
          onPress={onNext}
          size="compact"
          testID="key-moment-next"
          variant="plain"
        />
        {onSkip ? (
          <Button
            label={GAME_REVIEW_COPY.keyMoments.skip}
            onPress={onSkip}
            size="compact"
            testID="key-moment-skip"
            variant="plain"
          />
        ) : null}
      </View>
    </View>
  );
}

function RefutationStepper({
  sanLine,
  currentStep,
  totalSteps,
  onBackward,
  onForward
}: {
  sanLine: string;
  currentStep: number;
  totalSteps: number;
  onBackward: () => void;
  onForward: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.refutationBox} testID="key-moment-punishment-line">
      <View style={styles.refutationHeader}>
        <AppText tone="secondary" variant="caption">
          {`${GAME_REVIEW_COPY.keyMoments.punishmentLineTitle} (${currentStep}/${totalSteps})`}
        </AppText>
        <View style={styles.refutationButtons}>
          <Button
            disabled={currentStep <= 0}
            label={GAME_REVIEW_COPY.keyMoments.stepBack}
            onPress={onBackward}
            size="compact"
            testID="key-moment-refutation-prev"
            variant="plain"
          />
          <Button
            disabled={currentStep >= totalSteps}
            label={GAME_REVIEW_COPY.keyMoments.stepForward}
            onPress={onForward}
            size="compact"
            testID="key-moment-refutation-next"
            variant="plain"
          />
        </View>
      </View>
      {sanLine ? (
        <AppText testID="key-moment-punishment-san" variant="subheadline">
          {sanLine}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  cardPositive: {
    borderColor: theme.colors.positive.s600
  },
  cardDanger: {
    borderColor: theme.colors.danger.s600
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  headerNavRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2
  },
  badgesRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  bodyStack: {
    gap: 8
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  candidatesRow: {
    flexDirection: "row",
    gap: 8
  },
  candidatePill: {
    alignItems: "center",
    backgroundColor: theme.colors.accent.s100,
    borderColor: theme.colors.accent.s300,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: theme.metrics.minTarget,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  candidatePillText: {
    backgroundColor: theme.colors.accent.s100,
    color: theme.colors.accent.s600
  },
  actionsRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  refutationBox: {
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.shape.control,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  refutationHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  refutationButtons: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2
  },
  pressed: {
    opacity: 0.72
  }
}));
