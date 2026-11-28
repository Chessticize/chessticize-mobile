import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  MAIA2_MOVE_VOCAB,
  MAIA2_TENSOR_FLOATS,
  MAIA2_VOCAB_SIZE,
  createMaia2HumanPolicyModel,
  decodeMaia2MaskedProbabilities,
  encodeFenToMaia2Tensor,
  encodeLegalMovesForMaia2,
  estimateGamePuzzleDifficulty,
  maia2EloCategory,
  mirrorUciMove,
  type Maia2TensorRunner
} from "../src/index.ts";

interface ParityVector {
  fen: string;
  isBlack: boolean;
  nonzeroCount: number;
  nonzeroCoords: [number, number, number][];
  legalMoves: [string, string, number][];
}

const PARITY_VECTORS: ParityVector[] = JSON.parse(
  readFileSync(
    resolve("packages/core/test/fixtures/maia2-parity-vectors.json"),
    "utf8"
  )
);

test("Maia-2 Elo category and move mirroring match Python maia2.utils exactly", () => {
  assert.equal(maia2EloCategory(600), 0);
  assert.equal(maia2EloCategory(1099), 0);
  assert.equal(maia2EloCategory(1100), 1);
  assert.equal(maia2EloCategory(1199), 1);
  assert.equal(maia2EloCategory(1500), 5);
  assert.equal(maia2EloCategory(1700), 7);
  assert.equal(maia2EloCategory(1999), 9);
  assert.equal(maia2EloCategory(2000), 10);
  assert.equal(maia2EloCategory(2600), 10);

  assert.equal(mirrorUciMove("e2e4"), "e7e5");
  assert.equal(mirrorUciMove("e7e8q"), "e2e1q");
  assert.equal(mirrorUciMove("a1h8"), "a8h1");
  assert.equal(MAIA2_VOCAB_SIZE, 1880);
  assert.equal(MAIA2_MOVE_VOCAB.length, 1880);
});

test("encodeFenToMaia2Tensor and encodeLegalMovesForMaia2 match Python maia2 bit-for-bit on 10 diverse FENs", () => {
  assert.equal(PARITY_VECTORS.length, 10);

  for (const vec of PARITY_VECTORS) {
    const encoded = encodeFenToMaia2Tensor(vec.fen);
    assert.equal(encoded.isBlack, vec.isBlack, `isBlack mismatch for ${vec.fen}`);
    assert.equal(encoded.tensor.length, MAIA2_TENSOR_FLOATS);

    const actualCoords: [number, number, number][] = [];
    for (let c = 0; c < 18; c += 1) {
      for (let r = 0; r < 8; r += 1) {
        for (let f = 0; f < 8; f += 1) {
          const val = encoded.tensor[c * 64 + r * 8 + f];
          if (val !== 0) {
            assert.equal(val, 1.0);
            actualCoords.push([c, r, f]);
          }
        }
      }
    }
    assert.equal(actualCoords.length, vec.nonzeroCount, `nonzero count mismatch for ${vec.fen}`);
    assert.deepEqual(actualCoords, vec.nonzeroCoords, `tensor coords mismatch for ${vec.fen}`);

    const legal = encodeLegalMovesForMaia2(vec.fen);
    assert.equal(legal.isBlack, vec.isBlack);
    const actualLegal = legal.rawMoves
      .map((raw, i) => [raw, legal.isBlack ? mirrorUciMove(raw) : raw, legal.vocabIndices[i]!] as [string, string, number])
      .sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepEqual(actualLegal, vec.legalMoves, `legal move vocab mismatch for ${vec.fen}`);
  }
});

test("createMaia2HumanPolicyModel batches positions x Elos, computes masked softmax + ranks + entropy, and upgrades difficulty estimate to maia2_sf_v1", async () => {
  let lastBatchSize = 0;
  let unloadCalls = 0;

  const runner: Maia2TensorRunner = {
    id: "test-maia2-runner",
    async runBatch(input) {
      lastBatchSize = input.batchSize;
      assert.equal(input.boards.length, input.batchSize * MAIA2_TENSOR_FLOATS);
      const out = new Float32Array(input.batchSize * MAIA2_VOCAB_SIZE);
      // Give e2e4 (index for White) a strong positive logit so it ranks #1
      const e2e4Idx = MAIA2_MOVE_VOCAB.indexOf("e2e4");
      const d2d4Idx = MAIA2_MOVE_VOCAB.indexOf("d2d4");
      for (let b = 0; b < input.batchSize; b += 1) {
        out[b * MAIA2_VOCAB_SIZE + e2e4Idx] = input.eloSelfCategories[b]! >= 7 ? 3.5 : 2.0;
        out[b * MAIA2_VOCAB_SIZE + d2d4Idx] = 1.0;
      }
      return out;
    },
    async unload() {
      unloadCalls += 1;
    }
  };

  const model = createMaia2HumanPolicyModel(runner);
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const scored = await model.scoreMoves([
    { fen: startFen, moves: ["e2e4", "d2d4"], elos: [1100, 1700] }
  ]);
  assert.equal(lastBatchSize, 2);
  assert.equal(scored.length, 1);

  const elo1100 = scored[0]!.byElo[1100]!;
  const elo1700 = scored[0]!.byElo[1700]!;
  assert.equal(elo1100.ranks?.["e2e4"], 1);
  assert.equal(elo1100.ranks?.["d2d4"], 2);
  assert.ok(elo1700.probs["e2e4"]! > elo1100.probs["e2e4"]!);
  assert.ok((elo1100.entropy ?? 0) > 0);
  assert.equal(elo1100.top1Prob, elo1100.probs["e2e4"]);

  // Verify estimateGamePuzzleDifficulty upgrades to maia2_sf_v1 when model is supplied
  const stubEngine = {
    async analyze() {
      return [
        { multipv: 1, depth: 8, move: "e2e4", score: { kind: "cp" as const, sideToMoveCentipawns: 40, whiteCentipawns: 40 }, pv: ["e2e4", "e7e5"] },
        { multipv: 2, depth: 8, move: "d2d4", score: { kind: "cp" as const, sideToMoveCentipawns: 25, whiteCentipawns: 25 }, pv: ["d2d4", "d7d5"] }
      ];
    }
  };
  const est = await estimateGamePuzzleDifficulty(
    {
      puzzleKind: "line",
      initialFen: startFen,
      solutionMoves: ["e2e4", "e7e5"]
    },
    stubEngine,
    { humanPolicy: model }
  );
  assert.equal(est.ratingSource, "maia2_sf_v1");
  assert.ok(est.rating >= 600 && est.rating <= 2200);

  await model.unload();
  assert.equal(unloadCalls, 1);

  // Verify decodeMaia2MaskedProbabilities sums to 1
  const probs = decodeMaia2MaskedProbabilities([0, 2, 0], ["a", "b"], [0, 1]);
  assert.ok(Math.abs((probs["a"]! + probs["b"]!) - 1) < 1e-9);
  assert.ok(probs["b"]! > probs["a"]!);
});
