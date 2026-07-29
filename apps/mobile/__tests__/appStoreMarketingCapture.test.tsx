import {
  appStoreMarketingCaptureFrameIds,
  appStoreMarketingCaptureStory,
  loadAppStoreMarketingCaptureFixture
} from "../src/testing/appStoreMarketingCapture.ts";
import { createMobilePracticeService } from "../src/platform/mobilePractice.ts";

function loadFixture(frameId: string) {
  const practiceService = createMobilePracticeService();
  return {
    fixture: loadAppStoreMarketingCaptureFixture(frameId, practiceService),
    practiceService
  };
}

describe("App Store marketing capture fixture", () => {
  it("accepts only the approved six-frame story", () => {
    expect(appStoreMarketingCaptureFrameIds()).toEqual([
      "build-tactical-intuition",
      "choose-the-best-move",
      "focus-your-practice",
      "make-every-mistake-count",
      "see-your-progress",
      "private-offline-open-source"
    ]);
    expect(() => loadFixture("unknown-frame"))
      .toThrow('Unknown App Store marketing capture frame "unknown-frame"');
  });

  it("loads one deterministic fictional user without weakness recommendations", () => {
    const story = appStoreMarketingCaptureStory();
    const first = loadFixture("make-every-mistake-count");
    const second = loadFixture("see-your-progress");
    const firstExport = first.practiceService.exportLocalData();
    const secondExport = second.practiceService.exportLocalData();

    expect(firstExport).toEqual(secondExport);
    expect(firstExport.sprintSessions).toHaveLength(
      story.fictionalUser.practiceActivity.completedRunsLastEightWeeks
    );
    expect(first.practiceService.getTacticalProfileSnapshot(story.captureClock.instant))
      .toMatchObject({
        buildState: { recommendedSignalIds: [] },
        evaluation: { rankedFocuses: [], signals: [] }
      });
    expect(first.practiceService.getTacticalProfileProgress(story.captureClock.instant))
      .toMatchObject({
        evaluation: { rankedFocuses: [], signals: [] }
      });
    expect(first.practiceService.getSettings()).toMatchObject({
      sync: { iCloudEnabled: false },
      notifications: { reviewReminder: { mode: "off" } },
      sprintGuides: {
        rulesSeen: true,
        activeSessionSeen: true,
        arrowDuelSeen: true,
        focusedRunSeen: true
      }
    });
    expect(firstExport.practiceRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: story.fictionalUser.customRun.id,
        name: story.fictionalUser.customRun.name,
        mode: story.fictionalUser.customRun.mode,
        themes: story.fictionalUser.customRun.themes,
        durationSeconds: story.fictionalUser.customRun.durationSeconds,
        perPuzzleSeconds: story.fictionalUser.customRun.perPuzzleSeconds,
        targetCorrect: story.fictionalUser.customRun.targetCorrect,
        maxMistakes: story.fictionalUser.customRun.maxMistakes
      })
    ]));
    expect(firstExport.ratings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: `run:${story.fictionalUser.customRun.id}`,
        rating: story.fictionalUser.customRun.startingRating
      })
    ]));
  });

  it("keeps the New Run capture editable while later frames retain the saved Custom Run", () => {
    const story = appStoreMarketingCaptureStory();
    const editor = loadFixture("focus-your-practice");
    const laterFrame = loadFixture("make-every-mistake-count");

    expect(editor.fixture.themeCatalogPresentation).toEqual({
      groups: [{
        label: "Piece tactics",
        themes: ["fork", "pin", "skewer", "discoveredAttack"]
      }]
    });
    expect(editor.practiceService.listPracticeRuns())
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: story.fictionalUser.customRun.id })
      ]));
    expect(laterFrame.practiceService.listPracticeRuns())
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: story.fictionalUser.customRun.id })
      ]));
  });

  it("reproduces the approved Run and weekly correctness totals", () => {
    const story = appStoreMarketingCaptureStory();
    const { practiceService } = loadFixture("see-your-progress");
    const sessions = practiceService.exportLocalData().sprintSessions;
    const nowMs = Date.parse(story.captureClock.instant);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const correctBetween = (startMs: number, endMs: number) => sessions
      .filter((session) => {
        const completedAtMs = Date.parse(session.completedAt ?? "");
        return completedAtMs >= startMs && completedAtMs < endMs;
      })
      .reduce((total, session) => total + session.correctCount, 0);

    expect(sessions).toHaveLength(
      story.fictionalUser.practiceActivity.completedRunsLastEightWeeks
    );
    expect(correctBetween(nowMs - weekMs, nowMs + 1))
      .toBe(story.fictionalUser.practiceActivity.correctThisWeek);
    expect(correctBetween(nowMs - 2 * weekMs, nowMs - weekMs))
      .toBe(story.fictionalUser.practiceActivity.correctPreviousWeek);
  });

  it("keeps active Standard and Arrow Duel snapshots out of persisted progress", () => {
    const story = appStoreMarketingCaptureStory();
    const standard = loadFixture("build-tactical-intuition");
    const duel = loadFixture("choose-the-best-move");
    const standardContract = story.fictionalUser.activeSnapshots.standard;
    const duelContract = story.fictionalUser.activeSnapshots.arrowDuel;

    expect(standard.practiceService.getActiveSprint()).toBeUndefined();
    expect(duel.practiceService.getActiveSprint()).toBeUndefined();
    expect(standard.fixture.initialActiveState).toMatchObject({
      status: "active",
      correctCount: standardContract.correct,
      mistakeCount: standardContract.mistakes,
      ratingBefore: standardContract.rating,
      config: {
        targetCorrect: standardContract.targetCorrect,
        maxMistakes: standardContract.maxMistakes
      }
    });
    expect(
      Date.parse(standard.fixture.initialActiveState!.deadlineAt)
      - standard.fixture.captureInstantMs
    ).toBe(standardContract.sprintRemainingSeconds * 1000);
    expect(
      standard.fixture.captureInstantMs
      - Date.parse(standard.fixture.initialActiveState!.currentPuzzleStartedAt!)
    ).toBe(standardContract.puzzleElapsedSeconds * 1000);

    expect(duel.fixture.initialActiveState).toMatchObject({
      status: "active",
      correctCount: duelContract.correct,
      mistakeCount: duelContract.mistakes,
      ratingBefore: duelContract.rating,
      currentPuzzle: {
        kind: "arrow_duel",
        solved: false
      }
    });
    expect(duel.fixture.initialActiveState?.currentPuzzle?.kind).toBe("arrow_duel");
    if (duel.fixture.initialActiveState?.currentPuzzle?.kind === "arrow_duel") {
      expect(duel.fixture.initialActiveState.currentPuzzle.candidates).toHaveLength(
        duelContract.candidateCount!
      );
      expect(duel.fixture.initialActiveState.currentPuzzle.selectedMove).toBeUndefined();
    }
    expect(standard.practiceService.exportLocalData())
      .toEqual(duel.practiceService.exportLocalData());
  });

  it("reproduces the approved Review workload", () => {
    const story = appStoreMarketingCaptureStory();
    const { practiceService: service } = loadFixture("make-every-mistake-count");
    const review = story.fictionalUser.reviewQueue;

    expect(service.listCompletedReviewsForDay(story.captureClock.instant))
      .toHaveLength(review.completedToday);
    expect(service.getDueReviewItems(story.captureClock.instant))
      .toHaveLength(review.remainingToday);
    expect(service.listReviewQueue()).toHaveLength(review.totalScheduled);
    expect(
      service.getDueReviewItems(story.captureClock.instant)
        .filter((item) => item.review.mode === "standard")
    ).toHaveLength(review.remainingModes.standard);
    expect(
      service.getDueReviewItems(story.captureClock.instant)
        .filter((item) => item.review.mode === "arrow_duel")
    ).toHaveLength(review.remainingModes.arrowDuel);
  });

  it("reproduces the approved Rating Trend and exact recent Standard attempts", () => {
    const story = appStoreMarketingCaptureStory();
    const { practiceService } = loadFixture("see-your-progress");
    const contract = story.fictionalUser.ratingHistory;
    const history = practiceService.getHistoryView({
      now: story.captureClock.instant,
      ratingKey: contract.ratingKey,
      timeRange: "90d"
    });

    expect(history.performance.charts.rating.map((point) => ({
      completedAt: point.completedAt,
      rating: point.value
    }))).toEqual(contract.points);
    expect(history.attempts.map((attempt) => attempt.id))
      .toEqual(contract.recentAttempts.map((attempt) => attempt.id));
    expect(history.attempts.map((attempt) => ({
      completedAt: attempt.completedAt,
      elapsedMs: attempt.elapsedMs,
      id: attempt.id,
      puzzleId: attempt.puzzleId,
      runId: attempt.runId,
      runName: attempt.runName
    }))).toEqual(contract.recentAttempts.map((attempt) => ({
      completedAt: attempt.completedAt,
      elapsedMs: attempt.elapsedMs,
      id: attempt.id,
      puzzleId: attempt.puzzleId,
      runId: attempt.runId,
      runName: attempt.runName
    })));
  });
});
