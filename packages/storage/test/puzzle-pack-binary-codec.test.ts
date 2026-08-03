import assert from "node:assert/strict";
import test from "node:test";
import {
  decodePuzzlePosition,
  decodeUciMove,
  decodeUciMoveLine,
  encodePuzzlePosition,
  encodeUciMove,
  encodeUciMoveLine
} from "../src/puzzle-pack-binary-codec.ts";

const START_POSITION =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

test("puzzle-pack binary codec has a stable, independently decodable byte profile", () => {
  const encodedPosition = encodePuzzlePosition(`${START_POSITION} 0 1`);

  assert.deepEqual([...encodedPosition], [
    0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
    0x1e, 0x00,
    0x24, 0x53, 0x36, 0x42,
    0x11, 0x11, 0x11, 0x11,
    0x77, 0x77, 0x77, 0x77,
    0x8a, 0xb9, 0x9c, 0xa8
  ]);
  assert.equal(decodePuzzlePosition(encodedPosition), START_POSITION);

  assert.deepEqual([...encodeUciMove("e2e4")], [0x0c, 0x07]);
  assert.equal(decodeUciMove(Uint8Array.from([0x0c, 0x07])), "e2e4");
  assert.deepEqual([...encodeUciMove("e7e8q")], [0x34, 0x1f]);
  assert.equal(decodeUciMove(Uint8Array.from([0x08, 0x40])), "a2a1n");

  const line = ["e2e4", "e7e8q", "a2a1n"];
  assert.deepEqual(decodeUciMoveLine(encodeUciMoveLine(line)), line);
});

test("puzzle-pack binary codec round-trips side, castling, en passant, and underpromotion", () => {
  const compactFen = "r3k2r/ppp2ppp/8/3p4/4P3/8/PPP2PPP/R3K2R b Kq e3";

  assert.equal(
    decodePuzzlePosition(encodePuzzlePosition(`${compactFen} 12 34`)),
    compactFen
  );
  assert.deepEqual(
    decodeUciMoveLine(encodeUciMoveLine(["e5d6", "e1g1", "a2a1r"])),
    ["e5d6", "e1g1", "a2a1r"]
  );
});

test("puzzle-pack binary codec rejects malformed or non-canonical payloads", () => {
  const position = encodePuzzlePosition(`${START_POSITION} 0 1`);

  assert.throws(
    () => decodePuzzlePosition(position.subarray(0, position.length - 1)),
    /position payload length/u
  );

  const reservedPosition = position.slice();
  reservedPosition[9] = 0x10;
  assert.throws(
    () => decodePuzzlePosition(reservedPosition),
    /reserved position bits/u
  );

  const invalidPiece = position.slice();
  invalidPiece[10] = 0x20;
  assert.throws(
    () => decodePuzzlePosition(invalidPiece),
    /piece code 0/u
  );

  const invalidChessState = position.slice();
  invalidChessState[24] = 0x9b;
  assert.throws(
    () => decodePuzzlePosition(invalidChessState),
    /Invalid chess position/u
  );

  assert.throws(
    () => decodeUciMoveLine(Uint8Array.from([0x01])),
    /move line payload length/u
  );
  assert.throws(
    () => decodeUciMove(Uint8Array.from([0x0c, 0x87])),
    /reserved move bit/u
  );
  assert.throws(
    () => decodeUciMove(Uint8Array.from([0x08, 0x70])),
    /promotion code 7/u
  );
  assert.throws(() => encodeUciMove("e2e2"), /distinct squares/u);
  assert.throws(() => encodeUciMove("e2e4q"), /promotion rank/u);
});
