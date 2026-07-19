import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the lab renders production-like UI without native debug controls", async () => {
  const previewHead = await readFile(new URL("../.storybook/preview-head.html", import.meta.url), "utf8");

  assert.match(previewHead, /globalThis\.__DEV__ = false;/);
  assert.match(previewHead, /globalThis\.__CHESSTICIZE_ENABLE_TEST_CONTROLS__ = false;/);
});
