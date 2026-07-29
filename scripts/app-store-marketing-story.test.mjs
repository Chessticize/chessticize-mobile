import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storyUrl = new URL(
  "../config/app-store-marketing-story-v1.json",
  import.meta.url
);
const packManifestUrl = new URL(
  "../fixtures/puzzles/bundled-core-pack.manifest.json",
  import.meta.url
);
const repositoryRoot = new URL("../", import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

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
});

test("story source identity and claim evidence match version-controlled files", async () => {
  const [story, packManifest] = await Promise.all([
    readJson(storyUrl),
    readJson(packManifestUrl)
  ]);

  assert.equal(story.sourceBuild.puzzlePack.id, packManifest.id);
  assert.equal(
    story.sourceBuild.puzzlePack.manifestHash,
    packManifest.manifestHash
  );

  for (const evidence of story.claimEvidence) {
    const contents = await readFile(new URL(evidence.source, repositoryRoot), "utf8");
    assert.ok(
      contents.trim().length > 0,
      `Expected claim evidence at ${evidence.source}`
    );
  }

  for (const frame of story.frames) {
    const componentSource = await readFile(
      new URL(frame.source.component, repositoryRoot),
      "utf8"
    );
    for (const testId of frame.source.requiredVisibleTestIds) {
      assert.match(
        componentSource,
        new RegExp(`testID=["']${testId}["']`),
        `Expected ${testId} in ${frame.source.component}`
      );
    }
  }
});
