import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import test from "node:test";

const storyUrl = new URL(
  "../config/app-store-marketing-story-v1.json",
  import.meta.url
);
const packManifestUrl = new URL(
  "../fixtures/puzzles/bundled-core-pack.manifest.json",
  import.meta.url
);
const bundledPackUrl = new URL(
  "../fixtures/puzzles/bundled-core-pack.json",
  import.meta.url
);
const repositoryRoot = new URL("../", import.meta.url);
const componentsRoot = "apps/mobile/src/components/";

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("1.6 capture plan covers both stores, real destinations, navigation and dark appearance", async () => {
  const story = await readJson(storyUrl);
  const plan = story.releaseCampaign;
  assert.equal(plan.publicVersion, "1.6.0");
  assert.equal(plan.issue, 683);
  assert.equal(plan.status, "capture-plan");
  assert.deepEqual(plan.platforms, ["app-store", "google-play"]);
  assert.equal(plan.legacyStoryId, story.storyId);
  assert.equal(plan.captureRequirements.realNativeUi, true);
  assert.equal(plan.captureRequirements.fictionalDataOnly, true);
  assert.equal(plan.captureRequirements.includeNativeNavigation, true);
  assert.equal(plan.captureRequirements.secondaryMarketingCopy, false);
  assert.equal(plan.captureRequirements.finalExportsRequireNewCaptureManifest, true);
  assert.deepEqual(plan.frames.map(({ order }) => order), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(plan.frames.map(({ id }) => id)).size, 6);
  const highlights = new Set(plan.frames.flatMap(({ highlights }) => highlights));
  for (const highlight of ["fresh-design", "practice-home", "native-navigation", "dark-mode", "tactical-profile", "focused-run", "survival"]) {
    assert.ok(highlights.has(highlight), `Missing release highlight ${highlight}`);
  }
  assert.ok(plan.frames.some(({ appearance }) => appearance === "dark"));
  assert.equal(plan.deviceTargets.ipad.orientation, "landscape");
  assert.equal(plan.deviceTargets.ipad.navigation, "top-bar");
  assert.equal(plan.deviceTargets.iphoneDuo.navigation, "adaptive-columns");
  assert.equal(plan.deviceTargets.androidPhone.navigation, "bottom-bar");
  assert.equal(plan.deviceTargets.androidTablet.navigation, "side-rail");

  const registry = await readFile(new URL("apps/mobile-lab/src/scenarioRegistry.ts", repositoryRoot), "utf8");
  const componentTree = await readComponentTree("apps/mobile/src/components/PracticePocScreen.tsx");
  const source = [...componentTree.values()].join("\n");
  for (const frame of plan.frames) {
    assert.ok(frame.headline.length > 0 && frame.headline.length <= story.copyLimits.headlineCharacters);
    assert.equal("supporting" in frame, false);
    assert.ok(["light", "dark"].includes(frame.appearance));
    assert.ok(registry.includes(`"${frame.storyId}"`), `Missing product-clone story ${frame.storyId}`);
    for (const id of [frame.captureAnchorTestId, ...frame.requiredVisibleTestIds, ...(frame.previewActions ?? [])]) {
      // Some public controls select their stable ID through a conditional
      // startTestID prop; the maintained component tree must still own it.
      assert.ok(source.includes(`"${id}"`), `Missing real control ${id}`);
    }
  }
});

test("App Store marketing story defines the canonical six-frame order and copy", async () => {
  const story = await readJson(storyUrl);
  const expectedFrameIds = [
    "build-tactical-intuition",
    "choose-the-best-move",
    "focus-your-practice",
    "make-every-mistake-count",
    "see-your-progress",
    "private-offline-open-source"
  ];

  assert.equal(story.schemaVersion, 1);
  assert.equal(story.issue, 410);
  assert.equal(story.contractStatus, "approved");
  assert.equal(story.locale, "en-US");
  assert.deepEqual(story.deviceTargets, {
    iphone: {
      displayGroup: "6.9-inch",
      primaryOrientation: "portrait",
      captureLayout: "native-responsive"
    },
    ipad: {
      displayGroup: "13-inch",
      primaryOrientation: "landscape",
      captureLayout: "native-responsive-landscape",
      acceptedExportSizes: [
        { width: 2752, height: 2064 },
        { width: 2732, height: 2048 }
      ]
    }
  });
  assert.deepEqual(
    story.frames.map((frame) => frame.order),
    [1, 2, 3, 4, 5, 6]
  );
  assert.deepEqual(
    story.frames.map((frame) => frame.id),
    expectedFrameIds
  );
  assert.equal(new Set(story.frames.map((frame) => frame.captureId)).size, 6);
  assert.equal(new Set(story.frames.map((frame) => frame.copyKey)).size, 6);
  assert.equal("tacticalProfile" in story.fictionalUser, false);
  assert.equal("tacticalProgress" in story.fictionalUser, false);

  for (const order of [3, 5]) {
    const frame = story.frames[order - 1];
    assert.equal(
      frame.source.component,
      "apps/mobile/src/components/PracticePocScreen.tsx"
    );
    assert.ok(frame.benefit.includes("without model inference"));
    assert.ok(
      frame.source.forbiddenStates.includes("model-recommendation")
    );
  }

  for (const frame of story.frames) {
    assert.ok(frame.headline.length > 0);
    assert.ok(frame.headline.length <= story.copyLimits.headlineCharacters);
    assert.ok(frame.supporting.length > 0);
    assert.ok(
      frame.supporting.length <= story.copyLimits.supportingCharacters
    );
    assert.ok(frame.source.requiredVisibleTestIds.length > 0);
    assert.ok(frame.source.forbiddenStates.length > 0);
  }
});

test("fictional-user values stay coherent across the six frames", async () => {
  const story = await readJson(storyUrl);
  const user = story.fictionalUser;

  assert.equal(
    user.activeSnapshots.standard.rating,
    user.ratings.standard
  );
  assert.equal(
    user.activeSnapshots.arrowDuel.rating,
    user.ratings.arrowDuel
  );
  assert.equal(
    user.customRun.startingRating,
    user.ratings.standard
  );
  assert.equal(
    user.customRun.targetCorrect,
    Math.floor(
      user.customRun.durationSeconds / user.customRun.perPuzzleSeconds
    )
  );
  assert.equal(user.customRun.themes.length, user.customRun.themeLabels.length);
  assert.equal(
    user.reviewQueue.completedToday + user.reviewQueue.remainingToday,
    user.reviewQueue.scheduledToday
  );
  assert.equal(
    user.reviewQueue.remainingModes.standard
      + user.reviewQueue.remainingModes.arrowDuel,
    user.reviewQueue.remainingToday
  );
  assert.equal(user.reviewQueue.overdue, 0);

  assert.equal(
    story.frames[0].source.stableText["session-timer"],
    formatTimer(user.activeSnapshots.standard.sprintRemainingSeconds)
  );
  assert.equal(
    story.frames[1].source.stableText["session-timer"],
    formatTimer(user.activeSnapshots.arrowDuel.sprintRemainingSeconds)
  );

  assert.equal(user.ratingHistory.latestRating, user.ratings.standard);
  assert.equal(
    user.ratingHistory.points.at(-1)?.rating,
    user.ratingHistory.latestRating
  );

  const completedAt = user.ratingHistory.points.map(
    (point) => point.completedAt
  );
  assert.deepEqual(completedAt, [...completedAt].sort());
  assert.ok(
    user.ratingHistory.points.some(
      (point, index, points) =>
        index > 0 && point.rating < points[index - 1].rating
    ),
    "Expected a believable non-monotonic Rating trend"
  );

  const recentAttempts = user.ratingHistory.recentAttempts;
  assert.equal(recentAttempts.length, 3);
  assert.equal(new Set(recentAttempts.map((attempt) => attempt.id)).size, 3);
  assert.equal(
    new Set(recentAttempts.map((attempt) => attempt.sessionId)).size,
    2
  );
  assert.deepEqual(
    recentAttempts.map((attempt) => attempt.completedAt),
    [...recentAttempts]
      .map((attempt) => attempt.completedAt)
      .sort()
      .reverse()
  );
  for (const attempt of recentAttempts) {
    assert.equal(attempt.mode, "standard");
    assert.equal(attempt.ratingKey, user.ratingHistory.ratingKey);
    assert.equal(attempt.runId, user.ratingHistory.runId);
    assert.equal(attempt.runName, user.ratingHistory.runLabel);
    assert.equal(attempt.result, "correct");
    assert.equal(attempt.submittedMove, attempt.expectedMove);
  }
});

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

test("story source identity and claim evidence match version-controlled files", async () => {
  const [story, packManifest, bundledPuzzles] = await Promise.all([
    readJson(storyUrl),
    readJson(packManifestUrl),
    readJson(bundledPackUrl)
  ]);

  assert.equal(story.sourceBuild.puzzlePack.id, packManifest.id);
  assert.equal(
    story.sourceBuild.puzzlePack.manifestHash,
    packManifest.manifestHash
  );

  const puzzlesById = new Map(
    bundledPuzzles.map((puzzle) => [puzzle.id, puzzle])
  );
  for (const attempt of story.fictionalUser.ratingHistory.recentAttempts) {
    const puzzle = puzzlesById.get(attempt.puzzleId);
    assert.ok(puzzle, `Expected bundled puzzle ${attempt.puzzleId}`);
    assert.ok(
      puzzle.solutionMoves.includes(attempt.expectedMove),
      `Expected ${attempt.expectedMove} in ${attempt.puzzleId}`
    );
  }

  for (const evidence of story.claimEvidence) {
    const contents = await readFile(new URL(evidence.source, repositoryRoot), "utf8");
    assert.ok(
      contents.trim().length > 0,
      `Expected claim evidence at ${evidence.source}`
    );
  }

  for (const frame of story.frames) {
    // The screen renders test IDs from the component modules it imports, so
    // search the component and every component module it reaches.
    const componentTree = await readComponentTree(frame.source.component);
    const treeSource = [...componentTree.values()].join("\n");
    for (const testId of frame.source.requiredVisibleTestIds) {
      const testIdSource = frame.source.requiredVisibleTestIdSources?.[testId];
      if (testIdSource) {
        assert.ok(
          componentTree.has(testIdSource),
          `Expected ${frame.source.component} to render ${testIdSource}`
        );
      }
      const visibleSource = testIdSource
        ? componentTree.get(testIdSource)
        : treeSource;
      const literalTestId = new RegExp(`testID=["']${testId}["']`);
      const dynamicHistoryAttemptId = testId.startsWith("history-attempt-")
        && visibleSource.includes(
          "testID={`history-attempt-${attempt.id}`}"
        );
      assert.ok(
        literalTestId.test(visibleSource) || dynamicHistoryAttemptId,
        `Expected ${testId} in ${testIdSource ?? `${frame.source.component} or the components it imports`}`
      );
    }
  }
});

// Reads a component and, transitively, the modules it imports from the
// components directory. Keys are repository-relative paths.
async function readComponentTree(entry) {
  const tree = new Map();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (tree.has(file)) continue;
    const source = await readFile(new URL(file, repositoryRoot), "utf8");
    tree.set(file, source);
    for (const match of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+\.tsx?)["']/g)) {
      const imported = posix.join(posix.dirname(file), match[1]);
      if (imported.startsWith(componentsRoot)) pending.push(imported);
    }
  }
  return tree;
}
