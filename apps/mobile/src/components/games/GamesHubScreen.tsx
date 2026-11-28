import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type AppStateStatus
} from "react-native";
import {
  curatedPuzzleThemes,
  defaultOnboardingGuideProgress,
  diagnoseInGameWeaknesses,
  importChessComGames,
  importLichessGames,
  importPgnBatch,
  isWithinReviewDifficultyBand,
  normalizeGameRatingToPuzzleScale,
  selectRecommendedGamePuzzleIds,
  UciEngineArbiter,
  type GameColor,
  type GameImportHttpClient,
  type GameReviewEngine,
  type PuzzleExtractionEngine
} from "../../../../../packages/core/src/index.ts";
import {
  DEFAULT_GAME_REVIEW_AUTO_SYNC_COOLDOWN_MINUTES
} from "../../../../../packages/storage/src/practice-store.ts";
import type { PracticeService } from "../../../../../packages/storage/src/practice-service.ts";
import {
  USER_GAME_RATING_KEY_PREFIX,
  type LinkedGameAccount,
  type LinkedGameAccountPlatform,
  type StoredImportedGame,
  type StoredUserPuzzle
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
  Section,
  SegmentedControl
} from "../ui/index.tsx";
import { AppModal } from "../AppModal.tsx";
import { ContextualGuideCard } from "../ContextualGuideCard.tsx";
import { SafeAreaModalBackdrop } from "../SafeAreaModalBackdrop.tsx";
import { CollapsibleRegion } from "../practice/shared/CollapsibleRegion.tsx";
import { FilterButton } from "../practice/shared/FilterButton.tsx";
import { FilterGlyph } from "../practice/shared/Glyphs.tsx";
import { customThemeLabel } from "../practice/shared/themeCatalog.ts";
import { ToolbarIconButton } from "../practice/shared/ToolbarIconButton.tsx";
import { BatchAnalysisBanner } from "./BatchAnalysisBanner.tsx";
import { GamesImportModal, type GamesImportTab } from "./GamesImportModal.tsx";
import { InGameDiagnosisCard } from "./InGameDiagnosisCard.tsx";
import {
  GAMES_STATUS_FILTERS,
  GAMES_TIME_CLASS_FILTERS,
  gameImportErrorMessage,
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
  type GamesBatchAnalysisController,
  type GamesBatchAnalysisState
} from "./useGamesBatchAnalysis.ts";
import { useUserPuzzleDifficultyBackfill } from "./useUserPuzzleDifficultyBackfill.ts";

export interface MyGamePuzzlesLaunchOptions {
  mode?: "standard" | "arrow_duel";
  timeClass?: string;
  themes?: string[];
  gameId?: string;
  puzzleIds?: string[];
  initialIndex?: number;
}

const GAMES_PAGE_SIZE = 50;
const PUZZLES_PAGE_SIZE = 20;
export const AUTO_SYNC_STALE_MS = DEFAULT_GAME_REVIEW_AUTO_SYNC_COOLDOWN_MINUTES * 60 * 1000;

export function linkedAccountsNeedingAutoSync(
  accounts: readonly LinkedGameAccount[],
  nowMs: number,
  staleMs: number = AUTO_SYNC_STALE_MS
): LinkedGameAccount[] {
  const effectiveStaleMs = Math.max(0, staleMs);
  return accounts.filter((account) => {
    if (!account.lastSyncedAt) {
      return true;
    }
    const lastSyncedMs = Date.parse(account.lastSyncedAt);
    if (!Number.isFinite(lastSyncedMs)) {
      return true;
    }
    return nowMs - lastSyncedMs >= effectiveStaleMs;
  });
}

export interface GamesHubScreenProps {
  service: PracticeService;
  adaptiveLayout?: AdaptiveLayout;
  httpClient?: GameImportHttpClient;
  analysisEngine?: (GameReviewEngine & PuzzleExtractionEngine) | null;
  stockfish?: MobileStockfishCapabilities;
  nowMs?: number;
  getNowMs?: () => number;
  onOpenGameReview: (gameId: string) => void;
  onPracticeMyGamePuzzles?: (options?: MyGamePuzzlesLaunchOptions) => void;
  onPlayWithMaia?: () => void;
  hubView?: "games" | "puzzles";
  initialHubView?: "games" | "puzzles";
  onHubViewChange?: (view: "games" | "puzzles") => void;
  importModalVisible?: boolean;
  onImportModalVisibleChange?: (visible: boolean) => void;
  initialImportTab?: GamesImportTab;
  initialError?: string | null;
  initialBatchState?: GamesBatchAnalysisState;
  batchController?: GamesBatchAnalysisController;
  autoSyncOnMount?: boolean;
  autoSyncStaleMs?: number;
  onStoreMutated?: () => void;
}

export function GamesHubScreen({
  service,
  adaptiveLayout,
  httpClient,
  analysisEngine,
  stockfish,
  nowMs: nowMsProp,
  getNowMs,
  onOpenGameReview,
  onPracticeMyGamePuzzles,
  onPlayWithMaia,
  hubView: controlledHubView,
  initialHubView = "games",
  onHubViewChange,
  importModalVisible,
  onImportModalVisibleChange,
  initialImportTab = "chess_com",
  initialError = null,
  initialBatchState,
  batchController,
  autoSyncOnMount = false,
  autoSyncStaleMs,
  onStoreMutated
}: GamesHubScreenProps): React.JSX.Element {
  const nowMs = nowMsProp ?? Date.now();
  const resolveNowMs = useCallback((): number => {
    if (getNowMs) {
      return getNowMs();
    }
    if (nowMsProp !== undefined) {
      return nowMsProp;
    }
    return Date.now();
  }, [getNowMs, nowMsProp]);
  const styles = useStyles();
  const theme = useTheme();
  const { locale, t } = useTranslation();

  const [revision, setRevision] = useState(0);
  const [internalHubView, setInternalHubView] = useState<"games" | "puzzles">(initialHubView);
  const hubView = controlledHubView ?? internalHubView;
  const setHubView = useCallback(
    (next: "games" | "puzzles"): void => {
      if (controlledHubView === undefined) {
        setInternalHubView(next);
      }
      onHubViewChange?.(next);
    },
    [controlledHubView, onHubViewChange]
  );
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<GamesStatusFilter>("all");
  const [timeClassFilter, setTimeClassFilter] = useState<GamesTimeClassFilter>("all");
  const [puzzleKindFilter, setPuzzleKindFilter] = useState<"all" | "arrow_duel" | "line">("all");
  const [puzzleDifficultyFilter, setPuzzleDifficultyFilter] = useState<
    "all" | "at_level" | "stretch"
  >("all");
  const [puzzleThemeFilter, setPuzzleThemeFilter] = useState<string>("all");
  const [visibleGamesLimit, setVisibleGamesLimit] = useState<number>(GAMES_PAGE_SIZE);
  const [visiblePuzzlesLimit, setVisiblePuzzlesLimit] = useState<number>(PUZZLES_PAGE_SIZE);
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [olderPickerOpen, setOlderPickerOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<GamesImportTab>(initialImportTab);
  const [syncing, setSyncing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hubError, setHubError] = useState<string | null>(initialError);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalStatus, setModalStatus] = useState<string | null>(null);
  const [recommendedInfoOpen, setRecommendedInfoOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedGameIds, setSelectedGameIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

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

  const localBatch = useGamesBatchAnalysis({
    store: service.gameReviewStore,
    practiceService: service,
    getEngine: resolveAnalysisEngine,
    onGameUpdated: refreshHub,
    disabled: Boolean(batchController),
    ...(initialBatchState ? { initialState: initialBatchState } : {})
  });
  const batch = batchController ?? localBatch;

  const snapshot = useMemo(() => {
    void revision;
    void batch.state.completedGames;
    void batch.state.status;
    const allGames = service.listImportedGames();
    const linkedAccounts = service.listLinkedAccounts();
    const userPuzzles = service.listUserPuzzles();
    const userPuzzleCount = userPuzzles.length;
    const gameById = new Map<string, StoredImportedGame>();
    const gameOrderById = new Map<string, number>();
    allGames.forEach((game, index) => {
      gameById.set(game.id, game);
      gameOrderById.set(game.id, index);
    });
    const orderedUserPuzzles = [...userPuzzles].sort((left, right) => {
      const leftOrder = gameOrderById.get(left.gameId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = gameOrderById.get(right.gameId) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.gamePly - right.gamePly || left.id.localeCompare(right.id);
    });
    const enrolledKeySet = new Set<string>();
    for (const review of service.listReviewQueue()) {
      enrolledKeySet.add(`${review.puzzleId}|${review.mode}|${review.ratingKey}`);
    }
    const enrolledPuzzleIds = new Set<string>();
    for (const puzzle of orderedUserPuzzles) {
      const mode = puzzle.puzzleKind === "arrow_duel" ? "arrow_duel" : "standard";
      const key = `${puzzle.id}|${mode}|${USER_GAME_RATING_KEY_PREFIX}my_game_puzzles:${mode}`;
      if (enrolledKeySet.has(key)) {
        enrolledPuzzleIds.add(puzzle.id);
      }
    }
    const removedPuzzleIds = service.listRemovedReviewPuzzleIds();
    const effectiveBenchmarkRating = service.getEffectiveReviewBenchmarkRating();
    return {
      allGames,
      gameById,
      linkedAccounts,
      orderedUserPuzzles,
      enrolledPuzzleIds,
      removedPuzzleIds,
      effectiveBenchmarkRating,
      userPuzzleCount
    };
  }, [batch.state.completedGames, batch.state.status, revision, service]);

  const availableAccountFilters = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string }>();
    for (const account of snapshot.linkedAccounts) {
      const key = `${account.platform}:${account.username.toLowerCase()}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          label: `${gamePlatformLabel(account.platform, locale)} · ${account.username}`
        });
      }
    }
    for (const game of snapshot.allGames) {
      if (game.platform === "pgn") {
        if (!byKey.has("pgn")) {
          byKey.set("pgn", { key: "pgn", label: "PGN" });
        }
      } else if (game.platform === "maia") {
        if (!byKey.has("maia")) {
          byKey.set("maia", { key: "maia", label: "Maia" });
        }
      } else if (game.username) {
        const key = `${game.platform}:${game.username.toLowerCase()}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            label: `${gamePlatformLabel(game.platform, locale)} · ${game.username}`
          });
        }
      }
    }
    return [...byKey.values()];
  }, [locale, snapshot.allGames, snapshot.linkedAccounts]);

  const effectiveAccountFilter =
    accountFilter === "all" || availableAccountFilters.some((item) => item.key === accountFilter)
      ? accountFilter
      : "all";

  const availableTimeClassFilters = useMemo(() => {
    const present = new Set<string>();
    for (const game of snapshot.allGames) {
      if (game.timeClass) {
        present.add(game.timeClass.toLowerCase());
      }
    }
    return GAMES_TIME_CLASS_FILTERS.filter(
      (filter) => filter === "all" || present.has(filter)
    );
  }, [snapshot.allGames]);

  const effectiveTimeClassFilter: GamesTimeClassFilter = availableTimeClassFilters.includes(
    timeClassFilter
  )
    ? timeClassFilter
    : "all";

  const matchesAccountFilter = useCallback(
    (game: StoredImportedGame | undefined): boolean => {
      if (effectiveAccountFilter === "all") {
        return true;
      }
      if (!game) {
        return false;
      }
      if (effectiveAccountFilter === "pgn") {
        return game.platform === "pgn";
      }
      if (effectiveAccountFilter === "maia") {
        return game.platform === "maia";
      }
      const key = `${game.platform}:${(game.username ?? "").toLowerCase()}`;
      return key === effectiveAccountFilter;
    },
    [effectiveAccountFilter]
  );

  const filteredGames = useMemo(
    () =>
      snapshot.allGames.filter(
        (game) =>
          matchesAccountFilter(game) &&
          matchesGamesStatusFilter(game.analysisStatus, statusFilter) &&
          matchesGamesTimeClassFilter(game.timeClass, effectiveTimeClassFilter)
      ),
    [effectiveTimeClassFilter, matchesAccountFilter, snapshot.allGames, statusFilter]
  );

  const puzzlesInGameScope = useMemo(
    () =>
      snapshot.orderedUserPuzzles.filter((puzzle) => {
        const sourceGame = snapshot.gameById.get(puzzle.gameId);
        if (!matchesAccountFilter(sourceGame)) {
          return false;
        }
        const puzzleTimeClass = puzzle.timeClass ?? sourceGame?.timeClass ?? "other";
        return matchesGamesTimeClassFilter(puzzleTimeClass, effectiveTimeClassFilter);
      }),
    [effectiveTimeClassFilter, matchesAccountFilter, snapshot.gameById, snapshot.orderedUserPuzzles]
  );

  const hasBothPuzzleKindsInScope = useMemo(() => {
    let hasArrow = false;
    let hasLine = false;
    for (const puzzle of puzzlesInGameScope) {
      if (puzzle.puzzleKind === "arrow_duel") {
        hasArrow = true;
      } else {
        hasLine = true;
      }
      if (hasArrow && hasLine) {
        return true;
      }
    }
    return false;
  }, [puzzlesInGameScope]);

  const effectivePuzzleKindFilter: "all" | "arrow_duel" | "line" =
    hasBothPuzzleKindsInScope ? puzzleKindFilter : "all";

  const availablePuzzleThemes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const puzzle of puzzlesInGameScope) {
      if (
        effectivePuzzleKindFilter !== "all" &&
        puzzle.puzzleKind !== effectivePuzzleKindFilter
      ) {
        continue;
      }
      for (const themeId of curatedPuzzleThemes(puzzle.themes)) {
        counts.set(themeId, (counts.get(themeId) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([themeId, count]) => ({ themeId, count }))
      .sort((left, right) => right.count - left.count || left.themeId.localeCompare(right.themeId));
  }, [effectivePuzzleKindFilter, puzzlesInGameScope]);

  const effectivePuzzleThemeFilter =
    puzzleThemeFilter === "all" ||
    availablePuzzleThemes.some((item) => item.themeId === puzzleThemeFilter)
      ? puzzleThemeFilter
      : "all";

  const resolvePuzzleBenchmarkRating = useCallback(
    (gameId: string): number | undefined => {
      const sourceGame = snapshot.gameById.get(gameId);
      const rawGameRating = sourceGame
        ? sourceGame.userColor === "w"
          ? sourceGame.white.rating
          : sourceGame.black.rating
        : undefined;
      const calibratedGameRating =
        sourceGame && typeof rawGameRating === "number" && Number.isFinite(rawGameRating)
          ? normalizeGameRatingToPuzzleScale(rawGameRating, sourceGame.platform, sourceGame.timeClass)
          : undefined;
      if (calibratedGameRating === undefined) {
        return snapshot.effectiveBenchmarkRating;
      }
      if (snapshot.effectiveBenchmarkRating === undefined) {
        return calibratedGameRating;
      }
      return Math.max(snapshot.effectiveBenchmarkRating, calibratedGameRating);
    },
    [snapshot.effectiveBenchmarkRating, snapshot.gameById]
  );

  const isPuzzleWithinReviewBand = useCallback(
    (puzzle: StoredUserPuzzle): boolean => {
      if (!puzzle.ratingSource || puzzle.ratingSource === "game_anchor") {
        return true;
      }
      return isWithinReviewDifficultyBand(
        puzzle.rating,
        resolvePuzzleBenchmarkRating(puzzle.gameId)
      );
    },
    [resolvePuzzleBenchmarkRating]
  );

  const hasDifficultySplitInScope = useMemo(() => {
    let hasWithin = false;
    let hasStretch = false;
    for (const puzzle of puzzlesInGameScope) {
      if (isPuzzleWithinReviewBand(puzzle)) {
        hasWithin = true;
      } else {
        hasStretch = true;
      }
      if (hasWithin && hasStretch) {
        return true;
      }
    }
    return false;
  }, [isPuzzleWithinReviewBand, puzzlesInGameScope]);

  const effectivePuzzleDifficultyFilter: "all" | "at_level" | "stretch" =
    hasDifficultySplitInScope ? puzzleDifficultyFilter : "all";

  const filteredOrderedUserPuzzles = useMemo(
    () =>
      puzzlesInGameScope.filter((puzzle) => {
        if (
          effectivePuzzleKindFilter !== "all" &&
          puzzle.puzzleKind !== effectivePuzzleKindFilter
        ) {
          return false;
        }
        if (
          effectivePuzzleDifficultyFilter === "at_level" &&
          !isPuzzleWithinReviewBand(puzzle)
        ) {
          return false;
        }
        if (
          effectivePuzzleDifficultyFilter === "stretch" &&
          isPuzzleWithinReviewBand(puzzle)
        ) {
          return false;
        }
        if (
          effectivePuzzleThemeFilter !== "all" &&
          !curatedPuzzleThemes(puzzle.themes).includes(effectivePuzzleThemeFilter)
        ) {
          return false;
        }
        return true;
      }),
    [
      effectivePuzzleDifficultyFilter,
      effectivePuzzleKindFilter,
      effectivePuzzleThemeFilter,
      isPuzzleWithinReviewBand,
      puzzlesInGameScope
    ]
  );

  const filteredDiagnosis = useMemo(() => {
    const gamesInScope = snapshot.allGames.filter(
      (game) =>
        matchesAccountFilter(game) &&
        matchesGamesTimeClassFilter(game.timeClass, effectiveTimeClassFilter)
    );
    return diagnoseInGameWeaknesses({
      games: gamesInScope,
      puzzles: puzzlesInGameScope
    });
  }, [
    effectiveTimeClassFilter,
    matchesAccountFilter,
    puzzlesInGameScope,
    snapshot.allGames
  ]);

  const visibleGames = useMemo(
    () => filteredGames.slice(0, visibleGamesLimit),
    [filteredGames, visibleGamesLimit]
  );

  const visiblePuzzles = useMemo(
    () => filteredOrderedUserPuzzles.slice(0, visiblePuzzlesLimit),
    [filteredOrderedUserPuzzles, visiblePuzzlesLimit]
  );

  useEffect(() => {
    setVisibleGamesLimit(GAMES_PAGE_SIZE);
  }, [effectiveAccountFilter, effectiveTimeClassFilter, statusFilter]);

  useEffect(() => {
    setVisiblePuzzlesLimit(PUZZLES_PAGE_SIZE);
  }, [
    effectiveAccountFilter,
    effectivePuzzleDifficultyFilter,
    effectivePuzzleKindFilter,
    effectivePuzzleThemeFilter,
    effectiveTimeClassFilter
  ]);

  const hasActiveFilters =
    effectiveAccountFilter !== "all" ||
    statusFilter !== "all" ||
    effectiveTimeClassFilter !== "all" ||
    effectivePuzzleKindFilter !== "all" ||
    effectivePuzzleDifficultyFilter !== "all" ||
    effectivePuzzleThemeFilter !== "all";

  const resetAllFilters = useCallback((): void => {
    setAccountFilter("all");
    setStatusFilter("all");
    setTimeClassFilter("all");
    setPuzzleKindFilter("all");
    setPuzzleDifficultyFilter("all");
    setPuzzleThemeFilter("all");
    setVisibleGamesLimit(GAMES_PAGE_SIZE);
    setVisiblePuzzlesLimit(PUZZLES_PAGE_SIZE);
  }, []);

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
      const syncedAt = new Date(resolveNowMs()).toISOString();
      const upsertResult = service.upsertImportedGames(drafts, syncedAt);
      service.upsertLinkedAccount({
        platform: account.platform,
        username: account.username,
        lastSyncedAt: syncedAt
      });
      refreshHub();
      return { inserted: upsertResult.inserted, skipped: upsertResult.skipped };
    },
    [refreshHub, resolveHttpClient, resolveNowMs, service]
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
    }): Promise<boolean> => {
      setSyncing(true);
      setModalError(null);
      setModalStatus(null);
      setHubError(null);
      try {
        const result = await syncAccount({ platform, username }, maxGames);
        setModalStatus(
          result.skipped > 0
            ? t("games.import.summaryWithSkipped", {
                imported: result.inserted,
                skipped: result.skipped
              })
            : t("games.import.summary", { count: result.inserted })
        );
        return true;
      } catch (error) {
        const message = gameImportErrorMessage(error, locale);
        setModalError(message);
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [locale, syncAccount, t]
  );

  const syncLinkedAccountsList = useCallback(
    async (accounts: readonly LinkedGameAccount[]): Promise<void> => {
      if (syncing || loadingOlder || accounts.length === 0) {
        return;
      }
      setSyncing(true);
      setHubError(null);
      try {
        for (const account of accounts) {
          await syncAccount(
            {
              platform: account.platform,
              username: account.username,
              ...(account.lastSyncedAt ? { since: account.lastSyncedAt } : {})
            },
            50
          );
        }
      } catch (error) {
        setHubError(gameImportErrorMessage(error, locale));
      } finally {
        setSyncing(false);
      }
    },
    [loadingOlder, locale, syncAccount, syncing]
  );

  const handleSyncAllLinked = useCallback(async (): Promise<void> => {
    await syncLinkedAccountsList(snapshot.linkedAccounts);
  }, [snapshot.linkedAccounts, syncLinkedAccountsList]);

  const handleAutoSyncStaleLinked = useCallback(async (): Promise<void> => {
    const effectiveStaleMs =
      autoSyncStaleMs !== undefined
        ? autoSyncStaleMs
        : (() => {
            const configuredMinutes =
              service.getSettings().gameReview?.autoSyncCooldownMinutes ??
              DEFAULT_GAME_REVIEW_AUTO_SYNC_COOLDOWN_MINUTES;
            return configuredMinutes <= 0 ? null : configuredMinutes * 60 * 1000;
          })();
    if (effectiveStaleMs === null) {
      return;
    }
    const staleAccounts = linkedAccountsNeedingAutoSync(
      service.listLinkedAccounts(),
      resolveNowMs(),
      effectiveStaleMs
    );
    if (staleAccounts.length === 0) {
      return;
    }
    await syncLinkedAccountsList(staleAccounts);
  }, [autoSyncStaleMs, resolveNowMs, service, syncLinkedAccountsList]);

  const handleImportOlderGames = useCallback(
    async (
      targetAccount: LinkedGameAccount,
      options?: { fromImportModal?: boolean }
    ): Promise<void> => {
      if (syncing || loadingOlder) {
        return;
      }
      setLoadingOlder(true);
      setHubError(null);
      if (options?.fromImportModal) {
        setModalError(null);
        setModalStatus(null);
      }
      try {
        const client = resolveHttpClient();
        const syncedAt = new Date(nowMs).toISOString();
        let oldestMs: number | undefined;
        for (const game of snapshot.allGames) {
          if (
            game.platform === targetAccount.platform &&
            (game.username ?? "").toLowerCase() === targetAccount.username.toLowerCase()
          ) {
            const playedAtMs = Date.parse(game.playedAt);
            if (Number.isFinite(playedAtMs) && (oldestMs === undefined || playedAtMs < oldestMs)) {
              oldestMs = playedAtMs;
            }
          }
        }
        const drafts =
          targetAccount.platform === "chess_com"
            ? await importChessComGames(client, {
                username: targetAccount.username,
                maxGames: 50,
                ...(oldestMs !== undefined ? { until: oldestMs } : {})
              })
            : await importLichessGames(client, {
                username: targetAccount.username,
                maxGames: 50,
                ...(oldestMs !== undefined ? { until: oldestMs } : {})
              });
        const upsert = service.upsertImportedGames(drafts, syncedAt);
        refreshHub();
        if (options?.fromImportModal) {
          setModalStatus(
            upsert.inserted > 0
              ? t("games.sync.added", { count: upsert.inserted })
              : t("games.sync.noOlderGames")
          );
        }
      } catch (error) {
        const message = gameImportErrorMessage(error, locale);
        if (options?.fromImportModal) {
          setModalError(message);
        } else {
          setHubError(message);
        }
      } finally {
        setLoadingOlder(false);
      }
    },
    [
      loadingOlder,
      locale,
      nowMs,
      refreshHub,
      resolveHttpClient,
      service,
      snapshot.allGames,
      syncing,
      t
    ]
  );

  const handlePressImportMore = useCallback((): void => {
    if (syncing || loadingOlder || snapshot.linkedAccounts.length === 0) {
      return;
    }
    if (effectiveAccountFilter !== "all" && effectiveAccountFilter !== "pgn") {
      const matched = snapshot.linkedAccounts.find(
        (account) =>
          `${account.platform}:${account.username.toLowerCase()}` === effectiveAccountFilter
      );
      if (matched) {
        void handleImportOlderGames(matched);
        return;
      }
    }
    if (snapshot.linkedAccounts.length === 1) {
      void handleImportOlderGames(snapshot.linkedAccounts[0]!);
      return;
    }
    setOlderPickerOpen(true);
  }, [effectiveAccountFilter, handleImportOlderGames, loadingOlder, snapshot.linkedAccounts, syncing]);

  const autoSyncedOnMountRef = useRef(false);
  useEffect(() => {
    if (!autoSyncOnMount || autoSyncedOnMountRef.current || snapshot.linkedAccounts.length === 0) {
      return;
    }
    autoSyncedOnMountRef.current = true;
    void handleAutoSyncStaleLinked();
  }, [autoSyncOnMount, handleAutoSyncStaleLinked, snapshot.linkedAccounts.length]);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState ?? "active");
  useEffect(() => {
    if (!autoSyncOnMount) {
      return;
    }
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if ((prevState === "background" || prevState === "inactive") && nextState === "active") {
        void handleAutoSyncStaleLinked();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [autoSyncOnMount, handleAutoSyncStaleLinked]);

  const handleRemoveAccount = useCallback(
    (
      platform: LinkedGameAccountPlatform,
      username: string,
      options?: { deleteData?: boolean }
    ): void => {
      service.removeLinkedAccount(platform, username);
      if (options?.deleteData) {
        const targetLower = username.trim().toLowerCase();
        const matchingGames = service
          .listImportedGames()
          .filter(
            (game) =>
              game.platform === platform &&
              (game.username ?? "").trim().toLowerCase() === targetLower
          );
        for (const game of matchingGames) {
          service.deleteImportedGame(game.id);
        }
      }
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
      setModalStatus(summary);
      refreshHub();
    },
    [nowMs, refreshHub, service, snapshot.linkedAccounts, t]
  );

  const handleAnalyzeAll = useCallback((): void => {
    if (unanalyzedGames.length === 0) {
      return;
    }
    batch.startBatch(unanalyzedGames);
  }, [batch, unanalyzedGames]);

  const handleToggleUserPuzzleReview = useCallback(
    (puzzle: StoredUserPuzzle): void => {
      const mode = puzzle.puzzleKind === "arrow_duel" ? "arrow_duel" : "standard";
      const ctx = {
        puzzleId: puzzle.id,
        mode,
        ratingKey: `${USER_GAME_RATING_KEY_PREFIX}my_game_puzzles:${mode}`
      } as const;
      if (service.getReviewQueueState(ctx)) {
        service.removeReview(ctx);
      } else {
        service.enrollReview(ctx);
      }
      refreshHub();
    },
    [refreshHub, service]
  );

  const handleAddUserPuzzlesToReview = useCallback(
    (puzzles: readonly StoredUserPuzzle[]): void => {
      let changed = false;
      for (const puzzle of puzzles) {
        const mode = puzzle.puzzleKind === "arrow_duel" ? "arrow_duel" : "standard";
        const ctx = {
          puzzleId: puzzle.id,
          mode,
          ratingKey: `${USER_GAME_RATING_KEY_PREFIX}my_game_puzzles:${mode}`
        } as const;
        if (!service.getReviewQueueState(ctx)) {
          service.enrollReview(ctx);
          changed = true;
        }
      }
      if (changed) {
        refreshHub();
      }
    },
    [refreshHub, service]
  );

  const isEmpty = snapshot.allGames.length === 0;
  const batchBusy = batch.state.status === "running";

  useUserPuzzleDifficultyBackfill({
    store: service.gameReviewStore,
    practiceService: service,
    puzzles: snapshot.orderedUserPuzzles,
    getEngine: resolveAnalysisEngine,
    paused: batchBusy,
    onPuzzleRated: refreshHub
  });
  const effectiveHubView: "games" | "puzzles" =
    snapshot.userPuzzleCount > 0 ? hubView : "games";
  const recommendedPuzzleIds = useMemo(
    () =>
      selectRecommendedGamePuzzleIds(snapshot.orderedUserPuzzles, {
        getUserRating: resolvePuzzleBenchmarkRating,
        excludedPuzzleIds: snapshot.removedPuzzleIds
      }),
    [resolvePuzzleBenchmarkRating, snapshot.orderedUserPuzzles, snapshot.removedPuzzleIds]
  );
  const visibleRecommendedPuzzles = useMemo(
    () => filteredOrderedUserPuzzles.filter((puzzle) => recommendedPuzzleIds.has(puzzle.id)),
    [filteredOrderedUserPuzzles, recommendedPuzzleIds]
  );
  const allVisibleRecommendedEnrolled =
    visibleRecommendedPuzzles.length > 0 &&
    visibleRecommendedPuzzles.every((puzzle) => snapshot.enrolledPuzzleIds.has(puzzle.id));
  const allVisiblePuzzlesEnrolled =
    filteredOrderedUserPuzzles.length > 0 &&
    filteredOrderedUserPuzzles.every((puzzle) => snapshot.enrolledPuzzleIds.has(puzzle.id));

  const exitSelectMode = useCallback((): void => {
    setSelectMode(false);
    setSelectedGameIds(new Set());
    setBulkDeleteConfirmOpen(false);
  }, []);

  const toggleGameSelection = useCallback((gameId: string): void => {
    setBulkDeleteConfirmOpen(false);
    setSelectedGameIds((previous) => {
      const next = new Set(previous);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  }, []);

  const filteredGameIdSet = useMemo(
    () => new Set(filteredGames.map((game) => game.id)),
    [filteredGames]
  );

  const activeSelectedGameIds = useMemo(() => {
    if (selectedGameIds.size === 0) {
      return [] as string[];
    }
    return [...selectedGameIds].filter((id) => filteredGameIdSet.has(id));
  }, [filteredGameIdSet, selectedGameIds]);

  const allFilteredGamesSelected =
    filteredGames.length > 0 && activeSelectedGameIds.length === filteredGames.length;

  const handleToggleSelectAllFiltered = useCallback((): void => {
    setBulkDeleteConfirmOpen(false);
    if (allFilteredGamesSelected) {
      setSelectedGameIds(new Set());
    } else {
      setSelectedGameIds(new Set(filteredGames.map((game) => game.id)));
    }
  }, [allFilteredGamesSelected, filteredGames]);

  const handleConfirmBulkDelete = useCallback((): void => {
    if (activeSelectedGameIds.length === 0) {
      return;
    }
    for (const gameId of activeSelectedGameIds) {
      service.deleteImportedGame(gameId);
    }
    exitSelectMode();
    refreshHub();
  }, [activeSelectedGameIds, exitSelectMode, refreshHub, service]);

  useEffect(() => {
    if (effectiveHubView !== "games" || filteredGames.length === 0) {
      exitSelectMode();
    }
  }, [effectiveHubView, exitSelectMode, filteredGames.length]);

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
          <View style={styles.headerActions}>
            {snapshot.linkedAccounts.length > 0 ? (
              <Pressable
                accessibilityLabel={syncing ? t("games.action.syncing") : t("games.action.sync")}
                accessibilityRole="button"
                accessibilityState={{ busy: syncing || loadingOlder, disabled: syncing || loadingOlder }}
                disabled={syncing || loadingOlder}
                onPress={() => {
                  void handleSyncAllLinked();
                }}
                style={({ pressed }) => [
                  styles.syncIconButton,
                  pressed && !syncing && !loadingOlder ? styles.pressed : null
                ]}
                testID="games-sync-button"
              >
                {syncing ? (
                  <ActivityIndicator
                    color={theme.colors.accent.s600}
                    size="small"
                    testID="games-sync-spinner"
                  />
                ) : (
                  <Icon
                    color={theme.colors.text.primary}
                    name="reset"
                    size={16}
                    weight="semibold"
                  />
                )}
              </Pressable>
            ) : null}
            <ToolbarIconButton
              accessibilityLabel={filtersExpanded ? t("history.hideFiltersA11y") : t("history.showFiltersA11y")}
              accessibilityState={{ expanded: filtersExpanded }}
              active={filtersExpanded || hasActiveFilters}
              testID="games-filter-toggle"
              onPress={() => setFiltersExpanded((current) => !current)}
            >
              <FilterGlyph active={filtersExpanded || hasActiveFilters} />
            </ToolbarIconButton>
            <Button
              icon="add"
              label={t("games.action.import")}
              size="compact"
              testID="games-header-import"
              variant="secondary"
              onPress={() => openModal("chess_com")}
            />
          </View>
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
            <AppText style={styles.emptySubtitle} tone="secondary" variant="subheadline">
              {t("games.empty.subtitle")}
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
              {onPlayWithMaia ? (
                <Button
                  label={t("maiaPlay.title")}
                  stretch
                  testID="games-empty-play-maia"
                  variant="secondary"
                  onPress={onPlayWithMaia}
                />
              ) : null}
            </View>
          </View>
        </Section>
      ) : (
        <>
          <CollapsibleRegion
            contentStyle={styles.filtersDrawer}
            contentTestID="games-filters"
            expanded={filtersExpanded}
          >
            {availableAccountFilters.length > 1 ? (
              <ScrollView
                accessibilityLabel={t("games.filter.accountA11y")}
                horizontal
                showsHorizontalScrollIndicator={false}
                testID="games-account-filters"
              >
                <View style={styles.filterRow}>
                  <FilterButton
                    active={effectiveAccountFilter === "all"}
                    label={t("games.filter.all")}
                    testID="games-filter-account-all"
                    onPress={() => setAccountFilter("all")}
                  />
                  {availableAccountFilters.map((account) => (
                    <FilterButton
                      key={account.key}
                      active={effectiveAccountFilter === account.key}
                      label={account.label}
                      testID={`games-filter-account-${account.key}`}
                      onPress={() => setAccountFilter(account.key)}
                    />
                  ))}
                </View>
              </ScrollView>
            ) : null}
            {effectiveHubView === "games" ? (
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
            ) : null}
            {availableTimeClassFilters.length > 2 ? (
              <ScrollView
                accessibilityLabel={t("games.filter.timeClassA11y")}
                horizontal
                showsHorizontalScrollIndicator={false}
                testID="games-time-class-filters"
              >
                <View style={styles.filterRow}>
                  {availableTimeClassFilters.map((filter) => (
                    <FilterButton
                      key={filter}
                      active={effectiveTimeClassFilter === filter}
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
            ) : null}
            {effectiveHubView === "puzzles" && hasBothPuzzleKindsInScope ? (
              <View
                accessibilityLabel={t("games.filter.modeA11y")}
                style={styles.filterRow}
                testID="games-puzzle-kind-filters"
              >
                <FilterButton
                  active={effectivePuzzleKindFilter === "all"}
                  label={t("games.filter.all")}
                  testID="games-filter-puzzle-kind-all"
                  onPress={() => setPuzzleKindFilter("all")}
                />
                <FilterButton
                  active={effectivePuzzleKindFilter === "arrow_duel"}
                  label={t("common.arrowDuel")}
                  testID="games-filter-puzzle-kind-arrow_duel"
                  onPress={() => setPuzzleKindFilter("arrow_duel")}
                />
                <FilterButton
                  active={effectivePuzzleKindFilter === "line"}
                  label={t("common.standard")}
                  testID="games-filter-puzzle-kind-line"
                  onPress={() => setPuzzleKindFilter("line")}
                />
              </View>
            ) : null}
            {effectiveHubView === "puzzles" && hasDifficultySplitInScope ? (
              <View
                accessibilityLabel={t("games.filter.difficultyA11y")}
                style={styles.filterRow}
                testID="games-puzzle-difficulty-filters"
              >
                <FilterButton
                  active={effectivePuzzleDifficultyFilter === "all"}
                  label={t("games.filter.all")}
                  testID="games-filter-puzzle-difficulty-all"
                  onPress={() => setPuzzleDifficultyFilter("all")}
                />
                <FilterButton
                  active={effectivePuzzleDifficultyFilter === "at_level"}
                  label={t("games.filter.atMyLevel")}
                  testID="games-filter-puzzle-difficulty-at_level"
                  onPress={() => setPuzzleDifficultyFilter("at_level")}
                />
                <FilterButton
                  active={effectivePuzzleDifficultyFilter === "stretch"}
                  label={t("games.filter.stretch")}
                  testID="games-filter-puzzle-difficulty-stretch"
                  onPress={() => setPuzzleDifficultyFilter("stretch")}
                />
              </View>
            ) : null}
            {effectiveHubView === "puzzles" && availablePuzzleThemes.length > 0 ? (
              <ScrollView
                accessibilityLabel={t("games.filter.themeA11y")}
                horizontal
                showsHorizontalScrollIndicator={false}
                testID="games-puzzle-theme-filters"
              >
                <View style={styles.filterRow}>
                  <FilterButton
                    active={effectivePuzzleThemeFilter === "all"}
                    label={t("games.filter.all")}
                    testID="games-filter-puzzle-theme-all"
                    onPress={() => setPuzzleThemeFilter("all")}
                  />
                  {availablePuzzleThemes.map((item) => (
                    <FilterButton
                      key={item.themeId}
                      active={effectivePuzzleThemeFilter === item.themeId}
                      label={`${customThemeLabel(item.themeId, locale)} (${item.count})`}
                      testID={`games-filter-puzzle-theme-${item.themeId}`}
                      onPress={() => setPuzzleThemeFilter(item.themeId)}
                    />
                  ))}
                </View>
              </ScrollView>
            ) : null}
            {hasActiveFilters ? (
              <View style={styles.filterResetRow}>
                <Button
                  label={t("games.action.resetFilters")}
                  size="compact"
                  testID="games-filter-drawer-reset"
                  variant="plain"
                  onPress={resetAllFilters}
                />
              </View>
            ) : null}
          </CollapsibleRegion>

          {service.getSettings().onboarding?.gamesGuideSeen !== true ? (
            <ContextualGuideCard
              body={t("onboarding.gamesTip.body")}
              dismissLabel={t("onboarding.gotIt")}
              dismissTestID="games-guide-dismiss"
              icon="whatsNew"
              testID="games-first-use-guide"
              title={t("onboarding.gamesTip.title")}
              tone="accent"
              onDismiss={() => {
                const settings = service.getSettings();
                service.saveSettings({
                  ...settings,
                  onboarding: {
                    ...(settings.onboarding ?? defaultOnboardingGuideProgress()),
                    gamesGuideSeen: true
                  }
                });
                setRevision((current) => current + 1);
              }}
            />
          ) : null}

          {snapshot.userPuzzleCount > 0 ? (
            <SegmentedControl
              accessibilityLabel={t("games.view.a11y")}
              onChange={setHubView}
              options={[
                {
                  label: `${t("tabs.games")} (${snapshot.allGames.length})`,
                  testID: "games-hub-view-games",
                  value: "games"
                },
                {
                  label: t("games.view.puzzlesTab", { count: snapshot.userPuzzleCount }),
                  testID: "games-hub-view-puzzles",
                  value: "puzzles"
                }
              ]}
              testID="games-hub-view-toggle"
              value={effectiveHubView}
            />
          ) : null}

          {effectiveHubView === "puzzles" ? (
            <View style={styles.puzzlesTabSection} testID="games-puzzles-view">
              {filteredOrderedUserPuzzles.length > 0 ? (
                <View style={styles.quickActionRow}>
                  {onPracticeMyGamePuzzles ? (
                    <Button
                      icon="play"
                      label={t("games.action.practicePuzzles", {
                        count: filteredOrderedUserPuzzles.length
                      })}
                      stretch
                      testID="games-practice-puzzles-cta"
                      onPress={() => {
                        if (
                          effectiveAccountFilter !== "all" ||
                          effectivePuzzleKindFilter !== "all" ||
                          effectivePuzzleDifficultyFilter !== "all" ||
                          effectivePuzzleThemeFilter !== "all"
                        ) {
                          onPracticeMyGamePuzzles({
                            puzzleIds: filteredOrderedUserPuzzles.map((p) => p.id),
                            initialIndex: 0
                          });
                        } else {
                          onPracticeMyGamePuzzles({
                            ...(effectiveTimeClassFilter !== "all"
                              ? { timeClass: effectiveTimeClassFilter }
                              : {})
                          });
                        }
                      }}
                    />
                  ) : null}
                  <View style={styles.puzzlesTabActions}>
                    {visibleRecommendedPuzzles.length > 0 ? (
                      <View style={styles.recommendedActionGroup}>
                        <Button
                          disabled={allVisibleRecommendedEnrolled}
                          label={
                            allVisibleRecommendedEnrolled
                              ? t("games.puzzles.recommendedInReview")
                              : t("games.puzzles.addRecommendedToReview", {
                                  count: visibleRecommendedPuzzles.length
                                })
                          }
                          size="compact"
                          testID="games-puzzles-add-recommended-review"
                          variant={allVisibleRecommendedEnrolled ? "plain" : "secondary"}
                          onPress={() => handleAddUserPuzzlesToReview(visibleRecommendedPuzzles)}
                        />
                        <Pressable
                          accessibilityLabel={t("games.puzzles.recommendedInfoA11y")}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: recommendedInfoOpen }}
                          style={({ pressed }) => [
                            styles.infoButton,
                            recommendedInfoOpen ? styles.infoButtonActive : null,
                            pressed ? styles.pressed : null
                          ]}
                          testID="games-puzzles-recommended-info"
                          onPress={() => setRecommendedInfoOpen((current) => !current)}
                        >
                          <AppText
                            style={
                              recommendedInfoOpen
                                ? styles.infoButtonTextActive
                                : styles.infoButtonText
                            }
                            variant="caption"
                          >
                            ?
                          </AppText>
                        </Pressable>
                      </View>
                    ) : null}
                    <Button
                      disabled={allVisiblePuzzlesEnrolled}
                      label={
                        allVisiblePuzzlesEnrolled
                          ? t("games.puzzles.allInReview")
                          : t("games.puzzles.addAllToReview")
                      }
                      size="compact"
                      testID="games-puzzles-add-all-review"
                      variant={allVisiblePuzzlesEnrolled ? "plain" : "secondary"}
                      onPress={() => handleAddUserPuzzlesToReview(filteredOrderedUserPuzzles)}
                    />
                  </View>
                  {recommendedInfoOpen ? (
                    <View
                      style={styles.recommendedCriteriaCard}
                      testID="games-puzzles-recommended-criteria"
                    >
                      <AppText variant="footnote">
                        {t("games.puzzles.recommendedCriteriaTitle")}
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        {t("games.puzzles.recommendedCriteriaBody")}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {filteredOrderedUserPuzzles.length === 0 ? (
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
                      onPress={resetAllFilters}
                    />
                  </View>
                </Section>
              ) : (
                <>
                  <Section rows testID="games-puzzles-list">
                    {visiblePuzzles.map((puzzle, index) => {
                    const sourceGame = snapshot.gameById.get(puzzle.gameId);
                    const opponentName =
                      puzzle.opponentName ??
                      (sourceGame ? gameOpponentForUser(sourceGame).username : undefined);
                    const timeClass = puzzle.timeClass
                      ? gameTimeClassLabel(puzzle.timeClass, locale)
                      : sourceGame?.timeClass
                        ? gameTimeClassLabel(sourceGame.timeClass, locale)
                        : "";
                    const dateLabel = puzzle.playedAt
                      ? gameRelativeDateLabel(puzzle.playedAt, nowMs, locale)
                      : sourceGame?.playedAt
                        ? gameRelativeDateLabel(sourceGame.playedAt, nowMs, locale)
                        : "";
                    const headerLine = opponentName
                      ? t("games.puzzles.vsMove", {
                          opponent: opponentName,
                          move: puzzle.gameMoveNumber
                        })
                      : t("games.puzzles.moveOnly", { move: puzzle.gameMoveNumber });
                    const metaLine = [timeClass, dateLabel].filter(Boolean).join(" · ");
                    const inReview = snapshot.enrolledPuzzleIds.has(puzzle.id);
                    const curatedThemes = curatedPuzzleThemes(puzzle.themes);
                    const kindLabel =
                      puzzle.puzzleKind === "arrow_duel"
                        ? t("common.arrowDuel")
                        : t("common.standard");
                    const overReviewBand = !isPuzzleWithinReviewBand(puzzle);
                    const hasEstimatedRating =
                      puzzle.ratingSource !== undefined && puzzle.ratingSource !== "game_anchor";
                    const isRecommended = recommendedPuzzleIds.has(puzzle.id);

                    return (
                      <View
                        key={puzzle.id}
                        style={styles.puzzleListRow}
                        testID={`games-puzzle-row-${puzzle.id}`}
                      >
                        <Pressable
                          accessibilityRole="button"
                          disabled={!onPracticeMyGamePuzzles}
                          onPress={() =>
                            onPracticeMyGamePuzzles?.({
                              puzzleIds: filteredOrderedUserPuzzles.map((p) => p.id),
                              initialIndex: index
                            })
                          }
                          style={({ pressed }) => [
                            styles.puzzleListMain,
                            pressed && onPracticeMyGamePuzzles ? styles.pressed : null
                          ]}
                          testID={`games-puzzle-play-${puzzle.id}`}
                        >
                          <AppText numberOfLines={1} variant="subheadline">
                            {headerLine}
                          </AppText>
                          {metaLine ? (
                            <AppText numberOfLines={1} tone="secondary" variant="caption">
                              {metaLine}
                            </AppText>
                          ) : null}
                          <View style={styles.puzzleListBadges}>
                            <Badge label={kindLabel} tone="accent" />
                            {isRecommended ? (
                              <Badge
                                label={t("games.puzzles.recommendedBadge")}
                                testID={`games-puzzle-recommended-${puzzle.id}`}
                                tone="positive"
                              />
                            ) : null}
                            {hasEstimatedRating ? (
                              <Badge
                                label={`~${puzzle.rating}`}
                                tone={overReviewBand ? "warning" : "neutral"}
                              />
                            ) : null}
                            {curatedThemes.slice(0, 2).map((themeId) => (
                              <Badge
                                key={themeId}
                                label={customThemeLabel(themeId, locale)}
                                tone="neutral"
                              />
                            ))}
                          </View>
                        </Pressable>

                        <View style={styles.puzzleListTrailing}>
                          <Button
                            label={
                              inReview
                                ? t("games.puzzles.inReview")
                                : t("games.puzzles.addToReview")
                            }
                            size="compact"
                            testID={`games-puzzle-review-toggle-${puzzle.id}`}
                            variant={inReview ? "plain" : "secondary"}
                            onPress={() => handleToggleUserPuzzleReview(puzzle)}
                          />
                          <Button
                            label={t("games.puzzles.openGame")}
                            size="compact"
                            testID={`games-puzzle-open-game-${puzzle.id}`}
                            variant="plain"
                            onPress={() => onOpenGameReview(puzzle.gameId)}
                          />
                        </View>
                      </View>
                    );
                  })}
                  </Section>
                  {filteredOrderedUserPuzzles.length > visiblePuzzles.length ? (
                    <View style={styles.loadOlderFooter}>
                      <Button
                        label={t("games.action.showMore", {
                          shown: visiblePuzzles.length,
                          total: filteredOrderedUserPuzzles.length
                        })}
                        stretch
                        testID="games-puzzles-show-more"
                        variant="secondary"
                        onPress={() =>
                          setVisiblePuzzlesLimit((limit) => limit + PUZZLES_PAGE_SIZE)
                        }
                      />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : (
            <>
              <InGameDiagnosisCard
                diagnosis={filteredDiagnosis}
                onPracticeBlindspotTheme={
                  onPracticeMyGamePuzzles
                    ? (theme) => {
                        const matchingIds = puzzlesInGameScope
                          .filter((puzzle) =>
                            puzzle.themes.some(
                              (item) => item.toLowerCase() === theme.toLowerCase()
                            )
                          )
                          .map((puzzle) => puzzle.id);
                        if (effectiveAccountFilter !== "all" && matchingIds.length > 0) {
                          onPracticeMyGamePuzzles({ puzzleIds: matchingIds, initialIndex: 0 });
                        } else {
                          onPracticeMyGamePuzzles({
                            themes: [theme],
                            ...(effectiveTimeClassFilter !== "all"
                              ? { timeClass: effectiveTimeClassFilter }
                              : {})
                          });
                        }
                      }
                    : undefined
                }
              />

              <BatchAnalysisBanner
                state={batch.state}
                onCancel={batch.cancel}
                onDismiss={batch.dismiss}
                onPause={batch.pause}
                onResume={batch.resume}
              />

              {!batchBusy &&
              batch.state.status === "idle" &&
              !selectMode &&
              unanalyzedGames.length > 0 &&
              snapshot.userPuzzleCount === 0 ? (
                <View style={styles.analyzePromptCard} testID="games-analyze-prompt-card">
                  <AppText variant="headline">{t("games.analyzePrompt.title")}</AppText>
                  <Button
                    label={t("games.analyzePrompt.action", { count: unanalyzedGames.length })}
                    size="compact"
                    testID="games-analyze-recent"
                    variant="primary"
                    onPress={handleAnalyzeAll}
                  />
                </View>
              ) : null}

              {!batchBusy && (unanalyzedGames.length > 0 || filteredGames.length > 0) ? (
                <View style={styles.controlsStrip} testID="games-top-bar">
                  {selectMode ? (
                    <View style={styles.selectionBar} testID="games-selection-bar">
                      <Button
                        label={
                          allFilteredGamesSelected
                            ? t("games.selection.deselectAll")
                            : t("games.selection.selectAllFiltered", {
                                count: filteredGames.length
                              })
                        }
                        size="compact"
                        testID="games-select-all-filtered"
                        variant="secondary"
                        onPress={handleToggleSelectAllFiltered}
                      />
                      <Button
                        disabled={activeSelectedGameIds.length === 0}
                        label={t("games.selection.deleteSelected", {
                          count: activeSelectedGameIds.length
                        })}
                        size="compact"
                        testID="games-delete-selected"
                        variant="destructive"
                        onPress={() => setBulkDeleteConfirmOpen(true)}
                      />
                      <Button
                        label={t("common.done")}
                        size="compact"
                        testID="games-select-done"
                        variant="plain"
                        onPress={exitSelectMode}
                      />
                    </View>
                  ) : (
                    <View style={styles.secondaryActionRow}>
                      {unanalyzedGames.length > 0 &&
                      !(batch.state.status === "idle" && snapshot.userPuzzleCount === 0) ? (
                        <Button
                          label={t("games.action.analyzeAll", { count: unanalyzedGames.length })}
                          size="compact"
                          testID="games-analyze-recent"
                          variant="secondary"
                          onPress={handleAnalyzeAll}
                        />
                      ) : null}
                      {filteredGames.length > 0 ? (
                        <Button
                          label={t("games.action.select")}
                          size="compact"
                          testID="games-select-toggle"
                          variant="secondary"
                          onPress={() => {
                            setSelectedGameIds(new Set());
                            setBulkDeleteConfirmOpen(false);
                            setSelectMode(true);
                          }}
                        />
                      ) : null}
                    </View>
                  )}
                  {selectMode && bulkDeleteConfirmOpen && activeSelectedGameIds.length > 0 ? (
                    <View style={styles.bulkDeleteConfirmCard} testID="games-bulk-delete-confirm">
                      <AppText tone="secondary" variant="footnote">
                        {t("games.delete.bulkConfirmBody", {
                          count: activeSelectedGameIds.length
                        })}
                      </AppText>
                      <View style={styles.secondaryActionRow}>
                        <Button
                          label={t("games.delete.bulkConfirmAction", {
                            count: activeSelectedGameIds.length
                          })}
                          size="compact"
                          testID="games-bulk-delete-confirm-submit"
                          variant="destructive"
                          onPress={handleConfirmBulkDelete}
                        />
                        <Button
                          label={t("common.cancel")}
                          size="compact"
                          testID="games-bulk-delete-confirm-cancel"
                          variant="secondary"
                          onPress={() => setBulkDeleteConfirmOpen(false)}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}

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
                      onPress={resetAllFilters}
                    />
                  </View>
                </Section>
              ) : (
                <Section rows testID="games-list">
                  {visibleGames.map((game) => (
                    <GameRow
                      key={game.id}
                      game={game}
                      nowMs={nowMs}
                      selectMode={selectMode}
                      selected={selectMode && selectedGameIds.has(game.id)}
                      onPress={() => {
                        if (selectMode) {
                          toggleGameSelection(game.id);
                        } else {
                          onOpenGameReview(game.id);
                        }
                      }}
                    />
                  ))}
                </Section>
              )}

              {filteredGames.length > visibleGames.length ? (
                <View style={styles.loadOlderFooter}>
                  <Button
                    label={t("games.action.showMore", {
                      shown: visibleGames.length,
                      total: filteredGames.length
                    })}
                    stretch
                    testID="games-show-more"
                    variant="secondary"
                    onPress={() => setVisibleGamesLimit((limit) => limit + GAMES_PAGE_SIZE)}
                  />
                </View>
              ) : null}

              {snapshot.linkedAccounts.length > 0 && effectiveAccountFilter !== "pgn" ? (
                <View style={styles.loadOlderFooter}>
                  <Button
                    disabled={syncing || loadingOlder}
                    label={
                      loadingOlder
                        ? t("games.action.importingOlder")
                        : t("games.action.importOlder")
                    }
                    stretch
                    testID="games-load-older"
                    variant="secondary"
                    onPress={handlePressImportMore}
                  />
                </View>
              ) : null}
            </>
          )}
        </>
      )}

      {olderPickerOpen ? (
        <AppModal
          animationType="fade"
          transparent
          visible
          onRequestClose={() => setOlderPickerOpen(false)}
        >
          <SafeAreaModalBackdrop style={styles.pickerBackdrop}>
            <View
              accessibilityViewIsModal
              style={styles.pickerSheet}
              testID="games-import-older-picker"
            >
              <View style={styles.pickerHeader}>
                <AppText accessibilityRole="header" style={styles.pickerTitle} variant="headline">
                  {t("games.olderPicker.title")}
                </AppText>
                <Button
                  accessibilityLabel={t("common.close")}
                  label={t("common.close")}
                  size="compact"
                  testID="games-older-picker-close"
                  variant="plain"
                  onPress={() => setOlderPickerOpen(false)}
                />
              </View>
              <View style={styles.pickerList}>
                {snapshot.linkedAccounts.map((account) => {
                  const platformLabel = gamePlatformLabel(account.platform, locale);
                  const count = snapshot.allGames.filter(
                    (game) =>
                      game.platform === account.platform &&
                      (game.username ?? "").toLowerCase() === account.username.toLowerCase()
                  ).length;
                  return (
                    <Pressable
                      key={`${account.platform}:${account.username}`}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.pickerAccountRow,
                        pressed ? styles.gameRowPressed : null
                      ]}
                      testID={`games-older-picker-${account.platform}-${account.username}`}
                      onPress={() => {
                        setOlderPickerOpen(false);
                        void handleImportOlderGames(account);
                      }}
                    >
                      <View style={styles.pickerAccountCopy}>
                        <AppText variant="headline">{account.username}</AppText>
                        <AppText tone="secondary" variant="footnote">
                          {`${platformLabel} · ${t("games.batch.gamesCount", { count })}`}
                        </AppText>
                      </View>
                      <View style={styles.gameRowLeading}>
                        <Badge label={t("games.action.importOlderShort")} tone="accent" />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </SafeAreaModalBackdrop>
        </AppModal>
      ) : null}

      <GamesImportModal
        busy={syncing || loadingOlder}
        errorMessage={modalError}
        initialTab={modalInitialTab}
        linkedAccounts={snapshot.linkedAccounts}
        statusMessage={modalStatus}
        unanalyzedCount={unanalyzedGames.length}
        visible={modalOpen}
        onClearFeedback={() => {
          setModalError(null);
          setModalStatus(null);
        }}
        onClose={() => setModalOpen(false)}
        onImportOlderForAccount={(account) =>
          handleImportOlderGames(account, { fromImportModal: true })
        }
        onImportPgn={handleImportPgn}
        onLinkAndSync={handleLinkAndSync}
        onRemoveAccount={handleRemoveAccount}
        onStartAnalyzing={
          !batchBusy && unanalyzedGames.length > 0
            ? () => {
                setModalOpen(false);
                batch.startBatch(unanalyzedGames);
              }
            : undefined
        }
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
  selectMode = false,
  selected = false,
  onPress
}: {
  game: StoredImportedGame;
  nowMs: number;
  selectMode?: boolean;
  selected?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, t } = useTranslation();

  const outcome = gameOutcomeForUser(game);
  const opponent = gameOpponentForUser(game);
  const accuracy = gameUserAccuracy(game);
  const timeClass = gameTimeClassLabel(game.timeClass, locale);
  const colorLabel = game.userColor === "w" ? t("common.white") : t("common.black");
  const dateLabel = gameRelativeDateLabel(game.playedAt, nowMs, locale);

  const isUnnamedPgn =
    game.platform === "pgn" &&
    game.white.username === "White" &&
    game.black.username === "Black";
  const opponentDisplayName = isUnnamedPgn
    ? t("games.row.pgnFallbackTitle")
    : game.platform === "pgn" && opponent.username === "White"
      ? t("common.white")
      : game.platform === "pgn" && opponent.username === "Black"
        ? t("common.black")
        : opponent.username;
  const opponentLine = opponent.rating !== undefined
    ? `${opponentDisplayName} (${opponent.rating})`
    : opponentDisplayName;
  const metaLine = [colorLabel, timeClass, dateLabel].filter(Boolean).join(" · ");

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
      accessibilityRole={selectMode ? "checkbox" : "button"}
      accessibilityState={selectMode ? { checked: selected } : undefined}
      style={({ pressed }) => [styles.gameRow, pressed ? styles.gameRowPressed : null]}
      testID={`game-row-${game.id}`}
      onPress={onPress}
    >
      {selectMode ? (
        <View
          style={[
            styles.selectCheckCircle,
            selected ? styles.selectCheckCircleSelected : null
          ]}
          testID={`game-row-check-${game.id}`}
        >
          {selected ? (
            <Icon color={theme.colors.text.onAccent} name="check" size={13} weight="bold" />
          ) : null}
        </View>
      ) : null}
      <View style={styles.gameRowLeading}>
        <Badge
          label={gameResultShortLabel(outcome, locale)}
          testID={`game-row-result-${game.id}`}
          tone={badgeTone}
        />
      </View>
      <View style={styles.gameRowCopy}>
        <AppText ellipsizeMode="tail" numberOfLines={1} variant="headline">
          {opponentLine}
        </AppText>
        <View style={styles.gameRowMeta}>
          <View
            style={[
              styles.colorSwatch,
              game.userColor === "w" ? styles.colorSwatchWhite : styles.colorSwatchBlack
            ]}
          />
          <AppText ellipsizeMode="tail" numberOfLines={1} style={styles.gameRowMetaText} tone="secondary" variant="footnote">
            {metaLine}
          </AppText>
        </View>
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
  emptySubtitle: {
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
  selectionBar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  bulkDeleteConfirmCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  selectCheckCircle: {
    alignItems: "center",
    borderColor: theme.colors.border.strong,
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  selectCheckCircleSelected: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.accent.fill
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
  syncIconButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  filtersDrawer: {
    gap: 8,
    paddingBottom: 4
  },
  filterResetRow: {
    alignItems: "flex-start"
  },
  puzzlesTabSection: {
    gap: 10
  },
  puzzlesTabActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  recommendedActionGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  infoButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.capsule,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  infoButtonActive: {
    backgroundColor: theme.colors.accent.fill,
    borderColor: theme.colors.accent.fill
  },
  infoButtonText: {
    color: theme.colors.text.secondary,
    fontWeight: theme.fontWeight.bold
  },
  infoButtonTextActive: {
    color: theme.colors.text.onAccent,
    fontWeight: theme.fontWeight.bold
  },
  recommendedCriteriaCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  loadOlderFooter: {
    paddingTop: 2,
    width: "100%"
  },
  pickerBackdrop: {
    backgroundColor: theme.colors.scrim,
    flex: 1,
    justifyContent: "flex-end",
    padding: 16
  },
  pickerSheet: {
    alignSelf: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.sheet,
    borderWidth: 1,
    gap: 12,
    maxWidth: 480,
    padding: 16,
    width: "100%"
  },
  pickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  pickerTitle: {
    flex: 1
  },
  pickerList: {
    gap: 8
  },
  pickerAccountRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  pickerAccountCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  puzzleListRow: {
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  puzzleListMain: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  puzzleListBadges: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2
  },
  puzzleListTrailing: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 4
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
  gameRowLeading: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center"
  },
  gameRowCopy: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    minWidth: 0
  },
  gameRowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  gameRowMetaText: {
    flex: 1
  },
  colorSwatch: {
    borderColor: theme.colors.border.strong,
    borderRadius: 2,
    borderWidth: 1,
    height: 9,
    width: 9
  },
  colorSwatchWhite: {
    backgroundColor: theme.name === "dark" ? theme.colors.surfaceInverse : theme.colors.surface
  },
  colorSwatchBlack: {
    backgroundColor: theme.name === "dark" ? theme.colors.surfaceSunken : theme.colors.surfaceInverse
  },
  gameRowTrailing: {
    alignItems: "flex-end",
    flexShrink: 0
  },
  completeStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  analyzePromptCard: {
    alignItems: "flex-start",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.shape.card,
    borderWidth: 1,
    gap: 10,
    padding: 12
  }
}));
