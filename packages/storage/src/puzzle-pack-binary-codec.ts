import { validateFen } from "chess.js";

export const CORE_PACK_FORMAT_ID = "chessticize-core-pack";
export const CORE_PACK_SCHEMA_VERSION = 2;
export const CORE_PACK_POSITION_CODEC = "chessticize-position";
export const CORE_PACK_POSITION_CODEC_VERSION = 1;
export const CORE_PACK_MOVE_CODEC = "chessticize-uci16";
export const CORE_PACK_MOVE_CODEC_VERSION = 1;

export type PuzzlePackBinaryValue = ArrayBuffer | ArrayBufferView;
export type PuzzlePackRowEncoding = "legacy-text" | "binary-v1";

interface PuzzlePackFormatDatabase {
  prepare(sql: string): {
    get(): unknown;
    all(): unknown[];
  };
}

const PIECES = [
  undefined,
  "P", "N", "B", "R", "Q", "K",
  "p", "n", "b", "r", "q", "k"
] as const;
const PIECE_CODES: ReadonlyMap<string, number> = new Map(
  PIECES.flatMap((piece, code) => piece === undefined ? [] : [[piece, code]])
);
const PROMOTIONS = [undefined, "q", "r", "b", "n"] as const;
const PROMOTION_CODES: ReadonlyMap<string, number> = new Map(
  PROMOTIONS.flatMap((promotion, code) =>
    promotion === undefined ? [] : [[promotion, code]]
  )
);

export function readPuzzlePackRowEncoding(
  db: PuzzlePackFormatDatabase
): PuzzlePackRowEncoding {
  const table = db.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = 'pack_format'
  `).get();
  if (!table) {
    return "legacy-text";
  }
  const rows = db.prepare(`
    SELECT
      id,
      format_id,
      pack_schema_version,
      position_codec,
      position_codec_version,
      move_codec,
      move_codec_version
    FROM pack_format
    ORDER BY id
  `).all() as Array<{
    id: number;
    format_id: string;
    pack_schema_version: number;
    position_codec: string;
    position_codec_version: number;
    move_codec: string;
    move_codec_version: number;
  }>;
  const format = rows[0];
  if (
    rows.length !== 1 ||
    format?.id !== 1 ||
    format.format_id !== CORE_PACK_FORMAT_ID ||
    format.pack_schema_version !== CORE_PACK_SCHEMA_VERSION ||
    format.position_codec !== CORE_PACK_POSITION_CODEC ||
    format.position_codec_version !== CORE_PACK_POSITION_CODEC_VERSION ||
    format.move_codec !== CORE_PACK_MOVE_CODEC ||
    format.move_codec_version !== CORE_PACK_MOVE_CODEC_VERSION
  ) {
    throw new Error(
      `Unsupported puzzle pack format: ${JSON.stringify(format ?? null)}`
    );
  }
  return "binary-v1";
}

export function encodePuzzlePosition(fen: string): Uint8Array {
  const fields = validatedFenFields(fen);
  const pieces = parseBoard(fields[0]);
  const occupiedSquares: number[] = [];
  const result = new Uint8Array(
    10 + Math.ceil(pieces.filter((piece) => piece !== undefined).length / 2)
  );

  for (let square = 0; square < pieces.length; square += 1) {
    if (pieces[square] === undefined) {
      continue;
    }
    result[square >>> 3] = (result[square >>> 3] ?? 0) | (1 << (square & 7));
    occupiedSquares.push(square);
  }

  let metadata = fields[1] === "b" ? 1 : 0;
  if (fields[2].includes("K")) metadata |= 1 << 1;
  if (fields[2].includes("Q")) metadata |= 1 << 2;
  if (fields[2].includes("k")) metadata |= 1 << 3;
  if (fields[2].includes("q")) metadata |= 1 << 4;
  if (fields[3] !== "-") {
    metadata |= (squareIndex(fields[3]) + 1) << 5;
  }
  result[8] = metadata & 0xff;
  result[9] = metadata >>> 8;

  occupiedSquares.forEach((square, index) => {
    const piece = pieces[square];
    const code = piece === undefined ? undefined : PIECE_CODES.get(piece);
    if (code === undefined) {
      throw new Error(`Unsupported puzzle-pack piece ${String(piece)}`);
    }
    const byteIndex = 10 + (index >>> 1);
    result[byteIndex] = (result[byteIndex] ?? 0) |
      (index % 2 === 0 ? code : code << 4);
  });
  return result;
}

export function decodePuzzlePosition(value: PuzzlePackBinaryValue): string {
  const bytes = binaryBytes(value);
  if (bytes.length < 10) {
    throw new Error(
      `Invalid position payload length ${bytes.length}; expected at least 10`
    );
  }
  const occupiedCount = countOccupiedSquares(bytes.subarray(0, 8));
  const expectedLength = 10 + Math.ceil(occupiedCount / 2);
  if (bytes.length !== expectedLength) {
    throw new Error(
      `Invalid position payload length ${bytes.length}; expected ${expectedLength}`
    );
  }

  const metadata = (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8);
  if ((metadata & 0xf000) !== 0) {
    throw new Error("Invalid reserved position bits");
  }
  const enPassantCode = (metadata >>> 5) & 0x7f;
  if (enPassantCode > 64) {
    throw new Error(`Invalid en-passant square code ${enPassantCode}`);
  }

  const pieces: Array<string | undefined> = Array.from({ length: 64 });
  let pieceIndex = 0;
  for (let square = 0; square < 64; square += 1) {
    if (((bytes[square >>> 3] ?? 0) & (1 << (square & 7))) === 0) {
      continue;
    }
    const encoded = bytes[10 + (pieceIndex >>> 1)] ?? 0;
    const code = pieceIndex % 2 === 0 ? encoded & 0x0f : encoded >>> 4;
    const piece = PIECES[code];
    if (piece === undefined) {
      throw new Error(`Invalid piece code ${code}`);
    }
    pieces[square] = piece;
    pieceIndex += 1;
  }
  if (
    occupiedCount % 2 === 1 &&
    (((bytes[bytes.length - 1] ?? 0) >>> 4) !== 0)
  ) {
    throw new Error("Invalid nonzero position padding nibble");
  }

  const board = encodeBoard(pieces);
  const side = (metadata & 1) === 0 ? "w" : "b";
  const castling = [
    (metadata & (1 << 1)) !== 0 ? "K" : "",
    (metadata & (1 << 2)) !== 0 ? "Q" : "",
    (metadata & (1 << 3)) !== 0 ? "k" : "",
    (metadata & (1 << 4)) !== 0 ? "q" : ""
  ].join("") || "-";
  const enPassant = enPassantCode === 0
    ? "-"
    : squareName(enPassantCode - 1);
  const compactFen = `${board} ${side} ${castling} ${enPassant}`;
  assertValidFen(`${compactFen} 0 1`);
  return compactFen;
}

export function encodeUciMove(move: string): Uint8Array {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/u.exec(move.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid UCI move ${move}`);
  }
  const from = squareIndex(match[1]);
  const to = squareIndex(match[2]);
  if (from === to) {
    throw new Error("UCI move must use distinct squares");
  }
  const promotion = match[3];
  const promotionCode = promotion === undefined
    ? 0
    : PROMOTION_CODES.get(promotion);
  if (promotionCode === undefined) {
    throw new Error(`Invalid UCI promotion ${promotion}`);
  }
  if (promotionCode !== 0) {
    assertPromotionRanks(from, to);
  }
  const encoded = from | (to << 6) | (promotionCode << 12);
  return Uint8Array.from([encoded & 0xff, encoded >>> 8]);
}

export function decodeUciMove(value: PuzzlePackBinaryValue): string {
  const bytes = binaryBytes(value);
  if (bytes.length !== 2) {
    throw new Error(`Invalid move payload length ${bytes.length}; expected 2`);
  }
  const encoded = (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8);
  if ((encoded & 0x8000) !== 0) {
    throw new Error("Invalid reserved move bit");
  }
  const from = encoded & 0x3f;
  const to = (encoded >>> 6) & 0x3f;
  if (from === to) {
    throw new Error("Encoded UCI move must use distinct squares");
  }
  const promotionCode = (encoded >>> 12) & 0x07;
  const promotion = PROMOTIONS[promotionCode];
  if (promotionCode !== 0 && promotion === undefined) {
    throw new Error(`Invalid promotion code ${promotionCode}`);
  }
  if (promotionCode !== 0) {
    assertPromotionRanks(from, to);
  }
  return `${squareName(from)}${squareName(to)}${promotion ?? ""}`;
}

export function encodeUciMoveLine(moves: readonly string[]): Uint8Array {
  const result = new Uint8Array(moves.length * 2);
  moves.forEach((move, index) => result.set(encodeUciMove(move), index * 2));
  return result;
}

export function decodeUciMoveLine(value: PuzzlePackBinaryValue): string[] {
  const bytes = binaryBytes(value);
  if (bytes.length % 2 !== 0) {
    throw new Error(
      `Invalid move line payload length ${bytes.length}; expected an even length`
    );
  }
  const moves: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 2) {
    moves.push(decodeUciMove(bytes.subarray(offset, offset + 2)));
  }
  return moves;
}

export function binaryBytes(value: PuzzlePackBinaryValue): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error("Puzzle-pack BLOB is not binary data");
}

function validatedFenFields(fen: string): [string, string, string, string] {
  const fields = fen.trim().split(/\s+/u);
  if (fields.length !== 4 && fields.length !== 6) {
    throw new Error(`Invalid chess position: expected 4 or 6 FEN fields`);
  }
  const fullFen = fields.length === 4
    ? `${fields.join(" ")} 0 1`
    : fields.join(" ");
  assertValidFen(fullFen);
  return [fields[0] ?? "", fields[1] ?? "", fields[2] ?? "", fields[3] ?? ""];
}

function assertValidFen(fen: string): void {
  const validation = validateFen(fen);
  if (!validation.ok) {
    throw new Error(`Invalid chess position: ${validation.error ?? fen}`);
  }
}

function parseBoard(board: string): Array<string | undefined> {
  const pieces: Array<string | undefined> = Array.from({ length: 64 });
  const ranks = board.split("/");
  if (ranks.length !== 8) {
    throw new Error("Invalid chess position: expected eight ranks");
  }
  ranks.forEach((rank, rankFromEight) => {
    let file = 0;
    for (const symbol of rank) {
      if (/^[1-8]$/u.test(symbol)) {
        file += Number(symbol);
        continue;
      }
      if (!PIECE_CODES.has(symbol)) {
        throw new Error(`Invalid chess position piece ${symbol}`);
      }
      if (file >= 8) {
        throw new Error("Invalid chess position: rank exceeds eight files");
      }
      const square = (7 - rankFromEight) * 8 + file;
      pieces[square] = symbol;
      file += 1;
    }
    if (file !== 8) {
      throw new Error("Invalid chess position: rank does not contain eight files");
    }
  });
  return pieces;
}

function encodeBoard(pieces: readonly (string | undefined)[]): string {
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let encoded = "";
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = pieces[rank * 8 + file];
      if (piece === undefined) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        encoded += String(empty);
        empty = 0;
      }
      encoded += piece;
    }
    if (empty > 0) {
      encoded += String(empty);
    }
    ranks.push(encoded);
  }
  return ranks.join("/");
}

function countOccupiedSquares(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    let bits = byte;
    while (bits !== 0) {
      bits &= bits - 1;
      count += 1;
    }
  }
  return count;
}

function squareIndex(square: string): number {
  if (!/^[a-h][1-8]$/u.test(square)) {
    throw new Error(`Invalid chess square ${square}`);
  }
  return square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8;
}

function squareName(square: number): string {
  return `${String.fromCharCode(97 + (square & 7))}${(square >>> 3) + 1}`;
}

function assertPromotionRanks(from: number, to: number): void {
  const fromRank = (from >>> 3) + 1;
  const toRank = (to >>> 3) + 1;
  if (!(
    (fromRank === 7 && toRank === 8) ||
    (fromRank === 2 && toRank === 1)
  )) {
    throw new Error(
      `Invalid promotion rank transition ${squareName(from)}${squareName(to)}`
    );
  }
}
