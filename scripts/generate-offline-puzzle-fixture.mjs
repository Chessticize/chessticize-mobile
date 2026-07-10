#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, opendir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
  MATE_PATTERN_THEMES,
  isServerCompatibleArrowDuelPuzzle
} from "../packages/core/src/index.ts";

const DEFAULT_SOURCE = "../lichess-presolve/presolved";
const DEFAULT_OUTPUT = "fixtures/puzzles/bundled-core-pack.sqlite";
const DEFAULT_MANIFEST = "fixtures/puzzles/bundled-core-pack.manifest.json";
const DEFAULT_TARGET_COUNT = 1_400_000;
const DEFAULT_MIN_RATING = 600;
const DEFAULT_MAX_RATING = 2200;
const DEFAULT_SEED = "chessticize-core-pack-v1-2026-07-04";
const CUSTOM_SPRINT_THEMES = [
  "mate",
  "endgame",
  "fork",
  "pin",
  "skewer",
  "sacrifice",
  "promotion",
  "hangingPiece",
  "advancedPawn"
];
const PACK_METADATA = {
  id: "core",
  title: "Core Pack",
  buildDate: new Date().toISOString().slice(0, 10),
  source: "Lichess puzzle database",
  sourceLicense: "CC0",
  sourceSnapshotDate: "2025-07-24",
  presolve: "Chessticize depth-20 Stockfish presolve",
  presolveDepth: 20,
  licenseNote: "Derived from Lichess puzzle data with Chessticize presolve metadata."
};

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const sourcePath = resolve(options.source);
  const outputPath = resolve(options.output);
  const manifestPath = resolve(options.manifest);

  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(dirname(manifestPath), { recursive: true });
  if (!options.resumeCandidates && !options.manifestOnly) {
    await rm(outputPath, { force: true });
  }
  const db = new DatabaseSync(outputPath);
  try {
    if (options.manifestOnly) {
      console.log(`Rebuilding manifest from existing pack ${outputPath}`);
    } else if (!options.resumeCandidates) {
      initializeDatabase(db);
      await ingestCandidates(db, sourcePath, options);
    } else {
      const candidateCount = db.prepare("SELECT COUNT(*) AS count FROM candidates").get().count;
      console.log(`Resuming from ${candidateCount} existing candidate rows in ${outputPath}`);
    }
    if (!options.manifestOnly) {
      const quotas = computeBucketQuotas(readBucketInventories(db), options.targetCount);
      const selected = selectFinalPuzzles(db, quotas, options.seed);
      writeSelectedPack(db, selected);
      db.exec("VACUUM");
    }
  } finally {
    db.close();
  }

  const packFileBytes = (await stat(outputPath)).size;
  const packFileHash = `sha256:${await sha256File(outputPath)}`;
  const manifest = buildSqliteManifest(outputPath, {
    ...PACK_METADATA,
    format: "sqlite",
    seed: options.seed,
    targetPuzzleCount: options.targetCount,
    packFileBytes,
    packFileHash,
    manifestHash: "pending"
  }, options);
  manifest.manifestHash = `sha256:${sha256Text(stableJson({ ...manifest, manifestHash: "" }))}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${manifest.puzzleCount} puzzles to ${outputPath}`);
  console.log(`Wrote manifest to ${manifestPath}`);
  console.log(`Pack size ${packFileBytes} bytes; ${packFileHash}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

function parseArgs(argv) {
  const options = {
  source: DEFAULT_SOURCE,
  output: DEFAULT_OUTPUT,
  manifest: DEFAULT_MANIFEST,
  targetCount: DEFAULT_TARGET_COUNT,
  minRating: DEFAULT_MIN_RATING,
  maxRating: DEFAULT_MAX_RATING,
  seed: DEFAULT_SEED,
  resumeCandidates: false,
  manifestOnly: false
};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
  if (arg === "--source") {
      options.source = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--output") {
      options.output = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--manifest") {
      options.manifest = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--target-count") {
      options.targetCount = parsePositiveInteger(requiredValue(argv, index), "target-count");
      index += 1;
    } else if (arg === "--min-rating") {
      options.minRating = parsePositiveInteger(requiredValue(argv, index), "min-rating");
      index += 1;
    } else if (arg === "--max-rating") {
      options.maxRating = parsePositiveInteger(requiredValue(argv, index), "max-rating");
      index += 1;
    } else if (arg === "--seed") {
      options.seed = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--resume-candidates") {
      options.resumeCandidates = true;
    } else if (arg === "--manifest-only") {
      options.manifestOnly = true;
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.minRating >= options.maxRating) {
    throw new Error("min-rating must be less than max-rating");
  }
  return options;
}

function initializeDatabase(db) {
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;

    CREATE TABLE candidates (
      id TEXT PRIMARY KEY,
      position_key TEXT NOT NULL UNIQUE,
      initial_fen TEXT NOT NULL,
      moves_json TEXT NOT NULL,
      rating INTEGER NOT NULL,
      rating_bucket INTEGER NOT NULL,
      rating_deviation INTEGER,
      popularity INTEGER,
      nb_plays INTEGER,
      themes_json TEXT NOT NULL,
      theme_family TEXT NOT NULL,
      game_url TEXT,
      opening_tags_json TEXT NOT NULL,
      source TEXT NOT NULL,
      stockfish_eval REAL NOT NULL,
      stockfish_bestmove TEXT NOT NULL,
      stockfish_eval_after_first_move REAL NOT NULL
    );

    CREATE TABLE puzzles (
      id TEXT PRIMARY KEY,
      initial_fen TEXT NOT NULL,
      solution_moves TEXT NOT NULL,
      rating INTEGER NOT NULL,
      stockfish_eval REAL NOT NULL,
      stockfish_bestmove TEXT NOT NULL,
      stockfish_eval_after_first_move REAL NOT NULL
    );

    CREATE TABLE themes (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE puzzle_themes (
      puzzle_id TEXT NOT NULL,
      theme_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      PRIMARY KEY (puzzle_id, theme_id)
    );

    CREATE INDEX candidates_bucket_idx ON candidates(rating_bucket, rating, id);
    CREATE INDEX puzzles_rating_idx ON puzzles(rating, id);
    CREATE INDEX puzzle_themes_theme_rating_idx ON puzzle_themes(theme_id, rating, puzzle_id);
  `);
}

async function ingestCandidates(db, sourcePath, options) {
  const insert = db.prepare(`
    INSERT INTO candidates (
      id,
      position_key,
      initial_fen,
      moves_json,
      rating,
      rating_bucket,
      rating_deviation,
      popularity,
      nb_plays,
      themes_json,
      theme_family,
      game_url,
      opening_tags_json,
      source,
      stockfish_eval,
      stockfish_bestmove,
      stockfish_eval_after_first_move
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(position_key) DO UPDATE SET
      id = excluded.id,
      initial_fen = excluded.initial_fen,
      moves_json = excluded.moves_json,
      rating = excluded.rating,
      rating_bucket = excluded.rating_bucket,
      rating_deviation = excluded.rating_deviation,
      popularity = excluded.popularity,
      nb_plays = excluded.nb_plays,
      themes_json = excluded.themes_json,
      theme_family = excluded.theme_family,
      game_url = excluded.game_url,
      opening_tags_json = excluded.opening_tags_json,
      source = excluded.source,
      stockfish_eval = excluded.stockfish_eval,
      stockfish_bestmove = excluded.stockfish_bestmove,
      stockfish_eval_after_first_move = excluded.stockfish_eval_after_first_move
    WHERE
      COALESCE(excluded.popularity, -1) > COALESCE(candidates.popularity, -1)
      OR (
        COALESCE(excluded.popularity, -1) = COALESCE(candidates.popularity, -1)
        AND COALESCE(excluded.nb_plays, -1) > COALESCE(candidates.nb_plays, -1)
      )
      OR (
        COALESCE(excluded.popularity, -1) = COALESCE(candidates.popularity, -1)
        AND COALESCE(excluded.nb_plays, -1) = COALESCE(candidates.nb_plays, -1)
        AND excluded.id < candidates.id
      )
  `);
  const insertRows = (rows) => {
    for (const puzzle of rows) {
      insert.run(
        puzzle.id,
        canonicalPositionFen(puzzle.initialFen),
        puzzle.initialFen,
        JSON.stringify(puzzle.solutionMoves),
        puzzle.rating,
        ratingBucket(puzzle.rating, options.maxRating),
        puzzle.ratingDeviation ?? null,
        puzzle.popularity ?? null,
        puzzle.nbPlays ?? null,
        JSON.stringify(puzzle.themes),
        themeFamily(puzzle.themes),
        puzzle.gameUrl ?? null,
        JSON.stringify(puzzle.openingTags ?? []),
        puzzle.source,
        puzzle.stockfishEval,
        puzzle.stockfishBestMove,
        puzzle.stockfishEvalAfterFirstMove
      );
    }
  };

  let pending = [];
  let readRows = 0;
  let insertedRows = 0;
  for (const filePath of await listCsvFiles(sourcePath)) {
    const beforeFileRows = readRows;
    await readCsvFile(filePath, (row) => {
      readRows += 1;
      const puzzle = puzzleFromRow(row, options);
      if (!puzzle || !isServerCompatibleArrowDuelPuzzle(puzzle)) {
        return;
      }
      pending.push(puzzle);
      if (pending.length >= 5000) {
        runInTransaction(db, () => insertRows(pending));
        insertedRows += pending.length;
        pending = [];
      }
    });
    console.log(`Scanned ${filePath}; rows=${readRows - beforeFileRows}; totalRows=${readRows}; acceptedSoFar=${insertedRows + pending.length}`);
  }
  if (pending.length > 0) {
    runInTransaction(db, () => insertRows(pending));
    insertedRows += pending.length;
  }
  const deduped = db.prepare("SELECT COUNT(*) AS count FROM candidates").get().count;
  console.log(`Read ${readRows} source rows; accepted ${insertedRows} Arrow Duel eligible rows; deduped to ${deduped}`);
}

function readBucketInventories(db) {
  const rows = db
    .prepare("SELECT rating_bucket AS bucket, COUNT(*) AS count FROM candidates GROUP BY rating_bucket ORDER BY rating_bucket ASC")
    .all();
  return rows.map((row) => ({ bucket: row.bucket, available: row.count }));
}

function computeBucketQuotas(inventories, targetCount) {
  const quotaByBucket = new Map();
  const baseline = Math.floor(targetCount / inventories.length);
  let remainder = targetCount % inventories.length;
  for (const inventory of inventories) {
    const baseQuota = baseline + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    quotaByBucket.set(inventory.bucket, Math.min(inventory.available, baseQuota));
  }

  let remaining = targetCount - sum([...quotaByBucket.values()]);
  while (remaining > 0) {
    const capacities = inventories
      .map((inventory) => ({
        bucket: inventory.bucket,
        capacity: inventory.available - (quotaByBucket.get(inventory.bucket) ?? 0)
      }))
      .filter((entry) => entry.capacity > 0);
    if (capacities.length === 0) {
      break;
    }
    const capacityTotal = sum(capacities.map((entry) => entry.capacity));
    let assigned = 0;
    const portions = capacities
      .map((entry) => {
        const exact = remaining * entry.capacity / capacityTotal;
        const whole = Math.floor(exact);
        assigned += whole;
        return { ...entry, whole, fraction: exact - whole };
      })
      .sort((left, right) => right.fraction - left.fraction || left.bucket - right.bucket);
    for (const portion of portions) {
      quotaByBucket.set(portion.bucket, (quotaByBucket.get(portion.bucket) ?? 0) + portion.whole);
    }
    let extras = remaining - assigned;
    for (const portion of portions) {
      if (extras <= 0) {
        break;
      }
      const current = quotaByBucket.get(portion.bucket) ?? 0;
      if (current < current + portion.capacity) {
        quotaByBucket.set(portion.bucket, current + 1);
        extras -= 1;
      }
    }
    const nextRemaining = targetCount - sum([...quotaByBucket.values()]);
    if (nextRemaining === remaining) {
      break;
    }
    remaining = nextRemaining;
  }

  return [...quotaByBucket.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucket, quota]) => ({ bucket, quota }));
}

function selectFinalPuzzles(db, quotas, seed) {
  const selected = [];
  for (const { bucket, quota } of quotas) {
    if (quota <= 0) {
      continue;
    }
    const rows = db
      .prepare("SELECT * FROM candidates WHERE rating_bucket = ? ORDER BY id ASC")
      .all(bucket);
    const bucketPuzzles = rows.map(puzzleFromCandidateRow);
    const bucketSelected = selectBucketPuzzles(bucketPuzzles, quota, seed, bucket);
    selected.push(...bucketSelected);
    console.log(`Selected ${bucketSelected.length}/${bucketPuzzles.length} puzzles from ${bucket}-${bucket + 99}`);
  }
  return selected.sort((left, right) => left.id.localeCompare(right.id));
}

function selectBucketPuzzles(candidates, quota, seed, bucket) {
  if (candidates.length <= quota) {
    return [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  }
  const selected = new Map();
  const familyCounts = new Map();
  const sorted = weightedOrder(candidates, seed);
  const familyCap = Math.max(1, Math.floor(quota * 0.3));
  const themeInventory = countAvailableThemes(candidates);

  for (const theme of CUSTOM_SPRINT_THEMES) {
    addThemeMinimum({
      theme,
      required: Math.min(500, themeInventory.get(theme) ?? 0),
      sorted,
      selected,
      familyCounts,
      familyCap,
      quota,
      bucket
    });
  }
  for (const theme of MATE_PATTERN_THEMES) {
    addThemeMinimum({
      theme,
      required: Math.min(50, themeInventory.get(theme) ?? 0),
      sorted,
      selected,
      familyCounts,
      familyCap,
      quota,
      bucket
    });
  }
  for (const puzzle of sorted) {
    if (selected.size >= quota) {
      break;
    }
    tryAddPuzzle(puzzle, selected, familyCounts, familyCap);
  }
  if (selected.size < quota) {
    throw new Error(`Bucket ${bucket}-${bucket + 99} could not satisfy quota ${quota}; selected ${selected.size}`);
  }
  return [...selected.values()];
}

function addThemeMinimum(input) {
  if (input.required <= 0) {
    return;
  }
  let current = countSelectedTheme(input.selected, input.theme);
  for (const puzzle of input.sorted) {
    if (current >= input.required || input.selected.size >= input.quota) {
      break;
    }
    if (!puzzle.themes.includes(input.theme)) {
      continue;
    }
    if (tryAddPuzzle(puzzle, input.selected, input.familyCounts, input.familyCap)) {
      current += 1;
    }
  }
  if (current < input.required) {
    throw new Error(`Bucket ${input.bucket}-${input.bucket + 99} could not meet ${input.theme} minimum ${input.required}; selected ${current}`);
  }
}

function tryAddPuzzle(puzzle, selected, familyCounts, familyCap) {
  if (selected.has(puzzle.id)) {
    return false;
  }
  const family = themeFamilies(puzzle.themes)
    .sort((left, right) => (familyCounts.get(left) ?? 0) - (familyCounts.get(right) ?? 0) || left.localeCompare(right))
    .find((candidate) => (familyCounts.get(candidate) ?? 0) < familyCap);
  if (family === undefined) {
    return false;
  }
  selected.set(puzzle.id, puzzle);
  familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  return true;
}

function writeSelectedPack(db, selected) {
  const insertPuzzle = db.prepare(`
    INSERT INTO puzzles (
      id,
      initial_fen,
      solution_moves,
      rating,
      stockfish_eval,
      stockfish_bestmove,
      stockfish_eval_after_first_move
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertThemeName = db.prepare("INSERT INTO themes (name) VALUES (?)");
  const insertPuzzleTheme = db.prepare("INSERT INTO puzzle_themes (puzzle_id, theme_id, rating) VALUES (?, ?, ?)");
  const writeRows = (puzzles) => {
    db.prepare("DELETE FROM puzzles").run();
    db.prepare("DELETE FROM puzzle_themes").run();
    db.prepare("DELETE FROM themes").run();
    const themeIds = new Map();
    for (const theme of [...new Set(puzzles.flatMap((puzzle) => puzzle.themes))].sort((left, right) => left.localeCompare(right))) {
      const result = insertThemeName.run(theme);
      themeIds.set(theme, Number(result.lastInsertRowid));
    }
    for (const puzzle of puzzles) {
      insertPuzzle.run(
        puzzle.id,
        canonicalPositionFen(puzzle.initialFen),
        puzzle.solutionMoves.join(" "),
        puzzle.rating,
        puzzle.stockfishEval,
        puzzle.stockfishBestMove,
        puzzle.stockfishEvalAfterFirstMove
      );
      for (const theme of puzzle.themes) {
        insertPuzzleTheme.run(puzzle.id, themeIds.get(theme), puzzle.rating);
      }
    }
    db.prepare("DROP TABLE candidates").run();
  };
  runInTransaction(db, () => writeRows(selected));
}

function buildSqliteManifest(path, input, options) {
  const packDb = new DatabaseSync(path, { readOnly: true });
  try {
    const themeCounts = new Map();
    const matePatternCounts = new Map();
    const buckets = new Map();
    let puzzleCount = 0;
    let arrowDuelCount = 0;
    let minRating = Number.POSITIVE_INFINITY;
    let maxRating = Number.NEGATIVE_INFINITY;

    for (const puzzle of iteratePackPuzzles(packDb)) {
      puzzleCount += 1;
      if (isServerCompatibleArrowDuelPuzzle(puzzle)) {
        arrowDuelCount += 1;
      }
      if (puzzleCount % 100000 === 0) {
        console.log(`Validated ${puzzleCount} pack puzzles`);
      }
      minRating = Math.min(minRating, puzzle.rating);
      maxRating = Math.max(maxRating, puzzle.rating);
      const bucketMin = ratingBucket(puzzle.rating, options.maxRating);
      const bucket = buckets.get(bucketMin) ?? {
        minRating: bucketMin,
        maxRating: bucketMin + 99,
        puzzleCount: 0,
        themeCounts: new Map(),
        matePatternCounts: new Map()
      };
      bucket.puzzleCount += 1;
      buckets.set(bucketMin, bucket);
      for (const theme of puzzle.themes) {
        increment(themeCounts, theme);
        increment(bucket.themeCounts, theme);
        if (MATE_PATTERN_THEMES.includes(theme)) {
          increment(matePatternCounts, theme);
          increment(bucket.matePatternCounts, theme);
        }
      }
    }
    if (puzzleCount === 0) {
      throw new Error("Puzzle pack must contain at least one puzzle");
    }
    if (arrowDuelCount !== puzzleCount) {
      throw new Error(`Pack validation failed: ${arrowDuelCount}/${puzzleCount} puzzles are Arrow Duel eligible`);
    }
    return {
      id: input.id,
      title: input.title,
      buildDate: input.buildDate,
      source: input.source,
      sourceLicense: input.sourceLicense,
      sourceSnapshotDate: input.sourceSnapshotDate,
      presolve: input.presolve,
      presolveDepth: input.presolveDepth,
      licenseNote: input.licenseNote,
      manifestHash: input.manifestHash,
      packFileHash: input.packFileHash,
      packFileBytes: input.packFileBytes,
      format: input.format,
      seed: input.seed,
      targetPuzzleCount: input.targetPuzzleCount,
      puzzleCount,
      rating: {
        min: minRating,
        max: maxRating
      },
      themes: [...themeCounts.keys()].sort((left, right) => left.localeCompare(right)),
      themeCounts: mapToSortedObject(themeCounts),
      ratingBuckets: [...buckets.values()]
        .sort((left, right) => left.minRating - right.minRating)
        .map((bucket) => ({
          minRating: bucket.minRating,
          maxRating: bucket.maxRating,
          puzzleCount: bucket.puzzleCount,
          themeCounts: mapToSortedObject(bucket.themeCounts),
          matePatternCounts: mapToSortedObject(bucket.matePatternCounts)
        })),
      matePatternCounts: mapToSortedObject(matePatternCounts),
      arrowDuelCount
    };
  } finally {
    packDb.close();
  }
}

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
    onRow(row);
  }
}

function puzzleFromRow(row, options) {
  const rating = parseOptionalNumber(row.Rating);
  const ratingDeviation = parseOptionalNumber(row.RatingDeviation);
  const popularity = parseOptionalNumber(row.Popularity);
  const nbPlays = parseOptionalNumber(row.NbPlays);
  const stockfishEval = parseOptionalNumber(row.stockfish_eval);
  const stockfishEvalAfterFirstMove = parseOptionalNumber(row.stockfish_eval_after_first_move);
  const stockfishBestMove = row.stockfish_bestmove?.trim();
  const moves = splitWords(row.Moves);

  if (
    !row.PuzzleId ||
    !row.FEN ||
    !moves.length ||
    !stockfishBestMove ||
    stockfishEval === undefined ||
    stockfishEvalAfterFirstMove === undefined ||
    rating === undefined ||
    rating < options.minRating ||
    rating > options.maxRating ||
    popularity === undefined ||
    popularity < 70 ||
    nbPlays === undefined ||
    nbPlays < 100 ||
    ratingDeviation === undefined ||
    ratingDeviation > 100
  ) {
    return undefined;
  }

  return {
    id: row.PuzzleId,
    initialFen: row.FEN,
    solutionMoves: moves,
    rating,
    ratingDeviation,
    popularity,
    nbPlays,
    themes: splitWords(row.Themes),
    gameUrl: row.GameUrl || undefined,
    openingTags: splitWords(row.OpeningTags),
    source: "lichess",
    stockfishEval,
    stockfishBestMove,
    stockfishEvalAfterFirstMove
  };
}

function puzzleFromCandidateRow(row) {
  return {
    id: row.id,
    initialFen: row.initial_fen,
    solutionMoves: JSON.parse(row.moves_json),
    rating: row.rating,
    ...(row.rating_deviation === null ? {} : { ratingDeviation: row.rating_deviation }),
    ...(row.popularity === null ? {} : { popularity: row.popularity }),
    ...(row.nb_plays === null ? {} : { nbPlays: row.nb_plays }),
    themes: JSON.parse(row.themes_json),
    ...(row.game_url ? { gameUrl: row.game_url } : {}),
    openingTags: JSON.parse(row.opening_tags_json),
    source: row.source,
    ...(row.stockfish_eval === null ? {} : { stockfishEval: row.stockfish_eval }),
    ...(row.stockfish_bestmove ? { stockfishBestMove: row.stockfish_bestmove } : {}),
    ...(row.stockfish_eval_after_first_move === null
      ? {}
      : { stockfishEvalAfterFirstMove: row.stockfish_eval_after_first_move })
  };
}

function* iteratePackPuzzles(db) {
  const rows = db.prepare(`
    SELECT
      puzzles.id,
      puzzles.initial_fen,
      puzzles.solution_moves,
      puzzles.rating,
      puzzles.stockfish_eval,
      puzzles.stockfish_bestmove,
      puzzles.stockfish_eval_after_first_move,
      themes.name AS theme
    FROM puzzle_themes
    JOIN puzzles ON puzzles.id = puzzle_themes.puzzle_id
    JOIN themes ON themes.id = puzzle_themes.theme_id
    ORDER BY puzzle_themes.puzzle_id ASC, puzzle_themes.theme_id ASC
  `).iterate();
  let current;
  for (const row of rows) {
    if (!current || current.id !== row.id) {
      if (current) {
        yield current;
      }
      current = {
        id: row.id,
        initialFen: expandFen(row.initial_fen),
        solutionMoves: splitWords(row.solution_moves),
        rating: row.rating,
        themes: [],
        source: "lichess",
        stockfishEval: row.stockfish_eval,
        stockfishBestMove: row.stockfish_bestmove,
        stockfishEvalAfterFirstMove: row.stockfish_eval_after_first_move
      };
    }
    current.themes.push(row.theme);
  }
  if (current) {
    yield current;
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
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

function weightedOrder(puzzles, seed) {
  return [...puzzles].sort((left, right) => weightedKey(left, seed) - weightedKey(right, seed) || left.id.localeCompare(right.id));
}

function weightedKey(puzzle, seed) {
  const popularity = Math.max(1, puzzle.popularity ?? 1);
  const hash = createHash("sha256").update(`${seed}:${puzzle.id}`).digest();
  const integer = hash.readUInt32BE(0);
  const unit = Math.max(Number.EPSILON, (integer + 1) / 0x100000001);
  return -Math.log(unit) / popularity;
}

function countAvailableThemes(puzzles) {
  const counts = new Map();
  for (const puzzle of puzzles) {
    for (const theme of puzzle.themes) {
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  return counts;
}

function countSelectedTheme(selected, theme) {
  let count = 0;
  for (const puzzle of selected.values()) {
    if (puzzle.themes.includes(theme)) {
      count += 1;
    }
  }
  return count;
}

function themeFamily(themes) {
  return themeFamilies(themes)[0] ?? "tactical_motifs";
}

function themeFamilies(themes) {
  const set = new Set(themes);
  const families = [];
  if (themes.some((theme) => MATE_PATTERN_THEMES.includes(theme)) || set.has("mate")) {
    families.push("mate_patterns");
  }
  if (themes.some((theme) => ["fork", "pin", "skewer", "sacrifice", "hangingPiece", "trappedPiece", "deflection", "decoy", "attraction", "clearance", "interference", "xRayAttack", "discoveredAttack", "doubleCheck"].includes(theme))) {
    families.push("tactical_motifs");
  }
  if (themes.some((theme) => theme.includes("Endgame") || theme === "endgame" || theme === "promotion" || theme === "advancedPawn")) {
    families.push("endgames");
  }
  if (set.has("opening") || set.has("middlegame") || set.has("kingsideAttack") || set.has("queensideAttack")) {
    families.push("openings_middlegame");
  }
  if (set.has("defensiveMove") || set.has("equality") || set.has("zugzwang")) {
    families.push("defensive");
  }
  if (families.length === 0) {
    families.push("tactical_motifs");
  }
  return families;
}

function ratingBucket(rating, maxRating) {
  return Math.min(maxRating - 100, Math.floor(rating / 100) * 100);
}

function canonicalPositionFen(fen) {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function expandFen(fen) {
  const fields = fen.trim().split(/\s+/);
  return fields.length === 4 ? `${fields.join(" ")} 0 1` : fields.join(" ");
}

function splitWords(value) {
  return value ? value.trim().split(/\s+/).filter(Boolean) : [];
}

function parseOptionalNumber(value) {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric field: ${value}`);
  }
  return parsed;
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function requiredValue(argv, index) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToSortedObject(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function runInTransaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortObject(item)]));
  }
  return value;
}

export {
  buildSqliteManifest,
  listCsvFiles,
  main,
  readCsvFile,
  sha256File,
  sha256Text,
  stableJson
};
