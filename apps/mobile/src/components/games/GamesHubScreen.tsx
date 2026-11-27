import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  importChessComGames,
  importLichessGames,
  importPgnBatch,
  UciEngineArbiter,
  type GameColor,
  type GameImportHttpClient,
  type GameReviewEngine,
  type PuzzleExtractionEngine
} from "../../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";
import type {
  LinkedGameAccount,
  LinkedGameAccountPlatform,
  StoredImportedGame
} from "../../../../../packages/storage/src/game-review-store.ts";
import type { AdaptiveLayout } from "../adaptivePracticeLayout.ts";
import type { MobileStockfishCapabilities } from "../../platform/mobilePlatformCapabilities.ts";
import { createPublicGameImportClient } from "../../platform/publicGameImportClient.ts";
import { makeStyles, useTheme } from "../../theme/index.ts";
import { useTranslation } from "../../i18n/index.ts";
import {
  AppText,
  Badge,
  Button,
  Icon,
  IconTile,
  Section
} from "../ui/index.tsx";
import { FilterButton } from "../practice/shared/FilterButton.tsx";
import { BatchAnalysisBanner } from "./BatchAnalysisBanner.tsx";
import { GamesImportModal, type GamesImportTab } from "./GamesImportModal.tsx";
import {
  GAMES_STATUS_FILTERS,
  GAMES_TIME_CLASS_FILTERS,
  gameImportErrorMessage,
  gameOpeningLabel,
  gameOpponentForUser,
  gameOutcomeForUser,
  gamePlatformLabel,
  gameRelativeDateLabel,
  gameResultLabel,
  gameResultShortLabel,
  gameTimeClassLabel,
  gameUserAccuracy,
  matchesGamesStatusFilter,
  matchesGamesTimeClassFilter,
  type GamesStatusFilter,
  type GamesTimeClassFilter
} from "./gamesPresentation.ts";
import {
  useGamesBatchAnalysis,
  type GamesBatchAnalysisState
} from "./useGamesBatchAnalysis.ts";

const MAX_RECENT_BATCH_GAMES = 5;

export interface GamesHubScreenProps {
  service: PracticeService;
  adaptiveLayout?: AdaptiveLayout;
  httpClient?: GameImportHttpClient;
  analysisEngine?: (GameReviewEngine & PuzzleExtractionEngine) | null;
  stockfish?: MobileStockfishCapabilities;
  nowMs?: number;
  onOpenGameReview: (gameId: string) => void;
  onPracticeMyGamePuzzles?: () => void;
  importModalVisible?: boolean;
  onImportModalVisibleChange?: (visible: boolean) => void;
  initialImportTab?: GamesImportTab;
  initialError?: string | null;
  initialBatchState?: GamesBatchAnalysisState;
  onStoreMutated?: () => void;
}

export function GamesHubScreen({
  service,
  adaptiveLayout,
  httpClient,
  analysisEngine,
  stockfish,
  nowMs = Date.now(),
  onOpenGameReview,
  onPracticeMyGamePuzzles,
  importModalVisible,
  onImportModalVisibleChange,
  initialImportTab = "chess_com",
  initialError = null,
  initialBatchState,
  onStoreMutated
}: GamesHubScreenProps): React.JSX.Element {
  const styles = useStyles();
  const { locale, t } = useTranslation();

  const [revision, setRevision] = useState(0);
  const [statusFilter, setStatusFilter] = useState<GamesStatusFilter>("all");
  const [timeClassFilter, setTimeClassFilter] = useState<GamesTimeClassFilter>("all");
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<GamesImportTab>(initialImportTab);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(initialError);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalStatus, setModalStatus] = useState<string | null>(null);

  const modalOpen = importModalVisible ?? internalModalOpen;
  const setModalOpen = useCallback(
    (next: boolean): void => {
      if (onImportModalVisibleChange) {
        onImportModalVisibleChange(next);
      } else {
        setInternalModalOpen(next);
      }
    },
    [onImportModalVisibleChange]
  );

  const refreshHub = useCallback((): void => {
    setRevision((current) => current + 1);
    onStoreMutated?.();
  }, [onStoreMutated]);

  const arbiterRef = useRef<UciEngineArbiter | null>(null);
  const defaultHttpClientRef = useRef<GameImportHttpClient | null>(null);

  const resolveHttpClient = useCallback((): GameImportHttpClient => {
    if (httpClient) {
      return httpClient;
    }
    defaultHttpClientRef.current ??= createPublicGameImportClient();
    return defaultHttpClientRef.current;
  }, [httpClient]);

  const resolveAnalysisEngine = useCallback((): (GameReviewEngine & PuzzleExtractionEngine) | null => {
    if (analysisEngine !== undefined) {
      return analysisEngine;
    }
    if (arbiterRef.current) {
      return arbiterRef.current;
    }
    const transport = stockfish?.createTransport() ?? null;
    if (!transport) {
      return null;
    }
    arbiterRef.current = new UciEngineArbiter(transport);
    return arbiterRef.current;
  }, [analysisEngine, stockfish]);

  useEffect(() => {
    return () => {
      arbiterRef.current?.terminate();
      arbiterRef.current = null;
    };
  }, []);

  const batch = useGamesBatchAnalysis({
    store: service.gameReviewStore,
    getEngine: resolveAnalysisEngine,
    onGameUpdated: refreshHub,
    ...(initialBatchState ? { initialState: initialBatchState } : {})
  });

  const snapshot = useMemo(() => {
    void revision;
    const allGames = service.listImportedGames();
    const linkedAccounts = service.listLinkedAccounts();
    const userPuzzleCount = service.countUserPuzzles();
    return { allGames, linkedAccounts, userPuzzleCount };
  }, [revision, service]);

  const filteredGames = useMemo(
    () =>
      snapshot.allGames.filter(
        (game) =>
          matchesGamesStatusFilter(game.analysisStatus, statusFilter) &&
          matchesGamesTimeClassFilter(game.timeClass, timeClassFilter)
      ),
    [snapshot.allGames, statusFilter, timeClassFilter]
  );

  const unanalyzedGames = useMemo(
    () => snapshot.allGames.filter((game) => game.analysisStatus !== "complete"),
    [snapshot.allGames]
  );

  const openModal = useCallback(
    (tab: GamesImportTab): void => {
      setModalInitialTab(tab);
      setModalError(null);
      setModalStatus(null);
      setModalOpen(true);
    },
    [setModalOpen]
  );

  const syncAccount = useCallback(
    async (
      account: { platform: LinkedGameAccountPlatform; username: string; since?: string },
      maxGames: number
    ): Promise<{ inserted: number; skipped: number }> => {
      const client = resolveHttpClient();
      const drafts =
        account.platform === "chess_com"
          ? await importChessComGames(client, {
              username: account.username,
              maxGames,
              ...(account.since ? { since: account.since } : {})
            })
          : await importLichessGames(client, {
              username: account.username,
              maxGames,
              ...(account.since ? { since: account.since } : {})
            });
      const syncedAt = new Date(nowMs).toISOString();
      const upsertResult = service.upsertImportedGames(drafts, syncedAt);
      service.upsertLinkedAccount({
        platform: account.platform,
        username: account.username,
        lastSyncedAt: syncedAt
      });
      refreshHub();
      return { inserted: upsertResult.inserted, skipped: upsertResult.skipped };
    },
    [nowMs, refreshHub, resolveHttpClient, service]
  );

  const handleLinkAndSync = useCallback(
    async ({
      platform,
      username,
      maxGames
    }: {
      platform: LinkedGameAccountPlatform;
      username: string;
      maxGames: number;
    }): Promise<void> => {
      setSyncing(true);
      setModalError(null);
      setModalStatus(null);
      setHubError(null);
      try {
        const result = await syncAccount({ platform, username }, maxGames);
        const summary =
          result.inserted > 0
            ? t("games.sync.added", { count: result.inserted })
            : t("games.sync.upToDate");
        setSyncSummary(summary);
        setModalStatus(
          result.skipped > 0
            ? t("games.import.summaryWithSkipped", {
                imported: result.inserted,
                skipped: result.skipped
              })
            : t("games.import.summary", { count: result.inserted })
        );
        setModalOpen(false);
      } catch (error) {
        const message = gameImportErrorMessage(error, locale);
        setModalError(message);
      } finally {
        setSyncing(false);
      }
    },
    [locale, setModalOpen, syncAccount, t]
  );

  const handleSyncAllLinked = useCallback(async (): Promise<void> => {
    if (syncing || snapshot.linkedAccounts.length === 0) {
      return;
    }
    setSyncing(true);
    setHubError(null);
    setSyncSummary(null);
    try {
      let totalInserted = 0;
      for (const account of snapshot.linkedAccounts) {
        const result = await syncAccount(
          {
            platform: account.platform,
            username: account.username,
            ...(account.lastSyncedAt ? { since: account.lastSyncedAt } : {})
          },
          50
        );
        totalInserted += result.inserted;
      }
      setSyncSummary(
        totalInserted > 0
          ? t("games.sync.added", { count: totalInserted })
          : t("games.sync.upToDate")
      );
    } catch (error) {
      setHubError(gameImportErrorMessage(error, locale));
    } finally {
      setSyncing(false);
    }
  }, [locale, snapshot.linkedAccounts, syncAccount, syncing, t]);

  const handleRemoveAccount = useCallback(
    (platform: LinkedGameAccountPlatform, username: string): void => {
      service.removeLinkedAccount(platform, username);
      refreshHub();
    },
    [refreshHub, service]
  );

  const handleImportPgn = useCallback(
    ({ pgnText, defaultUserColor }: { pgnText: string; defaultUserColor: GameColor }): void => {
      setModalError(null);
      setModalStatus(null);
      setHubError(null);
      const preferredUsernames = snapshot.linkedAccounts.map((account) => account.username);
      const parsed = importPgnBatch(pgnText, {
        preferredUsernames,
        defaultUserColor,
        fallbackPlayedAt: new Date(nowMs).toISOString()
      });
      if (parsed.games.length === 0) {
        setModalError(t("games.error.invalidPgn"));
        return;
      }
      const upsert = service.upsertImportedGames(parsed.games, new Date(nowMs).toISOString());
      const totalSkipped = parsed.skippedCount + upsert.skipped;
      const summary =
        totalSkipped > 0
          ? t("games.import.summaryWithSkipped", {
              imported: upsert.inserted,
              skipped: totalSkipped
            })
          : t("games.import.summary", { count: upsert.inserted });
      setSyncSummary(summary);
      setModalStatus(summary);
      refreshHub();
    },
    [nowMs, refreshHub, service, snapshot.linkedAccounts, t]
  );

  const handleAnalyzeRecent = useCallback((): void => {
    const targets = unanalyzedGames.slice(0, MAX_RECENT_BATCH_GAMES);
    if (targets.length === 0) {
      return;
    }
    batch.startBatch(targets);
  }, [batch, unanalyzedGames]);

  const isEmpty = snapshot.allGames.length === 0;
  const batchBusy = batch.state.status === "running";

  return (
    <View
      style={[
        styles.container,
        adaptiveLayout?.usesWideContent ? styles.containerWide : null
      ]}
      testID="games-hub-screen"
    >
      <View style={styles.headerRow} testID="games-header">
        <AppText accessibilityRole="header" style={styles.headerTitle} variant="largeTitle">
          {t("tabs.games")}
        </AppText>
        {!isEmpty ? (
          <Button
            icon="add"
            label={t("games.action.import")}
            size="compact"
            testID="games-header-import"
            variant="secondary"
            onPress={() => openModal("chess_com")}
          />
        ) : null}
      </View>

      {hubError ? (
        <View style={styles.errorBanner} testID="games-hub-error">
          <AppText style={styles.errorText} variant="subheadline">
            {hubError}
          </AppText>
          <View style={styles.errorActions}>
            {snapshot.linkedAccounts.length > 0 ? (
              <Button
                label={t("games.action.retry")}
                size="compact"
                testID="games-hub-error-retry"
                variant="secondary"
                onPress={() => {
                  void handleSyncAllLinked();
                }}
              />
            ) : null}
            <Button
              label={t("games.action.dismiss")}
              size="compact"
              testID="games-hub-error-dismiss"
              variant="plain"
              onPress={() => setHubError(null)}
            />
          </View>
        </View>
      ) : null}

      {isEmpty ? (
        <Section style={styles.emptySection} testID="games-empty-state">
          <View style={styles.emptyContent}>
            <IconTile name="tabGames" tone="accent" />
            <AppText style={styles.emptyTitle} variant="title">
              {t("games.empty.title")}
            </AppText>
            {snapshot.linkedAccounts.length > 0 ? (
              <View style={styles.linkedPillsRow}>
                {snapshot.linkedAccounts.map((account) => (
                  <LinkedAccountPill
                    key={`${account.platform}:${account.username}`}
                    account={account}
                    onPress={() => openModal(account.platform)}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.emptyActions}>
              {snapshot.linkedAccounts.length > 0 ? (
                <Button
                  disabled={syncing}
                  label={syncing ? t("games.action.syncing") : t("games.action.sync")}
                  stretch
                  testID="games-empty-sync"
                  onPress={() => {
                    void handleSyncAllLinked();
                  }}
                />
              ) : (
                <Button
                  label={t("games.empty.linkAccount")}
                  stretch
                  testID="games-empty-link-account"
                  onPress={() => openModal("chess_com")}
                />
              )}
              <Button
                label={t("games.empty.importPgn")}
                stretch
                testID="games-empty-import-pgn"
                variant="secondary"
                onPress={() => openModal("pgn")}
              />
            </View>
          </View>
        </Section>
      ) : (
        <>
          <View style={styles.controlsStrip} testID="games-top-bar">
            {snapshot.linkedAccounts.length > 0 || syncSummary ? (
              <View style={styles.accountRow}>
                {snapshot.linkedAccounts.map((account) => (
                  <LinkedAccountPill
                    key={`${account.platform}:${account.username}`}
                    account={account}
                    onPress={() => openModal(account.platform)}
                  />
                ))}
                {snapshot.linkedAccounts.length > 0 ? (
                  <Button
                    disabled={syncing}
                    label={syncing ? t("games.action.syncing") : t("games.action.sync")}
                    size="compact"
                    testID="games-sync-button"
                    variant="secondary"
                    onPress={() => {
                      void handleSyncAllLinked();
                    }}
                  />
                ) : null}
                {syncSummary ? (
                  <Badge
                    label={syncSummary}
                    testID="games-sync-summary"
                    tone="positive"
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.quickActionRow}>
              {snapshot.userPuzzleCount > 0 && onPracticeMyGamePuzzles ? (
                <Button
                  icon="play"
                  label={t("games.action.practicePuzzles", { count: snapshot.userPuzzleCount })}
                  stretch
                  testID="games-practice-puzzles-cta"
                  onPress={onPracticeMyGamePuzzles}
                />
              ) : null}
              <View style={styles.secondaryActionRow}>
                {unanalyzedGames.length > 0 && !batchBusy ? (
                  <Button
                    label={t("games.action.analyzeRecent")}
                    size="compact"
                    testID="games-analyze-recent"
                    variant="secondary"
                    onPress={handleAnalyzeRecent}
                  />
                ) : null}
                <Button
                  label={t("games.action.importPgn")}
                  size="compact"
                  testID="games-import-pgn-button"
                  variant="secondary"
                  onPress={() => openModal("pgn")}
                />
              </View>
            </View>
          </View>

          <BatchAnalysisBanner
            state={batch.state}
            onCancel={batch.cancel}
            onDismiss={batch.dismiss}
            onPause={batch.pause}
            onResume={batch.resume}
          />

          <View style={styles.filtersBlock} testID="games-filters">
            <View
              accessibilityLabel={t("games.filter.statusA11y")}
              style={styles.filterRow}
              testID="games-status-filters"
            >
              {GAMES_STATUS_FILTERS.map((filter) => (
                <FilterButton
                  key={filter}
                  active={statusFilter === filter}
                  label={t(`games.filter.${filter}`)}
                  testID={`games-filter-status-${filter}`}
                  onPress={() => setStatusFilter(filter)}
                />
              ))}
            </View>
            <ScrollView
              accessibilityLabel={t("games.filter.timeClassA11y")}
              horizontal
              showsHorizontalScrollIndicator={false}
              testID="games-time-class-filters"
            >
              <View style={styles.filterRow}>
                {GAMES_TIME_CLASS_FILTERS.map((filter) => (
                  <FilterButton
                    key={filter}
                    active={timeClassFilter === filter}
                    label={
                      filter === "all"
                        ? t("games.filter.all")
                        : gameTimeClassLabel(filter, locale)
                    }
                    testID={`games-filter-time-${filter}`}
                    onPress={() => setTimeClassFilter(filter)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {filteredGames.length === 0 ? (
            <Section testID="games-filtered-empty">
              <View style={styles.filteredEmptyContent}>
                <AppText tone="secondary" variant="body">
                  {t("games.filter.filteredEmpty")}
                </AppText>
                <Button
                  label={t("games.action.resetFilters")}
                  size="compact"
                  testID="games-reset-filters"
                  variant="secondary"
                  onPress={() => {
                    setStatusFilter("all");
                    setTimeClassFilter("all");
                  }}
                />
              </View>
            </Section>
          ) : (
            <Section rows testID="games-list">
              {filteredGames.map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  nowMs={nowMs}
                  onPress={() => onOpenGameReview(game.id)}
                />
              ))}
            </Section>
          )}
        </>
      )}

      <GamesImportModal
        busy={syncing}
        errorMessage={modalError}
        initialTab={modalInitialTab}
        linkedAccounts={snapshot.linkedAccounts}
        statusMessage={modalStatus}
        visible={modalOpen}
        onClearFeedback={() => {
          setModalError(null);
          setModalStatus(null);
        }}
        onClose={() => setModalOpen(false)}
        onImportPgn={handleImportPgn}
        onLinkAndSync={handleLinkAndSync}
        onRemoveAccount={handleRemoveAccount}
      />
    </View>
  );
}

function LinkedAccountPill({
  account,
  onPress
}: {
  account: LinkedGameAccount;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const { locale } = useTranslation();
  const platformLabel = gamePlatformLabel(account.platform, locale);
  return (
    <Pressable
      accessibilityLabel={`${platformLabel}: ${account.username}`}
      accessibilityRole="button"
      style={({ pressed }) => [styles.accountPill, pressed ? styles.pressed : null]}
      testID={`games-account-pill-${account.platform}-${account.username}`}
      onPress={onPress}
    >
      <AppText style={styles.accountPillText} variant="footnote">
        {`${platformLabel} · ${account.username}`}
      </AppText>
    </Pressable>
  );
}

function GameRow({
  game,
  nowMs,
  onPress
}: {
  game: StoredImportedGame;
  nowMs: number;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, t } = useTranslation();

  const outcome = gameOutcomeForUser(game);
  const opponent = gameOpponentForUser(game);
  const accuracy = gameUserAccuracy(game);
  const timeClass = gameTimeClassLabel(game.timeClass, locale);
  const opening = gameOpeningLabel(game);
  const dateLabel = gameRelativeDateLabel(game.playedAt, nowMs, locale);

  const opponentLine = opponent.rating !== undefined
    ? `${opponent.username} (${opponent.rating})`
    : opponent.username;
  const metaLine = [timeClass, opening, dateLabel].filter(Boolean).join(" · ");

  const accentStyle =
    outcome === "win"
      ? styles.resultBarWin
      : outcome === "loss"
        ? styles.resultBarLoss
        : styles.resultBarDraw;

  const badgeTone =
    outcome === "win"
      ? "positive"
      : outcome === "loss"
        ? "negative"
        : "neutral";

  const statusSlot = (() => {
    if (game.analysisStatus === "complete") {
      const label =
        accuracy !== undefined
          ? game.puzzleCount > 0
            ? t("games.row.accuracyWithPuzzles", {
                percent: accuracy,
                puzzles: t("common.puzzlesCount", { count: game.puzzleCount })
              })
            : t("games.row.accuracy", { percent: accuracy })
          : game.puzzleCount > 0
            ? t("common.puzzlesCount", { count: game.puzzleCount })
            : t("games.action.review");
      return (
        <View style={styles.completeStatus}>
          <AppText testID={`game-row-status-${game.id}`} tone="accent" variant="footnote">
            {label}
          </AppText>
          <Icon color={theme.colors.text.tertiary} name="chevronRight" size={15} weight="semibold" />
        </View>
      );
    }
    if (game.analysisStatus === "partial" || game.analysisStatus === "pass1_done") {
      return (
        <Badge
          label={t("games.action.resume")}
          testID={`game-row-status-${game.id}`}
          tone="warning"
        />
      );
    }
    return (
      <Badge
        label={t("games.action.review")}
        testID={`game-row-status-${game.id}`}
        tone="accent"
      />
    );
  })();

  return (
    <Pressable
      accessibilityLabel={t("games.row.openA11y", {
        result: gameResultLabel(outcome, locale),
        opponent: opponentLine,
        meta: metaLine
      })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.gameRow, pressed ? styles.gameRowPressed : null]}
      testID={`game-row-${game.id}`}
      onPress={onPress}
    >
      <View style={[styles.resultBar, accentStyle]} />
      <Badge
        label={gameResultShortLabel(outcome, locale)}
        testID={`game-row-result-${game.id}`}
        tone={badgeTone}
      />
      <View style={styles.gameRowCopy}>
        <AppText ellipsizeMode="tail" numberOfLines={1} variant="headline">
          {opponentLine}
        </AppText>
        <AppText ellipsizeMode="tail" numberOfLines={1} tone="secondary" variant="footnote">
          {metaLine}
        </AppText>
      </View>
      <View style={styles.gameRowTrailing}>{statusSlot}</View>
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    gap: theme.spacing.group,
    width: "100%"
  },
  containerWide: {
    alignSelf: "center",
    maxWidth: 760
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: theme.metrics.minTarget
  },
  headerTitle: {
    flex: 1,
    flexShrink: 1
  },
  emptySection: {
    marginTop: 8
  },
  emptyContent: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 16
  },
  emptyTitle: {
    textAlign: "center"
  },
  emptyActions: {
    alignSelf: "stretch",
    gap: 10
  },
  linkedPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center"
  },
  controlsStrip: {
    gap: 10
  },
  accountRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  accountPill: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  accountPillText: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text.primary
  },
  pressed: {
    opacity: 0.7
  },
  quickActionRow: {
    gap: 10
  },
  secondaryActionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filtersBlock: {
    gap: 8
  },
  filterRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  errorBanner: {
    backgroundColor: theme.colors.danger.s100,
    borderRadius: theme.shape.card,
    gap: 8,
    padding: 12
  },
  errorText: {
    backgroundColor: theme.colors.danger.s100,
    color: theme.colors.danger.s600
  },
  errorActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filteredEmptyContent: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 12
  },
  gameRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    gap: 10,
    minHeight: theme.metrics.rowMinHeight + 6,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  gameRowPressed: {
    backgroundColor: theme.colors.surfaceStrong
  },
  resultBar: {
    alignSelf: "stretch",
    borderRadius: 2,
    width: 4
  },
  resultBarWin: {
    backgroundColor: theme.colors.positive.s600
  },
  resultBarLoss: {
    backgroundColor: theme.colors.danger.s600
  },
  resultBarDraw: {
    backgroundColor: theme.colors.border.strong
  },
  gameRowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  gameRowTrailing: {
    alignItems: "flex-end",
    flexShrink: 0
  },
  completeStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  }
}));
