import { Chess } from "chess.js";
import type { GameColor, GameTermination, GameWinner, ImportedGameDraft } from "../game-import/types.ts";
import {
  DEFAULT_OPPONENT_RATING_DEVIATION,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  RATING_FLOOR,
  calculateGlicko2RatingChange,
  type SprintRatingChange
} from "../ratings.ts";
import {
  DEFAULT_MAIA_SETUP_PREFERENCES,
  MAIA_DEFAULT_RATING,
  MAIA_MAX_OPPONENT_RATING,
  MAIA_MIN_ESTIMATED_SECONDS,
  MAIA_MIN_RATING,
  MAIA_OPPONENT_RATING_STEP,
  type MaiaGameClocksMs,
  type MaiaGameEndReason,
  type MaiaGameMoveRecord,
  type MaiaGameState,
  type MaiaRatedGameRecord,
  type MaiaRatingAnchorRecord,
  type MaiaRatingRecord,
  type MaiaSetupPreferences,
  type MaiaThinkingPace,
  type MaiaTimeClass,
  type MaiaTimeControl
} from "./types.ts";

export const STANDARD_STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_MATERIAL_VALUE: Readonly<Record<string, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

export function maiaOppositeColor(color: GameColor): GameColor {
  return color === "w" ? "b" : "w";
}

export function estimatedMaiaTimeControlSeconds(control: MaiaTimeControl): number {
  if (control.unlimited) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, control.initialMinutes) * 60 + 40 * Math.max(0, control.incrementSeconds);
}

/**
 * Normalize and validate a time control. Bullet (< 3 min estimated duration) is
 * clamped up to the Blitz floor (3+0) so Bullet games cannot be created.
 */
export function normalizeMaiaTimeControl(control: MaiaTimeControl): MaiaTimeControl {
  if (control.unlimited) {
    return { initialMinutes: 0, incrementSeconds: 0, unlimited: true };
  }
  const rawMinutes = Math.max(0, Math.min(180, Math.round(control.initialMinutes)));
  const rawIncrement = Math.max(0, Math.min(60, Math.round(control.incrementSeconds)));
  if (rawMinutes * 60 + 40 * rawIncrement < MAIA_MIN_ESTIMATED_SECONDS) {
    // Bump base minutes so estimated duration meets Blitz minimum (180s).
    const neededMinutes = Math.ceil((MAIA_MIN_ESTIMATED_SECONDS - 40 * rawIncrement) / 60);
    return {
      initialMinutes: Math.max(1, neededMinutes),
      incrementSeconds: rawIncrement,
      unlimited: false
    };
  }
  return {
    initialMinutes: rawMinutes,
    incrementSeconds: rawIncrement,
    unlimited: false
  };
}

export function classifyMaiaTimeControl(control: MaiaTimeControl): MaiaTimeClass {
  if (control.unlimited) {
    return "classical";
  }
  const estimated = estimatedMaiaTimeControlSeconds(control);
  if (estimated < 600) {
    return "blitz";
  }
  if (estimated < 1500) {
    return "rapid";
  }
  return "classical";
}

export function formatMaiaTimeControlLabel(control: MaiaTimeControl): string {
  if (control.unlimited) {
    return "Unlimited";
  }
  return `${control.initialMinutes}+${control.incrementSeconds}`;
}

export function formatMaiaTimeControlPgnTag(control: MaiaTimeControl): string {
  if (control.unlimited) {
    return "-";
  }
  return `${control.initialMinutes * 60}+${control.incrementSeconds}`;
}

export function clampMaiaOpponentRating(rating: number): number {
  if (!Number.isFinite(rating)) {
    return MAIA_DEFAULT_RATING;
  }
  const rounded = Math.round(rating / MAIA_OPPONENT_RATING_STEP) * MAIA_OPPONENT_RATING_STEP;
  return Math.max(MAIA_MIN_RATING, Math.min(MAIA_MAX_OPPONENT_RATING, rounded));
}

/**
 * Resolve Maia's effective opponent rating: defaults to matching the user's own rating
 * (clamped to Maia's supported bounds) unless a custom opponent rating was explicitly chosen.
 */
export function resolveMaiaOpponentRating(
  userRating: number,
  customOpponentRating?: number | null
): number {
  if (customOpponentRating != null && Number.isFinite(customOpponentRating)) {
    return clampMaiaOpponentRating(customOpponentRating);
  }
  if (!Number.isFinite(userRating)) {
    return MAIA_DEFAULT_RATING;
  }
  return Math.max(MAIA_MIN_RATING, Math.min(MAIA_MAX_OPPONENT_RATING, Math.round(userRating)));
}

/**
 * Step Maia's opponent rating to the next/previous 100-point boundary from any starting value
 * (e.g., 1392 +1 -> 1400, 1392 -1 -> 1300, 1400 +1 -> 1500, 1400 -1 -> 1300).
 */
export function stepMaiaOpponentRating(currentRating: number, direction: -1 | 1): number {
  const safe = Number.isFinite(currentRating) ? currentRating : MAIA_DEFAULT_RATING;
  const next =
    direction > 0
      ? (Math.floor(safe / MAIA_OPPONENT_RATING_STEP) + 1) * MAIA_OPPONENT_RATING_STEP
      : (Math.ceil(safe / MAIA_OPPONENT_RATING_STEP) - 1) * MAIA_OPPONENT_RATING_STEP;
  return Math.max(MAIA_MIN_RATING, Math.min(MAIA_MAX_OPPONENT_RATING, next));
}

export function normalizeMaiaSetupPreferences(
  input: Partial<MaiaSetupPreferences> | undefined
): MaiaSetupPreferences {
  const timeControl = normalizeMaiaTimeControl(
    input?.timeControl ?? DEFAULT_MAIA_SETUP_PREFERENCES.timeControl
  );
  const rated = typeof input?.rated === "boolean" ? input.rated : DEFAULT_MAIA_SETUP_PREFERENCES.rated;
  const opponentRating = clampMaiaOpponentRating(
    input?.opponentRating ?? DEFAULT_MAIA_SETUP_PREFERENCES.opponentRating
  );
  const colorPreference =
    input?.colorPreference === "w" || input?.colorPreference === "b" || input?.colorPreference === "random"
      ? input.colorPreference
      : DEFAULT_MAIA_SETUP_PREFERENCES.colorPreference;
  const thinkingPace =
    input?.thinkingPace === "instant" || input?.thinkingPace === "human"
      ? input.thinkingPace
      : DEFAULT_MAIA_SETUP_PREFERENCES.thinkingPace;
  return {
    timeControl,
    rated,
    opponentRating,
    colorPreference,
    thinkingPace
  };
}

export function createDefaultMaiaRatingRecord(
  timeClass: MaiaTimeClass,
  initialRating = MAIA_DEFAULT_RATING,
  nowIso = new Date().toISOString()
): MaiaRatingRecord {
  return {
    timeClass,
    rating: Math.max(RATING_FLOOR, Math.round(initialRating)),
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    updatedAt: nowIso
  };
}

export function suggestInitialMaiaRating(input: {
  timeClass: MaiaTimeClass;
  importedGameRatings?: Partial<Record<MaiaTimeClass, number>>;
  fallbackImportedRating?: number;
  sprintRating?: number;
}): number {
  const candidate =
    input.importedGameRatings?.[input.timeClass] ??
    input.fallbackImportedRating ??
    input.sprintRating ??
    MAIA_DEFAULT_RATING;
  if (!Number.isFinite(candidate)) {
    return MAIA_DEFAULT_RATING;
  }
  const rounded = Math.round(candidate / 50) * 50;
  return Math.max(MAIA_MIN_RATING, Math.min(2200, rounded));
}

export function calculateMaiaGameRatingChange(input: {
  record: MaiaRatingRecord;
  outcome: "win" | "loss" | "draw";
  opponentRating?: number;
}): SprintRatingChange {
  const score: 0 | 0.5 | 1 =
    input.outcome === "win" ? 1 : input.outcome === "draw" ? 0.5 : 0;
  return calculateGlicko2RatingChange({
    rating: {
      rating: input.record.rating,
      ratingDeviation: input.record.ratingDeviation,
      volatility: input.record.volatility,
      games: input.record.games
    },
    score,
    opponentRating: input.opponentRating ?? input.record.rating,
    opponentRatingDeviation: DEFAULT_OPPONENT_RATING_DEVIATION,
    floor: RATING_FLOOR
  });
}

export function applyMaiaGameRatingResult(
  record: MaiaRatingRecord,
  outcome: "win" | "loss" | "draw",
  nowIso: string,
  opponentRating?: number
): { nextRecord: MaiaRatingRecord; change: SprintRatingChange } {
  const change = calculateMaiaGameRatingChange({
    record,
    outcome,
    ...(opponentRating === undefined ? {} : { opponentRating })
  });
  const nextRecord: MaiaRatingRecord = {
    timeClass: record.timeClass,
    rating: change.ratingAfter,
    ratingDeviation: change.ratingDeviationAfter,
    volatility: change.volatilityAfter,
    games: record.games + 1,
    wins: record.wins + (outcome === "win" ? 1 : 0),
    losses: record.losses + (outcome === "loss" ? 1 : 0),
    draws: record.draws + (outcome === "draw" ? 1 : 0),
    updatedAt: nowIso
  };
  return { nextRecord, change };
}

/**
 * Deterministic, commutative merge for two initial Maia rating anchors of the same time class.
 * Earliest `setAt` wins (ties broken by lower `initialRating`), guaranteeing convergence across
 * devices regardless of sync order.
 */
export function preferredMaiaRatingAnchor(
  local: MaiaRatingAnchorRecord,
  incoming: MaiaRatingAnchorRecord
): MaiaRatingAnchorRecord {
  const timeCmp = local.setAt.localeCompare(incoming.setAt);
  if (timeCmp !== 0) {
    return timeCmp < 0 ? { ...local } : { ...incoming };
  }
  return local.initialRating <= incoming.initialRating ? { ...local } : { ...incoming };
}

/**
 * Deterministically recompute a time class's Maia Glicko-2 rating record by replaying all
 * deduplicated rated games in canonical `(playedAt, gameId)` order. Two devices that play games
 * offline and sync in any order always converge to the exact same rating, RD, volatility, and
 * W/L/D counts.
 */
export function recomputeMaiaRatingFromGames(input: {
  timeClass: MaiaTimeClass;
  anchor?: MaiaRatingAnchorRecord;
  ratedGames: readonly MaiaRatedGameRecord[];
  fallbackInitialRating?: number;
  fallbackUpdatedAt?: string;
}): MaiaRatingRecord {
  const deduped = new Map<string, MaiaRatedGameRecord>();
  for (const game of input.ratedGames) {
    if (game.timeClass !== input.timeClass) {
      continue;
    }
    const existing = deduped.get(game.gameId);
    if (!existing) {
      deduped.set(game.gameId, game);
    } else if (
      existing.initialRatingAnchor === undefined &&
      game.initialRatingAnchor !== undefined
    ) {
      deduped.set(game.gameId, { ...existing, initialRatingAnchor: game.initialRatingAnchor });
    }
  }

  const ordered = [...deduped.values()].sort(
    (left, right) =>
      left.playedAt.localeCompare(right.playedAt) || left.gameId.localeCompare(right.gameId)
  );

  const initialRating =
    input.anchor?.initialRating ??
    ordered[0]?.initialRatingAnchor ??
    input.fallbackInitialRating ??
    MAIA_DEFAULT_RATING;
  const initialUpdatedAt =
    input.anchor?.setAt ??
    ordered[0]?.playedAt ??
    input.fallbackUpdatedAt ??
    "1970-01-01T00:00:00.000Z";

  let current = createDefaultMaiaRatingRecord(input.timeClass, initialRating, initialUpdatedAt);
  for (const game of ordered) {
    current = applyMaiaGameRatingResult(
      current,
      game.outcome,
      game.playedAt,
      game.opponentRating
    ).nextRecord;
  }
  return current;
}

/**
 * Reconstruct a Chess instance from initialFen + all played moves so
 * threefold repetition and 50-move draw counters are always 100% exact.
 */
export function replayMaiaGameChess(
  state: Pick<MaiaGameState, "initialFen" | "moves">
): Chess {
  const chess = new Chess(state.initialFen);
  for (const move of state.moves) {
    const uci = move.uci.trim().toLowerCase();
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    const applied = chess.move({
      from,
      to,
      ...(promotion ? { promotion } : {})
    });
    if (!applied) {
      throw new Error(`Failed to replay Maia game move ${move.uci} at ply ${move.ply}`);
    }
  }
  return chess;
}

/**
 * Determine whether `fen` has insufficient mating material on the board for
 * either side (FIDE dead position draw). Covers K vs K, K+N vs K, K+B vs K,
 * K+same-color-bishops vs K, and K+same-color-bishops vs K+same-color-bishops.
 */
export function isBoardInsufficientMaterial(chess: Chess): boolean {
  if (chess.isInsufficientMaterial()) {
    return true;
  }
  // Also catch multiple same-color bishops (e.g. from underpromotion) when no other pieces exist.
  const board = chess.board();
  let bishopSquareColor: number | null = null;
  let hasKnight = false;
  let knightCount = 0;

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank]?.[file];
      if (!piece || piece.type === "k") {
        continue;
      }
      if (piece.type === "p" || piece.type === "r" || piece.type === "q") {
        return false;
      }
      if (piece.type === "n") {
        hasKnight = true;
        knightCount += 1;
        if (knightCount > 1) {
          return false;
        }
      } else if (piece.type === "b") {
        const sqColor = (rank + file) % 2;
        if (bishopSquareColor === null) {
          bishopSquareColor = sqColor;
        } else if (bishopSquareColor !== sqColor) {
          return false;
        }
      }
    }
  }

  if (hasKnight && bishopSquareColor !== null) {
    return false;
  }
  return true;
}

/**
 * Determine whether `survivingColor` (the side that did NOT flag) lacks
 * sufficient mating material to win on time when the opponent's clock expires.
 *
 * Rules (aligned with online chess / Chess.com + true endgame rules):
 * - Bare King -> always insufficient (draw)
 * - Any Pawn, Rook, or Queen -> always sufficient (win on time)
 * - Only single Knight (K+N) -> insufficient (draw)
 * - Only Bishop(s) all on the same square color -> insufficient (draw)
 * - Two Knights (K+N+N) against a bare King -> insufficient (cannot force mate; draw)
 * - Two Knights against opponent with pawns/pieces, or B+N, or opposite-color B+B -> sufficient (win)
 */
export function hasInsufficientMaterialToWinOnTime(
  fenOrChess: string | Chess,
  survivingColor: GameColor
): boolean {
  const chess = typeof fenOrChess === "string" ? new Chess(fenOrChess) : fenOrChess;
  const board = chess.board();
  const flaggedColor = maiaOppositeColor(survivingColor);

  let survivingKnights = 0;
  let survivingLightBishops = 0;
  let survivingDarkBishops = 0;
  let flaggedNonKingPieces = 0;

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank]?.[file];
      if (!piece || piece.type === "k") {
        continue;
      }
      if (piece.color === survivingColor) {
        if (piece.type === "p" || piece.type === "r" || piece.type === "q") {
          return false;
        }
        if (piece.type === "n") {
          survivingKnights += 1;
        } else if (piece.type === "b") {
          if ((rank + file) % 2 === 0) {
            survivingLightBishops += 1;
          } else {
            survivingDarkBishops += 1;
          }
        }
      } else if (piece.color === flaggedColor) {
        flaggedNonKingPieces += 1;
      }
    }
  }

  const totalSurvivingBishops = survivingLightBishops + survivingDarkBishops;
  const hasOppositeColorBishops = survivingLightBishops > 0 && survivingDarkBishops > 0;

  // Bare king
  if (survivingKnights === 0 && totalSurvivingBishops === 0) {
    return true;
  }
  // Opposite-color bishops or B+N can force checkmate
  if (hasOppositeColorBishops || (totalSurvivingBishops > 0 && survivingKnights > 0)) {
    return false;
  }
  // Only same-color bishop(s)
  if (totalSurvivingBishops > 0 && survivingKnights === 0) {
    return true;
  }
  // Single knight
  if (survivingKnights === 1) {
    return true;
  }
  // Two knights vs bare king cannot force mate
  if (survivingKnights === 2 && flaggedNonKingPieces === 0) {
    return true;
  }
  return false;
}

export function isMaiaPromotionMove(fen: string, from: string, to: string): boolean {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  return legal.some(
    (move) => move.from === from && move.to === to && typeof move.promotion === "string"
  );
}

export function createMaiaGameState(input: {
  id: string;
  preferences: MaiaSetupPreferences;
  userRating: number;
  /** When true, Maia's rating matches the user's current rating (clamped to Maia bounds) instead of preferences.opponentRating. */
  matchUserRating?: boolean;
  nowMs?: number;
  nowIso?: string;
  rng?: () => number;
}): MaiaGameState {
  const prefs = normalizeMaiaSetupPreferences(input.preferences);
  const timeClass = classifyMaiaTimeControl(prefs.timeControl);
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = input.nowIso ?? new Date(nowMs).toISOString();
  const rng = input.rng ?? Math.random;

  const userColor: GameColor =
    prefs.colorPreference === "random"
      ? rng() < 0.5
        ? "w"
        : "b"
      : prefs.colorPreference;

  const userRatingBefore = Math.max(RATING_FLOOR, Math.round(input.userRating));
  const maiaRating = input.matchUserRating
    ? resolveMaiaOpponentRating(userRatingBefore)
    : clampMaiaOpponentRating(prefs.opponentRating);

  const clocksMs: MaiaGameClocksMs | null = prefs.timeControl.unlimited
    ? null
    : {
        w: prefs.timeControl.initialMinutes * 60_000,
        b: prefs.timeControl.initialMinutes * 60_000
      };

  return {
    id: input.id,
    startedAt: nowIso,
    timeControl: prefs.timeControl,
    timeClass,
    rated: prefs.rated,
    userColor,
    userRatingBefore,
    maiaRating,
    thinkingPace: prefs.thinkingPace,
    initialFen: STANDARD_STARTING_FEN,
    currentFen: STANDARD_STARTING_FEN,
    moves: [],
    clocksMs,
    // Chess clocks begin ticking once the first move has been played (or immediately for timed games);
    // starting the clock on ply 0 avoids flagging before the user even sees the board on move 1.
    turnStartedAtMs: null,
    status: "playing",
    winner: "none"
  };
}

export function getMaiaGameTurn(state: Pick<MaiaGameState, "currentFen">): GameColor {
  const parts = state.currentFen.split(/\s+/);
  return parts[1] === "b" ? "b" : "w";
}

export function isMaiaUserTurn(state: Pick<MaiaGameState, "status" | "currentFen" | "userColor">): boolean {
  return state.status === "playing" && getMaiaGameTurn(state) === state.userColor;
}

/**
 * Compute live remaining clocks at `nowMs` without mutating state.
 */
export function computeLiveMaiaClocksMs(
  state: Pick<MaiaGameState, "status" | "clocksMs" | "turnStartedAtMs" | "currentFen">,
  nowMs: number
): MaiaGameClocksMs | null {
  if (!state.clocksMs) {
    return null;
  }
  if (state.status !== "playing" || state.turnStartedAtMs === null) {
    return { w: state.clocksMs.w, b: state.clocksMs.b };
  }
  const activeTurn = getMaiaGameTurn(state);
  const elapsed = Math.max(0, nowMs - state.turnStartedAtMs);
  return {
    w: activeTurn === "w" ? Math.max(0, state.clocksMs.w - elapsed) : state.clocksMs.w,
    b: activeTurn === "b" ? Math.max(0, state.clocksMs.b - elapsed) : state.clocksMs.b
  };
}

export function pauseMaiaGameClock(state: MaiaGameState, nowMs: number): MaiaGameState {
  if (state.status !== "playing" || !state.clocksMs || state.turnStartedAtMs === null) {
    return state;
  }
  const live = computeLiveMaiaClocksMs(state, nowMs);
  return {
    ...state,
    clocksMs: live,
    turnStartedAtMs: null
  };
}

export function resumeMaiaGameClock(state: MaiaGameState, nowMs: number): MaiaGameState {
  if (state.status !== "playing" || !state.clocksMs || state.moves.length === 0) {
    return state;
  }
  if (state.turnStartedAtMs !== null) {
    return state;
  }
  return {
    ...state,
    turnStartedAtMs: nowMs
  };
}

export function setMaiaGameThinkingPace(
  state: MaiaGameState,
  thinkingPace: MaiaThinkingPace
): MaiaGameState {
  if (state.thinkingPace === thinkingPace) {
    return state;
  }
  return {
    ...state,
    thinkingPace
  };
}

export function resolveMaiaTimeout(
  state: MaiaGameState,
  flaggedColor: GameColor,
  nowMs: number,
  nowIso = new Date(nowMs).toISOString()
): MaiaGameState {
  if (state.status !== "playing" || !state.clocksMs) {
    return state;
  }
  const survivingColor = maiaOppositeColor(flaggedColor);
  const live = computeLiveMaiaClocksMs(state, nowMs) ?? state.clocksMs;
  const clampedClocks: MaiaGameClocksMs = {
    w: flaggedColor === "w" ? 0 : live.w,
    b: flaggedColor === "b" ? 0 : live.b
  };
  const insufficient = hasInsufficientMaterialToWinOnTime(state.currentFen, survivingColor);

  return {
    ...state,
    clocksMs: clampedClocks,
    turnStartedAtMs: null,
    status: "finished",
    winner: insufficient ? "none" : survivingColor,
    endReason: insufficient ? "timeout_vs_insufficient_material" : "timeout",
    endedAt: nowIso
  };
}

export function applyMaiaGameMove(
  state: MaiaGameState,
  uciInput: string,
  options: {
    nowMs?: number;
    nowIso?: string;
    /** Override elapsed think time (e.g. 0 when Maia plays in Instant pace). */
    deductClockMs?: number;
    recordedThinkTimeMs?: number;
  } = {}
): { state: MaiaGameState; move: MaiaGameMoveRecord } {
  if (state.status !== "playing") {
    throw new Error(`Cannot apply move to non-playing Maia game (${state.status})`);
  }
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = options.nowIso ?? new Date(nowMs).toISOString();
  const chess = replayMaiaGameChess(state);
  const moverColor = chess.turn() as GameColor;

  // Check if mover already flagged before committing the move.
  if (state.clocksMs && state.turnStartedAtMs !== null) {
    const deduct = options.deductClockMs ?? Math.max(0, nowMs - state.turnStartedAtMs);
    if (state.clocksMs[moverColor] - deduct <= 0) {
      const timedOut = resolveMaiaTimeout(state, moverColor, nowMs, nowIso);
      return {
        state: timedOut,
        move: state.moves[state.moves.length - 1] ?? {
          ply: 0,
          color: moverColor,
          uci: "",
          san: "",
          fenAfter: state.currentFen,
          clockRemainingMs: 0,
          thinkTimeMs: deduct,
          playedAtIso: nowIso
        }
      };
    }
  }

  const uci = uciInput.trim().toLowerCase();
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
  const applied = chess.move({
    from,
    to,
    ...(promotion ? { promotion } : {})
  });
  if (!applied) {
    throw new Error(`Illegal move ${uciInput} in position ${state.currentFen}`);
  }

  let nextClocks: MaiaGameClocksMs | null = null;
  let elapsedMs = options.recordedThinkTimeMs ?? 0;
  let moverClockAfter: number | null = null;

  if (state.clocksMs) {
    const rawElapsed =
      options.deductClockMs !== undefined
        ? Math.max(0, options.deductClockMs)
        : state.turnStartedAtMs !== null
          ? Math.max(0, nowMs - state.turnStartedAtMs)
          : 0;
    elapsedMs = options.recordedThinkTimeMs ?? rawElapsed;
    const incrementMs = state.timeControl.incrementSeconds * 1000;
    const remainingBeforeInc = Math.max(0, state.clocksMs[moverColor] - rawElapsed);
    // Increment applies after the move is completed (only once the clock has actually started,
    // or on every move from ply 1 onward — standard Fischer increment applies on every move).
    moverClockAfter = remainingBeforeInc + incrementMs;
    nextClocks = {
      w: moverColor === "w" ? moverClockAfter : state.clocksMs.w,
      b: moverColor === "b" ? moverClockAfter : state.clocksMs.b
    };
  }

  const nextFen = chess.fen();
  const normalizedUci = `${applied.from}${applied.to}${applied.promotion ?? ""}`.toLowerCase();
  const moveRecord: MaiaGameMoveRecord = {
    ply: state.moves.length + 1,
    color: moverColor,
    uci: normalizedUci,
    san: applied.san,
    fenAfter: nextFen,
    clockRemainingMs: moverClockAfter,
    thinkTimeMs: Math.round(elapsedMs),
    playedAtIso: nowIso
  };

  let status: MaiaGameState["status"] = "playing";
  let winner: GameWinner = "none";
  let endReason: MaiaGameEndReason | undefined;

  if (chess.isCheckmate()) {
    status = "finished";
    winner = moverColor;
    endReason = "checkmate";
  } else if (chess.isStalemate()) {
    status = "finished";
    winner = "none";
    endReason = "stalemate";
  } else if (isBoardInsufficientMaterial(chess)) {
    status = "finished";
    winner = "none";
    endReason = "insufficient_material";
  } else if (chess.isThreefoldRepetition()) {
    status = "finished";
    winner = "none";
    endReason = "threefold_repetition";
  } else if (chess.isDrawByFiftyMoves()) {
    status = "finished";
    winner = "none";
    endReason = "fifty_move_rule";
  }

  const nextState: MaiaGameState = {
    ...state,
    currentFen: nextFen,
    moves: [...state.moves, moveRecord],
    clocksMs: nextClocks,
    // Start ticking the clock after White's first move (ply >= 1) while game continues.
    turnStartedAtMs: status === "playing" && nextClocks !== null ? nowMs : null,
    status,
    winner,
    ...(endReason ? { endReason } : {}),
    ...(status === "finished" ? { endedAt: nowIso } : {})
  };

  return { state: nextState, move: moveRecord };
}

export function canAbortMaiaGame(state: Pick<MaiaGameState, "status" | "moves">): boolean {
  return state.status === "playing" && state.moves.length < 2;
}

export function abortMaiaGame(
  state: MaiaGameState,
  nowIso = new Date().toISOString()
): MaiaGameState {
  if (state.status !== "playing") {
    return state;
  }
  return {
    ...state,
    turnStartedAtMs: null,
    status: "aborted",
    winner: "none",
    endReason: "aborted",
    endedAt: nowIso
  };
}

export function resignMaiaGame(
  state: MaiaGameState,
  nowIso = new Date().toISOString()
): MaiaGameState {
  if (state.status !== "playing") {
    return state;
  }
  return {
    ...state,
    turnStartedAtMs: null,
    status: "finished",
    winner: maiaOppositeColor(state.userColor),
    endReason: "resign",
    endedAt: nowIso
  };
}

function materialBalanceForColor(fen: string, color: GameColor): number {
  const chess = new Chess(fen);
  let own = 0;
  let opp = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) {
        continue;
      }
      const val = PIECE_MATERIAL_VALUE[piece.type] ?? 0;
      if (piece.color === color) {
        own += val;
      } else {
        opp += val;
      }
    }
  }
  return own - opp;
}

function countPositionRepetitions(state: Pick<MaiaGameState, "initialFen" | "moves" | "currentFen">): number {
  const targetKey = state.currentFen.split(/\s+/).slice(0, 4).join(" ");
  let count = state.initialFen.split(/\s+/).slice(0, 4).join(" ") === targetKey ? 1 : 0;
  for (const move of state.moves) {
    if (move.fenAfter.split(/\s+/).slice(0, 4).join(" ") === targetKey) {
      count += 1;
    }
  }
  return count;
}

/**
 * Evaluate a user's draw offer against Maia.
 * - Never accepts before ply 20 unless position already repeated twice (prevents Rated draw-farming).
 * - Accepts if Maia is down material (>= 2 pawns) after move 10, or position repeated twice,
 *   or halfmove clock >= 60, or equal material in a late endgame (ply >= 60).
 * - Declines when Maia is ahead in material (>= 2 pawns).
 */
export function evaluateMaiaDrawOffer(state: MaiaGameState): boolean {
  if (state.status !== "playing" || state.moves.length < 2) {
    return false;
  }
  const maiaColor = maiaOppositeColor(state.userColor);
  const maiaMaterialDiff = materialBalanceForColor(state.currentFen, maiaColor);

  // Never accept when clearly winning
  if (maiaMaterialDiff >= 2) {
    return false;
  }

  // Repeated twice already (one step from threefold)
  if (countPositionRepetitions(state) >= 2 && maiaMaterialDiff <= 1) {
    return true;
  }

  // Long quiet stretch (halfmove clock >= 60 = 30 moves without capture/pawn)
  const halfmoveClock = Number(state.currentFen.split(/\s+/)[4] ?? "0");
  if (Number.isFinite(halfmoveClock) && halfmoveClock >= 60 && maiaMaterialDiff <= 1) {
    return true;
  }

  // Early game guard
  if (state.moves.length < 20) {
    return false;
  }

  // Maia is losing materially -> happily accepts draw
  if (maiaMaterialDiff <= -2) {
    return true;
  }

  // Deep equal game (30+ full moves) -> accepts draw
  if (state.moves.length >= 60 && maiaMaterialDiff <= 0) {
    return true;
  }

  return false;
}

export function offerDrawToMaia(
  state: MaiaGameState,
  nowIso = new Date().toISOString()
): { state: MaiaGameState; accepted: boolean } {
  if (state.status !== "playing" || state.moves.length < 2) {
    return { state, accepted: false };
  }
  const accepted = evaluateMaiaDrawOffer(state);
  if (accepted) {
    return {
      accepted: true,
      state: {
        ...state,
        turnStartedAtMs: null,
        status: "finished",
        winner: "none",
        endReason: "draw_agreement",
        endedAt: nowIso
      }
    };
  }
  return {
    accepted: false,
    state: {
      ...state,
      drawDeclinedAtPly: state.moves.length
    }
  };
}

export function maiaGameOutcomeForUser(
  state: Pick<MaiaGameState, "winner" | "userColor">
): "win" | "loss" | "draw" {
  if (state.winner === "none") {
    return "draw";
  }
  return state.winner === state.userColor ? "win" : "loss";
}

function formatPgnClk(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function pgnResultToken(winner: GameWinner): string {
  if (winner === "w") {
    return "1-0";
  }
  if (winner === "b") {
    return "0-1";
  }
  return "1/2-1/2";
}

function pgnTerminationLabel(endReason: MaiaGameEndReason | undefined): string {
  switch (endReason) {
    case "checkmate":
      return "Normal";
    case "resign":
      return "Normal";
    case "timeout":
      return "Time forfeit";
    case "timeout_vs_insufficient_material":
      return "Timeout vs insufficient material";
    case "stalemate":
      return "Stalemate";
    case "insufficient_material":
      return "Insufficient material";
    case "threefold_repetition":
      return "Threefold repetition";
    case "fifty_move_rule":
      return "Fifty-move rule";
    case "draw_agreement":
      return "Draw by agreement";
    case "aborted":
      return "Abandoned";
    default:
      return "Normal";
  }
}

function importedGameTerminationFor(endReason: MaiaGameEndReason | undefined): GameTermination {
  switch (endReason) {
    case "checkmate":
      return "mate";
    case "resign":
      return "resign";
    case "timeout":
      return "timeout";
    case "stalemate":
    case "insufficient_material":
    case "timeout_vs_insufficient_material":
    case "threefold_repetition":
    case "fifty_move_rule":
    case "draw_agreement":
      return "draw";
    case "aborted":
      return "abandoned";
    default:
      return "unknown";
  }
}

export function buildMaiaGamePgn(
  state: MaiaGameState,
  userLabel = "You"
): string {
  const playedDate = (state.endedAt ?? state.startedAt).slice(0, 10).replace(/-/g, ".");
  const maiaName = `Maia ${state.maiaRating}`;
  const whiteName = state.userColor === "w" ? userLabel : maiaName;
  const blackName = state.userColor === "b" ? userLabel : maiaName;
  const whiteElo = state.userColor === "w" ? state.userRatingBefore : state.maiaRating;
  const blackElo = state.userColor === "b" ? state.userRatingBefore : state.maiaRating;
  const result = pgnResultToken(state.winner);
  const eventLabel = state.rated
    ? `Rated ${state.timeClass[0]!.toUpperCase()}${state.timeClass.slice(1)} vs Maia`
    : `Casual ${state.timeClass[0]!.toUpperCase()}${state.timeClass.slice(1)} vs Maia`;

  const headers = [
    `[Event "${eventLabel}"]`,
    `[Site "Chessticize"]`,
    `[Date "${playedDate}"]`,
    `[White "${whiteName}"]`,
    `[Black "${blackName}"]`,
    `[Result "${result}"]`,
    `[WhiteElo "${whiteElo}"]`,
    `[BlackElo "${blackElo}"]`,
    `[TimeControl "${formatMaiaTimeControlPgnTag(state.timeControl)}"]`,
    `[Termination "${pgnTerminationLabel(state.endReason)}"]`
  ];

  const tokens: string[] = [];
  for (let i = 0; i < state.moves.length; i += 1) {
    const move = state.moves[i]!;
    const moveNumber = Math.floor(i / 2) + 1;
    if (move.color === "w") {
      tokens.push(`${moveNumber}. ${move.san}`);
    } else if (i === 0) {
      tokens.push(`${moveNumber}... ${move.san}`);
    } else {
      tokens.push(move.san);
    }
    if (move.clockRemainingMs !== null) {
      tokens.push(`{[%clk ${formatPgnClk(move.clockRemainingMs)}]}`);
    }
  }
  tokens.push(result);

  return `${headers.join("\n")}\n\n${tokens.join(" ")}\n`;
}

export function buildImportedGameDraftFromMaiaGame(
  state: MaiaGameState,
  userLabel = "You"
): ImportedGameDraft {
  const maiaName = `Maia ${state.maiaRating}`;
  const playedAt = state.endedAt ?? state.startedAt;
  return {
    id: state.savedGameId ?? `maia_${state.id}`,
    platform: "maia",
    username: userLabel,
    userColor: state.userColor,
    playedAt,
    timeControl: formatMaiaTimeControlPgnTag(state.timeControl),
    timeClass: state.timeClass,
    rated: state.rated,
    white:
      state.userColor === "w"
        ? { username: userLabel, rating: state.userRatingBefore, isAi: false }
        : { username: maiaName, rating: state.maiaRating, isAi: true },
    black:
      state.userColor === "b"
        ? { username: userLabel, rating: state.userRatingBefore, isAi: false }
        : { username: maiaName, rating: state.maiaRating, isAi: true },
    winner: state.winner,
    termination: importedGameTerminationFor(state.endReason),
    pgn: buildMaiaGamePgn(state, userLabel)
  };
}
