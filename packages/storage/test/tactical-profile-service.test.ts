import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSprintConfig,
  startSprint,
  type AttemptEvent,
  type Puzzle,
  type TacticalProfileCalibrationArtifact
} from "../../core/src/index.ts";
import { MemoryStore } from "../src/memory-store.ts";
import { PracticeService } from "../src/practice-service.ts";
import { MemoryTacticalProfileRepository } from "../src/tactical-profile-repository.ts";
import { TacticalProfileService } from "../src/tactical-profile-service.ts";

test("TacticalProfileService rebuilds dirty days and converges after duplicate import", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const repository = new MemoryTacticalProfileRepository();
  const profile = service(store, repository);

  const first = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  assert.equal(first.phase, "ready");
  assert.equal(first.cutoffs.line.home[0]?.theme, "fork");
  const firstCells = repository.listDailyCells(identity());

  profile.markCanonicalImportChanged();
  const second = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  assert.equal(second.phase, "ready");
  assert.deepEqual(repository.listDailyCells(identity()), firstCells);
});

test("a clean Tactical Profile read uses daily cells without rescanning canonical history", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());
  const first = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  const originalListAttempts = store.listAttempts.bind(store);
  let rawHistoryReads = 0;
  store.listAttempts = (filter = {}) => {
    rawHistoryReads += 1;
    return originalListAttempts(filter);
  };

  const snapshot = profile.getSnapshot("2026-07-26T00:00:00.000Z");

  assert.equal(snapshot.phase, "ready");
  assert.equal(rawHistoryReads, 0);
  assert.equal(snapshot.buildState.evaluatedAt, "2026-07-25T00:00:00.000Z");
  assert.deepEqual(snapshot.evaluation, first.evaluation);
});

test("chronological, reversed, and duplicate canonical imports converge to identical cells", () => {
  const source = seededStore();
  seedWeaknessHistory(source);
  const exported = source.exportLocalData();
  const variants = [
    exported.attempts,
    [...exported.attempts].reverse(),
    [...exported.attempts, ...exported.attempts].reverse()
  ];
  const serializedCells = variants.map((attempts) => {
    const target = seededStore();
    target.importLocalData({ ...exported, attempts });
    const repository = new MemoryTacticalProfileRepository();
    service(target, repository).getSnapshot("2026-07-25T00:00:00.000Z");
    return JSON.stringify(repository.listDailyCells(identity()));
  });

  assert.equal(new Set(serializedCells).size, 1);
});

test("TacticalProfileService preserves 10 / 5 quotas, exact deduplication, and an unrated fixed Run", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());

  const result = profile.prepareFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "focus-seed"
  );

  assert.equal(result.status, "ready", JSON.stringify(result));
  if (result.status !== "ready") {
    return;
  }
  assert.deepEqual(
    result.prepared.plan.reasons.map((reason) => [reason.theme, reason.count]),
    [["fork", 10]]
  );
  assert.equal(result.prepared.plan.mixedControlCount, 5);
  assert.equal(result.prepared.puzzles.length, 15);
  assert.equal(new Set(result.prepared.puzzles.map((puzzle) => puzzle.id)).size, 15);
  assert.equal(
    result.prepared.puzzles.filter((puzzle) => puzzle.themes.includes("fork")).length,
    10
  );
  assert.equal(result.prepared.config.maxAttempts, 15);
  assert.equal(result.prepared.config.ratingPolicy, "unrated");
  assert.equal(result.prepared.config.tacticalFocus?.mixedControlCount, 5);
  assert.equal(result.prepared.config.ratingKey, "standard 5/20");
  assert.deepEqual(
    result.prepared.puzzles.map((puzzle) =>
      puzzle.themes.includes("fork") ? "focus" : "mixed"
    ),
    [
      "focus", "focus", "mixed",
      "focus", "focus", "mixed",
      "focus", "focus", "mixed",
      "focus", "focus", "mixed",
      "focus", "focus", "mixed"
    ]
  );
});

test("TacticalProfileService does not re-offer a Focused Run before fresh mixed evidence", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());
  const prepared = profile.prepareFocusedRun("line", "2026-07-25T00:00:00.000Z");
  assert.equal(prepared.status, "ready", JSON.stringify(prepared));
  if (prepared.status !== "ready") {
    return;
  }
  const focused = startSprint({
    id: "focused-session",
    config: prepared.prepared.config,
    puzzles: [...prepared.prepared.puzzles],
    ratingBefore: 925,
    now: "2026-07-24T00:00:00.000Z"
  });
  store.createSprintSession({
    ...focused,
    status: "won",
    completedAt: "2026-07-24T00:05:00.000Z",
    endReason: "attempt_limit",
    correctCount: 12,
    mistakeCount: 3
  });

  assert.deepEqual(
    profile.prepareFocusedRun("line", "2026-07-25T00:00:00.000Z"),
    { status: "unavailable", reason: "no_fresh_evidence" }
  );
});

test("PracticeService starts the prepared Focused Run through the normal session boundary", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const profile = service(store, new MemoryTacticalProfileRepository());
  const practice = new PracticeService(store, profile);

  const started = practice.startFocusedRun(
    "line",
    "2026-07-25T00:00:00.000Z",
    "focus-seed"
  );

  assert.equal(started.status, "active");
  assert.equal(started.puzzles.length, 15);
  assert.equal(started.config.ratingPolicy, "unrated");
  assert.equal(started.config.tacticalFocus?.taskFamily, "line");
  assert.equal(
    practice.listSprintSessions().find((session) => session.id === started.id)?.config?.maxAttempts,
    15
  );
});

test("an uncalibrated task family remains collecting without scanning it into recommendations", () => {
  const store = seededStore();
  seedWeaknessHistory(store);
  const uncalibrated: TacticalProfileCalibrationArtifact = {
    ...CALIBRATION,
    families: {
      line: { status: "unavailable", reason: "Holdout sample is not representative" },
      arrow_duel: { status: "unavailable", reason: "Holdout sample is not representative" }
    }
  };
  const profile = new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository: new MemoryTacticalProfileRepository(),
    calibration: uncalibrated,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} }
  });

  const snapshot = profile.getSnapshot("2026-07-25T00:00:00.000Z");
  assert.equal(snapshot.phase, "collecting");
  assert.equal(snapshot.evaluation.signals.length, 0);
  assert.match(snapshot.unavailableFamilies.line ?? "", /not representative/);
});

function service(
  store: MemoryStore,
  repository: MemoryTacticalProfileRepository
): TacticalProfileService {
  return new TacticalProfileService({
    progressStore: store,
    puzzleSource: store,
    repository,
    calibration: CALIBRATION,
    naturalFrequency: { line: { fork: 0.12 }, arrow_duel: {} },
    focusedRunPolicy: {
      runSize: 15,
      recentPuzzleDays: 30,
      ratingBandHalfWidths: [100, 200]
    }
  });
}

function seededStore(): MemoryStore {
  const store = new MemoryStore();
  const evidence = Array.from({ length: 12 }, (_, index) =>
    puzzle(`evidence-${index}`, ["fork"])
  );
  const freshForks = Array.from({ length: 12 }, (_, index) =>
    puzzle(`fresh-fork-${index}`, ["fork"])
  );
  const mixed = Array.from({ length: 12 }, (_, index) =>
    puzzle(`mixed-${index}`, ["sacrifice"])
  );
  store.seedPuzzles([...evidence, ...freshForks, ...mixed]);
  store.saveRating({
    key: "standard 5/20",
    generation: 0,
    rating: 925,
    ratingDeviation: 80,
    volatility: 0.06,
    games: 12
  });
  return store;
}

function seedWeaknessHistory(store: MemoryStore): void {
  const config = buildSprintConfig({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20
  });
  for (let sessionIndex = 0; sessionIndex < 3; sessionIndex += 1) {
    const day = 10 + sessionIndex * 4;
    const startedAt = `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const completedAt = `2026-07-${String(day).padStart(2, "0")}T00:04:00.000Z`;
    const session = startSprint({
      id: `mixed-session-${sessionIndex}`,
      config,
      puzzles: [store.getPuzzle(`evidence-${sessionIndex * 4}`)!],
      ratingBefore: 925,
      now: startedAt
    });
    store.createSprintSession({
      ...session,
      status: "failed",
      completedAt,
      endReason: "max_mistakes",
      correctCount: 0,
      mistakeCount: 4,
      ratingAfter: 900
    });
    for (let offset = 0; offset < 4; offset += 1) {
      const index = sessionIndex * 4 + offset;
      store.recordAttempt(attempt({
        id: `attempt-${index}`,
        sessionId: session.id,
        puzzleId: `evidence-${index}`,
        completedAt
      }));
    }
  }
}

function attempt(input: {
  id: string;
  sessionId: string;
  puzzleId: string;
  completedAt: string;
}): AttemptEvent {
  return {
    id: input.id,
    source: "sprint",
    sessionId: input.sessionId,
    puzzleId: input.puzzleId,
    mode: "standard",
    ratingKey: "standard 5/20",
    result: "wrong",
    submittedMove: "e6d6",
    expectedMove: "e6e7",
    startedAt: input.completedAt,
    completedAt: input.completedAt,
    elapsedMs: 10_000,
    ratingBefore: 925
  };
}

function puzzle(id: string, themes: string[]): Puzzle {
  return {
    id,
    initialFen: "8/8/4P3/8/8/8/8/4K2k w - - 0 1",
    solutionMoves: ["e6e7"],
    rating: 925,
    ratingDeviation: 80,
    themes,
    source: "lichess",
    stockfishBestMove: id
  };
}

function identity() {
  return {
    modelVersion: CALIBRATION.modelVersion,
    packFeatureHash: CALIBRATION.packFeatureHash,
    calibrationId: CALIBRATION.calibrationId
  };
}

const CALIBRATION = {
  schemaVersion: 1,
  modelVersion: "test-v1",
  calibrationId: "test-calibration",
  packFeatureHash: "test-pack-rd",
  createdAt: "2026-07-01T00:00:00.000Z",
  recencyHalfLifeDays: 90,
  evidence: {
    watchProbability: 0.75,
    recommendationExitProbability: 0.85,
    recommendationProbability: 0.9,
    strongProbability: 0.97,
    minDistinctPuzzles: 4,
    minDistinctSessions: 2
  },
  opportunity: {
    minimumWeight: 0.25,
    exponent: 0.5
  },
  families: {
    line: calibratedFamily(),
    arrow_duel: calibratedFamily()
  }
} as const satisfies TacticalProfileCalibrationArtifact;

function calibratedFamily() {
  return {
    status: "calibrated",
    solve: {
      intercept: 0,
      ratingGapSlope: 1,
      timeoutLogCoefficient: 0,
      timeoutReferenceSeconds: 60,
      themePriorSdRating: 200,
      practicalDeficitRating: 20,
      minExpectedFailuresPer100: 2
    },
    speed: {
      interceptLogSeconds: Math.log(30),
      relativeDifficultyCoefficient: 0,
      decisionCountCoefficient: 0,
      paceLogCoefficient: 0,
      slowPolicyLogCoefficient: 0,
      residualSd: 0.25,
      themePriorSdLogSeconds: 0.5,
      practicalTimeMultiplier: 1.2
    }
  } as const;
}
