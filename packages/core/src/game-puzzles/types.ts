/*
 * Adapted from Chessticize/chessticize-worker, lychee-org/retagger, and lichess-org/puzzler.
 * Original work Copyright 2020 lichess.org
 * Forked work Copyright 2023 lychee-org
 * Modified work Copyright 2024-2026 chessticize.com
 * Licensed under the MIT License.
 */

import type { AnalysisScore, EngineAnalysisLine } from "../engine-analysis.ts";
import type { UserGamePuzzleRatingSource } from "../types.ts";

export type GamePuzzleMomentKind =
  | "own_mistake_punished"
  | "own_mistake_escaped"
  | "own_blunder_punished"
  | "own_blunder_escaped"
  | "opponent_mistake_missed"
  | "opponent_blunder_missed"
  | "opponent_mistake_caught"
  | "opponent_blunder_caught";

export type OwnMomentKind =
  | "own_mistake_punished"
  | "own_mistake_escaped"
  | "own_blunder_punished"
  | "own_blunder_escaped";

export type OpponentCaughtMomentKind =
  | "opponent_mistake_caught"
  | "opponent_blunder_caught";

export type PuzzleLengthTag = "oneMove" | "short" | "long" | "veryLong";

export type PuzzlePhaseTag = "opening" | "middlegame" | "endgame";

export interface ExtractedArrowDuelMeta {
  bestMove: string;
  blunderMove: string;
  bestEvalWhite: number;
  blunderEvalWhite: number;
  punishmentLine: string[];
  decisionFen: string;
}

export interface ExtractedGamePuzzle {
  idSeed: string;
  ply: number;
  moveNumber: number;
  puzzleKind: "line" | "arrow_duel";
  momentKind: GamePuzzleMomentKind;
  userColor: "w" | "b";
  puzzleColor: "w" | "b";
  initialFen: string;
  solutionMoves: string[];
  prevCp: number;
  cp: number;
  winChanceSwing: number;
  arrowDuel?: ExtractedArrowDuelMeta;
  themes: string[];
  lengthTag: PuzzleLengthTag;
  phaseTag: PuzzlePhaseTag;
  clockRemainingSec?: number;
  timeSpentSec?: number;
  caliberScore: number;
  /** Offline difficulty estimate (Lichess-aligned for `line`; Arrow Duel scale for `arrow_duel`). */
  estimatedRating?: number;
  /** Provenance of `estimatedRating` (`maia2_sf_v1`, `sf_heuristic_v1`, or `game_anchor`). */
  ratingSource?: UserGamePuzzleRatingSource;
}

export interface GameHighlightMoment {
  ply: number;
  moveNumber: number;
  momentKind: OpponentCaughtMomentKind;
  uci: string;
  san: string;
  winChanceGain: number;
}

export interface PuzzleExtractionEngineRequest {
  fen: string;
  depth?: number;
  nodes?: number;
  movetimeMs?: number;
  multiPv?: number;
  searchMoves?: string[];
  newGame?: boolean;
  priority?: "interactive" | "batch";
  signal?: AbortSignal;
}

export interface PuzzleExtractionEngine {
  analyze(req: PuzzleExtractionEngineRequest): Promise<EngineAnalysisLine[]>;
}

export interface SearchLimitConfig {
  depth?: number;
  nodes?: number;
  movetimeMs?: number;
}

export interface GamePlyEvalInput {
  /** 1-indexed half-move (ply) in the game. */
  ply: number;
  /** UCI move played at this ply (e.g. "e2e4", "e7e8q"). */
  uci: string;
  /** Optional SAN for the move; derived from `fenBefore` + `uci` when omitted. */
  san?: string;
  /** FEN immediately before this ply's move. */
  fenBefore: string;
  /** FEN immediately after this ply's move. */
  fenAfter: string;
  /** Pass-1 engine evaluation of `fenAfter`. */
  evalAfter?: AnalysisScore;
  /** Clock remaining (seconds) for the mover after this ply. */
  clockRemainingSec?: number;
  /** Optional PGN comment (supports `[%clk H:MM:SS.s]` parsing fallback). */
  comment?: string;
}

export interface ExtractGamePuzzlesInput {
  /** Optional game identifier embedded in deterministic `idSeed` values. */
  gameId?: string;
  userColor: "w" | "b";
  plies: readonly GamePlyEvalInput[];
  /** Optional PGN TimeControl string (e.g. "300+3" or "600"). */
  timeControl?: string;
  /** Evaluation before ply 1; defaults to +20 cp for White (matching worker/lichess). */
  initialEval?: AnalysisScore;
}

import type { HumanPolicyModel } from "./difficulty.ts";

export interface ExtractGamePuzzlesOptions {
  /** Maximum puzzles returned after ranking & deduplication. Defaults to 3. */
  maxPuzzlesPerGame?: number;
  /** Pass-2 deep verification limit (MultiPV=3 & Arrow Duel verification). */
  deepLimit?: SearchLimitConfig;
  /** Search limit for defender moves in `cookMate`. */
  mateDefenseLimit?: SearchLimitConfig;
  /** Search depth for `checkIfUserFoundLine` deviation checks. Defaults to 12. */
  foundLineDepth?: number;
  /** Optional abort signal for cooperative cancellation. */
  signal?: AbortSignal;
  /** Optional engine-backed zugzwang check (defaults to false). */
  checkZugzwang?: boolean;
  /** Enable offline difficulty estimation on extracted candidates (defaults to false unless enabled). */
  estimateDifficulty?: boolean;
  /** Optional on-device human policy model (e.g. Maia-2 INT8) for higher-accuracy rating estimates. */
  humanPolicy?: HumanPolicyModel;
  /** Optional player rating anchor used to softly down-rank puzzles far above the player's level. */
  userRating?: number;
  /** Maximum Elo above `userRating` before soft down-ranking applies (defaults to 300). */
  maxReviewAboveUserRating?: number;
}

export interface ExtractGamePuzzlesResult {
  puzzles: ExtractedGamePuzzle[];
  highlights: GameHighlightMoment[];
  allCandidatePuzzles: ExtractedGamePuzzle[];
}
