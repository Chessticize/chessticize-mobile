import { Chess } from "chess.js";
import {
  applyMovesToFen,
  beginArrowDuelPuzzle,
  beginLinePuzzle,
  computeSideAccuracyFromTransitions,
  currentExpectedMove,
  winPercent,
  type AnalysisScore,
  type GameHighlightMoment,
  type GamePlyEvaluation,
  type MoveWinPercentTransition,
  type ParsedGame,
  type ReviewContext
} from "../../../../../packages/core/src/index.ts";
import {
  storedUserPuzzleToPuzzle,
  USER_GAME_RATING_KEY_PREFIX,
  type StoredImportedGame,
  type StoredUserPuzzle
} from "../../../../../packages/storage/src/index.ts";
import type {
  GameReviewEvalGraphPoint,
  GameReviewSummaryData,
  KeyMomentItem,
  KeyMomentPuzzleItem,
  KeyMomentRetryState,
  SideClassificationCounts
} from "./gameReviewTypes.ts";

export const STANDARD_STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const EVEN_ANALYSIS_SCORE: AnalysisScore = {
  kind: "cp",
  sideToMoveCentipawns: 0,
  whiteCentipawns: 0
};

export function normalizeUciMove(move: string): string {
  return move.trim().toLowerCase();
}

export function formatEvalLabel(score: AnalysisScore): string {
  if (score.kind === "mate") {
    const absMate = Math.abs(score.whiteMate);
    const whiteWinning = score.whiteMate > 0 || (score.whiteMate === 0 && !Object.is(score.whiteMate, -0));
    if (absMate === 0) {
      return whiteWinning ? "M0" : "-M0";
    }
    return whiteWinning ? `M${absMate}` : `-M${absMate}`;
  }

  const pawns = score.whiteCentipawns / 100;
  if (Math.abs(pawns) < 0.05) {
    return "0.0";
  }
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export function formatWhiteCpLabel(whiteCp: number | undefined): string | undefined {
  if (whiteCp === undefined || !Number.isFinite(whiteCp)) {
    return undefined;
  }
  if (Math.abs(whiteCp) >= 10000) {
    return whiteCp > 0 ? "M" : "-M";
  }
  const pawns = whiteCp / 100;
  if (Math.abs(pawns) < 0.05) {
    return "0.0";
  }
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export function uciToSan(fen: string, uci: string): string {
  const normalized = normalizeUciMove(uci);
  if (normalized.length < 4) {
    return uci;
  }
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    return played?.san ?? uci;
  } catch {
    return uci;
  }
}

export function tryApplyUciMove(fen: string, uci: string): { fen: string; san: string; uci: string } | null {
  const normalized = normalizeUciMove(uci);
  if (normalized.length < 4) {
    return null;
  }
  try {
    const chess = new Chess(fen);
    const played = chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
    });
    if (!played) {
      return null;
    }
    return {
      fen: chess.fen(),
      san: played.san,
      uci: `${played.from}${played.to}${played.promotion ?? ""}`.toLowerCase()
    };
  } catch {
    return null;
  }
}

export function formatPvSanLine(
  fen: string,
  pv: readonly string[],
  maxMoves = 6
): string {
  if (pv.length === 0) {
    return "";
  }
  try {
    const chess = new Chess(fen);
    const tokens: string[] = [];
    const limit = Math.min(pv.length, maxMoves);
    for (let index = 0; index < limit; index += 1) {
      const moveUci = normalizeUciMove(pv[index] ?? "");
      if (moveUci.length < 4) {
        break;
      }
      const played = chess.move({
        from: moveUci.slice(0, 2),
        to: moveUci.slice(2, 4),
        ...(moveUci.length > 4 ? { promotion: moveUci.slice(4, 5) } : {})
      });
      if (!played) {
        break;
      }
      tokens.push(played.san);
    }
    return tokens.join(" ");
  } catch {
    return pv.slice(0, maxMoves).join(" ");
  }
}

export function formatMoveNumberTag(moveNumber: number, color: "w" | "b"): string {
  return color === "w" ? `${moveNumber}.` : `${moveNumber}...`;
}

export function reviewContextForUserPuzzle(puzzle: StoredUserPuzzle): ReviewContext {
  const mode = puzzle.puzzleKind === "arrow_duel" ? "arrow_duel" : "standard";
  return {
    puzzleId: puzzle.id,
    mode,
    ratingKey: `${USER_GAME_RATING_KEY_PREFIX}my_game_puzzles:${mode}`
  };
}

export function isEscapedMomentKind(momentKind: StoredUserPuzzle["momentKind"]): boolean {
  return momentKind === "own_mistake_escaped" || momentKind === "own_blunder_escaped";
}

export function buildKeyMoments(
  parsedGame: ParsedGame | null,
  plyEvaluations: readonly GamePlyEvaluation[],
  userPuzzles: readonly StoredUserPuzzle[],
  highlights: readonly GameHighlightMoment[]
): KeyMomentItem[] {
  const evalByPly = new Map<number, GamePlyEvaluation>();
  for (const item of plyEvaluations) {
    evalByPly.set(item.ply, item);
  }
  const parsedPlyByNumber = new Map<number, ParsedGame["plies"][number]>();
  for (const ply of parsedGame?.plies ?? []) {
    parsedPlyByNumber.set(ply.ply, ply);
  }

  const items: KeyMomentItem[] = [];

  for (const puzzle of userPuzzles) {
    const plyEval = evalByPly.get(puzzle.gamePly);
    const parsedPly = parsedPlyByNumber.get(puzzle.gamePly);
    const corePuzzle = storedUserPuzzleToPuzzle(puzzle);

    let decisionFen = puzzle.initialFen;
    let bestMoveUci = puzzle.stockfishBestMove ?? plyEval?.bestMove;
    let playedMoveUci = plyEval?.uci ?? parsedPly?.uci;

    if (puzzle.puzzleKind === "line") {
      try {
        const lineState = beginLinePuzzle(corePuzzle);
        decisionFen = lineState.currentFen;
        bestMoveUci = currentExpectedMove(lineState) ?? bestMoveUci;
      } catch {
        decisionFen = puzzle.initialFen;
      }
      // For opponent_*_missed puzzles, the user's actual move is the ply right after the opponent's blunder.
      if (puzzle.momentKind.startsWith("opponent_")) {
        const userPlyEval = evalByPly.get(puzzle.gamePly + 1);
        const userParsedPly = parsedPlyByNumber.get(puzzle.gamePly + 1);
        playedMoveUci = userPlyEval?.uci ?? userParsedPly?.uci;
      }
    } else if (puzzle.puzzleKind === "arrow_duel") {
      playedMoveUci = puzzle.solutionMoves[0] ?? playedMoveUci;
      bestMoveUci = puzzle.stockfishBestMove ?? bestMoveUci;
    }

    const playedMoveSan = playedMoveUci ? uciToSan(decisionFen, playedMoveUci) : undefined;
    const bestMoveSan = bestMoveUci ? uciToSan(decisionFen, bestMoveUci) : undefined;
    const bestEvalLabel = formatWhiteCpLabel(puzzle.stockfishEval);
    const playedEvalLabel =
      formatWhiteCpLabel(puzzle.stockfishEvalAfterFirstMove) ??
      (plyEval ? formatEvalLabel(plyEval.scoreAfter) : undefined);

    const moment: KeyMomentPuzzleItem = {
      id: puzzle.id,
      kind: "puzzle",
      ply: puzzle.gamePly,
      moveNumber: puzzle.gameMoveNumber,
      puzzle,
      ...(playedMoveUci !== undefined ? { playedMoveUci } : {}),
      ...(playedMoveSan !== undefined ? { playedMoveSan } : {}),
      ...(bestMoveUci !== undefined ? { bestMoveUci } : {}),
      ...(bestMoveSan !== undefined ? { bestMoveSan } : {}),
      ...(bestEvalLabel !== undefined ? { bestEvalLabel } : {}),
      ...(playedEvalLabel !== undefined ? { playedEvalLabel } : {}),
      escapedPunishment: isEscapedMomentKind(puzzle.momentKind),
      decisionFen
    };
    items.push(moment);
  }

  for (const highlight of highlights) {
    const parsedPly = parsedPlyByNumber.get(highlight.ply);
    const plyEval = evalByPly.get(highlight.ply);
    const fenBefore = plyEval?.fenBefore ?? parsedPly?.fenBefore ?? parsedGame?.initialFen ?? STANDARD_STARTING_FEN;
    const fenAfter = plyEval?.fenAfter ?? parsedPly?.fenAfter ?? fenBefore;
    items.push({
      id: `highlight:${highlight.ply}:${highlight.uci}`,
      kind: "highlight",
      ply: highlight.ply,
      moveNumber: highlight.moveNumber,
      highlight,
      fenBefore,
      fenAfter
    });
  }

  return items.sort((left, right) => left.ply - right.ply || left.id.localeCompare(right.id));
}

export function createInitialRetryState(moment: KeyMomentItem): KeyMomentRetryState {
  if (moment.kind === "highlight") {
    return {
      momentId: moment.id,
      status: "highlight",
      punishmentLine: [],
      showingRefutation: false,
      refutationStep: 0,
      autoEnrolledInReview: false
    };
  }

  const puzzle = storedUserPuzzleToPuzzle(moment.puzzle);
  const reviewContext = reviewContextForUserPuzzle(moment.puzzle);

  if (moment.puzzle.puzzleKind === "arrow_duel") {
    const duelState = beginArrowDuelPuzzle(puzzle, moment.puzzle.id);
    const blunderMove = moment.puzzle.solutionMoves[0];
    const punishmentFollowUp =
      moment.puzzle.punishmentLine && moment.puzzle.punishmentLine.length > 0
        ? moment.puzzle.punishmentLine
        : moment.puzzle.solutionMoves.slice(1);
    const punishmentLine = blunderMove
      ? [blunderMove, ...punishmentFollowUp]
      : [...punishmentFollowUp];

    return {
      momentId: moment.id,
      status: "prompt",
      duelState,
      candidates: [...duelState.candidates],
      expectedMove: duelState.correctMove,
      punishmentStartFen: duelState.currentFen,
      punishmentLine,
      showingRefutation: false,
      refutationStep: 0,
      autoEnrolledInReview: false,
      reviewContext
    };
  }

  const lineState = beginLinePuzzle(puzzle);
  const remainingSolution = moment.puzzle.solutionMoves.slice(lineState.cursor);
  const nextExpected = currentExpectedMove(lineState);

  return {
    momentId: moment.id,
    status: "prompt",
    lineState,
    ...(nextExpected !== undefined ? { expectedMove: nextExpected } : {}),
    punishmentStartFen: lineState.currentFen,
    punishmentLine: remainingSolution,
    showingRefutation: false,
    refutationStep: 0,
    autoEnrolledInReview: false,
    reviewContext
  };
}

export function fenForRetryState(
  moment: KeyMomentItem,
  retryState: KeyMomentRetryState
): { fen: string; lastMoveUci: string | null } {
  if (moment.kind === "highlight") {
    return {
      fen: moment.fenAfter,
      lastMoveUci: moment.highlight.uci
    };
  }

  if (
    retryState.showingRefutation &&
    retryState.punishmentStartFen &&
    retryState.punishmentLine.length > 0 &&
    retryState.refutationStep > 0
  ) {
    const appliedMoves = retryState.punishmentLine.slice(0, retryState.refutationStep);
    try {
      const fen = applyMovesToFen(retryState.punishmentStartFen, appliedMoves);
      return {
        fen,
        lastMoveUci: appliedMoves[appliedMoves.length - 1] ?? null
      };
    } catch {
      return {
        fen: retryState.punishmentStartFen,
        lastMoveUci: null
      };
    }
  }

  if (retryState.duelState) {
    return {
      fen: retryState.duelState.currentFen,
      lastMoveUci: null
    };
  }

  if (retryState.lineState) {
    const lastPlayed =
      retryState.lineState.playedMoves[retryState.lineState.playedMoves.length - 1] ?? null;
    return {
      fen: retryState.lineState.currentFen,
      lastMoveUci: lastPlayed
    };
  }

  return {
    fen: moment.decisionFen,
    lastMoveUci: null
  };
}

export function buildEvalGraphPoints(
  parsedGame: ParsedGame | null,
  plyEvaluations: readonly GamePlyEvaluation[],
  keyMoments: readonly KeyMomentItem[]
): GameReviewEvalGraphPoint[] {
  const firstEval = plyEvaluations[0];
  const initialWhiteWinPercent = firstEval
    ? firstEval.color === "w"
      ? firstEval.moverWinPercentBefore
      : 100 - firstEval.moverWinPercentBefore
    : 50;

  const keyMomentPlySet = new Set<number>();
  const highlightPlySet = new Set<number>();
  for (const moment of keyMoments) {
    if (moment.kind === "highlight") {
      highlightPlySet.add(moment.ply);
    } else {
      keyMomentPlySet.add(moment.ply);
    }
  }

  const points: GameReviewEvalGraphPoint[] = [
    {
      ply: 0,
      moveNumber: 0,
      whiteWinPercent: initialWhiteWinPercent,
      score: EVEN_ANALYSIS_SCORE
    }
  ];

  const evalByPly = new Map<number, GamePlyEvaluation>();
  for (const item of plyEvaluations) {
    evalByPly.set(item.ply, item);
  }

  const plies = parsedGame?.plies ?? [];
  if (plies.length > 0) {
    for (const ply of plies) {
      const plyEval = evalByPly.get(ply.ply);
      if (!plyEval) {
        continue;
      }
      points.push({
        ply: plyEval.ply,
        moveNumber: plyEval.moveNumber,
        color: plyEval.color,
        san: plyEval.san,
        whiteWinPercent: plyEval.whiteWinPercent,
        score: plyEval.scoreAfter,
        classification: plyEval.classification,
        isKeyMoment: keyMomentPlySet.has(plyEval.ply),
        isHighlight: highlightPlySet.has(plyEval.ply)
      });
    }
  } else {
    for (const plyEval of plyEvaluations) {
      points.push({
        ply: plyEval.ply,
        moveNumber: plyEval.moveNumber,
        color: plyEval.color,
        san: plyEval.san,
        whiteWinPercent: plyEval.whiteWinPercent,
        score: plyEval.scoreAfter,
        classification: plyEval.classification,
        isKeyMoment: keyMomentPlySet.has(plyEval.ply),
        isHighlight: highlightPlySet.has(plyEval.ply)
      });
    }
  }

  return points;
}

export function buildGameReviewSummary(
  game: StoredImportedGame,
  plyEvaluations: readonly GamePlyEvaluation[],
  userPuzzles: readonly StoredUserPuzzle[]
): GameReviewSummaryData {
  const whiteTransitions: MoveWinPercentTransition[] = [];
  const blackTransitions: MoveWinPercentTransition[] = [];
  const firstEval = plyEvaluations[0];
  const initialWhiteWin = firstEval
    ? firstEval.color === "w"
      ? firstEval.moverWinPercentBefore
      : 100 - firstEval.moverWinPercentBefore
    : 50;
  const whiteWinTimeline: number[] = [initialWhiteWin];

  const whiteCounts = emptySideCounts();
  const blackCounts = emptySideCounts();

  for (let index = 0; index < plyEvaluations.length; index += 1) {
    const plyEval = plyEvaluations[index];
    if (!plyEval) {
      continue;
    }
    whiteWinTimeline.push(plyEval.whiteWinPercent);
    const transition: MoveWinPercentTransition = {
      winPercentBefore: plyEval.moverWinPercentBefore,
      winPercentAfter: plyEval.moverWinPercentAfter,
      timelineIndex: index
    };
    const bucket = plyEval.color === "w" ? whiteCounts : blackCounts;
    if (plyEval.color === "w") {
      whiteTransitions.push(transition);
    } else {
      blackTransitions.push(transition);
    }
    switch (plyEval.classification) {
      case "best":
      case "great":
      case "book":
      case "good":
        bucket.best += 1;
        break;
      case "inaccuracy":
        bucket.inaccuracy += 1;
        break;
      case "mistake":
        bucket.mistake += 1;
        break;
      case "blunder":
        bucket.blunder += 1;
        break;
      case "missed_win":
        bucket.missedWin += 1;
        break;
    }
  }

  const computedWhiteAccuracy =
    whiteTransitions.length > 0
      ? computeSideAccuracyFromTransitions(whiteTransitions, whiteWinTimeline)
      : game.whiteAccuracy ?? 0;
  const computedBlackAccuracy =
    blackTransitions.length > 0
      ? computeSideAccuracyFromTransitions(blackTransitions, whiteWinTimeline)
      : game.blackAccuracy ?? 0;

  return {
    white: {
      ...whiteCounts,
      accuracy: game.whiteAccuracy ?? computedWhiteAccuracy
    },
    black: {
      ...blackCounts,
      accuracy: game.blackAccuracy ?? computedBlackAccuracy
    },
    userColor: game.userColor,
    puzzles: [...userPuzzles]
  };
}

export function whiteWinPercentForScore(score: AnalysisScore): number {
  return winPercent(score, "white");
}

function emptySideCounts(): SideClassificationCounts {
  return {
    accuracy: 0,
    best: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    missedWin: 0
  };
}
