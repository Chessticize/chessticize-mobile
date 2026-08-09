import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveOpponentReplyConfig } from "../src/index.ts";

test("global Arrow Duel reply enablement gates a Run without discarding its saved choice or time", () => {
  assert.deepEqual(
    resolveEffectiveOpponentReplyConfig(
      "arrow_duel",
      { enabled: true, seconds: 12 },
      true
    ),
    { enabled: true, seconds: 12 }
  );
  assert.deepEqual(
    resolveEffectiveOpponentReplyConfig(
      "arrow_duel",
      { enabled: false, seconds: 8 },
      true
    ),
    { enabled: false, seconds: 8 }
  );
  assert.deepEqual(
    resolveEffectiveOpponentReplyConfig(
      "arrow_duel",
      { enabled: true, seconds: 12 },
      false
    ),
    { enabled: false, seconds: 12 }
  );
});

test("effective opponent replies retain Arrow Duel defaults and stay unavailable in other modes", () => {
  assert.deepEqual(
    resolveEffectiveOpponentReplyConfig("arrow_duel", undefined, true),
    { enabled: true, seconds: 10 }
  );
  assert.deepEqual(
    resolveEffectiveOpponentReplyConfig("arrow_duel", undefined, false),
    { enabled: false, seconds: 10 }
  );
  assert.equal(
    resolveEffectiveOpponentReplyConfig("standard", undefined, false),
    undefined
  );
});
