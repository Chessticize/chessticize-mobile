import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryPuzzleStats,
  buildHistoryView,
  filterHistoryAttemptsForQuery,
  historyAttemptHasReviewQueued,
  normalizeHistoryAttemptDetail,
  resolveHistoryRange,
  sideToMoveForHistoryPuzzle,
  validateHistoryQuery
} from "../src/index.ts";
import type { HistoryAttemptView, Puzzle } from "../src/index.ts";

test("history query accepts optional ratingKey and resolves supported time ranges", () => {
  assert.deepEqual(resolveHistoryRange("2026-06-21T12:00:00.000Z", "7d"), {
    since: "2026-06-14T12:00:00.000Z",
    until: "2026-06-21T12:00:00.000Z"
  });
  assert.deepEqual(resolveHistoryRange("2026-06-21T12:00:00.000Z", "1y"), {
    since: "2025-06-21T12:00:00.000Z",
    until: "2026-06-21T12:00:00.000Z"
  });
  assert.deepEqual(resolveHistoryRange("2026-06-21T12:00:00.000Z", "max"), {
    until: "2026-06-21T12:00:00.000Z"
  });
  assert.deepEqual(
    validateHistoryQuery({ now: "2026-06-21T12:00:00.000Z", timeRange: "30d" }),
    { now: "2026-06-21T12:00:00.000Z", timeRange: "30d" }
  );
  assert.deepEqual(
    validateHistoryQuery({ now: "2026-06-21T12:00:00.000Z", timeRange: "30d", ratingKey: " " }),
    { now: "2026-06-21T12:00:00.000Z", timeRange: "30d" }
  );
});

test("history view validates paging and slices visible attempts", () => {
  const view = buildHistoryView({
    query: {
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      ratingKey: " standard 5/20 ",
      page: { limit: 1, offset: 1 }
    },
    ratingKeys: [],
    attempts: [
      attempt({ id: "a1", puzzleId: "p1", result: "wrong", completedAt: "2026-06-20T00:00:00.000Z" }),
      attempt({ id: "a2", puzzleId: "p2", result: "correct", completedAt: "2026-06-20T00:01:00.000Z" })
    ],
    elo: [],
    reviews: []
  });

  assert.equal(view.query.ratingKey, "standard 5/20");
  assert.deepEqual(view.page, {
    limit: 1,
    offset: 1,
    total: 2,
    hasMore: false
  });
  assert.deepEqual(
    view.attempts.map((attemptView) => attemptView.id),
    ["a2"]
  );
  assert.throws(
    () =>
      validateHistoryQuery({
        now: "2026-06-21T12:00:00.000Z",
        timeRange: "max",
        ratingKey: "standard 5/20",
        page: { limit: 0 }
      }),
    /limit must be a positive integer/
  );
  assert.throws(
    () =>
      validateHistoryQuery({
        now: "2026-06-21T12:00:00.000Z",
        timeRange: "max",
        ratingKey: "standard 5/20",
        page: { limit: 10, offset: -1 }
      }),
    /offset must be a non-negative integer/
  );
});

test("history performance and puzzle stats use the full filtered range, not the visible page", () => {
  const attempts: HistoryAttemptView[] = [
    attempt({ id: "a3", puzzleId: "p3", result: "correct", completedAt: "2026-06-20T00:02:00.000Z" }),
    attempt({ id: "a2", puzzleId: "p2", result: "correct", completedAt: "2026-06-20T00:01:00.000Z" }),
    attempt({ id: "a1", puzzleId: "p1", result: "wrong", completedAt: "2026-06-20T00:00:00.000Z" })
  ];
  const view = buildHistoryView({
    query: {
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20",
      page: { limit: 1, offset: 1 }
    },
    ratingKeys: [],
    attempts,
    elo: [
      {
        sessionId: "s1",
        completedAt: "2026-06-20T00:03:00.000Z",
        ratingBefore: 600,
        ratingAfter: 612
      }
    ],
    reviews: [
      {
        puzzleId: "p1",
        mode: "standard",
        ratingKey: "standard 5/20",
        dueDay: "2026-06-21",
        intervalDays: 1,
        reviewCount: 1,
        successStreak: 0,
        lapseCount: 1,
        lastResult: "wrong",
        lastReviewedAt: "2026-06-20T00:00:00.000Z"
      }
    ]
  });

  assert.deepEqual(view.attempts.map((attemptView) => attemptView.id), ["a2"]);
  assert.deepEqual(view.performance, {
    correctCount: 2,
    wrongCount: 1,
    accuracyPercent: 67,
    charts: {
      rating: [{
        key: "s1-2026-06-20T00:03:00.000Z-0",
        value: 612,
        completedAt: "2026-06-20T00:03:00.000Z"
      }],
      "wins-losses": [
        { key: "a1-0", value: -1 },
        { key: "a2-1", value: 0 },
        { key: "a3-2", value: 1 }
      ],
      accuracy: [
        { key: "a1-0", value: 0 },
        { key: "a2-1", value: 50 },
        { key: "a3-2", value: 67 }
      ],
      solved: [
        { key: "a1-0", value: 0 },
        { key: "a2-1", value: 1 },
        { key: "a3-2", value: 2 }
      ],
      "mistake-rate": [
        { key: "a1-0", value: 100 },
        { key: "a2-1", value: 50 },
        { key: "a3-2", value: 33 }
      ],
      "review-due": [
        { key: "p1\u0000standard\u0000standard 5/20-0", value: 2 },
        { key: "p2\u0000standard\u0000standard 5/20-1", value: 0 },
        { key: "p3\u0000standard\u0000standard 5/20-2", value: 0 }
      ]
    }
  });
  assert.deepEqual(
    view.puzzleStats.map((stats) => stats.puzzleId),
    ["p1", "p2", "p3"]
  );
});

test("history view filters speed and review status before paging", () => {
  const attempts: HistoryAttemptView[] = [
    attempt({ id: "a1", puzzleId: "p1", result: "wrong", completedAt: "2026-06-20T00:00:00.000Z", ratingKey: "standard 5/20" }),
    attempt({ id: "a2", puzzleId: "p2", result: "wrong", completedAt: "2026-06-20T00:01:00.000Z", ratingKey: "standard 5/30" }),
    attempt({ id: "a3", puzzleId: "p3", result: "wrong", completedAt: "2026-06-20T00:02:00.000Z", ratingKey: "standard 5/20" })
  ];
  const reviews = [
    {
      puzzleId: "p3",
      mode: "standard" as const,
      ratingKey: "standard 5/20",
      dueDay: "2026-06-21",
      intervalDays: 1,
      reviewCount: 1,
      successStreak: 0,
      lapseCount: 1,
      lastResult: "wrong" as const,
      lastReviewedAt: "2026-06-20T00:02:00.000Z"
    }
  ];

  const view = buildHistoryView({
    query: {
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20",
      speedSeconds: 20,
      reviewStatus: "queued",
      page: { limit: 1 }
    },
    ratingKeys: [],
    attempts: filterHistoryAttemptsForQuery({
      attempts,
      query: {
        speedSeconds: 20,
        reviewStatus: "queued"
      },
      reviews
    }),
    elo: [],
    reviews,
    allAttemptsForOptions: attempts
  });

  assert.deepEqual(view.attempts.map((attemptView) => attemptView.id), ["a3"]);
  assert.deepEqual(view.page, {
    limit: 1,
    offset: 0,
    total: 1,
    hasMore: false
  });
  assert.deepEqual(view.availableSpeeds, [20, 30]);
  assert.equal(historyAttemptHasReviewQueued(attempts[0] as HistoryAttemptView, reviews), false);
  assert.equal(historyAttemptHasReviewQueued(attempts[2] as HistoryAttemptView, reviews), true);
});

test("history query validates optional puzzle rating bounds", () => {
  assert.deepEqual(
    validateHistoryQuery({
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20",
      minRating: 800,
      maxRating: 1200
    }),
    {
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20",
      minRating: 800,
      maxRating: 1200
    }
  );
  assert.throws(
    () =>
      validateHistoryQuery({
        now: "2026-06-21T12:00:00.000Z",
        timeRange: "max",
        ratingKey: "standard 5/20",
        minRating: -1
      }),
    /minRating must be a non-negative integer/
  );
  assert.throws(
    () =>
      validateHistoryQuery({
        now: "2026-06-21T12:00:00.000Z",
        timeRange: "max",
        ratingKey: "standard 5/20",
        minRating: 1400,
        maxRating: 1200
      }),
    /minRating must be less than or equal to maxRating/
  );
});

test("history puzzle stats aggregate original sprint attempts and attach next review", () => {
  const attempts: HistoryAttemptView[] = [
    attempt({ id: "a1", puzzleId: "p1", result: "wrong", completedAt: "2026-06-20T00:00:00.000Z" }),
    attempt({ id: "a2", puzzleId: "p1", result: "correct", completedAt: "2026-06-20T00:01:00.000Z" }),
    attempt({ id: "a3", puzzleId: "p2", result: "wrong", completedAt: "2026-06-20T00:02:00.000Z" })
  ];

  assert.deepEqual(
    buildHistoryPuzzleStats(attempts, [
      {
        puzzleId: "p1",
        mode: "standard",
        ratingKey: "standard 5/20",
        dueDay: "2026-06-21",
        intervalDays: 1,
        reviewCount: 1,
        successStreak: 0,
        lapseCount: 1,
        lastResult: "wrong",
        lastReviewedAt: "2026-06-20T00:00:00.000Z"
      }
    ]),
    [
      {
        puzzleId: "p1",
        mode: "standard",
        ratingKey: "standard 5/20",
        correctCount: 1,
        wrongCount: 1,
        lastWrongAt: "2026-06-20T00:00:00.000Z",
        nextReviewDay: "2026-06-21"
      },
      {
        puzzleId: "p2",
        mode: "standard",
        ratingKey: "standard 5/20",
        correctCount: 0,
        wrongCount: 1,
        lastWrongAt: "2026-06-20T00:02:00.000Z"
      }
    ]
  );
});

test("history puzzle stats attach review queue by puzzle, mode, and rating key", () => {
  const standardAttempt = attempt({
    id: "a1",
    puzzleId: "shared",
    result: "wrong",
    completedAt: "2026-06-20T00:00:00.000Z",
    mode: "standard",
    ratingKey: "standard 5/20"
  });
  const arrowAttempt = attempt({
    id: "a2",
    puzzleId: "shared",
    result: "wrong",
    completedAt: "2026-06-20T00:01:00.000Z",
    mode: "arrow_duel",
    ratingKey: "arrow duel 5/30"
  });
  const reviews = [
    {
      puzzleId: "shared",
      mode: "arrow_duel" as const,
      ratingKey: "arrow duel 5/30",
      dueDay: "2026-06-22",
      intervalDays: 2,
      reviewCount: 1,
      successStreak: 0,
      lapseCount: 1,
      lastResult: "wrong" as const,
      lastReviewedAt: "2026-06-20T00:01:00.000Z"
    }
  ];

  assert.equal(historyAttemptHasReviewQueued(standardAttempt, reviews), false);
  assert.equal(historyAttemptHasReviewQueued(arrowAttempt, reviews), true);
  assert.deepEqual(buildHistoryPuzzleStats([standardAttempt, arrowAttempt], reviews), [
    {
      puzzleId: "shared",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30",
      correctCount: 0,
      wrongCount: 1,
      lastWrongAt: "2026-06-20T00:01:00.000Z",
      nextReviewDay: "2026-06-22"
    },
    {
      puzzleId: "shared",
      mode: "standard",
      ratingKey: "standard 5/20",
      correctCount: 0,
      wrongCount: 1,
      lastWrongAt: "2026-06-20T00:00:00.000Z"
    }
  ]);
});

test("history side-to-move reflects the user turn shown for standard puzzles", () => {
  assert.equal(sideToMoveForHistoryPuzzle({ puzzle: standardPuzzle(), mode: "standard" }), "white");
});

test("history attempt detail preserves persisted context and normalizes malformed fields", () => {
  assert.deepEqual(
    normalizeHistoryAttemptDetail({
      ...attempt({
        id: "custom-attempt",
        puzzleId: "custom-puzzle",
        result: "wrong",
        completedAt: "2026-06-20T00:00:15.000Z",
        mode: "custom",
        ratingKey: "hangingPiece custom 5/20"
      }),
      source: "scheduled_review",
      submittedMove: "e2e4",
      expectedMove: "e2e3",
      ratingAfter: 584
    }),
    {
      id: "custom-attempt",
      puzzleId: "custom-puzzle",
      source: "scheduled_review",
      mode: "custom",
      ratingKey: "hangingPiece custom 5/20",
      result: "wrong",
      startedAt: "2026-06-20T00:00:00.000Z",
      completedAt: "2026-06-20T00:00:15.000Z",
      elapsedSeconds: 15,
      submittedMove: "e2e4",
      expectedMove: "e2e3",
      ratingBefore: 600,
      ratingAfter: 584,
      ratingAfterStatus: "valid",
      ratingDelta: -16,
      arrowDuelCandidateOrderStatus: "absent",
      dataStatus: "complete"
    }
  );

  assert.deepEqual(
    normalizeHistoryAttemptDetail({
      ...attempt({
        id: "partial-attempt",
        puzzleId: "partial-puzzle",
        result: "correct",
        completedAt: "not-a-date"
      }),
      startedAt: "also-not-a-date",
      submittedMove: " ",
      expectedMove: "",
      ratingBefore: Number.NaN,
      ratingAfter: Number.POSITIVE_INFINITY
    }),
    {
      id: "partial-attempt",
      puzzleId: "partial-puzzle",
      source: "sprint",
      mode: "standard",
      ratingKey: "standard 5/20",
      result: "correct",
      startedAt: null,
      completedAt: null,
      elapsedSeconds: null,
      submittedMove: null,
      expectedMove: null,
      ratingBefore: null,
      ratingAfter: null,
      ratingAfterStatus: "invalid",
      ratingDelta: null,
      arrowDuelCandidateOrderStatus: "absent",
      dataStatus: "partial"
    }
  );

  const malformedPersistedAttempt = {
    ...attempt({
      id: "malformed-persisted-attempt",
      puzzleId: "malformed-puzzle",
      result: "correct",
      completedAt: "01/02/03"
    }),
    source: "mystery-source",
    mode: "mystery-mode",
    ratingKey: "   ",
    result: "mystery-result",
    startedAt: "0"
  } as unknown as HistoryAttemptView;

  assert.deepEqual(normalizeHistoryAttemptDetail(malformedPersistedAttempt), {
    id: "malformed-persisted-attempt",
    puzzleId: "malformed-puzzle",
    source: null,
    mode: null,
    ratingKey: null,
    result: null,
    startedAt: null,
    completedAt: null,
    elapsedSeconds: null,
    submittedMove: "a1a2",
    expectedMove: "a1a3",
    ratingBefore: 600,
    ratingAfter: null,
    ratingAfterStatus: "absent",
    ratingDelta: null,
    arrowDuelCandidateOrderStatus: "absent",
    dataStatus: "partial"
  });
});

function attempt(input: {
  id: string;
  puzzleId: string;
  result: "correct" | "wrong";
  completedAt: string;
  mode?: HistoryAttemptView["mode"];
  ratingKey?: string;
}): HistoryAttemptView {
  return {
    id: input.id,
    source: "sprint",
    sessionId: "s1",
    puzzleId: input.puzzleId,
    mode: input.mode ?? "standard",
    ratingKey: input.ratingKey ?? "standard 5/20",
    result: input.result,
    submittedMove: "a1a2",
    expectedMove: "a1a3",
    startedAt: "2026-06-20T00:00:00.000Z",
    completedAt: input.completedAt,
    ratingBefore: 600,
    puzzleRating: 900,
    side: "white",
    themes: ["fork"]
  };
}

function standardPuzzle(): Puzzle {
  return {
    id: "00008",
    initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    solutionMoves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
    rating: 1798,
    themes: ["hangingPiece"],
    source: "lichess",
    stockfishBestMove: "b2b1"
  };
}
