import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceSprintTime,
  abandonSprint,
  beginArrowDuelReply,
  buildSprintConfig,
  defaultSprintConfig,
  pauseSprint,
  resumeSprint,
  serializeSprintView,
  startSprint,
  submitSprintMove
} from "../src/index.ts";
import type { Puzzle } from "../src/index.ts";

const NOW = "2026-06-20T00:00:00.000Z";

test("default sprint configs model minutes, target count, and max mistakes", () => {
  assert.deepEqual(defaultSprintConfig("standard"), {
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    puzzleTiming: {
      slowAfterSeconds: 40,
      timeoutAfterSeconds: 60
    },
    targetCorrect: 15,
    maxMistakes: 3,
    ratingKey: "standard 5/20"
  });
  assert.equal(defaultSprintConfig("blitz").targetCorrect, 30);
  assert.equal(defaultSprintConfig("arrow_duel").targetCorrect, 10);
  assert.deepEqual(defaultSprintConfig("arrow_duel").opponentReply, {
    enabled: true,
    seconds: 10
  });
});

test("sprint initializes a per-puzzle deadline and records Slow from the puzzle start", () => {
  let state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  assert.equal(state.currentPuzzleStartedAt, NOW);
  assert.equal(state.currentPuzzleDeadlineAt, "2026-06-20T00:01:00.000Z");

  const solved = submitSprintMove(state, "e6e7", "2026-06-20T00:00:41.000Z");
  assert.equal(solved.attempt?.startedAt, NOW);
  assert.equal(solved.attempt?.elapsedMs, 41_000);
  assert.equal(solved.attempt?.timingStatus, "slow");
  assert.equal(solved.attempt?.unclear, true);
  assert.equal(solved.attempt?.unclearUpdatedAt, solved.attempt?.completedAt);
  assert.equal(solved.state.currentPuzzleStartedAt, "2026-06-20T00:00:41.000Z");
  assert.equal(solved.state.currentPuzzleDeadlineAt, "2026-06-20T00:01:41.000Z");
  state = solved.state;

  const wrong = submitSprintMove(state, "e6d6", "2026-06-20T00:01:22.000Z");
  assert.equal(wrong.attempt?.result, "wrong");
  assert.equal(wrong.attempt?.timingStatus, "slow");
  assert.equal(wrong.attempt?.unclear, undefined);
  assert.equal(wrong.attempt?.unclearUpdatedAt, undefined);
});

test("advanceSprintTime counts a timeout as one mistake and advances idempotently", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  assert.equal(advanceSprintTime(started, "2026-06-20T00:00:59.999Z").attempt, undefined);
  const timedOut = advanceSprintTime(started, "2026-06-20T00:01:00.000Z");
  assert.equal(timedOut.attempt?.result, "timed_out");
  assert.equal(timedOut.attempt?.submittedMove, undefined);
  assert.equal(timedOut.attempt?.timingStatus, "timed_out");
  assert.equal(timedOut.attempt?.elapsedMs, 60_000);
  assert.equal(timedOut.attempt?.unclear, undefined);
  assert.equal(timedOut.attempt?.unclearUpdatedAt, undefined);
  assert.equal(timedOut.state.currentPuzzle?.puzzle.id, "p2");
  assert.equal(timedOut.state.currentPuzzleStartedAt, "2026-06-20T00:01:00.000Z");
  assert.equal(timedOut.state.currentPuzzleDeadlineAt, "2026-06-20T00:02:00.000Z");
  assert.equal(timedOut.state.correctCount, 0);
  assert.equal(timedOut.state.mistakeCount, 1);
  assert.equal(timedOut.state.ratingAfter, undefined);

  const repeated = advanceSprintTime(timedOut.state, "2026-06-20T00:01:00.000Z");
  assert.equal(repeated.attempt, undefined);
  assert.equal(repeated.state.currentPuzzle?.puzzle.id, "p2");
});

test("a timeout that reaches the mistake limit fails the sprint with an ELO result", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2,
      maxMistakes: 1
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  const timedOut = advanceSprintTime(started, "2026-06-20T00:01:00.000Z");
  assert.equal(timedOut.attempt?.result, "timed_out");
  assert.equal(timedOut.state.status, "failed");
  assert.equal(timedOut.state.endReason, "max_mistakes");
  assert.equal(timedOut.state.mistakeCount, 1);
  assert.ok(timedOut.state.ratingAfter !== undefined);
  assert.ok(timedOut.state.ratingAfter < timedOut.state.ratingBefore);
  assert.equal(timedOut.state.currentPuzzle, undefined);
});

test("abandoning after a timeout rates the unfinished sprint as failed", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2,
      maxMistakes: 3
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  const timedOut = advanceSprintTime(started, "2026-06-20T00:01:00.000Z");
  const abandoned = abandonSprint(timedOut.state, "2026-06-20T00:01:01.000Z");
  assert.equal(timedOut.state.hasUserSubmittedMove, false);
  assert.equal(abandoned.status, "failed");
  assert.equal(abandoned.endReason, "abandoned");
  assert.ok(abandoned.ratingAfter !== undefined);
  assert.ok(abandoned.ratingAfter < abandoned.ratingBefore);
});

test("a delayed timeout tick records the deadline while starting the next puzzle at processing time", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  const timedOut = advanceSprintTime(started, "2026-06-20T00:01:07.000Z");
  assert.equal(timedOut.attempt?.completedAt, "2026-06-20T00:01:00.000Z");
  assert.equal(timedOut.attempt?.elapsedMs, 60_000);
  assert.equal(timedOut.state.currentPuzzleStartedAt, "2026-06-20T00:01:07.000Z");
  assert.equal(timedOut.state.currentPuzzleDeadlineAt, "2026-06-20T00:02:07.000Z");
});

test("a move at the puzzle deadline returns only the timeout transition", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  const result = submitSprintMove(started, "e6e7", "2026-06-20T00:01:00.000Z");
  assert.equal(result.attempt?.result, "timed_out");
  assert.equal(result.feedback, undefined);
  assert.equal(result.state.currentPuzzle?.puzzle.id, "p2");
  assert.equal(result.state.correctCount, 0);
  assert.equal(result.state.mistakeCount, 1);
});

test("sprint deadline wins over the puzzle deadline", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 60,
      perPuzzleSeconds: 20,
      targetCorrect: 2
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  const expired = advanceSprintTime(state, "2026-06-20T00:01:00.000Z");
  assert.equal(expired.attempt?.result, "incomplete");
  assert.equal(expired.attempt?.completedAt, state.deadlineAt);
  assert.equal(expired.attempt?.submittedMove, undefined);
  assert.equal(expired.attempt?.timingStatus, "slow");
  assert.equal(expired.attempt?.unclear, true);
  assert.equal(expired.attempt?.unclearUpdatedAt, state.deadlineAt);
  assert.equal(expired.state.status, "failed");
  assert.equal(expired.state.endReason, "time_expired");
  assert.equal(expired.state.correctCount, 0);
  assert.equal(expired.state.mistakeCount, 0);
  assert.equal(advanceSprintTime(expired.state, "2026-06-20T00:01:01.000Z").attempt, undefined);
});

test("a just-entered final puzzle becomes a clear Incomplete attempt at the Sprint deadline", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 60,
      perPuzzleSeconds: 20,
      targetCorrect: 3
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });
  const first = submitSprintMove(started, "e6e7", "2026-06-20T00:00:59.000Z");
  assert.equal(first.attempt?.result, "correct");
  assert.equal(first.attempt?.timingStatus, "slow");
  assert.equal(first.attempt?.unclear, true);

  const expired = advanceSprintTime(first.state, "2026-06-20T00:01:04.000Z");
  assert.equal(expired.attempt?.result, "incomplete");
  assert.equal(expired.attempt?.puzzleId, "p2");
  assert.equal(expired.attempt?.startedAt, "2026-06-20T00:00:59.000Z");
  assert.equal(expired.attempt?.completedAt, "2026-06-20T00:01:00.000Z");
  assert.equal(expired.attempt?.elapsedMs, 1_000);
  assert.equal(expired.attempt?.timingStatus, undefined);
  assert.equal(expired.attempt?.unclear, undefined);
  assert.equal(expired.state.correctCount, 1);
  assert.equal(expired.state.mistakeCount, 0);
});

test("pause excludes paused time from puzzle timing and shifts its effective start", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 1
    }),
    puzzles: [oneMovePuzzle("p1")],
    ratingBefore: 900,
    now: NOW
  });
  const paused = pauseSprint(state, "2026-06-20T00:00:10.000Z").state;
  const resumed = resumeSprint(paused, "2026-06-20T00:00:40.000Z");

  assert.equal(resumed.currentPuzzleStartedAt, "2026-06-20T00:00:30.000Z");
  assert.equal(resumed.currentPuzzleDeadlineAt, "2026-06-20T00:01:30.000Z");
  assert.equal(advanceSprintTime(resumed, "2026-06-20T00:01:29.999Z").attempt, undefined);
  const timedOut = advanceSprintTime(resumed, "2026-06-20T00:01:30.000Z");
  assert.equal(timedOut.attempt?.elapsedMs, 60_000);
});

test("pausing at the puzzle deadline records the timeout before pausing the next puzzle", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2")],
    ratingBefore: 900,
    now: NOW
  });

  const paused = pauseSprint(state, "2026-06-20T00:01:00.000Z");

  assert.equal(paused.attempt?.result, "timed_out");
  assert.equal(paused.attempt?.timingStatus, "timed_out");
  assert.equal(paused.state.status, "paused");
  assert.equal(paused.state.currentPuzzleIndex, 1);
  assert.equal(paused.state.correctCount, 0);
  assert.equal(paused.state.mistakeCount, 1);
  assert.equal(paused.state.ratingBefore, 900);
  assert.equal(paused.state.pausedAt, "2026-06-20T00:01:00.000Z");
});

test("timeout with no next puzzle records a mistake and a failed ELO result", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 2
    }),
    puzzles: [oneMovePuzzle("p1")],
    ratingBefore: 900,
    now: NOW
  });

  const timedOut = advanceSprintTime(state, "2026-06-20T00:01:00.000Z");
  assert.equal(timedOut.attempt?.result, "timed_out");
  assert.equal(timedOut.state.status, "failed");
  assert.equal(timedOut.state.endReason, "puzzles_exhausted");
  assert.equal(timedOut.state.currentPuzzle, undefined);
  assert.ok(timedOut.state.ratingAfter !== undefined);
  assert.ok(timedOut.state.ratingAfter < timedOut.state.ratingBefore);
  assert.equal(timedOut.state.correctCount, 0);
  assert.equal(timedOut.state.mistakeCount, 1);
  assert.equal(advanceSprintTime(timedOut.state, "2026-06-20T00:02:00.000Z").attempt, undefined);
});

test("a multi-step solved puzzle can win a target-one sprint and raise its rating", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 600,
    now: NOW
  });

  let result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:05.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.attempt, undefined);

  result = submitSprintMove(result.state, "b3c1", "2026-06-20T00:00:10.000Z");
  assert.equal(result.state.status, "active");

  result = submitSprintMove(result.state, "h6c1", "2026-06-20T00:00:15.000Z");
  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "target_reached");
  assert.equal(result.state.correctCount, 1);
  assert.equal(result.state.currentStreak, 1);
  assert.equal(result.state.bestStreak, 1);
  assert.equal(result.state.ratingAfter, 775);
  assert.ok((result.state.ratingDeviationAfter ?? 0) < 350);
  assert.equal(result.attempt?.result, "correct");
  assert.equal(result.attempt?.mode, "standard");
  assert.equal(result.attempt?.ratingKey, "standard 5/20");
  assert.equal(result.attempt?.ratingBefore, 600);
  assert.equal(result.attempt?.submittedMove, "h6c1");
  assert.equal(result.attempt?.expectedMove, "h6c1");
});

test("sprint streak tracks consecutive solved puzzles and resets on mistakes", () => {
  let state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 5,
      maxMistakes: 3
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2"), oneMovePuzzle("p3"), oneMovePuzzle("p4")],
    ratingBefore: 900,
    now: NOW
  });

  let result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:01.000Z");
  assert.equal(result.state.currentStreak, 0);
  assert.equal(result.state.bestStreak, 0);
  state = result.state;

  result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:02.000Z");
  assert.equal(result.state.currentStreak, 1);
  assert.equal(result.state.bestStreak, 1);
  state = result.state;

  result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:03.000Z");
  assert.equal(result.state.currentStreak, 2);
  assert.equal(result.state.bestStreak, 2);
  state = result.state;

  result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:04.000Z");
  assert.equal(result.state.currentStreak, 0);
  assert.equal(result.state.bestStreak, 2);
});

test("three wrong puzzles fail the sprint and keep rating at the floor", () => {
  let state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 5,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2"), samplePuzzle("p3"), samplePuzzle("p4")],
    ratingBefore: 600,
    now: NOW
  });

  let result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:01.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 1);
  state = result.state;

  result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:02.000Z");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 2);
  state = result.state;

  result = submitSprintMove(state, "e6d6", "2026-06-20T00:00:03.000Z");
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.endReason, "max_mistakes");
  assert.equal(result.state.ratingAfter, 600);
});

test("a correct Arrow Duel move records the puzzle and advances to the next puzzle", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3,
      opponentReply: { enabled: false, seconds: 5 }
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });

  const result = submitSprintMove(state, "b2b1", "2026-06-20T00:00:05.000Z");

  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.attempt?.result, "correct");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.correctCount, 1);
  assert.equal(result.state.currentPuzzle?.puzzle.id, "p2");
});

test("a correct Arrow Duel choice starts a separately timed opponent reply", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3,
      opponentReply: { enabled: true, seconds: 5 }
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });

  const choice = submitSprintMove(started, "b2b1", "2026-06-20T00:00:05.000Z");
  assert.equal(choice.attempt, undefined);
  assert.equal(choice.state.correctCount, 0);
  assert.equal(choice.state.currentPuzzle?.kind, "arrow_duel");
  assert.equal(choice.state.currentPuzzle?.phase, "reply_handoff");
  assert.equal(choice.state.currentPuzzle?.replyPauseStartedAt, "2026-06-20T00:00:05.000Z");
  assert.equal(choice.state.deadlineAt, "2026-06-20T00:05:00.000Z");

  const ignored = advanceSprintTime(choice.state, "2026-06-20T00:02:00.000Z");
  assert.equal(ignored.attempt, undefined);
  assert.equal(ignored.state, choice.state);

  const replying = beginArrowDuelReply(choice.state, "2026-06-20T00:00:07.000Z");
  assert.equal(replying.currentPuzzle?.kind, "arrow_duel");
  assert.equal(replying.currentPuzzle?.phase, "reply");
  assert.equal(replying.currentPuzzle?.replyStartedAt, "2026-06-20T00:00:07.000Z");
  assert.equal(replying.currentPuzzle?.replyDeadlineAt, "2026-06-20T00:00:12.000Z");

  const reply = submitSprintMove(replying, "e6e7", "2026-06-20T00:00:10.000Z");
  assert.equal(reply.feedback?.result, "correct");
  assert.equal(reply.attempt?.result, "correct");
  assert.equal(reply.attempt?.elapsedMs, 5_000);
  assert.equal(reply.state.correctCount, 1);
  assert.equal(reply.state.currentPuzzle?.puzzle.id, "p2");
  assert.equal(reply.state.currentPuzzleStartedAt, "2026-06-20T00:00:10.000Z");
  assert.equal(reply.state.deadlineAt, "2026-06-20T00:05:05.000Z");
  assert.equal(reply.state.totalPausedMs, 5_000);
});

test("a stalemating alternate passes immediately without starting the reply clock", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3,
      opponentReply: { enabled: true, seconds: 10 }
    }),
    puzzles: [stalemateAlternatePuzzle(), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });

  const result = submitSprintMove(started, "g6g7", "2026-06-20T00:00:05.000Z");

  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.feedback?.puzzleSolved, true);
  assert.deepEqual(result.feedback?.autoPlayedMoves, []);
  assert.equal(result.attempt?.result, "correct");
  assert.equal(result.state.correctCount, 1);
  assert.equal(result.state.currentPuzzle?.puzzle.id, "p2");
  assert.equal(result.state.deadlineAt, "2026-06-20T00:05:00.000Z");
  assert.equal(result.state.totalPausedMs ?? 0, 0);
});

test("a wrong Arrow Duel reply marks the whole puzzle wrong", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });
  const choice = submitSprintMove(started, "b2b1", "2026-06-20T00:00:04.000Z");
  const replying = beginArrowDuelReply(choice.state, "2026-06-20T00:00:05.000Z");
  const reply = submitSprintMove(replying, "e6d6", "2026-06-20T00:00:06.000Z");

  assert.equal(reply.feedback?.result, "wrong");
  assert.equal(reply.attempt?.result, "wrong");
  assert.equal(reply.attempt?.expectedMove, "e6e7");
  assert.equal(reply.state.correctCount, 0);
  assert.equal(reply.state.mistakeCount, 1);
  assert.equal(reply.state.currentPuzzle?.puzzle.id, "p2");
  assert.equal(reply.attempt?.elapsedMs, 4_000);
});

test("an Arrow Duel reply timeout excludes reply time and advances once", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3,
      opponentReply: { enabled: true, seconds: 5 }
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });
  const choice = submitSprintMove(started, "b2b1", "2026-06-20T00:00:04.000Z");
  const replying = beginArrowDuelReply(choice.state, "2026-06-20T00:00:06.000Z");

  assert.equal(advanceSprintTime(replying, "2026-06-20T00:00:10.999Z").attempt, undefined);
  const timedOut = advanceSprintTime(replying, "2026-06-20T00:00:11.000Z");
  assert.equal(timedOut.attempt?.result, "timed_out");
  assert.equal(timedOut.attempt?.expectedMove, "e6e7");
  assert.equal(timedOut.attempt?.elapsedMs, 4_000);
  assert.equal(timedOut.state.mistakeCount, 1);
  assert.equal(timedOut.state.currentPuzzle?.puzzle.id, "p2");
  assert.equal(timedOut.state.deadlineAt, "2026-06-20T00:05:07.000Z");
  assert.equal(timedOut.state.totalPausedMs, 7_000);

  const repeated = advanceSprintTime(timedOut.state, "2026-06-20T00:00:11.000Z");
  assert.equal(repeated.attempt, undefined);
  assert.equal(repeated.state.currentPuzzle?.puzzle.id, "p2");
});

test("manual pause during an Arrow Duel reply shifts its independent deadline", () => {
  const started = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });
  const choice = submitSprintMove(started, "b2b1", "2026-06-20T00:00:01.000Z");
  const replying = beginArrowDuelReply(choice.state, "2026-06-20T00:00:02.000Z");
  const paused = pauseSprint(replying, "2026-06-20T00:00:03.000Z").state;
  const resumed = resumeSprint(paused, "2026-06-20T00:00:13.000Z");

  assert.equal(resumed.currentPuzzle?.kind, "arrow_duel");
  assert.equal(resumed.currentPuzzle?.replyDeadlineAt, "2026-06-20T00:00:22.000Z");
  assert.equal(advanceSprintTime(resumed, "2026-06-20T00:00:21.999Z").attempt, undefined);
  assert.equal(advanceSprintTime(resumed, "2026-06-20T00:00:22.000Z").attempt?.result, "timed_out");
});

test("Opponent reply bounds validate without splitting Arrow Duel rating", () => {
  const disabled = buildSprintConfig({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    opponentReply: { enabled: false, seconds: 1 }
  });
  const enabled = buildSprintConfig({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    opponentReply: { enabled: true, seconds: 30 }
  });

  assert.equal(disabled.ratingKey, enabled.ratingKey);
  assert.throws(() => buildSprintConfig({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    opponentReply: { enabled: true, seconds: 0 }
  }), /between 1 and 30 seconds/);
  assert.throws(() => buildSprintConfig({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    opponentReply: { enabled: true, seconds: 31 }
  }), /between 1 and 30 seconds/);
  assert.throws(() => buildSprintConfig({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    opponentReply: { enabled: true, seconds: 1.5 }
  }), /whole number/);
  assert.throws(() => buildSprintConfig({
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    opponentReply: { enabled: false, seconds: 5 }
  }), /only for Arrow Duel/);
});

test("Arrow Duel candidate ordering is stable for one attempt and seeded by the sprint session", () => {
  const config = buildSprintConfig({
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    targetCorrect: 1,
    maxMistakes: 3
  });
  const first = startSprint({
    id: "session-a",
    config,
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });
  const repeated = startSprint({
    id: "session-a",
    config,
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });
  const second = startSprint({
    id: "session-b",
    config,
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });

  assert.equal(first.currentPuzzle?.kind, "arrow_duel");
  assert.equal(repeated.currentPuzzle?.kind, "arrow_duel");
  assert.equal(second.currentPuzzle?.kind, "arrow_duel");
  assert.deepEqual(first.currentPuzzle?.candidates, repeated.currentPuzzle?.candidates);
  assert.notDeepEqual(first.currentPuzzle?.candidates, second.currentPuzzle?.candidates);
});

test("Arrow Duel attempts store the displayed candidate order", () => {
  const state = startSprint({
    id: "session-b",
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 1,
      maxMistakes: 3,
      opponentReply: { enabled: false, seconds: 5 }
    }),
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });

  assert.equal(state.currentPuzzle?.kind, "arrow_duel");
  const result = submitSprintMove(state, state.currentPuzzle.candidates[1] as string, "2026-06-20T00:00:01.000Z");

  assert.deepEqual(result.attempt?.arrowDuelCandidateOrder, state.currentPuzzle.candidates);
});

test("a target-one correct Arrow Duel sprint completes immediately", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 1,
      maxMistakes: 3,
      opponentReply: { enabled: false, seconds: 5 }
    }),
    puzzles: [samplePuzzle("p1"), samplePuzzle("p2")],
    ratingBefore: 600,
    now: NOW
  });

  const result = submitSprintMove(state, "b2b1", "2026-06-20T00:00:05.000Z");

  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "target_reached");
  assert.equal(result.state.correctCount, 1);
});

test("exhausting the local puzzle set completes the sprint as a pass", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "arrow_duel",
      durationSeconds: 300,
      perPuzzleSeconds: 30,
      targetCorrect: 2,
      maxMistakes: 3,
      opponentReply: { enabled: false, seconds: 5 }
    }),
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 600,
    now: NOW
  });

  const result = submitSprintMove(state, "b2b1", "2026-06-20T00:00:05.000Z");

  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "puzzles_exhausted");
  assert.equal(result.state.correctCount, 1);
  assert.equal(result.state.ratingAfter, 775);
  assert.equal(result.attempt?.result, "correct");
});

test("expired sprint fails before accepting another move", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 1,
      perPuzzleSeconds: 1,
      targetCorrect: 1
    }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 900,
    now: NOW
  });

  const result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:02.000Z");
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.endReason, "time_expired");
  assert.equal(result.attempt?.result, "incomplete");
  assert.equal(result.attempt?.submittedMove, undefined);
  assert.equal(result.feedback, undefined);
});

test("paused sprint ignores moves and resumes with the remaining time preserved", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 60, perPuzzleSeconds: 20, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 900,
    now: NOW
  });

  const paused = pauseSprint(state, "2026-06-20T00:00:10.000Z").state;
  assert.equal(paused.status, "paused");
  assert.equal(paused.pausedAt, "2026-06-20T00:00:10.000Z");

  const ignored = submitSprintMove(paused, "e6e7", "2026-06-20T00:00:20.000Z");
  assert.equal(ignored.state.status, "paused");
  assert.equal(ignored.feedback, undefined);
  assert.equal(ignored.attempt, undefined);

  const resumed = resumeSprint(paused, "2026-06-20T00:00:40.000Z");
  assert.equal(resumed.status, "active");
  assert.equal(resumed.pausedAt, undefined);
  assert.equal(resumed.totalPausedMs, 30000);
  assert.equal(resumed.deadlineAt, "2026-06-20T00:01:30.000Z");

  const accepted = submitSprintMove(resumed, "e6e7", "2026-06-20T00:01:05.000Z");
  assert.equal(accepted.state.status, "active");
  assert.equal(accepted.feedback?.result, "correct");
});

test("disabled puzzle timing does not reject correct moves before the sprint deadline", () => {
  const state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 10,
      puzzleTiming: {
        slowAfterSeconds: null,
        timeoutAfterSeconds: null
      },
      targetCorrect: 1,
      maxMistakes: 2
    }),
    puzzles: [samplePuzzle("p1")],
    ratingBefore: 900,
    now: NOW
  });

  let result = submitSprintMove(state, "e6e7", "2026-06-20T00:00:10.000Z");
  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.feedback?.submittedMove, "e6e7");
  assert.equal(result.feedback?.puzzleSolved, false);
  assert.equal(result.attempt, undefined);
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 0);

  result = submitSprintMove(result.state, "b3c1", "2026-06-20T00:00:20.000Z");
  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.state.status, "active");
  assert.equal(result.state.mistakeCount, 0);

  result = submitSprintMove(result.state, "h6c1", "2026-06-20T00:00:30.000Z");
  assert.equal(result.feedback?.result, "correct");
  assert.equal(result.feedback?.submittedMove, "h6c1");
  assert.equal(result.state.status, "won");
  assert.equal(result.state.endReason, "target_reached");
  assert.equal(result.state.correctCount, 1);
});

test("abandonSprint and serializeSprintView expose stable frontend-independent state", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 1 }),
    puzzles: [samplePuzzle("00008")],
    ratingBefore: 800,
    now: NOW
  });

  const view = serializeSprintView(state) as {
    status: string;
    ratingBefore: number;
    bestStreak: number;
    hasUserSubmittedMove: boolean;
    currentPuzzle: { puzzleId: string; playedMoves: string[] };
  };
  assert.equal(view.status, "active");
  assert.equal(view.ratingBefore, 800);
  assert.equal(view.bestStreak, 0);
  assert.equal(view.hasUserSubmittedMove, false);
  assert.equal(view.currentPuzzle.puzzleId, "00008");
  assert.deepEqual(view.currentPuzzle.playedMoves, ["f2g3"]);

  const abandoned = abandonSprint(state, "2026-06-20T00:00:05.000Z");
  assert.equal(abandoned.status, "abandoned");
  assert.equal(abandoned.endReason, "abandoned");
  assert.equal(abandoned.ratingAfter, undefined);
  assert.equal(abandoned.currentPuzzle, undefined);
});

test("abandonSprint rates a failed run after the first correct move in an unfinished puzzle", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 2 }),
    puzzles: [samplePuzzle("00008"), samplePuzzle("00009")],
    ratingBefore: 800,
    now: NOW
  });

  const firstMove = submitSprintMove(state, "e6e7", "2026-06-20T00:00:05.000Z");
  assert.equal(firstMove.feedback?.result, "correct");
  assert.equal(firstMove.feedback?.puzzleSolved, false);
  assert.equal(firstMove.attempt, undefined);
  assert.equal(firstMove.state.correctCount, 0);
  assert.equal(firstMove.state.hasUserSubmittedMove, true);

  const abandoned = abandonSprint(firstMove.state, "2026-06-20T00:00:06.000Z");
  assert.equal(abandoned.status, "failed");
  assert.equal(abandoned.endReason, "abandoned");
  assert.ok(abandoned.ratingAfter !== undefined);
  assert.ok(abandoned.ratingAfter < abandoned.ratingBefore);
});

test("abandonSprint rates a failed run after the first wrong move", () => {
  const state = startSprint({
    config: buildSprintConfig({ mode: "standard", durationSeconds: 300, perPuzzleSeconds: 20, targetCorrect: 2 }),
    puzzles: [samplePuzzle("00008"), samplePuzzle("00009")],
    ratingBefore: 800,
    now: NOW
  });

  const firstMove = submitSprintMove(state, "e6d6", "2026-06-20T00:00:05.000Z");
  assert.equal(firstMove.feedback?.result, "wrong");
  assert.equal(firstMove.state.mistakeCount, 1);
  assert.equal(firstMove.state.hasUserSubmittedMove, true);

  const abandoned = abandonSprint(firstMove.state, "2026-06-20T00:00:06.000Z");
  assert.equal(abandoned.status, "failed");
  assert.equal(abandoned.endReason, "abandoned");
  assert.ok(abandoned.ratingAfter !== undefined);
  assert.ok(abandoned.ratingAfter < abandoned.ratingBefore);
});

test("Tactical Focus stops at the fixed attempt ceiling without changing Rating", () => {
  let state = startSprint({
    config: buildSprintConfig({
      mode: "standard",
      durationSeconds: 300,
      perPuzzleSeconds: 20,
      targetCorrect: 4,
      maxMistakes: 4,
      maxAttempts: 3,
      ratingPolicy: "unrated",
      tacticalFocus: {
        taskFamily: "line",
        themes: ["fork"],
        mixedControlCount: 1,
        ratingAnchor: 900,
        minRating: 800,
        maxRating: 1000
      }
    }),
    puzzles: [oneMovePuzzle("p1"), oneMovePuzzle("p2"), oneMovePuzzle("p3")],
    ratingBefore: 900,
    now: NOW
  });

  state = submitSprintMove(state, "e6e7", "2026-06-20T00:00:01.000Z").state;
  state = submitSprintMove(state, "e6d6", "2026-06-20T00:00:02.000Z").state;
  state = submitSprintMove(state, "e6e7", "2026-06-20T00:00:03.000Z").state;

  assert.equal(state.status, "won");
  assert.equal(state.endReason, "attempt_limit");
  assert.equal(state.correctCount + state.mistakeCount, 3);
  assert.equal(state.ratingAfter, undefined);
});

function samplePuzzle(id: string): Puzzle {
  return {
    id,
    initialFen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
    solutionMoves: ["f2g3", "e6e7", "b2b1", "b3c1", "b1c1", "h6c1"],
    rating: 1798,
    themes: ["crushing", "hangingPiece", "long", "middlegame"],
    source: "lichess",
    stockfishBestMove: "b2b1"
  };
}

function stalemateAlternatePuzzle(): Puzzle {
  return {
    id: "stalemate-alternate",
    initialFen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
    solutionMoves: ["g6f7"],
    rating: 600,
    themes: ["mateIn1", "stalemate"],
    source: "synthetic",
    stockfishBestMove: "g6g7"
  };
}

function oneMovePuzzle(id: string): Puzzle {
  return {
    ...samplePuzzle(id),
    solutionMoves: ["f2g3", "e6e7"]
  };
}
