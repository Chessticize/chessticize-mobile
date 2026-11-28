/*
 * Offline puzzle difficulty estimator (Standard & Arrow Duel).
 * Pure TypeScript domain module: zero React Native or native runtime dependencies.
 * Matches `Chessticize/lichess-presolver` (`rate_arrow_duel_puzzles.py` and
 * `train_puzzle_difficulty_model.py`).
 */

import { Chess } from "chess.js";
import type { EngineAnalysisLine } from "../engine-analysis.ts";
import type { UserGamePuzzleRatingSource } from "../types.ts";
import {
  normalizeUci,
  parseUciMove,
  relativeScoreToCp,
  scoreForPov,
  tryPlayUci
} from "./score.ts";
import type {
  ExtractedGamePuzzle,
  PuzzleExtractionEngine
} from "./types.ts";
import {
  DEFAULT_MAIA2_SF_V1_MODEL,
  DEFAULT_SF_HEURISTIC_V1_MODEL
} from "./difficulty-models.ts";

export const DIFFICULTY_MIN_RATING = 600;
export const DIFFICULTY_MAX_RATING = 2200;
export const DEFAULT_MAX_REVIEW_ABOVE_USER_RATING = 300;
export const MAIA2_MOBILE_ELOS: readonly [number, number] = [1100, 1700];
export const ARROW_DUEL_ELO_GRID: readonly number[] = [700, 1100, 1500, 1900, 2300];
export const DIFFICULTY_SF_DEPTHS: readonly number[] = [1, 2, 4, 8];

const GLICKO_SCALE = 400 / Math.log(10); // 173.71779276130073
const CLAMP_CP_LIMIT = 1500;
const EPS = 1e-6;

const PIECE_VALUES: Readonly<Record<string, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

export interface HumanPolicyMoveRequest {
  fen: string;
  moves: readonly string[];
  elos: readonly number[];
}

export interface HumanPolicyEloStats {
  /** Probability of each requested UCI move under the legal move distribution. */
  probs: Readonly<Record<string, number>>;
  /** 1-indexed rank of each requested UCI move among all legal moves (1 = top human choice). */
  ranks?: Readonly<Record<string, number>>;
  /** Probability of the single most likely legal human move in this position. */
  top1Prob?: number;
  /** Shannon entropy (nats) of the legal human move distribution. */
  entropy?: number;
}

export interface HumanPolicyMoveResult {
  byElo: Readonly<Record<number, HumanPolicyEloStats>>;
}

/**
 * Injectable human-move policy interface (e.g., on-device Maia-2 INT8 ONNX or test fake).
 */
export interface HumanPolicyModel {
  scoreMoves(
    requests: readonly HumanPolicyMoveRequest[]
  ): Promise<readonly HumanPolicyMoveResult[]>;
}

export interface ExportedDecisionTree {
  /** Feature index per node (-2 for leaf). */
  f: readonly number[];
  /** Split threshold per node. */
  t: readonly number[];
  /** Left child index (-1 for leaf). */
  l: readonly number[];
  /** Right child index (-1 for leaf). */
  r: readonly number[];
  /** Leaf value per node. */
  v: readonly number[];
}

export interface ExportedTreeEnsemble {
  schemaVersion: number;
  modelId: string;
  createdAt?: string;
  featureNames: readonly string[];
  learningRate: number;
  initValue: number;
  minRating: number;
  maxRating: number;
  linearCalibration: {
    slope: number;
    intercept: number;
  };
  metrics?: Readonly<Record<string, number>>;
  trees: readonly ExportedDecisionTree[];
}

export interface PuzzleDifficultyEstimate {
  /** Effective rating for this puzzle's kind (Standard for `line`, Arrow Duel for `arrow_duel`). */
  rating: number;
  /** Underlying Standard tactic rating estimate (Lichess-aligned 600–2200). */
  standardRating: number;
  /** Dedicated Arrow Duel rating when `puzzleKind === "arrow_duel"`. */
  arrowDuelRating?: number;
  ratingSource: UserGamePuzzleRatingSource;
}

export interface EstimatePuzzleDifficultyOptions {
  humanPolicy?: HumanPolicyModel;
  sfHeuristicModel?: ExportedTreeEnsemble;
  maia2SfModel?: ExportedTreeEnsemble;
  arrowDuelCheckRate?: number;
  signal?: AbortSignal;
}

let defaultSfHeuristicModel: ExportedTreeEnsemble | undefined = DEFAULT_SF_HEURISTIC_V1_MODEL;
let defaultMaia2SfModel: ExportedTreeEnsemble | undefined = DEFAULT_MAIA2_SF_V1_MODEL;

export function registerDefaultDifficultyModels(models: {
  sfHeuristicModel?: ExportedTreeEnsemble;
  maia2SfModel?: ExportedTreeEnsemble;
}): void {
  if (models.sfHeuristicModel !== undefined) {
    defaultSfHeuristicModel = models.sfHeuristicModel;
  }
  if (models.maia2SfModel !== undefined) {
    defaultMaia2SfModel = models.maia2SfModel;
  }
}

export function getDefaultDifficultyModels(): {
  sfHeuristicModel?: ExportedTreeEnsemble;
  maia2SfModel?: ExportedTreeEnsemble;
} {
  return {
    ...(defaultSfHeuristicModel === undefined ? {} : { sfHeuristicModel: defaultSfHeuristicModel }),
    ...(defaultMaia2SfModel === undefined ? {} : { maia2SfModel: defaultMaia2SfModel })
  };
}

/**
 * Pure TypeScript evaluator for scikit-learn `GradientBoostingRegressor` trees exported
 * by `train_puzzle_difficulty_model.py`. Zero external runtime dependencies.
 */
export function evaluateTreeEnsemble(
  model: ExportedTreeEnsemble,
  features: Readonly<Record<string, number>>
): number {
  const vec = model.featureNames.map((name) => {
    const val = features[name];
    return typeof val === "number" && Number.isFinite(val) ? val : 0;
  });

  let acc = model.initValue;
  const lr = model.learningRate;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.l[node] !== -1) {
      const featIdx = tree.f[node]!;
      const threshold = tree.t[node]!;
      node = (vec[featIdx] ?? 0) <= threshold ? tree.l[node]! : tree.r[node]!;
    }
    acc += lr * (tree.v[node] ?? 0);
  }

  const calibrated = acc * model.linearCalibration.slope + model.linearCalibration.intercept;
  return clampRating(calibrated, model.minRating, model.maxRating);
}

/**
 * First-principles prompted-comparison Arrow Duel rating solver:
 *
 *   p_refute(E) = checkRate * sigmoid((E - standardRating) / 173.7178)
 *   P_AD(E)     = p_refute(E) + (1 - p_refute(E)) * q_human(E)
 *
 * Solved at `P_AD(E*) = targetProb` (default 0.75, matching the 3PL-IRT c=0.5 midpoint
 * so neutral intuition q=0.5 maps E* == standardRating on the exact same Elo scale).
 */
export function solvePromptedArrowDuelRating(
  standardRating: number,
  elos: readonly number[],
  qs: readonly number[],
  options: {
    targetProb?: number;
    checkRate?: number;
    minRating?: number;
    maxRating?: number;
  } = {}
): number {
  const targetProb = options.targetProb ?? 0.75;
  const checkRate = options.checkRate ?? 1.0;
  const minRating = options.minRating ?? DIFFICULTY_MIN_RATING;
  const maxRating = options.maxRating ?? DIFFICULTY_MAX_RATING;

  if (elos.length === 0 || elos.length !== qs.length) {
    return clampRating(standardRating, minRating, maxRating);
  }

  const step = 5;
  let prevE = 400;
  let prevP = evalPromptedArrowDuelProb(prevE, standardRating, elos, qs, checkRate);
  if (prevP >= targetProb) {
    return minRating;
  }

  for (let e = 400 + step; e <= 2800; e += step) {
    const p = evalPromptedArrowDuelProb(e, standardRating, elos, qs, checkRate);
    if (p >= targetProb) {
      const frac = (targetProb - prevP) / Math.max(1e-9, p - prevP);
      return clampRating(prevE + frac * step, minRating, maxRating);
    }
    prevE = e;
    prevP = p;
  }

  return maxRating;
}

/**
 * Checks whether a puzzle's estimated difficulty falls within a player's review target
 * ceiling (default: `userRating + 300`, so a 1400 player skips 1900–2000 engine tactics).
 */
export function isWithinReviewDifficultyBand(
  puzzleRating: number,
  userRating: number | undefined,
  maxAboveUserRating: number = DEFAULT_MAX_REVIEW_ABOVE_USER_RATING
): boolean {
  if (userRating === undefined || !Number.isFinite(userRating)) {
    return true;
  }
  if (!Number.isFinite(puzzleRating)) {
    return true;
  }
  return puzzleRating <= userRating + maxAboveUserRating;
}

/**
 * Extracts the exact 14 structural chess features matching `STRUCTURAL_FEATURE_NAMES`
 * in `lichess-presolver/train_puzzle_difficulty_model.py`.
 */
export function extractDifficultyStructuralFeatures(
  initialFen: string,
  solutionMoves: readonly string[]
): Record<string, number> {
  const b0 = new Chess(initialFen);
  const blunderUci = solutionMoves[0];
  const b1 = new Chess(b0.fen());
  if (blunderUci) {
    tryPlayUci(b1, blunderUci);
  }

  let isCapture = 0;
  let isCheck = 0;
  let isMate1 = 0;
  let isQuiet = 0;
  let isPromo = 0;
  let pieceVal = 0;
  let capVal = 0;
  let isSac = 0;

  const firstSolUci = solutionMoves[1];
  if (firstSolUci) {
    const parsed = parseUciMove(firstSolUci);
    if (parsed) {
      const movedPiece = b1.get(parsed.from);
      const targetPiece = b1.get(parsed.to);
      const bAfter = new Chess(b1.fen());
      const played = tryPlayUci(bAfter, firstSolUci);
      if (played) {
        const cap = played.isCapture();
        const chk = bAfter.inCheck();
        const mate1 = bAfter.isCheckmate();
        const mvV = movedPiece ? (PIECE_VALUES[movedPiece.type] ?? 0) : 0;
        const cpV = targetPiece
          ? (PIECE_VALUES[targetPiece.type] ?? 0)
          : played.isEnPassant()
            ? 1
            : 0;
        const oppColor = bAfter.turn();
        const attacked = bAfter.isAttacked(parsed.to, oppColor);
        isCapture = cap ? 1 : 0;
        isCheck = chk ? 1 : 0;
        isMate1 = mate1 ? 1 : 0;
        isQuiet = !cap && !chk ? 1 : 0;
        isPromo = parsed.promotion !== undefined ? 1 : 0;
        pieceVal = mvV;
        capVal = cpV;
        isSac = mvV > cpV && attacked ? 1 : 0;
      }
    }
  }

  let pieceCount = 0;
  let queensOnBoard = 0;
  for (const row of b1.board()) {
    for (const sq of row) {
      if (!sq) continue;
      pieceCount += 1;
      if (sq.type === "q") {
        queensOnBoard += 1;
      }
    }
  }

  return {
    n_solution_moves: solutionMoves.length,
    n_solver_moves: Math.floor(solutionMoves.length / 2),
    n_pieces: pieceCount,
    n_legal_moves_solver: b1.moves().length,
    queens_on_board: queensOnBoard,
    is_endgame: pieceCount <= 12 ? 1 : 0,
    std_m1_is_capture: isCapture,
    std_m1_is_check: isCheck,
    std_m1_is_mate1: isMate1,
    std_m1_is_quiet: isQuiet,
    std_m1_is_promo: isPromo,
    std_m1_piece_val: pieceVal,
    std_m1_cap_val: capVal,
    std_m1_is_sac: isSac
  };
}

/**
 * Extracts the exact 9 shallow-to-deep Stockfish features (`depth = 1, 2, 4, 8` + MultiPV 2 at depth 8)
 * matching `SF_STD_FEATURE_NAMES` in `lichess-presolver/train_puzzle_difficulty_model.py`.
 */
export async function extractDifficultyStockfishFeatures(
  initialFen: string,
  solutionMoves: readonly string[],
  engine: PuzzleExtractionEngine,
  options: { signal?: AbortSignal } = {}
): Promise<Record<string, number>> {
  const b1 = new Chess(initialFen);
  if (solutionMoves[0]) {
    tryPlayUci(b1, solutionMoves[0]);
  }
  const solverFen = b1.fen();
  const solverColor = b1.turn();
  const firstSol = solutionMoves[1] ? normalizeUci(solutionMoves[1]) : undefined;

  let foundDepth = 12;
  const evals: Record<number, number> = { 1: 0, 2: 0, 4: 0, 8: 0 };

  for (const depth of DIFFICULTY_SF_DEPTHS) {
    const lines = await engine.analyze({
      fen: solverFen,
      depth,
      multiPv: 1,
      priority: "batch",
      ...(options.signal === undefined ? {} : { signal: options.signal })
    });
    const top = pickTopLine(lines);
    if (top) {
      evals[depth] = clampEvalCp(top, solverColor);
      if (firstSol && normalizeUci(top.move) === firstSol && foundDepth === 12) {
        foundDepth = depth;
      }
    }
  }

  let multiPvGapD8 = CLAMP_CP_LIMIT;
  const mpvLines = await engine.analyze({
    fen: solverFen,
    depth: 8,
    multiPv: 2,
    priority: "batch",
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  const sortedMpv = [...mpvLines].sort((a, b) => a.multipv - b.multipv);
  if (sortedMpv.length >= 2) {
    multiPvGapD8 =
      clampEvalCp(sortedMpv[0]!, solverColor) - clampEvalCp(sortedMpv[1]!, solverColor);
  }

  return {
    sf_std_found_depth: foundDepth,
    sf_std_eval_d1: evals[1]!,
    sf_std_eval_d2: evals[2]!,
    sf_std_eval_d4: evals[4]!,
    sf_std_eval_d8: evals[8]!,
    sf_std_jump_d8_d1: evals[8]! - evals[1]!,
    sf_std_jump_d8_d2: evals[8]! - evals[2]!,
    sf_std_jump_d8_d4: evals[8]! - evals[4]!,
    sf_std_multipv_gap_d8: multiPvGapD8
  };
}

/**
 * Extracts the 18 Mobile-Lite 2-Elo Maia-2 features matching `MAIA2_STD_FEATURE_NAMES`.
 */
export async function extractDifficultyMaia2Features(
  initialFen: string,
  solutionMoves: readonly string[],
  humanPolicy: HumanPolicyModel
): Promise<Record<string, number>> {
  const b = new Chess(initialFen);
  if (solutionMoves[0]) {
    tryPlayUci(b, solutionMoves[0]);
  }

  const requests: HumanPolicyMoveRequest[] = [];
  const targetMoves: string[] = [];
  for (let k = 1; k < Math.min(solutionMoves.length, 9); k += 2) {
    const move = normalizeUci(solutionMoves[k]!);
    requests.push({
      fen: b.fen(),
      moves: [move],
      elos: MAIA2_MOBILE_ELOS
    });
    targetMoves.push(move);
    if (!tryPlayUci(b, move)) {
      break;
    }
    if (k + 1 < solutionMoves.length) {
      if (!tryPlayUci(b, solutionMoves[k + 1]!)) {
        break;
      }
    }
  }

  const results = requests.length > 0 ? await humanPolicy.scoreMoves(requests) : [];
  const features: Record<string, number> = {};
  const p1ByElo: number[] = [];
  const lineLogPByElo: number[] = [];

  for (const elo of MAIA2_MOBILE_ELOS) {
    const ps: number[] = [];
    const rs: number[] = [];
    const t1s: number[] = [];
    const ents: number[] = [];

    for (let j = 0; j < results.length; j += 1) {
      const stats = results[j]?.byElo[elo];
      const move = targetMoves[j]!;
      const p = stats?.probs[move] ?? 0.5;
      const r = stats?.ranks?.[move] ?? 1;
      const t1 = stats?.top1Prob ?? Math.max(p, 0.5);
      const ent = stats?.entropy ?? 1.0;
      ps.push(p);
      rs.push(r);
      t1s.push(t1);
      ents.push(ent);
    }

    if (ps.length === 0) {
      ps.push(0.5);
      rs.push(1);
      t1s.push(0.5);
      ents.push(1.0);
    }

    let lineLogP = 0;
    let minP = ps[0]!;
    let maxR = rs[0]!;
    for (let j = 0; j < ps.length; j += 1) {
      lineLogP += Math.log(ps[j]! + EPS);
      if (ps[j]! < minP) minP = ps[j]!;
      if (rs[j]! > maxR) maxR = rs[j]!;
    }

    const p0 = ps[0]!;
    features[`m2_m1_p_${elo}`] = p0;
    features[`m2_m1_logp_${elo}`] = Math.log(p0 + EPS);
    features[`m2_m1_rank_${elo}`] = rs[0]!;
    features[`m2_m1_logratio_${elo}`] = Math.log((p0 + EPS) / (t1s[0]! + EPS));
    features[`m2_line_logp_${elo}`] = lineLogP;
    features[`m2_line_minp_${elo}`] = minP;
    features[`m2_line_maxrank_${elo}`] = maxR;
    features[`m2_m1_ent_${elo}`] = ents[0]!;

    p1ByElo.push(p0);
    lineLogPByElo.push(lineLogP);
  }

  features.m2_m1_slope = (p1ByElo[1] ?? 0) - (p1ByElo[0] ?? 0);
  features.m2_line_logp_slope = (lineLogPByElo[1] ?? 0) - (lineLogPByElo[0] ?? 0);
  return features;
}

/**
 * Estimates offline difficulty rating for an extracted personal-game puzzle (both `line` and `arrow_duel`).
 * Uses `maia2_sf_v1` when `humanPolicy` is provided; gracefully falls back to `sf_heuristic_v1`.
 */
export async function estimateGamePuzzleDifficulty(
  puzzle: Pick<ExtractedGamePuzzle, "puzzleKind" | "initialFen" | "solutionMoves" | "arrowDuel">,
  engine: PuzzleExtractionEngine,
  options: EstimatePuzzleDifficultyOptions = {}
): Promise<PuzzleDifficultyEstimate> {
  const sfModel = options.sfHeuristicModel ?? defaultSfHeuristicModel;
  const maiaModel = options.maia2SfModel ?? defaultMaia2SfModel;

  // For Arrow Duel puzzles, initialFen is the decisionFen (before blunder) and
  // solutionMoves is [blunderMove, ...punishmentLine].
  const decisionFen = puzzle.arrowDuel?.decisionFen ?? puzzle.initialFen;
  const lineMoves =
    puzzle.puzzleKind === "arrow_duel" && puzzle.arrowDuel
      ? [puzzle.arrowDuel.blunderMove, ...puzzle.arrowDuel.punishmentLine]
      : puzzle.solutionMoves;

  const structFeats = extractDifficultyStructuralFeatures(decisionFen, lineMoves);
  const sfFeats = await extractDifficultyStockfishFeatures(decisionFen, lineMoves, engine, {
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });

  let standardRating: number;
  let ratingSource: UserGamePuzzleRatingSource;

  if (options.humanPolicy && maiaModel) {
    try {
      const maiaFeats = await extractDifficultyMaia2Features(
        decisionFen,
        lineMoves,
        options.humanPolicy
      );
      standardRating = evaluateTreeEnsemble(maiaModel, {
        ...maiaFeats,
        ...sfFeats,
        ...structFeats
      });
      ratingSource = "maia2_sf_v1";
    } catch {
      standardRating = sfModel
        ? evaluateTreeEnsemble(sfModel, { ...sfFeats, ...structFeats })
        : fallbackLinearHeuristic(structFeats, sfFeats);
      ratingSource = "sf_heuristic_v1";
    }
  } else if (sfModel) {
    standardRating = evaluateTreeEnsemble(sfModel, {
      ...sfFeats,
      ...structFeats
    });
    ratingSource = "sf_heuristic_v1";
  } else {
    standardRating = fallbackLinearHeuristic(structFeats, sfFeats);
    ratingSource = "sf_heuristic_v1";
  }

  if (puzzle.puzzleKind === "arrow_duel" && puzzle.arrowDuel) {
    let arrowDuelRating = standardRating;
    if (options.humanPolicy) {
      const good = normalizeUci(puzzle.arrowDuel.bestMove);
      const bad = normalizeUci(puzzle.arrowDuel.blunderMove);
      let adRes: HumanPolicyMoveResult | undefined;
      try {
        [adRes] = await options.humanPolicy.scoreMoves([
          {
            fen: decisionFen,
            moves: [good, bad],
            elos: ARROW_DUEL_ELO_GRID
          }
        ]);
      } catch {
        adRes = undefined;
      }
      if (adRes) {
        const qs = ARROW_DUEL_ELO_GRID.map((elo) => {
          const stats = adRes.byElo[elo];
          const pg = stats?.probs[good] ?? 0.5;
          const pb = stats?.probs[bad] ?? 0.5;
          return pg / (pg + pb + EPS);
        });
        arrowDuelRating = solvePromptedArrowDuelRating(
          standardRating,
          ARROW_DUEL_ELO_GRID,
          qs,
          {
            ...(options.arrowDuelCheckRate === undefined
              ? {}
              : { checkRate: options.arrowDuelCheckRate })
          }
        );
      }
    }
    return {
      rating: arrowDuelRating,
      standardRating,
      arrowDuelRating,
      ratingSource
    };
  }

  return {
    rating: standardRating,
    standardRating,
    ratingSource
  };
}

function evalPromptedArrowDuelProb(
  elo: number,
  standardRating: number,
  elos: readonly number[],
  qs: readonly number[],
  checkRate: number
): number {
  const q = interpPiecewise(elo, elos, qs);
  const z = Math.max(-35, Math.min(35, (elo - standardRating) / GLICKO_SCALE));
  const pRef = checkRate / (1 + Math.exp(-z));
  return pRef + (1 - pRef) * q;
}

function interpPiecewise(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]!) return clamp01(ys[0]!);
  const last = xs.length - 1;
  if (x >= xs[last]!) return clamp01(ys[last]!);
  for (let i = 0; i < last; i += 1) {
    if (x >= xs[i]! && x <= xs[i + 1]!) {
      const frac = (x - xs[i]!) / Math.max(1e-9, xs[i + 1]! - xs[i]!);
      return clamp01(ys[i]! + frac * (ys[i + 1]! - ys[i]!));
    }
  }
  return clamp01(ys[last]!);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampRating(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 1500;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function pickTopLine(lines: readonly EngineAnalysisLine[]): EngineAnalysisLine | undefined {
  if (lines.length === 0) return undefined;
  return [...lines].sort((a, b) => a.multipv - b.multipv)[0];
}

function clampEvalCp(line: EngineAnalysisLine, pov: "w" | "b"): number {
  const rel = scoreForPov(line.score, pov);
  const cp = relativeScoreToCp(rel, CLAMP_CP_LIMIT);
  return Math.max(-CLAMP_CP_LIMIT, Math.min(CLAMP_CP_LIMIT, cp));
}

function fallbackLinearHeuristic(
  structFeats: Readonly<Record<string, number>>,
  sfFeats: Readonly<Record<string, number>>
): number {
  let est = 1200;
  if (structFeats.std_m1_is_mate1) est -= 400;
  if (structFeats.std_m1_is_quiet) est += 220;
  if (structFeats.std_m1_is_sac) est += 180;
  est += Math.min(4, Math.max(0, (structFeats.n_solver_moves ?? 1) - 1)) * 110;
  const foundDepth = sfFeats.sf_std_found_depth ?? 2;
  if (foundDepth >= 6) est += 260;
  else if (foundDepth >= 4) est += 140;
  return clampRating(est, DIFFICULTY_MIN_RATING, DIFFICULTY_MAX_RATING);
}
