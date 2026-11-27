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
  const punishmentLine = extractLegalPunishmentLine(
    blunderCheckBoard.fen(),
    normalizedBlunder,
    blunderLine.pv
  );

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
  pv: readonly string[]
): string[] {
  if (pv.length === 0) {
    return [];
  }
  const normalizedPv = pv.map(normalizeUci).filter((move) => move.length >= 4);
  const candidateTail =
    normalizedPv[0] === normalizeUci(blunderMove) ? normalizedPv.slice(1) : normalizedPv;

  const board = new Chess(fenAfterBlunder);
  const legalLine: string[] = [];
  for (const move of candidateTail) {
    const played = tryPlayUci(board, move);
    if (!played) {
      break;
    }
    legalLine.push(move);
  }
  return legalLine;
}
