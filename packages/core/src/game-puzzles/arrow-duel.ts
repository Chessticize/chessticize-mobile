/*
 * Adapted from Chessticize/chessticize-worker, lychee-org/retagger, and lichess-org/puzzler.
 * Original work Copyright 2020 lichess.org
 * Forked work Copyright 2023 lychee-org
 * Modified work Copyright 2024-2026 chessticize.com
 * Licensed under the MIT License.
 */

import { Chess } from "chess.js";
import type { EngineAnalysisLine } from "../engine-analysis.ts";
import {
  normalizeUci,
  parseUciMove,
  relativeScoreToCp,
  scoreForPov,
  tryPlayUci,
  winChances
} from "./score.ts";
import type {
  ExtractedArrowDuelMeta,
  PuzzleExtractionEngine,
  SearchLimitConfig
} from "./types.ts";

export const ARROW_DUEL_MIN_BEST_CP = -75;
export const ARROW_DUEL_MIN_CP_SWING = 200;
export const ARROW_DUEL_MIN_WIN_CHANCE_SWING = 0.35;
export const ARROW_DUEL_MATE_SCORE = 10000;
export const ARROW_DUEL_MAX_RAW_PV_PLIES = 6;
export const ARROW_DUEL_MAX_TACTICAL_PUNISHMENT_PLIES = 5;

export const DEFAULT_ARROW_DUEL_LIMIT: SearchLimitConfig = {
  depth: 18,
  nodes: 500_000
};

export interface VerifyArrowDuelPairParams {
  engine: PuzzleExtractionEngine;
  decisionFen: string;
  blunderMove: string;
  expectedUserColor?: "w" | "b";
  limit?: SearchLimitConfig;
  maxPunishmentPlies?: number;
  signal?: AbortSignal;
}

/**
 * Verifies an Arrow Duel `(bestMove, blunderMove)` pair on the exact decision FEN
 * where it is the user's turn, enforcing worker/server caliber thresholds and
 * capturing the opponent's refutation PV (`punishmentLine`) after `blunderMove`.
 */
export async function verifyArrowDuelPair(
  params: VerifyArrowDuelPairParams
): Promise<ExtractedArrowDuelMeta | null> {
  const { engine, decisionFen, expectedUserColor, signal } = params;
  const limit = params.limit ?? DEFAULT_ARROW_DUEL_LIMIT;

  let board: Chess;
  try {
    board = new Chess(decisionFen);
  } catch {
    return null;
  }

  if (board.isGameOver()) {
    return null;
  }

  const mover = board.turn();
  if (expectedUserColor !== undefined && mover !== expectedUserColor) {
    return null;
  }

  const normalizedBlunder = normalizeUci(params.blunderMove);
  const parsedBlunder = parseUciMove(normalizedBlunder);
  if (!parsedBlunder) {
    return null;
  }
  const blunderOriginPiece = board.get(parsedBlunder.from);
  if (!blunderOriginPiece || blunderOriginPiece.color !== mover) {
    return null;
  }

  const blunderCheckBoard = new Chess(decisionFen);
  const playedBlunder = tryPlayUci(blunderCheckBoard, normalizedBlunder);
  if (!playedBlunder) {
    return null;
  }

  const bestLines = await engine.analyze({
    fen: decisionFen,
    ...limit,
    multiPv: 1,
    priority: "batch",
    ...(signal !== undefined ? { signal } : {})
  });
  const bestLine = pickTopLine(bestLines);
  if (!bestLine) {
    return null;
  }

  const normalizedBest = normalizeUci(bestLine.move);
  const parsedBest = parseUciMove(normalizedBest);
  if (!parsedBest) {
    return null;
  }
  const bestOriginPiece = board.get(parsedBest.from);
  if (!bestOriginPiece || bestOriginPiece.color !== mover) {
    return null;
  }
  const bestCheckBoard = new Chess(decisionFen);
  if (!tryPlayUci(bestCheckBoard, normalizedBest)) {
    return null;
  }

  if (normalizedBest === normalizedBlunder) {
    return null;
  }

  const blunderLines = await engine.analyze({
    fen: decisionFen,
    ...limit,
    multiPv: 1,
    searchMoves: [normalizedBlunder],
    priority: "batch",
    ...(signal !== undefined ? { signal } : {})
  });
  const blunderLine = pickLineForMove(blunderLines, normalizedBlunder);
  if (!blunderLine) {
    return null;
  }

  const bestMoverScore = scoreForPov(bestLine.score, mover);
  const blunderMoverScore = scoreForPov(blunderLine.score, mover);
  const bestCpMover = relativeScoreToCp(bestMoverScore, ARROW_DUEL_MATE_SCORE);
  const blunderCpMover = relativeScoreToCp(blunderMoverScore, ARROW_DUEL_MATE_SCORE);

  if (bestCpMover < ARROW_DUEL_MIN_BEST_CP) {
    return null;
  }
  if (bestCpMover - blunderCpMover < ARROW_DUEL_MIN_CP_SWING) {
    return null;
  }
  if (winChances(bestMoverScore) - winChances(blunderMoverScore) < ARROW_DUEL_MIN_WIN_CHANCE_SWING) {
    return null;
  }

  const bestEvalWhite = relativeScoreToCp(scoreForPov(bestLine.score, "w"), ARROW_DUEL_MATE_SCORE);
  const blunderEvalWhite = relativeScoreToCp(scoreForPov(blunderLine.score, "w"), ARROW_DUEL_MATE_SCORE);
  const maxPunishmentPlies = Math.max(
    1,
    Math.floor(params.maxPunishmentPlies ?? ARROW_DUEL_MAX_RAW_PV_PLIES)
  );
  let punishmentLine = extractLegalPunishmentLine(
    blunderCheckBoard.fen(),
    normalizedBlunder,
    blunderLine.pv,
    maxPunishmentPlies
  );
  if (punishmentLine.length === 0 && !blunderCheckBoard.isGameOver()) {
    const replyLines = await engine.analyze({
      fen: blunderCheckBoard.fen(),
      ...limit,
      multiPv: 1,
      priority: "batch",
      ...(signal !== undefined ? { signal } : {})
    });
    const replyLine = pickTopLine(replyLines);
    if (replyLine) {
      punishmentLine = extractLegalPunishmentLine(
        blunderCheckBoard.fen(),
        "",
        replyLine.pv.length > 0 ? replyLine.pv : [replyLine.move],
        maxPunishmentPlies
      );
    }
  }

  return {
    bestMove: normalizedBest,
    blunderMove: normalizedBlunder,
    bestEvalWhite,
    blunderEvalWhite,
    punishmentLine,
    decisionFen
  };
}

function pickTopLine(lines: readonly EngineAnalysisLine[]): EngineAnalysisLine | undefined {
  if (lines.length === 0) {
    return undefined;
  }
  return [...lines].sort((a, b) => a.multipv - b.multipv)[0];
}

function pickLineForMove(
  lines: readonly EngineAnalysisLine[],
  expectedMove: string
): EngineAnalysisLine | undefined {
  const normalizedExpected = normalizeUci(expectedMove);
  const exact = lines.find((line) => normalizeUci(line.move) === normalizedExpected);
  return exact ?? pickTopLine(lines);
}

function extractLegalPunishmentLine(
  fenAfterBlunder: string,
  blunderMove: string,
  pv: readonly string[],
  maxPlies: number
): string[] {
  if (pv.length === 0 || maxPlies <= 0) {
    return [];
  }
  const normalizedPv = pv.map(normalizeUci).filter((move) => move.length >= 4);
  const candidateTail =
    normalizedPv[0] === normalizeUci(blunderMove) ? normalizedPv.slice(1) : normalizedPv;

  const board = new Chess(fenAfterBlunder);
  const legalLine: string[] = [];
  for (const move of candidateTail) {
    if (legalLine.length >= maxPlies) {
      break;
    }
    const played = tryPlayUci(board, move);
    if (!played) {
      break;
    }
    legalLine.push(move);
  }
  return legalLine;
}

const PIECE_MATERIAL_VALUES: Readonly<Record<string, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

function materialBalanceFor(board: Chess, side: "w" | "b"): number {
  let balance = 0;
  for (const rank of board.board()) {
    for (const square of rank) {
      if (!square) {
        continue;
      }
      const value = PIECE_MATERIAL_VALUES[square.type] ?? 0;
      balance += square.color === side ? value : -value;
    }
  }
  return balance;
}

/**
 * Trim a raw Stockfish refutation PV after `blunderMove` to the tactical payoff:
 * - Always keeps at least ply 1 (the opponent's immediate punishing reply).
 * - Extends in opponent-ending pairs (`3`, `5`, ...) whenever the opponent delivers mate/promotion,
 *   increases net material advantage (e.g. `Nxc6 bxc6 Bxd6` winning a bishop), or continues a
 *   forcing capture/check after a user recapture or check escape.
 * - Stops early before quiet positional continuations (e.g. `Qxf3 gxf3 Rad8 Kf2` -> `["g2f3"]`).
 */
export function trimPunishmentLineToTacticalPayoff(
  fenAfterBlunder: string,
  fullLine: readonly string[],
  maxPlies = ARROW_DUEL_MAX_TACTICAL_PUNISHMENT_PLIES
): string[] {
  const effectiveMax = Math.max(1, Math.floor(maxPlies));
  const oddCap = effectiveMax % 2 === 1 ? effectiveMax : Math.max(1, effectiveMax - 1);
  if (fullLine.length === 0) {
    return [];
  }

  let board: Chess;
  try {
    board = new Chess(fenAfterBlunder);
  } catch {
    return [];
  }

  const punishingSide = board.turn();
  const played: Array<{
    uci: string;
    isCapture: boolean;
    isCheck: boolean;
    isCheckmate: boolean;
    isPromotion: boolean;
    wasInCheckBefore: boolean;
    materialBalance: number;
  }> = [];

  for (const rawMove of fullLine) {
    // Allow one lookahead ply beyond `oddCap` so we can detect immediate recaptures.
    if (played.length >= oddCap + 1) {
      break;
    }
    const uci = normalizeUci(rawMove);
    const parsed = parseUciMove(uci);
    if (!parsed) {
      break;
    }
    const wasInCheckBefore = board.inCheck();
    let moveResult: ReturnType<Chess["move"]> | null = null;
    try {
      moveResult = board.move({
        from: parsed.from,
        to: parsed.to,
        ...(parsed.promotion ? { promotion: parsed.promotion } : {})
      });
    } catch {
      moveResult = null;
    }
    if (!moveResult) {
      break;
    }
    played.push({
      uci,
      isCapture: Boolean(moveResult.captured),
      isCheck: board.inCheck(),
      isCheckmate: board.isCheckmate(),
      isPromotion: Boolean(moveResult.promotion),
      wasInCheckBefore,
      materialBalance: materialBalanceFor(board, punishingSide)
    });
  }

  if (played.length === 0) {
    return [];
  }

  let endIndex = 1;
  let bestMaterialAtCutoff = played[0]!.materialBalance;
  const maxOppIndex = Math.min(played.length, oddCap);

  for (let i = 2; i < maxOppIndex; i += 2) {
    const userMove = played[i - 1]!;
    const oppMove = played[i]!;
    const immediateRecapture = played[i + 1];
    const stableMaterial =
      immediateRecapture && immediateRecapture.isCapture
        ? Math.min(oppMove.materialBalance, immediateRecapture.materialBalance)
        : oppMove.materialBalance;
    const gainedMaterial = stableMaterial > bestMaterialAtCutoff;
    const continuesForcingSequence =
      (oppMove.isCapture || oppMove.isCheck) &&
      (userMove.isCapture || userMove.wasInCheckBefore || userMove.isCheck);

    if (oppMove.isCheckmate || oppMove.isPromotion || gainedMaterial || continuesForcingSequence) {
      endIndex = i + 1;
      bestMaterialAtCutoff = Math.max(bestMaterialAtCutoff, stableMaterial);
      if (oppMove.isCheckmate) {
        break;
      }
    } else {
      break;
    }
  }

  return played.slice(0, endIndex).map((step) => step.uci);
}
