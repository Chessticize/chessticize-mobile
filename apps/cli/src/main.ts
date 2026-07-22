#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Puzzle, SprintMode } from "../../../packages/core/src/index.ts";
import { serializeSprintView } from "../../../packages/core/src/index.ts";
import { PracticeService, SQLiteStore } from "../../../packages/storage/src/index.ts";
import type { HistoryFilter } from "../../../packages/storage/src/index.ts";

const PROTOCOL_VERSION = "chessticize-cli/v1";

interface CliOptions {
  dbPath: string;
  fixturePath: string;
  seed: boolean;
}

interface JsonCommand {
  command?: string;
  type?: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const store = new SQLiteStore(options.dbPath);
  store.migrate();

  if (options.seed && store.countPuzzles() === 0) {
    store.seedPuzzles(await loadPuzzles(options.fixturePath));
  }

  const service = new PracticeService(store);
  writeJson({
    ok: true,
    type: "ready",
    protocol: PROTOCOL_VERSION,
    commands: ["startSprint", "move", "chooseArrow", "state", "history", "dueReviews", "resetRating", "exit"]
  });

  const lines = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let command: JsonCommand;
    try {
      command = JSON.parse(trimmed) as JsonCommand;
    } catch (error) {
      writeError("invalid_json", errorMessage(error));
      continue;
    }

    try {
      const shouldExit = await handleCommand(service, command);
      if (shouldExit) {
        break;
      }
    } catch (error) {
      writeError("command_failed", errorMessage(error));
    }
  }

  store.close();
}

async function handleCommand(service: PracticeService, input: JsonCommand): Promise<boolean> {
  const command = String(input.command ?? input.type ?? "");
  if (command === "startSprint") {
    const startCommand: {
      mode: SprintMode;
      durationSeconds?: number;
      perPuzzleSeconds?: number;
      targetCorrect?: number;
      maxMistakes?: number;
      themes?: string[];
      minRating?: number;
      maxRating?: number;
    } = {
      mode: parseMode(input.mode ?? "standard")
    };
    setOptional(startCommand, "durationSeconds", optionalNumber(input.durationSeconds));
    setOptional(startCommand, "perPuzzleSeconds", optionalNumber(input.perPuzzleSeconds));
    setOptional(startCommand, "targetCorrect", optionalNumber(input.targetCorrect));
    setOptional(startCommand, "maxMistakes", optionalNumber(input.maxMistakes));
    if (input.theme !== undefined) {
      throw new Error("theme is no longer supported; use themes");
    }
    setOptional(startCommand, "themes", optionalStringArray(input.themes));
    setOptional(startCommand, "minRating", optionalNumber(input.minRating));
    setOptional(startCommand, "maxRating", optionalNumber(input.maxRating));
    const state = service.startSprint(startCommand, optionalString(input.now) ?? new Date().toISOString());
    writeJson({ ok: true, type: "state", state: serializeSprintView(state) });
    return false;
  }

  if (command === "move" || command === "chooseArrow") {
    const move = optionalString(input.move);
    if (!move) {
      throw new Error("move is required");
    }
    const result = service.submitMove(move, optionalString(input.now) ?? new Date().toISOString());
    writeJson({
      ok: true,
      type: "state",
      state: serializeSprintView(result.state),
      feedback: result.feedback ?? null,
      attempt: result.attempt ?? null
    });
    return false;
  }

  if (command === "state") {
    writeJson({ ok: true, type: "state", state: service.getState() });
    return false;
  }

  if (command === "history") {
    writeJson({ ok: true, type: "history", history: service.listHistory(parseHistoryFilter(input)) });
    return false;
  }

  if (command === "dueReviews") {
    writeJson({
      ok: true,
      type: "dueReviews",
      dueReviews: service.getDueReviews(optionalString(input.now) ?? new Date().toISOString())
    });
    return false;
  }

  if (command === "resetRating") {
    const ratingKey = optionalString(input.ratingKey);
    if (!ratingKey) {
      throw new Error("ratingKey is required");
    }
    writeJson({ ok: true, type: "rating", rating: service.resetRating(ratingKey) });
    return false;
  }

  if (command === "exit") {
    writeJson({ ok: true, type: "bye" });
    return true;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(argv: string[]): CliOptions {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const defaults: CliOptions = {
    dbPath: ":memory:",
    fixturePath: resolve(repoRoot, "fixtures/puzzles/presolved-sample.json"),
    seed: true
  };
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") {
      options.dbPath = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--fixture") {
      options.fixturePath = resolve(requiredValue(argv, index));
      index += 1;
    } else if (arg === "--no-seed") {
      options.seed = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function loadPuzzles(path: string): Promise<Puzzle[]> {
  const contents = await readFile(path, "utf8");
  return JSON.parse(contents) as Puzzle[];
}

function parseHistoryFilter(input: JsonCommand): HistoryFilter {
  const filter: HistoryFilter = {};
  if (input.result === "correct" || input.result === "wrong") {
    filter.result = input.result;
  }
  if (typeof input.mode === "string") {
    filter.mode = parseMode(input.mode);
  }
  setOptional(filter, "since", optionalString(input.since));
  setOptional(filter, "puzzleId", optionalString(input.puzzleId));
  setOptional(filter, "sessionId", optionalString(input.sessionId));
  return filter;
}

function parseMode(value: unknown): SprintMode {
  if (value === "standard" || value === "blitz" || value === "arrow_duel" || value === "custom") {
    return value;
  }
  throw new Error(`Invalid sprint mode: ${String(value)}`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected number, received ${String(value)}`);
  }
  return value;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error("Expected an array of non-empty strings");
  }
  return value;
}

function requiredValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${argv[index]}`);
  }
  return value;
}

function setOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function writeError(code: string, message: string): void {
  writeJson({
    ok: false,
    type: "error",
    error: { code, message }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

await main();
