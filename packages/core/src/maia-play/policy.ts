import { Chess } from "chess.js";
import type { HumanPolicyModel } from "../game-puzzles/difficulty.ts";
import type { MaiaThinkingPace, MaiaTimeClass } from "./types.ts";

export interface MaiaMoveChoice {
  uci: string;
  probability: number;
  top1Prob: number;
  entropy: number;
  legalMoveCount: number;
  usedFallbackPolicy: boolean;
}

export interface SelectMaiaMoveOptions {
  fen: string;
  maiaRating: number;
  policyModel?: HumanPolicyModel | null;
  rng?: () => number;
}

/**
 * Calibrate sampling temperature & nucleus (top-p) by target rating so Maia:
 * - Never repeats identical deterministic lines every game
 * - Softens smoothly below Maia-2's lowest bucket (<1100) for beginners
 * - Plays sharper and more consistent lines at 1600–2000+
 */
export function maiaSamplingParamsForRating(rating: number): {
  temperature: number;
  topP: number;
} {
  if (rating <= 800) {
    return { temperature: 1.25, topP: 0.96 };
  }
  if (rating < 1100) {
    const t = (rating - 800) / 300;
    return {
      temperature: 1.25 - t * 0.4,
      topP: 0.96 - t * 0.06
    };
  }
  if (rating <= 1600) {
    const t = (rating - 1100) / 500;
    return {
      temperature: 0.85 - t * 0.15,
      topP: 0.9 - t * 0.04
    };
  }
  return { temperature: 0.65, topP: 0.85 };
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
    // Slight preference for central squares
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
 * Choose Maia's next legal move for `fen` at `maiaRating` using the on-device
 * Maia-2 `HumanPolicyModel` (with clean fallback if the native runtime is absent).
 */
export async function selectMaiaMove(options: SelectMaiaMoveOptions): Promise<MaiaMoveChoice> {
  const chess = new Chess(options.fen);
  const legalVerbose = chess.moves({ verbose: true });
  if (legalVerbose.length === 0) {
    throw new Error(`No legal moves available in position ${options.fen}`);
  }
  const legalUcis = legalVerbose.map((m) => `${m.from}${m.to}${m.promotion ?? ""}`.toLowerCase());
  const sampling = maiaSamplingParamsForRating(options.maiaRating);

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
        const picked = sampleMoveFromDistribution(stats.probs, {
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
          usedFallbackPolicy: false
        };
      }
    } catch {
      // Fall through to lightweight fallback policy if native model fails/is absent.
    }
  }

  const fallback = buildFallbackMoveDistribution(options.fen);
  const picked = sampleMoveFromDistribution(fallback.probs, {
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
    usedFallbackPolicy: true
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

  // Forced single legal move -> almost instant human reaction
  if (input.legalMoveCount <= 1) {
    return Math.round(profile.minMs * 0.8);
  }

  const maxEntropy = Math.log(Math.max(2, input.legalMoveCount));
  const normalizedEntropy = maxEntropy > 0 ? Math.max(0, Math.min(1, input.entropy / maxEntropy)) : 0;

  let ms = profile.minMs + profile.baseMs * (0.35 + 1.15 * normalizedEntropy);

  // Obvious recapture or overwhelmingly likely move -> quick
  if (input.top1Prob >= 0.85) {
    ms *= 0.4;
  } else if (input.top1Prob >= 0.65) {
    ms *= 0.65;
  }

  // Opening phase (first 6 plies) -> snappy
  if (input.ply < 6) {
    ms *= 0.5;
  }

  // Human-like jitter (0.78..1.22)
  const rng = input.rng ?? Math.random;
  const jitter = 0.78 + Math.max(0, Math.min(1, rng())) * 0.44;
  ms *= jitter;

  // Respect clock so Maia speeds up in time scrambles and doesn't needlessly flag
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
