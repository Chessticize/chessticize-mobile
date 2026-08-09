import {
  addReviewDays,
  createCustomPracticeRun,
  defaultPracticeRuns,
  defaultSprintConfig,
  reviewQueueForecast,
  startSprint,
  type AttemptEvent,
  type Puzzle,
  type RatingRecord,
  type ReviewQueueState,
  type SprintMode,
  type SprintState
} from "../../../../packages/core/src/index.ts";
import type { PracticeService } from "../../../../packages/storage/src/practice-service.ts";
import type {
  ExportedSprintSession,
  LocalDataImport
} from "../../../../packages/storage/src/practice-store.ts";

const marketingStory = require(
  "../../../../config/app-store-marketing-story-v1.json"
) as AppStoreMarketingStory;
const bundledPuzzles = require(
  "../../../../fixtures/puzzles/bundled-core-pack.json"
) as Puzzle[];

type ActiveSnapshotContract = {
  correct: number;
  feedbackState: "neutral";
  maxMistakes: number;
  mistakes: number;
  puzzleElapsedSeconds: number;
  rating: number;
  runId: string;
  sprintRemainingSeconds: number;
  targetCorrect: number;
  candidateCount?: number;
};

type RecentAttemptContract = AttemptEvent & {
  runId: string;
  runName: string;
};

type AppStoreMarketingStory = {
  captureClock: {
    instant: string;
    timeZone: string;
  };
  contractStatus: "approved";
  fictionalUser: {
    activeSnapshots: {
      arrowDuel: ActiveSnapshotContract;
      standard: ActiveSnapshotContract;
    };
    customRun: {
      durationSeconds: number;
      id: string;
      maxMistakes: number;
      mode: "custom";
      modeLabel: string;
      name: string;
      perPuzzleSeconds: number;
      startingRating: number;
      targetCorrect: number;
      themeLabels: string[];
      themes: string[];
    };
    practiceActivity: {
      completedRunsLastEightWeeks: number;
      correctPreviousWeek: number;
      correctThisWeek: number;
    };
    ratingHistory: {
      latestRating: number;
      points: Array<{
        completedAt: string;
        rating: number;
      }>;
      ratingKey: string;
      recentAttempts: RecentAttemptContract[];
      runId: string;
      runLabel: string;
    };
    ratings: {
      arrowDuel: number;
      standard: number;
    };
    reviewQueue: {
      completedToday: number;
      nextSevenDays: number;
      overdue: number;
      remainingModes: {
        arrowDuel: number;
        standard: number;
      };
      remainingToday: number;
      scheduledToday: number;
      tomorrow: number;
      totalScheduled: number;
    };
  };
  frames: Array<{
    id: string;
    order: number;
  }>;
  locale: string;
  schemaVersion: 1;
  storyId: string;
};

export type AppStoreMarketingCaptureFixture = {
  captureInstantMs: number;
  frameId: string;
  initialActiveState?: SprintState;
  themeCatalogPresentation?: {
    groups: ReadonlyArray<{
      label: string;
      themes: readonly string[];
    }>;
  };
};

const STANDARD_RUN_SNAPSHOT = {
  id: "standard",
  kind: "standard" as const,
  name: "Standard"
};
const ARROW_DUEL_RUN_SNAPSHOT = {
  id: "arrow-duel",
  kind: "arrow_duel" as const,
  name: "Arrow Duel"
};

export function appStoreMarketingCaptureFrameIds(): string[] {
  assertStoryContract();
  return marketingStory.frames
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((frame) => frame.id);
}

export function loadAppStoreMarketingCaptureFixture(
  frameId: string,
  practiceService: PracticeService
): AppStoreMarketingCaptureFixture {
  assertStoryContract();
  if (!appStoreMarketingCaptureFrameIds().includes(frameId)) {
    throw new Error(`Unknown App Store marketing capture frame "${frameId}"`);
  }

  practiceService.loadFixturePuzzles(bundledPuzzles);
  practiceService.importLocalData(marketingLocalData({
    includeSavedCustomRun: frameId !== "focus-your-practice"
  }));
  practiceService.saveSettings({
    arrowDuel: {
      opponentReplyEnabled: true
    },
    sync: {
      iCloudEnabled: false
    },
    notifications: {
      reviewReminder: {
        mode: "off"
      }
    },
    moveFeedback: {
      soundEnabled: false,
      hapticsEnabled: false
    },
    sprintGuides: {
      rulesSeen: true,
      activeSessionSeen: true,
      arrowDuelSeen: true,
      focusedRunSeen: true
    }
  });

  const activeSnapshot = frameId === "build-tactical-intuition"
    ? marketingStory.fictionalUser.activeSnapshots.standard
    : frameId === "choose-the-best-move"
      ? marketingStory.fictionalUser.activeSnapshots.arrowDuel
      : undefined;

  return {
    captureInstantMs: Date.parse(marketingStory.captureClock.instant),
    frameId,
    ...(frameId === "focus-your-practice"
      ? {
          themeCatalogPresentation: {
            groups: [{
              label: "Piece tactics",
              themes: ["fork", "pin", "skewer", "discoveredAttack"]
            }]
          }
        }
      : {}),
    ...(activeSnapshot === undefined
      ? {}
      : {
          initialActiveState: buildActiveSnapshot(
            frameId === "choose-the-best-move" ? "arrow_duel" : "standard",
            activeSnapshot
          )
        })
  };
}

export function appStoreMarketingCaptureStory(): Readonly<AppStoreMarketingStory> {
  assertStoryContract();
  return marketingStory;
}

function marketingLocalData({
  includeSavedCustomRun
}: {
  includeSavedCustomRun: boolean;
}): LocalDataImport {
  const standardSessions = standardRatingSessions();
  const arrowDuelSessions = arrowDuelActivitySessions(
    marketingStory.fictionalUser.practiceActivity.completedRunsLastEightWeeks
      - standardSessions.length
  );
  const sessions = [...standardSessions, ...arrowDuelSessions];
  assertPracticeActivity(sessions);
  const recentAttempts = marketingStory.fictionalUser.ratingHistory.recentAttempts
    .map(({ runId: _runId, runName: _runName, ...attempt }) => ({ ...attempt }));
  const completedReviews = completedReviewAttempts();

  return {
    schemaVersion: 1,
    settings: {
      arrowDuel: {
        opponentReplyEnabled: true
      },
      sync: {
        iCloudEnabled: false
      },
      notifications: {
        reviewReminder: {
          mode: "off"
        }
      },
      moveFeedback: {
        soundEnabled: false,
        hapticsEnabled: false
      },
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true,
        focusedRunSeen: true
      }
    },
    ratings: ratingRecords(
      standardSessions.length,
      arrowDuelSessions.length,
      includeSavedCustomRun
    ),
    attempts: [...recentAttempts, ...completedReviews],
    reviewQueue: reviewQueue(),
    reviewRemovals: [],
    sprintSessions: sessions,
    practiceRuns: marketingPracticeRuns(includeSavedCustomRun)
  };
}

function ratingRecords(
  standardGames: number,
  arrowDuelGames: number,
  includeSavedCustomRun: boolean
): RatingRecord[] {
  const ratings: RatingRecord[] = [
    {
      key: marketingStory.fictionalUser.ratingHistory.ratingKey,
      generation: 0,
      rating: marketingStory.fictionalUser.ratings.standard,
      ratingDeviation: 90,
      volatility: 0.06,
      games: standardGames
    },
    {
      key: defaultSprintConfig("arrow_duel").ratingKey,
      generation: 0,
      rating: marketingStory.fictionalUser.ratings.arrowDuel,
      ratingDeviation: 105,
      volatility: 0.06,
      games: arrowDuelGames
    }
  ];
  if (includeSavedCustomRun) {
    ratings.push({
      key: `run:${marketingStory.fictionalUser.customRun.id}`,
      generation: 0,
      rating: marketingStory.fictionalUser.customRun.startingRating,
      ratingDeviation: 350,
      volatility: 0.06,
      games: 0
    });
  }
  return ratings;
}

function marketingPracticeRuns(includeSavedCustomRun: boolean) {
  const builtIns = defaultPracticeRuns();
  if (!includeSavedCustomRun) {
    return builtIns;
  }
  const contract = marketingStory.fictionalUser.customRun;
  return [
    ...builtIns,
    createCustomPracticeRun({
      id: contract.id,
      name: contract.name,
      mode: contract.mode,
      durationSeconds: contract.durationSeconds,
      perPuzzleSeconds: contract.perPuzzleSeconds,
      targetCorrect: contract.targetCorrect,
      maxMistakes: contract.maxMistakes,
      themes: contract.themes,
      homeOrder: builtIns.length,
      updatedAt: marketingStory.captureClock.instant,
      existingRuns: builtIns
    })
  ];
}

function standardRatingSessions(): ExportedSprintSession[] {
  const points = marketingStory.fictionalUser.ratingHistory.points;
  const sessionNumbers = [1, 4, 8, 12, 17, 18];
  if (points.length !== sessionNumbers.length) {
    throw new Error("Marketing Rating history must define six Standard checkpoints");
  }
  let ratingBefore = 875;
  return points.map((point, index) => {
    const ratingAfter = point.rating;
    const id = `marketing-standard-run-${String(sessionNumbers[index]).padStart(2, "0")}`;
    const session: ExportedSprintSession = {
      id,
      mode: "standard",
      ratingKey: marketingStory.fictionalUser.ratingHistory.ratingKey,
      ratingGeneration: 0,
      startedAt: shiftIso(point.completedAt, -5 * 60 * 1000),
      completedAt: point.completedAt,
      status: "won",
      correctCount: index >= 4 ? 9 : 7 + (index % 3),
      mistakeCount: index % 2,
      ratingBefore,
      ratingAfter,
      run: STANDARD_RUN_SNAPSHOT,
      config: defaultSprintConfig("standard")
    };
    ratingBefore = ratingAfter;
    return session;
  });
}

function arrowDuelActivitySessions(count: number): ExportedSprintSession[] {
  const schedule = [
    ["2026-06-03T18:00:00.000Z", 7],
    ["2026-06-20T18:00:00.000Z", 7],
    ["2026-07-10T18:00:00.000Z", 7],
    ["2026-07-15T18:00:00.000Z", 8],
    ["2026-07-16T18:00:00.000Z", 8],
    ["2026-07-18T18:00:00.000Z", 8],
    ["2026-07-19T18:00:00.000Z", 8],
    ["2026-07-20T18:00:00.000Z", 9],
    ["2026-07-22T18:00:00.000Z", 8],
    ["2026-07-24T18:00:00.000Z", 8],
    ["2026-07-25T18:00:00.000Z", 9],
    ["2026-07-27T18:00:00.000Z", 9]
  ] as const;
  if (count !== schedule.length) {
    throw new Error("Marketing activity contract requires twelve Arrow Duel Runs");
  }
  let ratingBefore = 800;
  return schedule.map(([completedAt, correctCount], index) => {
    const isLast = index === count - 1;
    const ratingAfter = isLast
      ? marketingStory.fictionalUser.ratings.arrowDuel
      : 800 + Math.round(((index + 1) * 75) / Math.max(1, count));
    const session: ExportedSprintSession = {
      id: `marketing-arrow-duel-run-${String(index + 1).padStart(2, "0")}`,
      mode: "arrow_duel",
      ratingKey: defaultSprintConfig("arrow_duel").ratingKey,
      ratingGeneration: 0,
      startedAt: shiftIso(completedAt, -5 * 60 * 1000),
      completedAt,
      status: "won",
      correctCount,
      mistakeCount: index % 3 === 0 ? 1 : 0,
      ratingBefore,
      ratingAfter,
      run: ARROW_DUEL_RUN_SNAPSHOT,
      config: defaultSprintConfig("arrow_duel")
    };
    ratingBefore = ratingAfter;
    return session;
  });
}

function assertPracticeActivity(sessions: ExportedSprintSession[]): void {
  const activity = marketingStory.fictionalUser.practiceActivity;
  const nowMs = Date.parse(marketingStory.captureClock.instant);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const correctBetween = (startMs: number, endMs: number) => sessions
    .filter((session) => {
      const completedAtMs = Date.parse(session.completedAt ?? "");
      return completedAtMs >= startMs && completedAtMs < endMs;
    })
    .reduce((total, session) => total + session.correctCount, 0);
  if (
    sessions.length !== activity.completedRunsLastEightWeeks
    || correctBetween(nowMs - weekMs, nowMs + 1) !== activity.correctThisWeek
    || correctBetween(nowMs - 2 * weekMs, nowMs - weekMs) !== activity.correctPreviousWeek
  ) {
    throw new Error("Marketing practice activity does not match the approved totals");
  }
}

function completedReviewAttempts(): AttemptEvent[] {
  const contracts = marketingStory.fictionalUser.reviewQueue;
  const puzzleIds = activeSnapshotPuzzles("arrow_duel", contracts.completedToday)
    .map((puzzle) => puzzle.id);
  return puzzleIds.map((puzzleId, index) => {
    const puzzle = puzzleById(puzzleId);
    const completedAt = new Date(
      Date.parse(marketingStory.captureClock.instant) - (index + 1) * 12 * 60 * 1000
    ).toISOString();
    const expectedMove = puzzle.solutionMoves[1] ?? puzzle.solutionMoves[0]!;
    return {
      id: `marketing-completed-review-${index + 1}`,
      source: "scheduled_review",
      sessionId: `marketing-review-session-${index + 1}`,
      puzzleId,
      mode: "arrow_duel",
      ratingKey: defaultSprintConfig("arrow_duel").ratingKey,
      result: "correct",
      submittedMove: expectedMove,
      expectedMove,
      startedAt: shiftIso(completedAt, -10_000),
      completedAt,
      elapsedMs: 10_000,
      ratingBefore: marketingStory.fictionalUser.ratings.arrowDuel
    };
  });
}

function reviewQueue(): ReviewQueueState[] {
  const contract = marketingStory.fictionalUser.reviewQueue;
  const puzzleIds = fixturePuzzleIds(contract.totalScheduled, 80);
  const today = "2026-07-28";
  const dueDays = [
    ...Array.from({ length: contract.remainingToday }, () => today),
    ...Array.from({ length: contract.tomorrow }, () => "2026-07-29"),
    ...Array.from(
      { length: contract.nextSevenDays - contract.tomorrow },
      (_, index) => addReviewDays(today, index + 2)
    )
  ];
  if (dueDays.length !== contract.totalScheduled) {
    throw new Error("Marketing Review workload does not add up to its total");
  }
  const queue = dueDays.map((dueDay, index): ReviewQueueState => {
    const isRemainingArrowDuel =
      index >= contract.remainingModes.standard
      && index < contract.remainingToday;
    return {
      puzzleId: puzzleIds[index]!,
      mode: isRemainingArrowDuel ? "arrow_duel" : "standard",
      ratingKey: isRemainingArrowDuel
        ? defaultSprintConfig("arrow_duel").ratingKey
        : marketingStory.fictionalUser.ratingHistory.ratingKey,
      dueDay,
      intervalDays: 1 + (index % 7),
      reviewCount: index % 3,
      successStreak: index % 2,
      lapseCount: 0,
      lastResult: index === 0 ? "wrong" : "correct",
      lastReviewedAt: "2026-07-20T18:00:00.000Z",
      enrolledAt: "2026-07-10T18:00:00.000Z"
    };
  });
  const forecast = reviewQueueForecast(
    queue,
    marketingStory.captureClock.instant,
    marketingStory.captureClock.timeZone
  );
  if (
    forecast.todayCount !== contract.remainingToday
    || forecast.tomorrowCount !== contract.tomorrow
    || forecast.nextSevenDaysCount !== contract.nextSevenDays
    || forecast.totalCount !== contract.totalScheduled
    || forecast.overdueCount !== contract.overdue
  ) {
    throw new Error("Marketing Review fixture does not match its approved forecast");
  }
  return queue;
}

function buildActiveSnapshot(
  mode: Extract<SprintMode, "arrow_duel" | "standard">,
  contract: ActiveSnapshotContract
): SprintState {
  const nowMs = Date.parse(marketingStory.captureClock.instant);
  const puzzles = activeSnapshotPuzzles(mode, contract.targetCorrect + contract.maxMistakes);
  const config = {
    ...defaultSprintConfig(mode),
    targetCorrect: contract.targetCorrect,
    maxMistakes: contract.maxMistakes
  };
  const startedAtMs =
    nowMs - (config.durationSeconds - contract.sprintRemainingSeconds) * 1000;
  const currentPuzzleStartedAtMs = nowMs - contract.puzzleElapsedSeconds * 1000;
  const started = startSprint({
    id: `marketing-${mode}-snapshot`,
    config,
    puzzles,
    ratingBefore: contract.rating,
    now: new Date(startedAtMs).toISOString()
  });
  const currentPuzzle = started.currentPuzzle;
  if (!currentPuzzle) {
    throw new Error(`Marketing ${mode} snapshot has no active puzzle`);
  }
  if (
    mode === "arrow_duel"
    && (
      currentPuzzle.kind !== "arrow_duel"
      || currentPuzzle.candidates.length !== contract.candidateCount
    )
  ) {
    throw new Error("Marketing Arrow Duel snapshot must expose two neutral candidates");
  }

  return {
    ...started,
    correctCount: contract.correct,
    mistakeCount: contract.mistakes,
    currentStreak: contract.correct,
    bestStreak: contract.correct,
    hasUserSubmittedMove: contract.correct > 0,
    currentPuzzleIndex: contract.correct + contract.mistakes,
    deadlineAt: new Date(nowMs + contract.sprintRemainingSeconds * 1000).toISOString(),
    currentPuzzleStartedAt: new Date(currentPuzzleStartedAtMs).toISOString(),
    currentPuzzleDeadlineAt: new Date(
      currentPuzzleStartedAtMs + config.perPuzzleSeconds * 1000
    ).toISOString(),
    run: mode === "arrow_duel" ? ARROW_DUEL_RUN_SNAPSHOT : STANDARD_RUN_SNAPSHOT
  };
}

function activeSnapshotPuzzles(
  mode: Extract<SprintMode, "arrow_duel" | "standard">,
  count: number
): Puzzle[] {
  const targetRating = mode === "arrow_duel"
    ? marketingStory.fictionalUser.ratings.arrowDuel
    : marketingStory.fictionalUser.ratings.standard;
  const eligible = bundledPuzzles
    .filter((puzzle) =>
      mode === "standard"
        ? puzzle.solutionMoves.length >= 2
        : isArrowDuelEligible(puzzle)
    )
    .sort((left, right) =>
      Math.abs(left.rating - targetRating) - Math.abs(right.rating - targetRating)
      || left.id.localeCompare(right.id)
    );
  if (eligible.length < count) {
    throw new Error(`Marketing ${mode} snapshot has too few bundled puzzles`);
  }
  return eligible.slice(0, count);
}

function isArrowDuelEligible(puzzle: Puzzle): boolean {
  const wrongMove = puzzle.solutionMoves[0]?.trim().toLowerCase();
  const bestMove = puzzle.stockfishBestMove?.trim().toLowerCase();
  return (
    typeof wrongMove === "string"
    && wrongMove.length >= 4
    && typeof bestMove === "string"
    && bestMove.length >= 4
    && wrongMove !== bestMove
  );
}

function fixturePuzzleIds(count: number, offset: number): string[] {
  const ids = bundledPuzzles
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(offset, offset + count)
    .map((puzzle) => puzzle.id);
  if (ids.length !== count) {
    throw new Error(`Marketing fixture requires ${count} bundled puzzle IDs`);
  }
  return ids;
}

function puzzleById(puzzleId: string): Puzzle {
  const puzzle = bundledPuzzles.find((candidate) => candidate.id === puzzleId);
  if (!puzzle) {
    throw new Error(`Marketing fixture puzzle ${puzzleId} is unavailable`);
  }
  return puzzle;
}

function shiftIso(value: string, deltaMs: number): string {
  return new Date(Date.parse(value) + deltaMs).toISOString();
}

function assertStoryContract(): void {
  if (
    marketingStory.schemaVersion !== 1
    || marketingStory.contractStatus !== "approved"
    || marketingStory.frames.length !== 6
    || !Number.isFinite(Date.parse(marketingStory.captureClock.instant))
  ) {
    throw new Error("App Store marketing capture requires the approved v1 story contract");
  }
}
