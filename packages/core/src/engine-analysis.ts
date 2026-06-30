import { Chess } from "chess.js";
import type { CurrentPuzzleState, Puzzle } from "./types.ts";
import { currentExpectedMove } from "./puzzle-session.ts";

export type AnalysisScore =
  | {
      kind: "cp";
      sideToMoveCentipawns: number;
      whiteCentipawns: number;
    }
  | {
      kind: "mate";
      sideToMoveMate: number;
      whiteMate: number;
    };

export interface EngineAnalysisLine {
  move: string;
  pv: string[];
  multipv: number;
  depth: number;
  score: AnalysisScore;
}

export interface ReviewAnalysisLine {
  move: string;
  san: string;
  label: "Top move" | "Candidate" | "Current position";
  score: string;
}

export interface UciEngineTransport {
  start(): Promise<void>;
  send(command: string): void;
  onLine(listener: (line: string) => void): () => void;
  terminate(): void;
}

export interface UciAnalysisOptions {
  depth?: number;
  initialize?: boolean;
  shallowDelayMs?: number;
  shallowDepth?: number;
  multiPv?: number;
  newGame?: boolean;
  onUpdate?: (lines: EngineAnalysisLine[]) => void;
  timeoutMs?: number;
}

export async function analyzeFenWithUciEngine(
  transport: UciEngineTransport,
  fen: string,
  options: UciAnalysisOptions = {}
): Promise<EngineAnalysisLine[]> {
  const depth = options.depth ?? 20;
  const initialize = options.initialize ?? true;
  const multiPv = options.multiPv ?? 3;
  const newGame = options.newGame ?? initialize;
  const shallowDepth = options.shallowDepth ?? (depth > 8 ? 8 : 0);
  const useShallowThenFull = shallowDepth > 0 && shallowDepth < depth;
  const shallowDelayMs = options.shallowDelayMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 30000;
  const byMultiPv = new Map<number, EngineAnalysisLine>();

  await transport.start();

  return await new Promise((resolve, reject) => {
    let done = false;
    let deepSearchStarted = !useShallowThenFull;
    const cleanup = transport.onLine((line) => {
      const parsed = parseStockfishInfoLine(line, fen);
      if (parsed) {
        byMultiPv.set(parsed.multipv, parsed);
        emitUpdate();
        return;
      }

      if (line.startsWith("bestmove ")) {
        if (!deepSearchStarted) {
          return;
        }
        finish();
      }
    });
    const timer = setTimeout(() => {
      finish();
    }, timeoutMs);
    const shallowTimer = useShallowThenFull
      ? setTimeout(() => {
          if (done) {
            return;
          }
          try {
            deepSearchStarted = true;
            transport.send("stop");
            transport.send(`go depth ${depth}`);
          } catch (error) {
            fail(error);
          }
        }, shallowDelayMs)
      : null;

    function currentLines(): EngineAnalysisLine[] {
      return sortEngineLines([...byMultiPv.values()]).slice(0, multiPv);
    }

    function emitUpdate(): void {
      options.onUpdate?.(currentLines());
    }

    function finish(): void {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      if (shallowTimer) {
        clearTimeout(shallowTimer);
      }
      cleanup();
      resolve(currentLines());
    }

    function fail(error: unknown): void {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      if (shallowTimer) {
        clearTimeout(shallowTimer);
      }
      cleanup();
      reject(error);
    }

    try {
      if (initialize) {
        transport.send("uci");
        transport.send("isready");
        transport.send(`setoption name MultiPV value ${multiPv}`);
      }
      if (newGame) {
        transport.send("ucinewgame");
      }
      transport.send("stop");
      transport.send(`position fen ${fen}`);
      transport.send(`go depth ${useShallowThenFull ? shallowDepth : depth}`);
    } catch (error) {
      fail(error);
    }
  });
}

export function parseStockfishInfoLine(line: string, fen: string): EngineAnalysisLine | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) {
    return null;
  }

  const depthMatch = /\bdepth\s+(\d+)/.exec(line);
  const scoreMatch = /\bscore\s+(cp|mate)\s+(-?\d+)/.exec(line);
  const pvMatch = /\bpv\s+(.+)$/.exec(line);
  if (!depthMatch || !scoreMatch || !pvMatch) {
    return null;
  }

  const pv = pvMatch[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
  const move = pv[0];
  if (!move) {
    return null;
  }

  const multipvMatch = /\bmultipv\s+(\d+)/.exec(line);
  const multipv = multipvMatch ? Number(multipvMatch[1]) : 1;
  const depth = Number(depthMatch[1]);
  const rawScore = Number(scoreMatch[2]);
  const activeColor = sideToMove(fen);
  const score: AnalysisScore =
    scoreMatch[1] === "cp"
      ? {
          kind: "cp",
          sideToMoveCentipawns: rawScore,
          whiteCentipawns: activeColor === "w" ? rawScore : -rawScore
        }
      : {
          kind: "mate",
          sideToMoveMate: rawScore,
          whiteMate: activeColor === "w" ? rawScore : -rawScore
        };

  return {
    move: normalizeUci(move),
    pv: pv.map(normalizeUci),
    multipv,
    depth,
    score
  };
}

export function buildPuzzleGuidedAnalysisLines({
  fen,
  puzzle,
  currentPuzzle,
  engineLines = [],
  includeUnscoredLegalMoves = true
}: {
  fen: string;
  puzzle: Puzzle;
  currentPuzzle?: CurrentPuzzleState;
  engineLines?: EngineAnalysisLine[];
  includeUnscoredLegalMoves?: boolean;
}): ReviewAnalysisLine[] {
  const legalMoves = legalUciMoves(fen);
  const legalMoveSet = new Set(legalMoves);
  const guidedMove = puzzleGuidedMoveForFen(puzzle, fen, currentPuzzle);
  const linesByMove = new Map<string, { move: string; score?: AnalysisScore; sortValue: number; guided: boolean }>();

  for (const line of sortEngineLines(engineLines)) {
    const move = normalizeUci(line.move);
    if (!legalMoveSet.has(move)) {
      continue;
    }
    linesByMove.set(move, {
      move,
      score: line.score,
      sortValue: scoreSortValue(line.score),
      guided: guidedMove === move
    });
  }

  if (guidedMove && legalMoveSet.has(guidedMove)) {
    const existing = linesByMove.get(guidedMove);
    const score = existing?.score ?? puzzleScoreForMove(fen, puzzle, guidedMove);
    linesByMove.set(guidedMove, {
      move: guidedMove,
      ...(score ? { score } : {}),
      sortValue: Math.max(existing?.sortValue ?? Number.NEGATIVE_INFINITY, guidedSortValue(fen, puzzle, guidedMove, score)),
      guided: true
    });
  }

  if (includeUnscoredLegalMoves && linesByMove.size < 4) {
    for (const move of legalMoves) {
      if (linesByMove.has(move)) {
        continue;
      }
      const score = checkmateScoreForMove(fen, move);
      linesByMove.set(move, {
        move,
        ...(score ? { score } : {}),
        sortValue: score ? scoreSortValue(score) : Number.NEGATIVE_INFINITY,
        guided: false
      });
      if (linesByMove.size >= 4) {
        break;
      }
    }
  }

  return [...linesByMove.values()]
    .sort((a, b) => {
      if (a.guided !== b.guided) {
        return a.guided ? -1 : 1;
      }
      return b.sortValue - a.sortValue;
    })
    .slice(0, 4)
    .map((line, index) => ({
      move: line.move,
      san: sanForMove(fen, line.move),
      label: index === 0 ? "Top move" : "Candidate",
      score: line.score ? formatSideToMoveScore(line.score) : "eval --"
    }));
}

export function buildArrowDuelCandidateAnalysisLines({
  fen,
  puzzle,
  candidates
}: {
  fen?: string;
  puzzle: Puzzle;
  candidates?: string[];
}): ReviewAnalysisLine[] {
  const positionFen = fen ?? puzzle.initialFen;
  const legalMoveSet = new Set(legalUciMoves(positionFen));
  const bestMove = puzzle.stockfishBestMove ? normalizeUci(puzzle.stockfishBestMove) : undefined;
  const wrongMove = puzzle.solutionMoves[0] ? normalizeUci(puzzle.solutionMoves[0]) : undefined;
  const candidateMoves = candidates ?? [bestMove, wrongMove].filter((move): move is string => Boolean(move));
  const seen = new Set<string>();

  return candidateMoves
    .map(normalizeUci)
    .filter((move) => {
      if (seen.has(move) || !legalMoveSet.has(move)) {
        return false;
      }
      seen.add(move);
      return true;
    })
    .map((move, index) => {
      const score = arrowDuelCandidateScoreForMove(positionFen, puzzle, move);
      return {
        move,
        san: sanForMove(positionFen, move),
        label: move === bestMove || (!bestMove && index === 0) ? "Top move" : "Candidate",
        score: score ? formatSideToMoveScore(score) : "eval --"
      };
    });
}

export function buildCurrentPositionEvaluationLine({
  fen,
  puzzle,
  currentPuzzle,
  engineLines = []
}: {
  fen: string;
  puzzle?: Puzzle;
  currentPuzzle?: CurrentPuzzleState;
  engineLines?: EngineAnalysisLine[];
}): ReviewAnalysisLine {
  const terminal = terminalPositionScore(fen);
  if (terminal) {
    return currentPositionLine(terminal.score, terminal.san);
  }

  const engineLine = sortEngineLines(engineLines)[0];
  if (engineLine) {
    return currentPositionLine(formatSideToMoveScore(engineLine.score), "Current position");
  }

  const forcedMate = forcedMateScoreForLineState(fen, currentPuzzle);
  if (forcedMate) {
    return currentPositionLine(formatSideToMoveScore(forcedMate), "Current position");
  }

  const knownPositionScore = puzzle ? scoreForKnownPuzzlePosition(fen, puzzle) : undefined;
  if (knownPositionScore) {
    return currentPositionLine(formatSideToMoveScore(knownPositionScore), "Current position");
  }

  return currentPositionLine("eval --", "Current position");
}

export function formatSideToMoveScore(score: AnalysisScore): string {
  if (score.kind === "mate") {
    return score.sideToMoveMate > 0 ? `M${Math.abs(score.sideToMoveMate)}` : `-M${Math.abs(score.sideToMoveMate)}`;
  }

  const pawns = score.sideToMoveCentipawns / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

function currentPositionLine(score: string, san: string): ReviewAnalysisLine {
  return {
    move: "",
    san,
    label: "Current position",
    score
  };
}

function terminalPositionScore(fen: string): { score: string; san: string } | undefined {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return {
      score: chess.turn() === "b" ? "1-0" : "0-1",
      san: "Checkmate"
    };
  }
  if (chess.isStalemate()) {
    return {
      score: "1/2-1/2",
      san: "Stalemate"
    };
  }
  if (chess.isDraw()) {
    return {
      score: "1/2-1/2",
      san: "Draw"
    };
  }
  return undefined;
}

function forcedMateScoreForLineState(fen: string, currentPuzzle?: CurrentPuzzleState): AnalysisScore | undefined {
  if (!currentPuzzle || currentPuzzle.kind !== "line" || !samePosition(fen, currentPuzzle.currentFen)) {
    return undefined;
  }
  const remainingMoves = currentPuzzle.puzzle.solutionMoves.slice(currentPuzzle.cursor);
  if (remainingMoves.length === 0) {
    return undefined;
  }
  const finalFen = applyMovesQuietly(fen, remainingMoves);
  if (!finalFen || !new Chess(finalFen).isCheckmate()) {
    return undefined;
  }
  const activeColor = sideToMove(fen);
  const checkmatedColor = sideToMove(finalFen);
  const mateDistance = Math.max(1, Math.ceil(remainingMoves.length / 2));
  const sideToMoveMate = checkmatedColor === activeColor ? -mateDistance : mateDistance;
  return {
    kind: "mate",
    sideToMoveMate,
    whiteMate: activeColor === "w" ? sideToMoveMate : -sideToMoveMate
  };
}

function puzzleGuidedMoveForFen(
  puzzle: Puzzle,
  fen: string,
  currentPuzzle?: CurrentPuzzleState
): string | undefined {
  const activeColor = sideToMove(fen);
  const solverColor = puzzleSolverColor(puzzle);
  if (currentPuzzle) {
    const directMove = currentPuzzle.kind === "line" ? currentExpectedMove(currentPuzzle) : currentPuzzle.correctMove;
    if (activeColor === solverColor && directMove && samePosition(fen, currentPuzzle.currentFen)) {
      return normalizeUci(directMove);
    }
  }

  let cursorFen = puzzle.initialFen;
  for (let cursor = 0; cursor < puzzle.solutionMoves.length; cursor += 1) {
    const nextMove = puzzle.solutionMoves[cursor];
    if (!nextMove) {
      break;
    }
    if (samePosition(fen, cursorFen) && sideToMove(cursorFen) === solverColor) {
      return normalizeUci(nextMove);
    }

    const nextFen = fenAfterMove(cursorFen, nextMove);
    if (!nextFen) {
      break;
    }
    cursorFen = nextFen;
  }

  if (samePosition(fen, puzzle.initialFen) && puzzle.stockfishBestMove) {
    return normalizeUci(puzzle.stockfishBestMove);
  }

  return undefined;
}

function puzzleSolverColor(puzzle: Puzzle): "w" | "b" {
  const firstMove = puzzle.solutionMoves[0];
  const afterFirstMove = firstMove ? fenAfterMove(puzzle.initialFen, firstMove) : null;
  return sideToMove(afterFirstMove ?? puzzle.initialFen);
}

function puzzleScoreForMove(fen: string, puzzle: Puzzle, move: string): AnalysisScore | undefined {
  const checkmate = checkmateScoreForMove(fen, move);
  if (checkmate) {
    return checkmate;
  }

  const score =
    samePosition(fen, puzzle.initialFen)
      ? puzzle.stockfishEval
      : puzzle.stockfishEvalAfterFirstMove;
  if (score === undefined) {
    return undefined;
  }
  return whitePerspectiveScoreForFen(fen, score);
}

function scoreForKnownPuzzlePosition(fen: string, puzzle: Puzzle): AnalysisScore | undefined {
  if (samePosition(fen, puzzle.initialFen) && puzzle.stockfishEval !== undefined) {
    return whitePerspectiveScoreForFen(fen, puzzle.stockfishEval);
  }

  const firstMove = puzzle.solutionMoves[0];
  const afterFirstMove = firstMove ? fenAfterMove(puzzle.initialFen, firstMove) : null;
  if (afterFirstMove && samePosition(fen, afterFirstMove) && puzzle.stockfishEvalAfterFirstMove !== undefined) {
    return whitePerspectiveScoreForFen(fen, puzzle.stockfishEvalAfterFirstMove);
  }

  return undefined;
}

function arrowDuelCandidateScoreForMove(fen: string, puzzle: Puzzle, move: string): AnalysisScore | undefined {
  const checkmate = checkmateScoreForMove(fen, move);
  if (checkmate) {
    return checkmate;
  }

  const bestMove = puzzle.stockfishBestMove ? normalizeUci(puzzle.stockfishBestMove) : undefined;
  const wrongMove = puzzle.solutionMoves[0] ? normalizeUci(puzzle.solutionMoves[0]) : undefined;
  const whiteCentipawns =
    move === bestMove
      ? puzzle.stockfishEval
      : move === wrongMove
        ? puzzle.stockfishEvalAfterFirstMove
        : undefined;
  return whiteCentipawns === undefined ? undefined : whitePerspectiveScoreForFen(fen, whiteCentipawns);
}

function whitePerspectiveScoreForFen(fen: string, whiteCentipawns: number): AnalysisScore {
  if (Math.abs(whiteCentipawns) >= 10000) {
    const whiteMate = whiteCentipawns > 0 ? 1 : -1;
    return {
      kind: "mate",
      sideToMoveMate: sideToMove(fen) === "w" ? whiteMate : -whiteMate,
      whiteMate
    };
  }
  return {
    kind: "cp",
    whiteCentipawns,
    sideToMoveCentipawns: sideToMove(fen) === "w" ? whiteCentipawns : -whiteCentipawns
  };
}

function checkmateScoreForMove(fen: string, move: string): AnalysisScore | undefined {
  const nextFen = fenAfterMove(fen, move);
  if (!nextFen || !new Chess(nextFen).isCheckmate()) {
    return undefined;
  }
  return {
    kind: "mate",
    sideToMoveMate: 1,
    whiteMate: sideToMove(fen) === "w" ? 1 : -1
  };
}

function guidedSortValue(fen: string, puzzle: Puzzle, move: string, score?: AnalysisScore): number {
  if (checkmateScoreForMove(fen, move)) {
    return 1_000_000;
  }
  if (score) {
    return Math.max(scoreSortValue(score), 999_000);
  }
  if (puzzle.stockfishBestMove && normalizeUci(puzzle.stockfishBestMove) === move) {
    return 999_000;
  }
  return 998_000;
}

function sortEngineLines(lines: EngineAnalysisLine[]): EngineAnalysisLine[] {
  return [...lines].sort((a, b) => {
    if (a.multipv !== b.multipv) {
      return a.multipv - b.multipv;
    }
    return scoreSortValue(b.score) - scoreSortValue(a.score);
  });
}

function scoreSortValue(score: AnalysisScore): number {
  if (score.kind === "mate") {
    return score.sideToMoveMate > 0 ? 1_000_000 - Math.abs(score.sideToMoveMate) : -1_000_000 + Math.abs(score.sideToMoveMate);
  }
  return score.sideToMoveCentipawns;
}

function sanForMove(fen: string, move: string): string {
  try {
    const chess = new Chess(fen);
    const normalized = normalizeUci(move);
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    return played?.san ?? move;
  } catch {
    return move;
  }
}

function legalUciMoves(fen: string): string[] {
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: true }).map((move) => normalizeUci(`${move.from}${move.to}${move.promotion ?? ""}`));
  } catch {
    return [];
  }
}

function fenAfterMove(fen: string, move: string): string | null {
  try {
    const chess = new Chess(fen);
    const normalized = normalizeUci(move);
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    return played ? chess.fen() : null;
  } catch {
    return null;
  }
}

function applyMovesQuietly(fen: string, moves: string[]): string | null {
  let currentFen: string | null = fen;
  for (const move of moves) {
    if (!currentFen) {
      return null;
    }
    currentFen = fenAfterMove(currentFen, move);
  }
  return currentFen;
}

function samePosition(leftFen: string, rightFen: string): boolean {
  return positionKey(leftFen) === positionKey(rightFen);
}

function positionKey(fen: string): string {
  return fen.split(/\s+/).slice(0, 4).join(" ");
}

function sideToMove(fen: string): "w" | "b" {
  return fen.split(/\s+/)[1] === "b" ? "b" : "w";
}

function normalizeUci(move: string): string {
  return move.trim().toLowerCase();
}
