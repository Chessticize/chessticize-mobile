/*
 * Adapted from Chessticize/chessticize-worker, lychee-org/retagger, and lichess-org/puzzler.
 * Original work Copyright 2020 lichess.org
 * Forked work Copyright 2023 lychee-org
 * Modified work Copyright 2024-2026 chessticize.com
 * Licensed under the MIT License.
 */

import { Chess, type Color } from "chess.js";
import type { EngineAnalysisLine } from "../engine-analysis.ts";
import {
  ARROW_DUEL_MATE_SCORE,
  ARROW_DUEL_MIN_BEST_CP,
  ARROW_DUEL_MIN_CP_SWING,
  ARROW_DUEL_MIN_WIN_CHANCE_SWING,
  verifyArrowDuelPair
} from "./arrow-duel.ts";
import {
  compareRelativeScores,
  cpScore,
  fenAfterUci,
  fenFullmoveNumber,
  fenPositionKey,
  fenSideToMove,
  isForcedMateWithin,
  isIrreversibleMove,
  mateScore,
  negateRelativeScore,
  normalizeUci,
  parseClockSecondsFromComment,
  parseTimeControl,
  relativeScoreToCp,
  sanForUci,
  scoreForPov,
  tryPlayUci,
  winChances,
  type RelativeScore
} from "./score.ts";
import {
  checkZugzwang,
  isCuratedTheme,
  tagPuzzle,
  tagPuzzleWithPvEnrichment
} from "./tagger.ts";
import type {
  ExtractedArrowDuelMeta,
  ExtractedGamePuzzle,
  ExtractGamePuzzlesInput,
  ExtractGamePuzzlesOptions,
  ExtractGamePuzzlesResult,
  GameHighlightMoment,
  GamePlyEvalInput,
  GamePuzzleMomentKind,
  PuzzleExtractionEngine,
  SearchLimitConfig
} from "./types.ts";

export {
  ARROW_DUEL_MATE_SCORE,
  ARROW_DUEL_MIN_BEST_CP,
  ARROW_DUEL_MIN_CP_SWING,
  ARROW_DUEL_MIN_WIN_CHANCE_SWING,
  verifyArrowDuelPair
};

export const MIN_OPPORTUNITY_SCORE_CP = -75;
export const ALREADY_WINNING_CP = 300;
export const MAX_MATE_SOON = 5;
export const WIN_CHANCE_SWING_THRESHOLD = 0.4;
export const CHECK_FOUND_LINE_DEPTH = 12;
export const CHECK_FOUND_LINE_MAX_WIN_CHANCE_DROP = 0.12;
export const CHECK_FOUND_LINE_THRESHOLD_CP = 100;
export const DEFAULT_MAX_PUZZLES_PER_GAME = 3;
export const SEVERE_TIME_TROUBLE_SEC = 10;

export const DEFAULT_DEEP_LIMIT: SearchLimitConfig = {
  depth: 18,
  nodes: 500_000
};

export const DEFAULT_MATE_DEFENSE_LIMIT: SearchLimitConfig = {
  depth: 15,
  nodes: 500_000
};

const MAX_COOK_ADVANTAGE_PLIES = 12;
const AUTO_REVIEW_REGULAR_MAX_PLIES = 6;

const OWN_MOMENT_KINDS = new Set<GamePuzzleMomentKind>([
  "own_mistake_punished",
  "own_mistake_escaped",
  "own_blunder_punished",
  "own_blunder_escaped"
]);

const NON_SPECIFIC_AUTO_REVIEW_TAGS = new Set<string>([
  "advantage",
  "crushing",
  "equality",
  "short",
  "long",
  "verylong",
  "onemove",
  "one_move",
  "mate",
  "quietmove",
  "quiet_move",
  "opening",
  "middlegame",
  "endgame"
]);

const HARD_DISQUALIFYING_AUTO_REVIEW_TAGS = new Set<string>([
  "matein4",
  "matein5",
  "mate_in_4",
  "mate_in_5",
  "verylong",
  "very_long"
]);

export interface EngineMoveCandidate {
  move: string;
  score: RelativeScore;
  pv: string[];
}

export interface NextMovesPair {
  best: EngineMoveCandidate;
  second?: EngineMoveCandidate;
  third?: EngineMoveCandidate;
}

/**
 * Require a single clear winning move for regular (`line`) puzzles.
 * Multi-solution positions return `false` and fall through to the blunder / Arrow Duel branch.
 */
export function isValidAttack(
  best: Pick<EngineMoveCandidate, "move" | "score">,
  second?: Pick<EngineMoveCandidate, "move" | "score"> | null
): boolean {
  if (!second) {
    return true;
  }
  if (best.score.kind === "mate" && best.score.mate === 1) {
    return true;
  }
  return winChances(best.score) > winChances(second.score) + WIN_CHANCE_SWING_THRESHOLD;
}

export function maintainsAdvantage(
  actualScore: RelativeScore,
  targetScore: RelativeScore,
  thresholdCp = CHECK_FOUND_LINE_THRESHOLD_CP,
  maxWinChanceDrop = CHECK_FOUND_LINE_MAX_WIN_CHANCE_DROP
): boolean {
  if (winChances(targetScore) - winChances(actualScore) <= maxWinChanceDrop) {
    return true;
  }
  if (actualScore.kind === "cp" && targetScore.kind === "cp") {
    return actualScore.cp >= targetScore.cp - thresholdCp;
  }
  return false;
}

/**
 * Checks whether the winning side followed the winning line in the real game,
 * tolerating equivalent winning deviations (<= 0.12 win-chance drop or <= 100 cp at depth 12)
 * and handling opponent resignation immediately after a winning move.
 */
export async function checkIfUserFoundLine(params: {
  engine: PuzzleExtractionEngine;
  plies: readonly GamePlyEvalInput[];
  startPlyIndex: number;
  solutionMoves: readonly string[];
  winner: Color;
  depth?: number;
  thresholdCp?: number;
  maxWinChanceDrop?: number;
  signal?: AbortSignal;
}): Promise<boolean> {
  const {
    engine,
    plies,
    startPlyIndex,
    solutionMoves,
    winner,
    signal
  } = params;
  const depth = params.depth ?? CHECK_FOUND_LINE_DEPTH;
  const thresholdCp = params.thresholdCp ?? CHECK_FOUND_LINE_THRESHOLD_CP;
  const maxWinChanceDrop = params.maxWinChanceDrop ?? CHECK_FOUND_LINE_MAX_WIN_CHANCE_DROP;

  const startPly = plies[startPlyIndex];
  if (!startPly || solutionMoves.length === 0) {
    return false;
  }

  // Evaluate target board at the end of the engine's solution line.
  const targetBoard = new Chess(startPly.fenAfter);
  for (const move of solutionMoves) {
    if (!tryPlayUci(targetBoard, move)) {
      break;
    }
  }
  const puzzleFinalScore = await evaluatePositionForPov(
    engine,
    targetBoard,
    winner,
    depth,
    signal
  );
  if (!puzzleFinalScore) {
    return false;
  }

  let exactMatch = true;
  let lastReachedPly: GamePlyEvalInput | undefined;

  for (let index = 0; index < solutionMoves.length; index += 1) {
    const actualPly = plies[startPlyIndex + 1 + index];
    if (!actualPly) {
      // If the winner never played move 0, or the game ended on the winner's turn,
      // the winner did not find the continuation. If the game ended on the loser's turn
      // (e.g. opponent resigned right after the winning move), evaluate the reached board.
      if (index === 0 || index % 2 === 0) {
        return false;
      }
      exactMatch = false;
      break;
    }

    const actualMove = normalizeUci(actualPly.uci);
    const puzzleMove = normalizeUci(solutionMoves[index]!);
    if (actualMove !== puzzleMove) {
      exactMatch = false;
    }

    // Only penalize deviations by the winning side (even indices).
    if (index % 2 === 0 && actualMove !== puzzleMove) {
      const altBoard = new Chess(actualPly.fenAfter);
      const altScore = await evaluatePositionForPov(
        engine,
        altBoard,
        winner,
        depth,
        signal,
        actualPly.evalAfter
      );
      if (!altScore || !maintainsAdvantage(altScore, puzzleFinalScore, thresholdCp, maxWinChanceDrop)) {
        return false;
      }
    }

    lastReachedPly = actualPly;
  }

  if (exactMatch) {
    return true;
  }

  const reachedFen = lastReachedPly?.fenAfter ?? startPly.fenAfter;
  const finalBoard = new Chess(reachedFen);
  if (finalBoard.isCheckmate() && finalBoard.turn() !== winner) {
    return true;
  }

  const finalScore = lastReachedPly?.evalAfter
    ? scoreForPov(lastReachedPly.evalAfter, winner)
    : await evaluatePositionForPov(engine, finalBoard, winner, depth, signal);

  if (!finalScore) {
    return false;
  }

  return maintainsAdvantage(finalScore, puzzleFinalScore, thresholdCp, maxWinChanceDrop);
}

/**
 * Pure auto-review caliber gate aligned with `chessticize-server#629`.
 */
export function isAutoReviewCaliberEligible(puzzle: ExtractedGamePuzzle): boolean {
  if (
    puzzle.momentKind === "opponent_mistake_caught" ||
    puzzle.momentKind === "opponent_blunder_caught"
  ) {
    return false;
  }

  if (puzzle.clockRemainingSec !== undefined && puzzle.clockRemainingSec <= SEVERE_TIME_TROUBLE_SEC) {
    return false;
  }

  if (puzzle.cp < MIN_OPPORTUNITY_SCORE_CP) {
    return false;
  }

  if (puzzle.puzzleKind === "arrow_duel") {
    return (
      puzzle.arrowDuel !== undefined &&
      puzzle.arrowDuel.decisionFen.length > 0 &&
      normalizeUci(puzzle.arrowDuel.bestMove) !== normalizeUci(puzzle.arrowDuel.blunderMove)
    );
  }

  if (
    puzzle.solutionMoves.length < 2 ||
    puzzle.solutionMoves.length > AUTO_REVIEW_REGULAR_MAX_PLIES
  ) {
    return false;
  }

  if (puzzle.lengthTag === "veryLong") {
    return false;
  }

  let hasSpecificMotif = false;
  for (const rawTag of puzzle.themes) {
    const normalized = rawTag.trim().toLowerCase();
    if (!normalized) continue;
    if (HARD_DISQUALIFYING_AUTO_REVIEW_TAGS.has(normalized)) {
      return false;
    }
    if (!NON_SPECIFIC_AUTO_REVIEW_TAGS.has(normalized)) {
      hasSpecificMotif = true;
    }
  }

  if (puzzle.solutionMoves.length > 2 && !hasSpecificMotif) {
    return false;
  }

  return true;
}

/**
 * Computes an instructional caliber ranking score favoring outcome-changing Win% swings,
 * clean tactical motifs, and non-time-trouble decisions.
 */
export function computeCaliberScore(puzzle: Omit<ExtractedGamePuzzle, "caliberScore">): number {
  let score = Math.max(0, puzzle.winChanceSwing) * 100;

  const curatedCount = puzzle.themes.filter(isCuratedTheme).length;
  if (curatedCount > 0) {
    score += 20 + Math.min(curatedCount - 1, 2) * 5;
  }

  if (
    puzzle.themes.includes("mateIn1") ||
    puzzle.themes.includes("mateIn2") ||
    puzzle.themes.includes("mateIn3")
  ) {
    score += 15;
  } else if (puzzle.themes.includes("mateIn4") || puzzle.themes.includes("mateIn5")) {
    score -= 10;
  }

  if (puzzle.puzzleKind === "arrow_duel") {
    score += puzzle.arrowDuel && puzzle.arrowDuel.punishmentLine.length > 0 ? 10 : 5;
  } else if (puzzle.lengthTag === "veryLong") {
    score -= 15;
  } else {
    score += 5;
  }

  if (puzzle.clockRemainingSec !== undefined) {
    if (puzzle.clockRemainingSec <= SEVERE_TIME_TROUBLE_SEC) {
      score -= 50;
    } else if (puzzle.clockRemainingSec > 30) {
      score += 5;
    }
  }

  if (isAutoReviewCaliberEligible({ ...puzzle, caliberScore: 0 })) {
    score += 15;
  }

  return Math.round(score * 100) / 100;
}

/**
 * Extracts, verifies, tags, ranks, and caps tactical puzzles and celebration highlights
 * from a game's Pass-1 ply evaluations using a Pass-2 UCI engine adapter.
 */
export async function extractGamePuzzles(
  input: ExtractGamePuzzlesInput,
  engine: PuzzleExtractionEngine,
  options: ExtractGamePuzzlesOptions = {}
): Promise<ExtractGamePuzzlesResult> {
  const maxPuzzlesPerGame = options.maxPuzzlesPerGame ?? DEFAULT_MAX_PUZZLES_PER_GAME;
  const deepLimit = options.deepLimit ?? DEFAULT_DEEP_LIMIT;
  const mateDefenseLimit = options.mateDefenseLimit ?? DEFAULT_MATE_DEFENSE_LIMIT;
  const foundLineDepth = options.foundLineDepth ?? CHECK_FOUND_LINE_DEPTH;
  const signal = options.signal;

  const firstWinner: Color = input.plies[0] ? fenSideToMove(input.plies[0].fenAfter) : "b";
  let prevScore: RelativeScore = input.initialEval
    ? scoreForPov(input.initialEval, firstWinner)
    : cpScore(firstWinner === "w" ? 20 : -20);
  const seenPositions = new Set<string>();
  const allCandidatePuzzles: ExtractedGamePuzzle[] = [];
  const highlights: GameHighlightMoment[] = [];

  for (let i = 0; i < input.plies.length; i += 1) {
    if (signal?.aborted) {
      break;
    }

    const plyInput = input.plies[i]!;
    if (!plyInput.evalAfter) {
      // Stop on missing eval unless game is already over (matches generator.py).
      break;
    }

    if (isIrreversibleMove(plyInput.fenBefore, plyInput.uci)) {
      seenPositions.clear();
    }

    const afterKey = fenPositionKey(plyInput.fenAfter);
    const winner = fenSideToMove(plyInput.fenAfter);
    const currentScore = scoreForPov(plyInput.evalAfter, winner);

    if (seenPositions.has(afterKey)) {
      prevScore = negateRelativeScore(currentScore);
      continue;
    }
    seenPositions.add(afterKey);

    const outcome = await analyzePosition({
      input,
      plyIndex: i,
      prevScore,
      currentScore,
      seenPositions,
      engine,
      deepLimit,
      mateDefenseLimit,
      foundLineDepth,
      checkZugzwangEnabled: Boolean(options.checkZugzwang),
      ...(signal !== undefined ? { signal } : {})
    });

    if (outcome?.kind === "puzzle") {
      allCandidatePuzzles.push(outcome.puzzle);
    } else if (outcome?.kind === "highlight") {
      highlights.push(outcome.highlight);
    }

    prevScore = negateRelativeScore(currentScore);
  }

  // Deduplicate by (positionKey, puzzleKind), keeping highest caliberScore.
  const dedupedByKey = new Map<string, ExtractedGamePuzzle>();
  for (const puzzle of allCandidatePuzzles) {
    const key = `${fenPositionKey(puzzle.initialFen)}|${puzzle.puzzleKind}`;
    const existing = dedupedByKey.get(key);
    if (
      !existing ||
      puzzle.caliberScore > existing.caliberScore ||
      (puzzle.caliberScore === existing.caliberScore && puzzle.winChanceSwing > existing.winChanceSwing)
    ) {
      dedupedByKey.set(key, puzzle);
    }
  }

  const ranked = [...dedupedByKey.values()].sort((a, b) => {
    if (b.caliberScore !== a.caliberScore) {
      return b.caliberScore - a.caliberScore;
    }
    if (b.winChanceSwing !== a.winChanceSwing) {
      return b.winChanceSwing - a.winChanceSwing;
    }
    return a.ply - b.ply;
  });

  const puzzles = maxPuzzlesPerGame > 0 ? ranked.slice(0, maxPuzzlesPerGame) : [];

  return {
    puzzles,
    highlights,
    allCandidatePuzzles: ranked
  };
}

type PositionOutcome =
  | { kind: "puzzle"; puzzle: ExtractedGamePuzzle }
  | { kind: "highlight"; highlight: GameHighlightMoment }
  | null;

interface RawCandidate {
  momentKind: GamePuzzleMomentKind;
  winningMoves: string[];
  prevCp: number;
  cp: number;
  winChanceSwing: number;
  isMultiSolutionBlunder: boolean;
  taggingMoves?: string[];
}

async function analyzePosition(params: {
  input: ExtractGamePuzzlesInput;
  plyIndex: number;
  prevScore: RelativeScore;
  currentScore: RelativeScore;
  seenPositions: ReadonlySet<string>;
  engine: PuzzleExtractionEngine;
  deepLimit: SearchLimitConfig;
  mateDefenseLimit: SearchLimitConfig;
  foundLineDepth: number;
  checkZugzwangEnabled: boolean;
  signal?: AbortSignal;
}): Promise<PositionOutcome> {
  const {
    input,
    plyIndex,
    prevScore,
    currentScore,
    seenPositions,
    engine,
    deepLimit,
    mateDefenseLimit,
    foundLineDepth,
    checkZugzwangEnabled,
    signal
  } = params;

  const plyInput = input.plies[plyIndex]!;
  let nodeBoard: Chess;
  try {
    nodeBoard = new Chess(plyInput.fenAfter);
  } catch {
    return null;
  }

  if (nodeBoard.moves().length < 2) {
    return null;
  }

  const winner = nodeBoard.turn();
  const prevCp = relativeScoreToCp(prevScore, ARROW_DUEL_MATE_SCORE);
  const isMateOpportunity = isForcedMateWithin(currentScore, MAX_MATE_SOON);

  // Already-winning guard: skip if prevScore > +300 cp unless a forced Mate in 1..5 appears.
  if (compareRelativeScores(prevScore, cpScore(ALREADY_WINNING_CP)) > 0 && !isMateOpportunity) {
    return null;
  }

  let candidate: RawCandidate | null = null;

  if (isMateOpportunity) {
    const mateSolution = await cookMate({
      engine,
      fen: plyInput.fenAfter,
      winner,
      deepLimit,
      mateDefenseLimit,
      remainingPlies: MAX_MATE_SOON * 2,
      ...(signal !== undefined ? { signal } : {})
    });
    if (!mateSolution || mateSolution.length === 0) {
      return null;
    }

    const foundWinningLine = await checkIfUserFoundLine({
      engine,
      plies: input.plies,
      startPlyIndex: plyIndex,
      solutionMoves: mateSolution,
      winner,
      depth: foundLineDepth,
      ...(signal !== undefined ? { signal } : {})
    });

    const momentKind: GamePuzzleMomentKind =
      winner === input.userColor
        ? foundWinningLine
          ? "opponent_mistake_caught"
          : "opponent_mistake_missed"
        : foundWinningLine
          ? "own_mistake_punished"
          : "own_mistake_escaped";

    const mateCount = Math.max(1, Math.ceil(mateSolution.length / 2));
    candidate = {
      momentKind,
      winningMoves: mateSolution,
      prevCp,
      cp: relativeScoreToCp(mateScore(mateCount), ARROW_DUEL_MATE_SCORE),
      winChanceSwing: Math.max(0, 1 - winChances(prevScore)),
      isMultiSolutionBlunder: false
    };
  } else if (
    compareRelativeScores(currentScore, cpScore(MIN_OPPORTUNITY_SCORE_CP)) >= 0 &&
    winChances(currentScore) > winChances(prevScore) + WIN_CHANCE_SWING_THRESHOLD
  ) {
    const cooked = await cookAdvantage({
      engine,
      fen: plyInput.fenAfter,
      winner,
      deepLimit,
      seenPositions: new Set(seenPositions),
      depth: 0,
      ...(signal !== undefined ? { signal } : {})
    });

    if (!cooked || cooked.length === 0) {
      // Multi-solution blunder branch: re-verify at deep limit (depth-10 hallucination guard).
      const moves = await getNextMoves(engine, plyInput.fenAfter, winner, deepLimit, signal);
      if (!moves) {
        return null;
      }
      if (
        compareRelativeScores(moves.best.score, cpScore(MIN_OPPORTUNITY_SCORE_CP)) < 0 ||
        winChances(moves.best.score) <= winChances(prevScore) + WIN_CHANCE_SWING_THRESHOLD
      ) {
        return null;
      }

      const foundWinningLine = await checkIfUserFoundLine({
        engine,
        plies: input.plies,
        startPlyIndex: plyIndex,
        solutionMoves: [moves.best.move],
        winner,
        depth: foundLineDepth,
        ...(signal !== undefined ? { signal } : {})
      });

      const momentKind: GamePuzzleMomentKind =
        winner === input.userColor
          ? foundWinningLine
            ? "opponent_blunder_caught"
            : "opponent_blunder_missed"
          : foundWinningLine
            ? "own_blunder_punished"
            : "own_blunder_escaped";

      const taggingMoves =
        moves.best.pv.length >= 3 ? moves.best.pv.slice(0, 3) : undefined;

      candidate = {
        momentKind,
        winningMoves: [moves.best.move],
        prevCp,
        cp: relativeScoreToCp(moves.best.score, ARROW_DUEL_MATE_SCORE),
        winChanceSwing: Math.max(0, winChances(moves.best.score) - winChances(prevScore)),
        isMultiSolutionBlunder: true,
        ...(taggingMoves !== undefined ? { taggingMoves } : {})
      };
    } else {
      // Prune trailing even-length tails and trailing only-moves.
      const pruned = [...cooked];
      while (pruned.length > 0 && (pruned.length % 2 === 0 || !pruned[pruned.length - 1]?.second)) {
        pruned.pop();
      }
      if (pruned.length === 0) {
        return null;
      }

      const firstScore = pruned[0]!.best.score;
      const lastScore = pruned[pruned.length - 1]!.best.score;
      // Depth-10 hallucination guard on advantage branch.
      if (
        compareRelativeScores(firstScore, cpScore(MIN_OPPORTUNITY_SCORE_CP)) < 0 ||
        compareRelativeScores(lastScore, cpScore(MIN_OPPORTUNITY_SCORE_CP)) < 0 ||
        winChances(firstScore) <= winChances(prevScore) + WIN_CHANCE_SWING_THRESHOLD
      ) {
        return null;
      }

      const winningMoves = pruned.map((p) => p.best.move);
      const foundWinningLine = await checkIfUserFoundLine({
        engine,
        plies: input.plies,
        startPlyIndex: plyIndex,
        solutionMoves: winningMoves,
        winner,
        depth: foundLineDepth,
        ...(signal !== undefined ? { signal } : {})
      });

      const momentKind: GamePuzzleMomentKind =
        winner === input.userColor
          ? foundWinningLine
            ? "opponent_mistake_caught"
            : "opponent_mistake_missed"
          : foundWinningLine
            ? "own_mistake_punished"
            : "own_mistake_escaped";

      candidate = {
        momentKind,
        winningMoves,
        prevCp,
        cp: relativeScoreToCp(lastScore, ARROW_DUEL_MATE_SCORE),
        winChanceSwing: Math.max(0, winChances(firstScore) - winChances(prevScore)),
        isMultiSolutionBlunder: false
      };
    }
  } else {
    return null;
  }

  // --- 8-Case Routing ---

  // 1) opponent_*_caught -> NEVER emit as puzzle; return celebration highlight.
  if (
    candidate.momentKind === "opponent_mistake_caught" ||
    candidate.momentKind === "opponent_blunder_caught"
  ) {
    const userReply = input.plies[plyIndex + 1];
    const highlightPly = userReply ?? plyInput;
    const highlightUci = normalizeUci(highlightPly.uci);
    return {
      kind: "highlight",
      highlight: {
        ply: highlightPly.ply,
        moveNumber: fenFullmoveNumber(highlightPly.fenBefore),
        momentKind: candidate.momentKind,
        uci: highlightUci,
        san: highlightPly.san ?? sanForUci(highlightPly.fenBefore, highlightUci),
        winChanceGain: Math.round(candidate.winChanceSwing * 10000) / 10000
      }
    };
  }

  const setupMove = normalizeUci(plyInput.uci);
  const rawTacticalMoves = [setupMove, ...candidate.winningMoves];
  const enrichedPvMoves = candidate.taggingMoves
    ? [setupMove, ...candidate.taggingMoves]
    : undefined;

  const tagResult = enrichedPvMoves
    ? tagPuzzleWithPvEnrichment({
        initialFen: plyInput.fenBefore,
        solutionMoves: rawTacticalMoves,
        cp: candidate.cp,
        ply: plyInput.ply,
        pvMoves: enrichedPvMoves
      })
    : tagPuzzle({
        initialFen: plyInput.fenBefore,
        solutionMoves: rawTacticalMoves,
        cp: candidate.cp,
        ply: plyInput.ply
      });

  const themes = [...tagResult.themes];
  if (checkZugzwangEnabled && !candidate.isMultiSolutionBlunder) {
    const isZugzwang = await checkZugzwang({
      engine,
      initialFen: plyInput.fenBefore,
      solutionMoves: rawTacticalMoves,
      limit: deepLimit,
      ...(signal !== undefined ? { signal } : {})
    });
    if (isZugzwang && !themes.includes("zugzwang")) {
      themes.push("zugzwang");
    }
  }

  const clockMetrics = extractClockMetrics(input.plies, plyIndex, candidate.momentKind, input.timeControl);

  // 2) own_* (punished AND escaped) -> ALWAYS generate puzzle!
  // Prioritize Arrow Duel on parentFen (`fenBefore`), falling back to `line` only when a clean unique tactical line exists.
  if (OWN_MOMENT_KINDS.has(candidate.momentKind)) {
    const arrowDuel = await verifyArrowDuelPair({
      engine,
      decisionFen: plyInput.fenBefore,
      blunderMove: setupMove,
      expectedUserColor: input.userColor,
      limit: deepLimit,
      ...(signal !== undefined ? { signal } : {})
    });

    if (arrowDuel) {
      return {
        kind: "puzzle",
        puzzle: buildExtractedPuzzle({
          gameId: input.gameId,
          ply: plyInput.ply,
          moveNumber: fenFullmoveNumber(plyInput.fenBefore),
          puzzleKind: "arrow_duel",
          momentKind: candidate.momentKind,
          userColor: input.userColor,
          puzzleColor: input.userColor,
          initialFen: arrowDuel.decisionFen,
          solutionMoves: [arrowDuel.blunderMove, ...arrowDuel.punishmentLine],
          prevCp: candidate.prevCp,
          cp: candidate.cp,
          winChanceSwing: candidate.winChanceSwing,
          arrowDuel,
          themes,
          lengthTag: tagResult.lengthTag,
          phaseTag: tagResult.phaseTag,
          clockMetrics
        })
      };
    }

    // Fallback to `line` only if a clean unique tactical line exists (not a multi-solution blunder).
    if (!candidate.isMultiSolutionBlunder) {
      return {
        kind: "puzzle",
        puzzle: buildExtractedPuzzle({
          gameId: input.gameId,
          ply: plyInput.ply,
          moveNumber: fenFullmoveNumber(plyInput.fenBefore),
          puzzleKind: "line",
          momentKind: candidate.momentKind,
          userColor: input.userColor,
          puzzleColor: winner,
          initialFen: plyInput.fenBefore,
          solutionMoves: rawTacticalMoves,
          prevCp: candidate.prevCp,
          cp: candidate.cp,
          winChanceSwing: candidate.winChanceSwing,
          themes,
          lengthTag: tagResult.lengthTag,
          phaseTag: tagResult.phaseTag,
          clockMetrics
        })
      };
    }

    return null;
  }

  // 3) opponent_blunder_missed -> Arrow Duel on nodeFen (`fenAfter`) comparing bestMove vs user's actual missed move.
  if (candidate.momentKind === "opponent_blunder_missed") {
    const actualUserPly = input.plies[plyIndex + 1];
    if (!actualUserPly) {
      return null;
    }

    const arrowDuel = await verifyArrowDuelPair({
      engine,
      decisionFen: plyInput.fenAfter,
      blunderMove: actualUserPly.uci,
      expectedUserColor: input.userColor,
      limit: deepLimit,
      ...(signal !== undefined ? { signal } : {})
    });
    if (!arrowDuel) {
      return null;
    }

    return {
      kind: "puzzle",
      puzzle: buildExtractedPuzzle({
        gameId: input.gameId,
        ply: actualUserPly.ply,
        moveNumber: fenFullmoveNumber(plyInput.fenAfter),
        puzzleKind: "arrow_duel",
        momentKind: candidate.momentKind,
        userColor: input.userColor,
        puzzleColor: input.userColor,
        initialFen: arrowDuel.decisionFen,
        solutionMoves: [arrowDuel.blunderMove, ...arrowDuel.punishmentLine],
        prevCp: candidate.prevCp,
        cp: candidate.cp,
        winChanceSwing: candidate.winChanceSwing,
        arrowDuel,
        themes,
        lengthTag: tagResult.lengthTag,
        phaseTag: tagResult.phaseTag,
        clockMetrics
      })
    };
  }

  // 4) opponent_mistake_missed -> `line` puzzle with unique multi-move / mate line.
  return {
    kind: "puzzle",
    puzzle: buildExtractedPuzzle({
      gameId: input.gameId,
      ply: plyInput.ply,
      moveNumber: fenFullmoveNumber(plyInput.fenBefore),
      puzzleKind: "line",
      momentKind: candidate.momentKind,
      userColor: input.userColor,
      puzzleColor: winner,
      initialFen: plyInput.fenBefore,
      solutionMoves: rawTacticalMoves,
      prevCp: candidate.prevCp,
      cp: candidate.cp,
      winChanceSwing: candidate.winChanceSwing,
      themes,
      lengthTag: tagResult.lengthTag,
      phaseTag: tagResult.phaseTag,
      clockMetrics
    })
  };
}

function buildExtractedPuzzle(params: {
  gameId: string | undefined;
  ply: number;
  moveNumber: number;
  puzzleKind: "line" | "arrow_duel";
  momentKind: GamePuzzleMomentKind;
  userColor: Color;
  puzzleColor: Color;
  initialFen: string;
  solutionMoves: string[];
  prevCp: number;
  cp: number;
  winChanceSwing: number;
  arrowDuel?: ExtractedArrowDuelMeta;
  themes: string[];
  lengthTag: ExtractedGamePuzzle["lengthTag"];
  phaseTag: ExtractedGamePuzzle["phaseTag"];
  clockMetrics: { clockRemainingSec?: number; timeSpentSec?: number };
}): ExtractedGamePuzzle {
  const idSeed = [
    params.gameId ?? "game",
    String(params.ply),
    params.puzzleKind,
    params.momentKind,
    fenPositionKey(params.initialFen),
    params.solutionMoves.join(",")
  ].join(":");

  const base: Omit<ExtractedGamePuzzle, "caliberScore"> = {
    idSeed,
    ply: params.ply,
    moveNumber: params.moveNumber,
    puzzleKind: params.puzzleKind,
    momentKind: params.momentKind,
    userColor: params.userColor,
    puzzleColor: params.puzzleColor,
    initialFen: params.initialFen,
    solutionMoves: params.solutionMoves,
    prevCp: params.prevCp,
    cp: params.cp,
    winChanceSwing: Math.round(params.winChanceSwing * 10000) / 10000,
    ...(params.arrowDuel !== undefined ? { arrowDuel: params.arrowDuel } : {}),
    themes: params.themes,
    lengthTag: params.lengthTag,
    phaseTag: params.phaseTag,
    ...(params.clockMetrics.clockRemainingSec !== undefined
      ? { clockRemainingSec: params.clockMetrics.clockRemainingSec }
      : {}),
    ...(params.clockMetrics.timeSpentSec !== undefined
      ? { timeSpentSec: params.clockMetrics.timeSpentSec }
      : {})
  };

  return {
    ...base,
    caliberScore: computeCaliberScore(base)
  };
}

async function getNextMoves(
  engine: PuzzleExtractionEngine,
  fen: string,
  winner: Color,
  limit: SearchLimitConfig,
  signal?: AbortSignal
): Promise<NextMovesPair | null> {
  const board = new Chess(fen);
  if (board.isGameOver()) {
    return null;
  }

  const rawLines = await engine.analyze({
    fen,
    ...limit,
    multiPv: 3,
    priority: "batch",
    ...(signal !== undefined ? { signal } : {})
  });

  const sorted = sortAnalysisLines(rawLines);
  const firstLine = sorted[0];
  if (!firstLine || !firstLine.move) {
    return null;
  }

  const best = toCandidate(firstLine, winner);
  const second = sorted[1]?.move ? toCandidate(sorted[1], winner) : undefined;
  const third = sorted[2]?.move ? toCandidate(sorted[2], winner) : undefined;

  return {
    best,
    ...(second !== undefined ? { second } : {}),
    ...(third !== undefined ? { third } : {})
  };
}

async function cookMate(params: {
  engine: PuzzleExtractionEngine;
  fen: string;
  winner: Color;
  deepLimit: SearchLimitConfig;
  mateDefenseLimit: SearchLimitConfig;
  remainingPlies: number;
  signal?: AbortSignal;
}): Promise<string[] | null> {
  const { engine, fen, winner, deepLimit, mateDefenseLimit, remainingPlies, signal } = params;
  const board = new Chess(fen);

  if (board.isCheckmate()) {
    return board.turn() !== winner ? [] : null;
  }
  if (board.isGameOver() || remainingPlies <= 0) {
    return null;
  }

  let move: string | null = null;
  if (board.turn() === winner) {
    const pair = await getNextMoves(engine, fen, winner, deepLimit, signal);
    if (!pair || !isValidAttack(pair.best, pair.second)) {
      return null;
    }
    if (!isForcedMateWithin(pair.best.score, MAX_MATE_SOON)) {
      return null;
    }
    move = pair.best.move;
  } else {
    const defenseLines = await engine.analyze({
      fen,
      ...mateDefenseLimit,
      multiPv: 1,
      priority: "batch",
      ...(signal !== undefined ? { signal } : {})
    });
    const topDefense = sortAnalysisLines(defenseLines)[0];
    move = topDefense?.move ? normalizeUci(topDefense.move) : null;
  }

  if (!move) {
    return null;
  }

  const nextFen = fenAfterUci(fen, move);
  if (!nextFen) {
    return null;
  }

  const followUp = await cookMate({
    engine,
    fen: nextFen,
    winner,
    deepLimit,
    mateDefenseLimit,
    remainingPlies: remainingPlies - 1,
    ...(signal !== undefined ? { signal } : {})
  });
  if (followUp === null) {
    return null;
  }

  return [move, ...followUp];
}

async function cookAdvantage(params: {
  engine: PuzzleExtractionEngine;
  fen: string;
  winner: Color;
  deepLimit: SearchLimitConfig;
  seenPositions: Set<string>;
  depth: number;
  signal?: AbortSignal;
}): Promise<NextMovesPair[] | null> {
  const { engine, fen, winner, deepLimit, seenPositions, depth, signal } = params;

  if (depth >= MAX_COOK_ADVANTAGE_PLIES) {
    return [];
  }

  const board = new Chess(fen);
  if (board.isGameOver()) {
    return [];
  }

  const posKey = fenPositionKey(fen);
  // Repetition guard inside the cooked tactical line (matches board.is_repetition(2)).
  if (depth > 0 && seenPositions.has(posKey)) {
    return null;
  }

  const pair = await getNextMoves(engine, fen, winner, deepLimit, signal);
  if (!pair) {
    return [];
  }

  if (board.turn() === winner && !isValidAttack(pair.best, pair.second)) {
    return [];
  }

  const nextFen = fenAfterUci(fen, pair.best.move);
  if (!nextFen) {
    return [];
  }

  const nextSeen = isIrreversibleMove(fen, pair.best.move)
    ? new Set<string>()
    : new Set<string>(seenPositions);
  nextSeen.add(posKey);

  const followUp = await cookAdvantage({
    engine,
    fen: nextFen,
    winner,
    deepLimit,
    seenPositions: nextSeen,
    depth: depth + 1,
    ...(signal !== undefined ? { signal } : {})
  });
  if (followUp === null) {
    return null;
  }

  return [pair, ...followUp];
}

async function evaluatePositionForPov(
  engine: PuzzleExtractionEngine,
  board: Chess,
  pov: Color,
  depth: number,
  signal?: AbortSignal,
  fallbackEval?: GamePlyEvalInput["evalAfter"]
): Promise<RelativeScore | null> {
  if (board.isCheckmate()) {
    return board.turn() !== pov ? mateScore(0) : mateScore(-0);
  }
  if (board.isDraw()) {
    return cpScore(0);
  }

  const lines = await engine.analyze({
    fen: board.fen(),
    depth,
    multiPv: 1,
    priority: "batch",
    ...(signal !== undefined ? { signal } : {})
  });
  const top = sortAnalysisLines(lines)[0];
  if (top) {
    return scoreForPov(top.score, pov);
  }
  if (fallbackEval) {
    return scoreForPov(fallbackEval, pov);
  }
  return null;
}

function resolvePlyClock(ply?: GamePlyEvalInput): number | undefined {
  if (!ply) {
    return undefined;
  }
  if (ply.clockRemainingSec !== undefined && Number.isFinite(ply.clockRemainingSec)) {
    return Math.round(ply.clockRemainingSec * 100) / 100;
  }
  return parseClockSecondsFromComment(ply.comment);
}

function extractClockMetrics(
  plies: readonly GamePlyEvalInput[],
  plyIndex: number,
  momentKind: GamePuzzleMomentKind,
  timeControl?: string
): { clockRemainingSec?: number; timeSpentSec?: number } {
  const isOwn = OWN_MOMENT_KINDS.has(momentKind);
  const decisionPly = isOwn ? plies[plyIndex] : plies[plyIndex + 1];
  const prevUserPly = isOwn ? plies[plyIndex - 2] : plies[plyIndex - 1];

  const rem = resolvePlyClock(decisionPly);
  if (rem === undefined || !decisionPly) {
    return {};
  }

  const { baseSec, incSec } = parseTimeControl(timeControl);
  const prevClock = resolvePlyClock(prevUserPly);

  let spent: number | undefined;
  if (prevClock !== undefined) {
    spent = Math.max(0, Math.round((prevClock + incSec - rem) * 100) / 100);
  } else if (baseSec !== null && decisionPly.ply <= 2) {
    spent = Math.max(0, Math.round((baseSec - rem) * 100) / 100);
  }

  return {
    clockRemainingSec: rem,
    ...(spent !== undefined ? { timeSpentSec: spent } : {})
  };
}

function toCandidate(line: EngineAnalysisLine, winner: Color): EngineMoveCandidate {
  const move = normalizeUci(line.move);
  const pv = line.pv.length > 0 ? line.pv.map(normalizeUci) : [move];
  return {
    move,
    score: scoreForPov(line.score, winner),
    pv
  };
}

function sortAnalysisLines(lines: readonly EngineAnalysisLine[]): EngineAnalysisLine[] {
  return [...lines].sort((a, b) => a.multipv - b.multipv);
}
