/**
 * Pure-TypeScript single/multi-game PGN parser with clock and pre-existing eval extraction.
 *
 * Clock timing buckets adapted from Chessticize/chessticize-worker#27 and
 * Chessticize/chessticize-server#629.
 */

import { Chess } from "chess.js";
import type { AnalysisScore } from "../engine-analysis.ts";

export type GameTimeClass =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "daily"
  | "unknown";

export type ClockBucket =
  | "time_trouble"
  | "impulsive"
  | "deliberate"
  | "unknown";

export interface ParsedTimeControl {
  baseSec: number;
  incrementSec: number;
}

export interface ParsedGamePly {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  comment: string;
  clockRemainingSec?: number;
  timeSpentSec?: number;
  clockBucket: ClockBucket;
  preExistingEval?: AnalysisScore;
}

export interface ParsedGame {
  headers: Record<string, string>;
  event?: string;
  site?: string;
  white?: string;
  black?: string;
  whiteElo?: number;
  blackElo?: number;
  result?: string;
  timeControl?: string;
  timeClass: GameTimeClass;
  utcDate?: string;
  utcTime?: string;
  eco?: string;
  opening?: string;
  termination?: string;
  initialFen?: string;
  plies: ParsedGamePly[];
}

const HEADER_LINE_RE = /^\s*\[([A-Za-z0-9_-]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/;
const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
const CLK_TAG_RE = /\[%clk\s+([^\]]+)\]/i;
const EVAL_TAG_RE = /\[%eval\s+([^\]]+)\]/i;

/**
 * Normalize a PGN TimeControl header into a Chess.com/Lichess time class
 * using estimated game duration `base + 40 * increment`.
 */
export function normalizeTimeClass(timeControl?: string): GameTimeClass {
  if (!timeControl) {
    return "unknown";
  }
  const trimmed = timeControl.trim().toLowerCase();
  if (!trimmed || trimmed === "-" || trimmed === "?") {
    return "unknown";
  }
  if (trimmed === "daily" || trimmed === "correspondence") {
    return "daily";
  }

  // Handle fraction formats such as Chess.com daily "1/86400" or FIDE "40/7200" / "40/5400+30"
  const fractionMatch = /^(\d+)\/(\d+)(?:\+(\d+))?(?::.*)?$/.exec(trimmed);
  if (fractionMatch) {
    const moves = Number(fractionMatch[1]);
    const seconds = Number(fractionMatch[2]);
    const inc = fractionMatch[3] ? Number(fractionMatch[3]) : 0;
    if (!Number.isFinite(moves) || !Number.isFinite(seconds) || moves <= 0 || seconds <= 0) {
      return "unknown";
    }
    // Chess.com daily games encode days-per-move as 1/86400, 1/259200, etc.
    if (moves === 1 && seconds >= 43200) {
      return "daily";
    }
    const estimated = seconds + 40 * inc;
    return classifyEstimatedDuration(estimated);
  }

  const parsed = parseTimeControl(trimmed);
  if (!parsed) {
    return "unknown";
  }
  const estimated = parsed.baseSec + 40 * parsed.incrementSec;
  return classifyEstimatedDuration(estimated);
}

/**
 * Parse standard `base` or `base+inc` time control strings (in seconds).
 */
export function parseTimeControl(timeControl?: string): ParsedTimeControl | undefined {
  if (!timeControl) {
    return undefined;
  }
  const trimmed = timeControl.trim();
  const match = /^(\d+(?:\.\d+)?)(?:\+(\d+(?:\.\d+)?))?$/.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const baseSec = Number(match[1]);
  const incrementSec = match[2] !== undefined ? Number(match[2]) : 0;
  if (
    !Number.isFinite(baseSec) ||
    !Number.isFinite(incrementSec) ||
    baseSec < 0 ||
    incrementSec < 0
  ) {
    return undefined;
  }
  return { baseSec, incrementSec };
}

/**
 * Classify a move's timing bucket from remaining clock, time spent, and game time class.
 */
export function classifyClockBucket({
  clockRemainingSec,
  timeSpentSec,
  timeClass
}: {
  clockRemainingSec?: number;
  timeSpentSec?: number;
  timeClass: GameTimeClass;
}): ClockBucket {
  if (clockRemainingSec === undefined || !Number.isFinite(clockRemainingSec)) {
    return "unknown";
  }
  const timeTroubleThreshold = timeClass === "bullet" ? 10 : 15;
  if (clockRemainingSec <= timeTroubleThreshold) {
    return "time_trouble";
  }
  if (
    timeSpentSec !== undefined &&
    Number.isFinite(timeSpentSec) &&
    timeSpentSec <= 2 &&
    clockRemainingSec >= 30
  ) {
    return "impulsive";
  }
  if (timeSpentSec !== undefined && Number.isFinite(timeSpentSec) && timeSpentSec >= 10) {
    return "deliberate";
  }
  return "unknown";
}

/**
 * Parse a `[%clk ...]` tag from a move comment into remaining seconds.
 * Returns undefined on missing or malformed tags.
 */
export function parseClockComment(comment: string): number | undefined {
  const match = CLK_TAG_RE.exec(comment);
  if (!match || !match[1]) {
    return undefined;
  }
  const raw = match[1].trim();
  const hmsMatch = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(raw);
  if (hmsMatch) {
    const hours = Number(hmsMatch[1]);
    const minutes = Number(hmsMatch[2]);
    const seconds = Number(hmsMatch[3]);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds) ||
      minutes >= 60 ||
      seconds >= 60
    ) {
      return undefined;
    }
    return roundSeconds(hours * 3600 + minutes * 60 + seconds);
  }

  const msMatch = /^(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(raw);
  if (msMatch) {
    const minutes = Number(msMatch[1]);
    const seconds = Number(msMatch[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
      return undefined;
    }
    return roundSeconds(minutes * 60 + seconds);
  }

  return undefined;
}

/**
 * Parse a `[%eval ...]` tag from a move comment into an AnalysisScore.
 * PGN `[%eval ...]` annotations are always from White's perspective.
 */
export function parseEvalComment(
  comment: string,
  fenAfter: string,
  moverColor?: "w" | "b",
  isCheckmateAfter?: boolean
): AnalysisScore | undefined {
  const match = EVAL_TAG_RE.exec(comment);
  if (!match || !match[1]) {
    return undefined;
  }

  const raw = match[1].trim();
  const activeColor = sideToMoveFromFen(fenAfter);

  if (raw.startsWith("#")) {
    const mateToken = raw.slice(1).trim();
    const mateMatch = /^([+-]?)(\d+)$/.exec(mateToken);
    if (!mateMatch || !mateMatch[2]) {
      return undefined;
    }
    const explicitSign = mateMatch[1] ?? "";
    const magnitude = Number(mateMatch[2]);
    if (!Number.isFinite(magnitude)) {
      return undefined;
    }

    if (magnitude === 0) {
      // Handle mate-in-0 (#0 and #-0) carefully:
      // - Explicit "#-0" always indicates Black delivered mate (White mated).
      // - Otherwise, if the board position is checkmate, use the mover who delivered mate.
      // - Fallback "#0" indicates White delivered mate (+0 for White, -0 for Black).
      const whiteWon =
        explicitSign === "-"
          ? false
          : isCheckmateAfter && moverColor !== undefined
            ? moverColor === "w"
            : true;
      const whiteMate = whiteWon ? 0 : -0;
      const sideToMoveMate =
        activeColor === "w" ? whiteMate : whiteWon ? -0 : 0;
      return {
        kind: "mate",
        whiteMate,
        sideToMoveMate
      };
    }

    const whiteMate = explicitSign === "-" ? -magnitude : magnitude;
    const sideToMoveMate = activeColor === "w" ? whiteMate : -whiteMate;
    return {
      kind: "mate",
      whiteMate,
      sideToMoveMate
    };
  }

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) {
    return undefined;
  }
  const pawns = Number(raw);
  if (!Number.isFinite(pawns)) {
    return undefined;
  }
  const whiteCp = normalizeZero(Math.round(pawns * 100));
  const sideToMoveCp = normalizeZero(activeColor === "w" ? whiteCp : -whiteCp);
  return {
    kind: "cp",
    whiteCentipawns: whiteCp,
    sideToMoveCentipawns: sideToMoveCp
  };
}

/**
 * Split a PGN string containing one or more games into individual game PGN chunks.
 */
export function splitPgnGames(pgnText: string): string[] {
  const normalized = pgnText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  const games: string[] = [];
  let currentLines: string[] = [];
  let hasMovetext = false;
  let braceDepth = 0;
  let parenDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeaderLine =
      braceDepth === 0 && parenDepth === 0 && HEADER_LINE_RE.test(line);

    if (isHeaderLine && hasMovetext) {
      const chunk = currentLines.join("\n").trim();
      if (chunk) {
        games.push(chunk);
      }
      currentLines = [line];
      hasMovetext = false;
      continue;
    }

    if (trimmed.length === 0 && currentLines.length === 0) {
      continue;
    }

    currentLines.push(line);

    if (!isHeaderLine && trimmed.length > 0) {
      hasMovetext = true;
    }

    // Track brace / paren depth outside semicolon comments on this line
    for (let index = 0; index < line.length; index += 1) {
      const ch = line[index];
      if (braceDepth > 0) {
        if (ch === "}") {
          braceDepth -= 1;
        }
        continue;
      }
      if (ch === ";") {
        break;
      }
      if (ch === "{") {
        braceDepth += 1;
      } else if (ch === "(") {
        parenDepth += 1;
      } else if (ch === ")" && parenDepth > 0) {
        parenDepth -= 1;
      }
    }
  }

  const trailing = currentLines.join("\n").trim();
  if (trailing) {
    games.push(trailing);
  }
  return games;
}

/**
 * Parse a single- or multi-game PGN string into normalized ParsedGame objects.
 */
export function parsePgnGames(pgnText: string): ParsedGame[] {
  const chunks = splitPgnGames(pgnText);
  return chunks.map((chunk) => parseSinglePgnGame(chunk));
}

/**
 * Parse a single game PGN string (or the first game of a multi-game PGN).
 */
export function parsePgnGame(pgnText: string): ParsedGame {
  const chunks = splitPgnGames(pgnText);
  const first = chunks[0];
  if (!first) {
    throw new Error("Empty PGN input: no game found.");
  }
  return parseSinglePgnGame(first);
}

interface MainlineMoveToken {
  san: string;
  comments: string[];
}

function parseSinglePgnGame(chunk: string): ParsedGame {
  const lines = chunk.replace(/\r\n?/g, "\n").split("\n");
  const headers: Record<string, string> = {};
  const movetextLines: string[] = [];
  let readingHeaders = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (readingHeaders) {
      if (trimmed.length === 0) {
        if (Object.keys(headers).length > 0) {
          readingHeaders = false;
        }
        continue;
      }
      const match = HEADER_LINE_RE.exec(line);
      if (match && match[1] !== undefined && match[2] !== undefined) {
        headers[match[1]] = unescapeHeaderValue(match[2]);
        continue;
      }
      readingHeaders = false;
    }
    movetextLines.push(line);
  }

  const movetext = movetextLines.join("\n");
  const { moves: moveTokens, resultToken } = tokenizeMainlineMovetext(movetext);

  const initialFen = nonEmptyHeader(headers["FEN"]);
  const chess = initialFen ? new Chess(initialFen) : new Chess();

  const timeControl = nonEmptyHeader(headers["TimeControl"]);
  const timeClass = normalizeTimeClass(timeControl);
  const parsedTimeControl = parseTimeControl(timeControl);
  const prevClockByColor: { w?: number; b?: number } = {};

  const plies: ParsedGamePly[] = [];

  for (let index = 0; index < moveTokens.length; index += 1) {
    const token = moveTokens[index];
    if (!token) {
      continue;
    }

    const fenBefore = chess.fen();
    const moveNumber = fullmoveNumberFromFen(fenBefore);
    const cleanedSan = normalizeSanToken(token.san);
    const executed = chess.move(cleanedSan);
    if (!executed) {
      throw new Error(
        `Invalid PGN move "${token.san}" at ply ${index + 1} (FEN: ${fenBefore}).`
      );
    }

    const fenAfter = chess.fen();
    const color = executed.color;
    const uci = `${executed.from}${executed.to}${executed.promotion ?? ""}`.toLowerCase();
    const comment = token.comments
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .join(" ");

    const clockRemainingSec = parseClockComment(comment);
    let timeSpentSec: number | undefined;
    if (clockRemainingSec !== undefined) {
      const prevClock = prevClockByColor[color];
      if (prevClock !== undefined) {
        const inc = parsedTimeControl?.incrementSec ?? 0;
        timeSpentSec = Math.max(0, roundSeconds(prevClock + inc - clockRemainingSec));
      } else if (parsedTimeControl !== undefined) {
        timeSpentSec = Math.max(
          0,
          roundSeconds(parsedTimeControl.baseSec - clockRemainingSec)
        );
      }
      prevClockByColor[color] = clockRemainingSec;
    }

    const clockBucket = classifyClockBucket({
      ...(clockRemainingSec !== undefined ? { clockRemainingSec } : {}),
      ...(timeSpentSec !== undefined ? { timeSpentSec } : {}),
      timeClass
    });

    const preExistingEval = parseEvalComment(
      comment,
      fenAfter,
      color,
      chess.isCheckmate()
    );

    plies.push({
      ply: index + 1,
      moveNumber,
      color,
      uci,
      san: executed.san,
      fenBefore,
      fenAfter,
      comment,
      ...(clockRemainingSec !== undefined ? { clockRemainingSec } : {}),
      ...(timeSpentSec !== undefined ? { timeSpentSec } : {}),
      clockBucket,
      ...(preExistingEval !== undefined ? { preExistingEval } : {})
    });
  }

  const event = nonEmptyHeader(headers["Event"]);
  const site = nonEmptyHeader(headers["Site"]);
  const white = nonEmptyHeader(headers["White"]);
  const black = nonEmptyHeader(headers["Black"]);
  const whiteElo = parseOptionalInt(headers["WhiteElo"]);
  const blackElo = parseOptionalInt(headers["BlackElo"]);
  const result = nonEmptyHeader(headers["Result"]) ?? resultToken;
  const utcDate =
    nonEmptyHeader(headers["UTCDate"]) ?? nonPlaceholderDate(headers["Date"]);
  const utcTime = nonEmptyHeader(headers["UTCTime"]);
  const eco = nonEmptyHeader(headers["ECO"]);
  const opening = nonEmptyHeader(headers["Opening"]);
  const termination = nonEmptyHeader(headers["Termination"]);

  return {
    headers,
    ...(event !== undefined ? { event } : {}),
    ...(site !== undefined ? { site } : {}),
    ...(white !== undefined ? { white } : {}),
    ...(black !== undefined ? { black } : {}),
    ...(whiteElo !== undefined ? { whiteElo } : {}),
    ...(blackElo !== undefined ? { blackElo } : {}),
    ...(result !== undefined ? { result } : {}),
    ...(timeControl !== undefined ? { timeControl } : {}),
    timeClass,
    ...(utcDate !== undefined ? { utcDate } : {}),
    ...(utcTime !== undefined ? { utcTime } : {}),
    ...(eco !== undefined ? { eco } : {}),
    ...(opening !== undefined ? { opening } : {}),
    ...(termination !== undefined ? { termination } : {}),
    ...(initialFen !== undefined ? { initialFen } : {}),
    plies
  };
}

function tokenizeMainlineMovetext(movetext: string): {
  moves: MainlineMoveToken[];
  resultToken?: string;
} {
  const moves: MainlineMoveToken[] = [];
  let resultToken: string | undefined;
  let index = 0;
  let variationDepth = 0;

  while (index < movetext.length) {
    const ch = movetext[index];
    if (ch === undefined) {
      break;
    }

    // Skip whitespace
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }

    // Brace comment { ... }
    if (ch === "{") {
      const start = index + 1;
      index += 1;
      while (index < movetext.length && movetext[index] !== "}") {
        index += 1;
      }
      const commentBody = movetext.slice(start, index);
      if (index < movetext.length && movetext[index] === "}") {
        index += 1;
      }
      if (variationDepth === 0 && moves.length > 0) {
        const lastMove = moves[moves.length - 1];
        if (lastMove) {
          lastMove.comments.push(commentBody);
        }
      }
      continue;
    }

    // Semicolon rest-of-line comment
    if (ch === ";") {
      const start = index + 1;
      while (index < movetext.length && movetext[index] !== "\n") {
        index += 1;
      }
      const commentBody = movetext.slice(start, index);
      if (variationDepth === 0 && moves.length > 0) {
        const lastMove = moves[moves.length - 1];
        if (lastMove) {
          lastMove.comments.push(commentBody);
        }
      }
      continue;
    }

    // RAV variation start / end
    if (ch === "(") {
      variationDepth += 1;
      index += 1;
      continue;
    }
    if (ch === ")") {
      if (variationDepth > 0) {
        variationDepth -= 1;
      }
      index += 1;
      continue;
    }

    // Read a non-whitespace token stopping at delimiters
    const start = index;
    while (
      index < movetext.length &&
      !/[\s{}();]/.test(movetext[index] ?? "")
    ) {
      index += 1;
    }
    const rawToken = movetext.slice(start, index);

    if (variationDepth > 0 || !rawToken) {
      continue;
    }

    // Result token
    if (RESULT_TOKENS.has(rawToken)) {
      resultToken = rawToken;
      continue;
    }

    // Numeric Annotation Glyph ($1, $6, etc.)
    if (/^\$\d+$/.test(rawToken)) {
      continue;
    }

    // Pure move number token ("1.", "12...", "...")
    if (/^(?:\d+\.+|\.+)$/.test(rawToken)) {
      continue;
    }

    // Attached move number prefix ("1.e4", "12...Nf6")
    const strippedMoveNumber = rawToken.replace(/^\d+\.+/, "");
    if (!strippedMoveNumber || RESULT_TOKENS.has(strippedMoveNumber)) {
      if (RESULT_TOKENS.has(strippedMoveNumber)) {
        resultToken = strippedMoveNumber;
      }
      continue;
    }

    moves.push({
      san: strippedMoveNumber,
      comments: []
    });
  }

  return {
    moves,
    ...(resultToken !== undefined ? { resultToken } : {})
  };
}

function classifyEstimatedDuration(estimatedSec: number): GameTimeClass {
  if (estimatedSec < 180) {
    return "bullet";
  }
  if (estimatedSec < 600) {
    return "blitz";
  }
  if (estimatedSec < 1500) {
    return "rapid";
  }
  return "classical";
}

function normalizeSanToken(rawSan: string): string {
  // Strip inline glyph suffixes (!, ?, !!, ??, !?, ?!) while preserving check/mate (+/#)
  const stripped = rawSan.replace(/[!?]+$/, "");
  if (stripped === "0-0" || stripped === "0-0+" || stripped === "0-0#") {
    return stripped.replace("0-0", "O-O");
  }
  if (stripped === "0-0-0" || stripped === "0-0-0+" || stripped === "0-0-0#") {
    return stripped.replace("0-0-0", "O-O-O");
  }
  return stripped;
}

function unescapeHeaderValue(raw: string): string {
  return raw.replace(/\\(["\\])/g, "$1");
}

function nonEmptyHeader(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nonPlaceholderDate(value: string | undefined): string | undefined {
  const trimmed = nonEmptyHeader(value);
  if (!trimmed || trimmed === "????.??.??") {
    return undefined;
  }
  return trimmed;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  const trimmed = nonEmptyHeader(value);
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fullmoveNumberFromFen(fen: string): number {
  const part = fen.split(/\s+/)[5];
  const parsed = part ? Number.parseInt(part, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function sideToMoveFromFen(fen: string): "w" | "b" {
  return fen.split(/\s+/)[1] === "b" ? "b" : "w";
}

function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}
