import {
  isUserGamePuzzleId,
  MAIA_TIME_CLASSES,
  preferredMaiaRatingAnchor,
  preferredReviewScheduleChange,
  recomputeMaiaRatingFromGames,
  type MaiaRatedGameRecord,
  type MaiaRatingAnchorRecord,
  type MaiaSetupPreferences,
  type MaiaTimeClass,
  type RatingRecord,
  type ReviewScheduleRemoval,
  type UserGamePuzzleRatingSource
} from "../../core/src/index.ts";
import { preferredAttemptHistoryRow } from "./attempt-sync.ts";
import {
  isUserGameRatingKey,
  type GameAnalysisStatus,
  type LinkedGameAccount,
  type LinkedGameAccountPlatform,
  type StoredGamePlyEval,
  type StoredImportedGame,
  type StoredUserPuzzle
} from "./game-review-store.ts";
import {
  DEFAULT_GAME_REVIEW_AUTO_SYNC_COOLDOWN_MINUTES,
  type ExportedReviewQueueState,
  type GameReviewAutoSyncCooldownMinutes,
  type PracticeSettings
} from "./practice-store.ts";
import {
  normalizeAppearancePreference,
  normalizeBoardTheme,
  normalizeGameReviewAutoSyncCooldownMinutes,
  normalizePieceSet
} from "./practice-settings.ts";
import {
  fingerprintOpaqueToken,
  ProgressV2ChangeTokenExpiredError,
  ProgressV2SyncCancelledError,
  ratingEntityKey,
  reviewEntityKey,
  type ProgressV2ChangePage,
  type ProgressV2DeletedRecord,
  type ProgressV2ModifyResult
} from "./progress-sync-v2.ts";
import type { AttemptHistoryRow } from "./query-types.ts";

export const GAMES_V1_ZONE_NAME = "GamesV1";
export const GAMES_V1_RECORD_TYPE = "ProgressV2Record";
/** Reuses CloudKit ProgressV2Record schemaVersion=2 so zero CloudKit Dashboard schema deployment is needed. */
export const GAMES_V1_CLOUDKIT_SCHEMA_VERSION = 2 as const;
export const GAMES_V1_FORMAT_VERSION = 1 as const;

export type GamesV1RecordKind =
  | "linked_account"
  | "imported_game"
  | "user_puzzle"
  | "ug_attempt"
  | "ug_review_schedule"
  | "ug_rating"
  | "maia_rated_game"
  | "maia_rating_anchor"
  | "games_preferences";

export interface GamesV1RecordIdentity {
  kind: GamesV1RecordKind;
  entityKey: string;
}

export interface GamesV1Record {
  recordName: string;
  kind: GamesV1RecordKind;
  schemaVersion: typeof GAMES_V1_CLOUDKIT_SCHEMA_VERSION;
  payload: string;
}

export interface GamesV1Tombstone extends GamesV1RecordIdentity {
  deletedAt: string;
}

export interface GamesV1SyncedPreferences {
  arrowDuel: {
    opponentReplyEnabled: boolean;
  };
  appearance: PracticeSettings["appearance"];
  lightBoardTheme: PracticeSettings["lightBoardTheme"];
  darkBoardTheme: PracticeSettings["darkBoardTheme"];
  pieceSet: PracticeSettings["pieceSet"];
  gameReview: {
    autoAddRecommendedToReview: boolean;
    autoSyncCooldownMinutes: GameReviewAutoSyncCooldownMinutes;
  };
  maiaSetup: MaiaSetupPreferences;
}

export interface GamesV1ImportedGameBundle {
  game: StoredImportedGame;
  plyEvals: StoredGamePlyEval[];
}

export interface GamesV1LocalState {
  zoneInitialized: boolean;
  serverChangeToken?: string;
  serverChangeTokenFingerprint?: string;
  lastPullAt?: string;
  lastPushAt?: string;
}

export type GamesV1StatePatch = {
  zoneInitialized?: boolean;
  serverChangeToken?: string | null;
  serverChangeTokenFingerprint?: string | null;
  lastPullAt?: string | null;
  lastPushAt?: string | null;
};

export interface GamesV1LocalSnapshot {
  settings: PracticeSettings;
  maiaSetup: MaiaSetupPreferences;
  linkedAccounts: LinkedGameAccount[];
  importedGames: GamesV1ImportedGameBundle[];
  userPuzzles: StoredUserPuzzle[];
  ugAttempts: AttemptHistoryRow[];
  ugReviewQueue: ExportedReviewQueueState[];
  ugReviewRemovals: ReviewScheduleRemoval[];
  ugRatings: RatingRecord[];
  maiaRatedGames: MaiaRatedGameRecord[];
  maiaRatingAnchors: MaiaRatingAnchorRecord[];
}

export interface GamesV1RemoteMergeBatch {
  linkedAccounts: LinkedGameAccount[];
  importedGames: GamesV1ImportedGameBundle[];
  userPuzzles: StoredUserPuzzle[];
  ugAttempts: AttemptHistoryRow[];
  ugReviewQueue: ExportedReviewQueueState[];
  ugReviewRemovals: ReviewScheduleRemoval[];
  ugRatings: RatingRecord[];
  maiaRatedGames: MaiaRatedGameRecord[];
  maiaRatingAnchors: MaiaRatingAnchorRecord[];
  preferences?: GamesV1SyncedPreferences;
  tombstones: GamesV1Tombstone[];
}

export interface GamesV1Persistence {
  readState(): GamesV1LocalState;
  writeState(patch: GamesV1StatePatch): void;
  readSyncedHashes(): Map<string, string>;
  writeSyncedHashes(updates: ReadonlyMap<string, string>, deletes?: readonly string[]): void;
  listTombstones(): GamesV1Tombstone[];
  recordTombstones(tombstones: readonly GamesV1Tombstone[]): void;
  clearTombstone(identity: GamesV1RecordIdentity): void;
  exportGamesV1Snapshot(): GamesV1LocalSnapshot;
  applyGamesV1RemoteBatch(
    batch: GamesV1RemoteMergeBatch,
    statePatch: GamesV1StatePatch,
    syncedHashUpdates: ReadonlyMap<string, string>
  ): GamesV1ApplyResult;
}

export interface GamesV1ApplyResult {
  linkedAccounts: number;
  importedGames: number;
  userPuzzles: number;
  ugAttempts: number;
  ugReviewQueue: number;
  maiaRatedGames: number;
  tombstonesApplied: number;
}

export interface GamesV1SyncStore {
  getSettings(): PracticeSettings;
  readonly gamesV1: GamesV1Persistence;
}

export interface GamesV1PersistenceHost {
  readonly gamesV1?: GamesV1Persistence;
}

export interface GamesV1ZoneTransport {
  ensureZone(): Promise<void>;
  fetchZoneChanges(previousToken?: string): Promise<ProgressV2ChangePage>;
  modifyRecords(input: {
    saving: readonly GamesV1Record[];
    deleting: readonly string[];
  }): Promise<ProgressV2ModifyResult>;
}

export interface GamesV1SyncOptions {
  now?: () => string;
  isCurrent?: () => boolean;
}

export interface GamesV1SyncResult {
  status: "disabled" | "synced";
  pulledRecordCount: number;
  pushedRecordCount: number;
  applied: GamesV1ApplyResult;
}

interface GamesV1PresentPayload {
  formatVersion: typeof GAMES_V1_FORMAT_VERSION;
  kind: GamesV1RecordKind;
  entityKey: string;
  state: "present";
  value: unknown;
}

interface GamesV1DeletedPayload {
  formatVersion: typeof GAMES_V1_FORMAT_VERSION;
  kind: GamesV1RecordKind;
  entityKey: string;
  state: "deleted";
  deletedAt: string;
}

type GamesV1Payload = GamesV1PresentPayload | GamesV1DeletedPayload;

const EMPTY_APPLY_RESULT: GamesV1ApplyResult = {
  linkedAccounts: 0,
  importedGames: 0,
  userPuzzles: 0,
  ugAttempts: 0,
  ugReviewQueue: 0,
  maiaRatedGames: 0,
  tombstonesApplied: 0
};

const ANALYSIS_STATUS_RANK: Readonly<Record<GameAnalysisStatus, number>> = {
  none: 0,
  partial: 1,
  pass1_done: 2,
  complete: 3
};

const RATING_SOURCE_RANK: Readonly<Record<UserGamePuzzleRatingSource, number>> = {
  game_anchor: 1,
  sf_heuristic_v1: 2,
  maia2_sf_v1: 3
};

const MODIFY_BATCH_SIZE = 150;

export function linkedAccountEntityKey(
  platform: LinkedGameAccountPlatform,
  username: string
): string {
  return `${platform}:${username.trim().toLowerCase()}`;
}

export function gamesV1IdentityMapKey(identity: GamesV1RecordIdentity): string {
  return `${identity.kind}\u0000${identity.entityKey}`;
}

export function gamesV1RecordName(identity: GamesV1RecordIdentity): string {
  return `g1|${identity.kind}|${encodeURIComponent(identity.entityKey)}`;
}

export function parseGamesV1RecordName(recordName: string): GamesV1RecordIdentity | undefined {
  const match = /^g1\|([^|]+)\|(.*)$/.exec(recordName);
  if (!match || !isGamesV1RecordKind(match[1])) {
    return undefined;
  }
  try {
    return { kind: match[1], entityKey: decodeURIComponent(match[2] ?? "") };
  } catch {
    return undefined;
  }
}

export function isGamesV1RecordKind(value: unknown): value is GamesV1RecordKind {
  return (
    value === "linked_account" ||
    value === "imported_game" ||
    value === "user_puzzle" ||
    value === "ug_attempt" ||
    value === "ug_review_schedule" ||
    value === "ug_rating" ||
    value === "maia_rated_game" ||
    value === "maia_rating_anchor" ||
    value === "games_preferences"
  );
}

/**
 * Deterministic, monotonic merge for two `LinkedGameAccount` records (same platform + username).
 * Keeps earliest `createdAt` and latest `lastSyncedAt` so two devices syncing the same linked
 * account never regress each other's incremental sync watermark.
 */
export function mergeLinkedGameAccounts(
  local: LinkedGameAccount,
  incoming: LinkedGameAccount
): LinkedGameAccount {
  const createdAt =
    local.createdAt <= incoming.createdAt ? local.createdAt : incoming.createdAt;
  const lastSyncedAt = maxOptionalIso(local.lastSyncedAt, incoming.lastSyncedAt);
  return {
    platform: local.platform,
    username: local.username || incoming.username,
    createdAt,
    ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {})
  };
}

/**
 * Deterministic, monotonic merge for two `StoredImportedGame` + `StoredGamePlyEval[]` bundles
 * with the same deterministic `game.id`.
 *
 * Guarantees that if Device A and Device B independently import the same Chess.com / Lichess game
 * (or both analyze it), analysis progress never regresses (`complete > pass1_done > partial > none`),
 * richer ply evaluations win, and both devices converge identically.
 */
export function mergeImportedGameBundles(
  local: GamesV1ImportedGameBundle,
  incoming: GamesV1ImportedGameBundle
): GamesV1ImportedGameBundle {
  const localRank = ANALYSIS_STATUS_RANK[local.game.analysisStatus] ?? 0;
  const incomingRank = ANALYSIS_STATUS_RANK[incoming.game.analysisStatus] ?? 0;

  let preferredAnalysis: GamesV1ImportedGameBundle;
  let other: GamesV1ImportedGameBundle;
  if (incomingRank !== localRank) {
    preferredAnalysis = incomingRank > localRank ? incoming : local;
    other = incomingRank > localRank ? local : incoming;
  } else if (incoming.plyEvals.length !== local.plyEvals.length) {
    preferredAnalysis = incoming.plyEvals.length > local.plyEvals.length ? incoming : local;
    other = incoming.plyEvals.length > local.plyEvals.length ? local : incoming;
  } else if (incoming.game.analysisCheckpointPly !== local.game.analysisCheckpointPly) {
    preferredAnalysis =
      incoming.game.analysisCheckpointPly > local.game.analysisCheckpointPly ? incoming : local;
    other =
      incoming.game.analysisCheckpointPly > local.game.analysisCheckpointPly ? local : incoming;
  } else {
    const incomingDeep = countDeepVerified(incoming.plyEvals);
    const localDeep = countDeepVerified(local.plyEvals);
    if (incomingDeep !== localDeep) {
      preferredAnalysis = incomingDeep > localDeep ? incoming : local;
      other = incomingDeep > localDeep ? local : incoming;
    } else {
      preferredAnalysis = incoming.game.updatedAt > local.game.updatedAt ? incoming : local;
      other = preferredAnalysis === incoming ? local : incoming;
    }
  }

  const createdAt =
    local.game.createdAt <= incoming.game.createdAt ? local.game.createdAt : incoming.game.createdAt;
  const updatedAt =
    local.game.updatedAt >= incoming.game.updatedAt ? local.game.updatedAt : incoming.game.updatedAt;
  const whiteAccuracy = preferredAnalysis.game.whiteAccuracy ?? other.game.whiteAccuracy;
  const blackAccuracy = preferredAnalysis.game.blackAccuracy ?? other.game.blackAccuracy;
  const puzzleCount = Math.max(local.game.puzzleCount, incoming.game.puzzleCount);

  return {
    game: {
      ...other.game,
      ...preferredAnalysis.game,
      analysisStatus: preferredAnalysis.game.analysisStatus,
      analysisCheckpointPly: Math.max(
        preferredAnalysis.game.analysisCheckpointPly,
        other.game.analysisCheckpointPly
      ),
      ...(whiteAccuracy !== undefined ? { whiteAccuracy } : {}),
      ...(blackAccuracy !== undefined ? { blackAccuracy } : {}),
      puzzleCount,
      createdAt,
      updatedAt
    },
    plyEvals:
      preferredAnalysis.plyEvals.length > 0
        ? preferredAnalysis.plyEvals.map((e) => ({ ...e }))
        : other.plyEvals.map((e) => ({ ...e }))
  };
}

/**
 * Deterministic merge for two `StoredUserPuzzle` records with the same deterministic `id`.
 * Prefers higher difficulty rating provenance (`maia2_sf_v1 > sf_heuristic_v1 > game_anchor`),
 * preserves archived state monotonically, and converges across devices regardless of sync order.
 */
export function mergeStoredUserPuzzles(
  local: StoredUserPuzzle,
  incoming: StoredUserPuzzle
): StoredUserPuzzle {
  const localQuality = local.ratingSource ? (RATING_SOURCE_RANK[local.ratingSource] ?? 0) : 0;
  const incomingQuality = incoming.ratingSource
    ? (RATING_SOURCE_RANK[incoming.ratingSource] ?? 0)
    : 0;
  const ratingWinner =
    incomingQuality > localQuality
      ? incoming
      : localQuality > incomingQuality
        ? local
        : incoming.createdAt < local.createdAt
          ? incoming
          : local;
  const base = incoming.createdAt < local.createdAt ? incoming : local;
  return {
    ...base,
    rating: ratingWinner.rating,
    ...(ratingWinner.ratingSource !== undefined
      ? { ratingSource: ratingWinner.ratingSource }
      : {}),
    archived: Boolean(local.archived || incoming.archived),
    createdAt: local.createdAt <= incoming.createdAt ? local.createdAt : incoming.createdAt
  };
}

export function extractGamesV1Preferences(
  settings: PracticeSettings,
  maiaSetup: MaiaSetupPreferences
): GamesV1SyncedPreferences {
  return {
    arrowDuel: {
      opponentReplyEnabled: Boolean(settings.arrowDuel?.opponentReplyEnabled ?? true)
    },
    appearance: normalizeAppearancePreference(settings.appearance),
    lightBoardTheme: normalizeBoardTheme(settings.lightBoardTheme, settings.lightBoardTheme),
    darkBoardTheme: normalizeBoardTheme(settings.darkBoardTheme, settings.darkBoardTheme),
    pieceSet: normalizePieceSet(settings.pieceSet),
    gameReview: {
      autoAddRecommendedToReview: Boolean(settings.gameReview?.autoAddRecommendedToReview ?? false),
      autoSyncCooldownMinutes: normalizeGameReviewAutoSyncCooldownMinutes(
        settings.gameReview?.autoSyncCooldownMinutes ??
          DEFAULT_GAME_REVIEW_AUTO_SYNC_COOLDOWN_MINUTES
      )
    },
    maiaSetup: {
      timeControl: { ...maiaSetup.timeControl },
      rated: maiaSetup.rated,
      opponentRating: maiaSetup.opponentRating,
      colorPreference: maiaSetup.colorPreference,
      thinkingPace: maiaSetup.thinkingPace
    }
  };
}

export async function syncGamesV1(
  store: GamesV1SyncStore,
  transport: GamesV1ZoneTransport,
  options: GamesV1SyncOptions = {}
): Promise<GamesV1SyncResult> {
  if (!store.getSettings().sync.iCloudEnabled) {
    return {
      status: "disabled",
      pulledRecordCount: 0,
      pushedRecordCount: 0,
      applied: { ...EMPTY_APPLY_RESULT }
    };
  }
  assertCurrent(options);
  await transport.ensureZone();
  assertCurrent(options);
  store.gamesV1.writeState({ zoneInitialized: true });

  const now = options.now ?? (() => new Date().toISOString());
  let state = store.gamesV1.readState();
  let pulledRecordCount = 0;
  const applied: GamesV1ApplyResult = { ...EMPTY_APPLY_RESULT };

  // --- Phase 1: Pull incremental changes from GamesV1 zone ---
  // Accumulate all pages before applying so cross-page parent/child records
  // (e.g. imported_game -> user_puzzle -> ug_attempt) always resolve in topological order.
  let moreComing = true;
  let token = state.serverChangeToken;
  let rebuiltExpiredToken = false;
  const pulledRecords: ProgressV2ChangePage["records"] = [];
  const pulledDeletedRecords: ProgressV2DeletedRecord[] = [];
  let pulledAnyPage = false;

  while (moreComing) {
    let page: ProgressV2ChangePage;
    try {
      page = await transport.fetchZoneChanges(token);
    } catch (error) {
      if (
        error instanceof ProgressV2ChangeTokenExpiredError &&
        token !== undefined &&
        !rebuiltExpiredToken
      ) {
        rebuiltExpiredToken = true;
        token = undefined;
        pulledRecords.length = 0;
        pulledDeletedRecords.length = 0;
        pulledAnyPage = false;
        continue;
      }
      throw error;
    }
    assertCurrent(options);

    pulledAnyPage = true;
    pulledRecords.push(...page.records);
    pulledDeletedRecords.push(...page.deletedRecords);
    token = page.nextToken;
    moreComing = page.moreComing;
  }

  if (pulledAnyPage && token !== undefined) {
    pulledRecordCount = pulledRecords.length + pulledDeletedRecords.length;
    const localSnapshot = store.gamesV1.exportGamesV1Snapshot();
    const syncedHashes = store.gamesV1.readSyncedHashes();
    const localTombstones = store.gamesV1.listTombstones();
    const localPrefs = extractGamesV1Preferences(localSnapshot.settings, localSnapshot.maiaSetup);
    const prefHashKey = gamesV1IdentityMapKey({ kind: "games_preferences", entityKey: "default" });
    const localPrefsDirty =
      state.serverChangeToken !== undefined &&
      syncedHashes.get(prefHashKey) !== hashCanonicalValue(localPrefs);

    const { batch, hashUpdates } = decodeGamesV1Page({
      records: pulledRecords,
      deletedRecords: pulledDeletedRecords,
      localTombstones,
      skipRemotePreferences: localPrefsDirty,
      deletedAtFallback: now()
    });

    const pageApplied = store.gamesV1.applyGamesV1RemoteBatch(
      batch,
      {
        zoneInitialized: true,
        serverChangeToken: token,
        serverChangeTokenFingerprint: fingerprintOpaqueToken(token),
        lastPullAt: now()
      },
      hashUpdates
    );
    addApplyResult(applied, pageApplied);
    state = store.gamesV1.readState();
  }

  // --- Phase 2: Push only locally-dirty records & tombstones ---
  assertCurrent(options);
  const pushedRecordCount = await pushGamesV1Changes(store.gamesV1, transport, options, now);

  return {
    status: "synced",
    pulledRecordCount,
    pushedRecordCount,
    applied
  };
}

function decodeGamesV1Page(params: {
  records: readonly { recordName: string; kind: string; schemaVersion: number; payload: string }[];
  deletedRecords: readonly ProgressV2DeletedRecord[];
  localTombstones: readonly GamesV1Tombstone[];
  skipRemotePreferences: boolean;
  deletedAtFallback: string;
}): { batch: GamesV1RemoteMergeBatch; hashUpdates: Map<string, string> } {
  const { records, deletedRecords, localTombstones, skipRemotePreferences, deletedAtFallback } =
    params;

  const physicallyDeleted = new Set(deletedRecords.map((item) => item.recordName));
  const localTombstoneByKey = new Map(
    localTombstones.map((t) => [gamesV1IdentityMapKey(t), t])
  );

  const batch: GamesV1RemoteMergeBatch = {
    linkedAccounts: [],
    importedGames: [],
    userPuzzles: [],
    ugAttempts: [],
    ugReviewQueue: [],
    ugReviewRemovals: [],
    ugRatings: [],
    maiaRatedGames: [],
    maiaRatingAnchors: [],
    tombstones: []
  };
  const hashUpdates = new Map<string, string>();

  for (const deleted of deletedRecords) {
    const identity = parseGamesV1RecordName(deleted.recordName);
    if (!identity || identity.kind === "games_preferences") {
      continue;
    }
    batch.tombstones.push({ ...identity, deletedAt: deletedAtFallback });
  }

  for (const record of records) {
    if (physicallyDeleted.has(record.recordName)) {
      continue;
    }
    const payload = decodeGamesV1Record(record);
    if (!payload) {
      // Forward-compatibility: ignore unknown future record kinds in GamesV1 cleanly.
      continue;
    }
    const identity: GamesV1RecordIdentity = {
      kind: payload.kind,
      entityKey: payload.entityKey
    };
    const mapKey = gamesV1IdentityMapKey(identity);

    if (payload.state === "deleted") {
      batch.tombstones.push({ ...identity, deletedAt: payload.deletedAt });
      hashUpdates.set(mapKey, hashCanonicalValue({ state: "deleted", deletedAt: payload.deletedAt }));
      continue;
    }

    const existingTombstone = localTombstoneByKey.get(mapKey);
    hashUpdates.set(mapKey, hashCanonicalValue(payload.value));

    switch (payload.kind) {
      case "linked_account": {
        const account = payload.value as LinkedGameAccount;
        if (existingTombstone && existingTombstone.deletedAt >= account.createdAt) {
          continue;
        }
        batch.linkedAccounts.push(account);
        break;
      }
      case "imported_game": {
        const bundle = payload.value as GamesV1ImportedGameBundle;
        if (existingTombstone && existingTombstone.deletedAt >= bundle.game.updatedAt) {
          continue;
        }
        batch.importedGames.push(bundle);
        break;
      }
      case "user_puzzle": {
        const puzzle = payload.value as StoredUserPuzzle;
        const gameTombstone = localTombstoneByKey.get(
          gamesV1IdentityMapKey({ kind: "imported_game", entityKey: puzzle.gameId })
        );
        if (gameTombstone && gameTombstone.deletedAt >= puzzle.createdAt) {
          continue;
        }
        if (existingTombstone && existingTombstone.deletedAt >= puzzle.createdAt) {
          continue;
        }
        batch.userPuzzles.push(puzzle);
        break;
      }
      case "ug_attempt": {
        const attempt = payload.value as AttemptHistoryRow;
        if (!isUserGamePuzzleId(attempt.puzzleId)) {
          continue;
        }
        if (existingTombstone) {
          continue;
        }
        batch.ugAttempts.push(attempt);
        break;
      }
      case "ug_review_schedule": {
        const entry = payload.value as
          | { kind: "scheduled"; review: ExportedReviewQueueState }
          | { kind: "removed"; removal: ReviewScheduleRemoval };
        if (entry?.kind === "scheduled" && isUserGamePuzzleId(entry.review.puzzleId)) {
          batch.ugReviewQueue.push(entry.review);
        } else if (entry?.kind === "removed" && isUserGamePuzzleId(entry.removal.puzzleId)) {
          batch.ugReviewRemovals.push(entry.removal);
        }
        break;
      }
      case "ug_rating": {
        const rating = payload.value as RatingRecord;
        if (isUserGameRatingKey(rating.key)) {
          batch.ugRatings.push(rating);
        }
        break;
      }
      case "maia_rated_game": {
        batch.maiaRatedGames.push(payload.value as MaiaRatedGameRecord);
        break;
      }
      case "maia_rating_anchor": {
        batch.maiaRatingAnchors.push(payload.value as MaiaRatingAnchorRecord);
        break;
      }
      case "games_preferences": {
        if (!skipRemotePreferences) {
          batch.preferences = payload.value as GamesV1SyncedPreferences;
        }
        break;
      }
    }
  }

  return { batch, hashUpdates };
}

async function pushGamesV1Changes(
  persistence: GamesV1Persistence,
  transport: GamesV1ZoneTransport,
  options: GamesV1SyncOptions,
  now: () => string
): Promise<number> {
  const snapshot = persistence.exportGamesV1Snapshot();
  const tombstones = persistence.listTombstones();
  const syncedHashes = persistence.readSyncedHashes();

  const desired = buildLocalGamesV1RecordMap(snapshot, tombstones);
  const toPush: Array<{
    mapKey: string;
    record: GamesV1Record;
    hash: string;
  }> = [];

  for (const [mapKey, entry] of desired.entries()) {
    if (syncedHashes.get(mapKey) === entry.hash) {
      continue;
    }
    toPush.push({ mapKey, record: entry.record, hash: entry.hash });
  }

  if (toPush.length === 0) {
    return 0;
  }

  let pushed = 0;
  for (let offset = 0; offset < toPush.length; offset += MODIFY_BATCH_SIZE) {
    assertCurrent(options);
    const slice = toPush.slice(offset, offset + MODIFY_BATCH_SIZE);
    const result = await transport.modifyRecords({
      saving: slice.map((item) => item.record),
      deleting: []
    });
    assertCurrent(options);

    const confirmedNames = new Set(result.savedRecordNames);
    const hashUpdates = new Map<string, string>();
    for (const item of slice) {
      if (confirmedNames.has(item.record.recordName)) {
        hashUpdates.set(item.mapKey, item.hash);
        pushed += 1;
      }
    }
    if (hashUpdates.size > 0) {
      persistence.writeSyncedHashes(hashUpdates);
      persistence.writeState({ lastPushAt: now() });
    }
    if (result.errors.length > 0 && hashUpdates.size === 0) {
      throw new Error(
        `GamesV1 CloudKit write failed: ${result.errors[0]?.code ?? "unknown"} ${result.errors[0]?.message ?? ""}`.trim()
      );
    }
  }

  return pushed;
}

export function buildLocalGamesV1RecordMap(
  snapshot: GamesV1LocalSnapshot,
  tombstones: readonly GamesV1Tombstone[]
): Map<string, { identity: GamesV1RecordIdentity; record: GamesV1Record; hash: string }> {
  const map = new Map<
    string,
    { identity: GamesV1RecordIdentity; record: GamesV1Record; hash: string }
  >();

  const putPresent = (identity: GamesV1RecordIdentity, value: unknown): void => {
    const mapKey = gamesV1IdentityMapKey(identity);
    const payload: GamesV1PresentPayload = {
      formatVersion: GAMES_V1_FORMAT_VERSION,
      kind: identity.kind,
      entityKey: identity.entityKey,
      state: "present",
      value
    };
    map.set(mapKey, {
      identity,
      record: {
        recordName: gamesV1RecordName(identity),
        kind: identity.kind,
        schemaVersion: GAMES_V1_CLOUDKIT_SCHEMA_VERSION,
        payload: JSON.stringify(payload)
      },
      hash: hashCanonicalValue(value)
    });
  };

  const putDeleted = (tombstone: GamesV1Tombstone): void => {
    const identity: GamesV1RecordIdentity = {
      kind: tombstone.kind,
      entityKey: tombstone.entityKey
    };
    const mapKey = gamesV1IdentityMapKey(identity);
    if (map.has(mapKey)) {
      return;
    }
    const payload: GamesV1DeletedPayload = {
      formatVersion: GAMES_V1_FORMAT_VERSION,
      kind: tombstone.kind,
      entityKey: tombstone.entityKey,
      state: "deleted",
      deletedAt: tombstone.deletedAt
    };
    map.set(mapKey, {
      identity,
      record: {
        recordName: gamesV1RecordName(identity),
        kind: tombstone.kind,
        schemaVersion: GAMES_V1_CLOUDKIT_SCHEMA_VERSION,
        payload: JSON.stringify(payload)
      },
      hash: hashCanonicalValue({ state: "deleted", deletedAt: tombstone.deletedAt })
    });
  };

  putPresent(
    { kind: "games_preferences", entityKey: "default" },
    extractGamesV1Preferences(snapshot.settings, snapshot.maiaSetup)
  );

  for (const account of snapshot.linkedAccounts) {
    putPresent(
      {
        kind: "linked_account",
        entityKey: linkedAccountEntityKey(account.platform, account.username)
      },
      account
    );
  }

  for (const bundle of snapshot.importedGames) {
    putPresent({ kind: "imported_game", entityKey: bundle.game.id }, bundle);
  }

  for (const puzzle of snapshot.userPuzzles) {
    putPresent({ kind: "user_puzzle", entityKey: puzzle.id }, puzzle);
  }

  for (const attempt of snapshot.ugAttempts) {
    if (isUserGamePuzzleId(attempt.puzzleId)) {
      putPresent({ kind: "ug_attempt", entityKey: attempt.id }, attempt);
    }
  }

  for (const review of snapshot.ugReviewQueue) {
    if (isUserGamePuzzleId(review.puzzleId)) {
      putPresent(
        {
          kind: "ug_review_schedule",
          entityKey: reviewEntityKey(review.puzzleId, review.mode, review.ratingKey)
        },
        { kind: "scheduled", review }
      );
    }
  }

  for (const removal of snapshot.ugReviewRemovals) {
    if (isUserGamePuzzleId(removal.puzzleId)) {
      const entityKey = reviewEntityKey(removal.puzzleId, removal.mode, removal.ratingKey);
      if (!map.has(gamesV1IdentityMapKey({ kind: "ug_review_schedule", entityKey }))) {
        putPresent({ kind: "ug_review_schedule", entityKey }, { kind: "removed", removal });
      }
    }
  }

  for (const rating of snapshot.ugRatings) {
    if (isUserGameRatingKey(rating.key)) {
      putPresent(
        { kind: "ug_rating", entityKey: ratingEntityKey(rating.key, rating.generation) },
        rating
      );
    }
  }

  for (const maiaGame of snapshot.maiaRatedGames) {
    putPresent({ kind: "maia_rated_game", entityKey: maiaGame.gameId }, maiaGame);
  }

  for (const anchor of snapshot.maiaRatingAnchors) {
    putPresent({ kind: "maia_rating_anchor", entityKey: anchor.timeClass }, anchor);
  }

  for (const tombstone of tombstones) {
    putDeleted(tombstone);
  }

  return map;
}

export function decodeGamesV1Record(record: {
  recordName: string;
  kind: string;
  schemaVersion: number;
  payload: string;
}): GamesV1Payload | undefined {
  if (record.schemaVersion !== GAMES_V1_CLOUDKIT_SCHEMA_VERSION || !isGamesV1RecordKind(record.kind)) {
    return undefined;
  }
  const identity = parseGamesV1RecordName(record.recordName);
  if (!identity || identity.kind !== record.kind) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.payload);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }
  const candidate = parsed as Partial<GamesV1Payload>;
  if (
    candidate.formatVersion !== GAMES_V1_FORMAT_VERSION ||
    candidate.kind !== identity.kind ||
    candidate.entityKey !== identity.entityKey
  ) {
    return undefined;
  }
  if (candidate.state === "present") {
    return candidate as GamesV1PresentPayload;
  }
  if (candidate.state === "deleted" && typeof candidate.deletedAt === "string") {
    return candidate as GamesV1DeletedPayload;
  }
  return undefined;
}

export function hashCanonicalValue(value: unknown): string {
  const json = canonicalJson(value);
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x84222325cbf29ce4n;
  for (let index = 0; index < json.length; index += 1) {
    const code = BigInt(json.charCodeAt(index));
    h1 ^= code;
    h1 = BigInt.asUintN(64, h1 * 0x100000001b3n);
    h2 ^= code ^ 0xffn;
    h2 = BigInt.asUintN(64, h2 * 0x100000001b3n);
  }
  return `${h1.toString(16).padStart(16, "0")}${h2.toString(16).padStart(16, "0")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function maxOptionalIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function countDeepVerified(evals: readonly StoredGamePlyEval[]): number {
  let count = 0;
  for (const item of evals) {
    if (item.deepVerified) {
      count += 1;
    }
  }
  return count;
}

function assertCurrent(options: GamesV1SyncOptions): void {
  if (options.isCurrent && !options.isCurrent()) {
    throw new ProgressV2SyncCancelledError();
  }
}

function addApplyResult(target: GamesV1ApplyResult, delta: GamesV1ApplyResult): void {
  target.linkedAccounts += delta.linkedAccounts;
  target.importedGames += delta.importedGames;
  target.userPuzzles += delta.userPuzzles;
  target.ugAttempts += delta.ugAttempts;
  target.ugReviewQueue += delta.ugReviewQueue;
  target.maiaRatedGames += delta.maiaRatedGames;
  target.tombstonesApplied += delta.tombstonesApplied;
}

export interface GamesV1BatchApplyTarget {
  getSettings(): PracticeSettings;
  saveSettings(settings: PracticeSettings): void;
  getMaiaSetupPreferences(): MaiaSetupPreferences;
  saveMaiaSetupPreferences(preferences: MaiaSetupPreferences): void;
  listLinkedAccounts(): LinkedGameAccount[];
  upsertSyncedLinkedAccount(account: LinkedGameAccount): void;
  removeLinkedAccountWithoutTombstone(platform: LinkedGameAccountPlatform, username: string): void;
  getImportedGame(gameId: string): StoredImportedGame | undefined;
  listGamePlyEvaluations(gameId: string): StoredGamePlyEval[];
  upsertSyncedImportedGameBundle(bundle: GamesV1ImportedGameBundle): void;
  deleteImportedGameWithoutTombstone(gameId: string): void;
  getUserPuzzle(puzzleId: string): StoredUserPuzzle | undefined;
  upsertSyncedUserPuzzle(puzzle: StoredUserPuzzle): void;
  deleteSyncedUserPuzzle(puzzleId: string): void;
  importSyncedUserGameProgress(input: {
    attempts: AttemptHistoryRow[];
    reviewQueue: ExportedReviewQueueState[];
    reviewRemovals: ReviewScheduleRemoval[];
    ratings: RatingRecord[];
  }): { attempts: number; reviewQueue: number };
  listMaiaRatedGames(timeClass?: MaiaTimeClass): MaiaRatedGameRecord[];
  upsertMaiaRatedGame(record: MaiaRatedGameRecord): void;
  getMaiaRatingAnchor(timeClass: MaiaTimeClass): MaiaRatingAnchorRecord | undefined;
  saveMaiaRatingAnchor(anchor: MaiaRatingAnchorRecord): void;
  getMaiaRating(timeClass: MaiaTimeClass): { rating: number; updatedAt: string } | undefined;
  saveMaiaRating(record: ReturnType<typeof recomputeMaiaRatingFromGames>): void;
  recordTombstones(tombstones: readonly GamesV1Tombstone[]): void;
  clearTombstone(identity: GamesV1RecordIdentity): void;
  listTombstones(): GamesV1Tombstone[];
}

/**
 * Shared conflict-free applier used by both `MemoryStore` and `SyncSQLiteStore` inside a single
 * transaction so remote merges behave identically across store implementations.
 */
export function applyGamesV1BatchToTarget(
  target: GamesV1BatchApplyTarget,
  batch: GamesV1RemoteMergeBatch
): GamesV1ApplyResult {
  const result: GamesV1ApplyResult = { ...EMPTY_APPLY_RESULT };

  // 1) Record & apply incoming tombstones first.
  const incomingTombstonesByKey = new Map<string, GamesV1Tombstone>();
  for (const t of batch.tombstones) {
    const key = gamesV1IdentityMapKey(t);
    const prev = incomingTombstonesByKey.get(key);
    if (!prev || t.deletedAt > prev.deletedAt) {
      incomingTombstonesByKey.set(key, t);
    }
  }
  if (incomingTombstonesByKey.size > 0) {
    target.recordTombstones([...incomingTombstonesByKey.values()]);
  }

  const allTombstonesByKey = new Map(
    target.listTombstones().map((t) => [gamesV1IdentityMapKey(t), t])
  );

  for (const tombstone of incomingTombstonesByKey.values()) {
    switch (tombstone.kind) {
      case "linked_account": {
        const sep = tombstone.entityKey.indexOf(":");
        if (sep > 0) {
          const platform = tombstone.entityKey.slice(0, sep) as LinkedGameAccountPlatform;
          const usernameLower = tombstone.entityKey.slice(sep + 1);
          const local = target
            .listLinkedAccounts()
            .find(
              (acc) =>
                acc.platform === platform && acc.username.trim().toLowerCase() === usernameLower
            );
          if (local && tombstone.deletedAt >= local.createdAt) {
            target.removeLinkedAccountWithoutTombstone(local.platform, local.username);
            result.tombstonesApplied += 1;
          }
        }
        break;
      }
      case "imported_game": {
        const localGame = target.getImportedGame(tombstone.entityKey);
        if (localGame && tombstone.deletedAt >= localGame.updatedAt) {
          target.deleteImportedGameWithoutTombstone(tombstone.entityKey);
          result.tombstonesApplied += 1;
        }
        break;
      }
      case "user_puzzle": {
        const localPuzzle = target.getUserPuzzle(tombstone.entityKey);
        if (localPuzzle && tombstone.deletedAt >= localPuzzle.createdAt) {
          target.deleteSyncedUserPuzzle(tombstone.entityKey);
          result.tombstonesApplied += 1;
        }
        break;
      }
      default:
        break;
    }
  }

  // 2) Merge linked accounts (max lastSyncedAt, min createdAt).
  const localAccountsByKey = new Map(
    target
      .listLinkedAccounts()
      .map((acc) => [linkedAccountEntityKey(acc.platform, acc.username), acc])
  );
  for (const incoming of batch.linkedAccounts) {
    const key = linkedAccountEntityKey(incoming.platform, incoming.username);
    const tomb = allTombstonesByKey.get(
      gamesV1IdentityMapKey({ kind: "linked_account", entityKey: key })
    );
    if (tomb && tomb.deletedAt >= incoming.createdAt) {
      continue;
    }
    const existing = localAccountsByKey.get(key);
    const merged = existing ? mergeLinkedGameAccounts(existing, incoming) : incoming;
    target.upsertSyncedLinkedAccount(merged);
    if (tomb && incoming.createdAt > tomb.deletedAt) {
      target.clearTombstone({ kind: "linked_account", entityKey: key });
    }
    localAccountsByKey.set(key, merged);
    result.linkedAccounts += 1;
  }

  // 3) Merge imported games + ply evaluations monotonically (complete > pass1_done > partial > none).
  for (const incoming of batch.importedGames) {
    const tomb = allTombstonesByKey.get(
      gamesV1IdentityMapKey({ kind: "imported_game", entityKey: incoming.game.id })
    );
    if (tomb && tomb.deletedAt >= incoming.game.updatedAt) {
      continue;
    }
    const localGame = target.getImportedGame(incoming.game.id);
    const merged = localGame
      ? mergeImportedGameBundles(
          { game: localGame, plyEvals: target.listGamePlyEvaluations(incoming.game.id) },
          incoming
        )
      : incoming;
    target.upsertSyncedImportedGameBundle(merged);
    if (tomb && incoming.game.updatedAt > tomb.deletedAt) {
      target.clearTombstone({ kind: "imported_game", entityKey: incoming.game.id });
    }
    result.importedGames += 1;
  }

  // 4) Merge user puzzles deterministically (preferring higher ratingSource provenance).
  for (const incoming of batch.userPuzzles) {
    const gameTomb = allTombstonesByKey.get(
      gamesV1IdentityMapKey({ kind: "imported_game", entityKey: incoming.gameId })
    );
    if (gameTomb && gameTomb.deletedAt >= incoming.createdAt) {
      continue;
    }
    const puzzleTomb = allTombstonesByKey.get(
      gamesV1IdentityMapKey({ kind: "user_puzzle", entityKey: incoming.id })
    );
    if (puzzleTomb && puzzleTomb.deletedAt >= incoming.createdAt) {
      continue;
    }
    if (!target.getImportedGame(incoming.gameId)) {
      continue;
    }
    const localPuzzle = target.getUserPuzzle(incoming.id);
    const merged = localPuzzle ? mergeStoredUserPuzzles(localPuzzle, incoming) : incoming;
    target.upsertSyncedUserPuzzle(merged);
    result.userPuzzles += 1;
  }

  // 5) Import ug_* attempts, review queue, removals, and ratings (only for live user puzzles).
  const validAttempts = batch.ugAttempts.filter((attempt) =>
    Boolean(target.getUserPuzzle(attempt.puzzleId))
  );
  const validReviewQueue = batch.ugReviewQueue.filter((item) =>
    Boolean(target.getUserPuzzle(item.puzzleId))
  );
  const validReviewRemovals = batch.ugReviewRemovals.filter((removal) =>
    Boolean(target.getUserPuzzle(removal.puzzleId))
  );
  if (
    validAttempts.length > 0 ||
    validReviewQueue.length > 0 ||
    validReviewRemovals.length > 0 ||
    batch.ugRatings.length > 0
  ) {
    const importedProgress = target.importSyncedUserGameProgress({
      attempts: validAttempts,
      reviewQueue: validReviewQueue,
      reviewRemovals: validReviewRemovals,
      ratings: batch.ugRatings
    });
    result.ugAttempts += importedProgress.attempts;
    result.ugReviewQueue += importedProgress.reviewQueue;
  }

  // 6) Merge Maia rating anchors & rated games ledger, then deterministically recompute Maia ratings.
  const touchedMaiaTimeClasses = new Set<MaiaTimeClass>();
  for (const incomingAnchor of batch.maiaRatingAnchors) {
    const existing = target.getMaiaRatingAnchor(incomingAnchor.timeClass);
    const merged = existing
      ? preferredMaiaRatingAnchor(existing, incomingAnchor)
      : incomingAnchor;
    target.saveMaiaRatingAnchor(merged);
    touchedMaiaTimeClasses.add(incomingAnchor.timeClass);
  }
  for (const incomingGame of batch.maiaRatedGames) {
    target.upsertMaiaRatedGame(incomingGame);
    touchedMaiaTimeClasses.add(incomingGame.timeClass);
    result.maiaRatedGames += 1;
  }
  for (const timeClass of touchedMaiaTimeClasses) {
    const anchor = target.getMaiaRatingAnchor(timeClass);
    const ratedGames = target.listMaiaRatedGames(timeClass);
    const existingRating = target.getMaiaRating(timeClass);
    const recomputed = recomputeMaiaRatingFromGames({
      timeClass,
      ...(anchor !== undefined ? { anchor } : {}),
      ratedGames,
      ...(existingRating !== undefined
        ? {
            fallbackInitialRating: existingRating.rating,
            fallbackUpdatedAt: existingRating.updatedAt
          }
        : {})
    });
    target.saveMaiaRating(recomputed);
  }

  // 7) Merge 2.0 synced preferences (arrowDuel, appearance, board/piece themes, gameReview, maiaSetup).
  if (batch.preferences) {
    const currentSettings = target.getSettings();
    target.saveSettings({
      ...currentSettings,
      appearance: normalizeAppearancePreference(batch.preferences.appearance),
      lightBoardTheme: normalizeBoardTheme(
        batch.preferences.lightBoardTheme,
        currentSettings.lightBoardTheme
      ),
      darkBoardTheme: normalizeBoardTheme(
        batch.preferences.darkBoardTheme,
        currentSettings.darkBoardTheme
      ),
      pieceSet: normalizePieceSet(batch.preferences.pieceSet),
      arrowDuel: {
        opponentReplyEnabled: Boolean(batch.preferences.arrowDuel.opponentReplyEnabled)
      },
      gameReview: {
        autoAddRecommendedToReview: Boolean(
          batch.preferences.gameReview.autoAddRecommendedToReview
        ),
        autoSyncCooldownMinutes: normalizeGameReviewAutoSyncCooldownMinutes(
          batch.preferences.gameReview.autoSyncCooldownMinutes
        )
      }
    });
    target.saveMaiaSetupPreferences(batch.preferences.maiaSetup);
  }

  return result;
}

/**
 * Helper used by both MemoryStore and SyncSQLiteStore to apply a `GamesV1RemoteMergeBatch`
 * and deterministically recompute all Maia ratings from the merged ledger.
 */
export function applyGamesV1MergeHelpers() {
  return {
    preferredAttemptHistoryRow,
    preferredReviewScheduleChange,
    preferredMaiaRatingAnchor,
    recomputeMaiaRatingFromGames,
    MAIA_TIME_CLASSES
  };
}

/**
 * Maintained in-memory CloudKit zone transport for deterministic multi-device GamesV1 sync tests.
 */
export class FakeGamesV1ZoneTransport implements GamesV1ZoneTransport {
  readonly zoneName: string;
  private zoneCreated = false;
  private readonly recordsByName = new Map<string, GamesV1Record>();
  private readonly changeLog: Array<
    | { kind: "upsert"; record: GamesV1Record }
    | { kind: "delete"; recordName: string }
  > = [];
  readonly modifyBatches: Array<{ saving: GamesV1Record[]; deleting: string[] }> = [];

  constructor(zoneName: string = GAMES_V1_ZONE_NAME) {
    this.zoneName = zoneName;
  }

  get records(): GamesV1Record[] {
    return [...this.recordsByName.values()].map((record) => ({ ...record }));
  }

  async ensureZone(): Promise<void> {
    this.zoneCreated = true;
  }

  isZoneCreated(): boolean {
    return this.zoneCreated;
  }

  async fetchZoneChanges(previousToken?: string): Promise<ProgressV2ChangePage> {
    const startIndex = previousToken ? Number(previousToken) : 0;
    if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > this.changeLog.length) {
      throw new ProgressV2ChangeTokenExpiredError();
    }
    const latestRecords = new Map<string, GamesV1Record>();
    const deletedNames = new Set<string>();
    for (let i = startIndex; i < this.changeLog.length; i += 1) {
      const event = this.changeLog[i]!;
      if (event.kind === "upsert") {
        deletedNames.delete(event.record.recordName);
        latestRecords.set(event.record.recordName, { ...event.record });
      } else {
        latestRecords.delete(event.recordName);
        deletedNames.add(event.recordName);
      }
    }
    return {
      records: [...latestRecords.values()] as unknown as ProgressV2ChangePage["records"],
      deletedRecords: [...deletedNames].map((recordName) => ({ recordName })),
      nextToken: String(this.changeLog.length),
      moreComing: false
    };
  }

  async modifyRecords(input: {
    saving: readonly GamesV1Record[];
    deleting: readonly string[];
  }): Promise<ProgressV2ModifyResult> {
    this.modifyBatches.push({
      saving: input.saving.map((r) => ({ ...r })),
      deleting: [...input.deleting]
    });
    const savedRecordNames: string[] = [];
    const deletedRecordNames: string[] = [];
    for (const record of input.saving) {
      this.recordsByName.set(record.recordName, { ...record });
      this.changeLog.push({ kind: "upsert", record: { ...record } });
      savedRecordNames.push(record.recordName);
    }
    for (const recordName of input.deleting) {
      this.recordsByName.delete(recordName);
      this.changeLog.push({ kind: "delete", recordName });
      deletedRecordNames.push(recordName);
    }
    return { savedRecordNames, deletedRecordNames, errors: [] };
  }
}
