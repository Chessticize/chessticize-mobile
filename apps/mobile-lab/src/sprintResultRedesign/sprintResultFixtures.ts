import type { SprintResultPrototypeData } from "./sprintResultPresentation.ts";

// Plausible results for the Issue #609 Sprint Result redesign stories. Standard
// Sprints use the default 5-minute, 15-to-pass configuration; Arrow Duel passes
// at 10. The Focused Run pace matches the #616 design-preview fixture.

const noUnclear = { markedByYou: 0, afterSlow: 0, afterTimedOut: 0 };

export const SPRINT_RESULT_FIXTURES = {
  passed: {
    kind: "sprint",
    mode: "standard",
    outcome: "passed",
    endReason: "target_reached",
    solved: 15,
    target: 15,
    attempted: 15,
    accuracyPercent: 100,
    ratingBefore: 695,
    ratingAfter: 709,
    elapsedSeconds: 221,
    limitSeconds: 300,
    bestStreak: 15,
    mistakeCount: 0,
    review: { unclear: { ...noUnclear, afterSlow: 1 }, inReviewCount: 0, overlapCount: 0 }
  },
  failedMistakes: {
    kind: "sprint",
    mode: "standard",
    outcome: "failed",
    endReason: "max_mistakes",
    solved: 9,
    target: 15,
    attempted: 12,
    accuracyPercent: 75,
    ratingBefore: 709,
    ratingAfter: 691,
    elapsedSeconds: 177,
    limitSeconds: 300,
    bestStreak: 5,
    mistakeCount: 3,
    review: { unclear: noUnclear, inReviewCount: 3, overlapCount: 0 }
  },
  failedTime: {
    kind: "sprint",
    mode: "standard",
    outcome: "failed",
    endReason: "time_expired",
    solved: 13,
    target: 15,
    attempted: 14,
    accuracyPercent: 93,
    ratingBefore: 709,
    ratingAfter: 703,
    elapsedSeconds: 300,
    limitSeconds: 300,
    bestStreak: 9,
    mistakeCount: 1,
    review: { unclear: noUnclear, inReviewCount: 1, overlapCount: 0 },
    unclearPrompt: { question: "Was the final puzzle unclear?" }
  },
  abandoned: {
    kind: "sprint",
    mode: "standard",
    outcome: "abandoned",
    endReason: "abandoned",
    solved: 1,
    target: 15,
    attempted: 1,
    accuracyPercent: 100,
    ratingBefore: 709,
    ratingAfter: 694,
    elapsedSeconds: 48,
    limitSeconds: 300,
    bestStreak: 1,
    mistakeCount: 0,
    review: { unclear: noUnclear, inReviewCount: 0, overlapCount: 0 }
  },
  reviewAndMistakes: {
    kind: "sprint",
    mode: "standard",
    outcome: "passed",
    endReason: "target_reached",
    solved: 15,
    target: 15,
    attempted: 17,
    accuracyPercent: 88,
    ratingBefore: 709,
    ratingAfter: 718,
    elapsedSeconds: 276,
    limitSeconds: 300,
    bestStreak: 8,
    mistakeCount: 2,
    review: { unclear: { ...noUnclear, markedByYou: 1, afterSlow: 1 }, inReviewCount: 2, overlapCount: 1 }
  },
  zeroReview: {
    kind: "sprint",
    mode: "standard",
    outcome: "passed",
    endReason: "target_reached",
    solved: 15,
    target: 15,
    attempted: 15,
    accuracyPercent: 100,
    ratingBefore: 709,
    ratingAfter: 725,
    elapsedSeconds: 192,
    limitSeconds: 300,
    bestStreak: 15,
    mistakeCount: 0,
    review: { unclear: noUnclear, inReviewCount: 0, overlapCount: 0 }
  },
  arrowDuel: {
    kind: "sprint",
    mode: "arrowDuel",
    outcome: "passed",
    endReason: "target_reached",
    solved: 10,
    target: 10,
    attempted: 12,
    accuracyPercent: 83,
    ratingBefore: 812,
    ratingAfter: 823,
    elapsedSeconds: 245,
    limitSeconds: 300,
    bestStreak: 6,
    mistakeCount: 2,
    review: { unclear: noUnclear, inReviewCount: 2, overlapCount: 0 }
  },
  focusedRun: {
    kind: "focusedRun",
    mode: "standard",
    outcome: "completed",
    endReason: "attempt_limit",
    solved: 12,
    target: 15,
    attempted: 15,
    accuracyPercent: 80,
    ratingBefore: 709,
    elapsedSeconds: 432,
    bestStreak: 6,
    pace: { averageSolveSeconds: 17, usualSolveSeconds: 24 },
    mistakeCount: 3,
    review: { unclear: { ...noUnclear, afterSlow: 1 }, inReviewCount: 3, overlapCount: 0 }
  }
} as const satisfies Record<string, SprintResultPrototypeData>;

export type SprintResultFixtureName = keyof typeof SPRINT_RESULT_FIXTURES;
