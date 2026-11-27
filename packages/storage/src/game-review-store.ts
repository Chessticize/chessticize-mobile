import {
  USER_GAME_PUZZLE_ID_PREFIX,
  isUserGamePuzzleId,
  namedThemesForSelection,
  puzzleMatchesAnyTheme,
  type AnalysisScore,
  type ClockBucket,
  type ExtractedGamePuzzle,
  type GamePlatform,
  type GamePlyEvaluation,
  type GamePuzzleMomentKind,
  type ImportedGameDraft,
  type MoveClassification,
  type Puzzle,
  type UserGamePuzzleMeta
} from "../../core/src/index.ts";
import type { ExportedSprintSession, LocalDataExport } from "./practice-store.ts";
import type { ProgressV2RecordIdentity } from "./progress-v2-persistence.ts";

export const DEFAULT_USER_GAME_PUZZLE_RATING = 1500;
export const USER_GAME_RATING_KEY_PREFIX = USER_GAME_PUZZLE_ID_PREFIX;
export const USER_GAME_REVIEW_SESSION_PREFIX = `review-session:${USER_GAME_PUZZLE_ID_PREFIX}`;
export const USER_GAME_REVIEW_ATTEMPT_PREFIX = `review-attempt:${USER_GAME_PUZZLE_ID_PREFIX}`;

export type LinkedGameAccountPlatform = "chess_com" | "lichess";

export interface LinkedGameAccount {
  platform: LinkedGameAccountPlatform;
  username: string;
  lastSyncedAt?: string;
  createdAt: string;
}

export type GameAnalysisStatus = "none" | "partial" | "pass1_done" | "complete";

export interface StoredImportedGame extends ImportedGameDraft {
  analysisStatus: GameAnalysisStatus;
  analysisCheckpointPly: number;
  whiteAccuracy?: number;
  blackAccuracy?: number;
  puzzleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredGamePlyEval {
  gameId: string;
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  evalKind: "cp" | "mate";
  whiteScore: number;
  sideToMoveScore: number;
  whiteWinPercent: number;
  moverWinPercentBefore: number;
  moverWinPercentAfter: number;
  winPercentLoss: number;
  bestMove?: string;
  classification: MoveClassification;
  clockRemainingSec?: number;
  timeSpentSec?: number;
  clockBucket: ClockBucket;
  isKeyMomentCandidate: boolean;
  fromPreExistingEval: boolean;
  deepVerified: boolean;
}

export interface StoredUserPuzzle {
  id: string;
  gameId: string;
  gamePly: number;
  gameMoveNumber: number;
  puzzleKind: "line" | "arrow_duel";
  momentKind: GamePuzzleMomentKind;
  initialFen: string;
  solutionMoves: string[];
  stockfishEval?: number;
  stockfishBestMove?: string;
  stockfishEvalAfterFirstMove?: number;
  punishmentLine?: string[];
  themes: string[];
  rating: number;
  opponentName?: string;
  playedAt?: string;
  timeClass?: string;
  clockRemainingSec?: number;
  timeSpentSec?: number;
  caliberScore?: number;
  archived: boolean;
  createdAt: string;
}

export interface GameListFilter {
  platform?: GamePlatform;
  timeClass?: string;
  analysisStatus?: GameAnalysisStatus | "analyzed" | "unanalyzed";
  limit?: number;
  offset?: number;
}

export interface UserPuzzleFilter {
  puzzleKind?: "line" | "arrow_duel";
  gameId?: string;
  timeClass?: string;
  themes?: string[];
  includeArchived?: boolean;
  limit?: number;
}

export interface UpsertImportedGamesResult {
  inserted: number;
  skipped: number;
  updated: number;
}

export interface SaveGamePlyEvaluationsStatusUpdate {
  analysisStatus: GameAnalysisStatus;
  analysisCheckpointPly: number;
  whiteAccuracy?: number;
  blackAccuracy?: number;
  updatedAt?: string;
}

export interface ReplaceGameUserPuzzlesMeta {
  opponentName?: string;
  playedAt?: string;
  timeClass?: string;
  ratingAnchor?: number;
  nowIso?: string;
}

export interface GameReviewStore {
  listLinkedAccounts(): LinkedGameAccount[];
  upsertLinkedAccount(
    account: Omit<LinkedGameAccount, "createdAt"> & { createdAt?: string }
  ): LinkedGameAccount;
  removeLinkedAccount(platform: LinkedGameAccountPlatform, username: string): void;
  upsertImportedGames(
    games: readonly ImportedGameDraft[],
    nowIso?: string
  ): UpsertImportedGamesResult;
  listImportedGames(filter?: GameListFilter): StoredImportedGame[];
  countImportedGames(filter?: Omit<GameListFilter, "limit" | "offset">): number;
  getImportedGame(gameId: string): StoredImportedGame | undefined;
  deleteImportedGame(gameId: string): void;
  saveGamePlyEvaluations(
    gameId: string,
    evals: readonly StoredGamePlyEval[],
    statusUpdate: SaveGamePlyEvaluationsStatusUpdate
  ): void;
  listGamePlyEvaluations(gameId: string): StoredGamePlyEval[];
  replaceGameUserPuzzles(
    gameId: string,
    puzzles: readonly ExtractedGamePuzzle[],
    gameMeta: ReplaceGameUserPuzzlesMeta
  ): StoredUserPuzzle[];
  listUserPuzzles(filter?: UserPuzzleFilter): StoredUserPuzzle[];
  countUserPuzzles(filter?: Omit<UserPuzzleFilter, "limit">): number;
  getUserPuzzle(puzzleId: string): StoredUserPuzzle | undefined;
  archiveUserPuzzle(puzzleId: string, archived?: boolean): void;
}

export function userGamePuzzleIdFor(
  gameId: string,
  extracted: Pick<ExtractedGamePuzzle, "idSeed">
): string {
  const input = `${gameId}|${extracted.idSeed}`;
  const high = fnv1a64Hex(input, 0xcbf29ce484222325n);
  const low = fnv1a64Hex(`ug2|${input}`, 0x84222325cbf29ce4n);
  return `${USER_GAME_PUZZLE_ID_PREFIX}${high}${low.slice(0, 8)}`;
}

export function storedUserPuzzleToPuzzle(stored: StoredUserPuzzle): Puzzle {
  const userGameMeta: UserGamePuzzleMeta = {
    gameId: stored.gameId,
    gamePly: stored.gamePly,
    gameMoveNumber: stored.gameMoveNumber,
    puzzleKind: stored.puzzleKind,
    momentKind: stored.momentKind,
    ...(stored.opponentName === undefined ? {} : { opponentName: stored.opponentName }),
    ...(stored.playedAt === undefined ? {} : { playedAt: stored.playedAt }),
    ...(stored.timeClass === undefined ? {} : { timeClass: stored.timeClass }),
    ...(stored.clockRemainingSec === undefined
      ? {}
      : { clockRemainingSec: stored.clockRemainingSec }),
    ...(stored.timeSpentSec === undefined ? {} : { timeSpentSec: stored.timeSpentSec }),
    ...(stored.punishmentLine === undefined
      ? {}
      : { punishmentLine: [...stored.punishmentLine] }),
    ...(stored.caliberScore === undefined ? {} : { caliberScore: stored.caliberScore })
  };

  return {
    id: stored.id,
    initialFen: stored.initialFen,
    solutionMoves: [...stored.solutionMoves],
    rating: stored.rating,
    themes: [...stored.themes],
    source: "user_game",
    ...(stored.stockfishEval === undefined ? {} : { stockfishEval: stored.stockfishEval }),
    ...(stored.stockfishBestMove === undefined
      ? {}
      : { stockfishBestMove: stored.stockfishBestMove }),
    ...(stored.stockfishEvalAfterFirstMove === undefined
      ? {}
      : { stockfishEvalAfterFirstMove: stored.stockfishEvalAfterFirstMove }),
    userGameMeta
  };
}

export function extractedGamePuzzleToStoredUserPuzzle(
  gameId: string,
  extracted: ExtractedGamePuzzle,
  gameMeta: ReplaceGameUserPuzzlesMeta,
  existing?: Pick<StoredUserPuzzle, "createdAt" | "archived">
): StoredUserPuzzle {
  const nowIso = gameMeta.nowIso ?? new Date().toISOString();
  const id = userGamePuzzleIdFor(gameId, extracted);
  const rating = normalizeUserPuzzleRating(gameMeta.ratingAnchor);

  if (extracted.puzzleKind === "arrow_duel") {
    const arrowDuel = extracted.arrowDuel;
    const initialFen = arrowDuel?.decisionFen ?? extracted.initialFen;
    const punishmentLine = arrowDuel ? [...arrowDuel.punishmentLine] : [];
    const blunderMove = arrowDuel?.blunderMove ?? extracted.solutionMoves[0];
    const solutionMoves =
      blunderMove !== undefined &&
      extracted.solutionMoves[0]?.trim().toLowerCase() !== blunderMove.trim().toLowerCase()
        ? [blunderMove, ...punishmentLine]
        : extracted.solutionMoves.length > 0
          ? [...extracted.solutionMoves]
          : blunderMove !== undefined
            ? [blunderMove, ...punishmentLine]
            : [];

    return {
      id,
      gameId,
      gamePly: extracted.ply,
      gameMoveNumber: extracted.moveNumber,
      puzzleKind: "arrow_duel",
      momentKind: extracted.momentKind,
      initialFen,
      solutionMoves,
      ...(arrowDuel === undefined
        ? {}
        : {
            stockfishEval: arrowDuel.bestEvalWhite,
            stockfishBestMove: arrowDuel.bestMove,
            stockfishEvalAfterFirstMove: arrowDuel.blunderEvalWhite,
            punishmentLine
          }),
      themes: [...extracted.themes],
      rating,
      ...(gameMeta.opponentName === undefined ? {} : { opponentName: gameMeta.opponentName }),
      ...(gameMeta.playedAt === undefined ? {} : { playedAt: gameMeta.playedAt }),
      ...(gameMeta.timeClass === undefined ? {} : { timeClass: gameMeta.timeClass }),
      ...(extracted.clockRemainingSec === undefined
        ? {}
        : { clockRemainingSec: extracted.clockRemainingSec }),
      ...(extracted.timeSpentSec === undefined ? {} : { timeSpentSec: extracted.timeSpentSec }),
      caliberScore: extracted.caliberScore,
      archived: existing?.archived ?? false,
      createdAt: existing?.createdAt ?? nowIso
    };
  }

  return {
    id,
    gameId,
    gamePly: extracted.ply,
    gameMoveNumber: extracted.moveNumber,
    puzzleKind: "line",
    momentKind: extracted.momentKind,
    initialFen: extracted.initialFen,
    solutionMoves: [...extracted.solutionMoves],
    themes: [...extracted.themes],
    rating,
    ...(gameMeta.opponentName === undefined ? {} : { opponentName: gameMeta.opponentName }),
    ...(gameMeta.playedAt === undefined ? {} : { playedAt: gameMeta.playedAt }),
    ...(gameMeta.timeClass === undefined ? {} : { timeClass: gameMeta.timeClass }),
    ...(extracted.clockRemainingSec === undefined
      ? {}
      : { clockRemainingSec: extracted.clockRemainingSec }),
    ...(extracted.timeSpentSec === undefined ? {} : { timeSpentSec: extracted.timeSpentSec }),
    caliberScore: extracted.caliberScore,
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt ?? nowIso
  };
}

export function storedGamePlyEvalFromEvaluation(
  gameId: string,
  evaluation: GamePlyEvaluation,
  deepVerified = false
): StoredGamePlyEval {
  const score = evaluation.scoreAfter;
  return {
    gameId,
    ply: evaluation.ply,
    moveNumber: evaluation.moveNumber,
    color: evaluation.color,
    uci: evaluation.uci,
    san: evaluation.san,
    fenBefore: evaluation.fenBefore,
    fenAfter: evaluation.fenAfter,
    evalKind: score.kind,
    whiteScore: score.kind === "mate" ? score.whiteMate : score.whiteCentipawns,
    sideToMoveScore:
      score.kind === "mate" ? score.sideToMoveMate : score.sideToMoveCentipawns,
    whiteWinPercent: evaluation.whiteWinPercent,
    moverWinPercentBefore: evaluation.moverWinPercentBefore,
    moverWinPercentAfter: evaluation.moverWinPercentAfter,
    winPercentLoss: evaluation.winPercentLoss,
    ...(evaluation.bestMove === undefined ? {} : { bestMove: evaluation.bestMove }),
    classification: evaluation.classification,
    ...(evaluation.clockRemainingSec === undefined
      ? {}
      : { clockRemainingSec: evaluation.clockRemainingSec }),
    ...(evaluation.timeSpentSec === undefined ? {} : { timeSpentSec: evaluation.timeSpentSec }),
    clockBucket: evaluation.clockBucket,
    isKeyMomentCandidate: evaluation.isKeyMomentCandidate,
    fromPreExistingEval: evaluation.fromPreExistingEval,
    deepVerified
  };
}

export function gamePlyEvaluationFromStored(stored: StoredGamePlyEval): GamePlyEvaluation {
  const scoreAfter: AnalysisScore =
    stored.evalKind === "mate"
      ? {
          kind: "mate",
          whiteMate: stored.whiteScore,
          sideToMoveMate: stored.sideToMoveScore
        }
      : {
          kind: "cp",
          whiteCentipawns: stored.whiteScore,
          sideToMoveCentipawns: stored.sideToMoveScore
        };

  return {
    ply: stored.ply,
    moveNumber: stored.moveNumber,
    color: stored.color,
    uci: stored.uci,
    san: stored.san,
    fenBefore: stored.fenBefore,
    fenAfter: stored.fenAfter,
    scoreAfter,
    whiteWinPercent: stored.whiteWinPercent,
    moverWinPercentBefore: stored.moverWinPercentBefore,
    moverWinPercentAfter: stored.moverWinPercentAfter,
    winPercentLoss: stored.winPercentLoss,
    ...(stored.bestMove === undefined ? {} : { bestMove: stored.bestMove }),
    classification: stored.classification,
    ...(stored.clockRemainingSec === undefined
      ? {}
      : { clockRemainingSec: stored.clockRemainingSec }),
    ...(stored.timeSpentSec === undefined ? {} : { timeSpentSec: stored.timeSpentSec }),
    clockBucket: stored.clockBucket,
    isKeyMomentCandidate: stored.isKeyMomentCandidate,
    fromPreExistingEval: stored.fromPreExistingEval
  };
}

export function matchesGameAnalysisStatusFilter(
  status: GameAnalysisStatus,
  filterStatus: GameListFilter["analysisStatus"]
): boolean {
  if (filterStatus === undefined) {
    return true;
  }
  if (filterStatus === "analyzed") {
    return status === "pass1_done" || status === "complete";
  }
  if (filterStatus === "unanalyzed") {
    return status === "none" || status === "partial";
  }
  return status === filterStatus;
}

export function matchesUserPuzzleFilter(
  puzzle: StoredUserPuzzle,
  filter?: UserPuzzleFilter
): boolean {
  if (!filter?.includeArchived && puzzle.archived) {
    return false;
  }
  if (filter?.puzzleKind !== undefined && puzzle.puzzleKind !== filter.puzzleKind) {
    return false;
  }
  if (filter?.gameId !== undefined && puzzle.gameId !== filter.gameId) {
    return false;
  }
  if (filter?.timeClass !== undefined && puzzle.timeClass !== filter.timeClass) {
    return false;
  }
  const selectedThemes = namedThemesForSelection(filter?.themes);
  if (selectedThemes.length > 0 && !puzzleMatchesAnyTheme(puzzle.themes, selectedThemes)) {
    return false;
  }
  return true;
}

export function isEligibleUserGamePuzzleForMode(
  puzzle: Puzzle,
  mode: "standard" | "blitz" | "arrow_duel" | "custom"
): boolean {
  const kind = puzzle.userGameMeta?.puzzleKind;
  if (mode === "arrow_duel") {
    const wrongMove = puzzle.solutionMoves[0]?.trim().toLowerCase();
    const bestMove = puzzle.stockfishBestMove?.trim().toLowerCase();
    return (
      (kind === undefined || kind === "arrow_duel") &&
      Boolean(wrongMove) &&
      Boolean(bestMove) &&
      wrongMove !== bestMove
    );
  }
  return (kind === undefined || kind === "line") && puzzle.solutionMoves.length >= 2;
}

export function sameImportedGameDraft(
  existing: ImportedGameDraft,
  incoming: ImportedGameDraft
): boolean {
  return (
    existing.id === incoming.id &&
    existing.platform === incoming.platform &&
    existing.username === incoming.username &&
    existing.userColor === incoming.userColor &&
    existing.playedAt === incoming.playedAt &&
    existing.timeControl === incoming.timeControl &&
    existing.timeClass === incoming.timeClass &&
    existing.rated === incoming.rated &&
    existing.url === incoming.url &&
    existing.white.username === incoming.white.username &&
    existing.white.rating === incoming.white.rating &&
    existing.white.isAi === incoming.white.isAi &&
    existing.black.username === incoming.black.username &&
    existing.black.rating === incoming.black.rating &&
    existing.black.isAi === incoming.black.isAi &&
    existing.winner === incoming.winner &&
    existing.termination === incoming.termination &&
    existing.eco === incoming.eco &&
    existing.opening === incoming.opening &&
    existing.pgn === incoming.pgn
  );
}

export function inferUserGameMetaFromStoredGame(
  game: StoredImportedGame | undefined,
  gameMeta: ReplaceGameUserPuzzlesMeta
): ReplaceGameUserPuzzlesMeta {
  if (!game) {
    return gameMeta;
  }
  const opponent = game.userColor === "w" ? game.black : game.white;
  const user = game.userColor === "w" ? game.white : game.black;
  return {
    ...gameMeta,
    ...(gameMeta.opponentName === undefined && opponent.username
      ? { opponentName: opponent.username }
      : {}),
    ...(gameMeta.playedAt === undefined && game.playedAt ? { playedAt: game.playedAt } : {}),
    ...(gameMeta.timeClass === undefined && game.timeClass ? { timeClass: game.timeClass } : {}),
    ...(gameMeta.ratingAnchor === undefined && user.rating !== undefined
      ? { ratingAnchor: user.rating }
      : {})
  };
}

function normalizeUserPuzzleRating(ratingAnchor: number | undefined): number {
  if (ratingAnchor === undefined || !Number.isFinite(ratingAnchor)) {
    return DEFAULT_USER_GAME_PUZZLE_RATING;
  }
  return Math.max(400, Math.min(3500, Math.round(ratingAnchor)));
}

function fnv1a64Hex(input: string, offsetBasis: bigint): string {
  let hash = offsetBasis;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function isUserGameRatingKey(ratingKey: string): boolean {
  return ratingKey.startsWith(USER_GAME_RATING_KEY_PREFIX);
}

export function isUserGameSprintSession(
  session: Partial<Pick<ExportedSprintSession, "id" | "ratingKey" | "config">> | null | undefined
): boolean {
  if (!session || typeof session !== "object") {
    return false;
  }
  const id = typeof session.id === "string" ? session.id : "";
  const ratingKey = typeof session.ratingKey === "string" ? session.ratingKey : "";
  return (
    isUserGamePuzzleId(id) ||
    id.startsWith(USER_GAME_REVIEW_SESSION_PREFIX) ||
    isUserGameRatingKey(ratingKey) ||
    session.config?.userGamePuzzles !== undefined
  );
}

export function isUserGameProgressV2Identity(identity: ProgressV2RecordIdentity): boolean {
  switch (identity.kind) {
    case "review_schedule":
      return isUserGamePuzzleId(identity.entityKey.split("\u001f")[0] ?? "");
    case "rating":
      return isUserGameRatingKey(identity.entityKey.split("\u001f")[0] ?? "");
    case "sprint_session":
      return (
        isUserGamePuzzleId(identity.entityKey) ||
        identity.entityKey.startsWith(USER_GAME_REVIEW_SESSION_PREFIX)
      );
    case "attempt":
      return identity.entityKey.startsWith(USER_GAME_REVIEW_ATTEMPT_PREFIX);
    default:
      return false;
  }
}

export function filterOutUserGameProgressV2Data(data: LocalDataExport): LocalDataExport {
  const userGameAttemptSessionIds = new Set<string>();
  const nonUserGameAttemptSessionIds = new Set<string>();
  for (const attempt of data.attempts) {
    if (isUserGamePuzzleId(attempt.puzzleId)) {
      userGameAttemptSessionIds.add(attempt.sessionId);
    } else {
      nonUserGameAttemptSessionIds.add(attempt.sessionId);
    }
  }
  const excludedSessionIds = new Set<string>();
  for (const session of data.sprintSessions) {
    if (
      isUserGameSprintSession(session) ||
      (userGameAttemptSessionIds.has(session.id) &&
        !nonUserGameAttemptSessionIds.has(session.id))
    ) {
      excludedSessionIds.add(session.id);
    }
  }

  return {
    ...data,
    ratings: data.ratings.filter((rating) => !isUserGameRatingKey(rating.key)),
    attempts: data.attempts.filter((attempt) => !isUserGamePuzzleId(attempt.puzzleId)),
    reviewQueue: data.reviewQueue.filter((review) => !isUserGamePuzzleId(review.puzzleId)),
    ...(data.reviewRemovals === undefined
      ? {}
      : {
          reviewRemovals: data.reviewRemovals.filter(
            (removal) => !isUserGamePuzzleId(removal.puzzleId)
          )
        }),
    sprintSessions: data.sprintSessions.filter((session) => !excludedSessionIds.has(session.id))
  };
}

