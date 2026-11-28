import { Chess } from "chess.js";
import type {
  HumanPolicyEloStats,
  HumanPolicyModel,
  HumanPolicyMoveRequest,
  HumanPolicyMoveResult
} from "./difficulty.ts";
import { MAIA2_MOVE_TO_INDEX, MAIA2_MOVE_VOCAB } from "./maia2-vocab.ts";

export const MAIA2_TENSOR_CHANNELS = 18;
export const MAIA2_BOARD_SIZE = 8;
export const MAIA2_TENSOR_FLOATS = MAIA2_TENSOR_CHANNELS * MAIA2_BOARD_SIZE * MAIA2_BOARD_SIZE; // 1152
export const MAIA2_VOCAB_SIZE = MAIA2_MOVE_VOCAB.length; // 1880

const PIECE_TO_OWN_CHANNEL: Readonly<Record<string, number>> = {
  P: 0,
  N: 1,
  B: 2,
  R: 3,
  Q: 4,
  K: 5,
  p: 6,
  n: 7,
  b: 8,
  r: 9,
  q: 10,
  k: 11
};

export interface EncodedMaia2Board {
  /** Flat [18, 8, 8] float32 tensor in row-major C order, matching maia2.utils.board_to_tensor. */
  tensor: Float32Array;
  /** True if Black is to move (board was rank-mirrored and colors swapped). */
  isBlack: boolean;
}

export interface EncodedMaia2LegalMoves {
  isBlack: boolean;
  /** Legal moves in original (unmirrored) UCI notation. */
  rawMoves: string[];
  /** Corresponding Maia-2 vocabulary indices (0..1879) in canonical White-to-move orientation. */
  vocabIndices: number[];
}

/**
 * Map a numeric Elo rating into Maia-2's 11 discrete Elo categories (0..10):
 * 0: <1100, 1: 1100-1199, ..., 9: 1900-1999, 10: >=2000.
 */
export function maia2EloCategory(elo: number): number {
  if (!Number.isFinite(elo) || elo < 1100) {
    return 0;
  }
  if (elo >= 2000) {
    return 10;
  }
  return Math.floor((elo - 1100) / 100) + 1;
}

/**
 * Vertically mirror a UCI move (rank r -> 9 - r) for Black-to-move canonicalization.
 * Matches maia2.utils.mirror_move().
 */
export function mirrorUciMove(uci: string): string {
  const trimmed = uci.trim().toLowerCase();
  if (trimmed.length < 4) {
    return trimmed;
  }
  const f1 = trimmed[0]!;
  const r1 = String(9 - Number(trimmed[1]));
  const f2 = trimmed[2]!;
  const r2 = String(9 - Number(trimmed[3]));
  return `${f1}${r1}${f2}${r2}${trimmed.slice(4)}`;
}

/**
 * Encode a FEN directly into Maia-2's [18, 8, 8] Float32 tensor (matching
 * `maia2.utils.board_to_tensor(board.mirror() if black else board)` bit-for-bit).
 */
export function encodeFenToMaia2Tensor(fen: string): EncodedMaia2Board {
  const fields = fen.trim().split(/\s+/);
  const placement = fields[0] ?? "";
  const isBlack = fields[1] === "b";
  const castling = fields[2] ?? "-";
  const epField = fields[3] ?? "-";

  const tensor = new Float32Array(MAIA2_TENSOR_FLOATS);

  // 1. Piece planes (channels 0..11)
  let rank = 7;
  let file = 0;
  for (let i = 0; i < placement.length; i += 1) {
    const ch = placement[i]!;
    if (ch === "/") {
      rank -= 1;
      file = 0;
    } else if (ch >= "1" && ch <= "8") {
      file += ch.charCodeAt(0) - 48;
    } else {
      const baseChannel = PIECE_TO_OWN_CHANNEL[ch];
      if (baseChannel !== undefined && rank >= 0 && rank < 8 && file >= 0 && file < 8) {
        const row = isBlack ? 7 - rank : rank;
        const channel = isBlack
          ? baseChannel < 6
            ? baseChannel + 6
            : baseChannel - 6
          : baseChannel;
        tensor[channel * 64 + row * 8 + file] = 1.0;
      }
      file += 1;
    }
  }

  // 2. Turn channel (channel 12): canonical board is always White to move -> all 1.0
  tensor.fill(1.0, 12 * 64, 13 * 64);

  // 3. Castling rights (channels 13..16): own K, own Q, opp K, opp Q
  const ownK = isBlack ? castling.includes("k") : castling.includes("K");
  const ownQ = isBlack ? castling.includes("q") : castling.includes("Q");
  const oppK = isBlack ? castling.includes("K") : castling.includes("k");
  const oppQ = isBlack ? castling.includes("Q") : castling.includes("q");
  if (ownK) tensor.fill(1.0, 13 * 64, 14 * 64);
  if (ownQ) tensor.fill(1.0, 14 * 64, 15 * 64);
  if (oppK) tensor.fill(1.0, 15 * 64, 16 * 64);
  if (oppQ) tensor.fill(1.0, 16 * 64, 17 * 64);

  // 4. En passant square (channel 17)
  if (epField !== "-" && epField.length === 2) {
    const epFile = epField.charCodeAt(0) - 97;
    const epRank = epField.charCodeAt(1) - 49;
    if (epFile >= 0 && epFile < 8 && epRank >= 0 && epRank < 8) {
      const row = isBlack ? 7 - epRank : epRank;
      tensor[17 * 64 + row * 8 + epFile] = 1.0;
    }
  }

  return { tensor, isBlack };
}

/**
 * Enumerate legal moves for a FEN and map them to Maia-2 vocabulary indices.
 */
export function encodeLegalMovesForMaia2(fen: string): EncodedMaia2LegalMoves {
  const chess = new Chess(fen);
  const isBlack = chess.turn() === "b";
  const moves = chess.moves({ verbose: true });
  const rawMoves: string[] = [];
  const vocabIndices: number[] = [];

  for (const move of moves) {
    const rawUci = `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
    const canonicalUci = isBlack ? mirrorUciMove(rawUci) : rawUci;
    const idx = MAIA2_MOVE_TO_INDEX.get(canonicalUci);
    if (idx !== undefined) {
      rawMoves.push(rawUci);
      vocabIndices.push(idx);
    }
  }

  return { isBlack, rawMoves, vocabIndices };
}

/**
 * Apply numerically stable masked softmax over the legal Maia-2 vocabulary indices
 * and return a map of raw (unmirrored) UCI -> probability summing to 1.0.
 */
export function decodeMaia2MaskedProbabilities(
  logits: ArrayLike<number>,
  rawMoves: readonly string[],
  vocabIndices: readonly number[],
  offset = 0
): Record<string, number> {
  const count = Math.min(rawMoves.length, vocabIndices.length);
  if (count === 0) {
    return {};
  }

  let maxLogit = -Infinity;
  const selected = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const val = Number(logits[offset + vocabIndices[i]!] ?? -Infinity);
    selected[i] = Number.isFinite(val) ? val : -1e9;
    if (selected[i]! > maxLogit) {
      maxLogit = selected[i]!;
    }
  }

  let sumExp = 0;
  for (let i = 0; i < count; i += 1) {
    const e = Math.exp(selected[i]! - maxLogit);
    selected[i] = e;
    sumExp += e;
  }

  const out: Record<string, number> = {};
  const denom = sumExp > 0 ? sumExp : 1;
  for (let i = 0; i < count; i += 1) {
    out[rawMoves[i]!] = selected[i]! / denom;
  }
  return out;
}

/**
 * Summarize a masked legal-move probability distribution into `HumanPolicyEloStats`
 * (requested move probs, 1-indexed ranks among all legal moves, top1Prob, Shannon entropy).
 */
export function summarizeMaia2EloStats(
  allLegalProbs: Readonly<Record<string, number>>,
  requestedMoves: readonly string[]
): HumanPolicyEloStats {
  const entries = Object.entries(allLegalProbs).sort((a, b) => b[1] - a[1]);
  const rankByMove = new Map<string, number>();
  let entropy = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const [move, p] = entries[i]!;
    rankByMove.set(move, i + 1);
    if (p > 1e-12) {
      entropy -= p * Math.log(p);
    }
  }
  const top1Prob = entries[0]?.[1] ?? 0;

  const probs: Record<string, number> = {};
  const ranks: Record<string, number> = {};
  const fallbackRank = entries.length + 1;
  for (const rawMove of requestedMoves) {
    const key = rawMove.trim().toLowerCase();
    probs[key] = allLegalProbs[key] ?? 0;
    ranks[key] = rankByMove.get(key) ?? fallbackRank;
  }

  return { probs, ranks, top1Prob, entropy };
}

export interface Maia2TensorBatchInput {
  /** Concatenated float32 board tensors of length batchSize * 1152. */
  boards: Float32Array;
  /** Length batchSize, each value in 0..10. */
  eloSelfCategories: Int32Array;
  /** Length batchSize, each value in 0..10. */
  eloOppoCategories: Int32Array;
  batchSize: number;
}

export interface Maia2TensorRunner {
  readonly id: string;
  /** Run Maia-2 forward pass and return concatenated float32 logits of length batchSize * 1880. */
  runBatch(input: Maia2TensorBatchInput): Promise<Float32Array>;
  /** Release native weights/session memory when idle. */
  unload(): Promise<void>;
}

export interface ManagedHumanPolicyModel extends HumanPolicyModel {
  readonly id: string;
  unload(): Promise<void>;
}

/**
 * Wrap any thin Maia-2 tensor runner (iOS CoreML, Android ONNX, or Node test runner)
 * into a domain `HumanPolicyModel` implementing `scoreMoves()`.
 */
export function createMaia2HumanPolicyModel(runner: Maia2TensorRunner): ManagedHumanPolicyModel {
  return {
    id: runner.id,
    async scoreMoves(
      requests: readonly HumanPolicyMoveRequest[]
    ): Promise<readonly HumanPolicyMoveResult[]> {
      if (requests.length === 0) {
        return [];
      }

      const encoded = requests.map((request) => ({
        request,
        board: encodeFenToMaia2Tensor(request.fen),
        legal: encodeLegalMovesForMaia2(request.fen)
      }));

      // Flatten all (request, elo) pairs into a single tensor batch
      const jobs: Array<{ reqIndex: number; elo: number }> = [];
      for (let reqIndex = 0; reqIndex < encoded.length; reqIndex += 1) {
        const item = encoded[reqIndex]!;
        if (item.legal.rawMoves.length === 0) {
          continue;
        }
        for (const elo of item.request.elos) {
          jobs.push({ reqIndex, elo });
        }
      }

      const results: Array<Record<number, HumanPolicyEloStats>> = requests.map(() => ({}));
      if (jobs.length === 0) {
        return results.map((byElo) => ({ byElo }));
      }

      const batchSize = jobs.length;
      const boards = new Float32Array(batchSize * MAIA2_TENSOR_FLOATS);
      const eloSelfCategories = new Int32Array(batchSize);
      const eloOppoCategories = new Int32Array(batchSize);

      for (let j = 0; j < batchSize; j += 1) {
        const job = jobs[j]!;
        boards.set(encoded[job.reqIndex]!.board.tensor, j * MAIA2_TENSOR_FLOATS);
        const cat = maia2EloCategory(job.elo);
        eloSelfCategories[j] = cat;
        eloOppoCategories[j] = cat;
      }

      const logits = await runner.runBatch({
        boards,
        eloSelfCategories,
        eloOppoCategories,
        batchSize
      });

      for (let j = 0; j < batchSize; j += 1) {
        const job = jobs[j]!;
        const item = encoded[job.reqIndex]!;
        const allProbs = decodeMaia2MaskedProbabilities(
          logits,
          item.legal.rawMoves,
          item.legal.vocabIndices,
          j * MAIA2_VOCAB_SIZE
        );
        results[job.reqIndex]![job.elo] = summarizeMaia2EloStats(allProbs, item.request.moves);
      }

      return results.map((byElo) => ({ byElo }));
    },
    unload: () => runner.unload()
  };
}
