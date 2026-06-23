import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { opendir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_SOURCE = "../lichess-presolve/presolved-depth16";
const DEFAULT_OUTPUT = "fixtures/puzzles/presolved-1000.json";
const DEFAULT_TARGET_COUNT = 1000;
const MIN_RATING = 1485;

const sourcePath = resolve(process.argv[2] ?? DEFAULT_SOURCE);
const outputPath = resolve(process.argv[3] ?? DEFAULT_OUTPUT);
const targetCount = Number.parseInt(process.argv[4] ?? String(DEFAULT_TARGET_COUNT), 10);

if (!Number.isInteger(targetCount) || targetCount <= 0) {
  throw new Error(`Invalid target count: ${process.argv[4]}`);
}

const selected = [];
const seenPositions = new Set();

for (const filePath of await listCsvFiles(sourcePath)) {
  await readCsvFile(filePath, (row) => {
    if (selected.length >= targetCount) {
      return false;
    }

    const puzzle = puzzleFromRow(row);
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

await writeFile(outputPath, `${JSON.stringify(selected, null, 2)}\n`);
console.log(`Wrote ${selected.length} puzzles to ${outputPath}`);

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

function puzzleFromRow(row) {
  const rating = parseNumber(row.Rating);
  const moves = splitWords(row.Moves);
  const stockfishBestMove = row.stockfish_bestmove?.trim();

  if (!row.PuzzleId || !row.FEN || !moves.length || !stockfishBestMove || rating < MIN_RATING) {
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
