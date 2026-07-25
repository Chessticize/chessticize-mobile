import test from "node:test";
import assert from "node:assert/strict";
import { ATTEMPT_MISTAKE_OUTCOMES, isAttemptMistake } from "../src/index.ts";

test("isAttemptMistake is the canonical wrong-or-timeout classification", () => {
  assert.deepEqual(ATTEMPT_MISTAKE_OUTCOMES, ["wrong", "timed_out"]);
  assert.equal(isAttemptMistake("correct"), false);
  assert.equal(isAttemptMistake("wrong"), true);
  assert.equal(isAttemptMistake("timed_out"), true);
});
