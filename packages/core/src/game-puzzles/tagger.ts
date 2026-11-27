/*
 * Adapted from Chessticize/chessticize-worker, lychee-org/retagger, and lichess-org/puzzler.
 * Original work Copyright 2020 lichess.org
 * Forked work Copyright 2023 lychee-org
 * Modified work Copyright 2024-2026 chessticize.com
 * Licensed under the MIT License.
 */

import { Chess, type Color, type Piece, type PieceSymbol, type Square } from "chess.js";
import { SERVER_CURATED_THEMES } from "../theme-catalog.ts";
import {
  normalizeUci,
  oppositeColor,
  scoreForPov,
  tryPlayUci,
  winChances
} from "./score.ts";
import type {
  PuzzleExtractionEngine,
  PuzzleLengthTag,
  PuzzlePhaseTag,
  SearchLimitConfig
} from "./types.ts";

export const PIECE_VALUES: Record<Exclude<PieceSymbol, "k">, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9
};

export const KING_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 99
};

export const LENGTH_TAGS = new Set<string>(["oneMove", "short", "long", "veryLong"]);

export const MATE_TAGS = new Set<string>([
  "mate",
  "mateIn1",
  "mateIn2",
  "mateIn3",
  "mateIn4",
  "mateIn5",
  "smotheredMate",
  "backRankMate",
  "anastasiaMate",
  "hookMate",
  "arabianMate",
  "bodenMate",
  "doubleBishopMate",
  "dovetailMate"
]);

const RAY_PIECE_TYPES = new Set<PieceSymbol>(["q", "r", "b"]);
const CURATED_THEME_SET = new Set<string>(SERVER_CURATED_THEMES);

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

const KNIGHT_DELTAS: readonly [number, number][] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
];

const KING_DELTAS: readonly [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

const ORTHOGONAL_DELTAS: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1]
];

const DIAGONAL_DELTAS: readonly [number, number][] = [
  [1, 1], [1, -1], [-1, 1], [-1, -1]
];

interface PuzzleNode {
  index: number;
  uci: string;
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  movedPieceType: PieceSymbol;
  isCapture: boolean;
  isEnPassant: boolean;
  isCastling: boolean;
  fenBefore: string;
  fenAfter: string;
  boardBefore: Chess;
  boardAfter: Chess;
  turnAfter: Color;
}

interface InternalPuzzle {
  initialFen: string;
  initialBoard: Chess;
  pov: Color;
  mainline: PuzzleNode[];
  cp: number;
}

export interface TagPuzzleInput {
  /** FEN before `solutionMoves[0]` (the opponent's setup blunder). */
  initialFen: string;
  /** UCI move sequence where index 0 is the opponent's setup blunder and index 1, 3, ... are the solver's moves. */
  solutionMoves: readonly string[];
  /** Solver-POV evaluation in centipawns at the end of the line (used for crushing/advantage/equality). */
  cp: number;
  /** Optional game ply of the setup move (used to refine opening phase detection). */
  ply?: number;
}

export interface TagPuzzleResult {
  /** All emitted tags (motifs + outcome/eval + length + phase). */
  allTags: string[];
  /** Curated + tactical motif tags (excluding length/phase metadata tags). */
  themes: string[];
  /** Curated themes filtered to `SERVER_CURATED_THEMES` in catalog order. */
  curatedThemes: string[];
  lengthTag: PuzzleLengthTag;
  phaseTag: PuzzlePhaseTag;
}

export interface EnrichTagsInput extends TagPuzzleInput {
  /** Optional extended PV sequence `[setupMove, pv0, pv1, pv2, ...]` for enriching 1-move blunders. */
  pvMoves?: readonly string[];
}

export function squareFile(square: Square): number {
  return square.charCodeAt(0) - 97;
}

export function squareRank(square: Square): number {
  return square.charCodeAt(1) - 49;
}

export function coordsToSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    return null;
  }
  return `${FILES[file]}${RANKS[rank]}` as Square;
}

export function squareDistance(a: Square, b: Square): number {
  return Math.max(Math.abs(squareFile(a) - squareFile(b)), Math.abs(squareRank(a) - squareRank(b)));
}

/**
 * Returns all squares strictly between `a` and `b` along a rank, file, or diagonal.
 */
export function squaresBetween(a: Square, b: Square): Set<Square> {
  const result = new Set<Square>();
  const af = squareFile(a);
  const ar = squareRank(a);
  const bf = squareFile(b);
  const br = squareRank(b);
  const df = bf - af;
  const dr = br - ar;

  const isAligned = df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr);
  if (!isAligned || (df === 0 && dr === 0)) {
    return result;
  }

  const stepF = Math.sign(df);
  const stepR = Math.sign(dr);
  let f = af + stepF;
  let r = ar + stepR;
  while (f !== bf || r !== br) {
    const sq = coordsToSquare(f, r);
    if (sq) {
      result.add(sq);
    }
    f += stepF;
    r += stepR;
  }
  return result;
}

/**
 * Returns all squares along the full rank, file, or diagonal passing through `a` and `b`.
 */
export function squaresRay(a: Square, b: Square): Set<Square> {
  const result = new Set<Square>();
  const af = squareFile(a);
  const ar = squareRank(a);
  const bf = squareFile(b);
  const br = squareRank(b);
  const df = bf - af;
  const dr = br - ar;

  const isAligned = df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr);
  if (!isAligned || (df === 0 && dr === 0)) {
    return result;
  }

  const stepF = Math.sign(df);
  const stepR = Math.sign(dr);

  // Walk backward to board edge
  let f = af;
  let r = ar;
  while (f - stepF >= 0 && f - stepF <= 7 && r - stepR >= 0 && r - stepR <= 7) {
    f -= stepF;
    r -= stepR;
  }
  // Walk forward across full ray
  while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
    const sq = coordsToSquare(f, r);
    if (sq) {
      result.add(sq);
    }
    f += stepF;
    r += stepR;
  }
  return result;
}

function getBoardPieces(board: Chess): Array<{ square: Square; type: PieceSymbol; color: Color }> {
  const pieces: Array<{ square: Square; type: PieceSymbol; color: Color }> = [];
  for (const row of board.board()) {
    for (const cell of row) {
      if (cell) {
        pieces.push(cell);
      }
    }
  }
  return pieces;
}

function findKingSquare(board: Chess, color: Color): Square | null {
  return board.findPiece({ type: "k", color })[0] ?? null;
}

/**
 * Pseudo-legal squares attacked by the piece on `fromSquare` (matches `python-chess` `board.attacks`).
 */
export function attacksFrom(board: Chess, fromSquare: Square): Set<Square> {
  const piece = board.get(fromSquare);
  const result = new Set<Square>();
  if (!piece) {
    return result;
  }

  const f = squareFile(fromSquare);
  const r = squareRank(fromSquare);

  if (piece.type === "p") {
    const dir = piece.color === "w" ? 1 : -1;
    const left = coordsToSquare(f - 1, r + dir);
    const right = coordsToSquare(f + 1, r + dir);
    if (left) result.add(left);
    if (right) result.add(right);
    return result;
  }

  if (piece.type === "n") {
    for (const [df, dr] of KNIGHT_DELTAS) {
      const sq = coordsToSquare(f + df, r + dr);
      if (sq) result.add(sq);
    }
    return result;
  }

  if (piece.type === "k") {
    for (const [df, dr] of KING_DELTAS) {
      const sq = coordsToSquare(f + df, r + dr);
      if (sq) result.add(sq);
    }
    return result;
  }

  const deltas: readonly [number, number][] =
    piece.type === "r"
      ? ORTHOGONAL_DELTAS
      : piece.type === "b"
        ? DIAGONAL_DELTAS
        : [...ORTHOGONAL_DELTAS, ...DIAGONAL_DELTAS];

  for (const [df, dr] of deltas) {
    let nf = f + df;
    let nr = r + dr;
    while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
      const sq = coordsToSquare(nf, nr);
      if (!sq) break;
      result.add(sq);
      if (board.get(sq)) {
        break;
      }
      nf += df;
      nr += dr;
    }
  }
  return result;
}

function attackersOf(board: Chess, attackerColor: Color, square: Square): Square[] {
  return board.attackers(square, attackerColor);
}

function attackerPieces(board: Chess, attackerColor: Color, square: Square): Piece[] {
  const pieces: Piece[] = [];
  for (const sq of attackersOf(board, attackerColor, square)) {
    const piece = board.get(sq);
    if (piece) {
      pieces.push(piece);
    }
  }
  return pieces;
}

function checkersOf(board: Chess): Square[] {
  if (!board.isCheck()) {
    return [];
  }
  const kingSq = findKingSquare(board, board.turn());
  if (!kingSq) {
    return [];
  }
  return attackersOf(board, oppositeColor(board.turn()), kingSq);
}

/**
 * Returns the full pin ray if `square` is absolutely pinned to `color`'s king,
 * or `null` if not pinned.
 */
function pinRay(board: Chess, color: Color, square: Square): Set<Square> | null {
  const kingSq = findKingSquare(board, color);
  if (!kingSq || kingSq === square) {
    return null;
  }
  const kf = squareFile(kingSq);
  const kr = squareRank(kingSq);
  const sf = squareFile(square);
  const sr = squareRank(square);
  const df = sf - kf;
  const dr = sr - kr;

  const isOrthogonal = df === 0 || dr === 0;
  const isDiagonal = Math.abs(df) === Math.abs(dr);
  if (!isOrthogonal && !isDiagonal) {
    return null;
  }

  const stepF = Math.sign(df);
  const stepR = Math.sign(dr);

  // Ensure nothing stands between king and candidate pinned square
  let f = kf + stepF;
  let r = kr + stepR;
  while (f !== sf || r !== sr) {
    const sq = coordsToSquare(f, r);
    if (sq && board.get(sq)) {
      return null;
    }
    f += stepF;
    r += stepR;
  }

  // Walk past `square` looking for an enemy slider aligned with this ray
  f = sf + stepF;
  r = sr + stepR;
  const enemy = oppositeColor(color);
  while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
    const sq = coordsToSquare(f, r);
    if (!sq) break;
    const piece = board.get(sq);
    if (piece) {
      if (
        piece.color === enemy &&
        (piece.type === "q" || (isOrthogonal && piece.type === "r") || (isDiagonal && piece.type === "b"))
      ) {
        return squaresRay(kingSq, square);
      }
      return null;
    }
    f += stepF;
    r += stepR;
  }
  return null;
}

function isPinned(board: Chess, color: Color, square: Square): boolean {
  return pinRay(board, color, square) !== null;
}

function hasPseudoLegalMoveOutsidePin(board: Chess, square: Square, pinDir: Set<Square>): boolean {
  const piece = board.get(square);
  if (!piece) {
    return false;
  }

  if (piece.type === "p") {
    const f = squareFile(square);
    const r = squareRank(square);
    const dir = piece.color === "w" ? 1 : -1;
    const oneStep = coordsToSquare(f, r + dir);
    if (oneStep && !board.get(oneStep)) {
      if (!pinDir.has(oneStep)) {
        return true;
      }
      const startRank = piece.color === "w" ? 1 : 6;
      const twoStep = r === startRank ? coordsToSquare(f, r + 2 * dir) : null;
      if (twoStep && !board.get(twoStep) && !pinDir.has(twoStep)) {
        return true;
      }
    }
    const epField = board.fen().split(/\s+/)[3];
    for (const df of [-1, 1]) {
      const diag = coordsToSquare(f + df, r + dir);
      if (!diag || pinDir.has(diag)) {
        continue;
      }
      const target = board.get(diag);
      if ((target && target.color !== piece.color) || epField === diag) {
        return true;
      }
    }
    return false;
  }

  for (const targetSq of attacksFrom(board, square)) {
    if (pinDir.has(targetSq)) {
      continue;
    }
    const occupant = board.get(targetSq);
    if (!occupant || occupant.color !== piece.color) {
      return true;
    }
  }
  return false;
}

function materialCount(board: Chess, side: Color): number {
  let total = 0;
  for (const piece of getBoardPieces(board)) {
    if (piece.color === side && piece.type !== "k") {
      total += PIECE_VALUES[piece.type];
    }
  }
  return total;
}

function materialDiff(board: Chess, side: Color): number {
  return materialCount(board, side) - materialCount(board, oppositeColor(side));
}

function isDefended(board: Chess, piece: Piece, square: Square): boolean {
  if (attackersOf(board, piece.color, square).length > 0) {
    return true;
  }
  // Ray defense behind an enemy sliding attacker (never mutates `board`)
  const enemy = oppositeColor(piece.color);
  for (const attackerSq of attackersOf(board, enemy, square)) {
    const attackerPiece = board.get(attackerSq);
    if (attackerPiece && RAY_PIECE_TYPES.has(attackerPiece.type)) {
      const cloned = new Chess(board.fen());
      cloned.remove(attackerSq);
      if (attackersOf(cloned, piece.color, square).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function isHanging(board: Chess, piece: Piece, square: Square): boolean {
  return !isDefended(board, piece, square);
}

function canBeTakenByLowerPiece(board: Chess, piece: Piece, square: Square): boolean {
  if (piece.type === "k") {
    return false;
  }
  const enemy = oppositeColor(piece.color);
  const pieceVal = PIECE_VALUES[piece.type];
  for (const attackerSq of attackersOf(board, enemy, square)) {
    const attacker = board.get(attackerSq);
    if (attacker && attacker.type !== "k" && PIECE_VALUES[attacker.type] < pieceVal) {
      return true;
    }
  }
  return false;
}

function isInBadSpot(board: Chess, square: Square): boolean {
  const piece = board.get(square);
  if (!piece) {
    return false;
  }
  const enemy = oppositeColor(piece.color);
  return (
    attackersOf(board, enemy, square).length > 0 &&
    (isHanging(board, piece, square) || canBeTakenByLowerPiece(board, piece, square))
  );
}

function isTrapped(board: Chess, square: Square): boolean {
  if (board.isCheck() || isPinned(board, board.turn(), square)) {
    return false;
  }
  const piece = board.get(square);
  if (!piece || piece.type === "p" || piece.type === "k") {
    return false;
  }
  if (!isInBadSpot(board, square)) {
    return false;
  }

  const legalMoves = board.moves({ verbose: true, square });
  for (const escape of legalMoves) {
    const capturing = board.get(escape.to);
    if (capturing && capturing.type !== "k" && PIECE_VALUES[capturing.type] >= PIECE_VALUES[piece.type]) {
      return false;
    }
    const nextBoard = new Chess(board.fen());
    const played = nextBoard.move({
      from: escape.from,
      to: escape.to,
      ...(escape.promotion ? { promotion: escape.promotion } : {})
    });
    if (played && !isInBadSpot(nextBoard, escape.to)) {
      return false;
    }
  }
  return true;
}

function isAdvancedPawnMove(node: PuzzleNode): boolean {
  if (node.promotion) {
    return true;
  }
  if (node.movedPieceType !== "p") {
    return false;
  }
  const toRank = squareRank(node.to);
  return node.turnAfter === "w" ? toRank < 3 : toRank > 4;
}

function isVeryAdvancedPawnMove(node: PuzzleNode): boolean {
  if (!isAdvancedPawnMove(node)) {
    return false;
  }
  const toRank = squareRank(node.to);
  return node.turnAfter === "w" ? toRank < 2 : toRank > 5;
}

function attackedOpponentSquares(
  board: Chess,
  fromSquare: Square,
  pov: Color
): Array<{ piece: Piece; square: Square }> {
  const result: Array<{ piece: Piece; square: Square }> = [];
  for (const attackedSq of attacksFrom(board, fromSquare)) {
    const attackedPiece = board.get(attackedSq);
    if (attackedPiece && attackedPiece.color !== pov) {
      result.push({ piece: attackedPiece, square: attackedSq });
    }
  }
  return result;
}

function buildInternalPuzzle(input: TagPuzzleInput): InternalPuzzle | null {
  let cursor: Chess;
  try {
    cursor = new Chess(input.initialFen);
  } catch {
    return null;
  }

  const initialBoard = new Chess(cursor.fen());
  const mainline: PuzzleNode[] = [];

  for (let index = 0; index < input.solutionMoves.length; index += 1) {
    const uci = normalizeUci(input.solutionMoves[index] ?? "");
    const fenBefore = cursor.fen();
    const boardBefore = new Chess(fenBefore);
    const played = tryPlayUci(cursor, uci);
    if (!played) {
      break;
    }
    const fenAfter = cursor.fen();
    const boardAfter = new Chess(fenAfter);
    const movedPiece = boardAfter.get(played.to);
    if (!movedPiece) {
      break;
    }
    mainline.push({
      index,
      uci,
      from: played.from,
      to: played.to,
      ...(played.promotion ? { promotion: played.promotion } : {}),
      movedPieceType: movedPiece.type,
      isCapture: played.isCapture(),
      isEnPassant: played.isEnPassant(),
      isCastling: played.isKingsideCastle() || played.isQueensideCastle(),
      fenBefore,
      fenAfter,
      boardBefore,
      boardAfter,
      turnAfter: boardAfter.turn()
    });
  }

  if (mainline.length < 2) {
    return null;
  }

  return {
    initialFen: initialBoard.fen(),
    initialBoard,
    pov: mainline[0]!.turnAfter,
    mainline,
    cp: input.cp
  };
}

function playerNodes(puzzle: InternalPuzzle): PuzzleNode[] {
  const nodes: PuzzleNode[] = [];
  for (let i = 1; i < puzzle.mainline.length; i += 2) {
    nodes.push(puzzle.mainline[i]!);
  }
  return nodes;
}

function opponentNodes(puzzle: InternalPuzzle): PuzzleNode[] {
  const nodes: PuzzleNode[] = [];
  for (let i = 0; i < puzzle.mainline.length; i += 2) {
    nodes.push(puzzle.mainline[i]!);
  }
  return nodes;
}

// --- Motif Detectors (ported faithfully from cook.py + PR #27 fixes) ---

function mateIn(puzzle: InternalPuzzle): string | null {
  const end = puzzle.mainline[puzzle.mainline.length - 1];
  if (!end || !end.boardAfter.isCheckmate()) {
    return null;
  }
  const movesToMate = Math.floor(puzzle.mainline.length / 2);
  if (movesToMate === 1) return "mateIn1";
  if (movesToMate === 2) return "mateIn2";
  if (movesToMate === 3) return "mateIn3";
  if (movesToMate === 4) return "mateIn4";
  return "mateIn5";
}

function smotheredMate(puzzle: InternalPuzzle): boolean {
  const end = puzzle.mainline[puzzle.mainline.length - 1]!;
  const board = end.boardAfter;
  const kingSq = findKingSquare(board, oppositeColor(puzzle.pov));
  if (!kingSq) return false;
  const kf = squareFile(kingSq);
  const kr = squareRank(kingSq);

  for (const checkerSq of checkersOf(board)) {
    const piece = board.get(checkerSq);
    if (piece?.type === "n") {
      for (const [df, dr] of KING_DELTAS) {
        const escapeSq = coordsToSquare(kf + df, kr + dr);
        if (!escapeSq) continue;
        const blocker = board.get(escapeSq);
        if (!blocker || blocker.color === puzzle.pov) {
          return false;
        }
      }
      return true;
    }
  }
  return false;
}

function backRankMate(puzzle: InternalPuzzle): boolean {
  const end = puzzle.mainline[puzzle.mainline.length - 1]!;
  const board = end.boardAfter;
  const kingSq = findKingSquare(board, oppositeColor(puzzle.pov));
  if (!kingSq || !board.isCheckmate()) return false;
  const backRank = puzzle.pov === "w" ? 7 : 0;
  if (squareRank(kingSq) !== backRank) return false;

  const shieldRank = puzzle.pov === "w" ? 6 : 1;
  const kf = squareFile(kingSq);
  for (const df of [-1, 0, 1]) {
    const sq = coordsToSquare(kf + df, shieldRank);
    if (!sq) continue;
    const piece = board.get(sq);
    if (!piece || piece.color === puzzle.pov || attackersOf(board, puzzle.pov, sq).length > 0) {
      return false;
    }
  }
  return checkersOf(board).some((checkerSq) => squareRank(checkerSq) === backRank);
}

function anastasiaMate(puzzle: InternalPuzzle): boolean {
  const end = puzzle.mainline[puzzle.mainline.length - 1]!;
  const board = end.boardAfter;
  const kingSq = findKingSquare(board, oppositeColor(puzzle.pov));
  if (!kingSq) return false;
  const kf = squareFile(kingSq);
  const kr = squareRank(kingSq);
  if ((kf !== 0 && kf !== 7) || kr === 0 || kr === 7) return false;
  if (squareFile(end.to) !== kf || (end.movedPieceType !== "q" && end.movedPieceType !== "r")) {
    return false;
  }
  const inward = kf === 0 ? 1 : -1;
  const blockerSq = coordsToSquare(kf + inward, kr);
  const knightSq = coordsToSquare(kf + 3 * inward, kr);
  if (!blockerSq || !knightSq) return false;
  const blocker = board.get(blockerSq);
  const knight = board.get(knightSq);
  return (
    blocker !== undefined &&
    blocker.color !== puzzle.pov &&
    knight !== undefined &&
    knight.color === puzzle.pov &&
    knight.type === "n"
  );
}

function hookMate(puzzle: InternalPuzzle): boolean {
  const end = puzzle.mainline[puzzle.mainline.length - 1]!;
  const board = end.boardAfter;
  const kingSq = findKingSquare(board, oppositeColor(puzzle.pov));
  if (!kingSq) return false;
  if (end.movedPieceType !== "r" || squareDistance(end.to, kingSq) !== 1) return false;
  for (const rookDefSq of attackersOf(board, puzzle.pov, end.to)) {
    const defender = board.get(rookDefSq);
    if (defender?.type === "n" && squareDistance(rookDefSq, kingSq) === 1) {
      for (const knightDefSq of attackersOf(board, puzzle.pov, rookDefSq)) {
        const pawn = board.get(knightDefSq);
        if (pawn?.type === "p") {
          return true;
        }
      }
    }
  }
  return false;
}

function arabianMate(puzzle: InternalPuzzle): boolean {
  const end = puzzle.mainline[puzzle.mainline.length - 1]!;
  const board = end.boardAfter;
  const kingSq = findKingSquare(board, oppositeColor(puzzle.pov));
  if (!kingSq) return false;
  const kf = squareFile(kingSq);
  const kr = squareRank(kingSq);
  if (
    (kf === 0 || kf === 7) &&
    (kr === 0 || kr === 7) &&
    end.movedPieceType === "r" &&
    squareDistance(end.to, kingSq) === 1
  ) {
    for (const knightSq of attackersOf(board, puzzle.pov, end.to)) {
      const knight = board.get(knightSq);
      if (
        knight?.type === "n" &&
        Math.abs(squareRank(knightSq) - kr) === 2 &&
        Math.abs(squareFile(knightSq) - kf) === 2
      ) {
        return true;
      }
    }
  }
  return false;
}

function bodenOrDoubleBishopMate(puzzle: InternalPuzzle): "bodenMate" | "doubleBishopMate" | null {
  const end = puzzle.mainline[puzzle.mainline.length - 1]!;
  const board = end.boardAfter;
  const kingSq = findKingSquare(board, oppositeColor(puzzle.pov));
  if (!kingSq) return null;
  const bishopSquares = board.findPiece({ type: "b", color: puzzle.pov });
  if (bishopSquares.length < 2) return null;

  const kf = squareFile(kingSq);
  const kr = squareRank(kingSq);
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      const sq = coordsToSquare(kf + df, kr + dr);
      if (!sq) continue;
      if (!attackerPieces(board, puzzle.pov, sq).every((p) => p.type === "b")) {
        return null;
      }
    }
  }
  const b0 = bishopSquares[0]!;
  const b1 = bishopSquares[1]!;
  return (squareFile(b0) < kf) === (squareFile(b1) > kf) ? "bodenMate" : "doubleBishopMate";
}

function dovetailMate(puzzle: InternalPuzzle): boolean {
  const end = puzzle.mainline[puzzle.mainline.length - 1]!;
  const board = end.boardAfter;
  const kingSq = findKingSquare(board, oppositeColor(puzzle.pov));
  if (!kingSq) return false;
  const kf = squareFile(kingSq);
  const kr = squareRank(kingSq);
  if (kf === 0 || kf === 7 || kr === 0 || kr === 7) return false;
  const qSq = end.to;
  if (
    end.movedPieceType !== "q" ||
    squareFile(qSq) === kf ||
    squareRank(qSq) === kr ||
    squareDistance(qSq, kingSq) > 1
  ) {
    return false;
  }
  for (const [df, dr] of KING_DELTAS) {
    const sq = coordsToSquare(kf + df, kr + dr);
    if (!sq || sq === qSq) continue;
    const attackers = attackersOf(board, puzzle.pov, sq);
    if (attackers.length === 1 && attackers[0] === qSq) {
      if (board.get(sq)) {
        return false;
      }
    } else if (attackers.length > 0) {
      return false;
    }
  }
  return true;
}

function advancedPawn(puzzle: InternalPuzzle): boolean {
  return playerNodes(puzzle).some((node) => isVeryAdvancedPawnMove(node));
}

function doubleCheck(puzzle: InternalPuzzle): boolean {
  return playerNodes(puzzle).some((node) => checkersOf(node.boardAfter).length > 1);
}

function sacrifice(puzzle: InternalPuzzle): boolean {
  const diffs = puzzle.mainline.map((node) => materialDiff(node.boardAfter, puzzle.pov));
  const initial = diffs[0]!;
  const oppHadLaterPromotion = opponentNodes(puzzle)
    .slice(1)
    .some((node) => Boolean(node.promotion));

  for (let i = 3; i < diffs.length; i += 2) {
    if (diffs[i]! - initial <= -2) {
      return !oppHadLaterPromotion;
    }
  }
  return false;
}

function xRay(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    if (!node.isCapture) continue;
    const prevOpNode = puzzle.mainline[node.index - 1];
    const prevPlNode = puzzle.mainline[node.index - 2];
    if (!prevOpNode || !prevPlNode) continue;
    if (prevOpNode.to !== node.to || prevOpNode.movedPieceType === "k") continue;
    if (prevPlNode.to !== prevOpNode.to) continue;
    if (squaresBetween(node.from, node.to).has(prevOpNode.from)) {
      return true;
    }
  }
  return false;
}

function fork(puzzle: InternalPuzzle): boolean {
  const pNodes = playerNodes(puzzle);
  for (const node of pNodes.slice(0, -1)) {
    if (node.movedPieceType === "k") continue;
    const board = node.boardAfter;
    if (isInBadSpot(board, node.to)) continue;
    const enemy = oppositeColor(puzzle.pov);
    const enemyAttackersOfForker = new Set(attackersOf(board, enemy, node.to));
    let targets = 0;
    for (const { piece, square } of attackedOpponentSquares(board, node.to, puzzle.pov)) {
      if (piece.type === "p") continue;
      if (
        KING_VALUES[piece.type] > KING_VALUES[node.movedPieceType] ||
        (isHanging(board, piece, square) && !enemyAttackersOfForker.has(square))
      ) {
        targets += 1;
      }
    }
    if (targets > 1) {
      return true;
    }
  }
  return false;
}

function hangingPiece(puzzle: InternalPuzzle): boolean {
  if (puzzle.mainline.length < 2) return false;
  const setupNode = puzzle.mainline[0]!;
  const firstPlayerNode = puzzle.mainline[1]!;
  const to = firstPlayerNode.to;
  const captured = setupNode.boardAfter.get(to);
  if (setupNode.boardAfter.isCheck() && (!captured || captured.type === "p")) {
    return false;
  }
  if (captured && captured.type !== "p") {
    if (isHanging(setupNode.boardAfter, captured, to)) {
      const opCapture = puzzle.initialBoard.get(setupNode.to);
      if (
        opCapture &&
        opCapture.type !== "k" &&
        captured.type !== "k" &&
        PIECE_VALUES[opCapture.type] >= PIECE_VALUES[captured.type] &&
        setupNode.to === to
      ) {
        return false;
      }
      if (puzzle.mainline.length < 4) {
        return true;
      }
      if (
        materialDiff(puzzle.mainline[3]!.boardAfter, puzzle.pov) >=
        materialDiff(firstPlayerNode.boardAfter, puzzle.pov)
      ) {
        return true;
      }
    }
  }
  return false;
}

function trappedPiece(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    let square = node.to;
    const captured = node.boardBefore.get(square);
    if (captured && captured.type !== "p") {
      const prev = puzzle.mainline[node.index - 1];
      if (!prev) continue;
      if (prev.to === square) {
        square = prev.from;
      }
      if (isTrapped(prev.boardBefore, square)) {
        return true;
      }
    }
  }
  return false;
}

function discoveredCheck(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle)) {
    const checkers = checkersOf(node.boardAfter);
    if (checkers.length > 0 && !checkers.includes(node.to)) {
      return true;
    }
  }
  return false;
}

function discoveredAttack(puzzle: InternalPuzzle): boolean {
  if (discoveredCheck(puzzle)) {
    return true;
  }
  for (const node of playerNodes(puzzle).slice(1)) {
    if (!node.isCapture) continue;
    const between = squaresBetween(node.from, node.to);
    const parent = puzzle.mainline[node.index - 1];
    const prev = puzzle.mainline[node.index - 2];
    if (!parent || !prev) continue;
    if (parent.to === node.to) {
      return false;
    }
    if (
      between.has(prev.from) &&
      node.to !== prev.to &&
      node.from !== prev.to &&
      !prev.isCastling
    ) {
      return true;
    }
  }
  return false;
}

function quietMove(puzzle: InternalPuzzle): boolean {
  const lastIndex = puzzle.mainline.length - 1;
  for (const node of puzzle.mainline) {
    if (
      node.turnAfter !== puzzle.pov &&
      node.index !== lastIndex &&
      !node.boardAfter.isCheck() &&
      !node.boardBefore.isCheck() &&
      !node.isCapture &&
      attackedOpponentSquares(node.boardAfter, node.to, puzzle.pov).length === 0 &&
      !isAdvancedPawnMove(node) &&
      node.movedPieceType !== "k"
    ) {
      return true;
    }
  }
  return false;
}

function defensiveMove(puzzle: InternalPuzzle): boolean {
  if (puzzle.mainline.length < 2 || puzzle.mainline.length % 2 !== 0) {
    return false;
  }
  const prevNode = puzzle.mainline[puzzle.mainline.length - 2]!;
  if (prevNode.boardAfter.moves().length < 3) {
    return false;
  }
  const node = puzzle.mainline[puzzle.mainline.length - 1]!;
  if (node.boardAfter.isCheck() || node.isCapture) {
    return false;
  }
  if (attackedOpponentSquares(node.boardAfter, node.to, puzzle.pov).length > 0) {
    return false;
  }
  return !isAdvancedPawnMove(node);
}

function checkEscape(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle)) {
    if (node.boardAfter.isCheck() || node.isCapture) {
      return false;
    }
    if (node.boardBefore.moves().length < 3) {
      return false;
    }
    if (node.boardBefore.isCheck()) {
      return true;
    }
  }
  return false;
}

function attraction(puzzle: InternalPuzzle): boolean {
  for (let i = 1; i < puzzle.mainline.length; i += 1) {
    const node = puzzle.mainline[i]!;
    if (node.turnAfter === puzzle.pov) continue;
    const firstMoveTo = node.to;
    const opponentReply = puzzle.mainline[i + 1];
    if (opponentReply && opponentReply.to === firstMoveTo) {
      const attractedPiece = opponentReply.movedPieceType;
      if (attractedPiece === "k" || attractedPiece === "q" || attractedPiece === "r") {
        const attractedToSquare = opponentReply.to;
        const nextNode = puzzle.mainline[i + 2];
        if (nextNode) {
          const attackers = attackersOf(nextNode.boardAfter, puzzle.pov, attractedToSquare);
          if (attackers.includes(nextNode.to)) {
            if (attractedPiece === "k") {
              return true;
            }
            const n3 = puzzle.mainline[i + 4];
            if (n3 && n3.to === attractedToSquare) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

/**
 * Deflection detector with PR #27 bugfix: compares piece values (`KING_VALUES`/`PIECE_VALUES`)
 * rather than raw piece-type enums.
 */
function deflection(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    const capturedPiece = node.boardBefore.get(node.to);
    if (!capturedPiece && !node.promotion) continue;

    const capturingPiece = node.movedPieceType;
    if (capturedPiece && KING_VALUES[capturedPiece.type] > KING_VALUES[capturingPiece]) {
      continue;
    }

    const square = node.to;
    const prevOpNode = puzzle.mainline[node.index - 1];
    const grandpa = puzzle.mainline[node.index - 2];
    if (!prevOpNode || !grandpa) continue;

    const prevPlayerCapture = grandpa.boardBefore.get(grandpa.to);
    const prevCaptureAllowsDeflection =
      !prevPlayerCapture ||
      (prevPlayerCapture.type !== "k" &&
        PIECE_VALUES[prevPlayerCapture.type] < KING_VALUES[grandpa.movedPieceType]);

    const prevOpAttacksBefore = attacksFrom(grandpa.boardAfter, prevOpNode.from);
    const prevOpAttacksAfter = attacksFrom(prevOpNode.boardAfter, prevOpNode.to);

    if (
      prevCaptureAllowsDeflection &&
      square !== prevOpNode.to &&
      square !== grandpa.to &&
      (prevOpNode.to === grandpa.to || grandpa.boardAfter.isCheck()) &&
      (prevOpAttacksBefore.has(square) ||
        (Boolean(node.promotion) &&
          squareFile(node.to) === squareFile(prevOpNode.from) &&
          prevOpAttacksBefore.has(node.from))) &&
      !prevOpAttacksAfter.has(square)
    ) {
      return true;
    }
  }
  return false;
}

function exposedKing(puzzle: InternalPuzzle): boolean {
  const board = puzzle.mainline[0]!.boardAfter;
  const enemy = oppositeColor(puzzle.pov);
  const kingSq = findKingSquare(board, enemy);
  if (!kingSq) return false;

  const kf = squareFile(kingSq);
  const kr = squareRank(kingSq);
  // Relative rank of enemy king from attacker's POV (0..7)
  const relRank = puzzle.pov === "w" ? kr : 7 - kr;
  if (relRank < 5) {
    return false;
  }

  // Forward direction toward enemy king's pawn shield
  const shieldStep = puzzle.pov === "w" ? -1 : 1;
  const shieldSquares: Square[] = [];
  const front = coordsToSquare(kf, kr + shieldStep);
  if (front) shieldSquares.push(front);
  if (kf > 0) {
    const side = coordsToSquare(kf - 1, kr);
    const diag = coordsToSquare(kf - 1, kr + shieldStep);
    if (side) shieldSquares.push(side);
    if (diag) shieldSquares.push(diag);
  }
  if (kf < 7) {
    const side = coordsToSquare(kf + 1, kr);
    const diag = coordsToSquare(kf + 1, kr + shieldStep);
    if (side) shieldSquares.push(side);
    if (diag) shieldSquares.push(diag);
  }

  for (const sq of shieldSquares) {
    const piece = board.get(sq);
    if (piece && piece.type === "p" && piece.color === enemy) {
      return false;
    }
  }

  const middlePlayerNodes = playerNodes(puzzle).slice(1, -1);
  return middlePlayerNodes.some((node) => node.boardAfter.isCheck());
}

function skewer(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    const prev = puzzle.mainline[node.index - 1];
    if (!prev) continue;
    const capture = prev.boardAfter.get(node.to);
    if (capture && RAY_PIECE_TYPES.has(node.movedPieceType) && !node.boardAfter.isCheckmate()) {
      const between = squaresBetween(node.from, node.to);
      if (prev.to === node.to || !between.has(prev.from)) {
        continue;
      }
      if (
        KING_VALUES[prev.movedPieceType] > KING_VALUES[capture.type] &&
        isInBadSpot(prev.boardAfter, node.to)
      ) {
        return true;
      }
    }
  }
  return false;
}

function selfInterference(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    const prevOpNode = puzzle.mainline[node.index - 1];
    const grandpa = puzzle.mainline[node.index - 2];
    if (!prevOpNode || !grandpa) continue;
    const prevBoard = prevOpNode.boardAfter;
    const square = node.to;
    const capture = prevBoard.get(square);
    if (capture && isHanging(prevBoard, capture, square)) {
      const initBoard = grandpa.boardAfter;
      const defenders = attackersOf(initBoard, capture.color, square);
      for (const defenderSq of defenders) {
        const defenderPiece = initBoard.get(defenderSq);
        if (
          defenderPiece &&
          RAY_PIECE_TYPES.has(defenderPiece.type) &&
          squaresBetween(square, defenderSq).has(prevOpNode.to)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function interference(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    const prevOpNode = puzzle.mainline[node.index - 1];
    const interfering = puzzle.mainline[node.index - 2];
    if (!prevOpNode || !interfering) continue;
    const prevBoard = prevOpNode.boardAfter;
    const square = node.to;
    const capture = prevBoard.get(square);
    if (capture && square !== prevOpNode.to && isHanging(prevBoard, capture, square)) {
      const initBoard = interfering.boardBefore;
      const defenders = attackersOf(initBoard, capture.color, square);
      for (const defenderSq of defenders) {
        const defenderPiece = initBoard.get(defenderSq);
        if (
          defenderPiece &&
          RAY_PIECE_TYPES.has(defenderPiece.type) &&
          squaresBetween(square, defenderSq).has(interfering.to)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function intermezzo(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    if (!node.isCapture) continue;
    const captureSquare = node.to;
    const opNode = puzzle.mainline[node.index - 1];
    const prevPovNode = puzzle.mainline[node.index - 2];
    const prevOpNode = puzzle.mainline[node.index - 3];
    if (!opNode || !prevPovNode || !prevOpNode) continue;

    const enemyAttackers = attackersOf(prevPovNode.boardAfter, oppositeColor(puzzle.pov), captureSquare);
    if (!enemyAttackers.includes(opNode.from) && prevPovNode.to !== captureSquare) {
      if (prevOpNode.to === captureSquare && prevOpNode.isCapture) {
        const testBoard = new Chess(prevOpNode.fenAfter);
        if (tryPlayUci(testBoard, node.uci) !== null) {
          return true;
        }
      }
    }
  }
  return false;
}

function pinPreventsAttack(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle)) {
    const board = node.boardAfter;
    for (const piece of getBoardPieces(board)) {
      if (piece.color === puzzle.pov || piece.type === "k") continue;
      const pinDir = pinRay(board, piece.color, piece.square);
      if (!pinDir) continue;
      for (const attackSq of attacksFrom(board, piece.square)) {
        const attacked = board.get(attackSq);
        if (
          attacked &&
          attacked.color === puzzle.pov &&
          attacked.type !== "k" &&
          !pinDir.has(attackSq) &&
          (PIECE_VALUES[attacked.type] > PIECE_VALUES[piece.type] ||
            isHanging(board, attacked, attackSq))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function pinPreventsEscape(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle)) {
    const board = node.boardAfter;
    const enemy = oppositeColor(puzzle.pov);
    for (const pinnedPiece of getBoardPieces(board)) {
      if (pinnedPiece.color === puzzle.pov || pinnedPiece.type === "k") continue;
      const pinDir = pinRay(board, pinnedPiece.color, pinnedPiece.square);
      if (!pinDir) continue;
      for (const attackerSq of attackersOf(board, puzzle.pov, pinnedPiece.square)) {
        if (!pinDir.has(attackerSq)) continue;
        const attacker = board.get(attackerSq);
        if (!attacker || attacker.type === "k") continue;
        if (PIECE_VALUES[pinnedPiece.type] > PIECE_VALUES[attacker.type]) {
          return true;
        }
        if (
          isHanging(board, pinnedPiece, pinnedPiece.square) &&
          !attackersOf(board, enemy, attackerSq).includes(pinnedPiece.square) &&
          hasPseudoLegalMoveOutsidePin(board, pinnedPiece.square, pinDir)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function attackingF2F7(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle)) {
    const square = node.to;
    if (node.boardBefore.get(square) && (square === "f2" || square === "f7")) {
      const kingSq: Square = square === "f7" ? "e8" : "e1";
      const king = node.boardAfter.get(kingSq);
      return king !== undefined && king.type === "k" && king.color !== puzzle.pov;
    }
  }
  return false;
}

function sideAttack(
  puzzle: InternalPuzzle,
  cornerFile: number,
  kingFiles: readonly number[],
  minPieces: number
): boolean {
  const backRank = puzzle.pov === "w" ? 7 : 0;
  const initBoard = puzzle.mainline[0]!.boardAfter;
  const kingSq = findKingSquare(initBoard, oppositeColor(puzzle.pov));
  const pNodes = playerNodes(puzzle);
  if (
    !kingSq ||
    squareRank(kingSq) !== backRank ||
    !kingFiles.includes(squareFile(kingSq)) ||
    getBoardPieces(initBoard).length < minPieces ||
    !pNodes.some((node) => node.boardAfter.isCheck())
  ) {
    return false;
  }
  const corner = coordsToSquare(cornerFile, backRank)!;
  let score = 0;
  for (const node of pNodes) {
    const cornerDist = squareDistance(corner, node.to);
    if (node.boardAfter.isCheck()) score += 1;
    if (node.isCapture && cornerDist <= 3) score += 1;
    else if (cornerDist >= 5) score -= 1;
  }
  return score >= 2;
}

function clearance(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    const board = node.boardAfter;
    if (!node.boardBefore.get(node.to)) {
      const piece = board.get(node.to);
      if (piece && RAY_PIECE_TYPES.has(piece.type)) {
        const parent = puzzle.mainline[node.index - 1];
        const prev = puzzle.mainline[node.index - 2];
        if (!parent || !prev) continue;
        if (
          !prev.promotion &&
          prev.to !== node.from &&
          prev.to !== node.to &&
          !parent.boardAfter.isCheck() &&
          (!board.isCheck() || parent.movedPieceType !== "k")
        ) {
          if (prev.from === node.to || squaresBetween(node.from, node.to).has(prev.from)) {
            if (!prev.boardBefore.get(prev.to) || isInBadSpot(prev.boardAfter, prev.to)) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

function enPassant(puzzle: InternalPuzzle): boolean {
  return playerNodes(puzzle).some((node) => node.isEnPassant);
}

function castling(puzzle: InternalPuzzle): boolean {
  return playerNodes(puzzle).some((node) => node.isCastling);
}

function promotion(puzzle: InternalPuzzle): boolean {
  return playerNodes(puzzle).some((node) => Boolean(node.promotion));
}

function underPromotion(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle)) {
    if (node.boardAfter.isCheckmate()) {
      return node.promotion === "n";
    }
    if (node.promotion && node.promotion !== "q") {
      return true;
    }
  }
  return false;
}

function capturingDefender(puzzle: InternalPuzzle): boolean {
  for (const node of playerNodes(puzzle).slice(1)) {
    const board = node.boardAfter;
    const capture = node.boardBefore.get(node.to);
    const parent = puzzle.mainline[node.index - 1];
    const prev = puzzle.mainline[node.index - 2];
    if (!parent || !prev) continue;
    const validCapture =
      capture !== undefined &&
      capture.type !== "k" &&
      node.movedPieceType !== "k" &&
      PIECE_VALUES[capture.type] <= PIECE_VALUES[node.movedPieceType] &&
      isHanging(node.boardBefore, capture, node.to) &&
      parent.to !== node.to;

    if (board.isCheckmate() || validCapture) {
      if (!prev.boardAfter.isCheck() && prev.to !== node.from) {
        const initBoard = prev.boardBefore;
        const defenderSq = prev.to;
        const defender = initBoard.get(defenderSq);
        if (
          defender &&
          attackersOf(initBoard, defender.color, node.to).includes(defenderSq) &&
          !initBoard.isCheck()
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function pieceEndgame(puzzle: InternalPuzzle, pieceType: PieceSymbol): boolean {
  if (puzzle.mainline.length < 2) return false;
  for (const board of [puzzle.mainline[0]!.boardAfter, puzzle.mainline[1]!.boardAfter]) {
    const pieces = getBoardPieces(board);
    if (!pieces.some((p) => p.type === pieceType)) {
      return false;
    }
    if (!pieces.every((p) => p.type === "k" || p.type === "p" || p.type === pieceType)) {
      return false;
    }
  }
  return true;
}

function queenRookEndgame(puzzle: InternalPuzzle): boolean {
  if (puzzle.mainline.length < 2) return false;
  const checkBoard = (board: Chess): boolean => {
    const pieces = getBoardPieces(board);
    return (
      pieces.filter((p) => p.type === "q").length === 1 &&
      pieces.some((p) => p.type === "r") &&
      pieces.every((p) => p.type === "q" || p.type === "r" || p.type === "p" || p.type === "k")
    );
  };
  return checkBoard(puzzle.mainline[0]!.boardAfter) && checkBoard(puzzle.mainline[1]!.boardAfter);
}

export function detectLengthTag(moveCount: number): PuzzleLengthTag {
  if (moveCount <= 2) return "oneMove";
  if (moveCount <= 4) return "short";
  if (moveCount >= 8) return "veryLong";
  return "long";
}

export function detectPhaseTag(fen: string, ply?: number): PuzzlePhaseTag {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return "middlegame";
  }

  const pieces = getBoardPieces(board);
  const majorsAndMinors = pieces.filter((p) => p.type !== "k" && p.type !== "p").length;
  if (majorsAndMinors <= 6) {
    return "endgame";
  }

  const effectivePly = ply ?? (board.moveNumber() - 1) * 2 + (board.turn() === "b" ? 1 : 0);
  if (effectivePly <= 20 && majorsAndMinors >= 11) {
    return "opening";
  }
  return "middlegame";
}

/**
 * Pure tactical motif tagger ported from `cook.py` + `util.py` (with PR #27 fixes).
 * Never mutates any caller board instances.
 */
export function tagPuzzle(input: TagPuzzleInput): TagPuzzleResult {
  const puzzle = buildInternalPuzzle(input);
  const phaseFen = puzzle?.mainline[0]?.fenAfter ?? input.initialFen;
  const phaseTag = detectPhaseTag(phaseFen, input.ply);
  const lengthTag = detectLengthTag(puzzle?.mainline.length ?? input.solutionMoves.length);

  if (!puzzle) {
    return {
      allTags: [lengthTag, phaseTag],
      themes: [],
      curatedThemes: [],
      lengthTag,
      phaseTag
    };
  }

  const tags: string[] = [];

  const mateTag = mateIn(puzzle);
  if (mateTag) {
    tags.push(mateTag, "mate");
    if (smotheredMate(puzzle)) {
      tags.push("smotheredMate");
    } else if (backRankMate(puzzle)) {
      tags.push("backRankMate");
    } else if (anastasiaMate(puzzle)) {
      tags.push("anastasiaMate");
    } else if (hookMate(puzzle)) {
      tags.push("hookMate");
    } else if (arabianMate(puzzle)) {
      tags.push("arabianMate");
    } else {
      const bishopMate = bodenOrDoubleBishopMate(puzzle);
      if (bishopMate) {
        tags.push(bishopMate);
      } else if (dovetailMate(puzzle)) {
        tags.push("dovetailMate");
      }
    }
  } else if (puzzle.cp > 600) {
    tags.push("crushing");
  } else if (puzzle.cp > 200) {
    tags.push("advantage");
  } else {
    tags.push("equality");
  }

  if (attraction(puzzle)) tags.push("attraction");
  if (deflection(puzzle)) tags.push("deflection");
  if (advancedPawn(puzzle)) tags.push("advancedPawn");
  if (doubleCheck(puzzle)) tags.push("doubleCheck");
  if (quietMove(puzzle)) tags.push("quietMove");
  if (defensiveMove(puzzle) || checkEscape(puzzle)) tags.push("defensiveMove");
  if (sacrifice(puzzle)) tags.push("sacrifice");
  if (xRay(puzzle)) tags.push("xRayAttack");
  if (fork(puzzle)) tags.push("fork");
  if (hangingPiece(puzzle)) tags.push("hangingPiece");
  if (trappedPiece(puzzle)) tags.push("trappedPiece");
  if (discoveredAttack(puzzle)) tags.push("discoveredAttack");
  if (exposedKing(puzzle)) tags.push("exposedKing");
  if (skewer(puzzle)) tags.push("skewer");
  if (selfInterference(puzzle) || interference(puzzle)) tags.push("interference");
  if (intermezzo(puzzle)) tags.push("intermezzo");
  if (pinPreventsAttack(puzzle) || pinPreventsEscape(puzzle)) tags.push("pin");
  if (attackingF2F7(puzzle)) tags.push("attackingF2F7");
  if (clearance(puzzle)) tags.push("clearance");
  if (enPassant(puzzle)) tags.push("enPassant");
  if (castling(puzzle)) tags.push("castling");
  if (promotion(puzzle)) tags.push("promotion");
  if (underPromotion(puzzle)) tags.push("underPromotion");
  if (capturingDefender(puzzle)) tags.push("capturingDefender");

  if (pieceEndgame(puzzle, "p")) {
    tags.push("pawnEndgame");
  } else if (pieceEndgame(puzzle, "q")) {
    tags.push("queenEndgame");
  } else if (pieceEndgame(puzzle, "r")) {
    tags.push("rookEndgame");
  } else if (pieceEndgame(puzzle, "b")) {
    tags.push("bishopEndgame");
  } else if (pieceEndgame(puzzle, "n")) {
    tags.push("knightEndgame");
  } else if (queenRookEndgame(puzzle)) {
    tags.push("queenRookEndgame");
  }

  if (!tags.includes("backRankMate") && !tags.includes("fork")) {
    if (sideAttack(puzzle, 7, [6, 7], 20)) {
      tags.push("kingsideAttack");
    } else if (sideAttack(puzzle, 0, [0, 1, 2], 18)) {
      tags.push("queensideAttack");
    }
  }

  const effectivePhase: PuzzlePhaseTag =
    tags.some((t) => t.endsWith("Endgame")) ? "endgame" : phaseTag;

  const uniqueThemes = dedupeInOrder(tags);
  const curated = SERVER_CURATED_THEMES.filter((theme) => uniqueThemes.includes(theme));
  const allTags = dedupeInOrder([...uniqueThemes, lengthTag, effectivePhase]);

  return {
    allTags,
    themes: uniqueThemes,
    curatedThemes: curated,
    lengthTag,
    phaseTag: effectivePhase
  };
}

/**
 * Enriches 1-move blunder tags using a longer top-3 PV (`pvMoves`) while
 * strictly preserving the original `oneMove` length tag and never adding false
 * mate tags when the base puzzle does not end in mate (PR #27 fix).
 */
export function tagPuzzleWithPvEnrichment(input: EnrichTagsInput): TagPuzzleResult {
  const base = tagPuzzle(input);
  if (!input.pvMoves || input.pvMoves.length <= input.solutionMoves.length) {
    return base;
  }

  const pvResult = tagPuzzle({
    initialFen: input.initialFen,
    solutionMoves: input.pvMoves,
    cp: input.cp,
    ...(input.ply !== undefined ? { ply: input.ply } : {})
  });

  const baseHasMate = base.themes.includes("mate");
  const mergedThemes: string[] = [];
  const seen = new Set<string>();

  for (const tag of pvResult.themes) {
    if (LENGTH_TAGS.has(tag)) continue;
    if (!baseHasMate && MATE_TAGS.has(tag)) continue;
    if (!seen.has(tag)) {
      seen.add(tag);
      mergedThemes.push(tag);
    }
  }
  for (const tag of base.themes) {
    if (LENGTH_TAGS.has(tag)) continue;
    if (!seen.has(tag)) {
      seen.add(tag);
      mergedThemes.push(tag);
    }
  }

  const curated = SERVER_CURATED_THEMES.filter((theme) => seen.has(theme));
  const allTags = dedupeInOrder([...mergedThemes, base.lengthTag, base.phaseTag]);

  return {
    allTags,
    themes: mergedThemes,
    curatedThemes: curated,
    lengthTag: base.lengthTag,
    phaseTag: base.phaseTag
  };
}

/**
 * Optional engine-backed zugzwang detector ported from `zugzwang.py`.
 */
export async function checkZugzwang(params: {
  engine: PuzzleExtractionEngine;
  initialFen: string;
  solutionMoves: readonly string[];
  limit?: SearchLimitConfig;
  signal?: AbortSignal;
}): Promise<boolean> {
  const puzzle = buildInternalPuzzle({
    initialFen: params.initialFen,
    solutionMoves: params.solutionMoves,
    cp: 0
  });
  if (!puzzle) {
    return false;
  }
  const limit = params.limit ?? { depth: 18, nodes: 500_000 };
  const defender = oppositeColor(puzzle.pov);

  for (const node of playerNodes(puzzle)) {
    const board = node.boardAfter;
    if (board.isCheck() || board.isGameOver()) {
      continue;
    }
    if (board.moves().length > 15) {
      continue;
    }

    const normalLines = await params.engine.analyze({
      fen: node.fenAfter,
      ...limit,
      multiPv: 1,
      priority: "batch",
      ...(params.signal !== undefined ? { signal: params.signal } : {})
    });
    const normalLine = normalLines[0];
    if (!normalLine) continue;

    const nullFen = buildNullMoveFen(node.fenAfter);
    if (!nullFen) continue;

    const revLines = await params.engine.analyze({
      fen: nullFen,
      ...limit,
      multiPv: 1,
      priority: "batch",
      ...(params.signal !== undefined ? { signal: params.signal } : {})
    });
    const revLine = revLines[0];
    if (!revLine) continue;

    const normalScore = scoreForPov(normalLine.score, defender);
    const revScore = scoreForPov(revLine.score, defender);
    if (winChances(normalScore) < winChances(revScore) - 0.3) {
      return true;
    }
  }
  return false;
}

function buildNullMoveFen(fen: string): string | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) {
    return null;
  }
  const nextTurn = parts[1] === "w" ? "b" : "w";
  const nextParts = [
    parts[0]!,
    nextTurn,
    parts[2]!,
    "-",
    parts[4] ?? "0",
    parts[5] ?? "1"
  ];
  const candidate = nextParts.join(" ");
  try {
    new Chess(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function dedupeInOrder(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export function isCuratedTheme(theme: string): boolean {
  return CURATED_THEME_SET.has(theme);
}
