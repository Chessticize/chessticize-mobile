/*
 * Adapted from Chessticize/chessticize-worker, lychee-org/retagger, and lichess-org/puzzler.
 * Original work Copyright 2020 lichess.org
 * Forked work Copyright 2023 lychee-org
 * Modified work Copyright 2024-2026 chessticize.com
 * Licensed under the MIT License.
 */

import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import type { AnalysisScore } from "../engine-analysis.ts";

/**
 * Lichess win-chances sigmoid multiplier (lichess-org/lila#11148).
 */
export const WIN_CHANCES_MULTIPLIER = -0.00368208;

export type RelativeScore =
  | { kind: "cp"; cp: number }
  | { kind: "mate"; mate: number };

export function cpScore(cp: number): RelativeScore {
  return { kind: "cp", cp };
}

export function mateScore(mate: number): RelativeScore {
  return { kind: "mate", mate };
}

export function oppositeColor(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function scoreForPov(score: AnalysisScore, pov: Color): RelativeScore {
  if (score.kind === "cp") {
    return {
      kind: "cp",
      cp: pov === "w" ? score.whiteCentipawns : -score.whiteCentipawns
    };
  }
  return {
    kind: "mate",
    mate: pov === "w" ? score.whiteMate : -score.whiteMate
  };
}

export function negateRelativeScore(score: RelativeScore): RelativeScore {
  if (score.kind === "cp") {
    return { kind: "cp", cp: -score.cp };
  }
  return { kind: "mate", mate: -score.mate };
}

/**
 * Numeric rank preserving python-chess Score ordering:
 * Mate(-0) < Mate(-1) < Mate(-2) < ... < Cp(-inf) < Cp(0) < Cp(+inf) < ... < Mate(+6) < Mate(+5) < Mate(+1) < Mate(+0)
 */
export function relativeScoreRank(score: RelativeScore): number {
  if (score.kind === "cp") {
    return score.cp;
  }
  if (score.mate === 0) {
    return Object.is(score.mate, -0) ? -1_000_000_000 : 1_000_000_000;
  }
  if (score.mate > 0) {
    return 1_000_000_000 - score.mate;
  }
  return -1_000_000_000 + Math.abs(score.mate);
}

export function compareRelativeScores(left: RelativeScore, right: RelativeScore): number {
  return relativeScoreRank(left) - relativeScoreRank(right);
}

/**
 * True when `score` is a forced mate for the POV side in `1..maxMoves` (or mate already given).
 */
export function isForcedMateWithin(score: RelativeScore, maxMoves: number): boolean {
  if (score.kind !== "mate") {
    return false;
  }
  if (score.mate === 0) {
    return !Object.is(score.mate, -0);
  }
  return score.mate > 0 && score.mate <= maxMoves;
}

/**
 * Winning chances in `[-1, 1]` using the Lichess `lila#11148` sigmoid curve.
 */
export function winChances(score: RelativeScore): number {
  if (score.kind === "mate") {
    if (score.mate === 0) {
      return Object.is(score.mate, -0) ? -1 : 1;
    }
    return score.mate > 0 ? 1 : -1;
  }
  return 2 / (1 + Math.exp(WIN_CHANCES_MULTIPLIER * score.cp)) - 1;
}

export function relativeScoreToCp(score: RelativeScore, mateScoreValue = 10000): number {
  if (score.kind === "cp") {
    return score.cp;
  }
  if (score.mate === 0) {
    return Object.is(score.mate, -0) ? -mateScoreValue : mateScoreValue;
  }
  return score.mate > 0 ? mateScoreValue - score.mate : -mateScoreValue - score.mate;
}

export function normalizeUci(move: string): string {
  return move.trim().toLowerCase();
}

export function parseUciMove(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } | null {
  const normalized = normalizeUci(uci);
  if (normalized.length < 4 || normalized.length > 5) {
    return null;
  }
  const from = normalized.slice(0, 2);
  const to = normalized.slice(2, 4);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
    return null;
  }
  const promoChar = normalized.length === 5 ? normalized.slice(4, 5) : undefined;
  if (promoChar !== undefined && !/^[qrbn]$/.test(promoChar)) {
    return null;
  }
  return {
    from: from as Square,
    to: to as Square,
    ...(promoChar !== undefined ? { promotion: promoChar as PieceSymbol } : {})
  };
}

export function moveToUci(move: Pick<Move, "from" | "to" | "promotion">): string {
  return normalizeUci(`${move.from}${move.to}${move.promotion ?? ""}`);
}

export function tryPlayUci(board: Chess, uci: string): Move | null {
  const parsed = parseUciMove(uci);
  if (!parsed) {
    return null;
  }
  try {
    return board.move(parsed);
  } catch {
    return null;
  }
}

export function fenAfterUci(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const played = tryPlayUci(chess, uci);
    return played ? chess.fen() : null;
  } catch {
    return null;
  }
}

export function sanForUci(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const played = tryPlayUci(chess, uci);
    return played?.san ?? normalizeUci(uci);
  } catch {
    return normalizeUci(uci);
  }
}

export function isLegalUci(fen: string, uci: string): boolean {
  return fenAfterUci(fen, uci) !== null;
}

/**
 * EPD-equivalent position identity (first 4 FEN fields: board, turn, castling, en passant).
 */
export function fenPositionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

export function fenSideToMove(fen: string): Color {
  return fen.trim().split(/\s+/)[1] === "b" ? "b" : "w";
}

export function fenFullmoveNumber(fen: string): number {
  const raw = fen.trim().split(/\s+/)[5];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function isIrreversibleMove(fenBefore: string, uci: string): boolean {
  try {
    const chess = new Chess(fenBefore);
    const played = tryPlayUci(chess, uci);
    if (!played) {
      return false;
    }
    return (
      played.piece === "p" ||
      played.isCapture() ||
      played.isKingsideCastle() ||
      played.isQueensideCastle()
    );
  } catch {
    return false;
  }
}

const CLK_COMMENT_RE = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/;

export function parseTimeControl(timeControl?: string): { baseSec: number | null; incSec: number } {
  if (!timeControl) {
    return { baseSec: null, incSec: 0 };
  }
  const raw = timeControl.trim();
  if (!raw || raw === "-" || raw.includes("/")) {
    return { baseSec: null, incSec: 0 };
  }
  const [baseStr, incStr] = raw.split("+", 2);
  const baseSec = Number(baseStr);
  const incSec = incStr !== undefined && incStr !== "" ? Number(incStr) : 0;
  if (!Number.isFinite(baseSec) || !Number.isFinite(incSec) || baseSec <= 0 || incSec < 0) {
    return { baseSec: null, incSec: 0 };
  }
  return { baseSec, incSec };
}

export function parseClockSecondsFromComment(comment?: string): number | undefined {
  if (!comment) {
    return undefined;
  }
  const match = CLK_COMMENT_RE.exec(comment);
  if (!match) {
    return undefined;
  }
  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseFloat(match[3] ?? "0");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return undefined;
  }
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 100) / 100;
}
