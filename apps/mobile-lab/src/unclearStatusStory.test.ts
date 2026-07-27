import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Unclear follow-up story shows the read-only marked state", async () => {
  const source = await readFile(
    new URL("./Practice.stories.tsx", import.meta.url),
    "utf8"
  );
  const storyStart = source.indexOf("export const UnclearFollowUp");
  const storyEnd = source.indexOf("export const ArrowDuelPrompt", storyStart);

  assert.ok(storyStart >= 0, "UnclearFollowUp must exist");
  assert.ok(storyEnd > storyStart, "the next story must bound UnclearFollowUp");

  const story = source.slice(storyStart, storyEnd);
  assert.match(story, /clickTestId\(canvasElement, "sprint-unclear-toggle"\)/);
  assert.match(story, /waitForTestId\(canvasElement, "sprint-unclear-marked"\)/);
});
