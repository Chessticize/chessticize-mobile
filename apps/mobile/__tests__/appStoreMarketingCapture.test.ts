import {
  appStoreMarketingCaptureFrameIds,
  appStoreMarketingCaptureStory,
  createAppStoreMarketingCaptureFixture
} from "../src/testing/appStoreMarketingCapture.ts";

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
    expect(() => createAppStoreMarketingCaptureFixture("unknown-frame"))
      .toThrow('Unknown App Store marketing capture frame "unknown-frame"');
  });

  it("loads one deterministic fictional user without Tactical Profile data", () => {
    const story = appStoreMarketingCaptureStory();
    const first = createAppStoreMarketingCaptureFixture("make-every-mistake-count");
    const second = createAppStoreMarketingCaptureFixture("see-your-progress");
    const firstExport = first.practiceService.exportLocalData();
    const secondExport = second.practiceService.exportLocalData();

    expect(firstExport).toEqual(secondExport);
    expect(firstExport.sprintSessions).toHaveLength(
      story.fictionalUser.practiceActivity.completedRunsLastEightWeeks
    );
    expect(first.practiceService.getTacticalProfileSnapshot(story.captureClock.instant))
      .toBeUndefined();
    expect(first.practiceService.getTacticalProfileProgress(story.captureClock.instant))
      .toBeUndefined();
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
  });

  it("keeps active Standard and Arrow Duel snapshots out of persisted progress", () => {
    const story = appStoreMarketingCaptureStory();
    const standard = createAppStoreMarketingCaptureFixture("build-tactical-intuition");
    const duel = createAppStoreMarketingCaptureFixture("choose-the-best-move");
    const standardContract = story.fictionalUser.activeSnapshots.standard;
    const duelContract = story.fictionalUser.activeSnapshots.arrowDuel;

    expect(standard.practiceService.getActiveSprint()).toBeUndefined();
    expect(duel.practiceService.getActiveSprint()).toBeUndefined();
    expect(standard.initialActiveState).toMatchObject({
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
      Date.parse(standard.initialActiveState!.deadlineAt)
      - standard.captureInstantMs
    ).toBe(standardContract.sprintRemainingSeconds * 1000);
    expect(
      standard.captureInstantMs
      - Date.parse(standard.initialActiveState!.currentPuzzleStartedAt!)
    ).toBe(standardContract.puzzleElapsedSeconds * 1000);

    expect(duel.initialActiveState).toMatchObject({
      status: "active",
      correctCount: duelContract.correct,
      mistakeCount: duelContract.mistakes,
      ratingBefore: duelContract.rating,
      currentPuzzle: {
        kind: "arrow_duel",
        solved: false
      }
    });
    expect(duel.initialActiveState?.currentPuzzle?.kind).toBe("arrow_duel");
    if (duel.initialActiveState?.currentPuzzle?.kind === "arrow_duel") {
      expect(duel.initialActiveState.currentPuzzle.candidates).toHaveLength(
        duelContract.candidateCount!
      );
      expect(duel.initialActiveState.currentPuzzle.selectedMove).toBeUndefined();
    }
    expect(standard.practiceService.exportLocalData())
      .toEqual(duel.practiceService.exportLocalData());
  });

  it("reproduces the approved Review workload", () => {
    const story = appStoreMarketingCaptureStory();
    const fixture = createAppStoreMarketingCaptureFixture("make-every-mistake-count");
    const service = fixture.practiceService;
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
    const fixture = createAppStoreMarketingCaptureFixture("see-your-progress");
    const contract = story.fictionalUser.ratingHistory;
    const history = fixture.practiceService.getHistoryView({
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
