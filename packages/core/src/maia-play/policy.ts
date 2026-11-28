import { Chess, type Move } from "chess.js";
import type { HumanPolicyModel } from "../game-puzzles/difficulty.ts";
import { lookupMaiaOpeningBook, openingPositionKey } from "./opening-book.ts";
import type { MaiaThinkingPace, MaiaTimeClass } from "./types.ts";

export interface MaiaMoveChoice {
  uci: string;
  probability: number;
  top1Prob: number;
  entropy: number;
  legalMoveCount: number;
  usedFallbackPolicy: boolean;
  usedOpeningBook?: boolean;
}

export interface SelectMaiaMoveOptions {
  fen: string;
  maiaRating: number;
  policyModel?: HumanPolicyModel | null;
  /** Current ply count (0 = start). Helps handle Maia-2's ply < 10 training boundary. */
  ply?: number;
  /** Recent 4-field FEN keys played in this game, used to discourage pointless move loops. */
  recentPositionKeys?: readonly string[];
  /** Disable opening book lookup (useful in unit tests targeting raw policy calls). */
  disableOpeningBook?: boolean;
  rng?: () => number;
}

/**
 * Calibrate sampling temperature & nucleus (top-p) by target rating so Maia:
 * - Never repeats identical deterministic lines every game
 * - Softens smoothly below Maia-2's lowest bucket (<1100) for beginners
 * - Plays sharper and more consistent lines at 1400–2000+
 */
export function maiaSamplingParamsForRating(rating: number): {
  temperature: number;
  topP: number;
} {
  if (rating <= 800) {
    return { temperature: 1.15, topP: 0.94 };
  }
  if (rating < 1100) {
    const t = (rating - 800) / 300;
    return {
      temperature: 1.15 - t * 0.4,
      topP: 0.94 - t * 0.08
    };
  }
  if (rating <= 1600) {
    const t = (rating - 1100) / 500;
    return {
      temperature: 0.75 - t * 0.25,
      topP: 0.86 - t * 0.1
    };
  }
  return { temperature: 0.45, topP: 0.72 };
}

/**
 * Sample a legal move from a probability distribution using temperature scaling
 * and top-p (nucleus) filtering.
 */
export function sampleMoveFromDistribution(
  probsByUci: Readonly<Record<string, number>>,
  options: {
    temperature: number;
    topP: number;
    rng?: () => number;
  }
): { uci: string; probability: number } {
  const entries = Object.entries(probsByUci)
    .filter(([, prob]) => Number.isFinite(prob) && prob > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    throw new Error("Cannot sample a Maia move from an empty probability distribution");
  }
  if (entries.length === 1) {
    return { uci: entries[0]![0], probability: entries[0]![1] };
  }

  const temp = Math.max(0.05, options.temperature);
  const invTemp = 1 / temp;

  // Apply temperature scaling in log-space for numerical stability.
  const scaled: Array<{ uci: string; origProb: number; weight: number }> = [];
  let maxLog = -Infinity;
  for (const [uci, prob] of entries) {
    const logVal = Math.log(Math.max(1e-12, prob)) * invTemp;
    if (logVal > maxLog) {
      maxLog = logVal;
    }
    scaled.push({ uci, origProb: prob, weight: logVal });
  }

  let totalWeight = 0;
  for (const item of scaled) {
    item.weight = Math.exp(item.weight - maxLog);
    totalWeight += item.weight;
  }

  // Normalize and apply top-p nucleus cutoff (always keeping at least the top move).
  const topP = Math.max(0.1, Math.min(1, options.topP));
  const nucleus: Array<{ uci: string; origProb: number; weight: number }> = [];
  let cumulative = 0;
  for (const item of scaled) {
    const normProb = totalWeight > 0 ? item.weight / totalWeight : 1 / scaled.length;
    nucleus.push({ uci: item.uci, origProb: item.origProb, weight: normProb });
    cumulative += normProb;
    if (cumulative >= topP) {
      break;
    }
  }

  let nucleusTotal = 0;
  for (const item of nucleus) {
    nucleusTotal += item.weight;
  }

  const rng = options.rng ?? Math.random;
  const roll = Math.max(0, Math.min(0.9999999999, rng())) * nucleusTotal;
  let running = 0;
  for (const item of nucleus) {
    running += item.weight;
    if (roll <= running) {
      return { uci: item.uci, probability: item.origProb };
    }
  }
  const last = nucleus[nucleus.length - 1]!;
  return { uci: last.uci, probability: last.origProb };
}

const FALLBACK_PIECE_SCORE: Readonly<Record<string, number>> = {
  p: 1,
  n: 3,
  b: 3.2,
  r: 5,
  q: 9,
  k: 0
};

function countHomeRankPawns(chess: Chess, color: "w" | "b"): number {
  const rankIdx = color === "w" ? 6 : 1; // chess.board()[0] = rank 8, [6] = rank 2, [1] = rank 7
  const row = chess.board()[rankIdx];
  if (!row) {
    return 0;
  }
  let count = 0;
  for (const sq of row) {
    if (sq && sq.color === color && sq.type === "p") {
      count += 1;
    }
  }
  return count;
}

function estimateFullmoveFromFen(fen: string): number {
  const num = Number(fen.trim().split(/\s+/)[5] ?? "1");
  return Number.isFinite(num) && num >= 1 ? num : 1;
}

function materialBalance(chess: Chess, color: "w" | "b"): number {
  let diff = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) {
        continue;
      }
      const val = FALLBACK_PIECE_SCORE[sq.type] ?? 0;
      diff += sq.color === color ? val : -val;
    }
  }
  return diff;
}

/**
 * Maia-2 was trained on Lichess games starting at ply 11+ (first 10 plies excluded).
 * When an offbeat user move takes the game out of our opening book while the board
 * is still in an undeveloped opening phase (early fullmoves / untouched pawn front),
 * gently guard against Maia-2's known out-of-distribution opening artifacts
 * (retreating knights to b1/g1/b8/g8, Bongcloud Ke2/Ke7, or pointless loops)
 * while preserving Maia-2's tactical awareness for captures/checks/mates.
 */
export function applyMaiaOpeningAndLoopGuard(
  chess: Chess,
  legalVerbose: readonly Move[],
  rawProbs: Readonly<Record<string, number>>,
  options: {
    ply?: number;
    recentPositionKeys?: readonly string[];
  }
): Record<string, number> {
  const turn = chess.turn();
  const fullmove = estimateFullmoveFromFen(chess.fen());
  const effectivePly = options.ply ?? (fullmove - 1) * 2 + (turn === "b" ? 1 : 0);
  const homePawns = countHomeRankPawns(chess, turn);
  const inOpeningTransition = effectivePly < 10 || (effectivePly < 16 && homePawns >= 7);
  const ownMaterialDiff = materialBalance(chess, turn);
  const inCheck = chess.inCheck();

  const recentCounts = new Map<string, number>();
  if (options.recentPositionKeys) {
    for (const key of options.recentPositionKeys) {
      recentCounts.set(key, (recentCounts.get(key) ?? 0) + 1);
    }
  }

  const homeBackRank = turn === "w" ? "1" : "8";
  const pawnStartRank = turn === "w" ? "2" : "7";
  const centralFiles = new Set(["c", "d", "e", "f"]);
  const innerCenterFiles = new Set(["d", "e"]);

  const adjusted: Record<string, number> = {};
  let total = 0;

  for (const move of legalVerbose) {
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
    let prob = rawProbs[uci] ?? 1e-6;

    // Immediate mate-in-1 is always untouched / boosted
    if (move.san.endsWith("#")) {
      prob *= 8;
    }

    if (inOpeningTransition && !move.captured && !move.san.endsWith("#")) {
      const fromRank = move.from[1]!;
      const toRank = move.to[1]!;
      const toFile = move.to[0]!;

      // Strongly penalize retreating a developed minor piece back to the back rank (Nb1/Ng1/Nb8/Ng8)
      if ((move.piece === "n" || move.piece === "b") && fromRank !== homeBackRank && toRank === homeBackRank) {
        prob *= 0.03;
      }

      // Strongly penalize moving the King (non-castling) in the opening when not in check (Bongcloud Ke2!)
      const isCastle = move.san === "O-O" || move.san === "O-O-O";
      if (move.piece === "k" && !isCastle && !inCheck) {
        prob *= 0.04;
      }

      // Penalize rim knight jumps (Na3/Nh3/Na6/Nh6) on moves 1-5
      if (move.piece === "n" && (toFile === "a" || toFile === "h")) {
        prob *= 0.2;
      }

      // Encourage healthy opening development (center pawns, developing minor pieces, castling)
      if (isCastle) {
        prob *= 2.4;
      } else if (move.piece === "p" && fromRank === pawnStartRank && innerCenterFiles.has(toFile)) {
        prob *= homePawns >= 7 ? 3.5 : 1.8;
      } else if (move.piece === "p" && fromRank === pawnStartRank && centralFiles.has(toFile)) {
        prob *= 1.6;
      } else if ((move.piece === "n" || move.piece === "b") && fromRank === homeBackRank && centralFiles.has(toFile)) {
        prob *= 1.9;
      }
    }

    // Damp pointless repetition loops (especially when not losing materially)
    if (recentCounts.size > 0 && ownMaterialDiff >= -1.5 && !move.san.endsWith("#")) {
      const probe = new Chess(chess.fen());
      probe.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {})
      });
      const nextKey = openingPositionKey(probe.fen());
      const seen = recentCounts.get(nextKey) ?? 0;
      if (seen >= 2) {
        prob *= 0.05;
      } else if (seen === 1) {
        prob *= inOpeningTransition ? 0.1 : 0.35;
      }
    }

    adjusted[uci] = Math.max(1e-9, prob);
    total += adjusted[uci]!;
  }

  if (total <= 0) {
    return { ...rawProbs };
  }
  for (const key of Object.keys(adjusted)) {
    adjusted[key] = adjusted[key]! / total;
  }
  return adjusted;
}

/**
 * Lightweight heuristic distribution used only when the native Maia-2 runtime
 * is absent (e.g., Web Interaction Lab or Jest without CoreML/ONNX).
 */
export function buildFallbackMoveDistribution(fen: string): {
  probs: Record<string, number>;
  top1Prob: number;
  entropy: number;
} {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { probs: {}, top1Prob: 0, entropy: 0 };
  }

  const logits: Array<{ uci: string; score: number }> = [];
  let maxScore = -Infinity;

  for (const move of moves) {
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
    let score = 0;
    if (move.san.endsWith("#")) {
      score += 12;
    } else if (move.san.endsWith("+")) {
      score += 1.4;
    }
    if (move.captured) {
      const gained = FALLBACK_PIECE_SCORE[move.captured] ?? 1;
      const risk = FALLBACK_PIECE_SCORE[move.piece] ?? 1;
      score += 1.8 + gained * 0.55 - risk * 0.15;
    }
    if (move.promotion) {
      score += move.promotion === "q" ? 5 : 1.5;
    }
    if (move.san === "O-O" || move.san === "O-O-O") {
      score += 1.5;
    }
    const file = move.to.charCodeAt(0) - 97;
    const rank = move.to.charCodeAt(1) - 49;
    if (file >= 2 && file <= 5 && rank >= 2 && rank <= 5) {
      score += 0.5;
    }
    if (score > maxScore) {
      maxScore = score;
    }
    logits.push({ uci, score });
  }

  let sumExp = 0;
  const exps = logits.map((item) => {
    const e = Math.exp(item.score - maxScore);
    sumExp += e;
    return e;
  });

  const probs: Record<string, number> = {};
  let top1Prob = 0;
  let entropy = 0;
  for (let i = 0; i < logits.length; i += 1) {
    const p = sumExp > 0 ? exps[i]! / sumExp : 1 / logits.length;
    probs[logits[i]!.uci] = p;
    if (p > top1Prob) {
      top1Prob = p;
    }
    if (p > 1e-12) {
      entropy -= p * Math.log(p);
    }
  }

  return { probs, top1Prob, entropy };
}

/**
 * Choose Maia's next legal move for `fen` at `maiaRating` using:
 * 1. Compact human opening book (plies 0–10, since Maia-2 was trained on ply 11+)
 * 2. On-device Maia-2 `HumanPolicyModel` with opening-transition & loop guard
 * 3. Clean fallback heuristic if the native runtime is absent
 */
export async function selectMaiaMove(options: SelectMaiaMoveOptions): Promise<MaiaMoveChoice> {
  const chess = new Chess(options.fen);
  const legalVerbose = chess.moves({ verbose: true });
  if (legalVerbose.length === 0) {
    throw new Error(`No legal moves available in position ${options.fen}`);
  }
  const legalUcis = legalVerbose.map((m) => `${m.from}${m.to}${m.promotion ?? ""}`.toLowerCase());
  const legalSet = new Set(legalUcis);

  // 1. Opening book lookup (keeps plies 0–10 realistic before handing off to Maia-2)
  if (!options.disableOpeningBook) {
    const bookMoves = lookupMaiaOpeningBook(options.fen)?.filter((entry) => legalSet.has(entry.uci));
    if (bookMoves && bookMoves.length > 0) {
      let totalWeight = 0;
      for (const entry of bookMoves) {
        totalWeight += entry.weight;
      }
      const bookProbs: Record<string, number> = {};
      let top1Prob = 0;
      let entropy = 0;
      for (const entry of bookMoves) {
        const p = totalWeight > 0 ? entry.weight / totalWeight : 1 / bookMoves.length;
        bookProbs[entry.uci] = p;
        if (p > top1Prob) {
          top1Prob = p;
        }
        if (p > 1e-12) {
          entropy -= p * Math.log(p);
        }
      }
      const picked = sampleMoveFromDistribution(bookProbs, {
        temperature: 1.0,
        topP: 0.95,
        ...(options.rng ? { rng: options.rng } : {})
      });
      return {
        uci: picked.uci,
        probability: picked.probability,
        top1Prob,
        entropy,
        legalMoveCount: legalUcis.length,
        usedFallbackPolicy: false,
        usedOpeningBook: true
      };
    }
  }

  const sampling = maiaSamplingParamsForRating(options.maiaRating);

  // 2. Real Maia-2 policy inference
  if (options.policyModel) {
    try {
      const results = await options.policyModel.scoreMoves([
        {
          fen: options.fen,
          moves: legalUcis,
          elos: [options.maiaRating]
        }
      ]);
      const stats = results[0]?.byElo[options.maiaRating];
      if (stats && Object.keys(stats.probs).length > 0) {
        const guardedProbs = applyMaiaOpeningAndLoopGuard(chess, legalVerbose, stats.probs, {
          ...(options.ply === undefined ? {} : { ply: options.ply }),
          ...(options.recentPositionKeys === undefined
            ? {}
            : { recentPositionKeys: options.recentPositionKeys })
        });
        const picked = sampleMoveFromDistribution(guardedProbs, {
          temperature: sampling.temperature,
          topP: sampling.topP,
          ...(options.rng ? { rng: options.rng } : {})
        });
        return {
          uci: picked.uci,
          probability: picked.probability,
          top1Prob: stats.top1Prob ?? picked.probability,
          entropy: stats.entropy ?? 0,
          legalMoveCount: legalUcis.length,
          usedFallbackPolicy: false,
          usedOpeningBook: false
        };
      }
    } catch {
      // Fall through to lightweight fallback policy if native model fails/is absent.
    }
  }

  // 3. Lightweight fallback when native Maia-2 runtime is absent (Jest/Lab)
  const fallback = buildFallbackMoveDistribution(options.fen);
  const guardedFallback = applyMaiaOpeningAndLoopGuard(chess, legalVerbose, fallback.probs, {
    ...(options.ply === undefined ? {} : { ply: options.ply }),
    ...(options.recentPositionKeys === undefined
      ? {}
      : { recentPositionKeys: options.recentPositionKeys })
  });
  const picked = sampleMoveFromDistribution(guardedFallback, {
    temperature: sampling.temperature,
    topP: sampling.topP,
    ...(options.rng ? { rng: options.rng } : {})
  });
  return {
    uci: picked.uci,
    probability: picked.probability,
    top1Prob: fallback.top1Prob,
    entropy: fallback.entropy,
    legalMoveCount: legalUcis.length,
    usedFallbackPolicy: true,
    usedOpeningBook: false
  };
}

/**
 * Compute realistic human-like thinking delay (ms) for Maia from position
 * complexity (policy entropy / top1Prob), move number, time control, and clock.
 */
export function computeMaiaThinkTimeMs(input: {
  thinkingPace: MaiaThinkingPace;
  timeClass: MaiaTimeClass;
  ply: number;
  top1Prob: number;
  entropy: number;
  legalMoveCount: number;
  maiaClockRemainingMs: number | null;
  rng?: () => number;
}): number {
  if (input.thinkingPace === "instant") {
    return 0;
  }

  const profile =
    input.timeClass === "blitz"
      ? { minMs: 450, baseMs: 1700, capMs: 5200 }
      : input.timeClass === "rapid"
        ? { minMs: 550, baseMs: 2600, capMs: 8000 }
        : { minMs: 650, baseMs: 3400, capMs: 10500 };

  if (input.legalMoveCount <= 1) {
    return Math.round(profile.minMs * 0.8);
  }

  const maxEntropy = Math.log(Math.max(2, input.legalMoveCount));
  const normalizedEntropy = maxEntropy > 0 ? Math.max(0, Math.min(1, input.entropy / maxEntropy)) : 0;

  let ms = profile.minMs + profile.baseMs * (0.35 + 1.15 * normalizedEntropy);

  if (input.top1Prob >= 0.85) {
    ms *= 0.4;
  } else if (input.top1Prob >= 0.65) {
    ms *= 0.65;
  }

  if (input.ply < 6) {
    ms *= 0.5;
  }

  const rng = input.rng ?? Math.random;
  const jitter = 0.78 + Math.max(0, Math.min(1, rng())) * 0.44;
  ms *= jitter;

  let cap = profile.capMs;
  if (input.maiaClockRemainingMs !== null) {
    if (input.maiaClockRemainingMs <= 10_000) {
      cap = Math.min(cap, Math.max(250, Math.floor(input.maiaClockRemainingMs * 0.12)));
    } else if (input.maiaClockRemainingMs <= 30_000) {
      cap = Math.min(cap, Math.floor(input.maiaClockRemainingMs * 0.1));
    } else {
      cap = Math.min(cap, Math.floor(input.maiaClockRemainingMs * 0.15));
    }
  }

  return Math.max(250, Math.min(cap, Math.round(ms)));
}
