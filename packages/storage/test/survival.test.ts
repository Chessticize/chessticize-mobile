import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Puzzle, SprintState } from "../../core/src/index.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { PracticeService } from "../src/practice-service.ts";
import type {
  SurvivalPuzzleBatch,
  SurvivalPuzzleBatchInput
} from "../src/puzzle-source.ts";
import { SQLiteStore } from "../src/sqlite-store.ts";

const NOW = "2026-08-11T12:00:00.000Z";
const LEVEL = { minRating: 900, maxRating: 999 } as const;

test("PracticeService traverses Survival in bounded no-repeat batches and saves each new best immediately", () => {
  const { service } = survivalService(40);
  const ratingBefore = service.getRating("standard 5/20");
  let state = service.startSurvival({
    challengeType: "puzzle",
    level: LEVEL,
    ratingSourceRunId: "standard",
    selectionSeed: "forty-puzzles"
  }, NOW);
  const seen = new Set<string>();

  for (let index = 0; index < 40; index += 1) {
    const puzzleId = state.currentPuzzle?.puzzle.id;
    assert.ok(puzzleId);
    assert.equal(seen.has(puzzleId), false);
    seen.add(puzzleId);
    state = service.submitMove(
      "e6e7",
      new Date(Date.parse(NOW) + (index + 1) * 1000).toISOString()
    ).state;
    assert.ok(state.puzzles.length <= 32);
    assert.equal(service.listSurvivalBests()[0]?.score, index + 1);
  }

  assert.equal(seen.size, 40);
  assert.equal(state.status, "won");
  assert.equal(state.endReason, "pool_cleared");
  assert.equal(state.survival?.loadedPuzzleCount, 40);
  assert.equal(state.survival?.consumedPuzzleCount, 40);
  assert.deepEqual(service.getRating("standard 5/20"), ratingBefore);
});

test("a refill failure remains retryable without consuming the current puzzle or claiming a pool clear", () => {
  const store = new FailingRefillStore();
  store.seedPuzzles(Array.from({ length: 33 }, (_, index) =>
    oneMovePuzzle(`refill-${index.toString().padStart(2, "0")}`, 900 + index)
  ));
  const service = new PracticeService(store, undefined, {
    survivalPackVersion: 5,
    survivalPackHash: "sha256:test-pack"
  });
  let state = service.startSurvival({
    challengeType: "puzzle",
    level: LEVEL,
    ratingSourceRunId: "standard",
    selectionSeed: "refill-failure"
  }, NOW);
  for (let index = 0; index < 31; index += 1) {
    state = service.submitMove(
      "e6e7",
      new Date(Date.parse(NOW) + (index + 1) * 1000).toISOString()
    ).state;
  }
  const currentPuzzleId = state.currentPuzzle?.puzzle.id;

  assert.throws(
    () => service.submitMove("e6e7", "2026-08-11T12:01:00.000Z"),
    /retryable refill failure/
  );
  assert.equal(service.getActiveSprint()?.status, "active");
  assert.equal(service.getActiveSprint()?.currentPuzzle?.puzzle.id, currentPuzzleId);
  assert.equal(service.getActiveSprint()?.correctCount, 31);
  assert.equal(service.listHistory({ sessionId: state.id }).length, 31);
  assert.equal(service.listSurvivalBests()[0]?.score, 31);
});

test("a paused Survival Run resumes the exact puzzle after service recreation", () => {
  const { service, store } = survivalService(6);
  let state = service.startSurvival({
    challengeType: "puzzle",
    level: LEVEL,
    ratingSourceRunId: "standard",
    selectionSeed: "resume"
  }, NOW);
  state = service.submitMove("e6e7", "2026-08-11T12:00:02.000Z").state;
  const paused = service.pauseSprint("2026-08-11T12:00:04.000Z").state;
  const puzzleId = paused.currentPuzzle?.puzzle.id;
  const fen = paused.currentPuzzle?.currentFen;
  service.leavePausedSurvival();

  const restarted = new PracticeService(store, undefined, {
    survivalPackVersion: 5,
    survivalPackHash: "sha256:test-pack"
  });
  assert.equal(restarted.getActiveSprint(), undefined);
  assert.equal(restarted.listResumableSurvivalRuns()[0]?.currentPuzzle?.puzzle.id, puzzleId);
  const resumed = restarted.resumeSurvival(paused.id, "2026-08-11T13:00:04.000Z");

  assert.equal(resumed.status, "active");
  assert.equal(resumed.currentPuzzle?.puzzle.id, puzzleId);
  assert.equal(resumed.currentPuzzle?.currentFen, fen);
  assert.equal(resumed.survival?.sittings, 2);
  assert.equal(resumed.totalPausedMs, 3_600_000);
});

test("SQLite commits the resumable state, live best, and source preference across reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chessticize-survival-sqlite-"));
  const databasePath = join(directory, "practice.sqlite");
  try {
    const store = new SQLiteStore(databasePath);
    store.migrate();
    const service = new PracticeService(store, undefined, {
      survivalPackVersion: 5,
      survivalPackHash: "sha256:test-pack"
    });
    service.loadFixturePuzzles(Array.from({ length: 6 }, (_, index) =>
      oneMovePuzzle(`sqlite-${index}`, 900 + index)
    ));
    let state = service.startSurvival({
      challengeType: "puzzle",
      level: LEVEL,
      ratingSourceRunId: "standard",
      selectionSeed: "sqlite-resume"
    }, NOW);
    state = service.submitMove("e6e7", "2026-08-11T12:00:01.000Z").state;
    const paused = service.pauseSprint("2026-08-11T12:00:02.000Z").state;
    service.leavePausedSurvival();
    const expectedPuzzleId = paused.currentPuzzle?.puzzle.id;
    store.close();

    const reopenedStore = new SQLiteStore(databasePath);
    reopenedStore.migrate();
    const reopened = new PracticeService(reopenedStore, undefined, {
      survivalPackVersion: 5,
      survivalPackHash: "sha256:test-pack"
    });
    assert.equal(reopened.listResumableSurvivalRuns()[0]?.currentPuzzle?.puzzle.id, expectedPuzzleId);
    assert.equal(reopened.listSurvivalBests()[0]?.score, 1);
    assert.equal(reopened.selectedSurvivalRatingSourceId("puzzle"), "standard");
    const resumed = reopened.resumeSurvival(paused.id, "2026-08-11T13:00:02.000Z");
    assert.equal(resumed.currentPuzzle?.puzzle.id, expectedPuzzleId);
    assert.equal(resumed.survival?.sittings, 2);
    reopenedStore.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("starting the same type and level continues its existing mistakes instead of resetting", () => {
  const { service } = survivalService(8);
  let state = service.startSurvival({
    challengeType: "puzzle",
    level: LEVEL,
    ratingSourceRunId: "standard",
    selectionSeed: "same-level"
  }, NOW);
  state = service.submitMove("e6d6", "2026-08-11T12:00:01.000Z").state;
  service.pauseSprint("2026-08-11T12:00:02.000Z");
  service.leavePausedSurvival();

  const continued = service.startSurvival({
    challengeType: "puzzle",
    level: LEVEL,
    ratingSourceRunId: "standard",
    selectionSeed: "ignored-new-seed"
  }, "2026-08-11T12:30:00.000Z");

  assert.equal(continued.id, state.id);
  assert.equal(continued.mistakeCount, 1);
  assert.equal(continued.config.survival?.selectionSeed, "same-level");
});

test("different Survival type-and-level keys coexist without a global active-run cap", () => {
  const { service } = survivalService(12, true);
  const first = service.startSurvival({
    challengeType: "puzzle",
    level: LEVEL,
    ratingSourceRunId: "standard",
    selectionSeed: "puzzle-900"
  }, NOW);
  service.pauseSprint("2026-08-11T12:00:01.000Z");
  service.leavePausedSurvival();
  const second = service.startSurvival({
    challengeType: "puzzle",
    level: { minRating: 1000, maxRating: 1099 },
    ratingSourceRunId: "standard",
    selectionSeed: "puzzle-1000"
  }, "2026-08-11T12:01:00.000Z");
  service.pauseSprint("2026-08-11T12:01:01.000Z");
  service.leavePausedSurvival();
  const third = service.startSurvival({
    challengeType: "arrow_duel",
    level: LEVEL,
    ratingSourceRunId: "arrow-duel",
    selectionSeed: "arrow-900"
  }, "2026-08-11T12:02:00.000Z");

  assert.notEqual(first.id, second.id);
  assert.notEqual(second.id, third.id);
  assert.equal(service.listResumableSurvivalRuns().length, 3);
});

test("Arrow Duel candidate and required reply each add at most one mistake for the puzzle", () => {
  const { service } = survivalService(6, true);
  let state = service.startSurvival({
    challengeType: "arrow_duel",
    level: LEVEL,
    ratingSourceRunId: "arrow-duel",
    selectionSeed: "arrow-mistakes"
  }, NOW);

  state = service.submitMove("f2g3", "2026-08-11T12:00:01.000Z").state;
  assert.equal(state.mistakeCount, 1);
  state = service.submitMove("b2b1", "2026-08-11T12:00:02.000Z").state;
  assert.equal(state.currentPuzzle?.kind, "arrow_duel");
  assert.equal(state.currentPuzzle?.phase, "reply_handoff");
  state = service.beginArrowDuelReply("2026-08-11T12:00:03.000Z");
  state = service.submitMove("e6d6", "2026-08-11T12:00:04.000Z").state;

  assert.equal(state.mistakeCount, 2);
  assert.equal(service.listHistory({ sessionId: state.id }).length, 2);
});

test("Arrow Duel Survival inherits the global opponent-reply setting without its own override", () => {
  const enabled = survivalService(6, true).service;
  const enabledState = enabled.startSurvival({
    challengeType: "arrow_duel",
    level: LEVEL,
    ratingSourceRunId: "arrow-duel",
    selectionSeed: "reply-enabled"
  }, NOW);
  assert.equal(enabledState.config.opponentReply?.enabled, true);
  enabled.pauseSprint("2026-08-11T12:00:01.000Z");
  enabled.leavePausedSurvival();
  enabled.saveSettings({
    ...enabled.getSettings(),
    arrowDuel: { opponentReplyEnabled: false }
  });
  const resumedEnabledState = enabled.startSurvival({
    challengeType: "arrow_duel",
    level: LEVEL,
    ratingSourceRunId: "arrow-duel",
    selectionSeed: "ignored-after-setting-change"
  }, "2026-08-11T12:30:00.000Z");
  assert.equal(resumedEnabledState.id, enabledState.id);
  assert.equal(resumedEnabledState.config.opponentReply?.enabled, true);

  const disabled = survivalService(6, true).service;
  disabled.saveSettings({
    ...disabled.getSettings(),
    arrowDuel: { opponentReplyEnabled: false }
  });
  let disabledState = disabled.startSurvival({
    challengeType: "arrow_duel",
    level: LEVEL,
    ratingSourceRunId: "arrow-duel",
    selectionSeed: "reply-disabled"
  }, NOW);
  assert.equal(disabledState.config.opponentReply?.enabled, false);

  const firstPuzzleId = disabledState.currentPuzzle?.puzzle.id;
  disabledState = disabled.submitMove("f2g3", "2026-08-11T12:00:01.000Z").state;
  assert.equal(disabledState.correctCount, 0);
  assert.equal(disabledState.mistakeCount, 1);
  assert.equal(disabledState.currentPuzzle?.kind, "arrow_duel");
  assert.equal(disabledState.currentPuzzle?.phase, "choice");
  assert.notEqual(disabledState.currentPuzzle?.puzzle.id, firstPuzzleId);
  const wrongHistory = disabled.listHistory({ sessionId: disabledState.id });
  assert.equal(wrongHistory.length, 1);
  assert.equal(wrongHistory[0]?.result, "wrong");
  assert.equal(wrongHistory[0]?.submittedMove, "f2g3");

  const secondPuzzleId = disabledState.currentPuzzle?.puzzle.id;
  disabledState = disabled.submitMove("b2b1", "2026-08-11T12:00:01.000Z").state;
  assert.equal(disabledState.correctCount, 1);
  assert.equal(disabledState.currentPuzzle?.kind, "arrow_duel");
  assert.equal(disabledState.currentPuzzle?.phase, "choice");
  assert.notEqual(disabledState.currentPuzzle?.puzzle.id, secondPuzzleId);
});

test("an unavailable saved Rating source is preserved and cannot silently fall back", () => {
  const { service } = survivalService(5);
  const custom = service.createPracticeRun({
    id: "alternate",
    name: "Alternate",
    mode: "custom",
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    initialRating: 1000
  }, NOW);
  service.saveSurvivalRatingSourcePreference("puzzle", custom.id);
  service.archivePracticeRun(custom.id, "2026-08-11T12:00:01.000Z");

  assert.equal(service.selectedSurvivalRatingSourceId("puzzle"), custom.id);
  assert.equal(
    service.listSurvivalRatingSources("puzzle").some((source) => source.run.id === custom.id),
    false
  );
  assert.throws(() => service.startSurvival({
    challengeType: "puzzle",
    level: { minRating: 1000, maxRating: 1099 },
    ratingSourceRunId: custom.id
  }, "2026-08-11T12:01:00.000Z"), /unavailable/);
});

test("Survival cannot be manually abandoned and keeps a live best after the third mistake", () => {
  const { service } = survivalService(8);
  let state = service.startSurvival({
    challengeType: "puzzle",
    level: LEVEL,
    ratingSourceRunId: "standard",
    selectionSeed: "best-survives"
  }, NOW);
  state = service.submitMove("e6e7", "2026-08-11T12:00:01.000Z").state;
  assert.throws(() => service.abandonSprint("2026-08-11T12:00:02.000Z"), /only end/);
  for (let index = 0; index < 3; index += 1) {
    state = service.submitMove(
      "e6d6",
      new Date(Date.parse(NOW) + (index + 3) * 1000).toISOString()
    ).state;
  }

  assert.equal(state.status, "won");
  assert.equal(state.endReason, "max_mistakes");
  assert.equal(service.listSurvivalBests()[0]?.score, 1);
  assert.equal(service.listSurvivalSessions().filter((session) => session.completedAt).length, 1);
});

function survivalService(
  count: number,
  includeNextLevel = false
): { service: PracticeService; store: MemoryStore } {
  const store = new MemoryStore();
  const puzzles = Array.from({ length: count }, (_, index) => oneMovePuzzle(
    `p-${index.toString().padStart(3, "0")}`,
    900 + (index % 100)
  ));
  if (includeNextLevel) {
    puzzles.push(...Array.from({ length: count }, (_, index) => oneMovePuzzle(
      `next-${index.toString().padStart(3, "0")}`,
      1000 + (index % 100)
    )));
  }
  store.seedPuzzles(puzzles);
  const service = new PracticeService(store, undefined, {
    survivalPackVersion: 5,
    survivalPackHash: "sha256:test-pack"
  });
  return { service, store };
}

function oneMovePuzzle(id: string, rating: number): Puzzle {
  return {
    id,
    initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    solutionMoves: ["f2g3", "e6e7"],
    rating,
    themes: ["crushing"],
    source: "synthetic",
    stockfishEval: -453,
    stockfishBestMove: "b2b1",
    stockfishEvalAfterFirstMove: 693
  };
}

class FailingRefillStore extends MemoryStore {
  private selectionCount = 0;

  override selectSurvivalPuzzleBatch(
    input: SurvivalPuzzleBatchInput
  ): SurvivalPuzzleBatch {
    this.selectionCount += 1;
    if (this.selectionCount > 1) {
      throw new Error("retryable refill failure");
    }
    return super.selectSurvivalPuzzleBatch(input);
  }
}
