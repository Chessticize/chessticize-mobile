import { Chess } from "chess.js";
import type {
  ArrowDuelReview,
  ArrowDuelState,
  Puzzle,
  PuzzleFeedback,
  PuzzleLineState
} from "./types.ts";

export function beginLinePuzzle(puzzle: Puzzle): PuzzleLineState {
  const initial: PuzzleLineState = {
    kind: "line",
    puzzle,
    currentFen: puzzle.initialFen,
    playedMoves: [],
    cursor: 0,
    autoPlayedMoves: [],
    solved: false
  };
  return autoPlayOpponentMoves(initial);
}

export function submitLineMove(state: PuzzleLineState, move: string): {
  state: PuzzleLineState;
  feedback: PuzzleFeedback;
} {
  if (state.solved) {
    throw new Error("Puzzle is already solved");
  }

  const expectedMove = state.puzzle.solutionMoves[state.cursor];
  if (!expectedMove) {
    throw new Error("Puzzle has no expected move at current cursor");
  }

  const submittedMove = normalizeMove(move);
  if (!isLegalMove(state.currentFen, submittedMove)) {
    throw new Error(`Move ${move} is not legal in the current position`);
  }
  if (submittedMove !== normalizeMove(expectedMove) && !isLegalCheckmateMove(state.currentFen, submittedMove)) {
    return {
      state,
      feedback: {
        result: "wrong",
        puzzleSolved: false,
        submittedMove: move,
        expectedMove,
        autoPlayedMoves: [],
        currentFen: state.currentFen
      }
    };
  }

  const played = appendMove(state.currentFen, state.playedMoves, submittedMove);
  const isCheckmate = isCheckmateFen(played.currentFen);
  const advanced: PuzzleLineState = {
    ...state,
    currentFen: played.currentFen,
    playedMoves: played.playedMoves,
    cursor: isCheckmate ? state.puzzle.solutionMoves.length : state.cursor + 1,
    autoPlayedMoves: []
  };
  const afterAuto = isCheckmate ? advanced : autoPlayOpponentMoves(advanced);
  const solved = afterAuto.cursor >= state.puzzle.solutionMoves.length;
  const nextState = { ...afterAuto, solved };

  return {
    state: nextState,
    feedback: {
      result: "correct",
      puzzleSolved: solved,
      submittedMove: move,
      expectedMove,
      autoPlayedMoves: nextState.autoPlayedMoves,
      currentFen: nextState.currentFen
    }
  };
}

export interface BeginArrowDuelPuzzleOptions {
  seed?: string | number;
  candidateOrder?: string[];
}

export function beginArrowDuelPuzzle(puzzle: Puzzle, seedOrOptions: string | number | BeginArrowDuelPuzzleOptions = 0): ArrowDuelState {
  const wrongMove = puzzle.solutionMoves[0];
  const correctMove = puzzle.stockfishBestMove;
  if (!wrongMove) {
    throw new Error(`Puzzle ${puzzle.id} does not have a candidate wrong move`);
  }
  if (!correctMove) {
    throw new Error(`Puzzle ${puzzle.id} does not have a Stockfish best move`);
  }
  if (normalizeMove(correctMove) === normalizeMove(wrongMove)) {
    throw new Error(`Puzzle ${puzzle.id} is not eligible for Arrow Duel`);
  }

  const options = typeof seedOrOptions === "object" ? seedOrOptions : { seed: seedOrOptions };
  const candidates = options.candidateOrder
    ? validateArrowDuelCandidateOrder({
      puzzleId: puzzle.id,
      candidateOrder: options.candidateOrder,
      correctMove,
      wrongMove
    })
    : hashSeed(options.seed ?? 0) % 2 === 0 ? [correctMove, wrongMove] : [wrongMove, correctMove];
  return {
    kind: "arrow_duel",
    puzzle,
    currentFen: puzzle.initialFen,
    candidates,
    correctMove,
    wrongMove,
    solved: false
  };
}

function validateArrowDuelCandidateOrder(input: {
  puzzleId: string;
  candidateOrder: string[];
  correctMove: string;
  wrongMove: string;
}): string[] {
  const normalizedOrder = input.candidateOrder.map(normalizeMove);
  const expected = new Set([normalizeMove(input.correctMove), normalizeMove(input.wrongMove)]);
  if (normalizedOrder.length !== 2 || new Set(normalizedOrder).size !== 2 || normalizedOrder.some((move) => !expected.has(move))) {
    throw new Error(`Stored Arrow Duel candidate order for puzzle ${input.puzzleId} does not match its candidate moves`);
  }
  return input.candidateOrder;
}

export function submitArrowDuelChoice(state: ArrowDuelState, move: string): {
  state: ArrowDuelState;
  feedback: PuzzleFeedback;
} {
  if (state.solved) {
    throw new Error("Puzzle is already solved");
  }
  const isCorrect = normalizeMove(move) === normalizeMove(state.correctMove);
  const isCandidate = state.candidates.some((candidate) => normalizeMove(candidate) === normalizeMove(move));
  const review = buildArrowDuelReview(state, move);

  if (!isCandidate) {
    throw new Error(`Move ${move} is not one of the Arrow Duel candidates`);
  }

  return {
    state: {
      ...state,
      selectedMove: move,
      solved: isCorrect
    },
    feedback: {
      result: isCorrect ? "correct" : "wrong",
      puzzleSolved: isCorrect,
      submittedMove: move,
      expectedMove: state.correctMove,
      autoPlayedMoves: isCorrect ? [] : review.punishmentLine,
      currentFen: state.currentFen,
      review
    }
  };
}

export function buildArrowDuelReview(state: ArrowDuelState, selectedMove: string): ArrowDuelReview {
  const punishmentLine =
    normalizeMove(selectedMove) === normalizeMove(state.wrongMove)
      ? state.puzzle.solutionMoves.slice(0, 2)
      : [];

  return {
    selectedMove,
    punishmentLine,
    arrows: [
      {
        move: state.correctMove,
        role: "correct",
        color: "green",
        selected: normalizeMove(selectedMove) === normalizeMove(state.correctMove)
      },
      {
        move: state.wrongMove,
        role: "wrong",
        color: "red",
        selected: normalizeMove(selectedMove) === normalizeMove(state.wrongMove)
      }
    ]
  };
}

export function currentExpectedMove(state: PuzzleLineState): string | undefined {
  return state.puzzle.solutionMoves[state.cursor];
}

export function applyMovesToFen(initialFen: string, moves: string[]): string {
  let fen = initialFen;
  for (const move of moves) {
    fen = appendMove(fen, [], move).currentFen;
  }
  return fen;
}

function autoPlayOpponentMoves(state: PuzzleLineState): PuzzleLineState {
  let next = { ...state, autoPlayedMoves: [] as string[] };
  while (next.cursor < next.puzzle.solutionMoves.length && isAutoMoveIndex(next.cursor)) {
    const move = next.puzzle.solutionMoves[next.cursor];
    if (!move) {
      break;
    }
    const played = appendMove(next.currentFen, next.playedMoves, move);
    next = {
      ...next,
      currentFen: played.currentFen,
      playedMoves: played.playedMoves,
      cursor: next.cursor + 1,
      autoPlayedMoves: [...next.autoPlayedMoves, move]
    };
  }
  return next;
}

function isAutoMoveIndex(cursor: number): boolean {
  return cursor % 2 === 0;
}

function appendMove(currentFen: string, playedMoves: string[], move: string): {
  currentFen: string;
  playedMoves: string[];
} {
  const chess = new Chess(currentFen);
  const normalizedMove = normalizeMove(move);
  const uciMove: { from: string; to: string; promotion?: string } = {
    from: normalizedMove.slice(0, 2),
    to: normalizedMove.slice(2, 4)
  };
  if (normalizedMove.length > 4) {
    uciMove.promotion = normalizedMove.slice(4, 5);
  }
  const result = chess.move(uciMove);
  if (!result) {
    throw new Error(`Illegal move ${move} from FEN ${currentFen}`);
  }
  return {
    currentFen: chess.fen(),
    playedMoves: [...playedMoves, move]
  };
}

function isLegalCheckmateMove(currentFen: string, move: string): boolean {
  try {
    return isCheckmateFen(appendMove(currentFen, [], move).currentFen);
  } catch {
    return false;
  }
}

function isLegalMove(currentFen: string, move: string): boolean {
  try {
    const chess = new Chess(currentFen);
    const normalizedMove = normalizeMove(move);
    return Boolean(chess.move({
      from: normalizedMove.slice(0, 2),
      to: normalizedMove.slice(2, 4),
      ...(normalizedMove.length > 4 ? { promotion: normalizedMove.slice(4, 5) } : {})
    }));
  } catch {
    return false;
  }
}

function isCheckmateFen(fen: string): boolean {
  return new Chess(fen).isCheckmate();
}

function normalizeMove(move: string): string {
  return move.trim().toLowerCase();
}

function hashSeed(seed: string | number): number {
  if (typeof seed === "number") {
    return Math.abs(Math.trunc(seed));
  }
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
