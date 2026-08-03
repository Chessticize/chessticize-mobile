import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  decodeUciMoveHex,
  sideToMoveFromPositionMetadataHex
} = require("../apps/mobile/e2e/puzzlePackBinary");

test("Detox host helper independently decodes binary Core Pack metadata", () => {
  assert.equal(decodeUciMoveHex("0c07"), "e2e4");
  assert.equal(decodeUciMoveHex("341f"), "e7e8q");
  assert.equal(sideToMoveFromPositionMetadataHex("00"), "w");
  assert.equal(sideToMoveFromPositionMetadataHex("01"), "b");
});

test("Detox host helper rejects corrupt binary Core Pack metadata", () => {
  assert.throws(() => decodeUciMoveHex("00"), /two bytes/u);
  assert.throws(() => decodeUciMoveHex("0000"), /distinct squares/u);
  assert.throws(
    () => sideToMoveFromPositionMetadataHex("0001"),
    /one byte/u
  );
});
