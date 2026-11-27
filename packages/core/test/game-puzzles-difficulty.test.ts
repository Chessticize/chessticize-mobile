import assert from "node:assert/strict";
import test from "node:test";
import {
  ARROW_DUEL_ELO_GRID,
  DEFAULT_MAX_REVIEW_ABOVE_USER_RATING,
  estimateGamePuzzleDifficulty,
  evaluateTreeEnsemble,
  extractDifficultyStructuralFeatures,
  getDefaultDifficultyModels,
  isWithinReviewDifficultyBand,
  solvePromptedArrowDuelRating,
  type HumanPolicyModel,
  type PuzzleExtractionEngine
} from "../src/index.ts";

test("solvePromptedArrowDuelRating preserves Lichess scale when intuition is neutral (q=0.5)", () => {
  for (const rating of [800, 1200, 1500, 1850, 2100]) {
    const ad = solvePromptedArrowDuelRating(rating, ARROW_DUEL_ELO_GRID, [0.5, 0.5, 0.5, 0.5, 0.5]);
    assert.equal(ad, rating);
  }
});

test("solvePromptedArrowDuelRating drops obvious good moves to 600 and raises deceptive traps", () => {
  const trivial = solvePromptedArrowDuelRating(2150, ARROW_DUEL_ELO_GRID, [0.9, 0.9, 0.9, 0.9, 0.9]);
  assert.equal(trivial, 600);

  const trap = solvePromptedArrowDuelRating(1500, ARROW_DUEL_ELO_GRID, [0.0, 0.0, 0.0, 0.0, 0.0]);
  assert.ok(Math.abs(trap - 1691) <= 2, `Expected ~1691, got ${trap}`);
});

test("default pretrained difficulty models are registered and evaluate cleanly", () => {
  const { sfHeuristicModel, maia2SfModel } = getDefaultDifficultyModels();
  assert.ok(sfHeuristicModel && sfHeuristicModel.trees.length > 50);
  assert.ok(maia2SfModel && maia2SfModel.trees.length > 50);

  // Mate in 1 position should evaluate much easier than a multi-move quiet sacrifice
  const mate1Feats = extractDifficultyStructuralFeatures(
    "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
    ["g2g4", "d8h4"]
  );
  assert.equal(mate1Feats.std_m1_is_mate1, 1);
  assert.equal(mate1Feats.std_m1_is_check, 1);

  const mate1Rating = evaluateTreeEnsemble(sfHeuristicModel, {
    ...mate1Feats,
    sf_std_found_depth: 1,
    sf_std_eval_d1: 1500,
    sf_std_eval_d2: 1500,
    sf_std_eval_d4: 1500,
    sf_std_eval_d8: 1500,
    sf_std_jump_d8_d1: 0,
    sf_std_jump_d8_d2: 0,
    sf_std_jump_d8_d4: 0,
    sf_std_multipv_gap_d8: 1500
  });
  assert.ok(mate1Rating <= 1100, `Expected easy mate-in-1 rating <= 1100, got ${mate1Rating}`);
});

test("estimateGamePuzzleDifficulty gracefully falls back without HumanPolicyModel and upgrades with one", async () => {
  const stubEngine: PuzzleExtractionEngine = {
    async analyze(req) {
      if (req.multiPv === 2) {
        return [
          { multipv: 1, depth: req.depth ?? 8, move: "d8h4", pv: ["d8h4"], score: { kind: "mate", whiteMate: -1, sideToMoveMate: 1 } },
          { multipv: 2, depth: req.depth ?? 8, move: "b8c6", pv: ["b8c6"], score: { kind: "cp", whiteCentipawns: 0, sideToMoveCentipawns: 0 } }
        ];
      }
      return [
        { multipv: 1, depth: req.depth ?? 4, move: "d8h4", pv: ["d8h4"], score: { kind: "mate", whiteMate: -1, sideToMoveMate: 1 } }
      ];
    }
  };

  const adPuzzle = {
    puzzleKind: "arrow_duel" as const,
    initialFen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
    solutionMoves: ["g2g4", "d8h4"],
    arrowDuel: {
      bestMove: "e2e4",
      blunderMove: "g2g4",
      bestEvalWhite: 0,
      blunderEvalWhite: -10000,
      punishmentLine: ["d8h4"],
      decisionFen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2"
    }
  };

  const fallback = await estimateGamePuzzleDifficulty(adPuzzle, stubEngine);
  assert.equal(fallback.ratingSource, "sf_heuristic_v1");
  assert.ok(fallback.rating >= 600 && fallback.rating <= 2200);

  const fakePolicy: HumanPolicyModel = {
    async scoreMoves(requests) {
      return requests.map((req) => {
        const byElo: Record<number, { probs: Record<string, number>; top1Prob: number; entropy: number }> = {};
        for (const elo of req.elos) {
          const probs: Record<string, number> = {};
          for (const m of req.moves) {
            probs[m] = m === "e2e4" ? 0.9 : m === "g2g4" ? 0.02 : 0.85;
          }
          byElo[elo] = { probs, top1Prob: 0.9, entropy: 0.5 };
        }
        return { byElo };
      });
    }
  };

  const withPolicy = await estimateGamePuzzleDifficulty(adPuzzle, stubEngine, {
    humanPolicy: fakePolicy
  });
  assert.equal(withPolicy.ratingSource, "maia2_sf_v1");
  assert.equal(withPolicy.arrowDuelRating, 600);
  assert.equal(withPolicy.rating, 600);
});

test("isWithinReviewDifficultyBand filters puzzles above userRating + 300 by default", () => {
  assert.equal(DEFAULT_MAX_REVIEW_ABOVE_USER_RATING, 300);
  assert.equal(isWithinReviewDifficultyBand(1450, 1400), true);
  assert.equal(isWithinReviewDifficultyBand(1700, 1400), true);
  assert.equal(isWithinReviewDifficultyBand(1701, 1400), false);
  assert.equal(isWithinReviewDifficultyBand(2000, 1400), false);
  assert.equal(isWithinReviewDifficultyBand(2000, undefined), true);
});
