#!/usr/bin/env node
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isServerCompatibleArrowDuelPuzzle } from "../packages/core/src/index.ts";

const options = parseArgs(process.argv.slice(2));
const inputPath = resolve(options.input);
const outputPath = resolve(options.output);
const sourcePuzzles = JSON.parse(await readFile(inputPath, "utf8"));

if (!Array.isArray(sourcePuzzles) || sourcePuzzles.length === 0) {
  throw new Error(`Detox puzzle fixture must be a non-empty array: ${inputPath}`);
}
const puzzles = sourcePuzzles.filter(isServerCompatibleArrowDuelPuzzle);
if (puzzles.length === 0) {
  throw new Error(`Detox puzzle fixture has no production-eligible puzzles: ${inputPath}`);
}

await mkdir(dirname(outputPath), { recursive: true });
await rm(outputPath, { force: true });

const db = new DatabaseSync(outputPath);
try {
  initializeDatabase(db);
  writePuzzles(db, puzzles);
  db.exec("VACUUM");
} finally {
  db.close();
}

const bytes = (await stat(outputPath)).size;
console.log(
  `Wrote ${puzzles.length} production-eligible Detox fixture puzzles to ${outputPath} (${bytes} bytes).`
);

function parseArgs(argv) {
  const options = {
    input: "fixtures/puzzles/bundled-core-pack.json",
    output: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      options.input = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--output") {
      options.output = requiredValue(argv, index);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.output) {
    throw new Error("--output is required so the release puzzle pack cannot be overwritten accidentally");
  }
  return options;
}

function requiredValue(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${argv[index]} requires a value`);
  }
  return value;
}

function initializeDatabase(db) {
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;

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
    CREATE INDEX puzzles_rating_idx ON puzzles(rating, id);
    CREATE INDEX puzzle_themes_theme_rating_idx ON puzzle_themes(theme_id, rating, puzzle_id);
  `);
}

function writePuzzles(db, puzzles) {
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
  const insertPuzzleTheme = db.prepare(
    "INSERT INTO puzzle_themes (puzzle_id, theme_id, rating) VALUES (?, ?, ?)"
  );
  const themeNames = [...new Set(puzzles.flatMap((puzzle) => validatedThemes(puzzle)))].sort((left, right) =>
    left.localeCompare(right)
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    const themeIds = new Map();
    for (const theme of themeNames) {
      const result = insertThemeName.run(theme);
      themeIds.set(theme, Number(result.lastInsertRowid));
    }

    for (const puzzle of puzzles) {
      validatePuzzle(puzzle);
      insertPuzzle.run(
        puzzle.id,
        puzzle.initialFen.split(/\s+/u).slice(0, 4).join(" "),
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
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function validatedThemes(puzzle) {
  validatePuzzle(puzzle);
  return puzzle.themes;
}

function validatePuzzle(puzzle) {
  const valid =
    puzzle &&
    typeof puzzle.id === "string" &&
    puzzle.id.length > 0 &&
    typeof puzzle.initialFen === "string" &&
    puzzle.initialFen.split(/\s+/u).length >= 4 &&
    Array.isArray(puzzle.solutionMoves) &&
    puzzle.solutionMoves.length > 0 &&
    puzzle.solutionMoves.every((move) => typeof move === "string" && move.length > 0) &&
    Number.isFinite(puzzle.rating) &&
    Array.isArray(puzzle.themes) &&
    puzzle.themes.every((theme) => typeof theme === "string" && theme.length > 0) &&
    Number.isFinite(puzzle.stockfishEval) &&
    typeof puzzle.stockfishBestMove === "string" &&
    puzzle.stockfishBestMove.length > 0 &&
    Number.isFinite(puzzle.stockfishEvalAfterFirstMove);

  if (!valid) {
    throw new Error(`Invalid Detox puzzle fixture row: ${JSON.stringify(puzzle)}`);
  }
}
