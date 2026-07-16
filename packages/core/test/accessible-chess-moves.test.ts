import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAccessibleMoveOptions } from "../src/accessible-chess-moves.ts";

describe("buildAccessibleMoveOptions", () => {
  it("describes every legal move without revealing puzzle correctness", () => {
    const options = buildAccessibleMoveOptions(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );

    assert.equal(options.length, 20);
    assert.ok(options.some((option) => deepEqual(option, {
      from: "e2",
      label: "e4, e2 to e4",
      san: "e4",
      to: "e4",
      uci: "e2e4"
    })));
  });

  it("keeps each promotion available as an explicit accessible action", () => {
    const options = buildAccessibleMoveOptions("8/P7/8/8/8/8/8/k6K w - - 0 1");
    const promotions = options.filter((option) => option.from === "a7" && option.to === "a8");

    assert.deepEqual(promotions.map((option) => option.uci), [
      "a7a8q",
      "a7a8r",
      "a7a8b",
      "a7a8n"
    ]);
    assert.ok(promotions.every((option) => option.label.includes("a7 to a8")));
  });

  it("fails closed for unavailable or invalid positions", () => {
    assert.deepEqual(buildAccessibleMoveOptions(null), []);
    assert.deepEqual(buildAccessibleMoveOptions("not a fen"), []);
  });
});

function deepEqual(actual: unknown, expected: unknown): boolean {
  try {
    assert.deepEqual(actual, expected);
    return true;
  } catch {
    return false;
  }
}
