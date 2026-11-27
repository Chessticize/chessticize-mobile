/**
 * Pure-TypeScript foreground Pass-1 game evaluator with streaming progress,
 * pre-evaluated PGN hydration, abort handling, and checkpoint resume.
 */

import { Chess } from "chess.js";
import type { AnalysisScore, EngineAnalysisLine } from "../engine-analysis.ts";
import {
  parsePgnGame,
  type ClockBucket,
  type ParsedGame,
  type ParsedGamePly
} from "./pgn-parser.ts";
import {
  computeSideAccuracyFromTransitions,
  mateScoreSign,
  winPercent,
  type MoveWinPercentTransition
} from "./win-chances.ts";

export interface GameReviewEngineRequest {
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

export interface GameReviewEngine {
  analyze(request: GameReviewEngineRequest): Promise<EngineAnalysisLine[]>;
}

export type MoveClassification =
  | "book"
  | "best"
  | "great"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "missed_win";

export interface GamePlyEvaluation {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  scoreAfter: AnalysisScore;
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
}

export interface EvalGraphPoint {
  ply: number;
  whiteWinPercent: number;
  score: AnalysisScore;
}

export interface SideReviewSummary {
  accuracy: number;
  totalMoves: number;
  averageWinPercentLoss: number;
  classifications: Record<MoveClassification, number>;
  clockBuckets: Record<ClockBucket, number>;
}

export interface GameReviewReport {
  parsedGame: ParsedGame;
  userColor?: "w" | "b";
  plies: GamePlyEvaluation[];
  evalGraph: EvalGraphPoint[];
  whiteAccuracy: number;
  blackAccuracy: number;
  summaryBySide: {
    w: SideReviewSummary;
    b: SideReviewSummary;
  };
  keyMomentPlies: number[];
  isComplete: boolean;
  checkpointPly: number;
}

export interface EvaluationProgress {
  completedPlies: number;
  totalPlies: number;
}

export interface EvaluateGamePass1Options {
  depth?: number;
  nodes?: number;
  movetimeMs?: number;
  multiPv?: number;
  priority?: "interactive" | "batch";
  usePreExistingEvals?: boolean;
  initialEvaluations?: readonly GamePlyEvaluation[];
  onPlyEvaluated?: (
    plyEval: GamePlyEvaluation,
    progress: EvaluationProgress
  ) => void;
  signal?: AbortSignal;
  bookMaxPly?: number;
  keyMomentWinPercentLossThreshold?: number;
}

export interface EvaluateGamePass1Input {
  pgn: string | ParsedGame;
  engine: GameReviewEngine;
  userColor?: "w" | "b";
  options?: EvaluateGamePass1Options;
}

export interface ClassifyMoveInput {
  moverWinPercentBefore: number;
  moverWinPercentAfter: number;
  playedUci: string;
  bestMove?: string;
  secondBestMoverWinPercent?: number;
  ply?: number;
  eco?: string;
  bookMaxPly?: number;
}

const DEFAULT_PASS1_DEPTH = 12;
const DEFAULT_PASS1_NODES = 80_000;
const DEFAULT_PASS1_MULTIPV = 1;
const DEFAULT_KEY_MOMENT_LOSS_THRESHOLD = 15;

const EVEN_SCORE: AnalysisScore = {
  kind: "cp",
  sideToMoveCentipawns: 0,
  whiteCentipawns: 0
};

/**
 * Classify a single chess move from the mover's perspective based on Win% loss,
 * best-move agreement, MultiPV uniqueness, and missed-win detection.
 */
export function classifyMove({
  moverWinPercentBefore,
  moverWinPercentAfter,
  playedUci,
  bestMove,
  secondBestMoverWinPercent,
  ply = 0,
  eco,
  bookMaxPly = 0
}: ClassifyMoveInput): MoveClassification {
  const winPercentLoss = Math.max(0, moverWinPercentBefore - moverWinPercentAfter);
  const normalizedPlayed = playedUci.trim().toLowerCase();
  const normalizedBest = bestMove?.trim().toLowerCase();
  const matchedBest = normalizedBest !== undefined && normalizedPlayed === normalizedBest;

  if (
    bookMaxPly > 0 &&
    ply > 0 &&
    ply <= bookMaxPly &&
    Boolean(eco) &&
    winPercentLoss <= 2.5 &&
    Math.abs(moverWinPercentAfter - 50) <= 15
  ) {
    return "book";
  }

  if (matchedBest) {
    if (
      secondBestMoverWinPercent !== undefined &&
      moverWinPercentAfter >= 45 &&
      moverWinPercentAfter - secondBestMoverWinPercent >= 15
    ) {
      return "great";
    }
    return "best";
  }

  // Missed win: sharp drop from clearly winning (>= 80%) to non-winning (<= 55%) with >= 20% drop.
  if (
    moverWinPercentBefore >= 80 &&
    moverWinPercentAfter <= 55 &&
    winPercentLoss >= 20
  ) {
    return "missed_win";
  }

  if (winPercentLoss >= 20) {
    return "blunder";
  }
  if (winPercentLoss >= 10) {
    return "mistake";
  }
  if (winPercentLoss >= 5) {
    return "inaccuracy";
  }
  if (winPercentLoss <= 0.5) {
    if (
      secondBestMoverWinPercent !== undefined &&
      moverWinPercentAfter >= 45 &&
      moverWinPercentAfter - secondBestMoverWinPercent >= 15
    ) {
      return "great";
    }
    return "best";
  }

  return "good";
}

/**
 * Determine whether a ply should be flagged as a Pass-2 key moment candidate.
 */
export function isKeyMomentCandidatePly({
  scoreBefore,
  scoreAfter,
  winPercentLoss,
  threshold = DEFAULT_KEY_MOMENT_LOSS_THRESHOLD
}: {
  scoreBefore: AnalysisScore;
  scoreAfter: AnalysisScore;
  winPercentLoss: number;
  threshold?: number;
}): boolean {
  if (winPercentLoss >= threshold) {
    return true;
  }

  const beforeIsMate = scoreBefore.kind === "mate";
  const afterIsMate = scoreAfter.kind === "mate";
  if (beforeIsMate !== afterIsMate) {
    return true;
  }
  if (beforeIsMate && afterIsMate) {
    return mateScoreSign(scoreBefore.whiteMate) !== mateScoreSign(scoreAfter.whiteMate);
  }
  return false;
}

/**
 * Run bounded foreground Pass-1 evaluation over a game, supporting:
 * - Instant hydration from complete pre-existing `[%eval]` annotations without calling the engine
 * - Checkpoint resume via `options.initialEvaluations`
 * - Streaming `options.onPlyEvaluated` callbacks after each ply
 * - Graceful `AbortSignal` cancellation returning a partial report with `checkpointPly`
 */
export async function evaluateGamePass1({
  pgn,
  engine,
  userColor,
  options = {}
}: EvaluateGamePass1Input): Promise<GameReviewReport> {
  const parsedGame = typeof pgn === "string" ? parsePgnGame(pgn) : pgn;
  const totalPlies = parsedGame.plies.length;

  const depth = options.depth ?? DEFAULT_PASS1_DEPTH;
  const nodes = options.nodes ?? DEFAULT_PASS1_NODES;
  const multiPv = options.multiPv ?? DEFAULT_PASS1_MULTIPV;
  const priority = options.priority ?? "interactive";
  const usePreExistingEvals = options.usePreExistingEvals ?? true;
  const bookMaxPly = options.bookMaxPly ?? 0;
  const keyMomentThreshold =
    options.keyMomentWinPercentLossThreshold ?? DEFAULT_KEY_MOMENT_LOSS_THRESHOLD;
  const signal = options.signal;

  // Hydrate contiguous checkpoint prefix from initialEvaluations (ply 1..k).
  const initialByPly = new Map<number, GamePlyEvaluation>();
  for (const item of options.initialEvaluations ?? []) {
    initialByPly.set(item.ply, item);
  }

  const evaluatedPlies: GamePlyEvaluation[] = [];
  for (let index = 0; index < totalPlies; index += 1) {
    const ply = parsedGame.plies[index];
    const cached = ply ? initialByPly.get(ply.ply) : undefined;
    if (!ply || !cached || cached.fenAfter !== ply.fenAfter || cached.uci !== ply.uci) {
      break;
    }
    evaluatedPlies.push(cached);
  }

  if (totalPlies === 0) {
    return buildReport({
      parsedGame,
      ...(userColor !== undefined ? { userColor } : {}),
      plies: [],
      initialScore: EVEN_SCORE,
      isComplete: true
    });
  }

  const hasCompletePreExistingEvals =
    usePreExistingEvals &&
    parsedGame.plies.every(
      (ply, index) =>
        ply.preExistingEval !== undefined ||
        terminalScoreForFen(ply.fenAfter, ply.color, index === totalPlies - 1) !== undefined
    );

  // If all plies are already cached, return complete report immediately without calling the engine.
  if (evaluatedPlies.length >= totalPlies) {
    const initialScore = inferInitialScore(parsedGame, evaluatedPlies);
    return buildReport({
      parsedGame,
      ...(userColor !== undefined ? { userColor } : {}),
      plies: evaluatedPlies,
      initialScore,
      isComplete: true
    });
  }

  // If already aborted before starting remaining work, return partial checkpoint immediately.
  if (signal?.aborted) {
    const initialScore = inferInitialScore(parsedGame, evaluatedPlies);
    return buildReport({
      parsedGame,
      ...(userColor !== undefined ? { userColor } : {}),
      plies: evaluatedPlies,
      initialScore,
      isComplete: false
    });
  }

  // Fast path: hydrate from complete pre-existing PGN [%eval] annotations with zero engine calls.
  if (hasCompletePreExistingEvals) {
    const startIndex = evaluatedPlies.length;
    let prevScore: AnalysisScore =
      startIndex > 0
        ? (evaluatedPlies[startIndex - 1]?.scoreAfter ?? EVEN_SCORE)
        : EVEN_SCORE;

    for (let index = startIndex; index < totalPlies; index += 1) {
      if (signal?.aborted) {
        return buildReport({
          parsedGame,
          ...(userColor !== undefined ? { userColor } : {}),
          plies: evaluatedPlies,
          initialScore: EVEN_SCORE,
          isComplete: false
        });
      }

      const ply = parsedGame.plies[index];
      if (!ply) {
        break;
      }

      const scoreAfter =
        ply.preExistingEval ??
        terminalScoreForFen(ply.fenAfter, ply.color, index === totalPlies - 1) ??
        prevScore;

      const plyEval = buildPlyEvaluation({
        ply,
        scoreBefore: prevScore,
        scoreAfter,
        ...(parsedGame.eco !== undefined ? { eco: parsedGame.eco } : {}),
        bookMaxPly,
        keyMomentThreshold,
        fromPreExistingEval: true
      });

      evaluatedPlies.push(plyEval);
      prevScore = scoreAfter;
      options.onPlyEvaluated?.(plyEval, {
        completedPlies: evaluatedPlies.length,
        totalPlies
      });
    }

    return buildReport({
      parsedGame,
      ...(userColor !== undefined ? { userColor } : {}),
      plies: evaluatedPlies,
      initialScore: EVEN_SCORE,
      isComplete: evaluatedPlies.length === totalPlies
    });
  }

  // Engine evaluation path: evaluate position before next ply (once at start or resume boundary),
  // then evaluate each ply's resulting position so each engine call serves as both scoreAfter(k)
  // and bestMove/scoreBefore(k+1), keeping TT warm with a single newGame per session.
  const startIndex = evaluatedPlies.length;
  let sentNewGame = false;

  const analyzePosition = async (
    fen: string
  ): Promise<{ aborted: true } | { aborted: false; lines: EngineAnalysisLine[] }> => {
    if (signal?.aborted) {
      return { aborted: true };
    }
    const isFirstCall = !sentNewGame;
    sentNewGame = true;
    try {
      const lines = await engine.analyze({
        fen,
        depth,
        nodes,
        ...(options.movetimeMs !== undefined ? { movetimeMs: options.movetimeMs } : {}),
        multiPv,
        newGame: isFirstCall,
        priority,
        ...(signal !== undefined ? { signal } : {})
      });
      if (signal?.aborted) {
        return { aborted: true };
      }
      return { aborted: false, lines: sortLines(lines) };
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        return { aborted: true };
      }
      throw error;
    }
  };

  const firstRemainingPly = parsedGame.plies[startIndex];
  if (!firstRemainingPly) {
    return buildReport({
      parsedGame,
      ...(userColor !== undefined ? { userColor } : {}),
      plies: evaluatedPlies,
      initialScore: inferInitialScore(parsedGame, evaluatedPlies),
      isComplete: true
    });
  }

  const beforeResult = await analyzePosition(firstRemainingPly.fenBefore);
  if (beforeResult.aborted) {
    return buildReport({
      parsedGame,
      ...(userColor !== undefined ? { userColor } : {}),
      plies: evaluatedPlies,
      initialScore: inferInitialScore(parsedGame, evaluatedPlies),
      isComplete: false
    });
  }

  let initialScore: AnalysisScore =
    startIndex === 0
      ? (beforeResult.lines[0]?.score ?? EVEN_SCORE)
      : inferInitialScore(parsedGame, evaluatedPlies);

  let prevScore: AnalysisScore =
    startIndex > 0
      ? (evaluatedPlies[startIndex - 1]?.scoreAfter ?? initialScore)
      : initialScore;

  let currentBestMove: string | undefined = beforeResult.lines[0]?.move;
  let currentSecondBestLine: EngineAnalysisLine | undefined = beforeResult.lines[1];

  for (let index = startIndex; index < totalPlies; index += 1) {
    if (signal?.aborted) {
      return buildReport({
        parsedGame,
        ...(userColor !== undefined ? { userColor } : {}),
        plies: evaluatedPlies,
        initialScore,
        isComplete: false
      });
    }

    const ply = parsedGame.plies[index];
    if (!ply) {
      break;
    }

    const terminalScore = terminalScoreForFen(
      ply.fenAfter,
      ply.color,
      index === totalPlies - 1
    );
    let scoreAfter: AnalysisScore;
    let nextBestMove: string | undefined;
    let nextSecondBestLine: EngineAnalysisLine | undefined;

    if (terminalScore !== undefined) {
      scoreAfter = terminalScore;
      nextBestMove = undefined;
      nextSecondBestLine = undefined;
    } else {
      const afterResult = await analyzePosition(ply.fenAfter);
      if (afterResult.aborted) {
        return buildReport({
          parsedGame,
          ...(userColor !== undefined ? { userColor } : {}),
          plies: evaluatedPlies,
          initialScore,
          isComplete: false
        });
      }
      scoreAfter = afterResult.lines[0]?.score ?? prevScore;
      nextBestMove = afterResult.lines[0]?.move;
      nextSecondBestLine = afterResult.lines[1];
    }

    const secondBestMoverWinPercent = currentSecondBestLine
      ? winPercent(currentSecondBestLine.score, ply.color === "w" ? "white" : "black")
      : undefined;

    const plyEval = buildPlyEvaluation({
      ply,
      scoreBefore: prevScore,
      scoreAfter,
      ...(currentBestMove !== undefined ? { bestMove: currentBestMove } : {}),
      ...(secondBestMoverWinPercent !== undefined
        ? { secondBestMoverWinPercent }
        : {}),
      ...(parsedGame.eco !== undefined ? { eco: parsedGame.eco } : {}),
      bookMaxPly,
      keyMomentThreshold,
      fromPreExistingEval: false
    });

    evaluatedPlies.push(plyEval);
    prevScore = scoreAfter;
    currentBestMove = nextBestMove;
    currentSecondBestLine = nextSecondBestLine;

    options.onPlyEvaluated?.(plyEval, {
      completedPlies: evaluatedPlies.length,
      totalPlies
    });
  }

  return buildReport({
    parsedGame,
    ...(userColor !== undefined ? { userColor } : {}),
    plies: evaluatedPlies,
    initialScore,
    isComplete: evaluatedPlies.length === totalPlies
  });
}

function buildPlyEvaluation({
  ply,
  scoreBefore,
  scoreAfter,
  bestMove,
  secondBestMoverWinPercent,
  eco,
  bookMaxPly,
  keyMomentThreshold,
  fromPreExistingEval
}: {
  ply: ParsedGamePly;
  scoreBefore: AnalysisScore;
  scoreAfter: AnalysisScore;
  bestMove?: string;
  secondBestMoverWinPercent?: number;
  eco?: string;
  bookMaxPly: number;
  keyMomentThreshold: number;
  fromPreExistingEval: boolean;
}): GamePlyEvaluation {
  const moverPov = ply.color === "w" ? "white" : "black";
  const whiteWinPercent = winPercent(scoreAfter, "white");
  const moverWinPercentBefore = winPercent(scoreBefore, moverPov);
  const moverWinPercentAfter = winPercent(scoreAfter, moverPov);
  const winPercentLoss = Math.max(0, moverWinPercentBefore - moverWinPercentAfter);

  const classification = classifyMove({
    moverWinPercentBefore,
    moverWinPercentAfter,
    playedUci: ply.uci,
    ...(bestMove !== undefined ? { bestMove } : {}),
    ...(secondBestMoverWinPercent !== undefined
      ? { secondBestMoverWinPercent }
      : {}),
    ply: ply.ply,
    ...(eco !== undefined ? { eco } : {}),
    bookMaxPly
  });

  const isKeyMomentCandidate = isKeyMomentCandidatePly({
    scoreBefore,
    scoreAfter,
    winPercentLoss,
    threshold: keyMomentThreshold
  });

  return {
    ply: ply.ply,
    moveNumber: ply.moveNumber,
    color: ply.color,
    uci: ply.uci,
    san: ply.san,
    fenBefore: ply.fenBefore,
    fenAfter: ply.fenAfter,
    scoreAfter,
    whiteWinPercent,
    moverWinPercentBefore,
    moverWinPercentAfter,
    winPercentLoss,
    ...(bestMove !== undefined ? { bestMove } : {}),
    classification,
    ...(ply.clockRemainingSec !== undefined
      ? { clockRemainingSec: ply.clockRemainingSec }
      : {}),
    ...(ply.timeSpentSec !== undefined ? { timeSpentSec: ply.timeSpentSec } : {}),
    clockBucket: ply.clockBucket,
    isKeyMomentCandidate,
    fromPreExistingEval
  };
}

function buildReport({
  parsedGame,
  userColor,
  plies,
  initialScore,
  isComplete
}: {
  parsedGame: ParsedGame;
  userColor?: "w" | "b";
  plies: GamePlyEvaluation[];
  initialScore: AnalysisScore;
  isComplete: boolean;
}): GameReviewReport {
  const initialWhiteWinPercent =
    plies[0] !== undefined
      ? plies[0].color === "w"
        ? plies[0].moverWinPercentBefore
        : 100 - plies[0].moverWinPercentBefore
      : winPercent(initialScore, "white");

  const whiteWinTimeline: number[] = [initialWhiteWinPercent];
  const evalGraph: EvalGraphPoint[] = [
    {
      ply: 0,
      whiteWinPercent: initialWhiteWinPercent,
      score: initialScore
    }
  ];

  const whiteTransitions: MoveWinPercentTransition[] = [];
  const blackTransitions: MoveWinPercentTransition[] = [];

  for (let index = 0; index < plies.length; index += 1) {
    const plyEval = plies[index];
    if (!plyEval) {
      continue;
    }
    whiteWinTimeline.push(plyEval.whiteWinPercent);
    evalGraph.push({
      ply: plyEval.ply,
      whiteWinPercent: plyEval.whiteWinPercent,
      score: plyEval.scoreAfter
    });

    const transition: MoveWinPercentTransition = {
      winPercentBefore: plyEval.moverWinPercentBefore,
      winPercentAfter: plyEval.moverWinPercentAfter,
      timelineIndex: index
    };
    if (plyEval.color === "w") {
      whiteTransitions.push(transition);
    } else {
      blackTransitions.push(transition);
    }
  }

  const whiteAccuracy = computeSideAccuracyFromTransitions(
    whiteTransitions,
    whiteWinTimeline
  );
  const blackAccuracy = computeSideAccuracyFromTransitions(
    blackTransitions,
    whiteWinTimeline
  );

  const summaryBySide = {
    w: buildSideSummary(plies, "w", whiteAccuracy),
    b: buildSideSummary(plies, "b", blackAccuracy)
  };

  const keyMomentPlies = plies
    .filter((plyEval) => plyEval.isKeyMomentCandidate)
    .map((plyEval) => plyEval.ply);

  const checkpointPly = plies[plies.length - 1]?.ply ?? 0;

  return {
    parsedGame,
    ...(userColor !== undefined ? { userColor } : {}),
    plies,
    evalGraph,
    whiteAccuracy,
    blackAccuracy,
    summaryBySide,
    keyMomentPlies,
    isComplete,
    checkpointPly
  };
}

function buildSideSummary(
  plies: readonly GamePlyEvaluation[],
  color: "w" | "b",
  accuracy: number
): SideReviewSummary {
  const classifications: Record<MoveClassification, number> = {
    book: 0,
    best: 0,
    great: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    missed_win: 0
  };
  const clockBuckets: Record<ClockBucket, number> = {
    time_trouble: 0,
    impulsive: 0,
    deliberate: 0,
    unknown: 0
  };

  let totalMoves = 0;
  let totalLoss = 0;
  for (const plyEval of plies) {
    if (plyEval.color !== color) {
      continue;
    }
    totalMoves += 1;
    totalLoss += plyEval.winPercentLoss;
    classifications[plyEval.classification] += 1;
    clockBuckets[plyEval.clockBucket] += 1;
  }

  return {
    accuracy,
    totalMoves,
    averageWinPercentLoss: totalMoves > 0 ? totalLoss / totalMoves : 0,
    classifications,
    clockBuckets
  };
}

function terminalScoreForFen(
  fen: string,
  moverColor: "w" | "b",
  isLastPly: boolean
): AnalysisScore | undefined {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    const whiteWon = moverColor === "w";
    return {
      kind: "mate",
      whiteMate: whiteWon ? 0 : -0,
      sideToMoveMate: -0
    };
  }
  if (
    chess.isStalemate() ||
    chess.isInsufficientMaterial() ||
    (isLastPly && chess.isDraw())
  ) {
    return EVEN_SCORE;
  }
  return undefined;
}

function inferInitialScore(
  parsedGame: ParsedGame,
  evaluatedPlies: readonly GamePlyEvaluation[]
): AnalysisScore {
  const firstEval = evaluatedPlies[0];
  if (!firstEval) {
    return EVEN_SCORE;
  }
  const initialWhiteWinPercent =
    firstEval.color === "w"
      ? firstEval.moverWinPercentBefore
      : 100 - firstEval.moverWinPercentBefore;
  if (Math.abs(initialWhiteWinPercent - 50) < 1e-6) {
    return EVEN_SCORE;
  }
  // Invert sigmoid to approximate starting centipawns for Eval Graph ply 0 when resuming
  const clamped = Math.min(99.999, Math.max(0.001, initialWhiteWinPercent));
  const chances = clamped / 50 - 1;
  const rawWhiteCp = Math.round(
    Math.log((1 + chances) / (1 - chances)) / 0.00368208
  );
  const whiteCp = rawWhiteCp === 0 ? 0 : rawWhiteCp;
  const firstFen = parsedGame.plies[0]?.fenBefore ?? parsedGame.initialFen ?? "";
  const activeColor = firstFen.split(/\s+/)[1] === "b" ? "b" : "w";
  const sideCp = activeColor === "w" ? whiteCp : -whiteCp;
  return {
    kind: "cp",
    whiteCentipawns: whiteCp,
    sideToMoveCentipawns: sideCp === 0 ? 0 : sideCp
  };
}

function sortLines(lines: readonly EngineAnalysisLine[]): EngineAnalysisLine[] {
  return [...lines].sort((left, right) => left.multipv - right.multipv);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message.toLowerCase().includes("aborted"))
  );
}
