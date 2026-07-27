import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the flagged Replay story stops on the first Unclear attempt", async () => {
  const source = await readFile(
    new URL("./Practice.stories.tsx", import.meta.url),
    "utf8"
  );
  const storyStart = source.indexOf("export const SprintResultFlaggedReplay");
  const storyEnd = source.indexOf("export const SprintResultExtraAttempt", storyStart);

  assert.ok(storyStart >= 0, "SprintResultFlaggedReplay must exist");
  assert.ok(storyEnd > storyStart, "the next story must bound SprintResultFlaggedReplay");

  const story = source.slice(storyStart, storyEnd);
  assert.match(story, /clickTestId\(canvasElement, "review-mistakes-button"\)/);
  assert.match(story, /expectTestIdText\(canvasElement, "history-attempt-clear-unclear", "Mark clear"\)/);
  assert.doesNotMatch(
    story,
    /clickTestId\(canvasElement, "history-attempt-clear-unclear"\)/,
    "the automatic story must not clear the Unclear marker before review"
  );
  assert.doesNotMatch(
    story,
    /clickTestId\(canvasElement, "review-next"\)/,
    "the automatic story must leave the first Unclear attempt visible"
  );
});
