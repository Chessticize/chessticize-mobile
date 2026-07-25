import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryPuzzleStats,
  buildHistoryView,
  collectHistoryRatingKeys,
  curatedPuzzleThemes,
  filterHistoryAttemptsForQuery,
  historyAttemptHasReviewQueued,
  historyAttemptReplayAvailability,
  normalizeHistoryAttemptDetail,
  resolveHistoryRange,
  sideToMoveForHistoryPuzzle,
  validateHistoryQuery
} from "../src/index.ts";
import type { HistoryAttemptView, Puzzle, ReviewQueueState } from "../src/index.ts";

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

test("history normalizes legacy singular themes into the multi-theme OR contract", () => {
  assert.deepEqual(
    validateHistoryQuery({
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      theme: " pin ",
      themes: ["fork", "pin"]
    }),
    {
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      themes: ["fork", "pin"]
    }
  );

  const attempts = [
    attempt({ id: "fork", puzzleId: "fork-puzzle", result: "correct", completedAt: "2026-06-20T00:00:00.000Z", themes: ["fork"] }),
    attempt({ id: "pin", puzzleId: "pin-puzzle", result: "correct", completedAt: "2026-06-20T00:01:00.000Z", themes: ["pin"] }),
    attempt({ id: "skewer", puzzleId: "skewer-puzzle", result: "correct", completedAt: "2026-06-20T00:02:00.000Z", themes: ["skewer"] })
  ];
  assert.deepEqual(
    filterHistoryAttemptsForQuery({ attempts, query: { themes: ["fork", "pin"] }, reviews: [] })
      .map((historyAttempt) => historyAttempt.id),
    ["fork", "pin"]
  );
  assert.deepEqual(
    filterHistoryAttemptsForQuery({ attempts, query: { theme: "pin" }, reviews: [] })
      .map((historyAttempt) => historyAttempt.id),
    ["pin"]
  );
});

test("history exposes only server-curated themes as filter options", () => {
  const view = buildHistoryView({
    query: { now: "2026-06-21T12:00:00.000Z", timeRange: "max" },
    ratingKeys: [],
    attempts: [
      attempt({
        id: "curated",
        puzzleId: "curated-puzzle",
        result: "correct",
        completedAt: "2026-06-20T00:00:00.000Z",
        themes: ["endgame", "pin", "mateIn2"]
      })
    ],
    elo: [],
    reviews: []
  });

  assert.deepEqual(view.availableThemes, ["mateIn2", "pin"]);
});

test("history rating filters collect only runtime-valid persisted rating keys", () => {
  assert.deepEqual(collectHistoryRatingKeys([
    " standard 5/20 ",
    "standard 5/20",
    " ",
    "unknown",
    "arrow duel 5/30",
    "arrow_duel 5/30",
    "hangingPiece custom 5/20",
    "run:history-focus",
    "run:invalid id",
    "standard 0/20",
    "standard 5/0",
    null
  ]), [
    "standard 5/20",
    "arrow duel 5/30",
    "arrow_duel 5/30",
    "hangingPiece custom 5/20",
    "run:history-focus"
  ]);
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

test("history filters Unclear Attempts and keeps the count scoped outside the Unclear toggle", () => {
  const unclear = attempt({
    id: "unclear",
    puzzleId: "p1",
    result: "correct",
    completedAt: "2026-06-20T00:00:00.000Z",
    unclear: true
  });
  const clear = attempt({
    id: "clear",
    puzzleId: "p2",
    result: "correct",
    completedAt: "2026-06-20T00:01:00.000Z"
  });

  assert.deepEqual(
    filterHistoryAttemptsForQuery({ attempts: [unclear, clear], query: { unclear: true }, reviews: [] })
      .map((attemptView) => attemptView.id),
    ["unclear"]
  );
  assert.equal(buildHistoryView({
    query: { now: "2026-06-21T12:00:00.000Z", timeRange: "max", unclear: true },
    ratingKeys: [],
    attempts: [unclear],
    allAttemptsForOptions: [unclear, clear],
    unclearCount: 1,
    elo: [],
    reviews: []
  }).unclearCount, 1);
});

test("Needs attention is Unclear or in Review and remains AND with other facets", () => {
  const attempts = [
    attempt({
      id: "wrong-in-review",
      puzzleId: "review-puzzle",
      result: "wrong",
      completedAt: "2026-06-20T00:00:10.000Z",
      themes: ["fork"]
    }),
    attempt({
      id: "wrong-cleared",
      puzzleId: "cleared-puzzle",
      result: "wrong",
      completedAt: "2026-06-20T00:00:15.000Z",
      themes: ["fork"]
    }),
    attempt({
      id: "correct-in-review",
      puzzleId: "review-puzzle",
      result: "correct",
      completedAt: "2026-06-20T00:00:17.000Z",
      unclear: false,
      unclearUpdatedAt: "2026-06-20T00:00:18.000Z",
      themes: ["fork"]
    }),
    {
      ...attempt({
        id: "slow-correct",
        puzzleId: "slow-puzzle",
        result: "correct",
        completedAt: "2026-06-20T00:00:20.000Z",
        themes: ["pin"]
      }),
      timingStatus: "slow" as const
    },
    timedOutAttempt({
        id: "timed-out",
        puzzleId: "timeout-puzzle",
        completedAt: "2026-06-20T00:00:30.000Z",
        unclear: true,
        themes: ["pin"]
    }),
    attempt({
      id: "unclear-correct",
      puzzleId: "unclear-puzzle",
      result: "correct",
      completedAt: "2026-06-20T00:00:40.000Z",
      unclear: true,
      themes: ["fork"]
    }),
    attempt({
      id: "normal",
      puzzleId: "normal-puzzle",
      result: "correct",
      completedAt: "2026-06-20T00:00:50.000Z",
      themes: ["pin"]
    })
  ];
  const reviews = [{
    puzzleId: "review-puzzle",
    mode: "standard" as const,
    ratingKey: "standard 5/20",
    dueDay: "2026-06-21",
    intervalDays: 1,
    reviewCount: 1,
    successStreak: 0,
    lapseCount: 1,
    lastResult: "wrong" as const,
    lastReviewedAt: "2026-06-20T00:00:10.000Z"
  }];

  assert.deepEqual(
    filterHistoryAttemptsForQuery({
      attempts,
      query: { attentionOnly: true },
      reviews
    }).map((historyAttempt) => historyAttempt.id),
    ["wrong-in-review", "correct-in-review", "timed-out", "unclear-correct"]
  );
  assert.deepEqual(
    filterHistoryAttemptsForQuery({
      attempts,
      query: {
        attentionOnly: true,
        result: "correct",
        themes: ["fork"]
      },
      reviews: []
    }).map((historyAttempt) => historyAttempt.id),
    ["unclear-correct"]
  );
  assert.deepEqual(
    filterHistoryAttemptsForQuery({
      attempts,
      query: {
        attentionOnly: true,
        reviewStatus: "queued"
      },
      reviews
    }).map((historyAttempt) => historyAttempt.id),
    ["wrong-in-review", "correct-in-review"]
  );
  assert.deepEqual(
    filterHistoryAttemptsForQuery({
      attempts,
      query: {
        attentionOnly: true,
        reviewStatus: "clear"
      },
      reviews
    }).map((historyAttempt) => historyAttempt.id),
    ["timed-out", "unclear-correct"]
  );
  assert.equal(
    historyAttemptHasReviewQueued(
      attempts.find((historyAttempt) => historyAttempt.id === "correct-in-review")!,
      reviews
    ),
    true
  );
});

test("active Review includes a clean correct attempt without prior Unclear state", () => {
  const cleanCorrect = attempt({
    id: "clean-correct-in-review",
    puzzleId: "manual-review-puzzle",
    result: "correct",
    completedAt: "2026-06-20T00:00:17.000Z"
  });
  const reviews = [{
    puzzleId: "manual-review-puzzle",
    mode: "standard" as const,
    ratingKey: "standard 5/20",
    dueDay: "2026-06-21",
    intervalDays: 1,
    reviewCount: 0,
    successStreak: 0,
    lapseCount: 0,
    lastResult: "wrong" as const,
    lastReviewedAt: "2026-06-20T00:00:18.000Z"
  }];

  assert.deepEqual(
    filterHistoryAttemptsForQuery({
      attempts: [cleanCorrect],
      query: { attentionOnly: true },
      reviews
    }).map((historyAttempt) => historyAttempt.id),
    ["clean-correct-in-review"]
  );
  assert.deepEqual(
    filterHistoryAttemptsForQuery({
      attempts: [cleanCorrect],
      query: { reviewStatus: "queued" },
      reviews
    }).map((historyAttempt) => historyAttempt.id),
    ["clean-correct-in-review"]
  );
  assert.equal(historyAttemptHasReviewQueued(cleanCorrect, reviews), true);
});

test("Timed out appears in Wrong and mistake performance while remaining distinct from Correct", () => {
  const timedOut = timedOutAttempt({
      id: "timed-out",
      puzzleId: "timeout-puzzle",
      completedAt: "2026-06-20T00:01:00.000Z"
  });
  const attempts = [
    timedOut,
    attempt({
      id: "wrong",
      puzzleId: "wrong-puzzle",
      result: "wrong",
      completedAt: "2026-06-20T00:00:20.000Z"
    }),
    attempt({
      id: "correct",
      puzzleId: "correct-puzzle",
      result: "correct",
      completedAt: "2026-06-20T00:00:10.000Z"
    })
  ];

  assert.deepEqual(
    filterHistoryAttemptsForQuery({ attempts, query: { result: "correct" }, reviews: [] })
      .map((historyAttempt) => historyAttempt.id),
    ["correct"]
  );
  assert.deepEqual(
    filterHistoryAttemptsForQuery({ attempts, query: { result: "wrong" }, reviews: [] })
      .map((historyAttempt) => historyAttempt.id),
    ["timed-out", "wrong"]
  );
  const view = buildHistoryView({
    query: { now: "2026-06-21T12:00:00.000Z", timeRange: "max" },
    ratingKeys: [],
    attempts,
    elo: [],
    reviews: []
  });
  assert.equal(view.performance.correctCount, 1);
  assert.equal(view.performance.wrongCount, 2);
  assert.deepEqual(view.puzzleStats.map((stats) => stats.puzzleId), [
    "correct-puzzle",
    "timeout-puzzle",
    "wrong-puzzle"
  ]);
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

test("history performance keeps exact summaries while bounding display series", () => {
  const attemptCount = 600;
  const chronologicalAttempts = Array.from({ length: attemptCount }, (_, index) => attempt({
    id: `a${index}`,
    puzzleId: `p${index}`,
    result: index % 2 === 0 ? "correct" : "wrong",
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
  }));
  const view = buildHistoryView({
    query: {
      now: "2026-06-21T12:00:00.000Z",
      timeRange: "max",
      ratingKey: "standard 5/20",
      page: { limit: 20 }
    },
    ratingKeys: [],
    attempts: [...chronologicalAttempts].reverse(),
    elo: chronologicalAttempts.map((attemptView, index) => ({
      sessionId: `s${index}`,
      completedAt: attemptView.completedAt,
      ratingBefore: 600 + index,
      ratingAfter: 601 + index
    })),
    reviews: []
  });

  assert.equal(view.performance.correctCount, 300);
  assert.equal(view.performance.wrongCount, 300);
  assert.equal(view.performance.accuracyPercent, 50);
  for (const points of Object.values(view.performance.charts)) {
    assert.equal(points.length, 512);
  }
  assert.deepEqual(view.performance.charts.rating[0], {
    key: `s0-${chronologicalAttempts[0]!.completedAt}-0`,
    value: 601,
    completedAt: chronologicalAttempts[0]!.completedAt
  });
  assert.deepEqual(view.performance.charts.rating.at(-1), {
    key: `s599-${chronologicalAttempts[599]!.completedAt}-599`,
    value: 1200,
    completedAt: chronologicalAttempts[599]!.completedAt
  });
  assert.equal(view.performance.charts.solved[0]?.value, 1);
  assert.equal(view.performance.charts.solved.at(-1)?.value, 300);
});

test("unknown persisted results remain readable but stay out of filters, stats, and performance charts", () => {
  const wrong = attempt({ id: "wrong", puzzleId: "wrong-puzzle", result: "wrong", completedAt: "2026-06-20T00:00:00.000Z" });
  const correct = attempt({ id: "correct", puzzleId: "correct-puzzle", result: "correct", completedAt: "2026-06-20T00:01:00.000Z" });
  const unknown = {
    ...attempt({ id: "unknown", puzzleId: "unknown-puzzle", result: "wrong", completedAt: "2026-06-20T00:02:00.000Z" }),
    result: "mystery-result"
  } as unknown as HistoryAttemptView;
  const attempts = [unknown, correct, wrong];

  const view = buildHistoryView({
    query: { now: "2026-06-21T12:00:00.000Z", timeRange: "max" },
    ratingKeys: [],
    attempts,
    elo: [],
    reviews: []
  });

  assert.deepEqual(view.attempts.map((attemptView) => attemptView.id), ["unknown", "correct", "wrong"]);
  assert.deepEqual(view.performance.correctCount, 1);
  assert.deepEqual(view.performance.wrongCount, 1);
  assert.deepEqual(view.performance.accuracyPercent, 50);
  assert.deepEqual(view.puzzleStats.map((stats) => stats.puzzleId), ["correct-puzzle", "wrong-puzzle"]);
  for (const metric of ["wins-losses", "accuracy", "solved", "mistake-rate"] as const) {
    assert.deepEqual(view.performance.charts[metric].map((point) => point.key), ["wrong-0", "correct-1"]);
  }
  assert.deepEqual(
    filterHistoryAttemptsForQuery({ attempts, query: { result: "wrong" }, reviews: [] }).map((attemptView) => attemptView.id),
    ["wrong"]
  );
});

test("history view filters speed and review status before paging", () => {
  const attempts: HistoryAttemptView[] = [
    attempt({ id: "a1", puzzleId: "p1", result: "wrong", completedAt: "2026-06-20T00:00:00.000Z", ratingKey: "standard 5/20" }),
    attempt({ id: "a2", puzzleId: "p2", result: "wrong", completedAt: "2026-06-20T00:01:00.000Z", ratingKey: "standard 5/30" }),
    attempt({ id: "a3", puzzleId: "p3", result: "wrong", completedAt: "2026-06-20T00:02:00.000Z", ratingKey: "standard 5/20" }),
    { ...attempt({ id: "a4", puzzleId: "p4", result: "correct", completedAt: "2026-06-20T00:03:00.000Z", ratingKey: "run:focus" }), perPuzzleSeconds: 45 }
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
  assert.deepEqual(view.availableSpeeds, [20, 30, 45]);
  assert.deepEqual(
    filterHistoryAttemptsForQuery({ attempts, query: { speedSeconds: 45 }, reviews }).map((attemptView) => attemptView.id),
    ["a4"]
  );
  assert.equal(historyAttemptHasReviewQueued(attempts[0] as HistoryAttemptView, reviews), false);
  assert.equal(historyAttemptHasReviewQueued(attempts[2] as HistoryAttemptView, reviews), true);
});

test("history review-status filtering indexes a large queue once", () => {
  const itemCount = 400;
  let reviewPuzzleIdReads = 0;
  const reviews: ReviewQueueState[] = Array.from({ length: itemCount }, (_, index) => ({
    get puzzleId() {
      reviewPuzzleIdReads += 1;
      return `p${index}`;
    },
    mode: "standard",
    ratingKey: "standard 5/20",
    dueDay: "2026-06-21",
    intervalDays: 1,
    reviewCount: 1,
    successStreak: 0,
    lapseCount: 1,
    lastResult: "wrong",
    lastReviewedAt: "2026-06-20T00:00:00.000Z"
  }));
  const attempts = Array.from({ length: itemCount }, (_, index) => attempt({
    id: `a${index}`,
    puzzleId: `p${itemCount - 1}`,
    result: "wrong",
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
  }));

  assert.equal(
    filterHistoryAttemptsForQuery({
      attempts,
      query: { reviewStatus: "queued" },
      reviews
    }).length,
    itemCount
  );
  assert.equal(reviewPuzzleIdReads, itemCount);
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

test("history replay availability validates persisted Arrow candidates against the actual puzzle", () => {
  const validAttempt = {
    ...attempt({
      id: "valid-arrow",
      puzzleId: "00008",
      result: "wrong",
      completedAt: "2026-06-20T00:00:05.000Z",
      mode: "arrow_duel",
      ratingKey: "arrow duel 5/30"
    }),
    arrowDuelCandidateOrder: ["b2b1", "f2g3"]
  };
  const invalidAttempt = {
    ...validAttempt,
    id: "invalid-arrow",
    arrowDuelCandidateOrder: ["a1a2", "a2a3"]
  };

  assert.deepEqual(historyAttemptReplayAvailability({ attempt: validAttempt, puzzle: standardPuzzle() }), {
    status: "available",
    mode: "arrow_duel",
    ratingKey: "arrow duel 5/30"
  });
  assert.deepEqual(historyAttemptReplayAvailability({ attempt: invalidAttempt, puzzle: standardPuzzle() }), {
    status: "unavailable",
    reason: "arrow-candidates-unavailable"
  });
});

type AttemptFixtureInput = {
  id: string;
  puzzleId: string;
  result: HistoryAttemptView["result"];
  completedAt: string;
  mode?: HistoryAttemptView["mode"];
  ratingKey?: string;
  unclear?: boolean;
  unclearUpdatedAt?: string;
  themes?: string[];
};

function attempt(input: AttemptFixtureInput): HistoryAttemptView {
  const themes = input.themes ?? ["fork"];
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
    ...(input.unclear === undefined ? {} : { unclear: input.unclear }),
    ...(input.unclearUpdatedAt === undefined ? {} : { unclearUpdatedAt: input.unclearUpdatedAt }),
    puzzleRating: 900,
    side: "white",
    themes,
    curatedThemes: curatedPuzzleThemes(themes)
  };
}

function timedOutAttempt(
  input: Omit<AttemptFixtureInput, "result">
): HistoryAttemptView {
  const {
    submittedMove: _submittedMove,
    ...withoutSubmittedMove
  } = attempt({ ...input, result: "timed_out" });
  return {
    ...withoutSubmittedMove,
    timingStatus: "timed_out"
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
