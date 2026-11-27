import React from "react";
import { Pressable, View } from "react-native";
import { curatedPuzzleThemes } from "../../../../../packages/core/src/index.ts";
import type { StoredUserPuzzle } from "../../../../../packages/storage/src/game-review-store.ts";
import { makeStyles } from "../../theme/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import { customThemeLabel } from "../practice/shared/themeCatalog.ts";
import { AppText, Badge, Button } from "../ui/index.tsx";
import type { GameReviewSummaryData, SideClassificationCounts } from "./gameReviewTypes.ts";

export interface GameReviewSummaryCardProps {
  summary: GameReviewSummaryData;
  whitePlayerName: string;
  blackPlayerName: string;
  enrolledPuzzleIds: ReadonlySet<string>;
  onSelectPuzzle?: (puzzle: StoredUserPuzzle) => void;
  onToggleReviewEnrollment: (puzzle: StoredUserPuzzle) => void;
  onEnrollAllPuzzles?: () => void;
  onPracticeGamePuzzles?: () => void;
  testID?: string;
}

export function GameReviewSummaryCard({
  summary,
  whitePlayerName,
  blackPlayerName,
  enrolledPuzzleIds,
  onSelectPuzzle,
  onToggleReviewEnrollment,
  onEnrollAllPuzzles,
  onPracticeGamePuzzles,
  testID = "game-review-summary-card"
}: GameReviewSummaryCardProps): React.JSX.Element {
  const styles = useStyles();
  const { locale, t } = useTranslation();
  const { puzzles } = summary;
  const allPuzzlesInReview =
    puzzles.length > 0 && puzzles.every((puzzle) => enrolledPuzzleIds.has(puzzle.id));
  const whiteLabel = t("common.white");
  const blackLabel = t("common.black");
  const resolvedWhiteName =
    !whitePlayerName || whitePlayerName === "White" ? whiteLabel : whitePlayerName;
  const resolvedBlackName =
    !blackPlayerName || blackPlayerName === "Black" ? blackLabel : blackPlayerName;

  return (
    <View style={styles.container} testID={testID}>
      <AppText variant="headline">{t("gameReview.summary.title")}</AppText>

      <View style={styles.accuracyRow} testID="game-review-accuracy-strip">
        <AccuracyColumn
          counts={summary.white}
          highlight={summary.userColor === "w"}
          name={resolvedWhiteName}
          sideLabel={whiteLabel}
          testID="game-review-accuracy-white"
        />
        <AccuracyColumn
          counts={summary.black}
          highlight={summary.userColor === "b"}
          name={resolvedBlackName}
          sideLabel={blackLabel}
          testID="game-review-accuracy-black"
        />
      </View>

      <View style={styles.countsTable} testID="game-review-classification-counts">
        <ClassificationCountRow
          blackCount={summary.black.best}
          label={t("gameReview.classification.best")}
          tone="positive"
          whiteCount={summary.white.best}
        />
        <ClassificationCountRow
          blackCount={summary.black.inaccuracy}
          label={t("gameReview.classification.inaccuracy")}
          tone="warning"
          whiteCount={summary.white.inaccuracy}
        />
        <ClassificationCountRow
          blackCount={summary.black.mistake}
          label={t("gameReview.classification.mistake")}
          tone="warning"
          whiteCount={summary.white.mistake}
        />
        <ClassificationCountRow
          blackCount={summary.black.blunder}
          label={t("gameReview.classification.blunder")}
          tone="negative"
          whiteCount={summary.white.blunder}
        />
        <ClassificationCountRow
          blackCount={summary.black.missedWin}
          label={t("gameReview.classification.missed_win")}
          tone="warning"
          whiteCount={summary.white.missedWin}
        />
      </View>

      <View style={styles.puzzlesSection} testID="game-review-summary-puzzles">
        <View style={styles.puzzlesHeaderRow}>
          <AppText style={styles.puzzlesTitleText} variant="subheadline">
            {t("gameReview.summary.puzzlesCount", { count: puzzles.length })}
          </AppText>
          {puzzles.length > 1 && onEnrollAllPuzzles ? (
            <Button
              disabled={allPuzzlesInReview}
              label={
                allPuzzlesInReview
                  ? t("games.puzzles.allInReview")
                  : t("games.puzzles.addAllToReview")
              }
              onPress={onEnrollAllPuzzles}
              size="compact"
              testID="game-review-add-all-review"
              variant={allPuzzlesInReview ? "plain" : "secondary"}
            />
          ) : null}
        </View>

        {puzzles.length === 0 ? (
          <AppText tone="secondary" variant="footnote">
            {t("gameReview.summary.noPuzzles")}
          </AppText>
        ) : (
          <View style={styles.puzzlesList}>
            {puzzles.map((puzzle) => {
              const inReview = enrolledPuzzleIds.has(puzzle.id);
              const curatedThemes = curatedPuzzleThemes(puzzle.themes);
              const kindLabel =
                puzzle.puzzleKind === "arrow_duel"
                  ? t("common.arrowDuel")
                  : t("gameReview.summary.kindLine");

              return (
                <View
                  key={puzzle.id}
                  style={styles.puzzleRow}
                  testID={`summary-puzzle-row-${puzzle.id}`}
                >
                  <Pressable
                    accessibilityRole="button"
                    disabled={!onSelectPuzzle}
                    onPress={() => onSelectPuzzle?.(puzzle)}
                    style={styles.puzzleMeta}
                    testID={`summary-puzzle-open-${puzzle.id}`}
                  >
                    <View style={styles.puzzleBadges}>
                      <Badge label={kindLabel} tone="accent" />
                      <Badge
                        label={t("games.puzzles.moveOnly", { move: puzzle.gameMoveNumber })}
                        tone="neutral"
                      />
                    </View>
                    {curatedThemes.length > 0 ? (
                      <View style={styles.themeTagsRow}>
                        {curatedThemes.slice(0, 3).map((themeId) => (
                          <Badge
                            key={themeId}
                            label={customThemeLabel(themeId, locale)}
                            tone="neutral"
                          />
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                  <Button
                    label={
                      inReview
                        ? t("games.puzzles.inReview")
                        : t("games.puzzles.addToReview")
                    }
                    onPress={() => onToggleReviewEnrollment(puzzle)}
                    size="compact"
                    testID={`summary-puzzle-review-toggle-${puzzle.id}`}
                    variant={inReview ? "plain" : "secondary"}
                  />
                </View>
              );
            })}
          </View>
        )}

        {puzzles.length > 0 && onPracticeGamePuzzles ? (
          <Button
            label={t("gameReview.summary.practiceGamePuzzles")}
            onPress={onPracticeGamePuzzles}
            stretch
            testID="game-review-practice-puzzles-cta"
            variant="primary"
          />
        ) : null}
      </View>
    </View>
  );
}

function AccuracyColumn({
  sideLabel,
  name,
  counts,
  highlight,
  testID
}: {
  sideLabel: string;
  name: string;
  counts: SideClassificationCounts;
  highlight: boolean;
  testID: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      style={[styles.accuracyCard, highlight ? styles.accuracyCardActive : null]}
      testID={testID}
    >
      <AppText numberOfLines={1} tone="secondary" variant="caption">
        {sideLabel}
      </AppText>
      <AppText numberOfLines={1} variant="footnote">
        {name}
      </AppText>
      <AppText testID={`${testID}-value`} variant="numeralLarge">
        {`${Math.round(counts.accuracy)}%`}
      </AppText>
    </View>
  );
}

function ClassificationCountRow({
  label,
  whiteCount,
  blackCount,
  tone
}: {
  label: string;
  whiteCount: number;
  blackCount: number;
  tone: "positive" | "warning" | "negative";
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.countRow}>
      <AppText style={styles.countNumeral} variant="numeralRow">
        {String(whiteCount)}
      </AppText>
      <AppText style={styles.countLabel} tone={tone} variant="footnote">
        {label}
      </AppText>
      <AppText style={styles.countNumeral} variant="numeralRow">
        {String(blackCount)}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  accuracyRow: {
    flexDirection: "row",
    gap: 8
  },
  accuracyCard: {
    backgroundColor: theme.colors.surfaceSunken,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  accuracyCardActive: {
    borderColor: theme.colors.accent.s400
  },
  countsTable: {
    gap: 4
  },
  countRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2
  },
  countNumeral: {
    minWidth: 32,
    textAlign: "center"
  },
  countLabel: {
    flex: 1,
    textAlign: "center"
  },
  puzzlesSection: {
    borderTopColor: theme.colors.border.default,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 10
  },
  puzzlesHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  puzzlesTitleText: {
    flexShrink: 1
  },
  puzzlesList: {
    gap: 8
  },
  puzzleRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.shape.control,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    padding: 10
  },
  puzzleMeta: {
    flex: 1,
    gap: 6,
    minWidth: 150
  },
  puzzleBadges: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  themeTagsRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4
  }
}));
