import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { opendir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";

const DEFAULT_SOURCE = "../lichess-presolve/presolved-depth16";
const DEFAULT_OUTPUT = "fixtures/puzzles/bundled-core-pack.json";
const DEFAULT_TARGET_COUNT = 3000;
const DEFAULT_MIN_RATING = 600;
const DEFAULT_MAX_RATING = 1600;
const PACK_METADATA = {
  id: "core",
  title: "Core Pack",
  buildDate: "2026-07-02",
  source: "Lichess puzzle database",
  sourceLicense: "CC0",
  presolve: "Chessticize depth-16 Stockfish presolve",
  licenseNote: "Derived from Lichess puzzle data with Chessticize presolve metadata."
};

const sourcePath = resolve(process.argv[2] ?? DEFAULT_SOURCE);
const outputPath = resolve(process.argv[3] ?? DEFAULT_OUTPUT);
const targetCount = Number.parseInt(process.argv[4] ?? String(DEFAULT_TARGET_COUNT), 10);
const minRating = Number.parseInt(process.argv[5] ?? String(DEFAULT_MIN_RATING), 10);
const maxRating = Number.parseInt(process.argv[6] ?? String(DEFAULT_MAX_RATING), 10);
const manifestPath = resolve(process.argv[7] ?? outputPath.replace(/\.json$/u, ".manifest.json"));

if (!Number.isInteger(targetCount) || targetCount <= 0) {
  throw new Error(`Invalid target count: ${process.argv[4]}`);
}
if (!Number.isInteger(minRating) || !Number.isInteger(maxRating) || minRating > maxRating) {
  throw new Error(`Invalid rating range: ${minRating}-${maxRating}`);
}

const selected = [];
const seenPositions = new Set();

for (const filePath of await listCsvFiles(sourcePath)) {
  await readCsvFile(filePath, (row) => {
    if (selected.length >= targetCount) {
      return false;
    }

    const puzzle = puzzleFromRow(row, { minRating, maxRating });
    if (!puzzle) {
      return true;
    }

    const positionKey = canonicalPositionFen(puzzle.initialFen);
    if (seenPositions.has(positionKey)) {
      return true;
    }
    seenPositions.add(positionKey);
    selected.push(puzzle);
    return true;
  });

  if (selected.length >= targetCount) {
    break;
  }
}

if (selected.length < targetCount) {
  throw new Error(`Only found ${selected.length} eligible puzzles in ${sourcePath}`);
}

const puzzleJson = `${JSON.stringify(selected, null, 2)}\n`;
const manifest = buildManifest(selected, {
  ...PACK_METADATA,
  manifestHash: `sha256:${createHash("sha256").update(puzzleJson).digest("hex")}`
});

await writeFile(outputPath, puzzleJson);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${selected.length} puzzles to ${outputPath}`);
console.log(`Wrote manifest to ${manifestPath}`);

async function listCsvFiles(path) {
  const entries = [];
  const dir = await opendir(path);
  for await (const entry of dir) {
    if (entry.isFile() && entry.name.endsWith(".csv")) {
      entries.push(resolve(path, entry.name));
    }
  }
  return entries.sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

async function readCsvFile(path, onRow) {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity
  });
  let headers;

  for await (const line of lines) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    if (!onRow(row)) {
      lines.close();
      break;
    }
  }
}

function puzzleFromRow(row, ratingRange) {
  const rating = parseNumber(row.Rating);
  const moves = splitWords(row.Moves);
  const stockfishBestMove = row.stockfish_bestmove?.trim();

  if (
    !row.PuzzleId ||
    !row.FEN ||
    !moves.length ||
    !stockfishBestMove ||
    rating < ratingRange.minRating ||
    rating > ratingRange.maxRating
  ) {
    return undefined;
  }

  return {
    id: row.PuzzleId,
    initialFen: row.FEN,
    solutionMoves: moves,
    rating,
    ratingDeviation: parseOptionalNumber(row.RatingDeviation),
    popularity: parseOptionalNumber(row.Popularity),
    nbPlays: parseOptionalNumber(row.NbPlays),
    themes: splitWords(row.Themes),
    gameUrl: row.GameUrl || undefined,
    openingTags: splitWords(row.OpeningTags),
    source: "lichess",
    stockfishEval: parseOptionalNumber(row.stockfish_eval),
    stockfishBestMove,
    stockfishEvalAfterFirstMove: parseOptionalNumber(row.stockfish_eval_after_first_move)
  };
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function canonicalPositionFen(fen) {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function splitWords(value) {
  return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}

function parseNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric field: ${value}`);
  }
  return parsed;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === "") {
    return undefined;
  }
  return parseNumber(value);
}

function buildManifest(puzzles, input) {
  const ratings = puzzles.map((puzzle) => puzzle.rating);
  return {
    id: input.id,
    title: input.title,
    buildDate: input.buildDate,
    source: input.source,
    sourceLicense: input.sourceLicense,
    presolve: input.presolve,
    licenseNote: input.licenseNote,
    manifestHash: input.manifestHash,
    puzzleCount: puzzles.length,
    rating: {
      min: Math.min(...ratings),
      max: Math.max(...ratings)
    },
    themes: [...new Set(puzzles.flatMap((puzzle) => puzzle.themes))].sort(),
    arrowDuelCount: puzzles.filter(isServerCompatibleArrowDuelPuzzle).length
  };
}

function isServerCompatibleArrowDuelPuzzle(puzzle) {
  const blunderMove = puzzle.solutionMoves[0];
  const bestMove = puzzle.stockfishBestMove;
  const bestEval = puzzle.stockfishEval;
  const evalAfterBlunder = puzzle.stockfishEvalAfterFirstMove;
  if (!blunderMove || !bestMove || bestEval === undefined || evalAfterBlunder === undefined) {
    return false;
  }
  if (normalizeMove(blunderMove) === normalizeMove(bestMove)) {
    return false;
  }

  const legalMoves = legalMovesFromFen(puzzle.initialFen);
  if (legalMoves.length < 2) {
    return false;
  }
  if (!legalMoves.includes(normalizeMove(blunderMove)) || !legalMoves.includes(normalizeMove(bestMove))) {
    return false;
  }

  if (evalAfterBlunder > 0) {
    return bestEval <= 60 && evalAfterBlunder - bestEval > 200;
  }
  if (evalAfterBlunder < 0) {
    return bestEval >= -60 && bestEval - evalAfterBlunder > 200;
  }
  return false;
}

function legalMovesFromFen(fen) {
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: true }).map((move) => normalizeMove(`${move.from}${move.to}${move.promotion ?? ""}`));
  } catch {
    return [];
  }
}

function normalizeMove(move) {
  return move.trim().toLowerCase();
}
