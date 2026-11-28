#!/usr/bin/env node
/**
 * Real-Game Quality & Performance Benchmark Harness for Chessticize Mobile 2.0.
 *
 * Supports two execution modes:
 *   - `--mode=deterministic` (default): Fast CI/Node mode (< 2s) using curated multi-ply
 *     evaluator fixtures embedded in `fixtures/game-review/quality-corpus.json`.
 *   - `--mode=stockfish`: Compiles and runs a minimal host UCI wrapper around the bundled
 *     native Stockfish 18 NNUE bridge (`apps/mobile/native/stockfish/Bridge/StockfishRunner.cpp`)
 *     in `/tmp/chessticize-sf-bench` (cleaned up automatically on exit) to measure real
 *     Pass-1 and Pass-2 wall-clock latency and real puzzle extraction quality.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import {
  ALREADY_WINNING_CP,
  DEFAULT_MAX_PUZZLES_PER_GAME,
  MIN_OPPORTUNITY_SCORE_CP,
  UciEngineArbiter,
  beginArrowDuelPuzzle,
  beginLinePuzzle,
  fenPositionKey,
  isLegalUci,
  isUserGamePuzzleId,
  normalizeUci,
  parsePgnGame,
  runFullGameReviewPipeline,
  submitArrowDuelChoice,
  submitLineMove
} from "../packages/core/src/index.ts";
import {
  extractedGamePuzzleToStoredUserPuzzle,
  storedUserPuzzleToPuzzle
} from "../packages/storage/src/game-review-store.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_CORPUS_PATH = resolve(REPO_ROOT, "fixtures/game-review/quality-corpus.json");
const STOCKFISH_BENCH_DIR = "/tmp/chessticize-sf-bench";

const FORCED_MATE_TAGS = new Set(["mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5"]);
const OWN_ESCAPED_KINDS = new Set(["own_mistake_escaped", "own_blunder_escaped"]);
const OWN_PUNISHED_KINDS = new Set(["own_mistake_punished", "own_blunder_punished"]);
const OPPONENT_MISSED_KINDS = new Set(["opponent_mistake_missed", "opponent_blunder_missed"]);
const OPPONENT_CAUGHT_KINDS = new Set(["opponent_mistake_caught", "opponent_blunder_caught"]);

const UCI_WRAPPER_CPP = `#include "StockfishRunner.h"

#include <iostream>
#include <mutex>
#include <string>

int main(int argc, char** argv) {
  if (argc != 3) {
    std::cerr << "Usage: sf-uci-bench <big.nnue> <small.nnue>\\n";
    return 64;
  }

  std::mutex outMutex;
  Chessticize::StockfishBridge::StockfishRunner runner(
      [&](std::string line) {
        std::lock_guard<std::mutex> lock(outMutex);
        std::cout << line << '\\n' << std::flush;
      },
      argv[1],
      argv[2]);

  std::string command;
  while (std::getline(std::cin, command)) {
    if (!command.empty() && command.back() == '\\r') {
      command.pop_back();
    }
    if (command.empty()) {
      continue;
    }
    runner.handle(command);
    if (command == "quit") {
      break;
    }
  }
  return 0;
}
`;

export function parseBenchmarkArgs(argv) {
  const options = {
    mode: "deterministic",
    corpusPath: DEFAULT_CORPUS_PATH,
    json: false,
    keepBinary: false,
    recordDeterministic: false,
    pass1Depth: 12,
    pass1Nodes: 80_000,
    deepDepth: 18,
    deepNodes: 500_000,
    maxPuzzlesPerGame: DEFAULT_MAX_PUZZLES_PER_GAME
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--keep-binary") {
      options.keepBinary = true;
    } else if (arg === "--record-deterministic") {
      options.recordDeterministic = true;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length).trim();
    } else if (arg === "--mode" && argv[index + 1]) {
      options.mode = argv[++index].trim();
    } else if (arg.startsWith("--corpus=")) {
      options.corpusPath = resolve(arg.slice("--corpus=".length));
    } else if (arg === "--corpus" && argv[index + 1]) {
      options.corpusPath = resolve(argv[++index]);
    } else if (arg.startsWith("--pass1-depth=")) {
      options.pass1Depth = Number.parseInt(arg.slice("--pass1-depth=".length), 10);
    } else if (arg.startsWith("--pass1-nodes=")) {
      options.pass1Nodes = Number.parseInt(arg.slice("--pass1-nodes=".length), 10);
    } else if (arg.startsWith("--deep-depth=")) {
      options.deepDepth = Number.parseInt(arg.slice("--deep-depth=".length), 10);
    } else if (arg.startsWith("--deep-nodes=")) {
      options.deepNodes = Number.parseInt(arg.slice("--deep-nodes=".length), 10);
    } else if (arg.startsWith("--max-puzzles=")) {
      options.maxPuzzlesPerGame = Number.parseInt(arg.slice("--max-puzzles=".length), 10);
    }
  }

  if (options.mode !== "deterministic" && options.mode !== "stockfish") {
    throw new Error(`Unsupported --mode "${options.mode}". Expected "deterministic" or "stockfish".`);
  }

  return options;
}

/**
 * Deterministic multi-ply position evaluator backed by curated corpus evaluation tables.
 * Supports MultiPV, searchMoves restriction, and legal fallback generation for routine opening plies.
 */
export function createDeterministicEngine(gameSpec) {
  const evalTable = gameSpec.deterministicEvals ?? {};
  const defaultWhiteCp = gameSpec.defaultEvalWhiteCp ?? 15;

  return {
    async analyze(request) {
      const key = fenPositionKey(request.fen);
      const activeColor = request.fen.split(/\s+/)[1] === "b" ? "b" : "w";
      const multiPv = request.multiPv ?? 1;
      const depth = request.depth ?? 18;
      const nodes = request.nodes ?? 50_000;
      const searchMove = request.searchMoves?.[0] ? normalizeUci(request.searchMoves[0]) : undefined;

      const entry =
        (searchMove ? evalTable[`${key}|searchmoves:${searchMove}`] : undefined) ??
        evalTable[key];

      if (entry && Array.isArray(entry.lines) && entry.lines.length > 0) {
        const filtered = searchMove
          ? entry.lines.filter((line) => normalizeUci(line.move) === searchMove)
          : entry.lines;
        const chosen = filtered.length > 0 ? filtered : entry.lines;
        return chosen.slice(0, multiPv).map((line, index) => ({
          move: normalizeUci(line.move),
          pv: (line.pv ?? [line.move]).map(normalizeUci),
          multipv: line.multipv ?? index + 1,
          depth,
          nodes,
          score: toAnalysisScore(line, activeColor)
        }));
      }

      const chess = new Chess(request.fen);
      if (chess.isGameOver()) {
        return [];
      }
      const legalMoves = chess
        .moves({ verbose: true })
        .map((move) => normalizeUci(`${move.from}${move.to}${move.promotion ?? ""}`));
      const selectedMoves = searchMove
        ? legalMoves.filter((move) => move === searchMove)
        : legalMoves.slice(0, multiPv);
      const fallbackMoves = selectedMoves.length > 0 ? selectedMoves : legalMoves.slice(0, 1);

      return fallbackMoves.slice(0, multiPv).map((move, index) => {
        const whiteCp = defaultWhiteCp - index * (activeColor === "w" ? 10 : -10);
        return {
          move,
          pv: [move],
          multipv: index + 1,
          depth,
          nodes,
          score: {
            kind: "cp",
            whiteCentipawns: whiteCp,
            sideToMoveCentipawns: activeColor === "w" ? whiteCp : -whiteCp
          }
        };
      });
    }
  };
}

function toAnalysisScore(line, activeColor) {
  if (line.mateWhite !== undefined) {
    const whiteMate = line.mateWhite;
    const sideToMoveMate = activeColor === "w" ? whiteMate : -whiteMate;
    return {
      kind: "mate",
      whiteMate,
      sideToMoveMate
    };
  }
  if (line.mateSide !== undefined) {
    const sideToMoveMate = line.mateSide;
    const whiteMate = activeColor === "w" ? sideToMoveMate : -sideToMoveMate;
    return {
      kind: "mate",
      whiteMate,
      sideToMoveMate
    };
  }
  const whiteCentipawns =
    line.cpWhite !== undefined
      ? line.cpWhite
      : line.cpSide !== undefined
        ? activeColor === "w"
          ? line.cpSide
          : -line.cpSide
        : 0;
  const sideToMoveCentipawns = activeColor === "w" ? whiteCentipawns : -whiteCentipawns;
  return {
    kind: "cp",
    whiteCentipawns,
    sideToMoveCentipawns
  };
}

function listStockfishCppSources(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name.startsWith("._")) {
        return [];
      }
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listStockfishCppSources(fullPath);
      }
      if (entry.isFile() && entry.name.endsWith(".cpp") && entry.name !== "main.cpp") {
        return [fullPath];
      }
      return [];
    })
    .sort();
}

function compileStockfishBenchBinary() {
  const stockfishRoot = join(REPO_ROOT, "apps/mobile/native/stockfish");
  const sourceRoot = join(stockfishRoot, "Stockfish/src");
  const bridgeRoot = join(stockfishRoot, "Bridge");
  const bigNetwork = join(stockfishRoot, "Resources/nn-c288c895ea92.nnue");
  const smallNetwork = join(stockfishRoot, "Resources/nn-37f18f62d772.nnue");

  if (!existsSync(bigNetwork) || !existsSync(smallNetwork)) {
    throw new Error(
      `Bundled Stockfish NNUE networks not found under ${join(stockfishRoot, "Resources")}.`
    );
  }

  mkdirSync(STOCKFISH_BENCH_DIR, { recursive: true });
  const wrapperSource = join(STOCKFISH_BENCH_DIR, "uci-wrapper.cpp");
  const executable = join(STOCKFISH_BENCH_DIR, "sf-uci-bench");

  const needsBuild = !existsSync(executable);
  let compileMs = 0;

  if (needsBuild) {
    writeFileSync(wrapperSource, UCI_WRAPPER_CPP, "utf8");
    const compiler = process.env.CXX || "c++";
    const compileStart = performance.now();
    const compileResult = spawnSync(
      compiler,
      [
        "-std=c++17",
        "-O3",
        "-fno-exceptions",
        "-fno-rtti",
        "-DNNUE_EMBEDDING_OFF",
        "-DUSE_PTHREADS",
        "-DIS_64BIT",
        "-DNO_PREFETCH",
        "-DNDEBUG",
        "-pthread",
        `-I${bridgeRoot}`,
        `-I${sourceRoot}`,
        wrapperSource,
        join(bridgeRoot, "StockfishRunner.cpp"),
        ...listStockfishCppSources(sourceRoot),
        "-o",
        executable
      ],
      {
        encoding: "utf8",
        timeout: 120_000
      }
    );
    compileMs = roundMs(performance.now() - compileStart);
    if (compileResult.status !== 0) {
      throw new Error(
        `Failed to compile Stockfish bench binary (exit ${compileResult.status}):\n${compileResult.stderr || compileResult.stdout}`
      );
    }
  }

  return {
    executable,
    bigNetwork,
    smallNetwork,
    compileMs,
    reusedBinary: !needsBuild
  };
}

function createNativeStockfishTransport(executable, bigNetwork, smallNetwork) {
  let child = null;
  let readline = null;
  const listeners = new Set();

  return {
    async start() {
      if (child) {
        return;
      }
      child = spawn(executable, [bigNetwork, smallNetwork], {
        stdio: ["pipe", "pipe", "pipe"]
      });
      child.stderr.setEncoding("utf8");
      readline = createInterface({ input: child.stdout });
      readline.on("line", (line) => {
        for (const listener of [...listeners]) {
          listener(line);
        }
      });
    },
    send(command) {
      if (!child || !child.stdin.writable) {
        throw new Error("Native Stockfish process is not running.");
      }
      child.stdin.write(`${command}\n`);
    },
    onLine(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    terminate() {
      if (readline) {
        readline.close();
        readline = null;
      }
      if (child) {
        try {
          child.stdin.write("quit\n");
          child.stdin.end();
        } catch {
          // Ignore pipe errors during shutdown.
        }
        if (!child.killed) {
          child.kill("SIGTERM");
        }
        child = null;
      }
      listeners.clear();
    }
  };
}

/**
 * Audit a single game's pipeline output against all hard 2.0 quality invariants.
 */
export function auditGameResult(gameSpec, pipelineResult, pass1EngineCalls, maxPuzzlesPerGame) {
  const failures = [];
  const { report, puzzles, highlights, allCandidatePuzzles } = pipelineResult;
  const parsedGame = report.parsedGame;
  const expected = gameSpec.expected ?? {};

  // 1. Complete report check
  if (!report.isComplete) {
    failures.push(`${gameSpec.id}: Pass-1 report did not complete.`);
  }

  // 2. Pre-evaluated PGN fast-path check
  if (expected.expectPreEvaluatedFastPath) {
    if (pass1EngineCalls !== 0) {
      failures.push(
        `${gameSpec.id}: Expected 0 Pass-1 engine calls for pre-evaluated PGN, observed ${pass1EngineCalls}.`
      );
    }
    const nonPreEval = report.plies.filter((ply) => !ply.fromPreExistingEval);
    if (nonPreEval.length > 0) {
      failures.push(
        `${gameSpec.id}: Expected all plies hydrated from pre-existing evals, found ${nonPreEval.length} engine-evaluated plies.`
      );
    }
  }

  // 3. Max puzzles per game cap
  if (puzzles.length > maxPuzzlesPerGame) {
    failures.push(
      `${gameSpec.id}: Generated ${puzzles.length} puzzles exceeding maxPuzzlesPerGame=${maxPuzzlesPerGame}.`
    );
  }

  // 4. opponent_*_caught NEVER in puzzles or allCandidatePuzzles
  const uniqueAuditedPuzzles = new Map();
  for (const candidate of [...puzzles, ...allCandidatePuzzles]) {
    uniqueAuditedPuzzles.set(candidate.idSeed, candidate);
  }
  const auditedPuzzles = [...uniqueAuditedPuzzles.values()];

  for (const candidate of auditedPuzzles) {
    if (OPPONENT_CAUGHT_KINDS.has(candidate.momentKind)) {
      failures.push(
        `${gameSpec.id}: opponent_*_caught moment (${candidate.momentKind} at ply ${candidate.ply}) leaked into puzzles.`
      );
    }
  }

  // 5. Garbage-time leak checks
  const forbiddenGarbagePlies = new Set(expected.forbiddenGarbageTimePlies ?? []);
  for (const puzzle of auditedPuzzles) {
    const hasForcedMate =
      puzzle.themes.some((theme) => FORCED_MATE_TAGS.has(theme)) || puzzle.cp >= 9995;
    if (puzzle.prevCp > ALREADY_WINNING_CP && !hasForcedMate) {
      failures.push(
        `${gameSpec.id}: Garbage-time leak at ply ${puzzle.ply} (prevCp=${puzzle.prevCp} > ${ALREADY_WINNING_CP} without forced mate 1-5).`
      );
    }
    if (puzzle.cp < MIN_OPPORTUNITY_SCORE_CP) {
      failures.push(
        `${gameSpec.id}: Losing-opportunity leak at ply ${puzzle.ply} (cp=${puzzle.cp} < ${MIN_OPPORTUNITY_SCORE_CP}).`
      );
    }
    if (puzzle.puzzleKind === "arrow_duel" && puzzle.arrowDuel) {
      const moverBlunderCp =
        puzzle.userColor === "w"
          ? puzzle.arrowDuel.blunderEvalWhite
          : -puzzle.arrowDuel.blunderEvalWhite;
      if (moverBlunderCp > ALREADY_WINNING_CP) {
        failures.push(
          `${gameSpec.id}: Post-blunder still trivially winning leak at ply ${puzzle.ply} (moverBlunderCp=${moverBlunderCp} > ${ALREADY_WINNING_CP}).`
        );
      }
    }
    if (forbiddenGarbagePlies.has(puzzle.ply)) {
      failures.push(
        `${gameSpec.id}: Garbage-time ply ${puzzle.ply} leaked a puzzle (${puzzle.momentKind}, ${puzzle.puzzleKind}).`
      );
    }
  }

  // 6. Arrow Duel invariants & punishmentLine legality
  let arrowDuelCount = 0;
  let lineCount = 0;
  for (const puzzle of puzzles) {
    if (puzzle.puzzleKind === "arrow_duel") {
      arrowDuelCount += 1;
      const duel = puzzle.arrowDuel;
      if (!duel) {
        failures.push(`${gameSpec.id}: Arrow Duel puzzle at ply ${puzzle.ply} missing arrowDuel metadata.`);
        continue;
      }
      if (puzzle.initialFen !== duel.decisionFen) {
        failures.push(
          `${gameSpec.id}: Arrow Duel initialFen !== decisionFen at ply ${puzzle.ply}.`
        );
      }
      let board;
      try {
        board = new Chess(puzzle.initialFen);
      } catch (error) {
        failures.push(`${gameSpec.id}: Arrow Duel invalid FEN at ply ${puzzle.ply}: ${error.message}`);
        continue;
      }
      if (board.turn() !== puzzle.userColor) {
        failures.push(
          `${gameSpec.id}: Arrow Duel turn mismatch at ply ${puzzle.ply} (turn=${board.turn()}, userColor=${puzzle.userColor}).`
        );
      }
      const bestMove = normalizeUci(duel.bestMove);
      const blunderMove = normalizeUci(duel.blunderMove);
      if (bestMove === blunderMove) {
        failures.push(`${gameSpec.id}: Arrow Duel bestMove === blunderMove (${bestMove}) at ply ${puzzle.ply}.`);
      }
      if (!isLegalUci(puzzle.initialFen, bestMove)) {
        failures.push(`${gameSpec.id}: Arrow Duel bestMove ${bestMove} illegal at ply ${puzzle.ply}.`);
      }
      if (!isLegalUci(puzzle.initialFen, blunderMove)) {
        failures.push(`${gameSpec.id}: Arrow Duel blunderMove ${blunderMove} illegal at ply ${puzzle.ply}.`);
      }
      const bestOrigin = board.get(bestMove.slice(0, 2));
      const blunderOrigin = board.get(blunderMove.slice(0, 2));
      if (!bestOrigin || bestOrigin.color !== puzzle.userColor) {
        failures.push(`${gameSpec.id}: Arrow Duel bestMove piece color mismatch at ply ${puzzle.ply}.`);
      }
      if (!blunderOrigin || blunderOrigin.color !== puzzle.userColor) {
        failures.push(`${gameSpec.id}: Arrow Duel blunderMove piece color mismatch at ply ${puzzle.ply}.`);
      }
      if (!Array.isArray(duel.punishmentLine) || duel.punishmentLine.length === 0) {
        failures.push(`${gameSpec.id}: Arrow Duel missing non-empty punishmentLine at ply ${puzzle.ply}.`);
      } else {
        const replay = new Chess(puzzle.initialFen);
        const fullRefutation = [blunderMove, ...duel.punishmentLine];
        for (const uci of fullRefutation) {
          const normalized = normalizeUci(uci);
          const played = replay.move({
            from: normalized.slice(0, 2),
            to: normalized.slice(2, 4),
            ...(normalized.length > 4 ? { promotion: normalized.slice(4, 5) } : {})
          });
          if (!played) {
            failures.push(
              `${gameSpec.id}: Arrow Duel illegal punishmentLine move ${uci} at ply ${puzzle.ply}.`
            );
            break;
          }
        }
      }
    } else {
      lineCount += 1;
    }

    // 7. Storage conversion & Practice session startup round-trip
    try {
      const opponentName =
        gameSpec.userColor === "w" ? parsedGame.black : parsedGame.white;
      const stored = extractedGamePuzzleToStoredUserPuzzle(gameSpec.id, puzzle, {
        ...(opponentName ? { opponentName } : {}),
        ...(parsedGame.timeClass ? { timeClass: parsedGame.timeClass } : {}),
        ratingAnchor: 1500,
        nowIso: "2026-01-01T00:00:00.000Z"
      });
      const practicePuzzle = storedUserPuzzleToPuzzle(stored);
      if (!isUserGamePuzzleId(practicePuzzle.id)) {
        failures.push(`${gameSpec.id}: Stored puzzle id missing ug_ prefix (${practicePuzzle.id}).`);
      }
      if (puzzle.puzzleKind === "line") {
        let state = beginLinePuzzle(practicePuzzle);
        let guard = 0;
        while (!state.solved && guard < 20) {
          guard += 1;
          const expectedMove = state.puzzle.solutionMoves[state.cursor];
          if (!expectedMove) {
            failures.push(`${gameSpec.id}: Line puzzle stalled without expectedMove at ply ${puzzle.ply}.`);
            break;
          }
          const step = submitLineMove(state, expectedMove);
          if (step.feedback.result !== "correct") {
            failures.push(
              `${gameSpec.id}: Line puzzle rejected its own expected move ${expectedMove} at ply ${puzzle.ply}.`
            );
            break;
          }
          state = step.state;
        }
        if (!state.solved) {
          failures.push(`${gameSpec.id}: Line puzzle did not solve cleanly at ply ${puzzle.ply}.`);
        }
      } else {
        const duelState = beginArrowDuelPuzzle(practicePuzzle, 0);
        if (duelState.candidates.length !== 2) {
          failures.push(`${gameSpec.id}: Arrow Duel session did not expose 2 candidates at ply ${puzzle.ply}.`);
        }
        const choice = submitArrowDuelChoice(duelState, duelState.correctMove);
        if (choice.feedback.result !== "correct" || !choice.state.solved) {
          failures.push(`${gameSpec.id}: Arrow Duel session did not accept correctMove at ply ${puzzle.ply}.`);
        }
      }
    } catch (error) {
      failures.push(
        `${gameSpec.id}: Practice round-trip failed for ${puzzle.puzzleKind} at ply ${puzzle.ply}: ${error.message}`
      );
    }
  }

  // 8. Per-game expected assertions (when explicitly required)
  if (expected.minPuzzles !== undefined && puzzles.length < expected.minPuzzles) {
    failures.push(
      `${gameSpec.id}: Expected at least ${expected.minPuzzles} puzzle(s), got ${puzzles.length}.`
    );
  }
  if (expected.maxPuzzles !== undefined && puzzles.length > expected.maxPuzzles) {
    failures.push(
      `${gameSpec.id}: Expected at most ${expected.maxPuzzles} puzzle(s), got ${puzzles.length}.`
    );
  }
  if (expected.requireHighlight && highlights.length === 0) {
    failures.push(`${gameSpec.id}: Expected at least 1 opponent_*_caught highlight, got 0.`);
  }
  if (expected.requireOwnEscaped) {
    const hasEscaped = puzzles.some((puzzle) => OWN_ESCAPED_KINDS.has(puzzle.momentKind));
    if (!hasEscaped) {
      failures.push(
        `${gameSpec.id}: Expected at least 1 own_*_escaped puzzle, got [${puzzles.map((p) => p.momentKind).join(", ")}].`
      );
    }
  }
  if (expected.requirePuzzleKind) {
    const hasKind = puzzles.some((puzzle) => puzzle.puzzleKind === expected.requirePuzzleKind);
    if (!hasKind) {
      failures.push(
        `${gameSpec.id}: Expected puzzleKind="${expected.requirePuzzleKind}", got [${puzzles.map((p) => p.puzzleKind).join(", ")}].`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    arrowDuelCount,
    lineCount
  };
}

export async function runQualityBenchmark(rawOptions = {}) {
  const options = {
    mode: rawOptions.mode ?? "deterministic",
    corpusPath: rawOptions.corpusPath ?? DEFAULT_CORPUS_PATH,
    keepBinary: rawOptions.keepBinary ?? false,
    recordDeterministic: rawOptions.recordDeterministic ?? false,
    pass1Depth: rawOptions.pass1Depth ?? 12,
    pass1Nodes: rawOptions.pass1Nodes ?? 80_000,
    deepDepth: rawOptions.deepDepth ?? 18,
    deepNodes: rawOptions.deepNodes ?? 500_000,
    maxPuzzlesPerGame: rawOptions.maxPuzzlesPerGame ?? DEFAULT_MAX_PUZZLES_PER_GAME
  };

  const corpus = JSON.parse(readFileSync(options.corpusPath, "utf8"));
  if (!Array.isArray(corpus.games) || corpus.games.length === 0) {
    throw new Error(`Quality corpus at ${options.corpusPath} contains no games.`);
  }

  let stockfishSetup = null;
  let transport = null;
  let arbiter = null;

  try {
    if (options.mode === "stockfish") {
      stockfishSetup = compileStockfishBenchBinary();
      transport = createNativeStockfishTransport(
        stockfishSetup.executable,
        stockfishSetup.bigNetwork,
        stockfishSetup.smallNetwork
      );
      arbiter = new UciEngineArbiter(transport, {
        defaultDepth: options.deepDepth,
        defaultMultiPv: 1,
        defaultTimeoutMs: 60_000
      });
    }

    const gameResults = [];
    const corpusFailures = [];

    for (const gameSpec of corpus.games) {
      const parsedPreview = parsePgnGame(gameSpec.pgn);
      const baseEngine =
        options.mode === "stockfish"
          ? arbiter
          : createDeterministicEngine(gameSpec);

      let totalEngineCalls = 0;
      let pass1EngineCalls = 0;
      let pass1Ms = 0;
      const recordedEvals = options.recordDeterministic ? {} : null;
      const countingEngine = {
        async analyze(request) {
          totalEngineCalls += 1;
          const lines = await baseEngine.analyze(request);
          if (recordedEvals && lines.length > 0) {
            const keyBase = fenPositionKey(request.fen);
            const searchMove = request.searchMoves?.[0]
              ? normalizeUci(request.searchMoves[0])
              : undefined;
            const mapKey = searchMove ? `${keyBase}|searchmoves:${searchMove}` : keyBase;
            const existing = recordedEvals[mapKey];
            const compactLines = lines.map((line) => ({
              move: line.move,
              pv: line.pv.slice(0, 6),
              ...(line.score.kind === "mate"
                ? { mateWhite: line.score.whiteMate }
                : { cpWhite: line.score.whiteCentipawns })
            }));
            if (!existing || compactLines.length >= existing.lines.length) {
              recordedEvals[mapKey] = { lines: compactLines };
            }
          }
          return lines;
        }
      };

      const startedAt = performance.now();
      const pipelineResult = await runFullGameReviewPipeline({
        gameId: gameSpec.id,
        pgn: gameSpec.pgn,
        userColor: gameSpec.userColor,
        engine: countingEngine,
        pass1Options: {
          depth: options.pass1Depth,
          nodes: options.pass1Nodes
        },
        extractionOptions: {
          maxPuzzlesPerGame: options.maxPuzzlesPerGame,
          deepLimit: {
            depth: options.deepDepth,
            nodes: options.deepNodes
          }
        },
        onPass1Complete() {
          pass1Ms = roundMs(performance.now() - startedAt);
          pass1EngineCalls = totalEngineCalls;
        }
      });
      const totalMs = roundMs(performance.now() - startedAt);
      const pass2Ms = roundMs(Math.max(0, totalMs - pass1Ms));
      const pass2EngineCalls = Math.max(0, totalEngineCalls - pass1EngineCalls);

      if (recordedEvals) {
        gameSpec.deterministicEvals = recordedEvals;
      }

      const audit = auditGameResult(
        gameSpec,
        pipelineResult,
        pass1EngineCalls,
        options.maxPuzzlesPerGame
      );
      corpusFailures.push(...audit.failures);

      gameResults.push({
        id: gameSpec.id,
        title: gameSpec.title,
        timeClass: parsedPreview.timeClass,
        timeControl: parsedPreview.timeControl ?? "",
        userColor: gameSpec.userColor,
        plies: pipelineResult.report.plies.length,
        preEvaluated: Boolean(gameSpec.expected?.expectPreEvaluatedFastPath),
        pass1Ms,
        pass2Ms,
        totalMs,
        pass1EngineCalls,
        pass2EngineCalls,
        whiteAccuracy: round1(pipelineResult.report.whiteAccuracy),
        blackAccuracy: round1(pipelineResult.report.blackAccuracy),
        puzzleCount: pipelineResult.puzzles.length,
        allCandidateCount: pipelineResult.allCandidatePuzzles.length,
        arrowDuelCount: audit.arrowDuelCount,
        lineCount: audit.lineCount,
        highlightCount: pipelineResult.highlights.length,
        momentKinds: pipelineResult.puzzles.map((puzzle) => puzzle.momentKind),
        highlightMomentKinds: pipelineResult.highlights.map((highlight) => highlight.momentKind),
        themes: [...new Set(pipelineResult.puzzles.flatMap((puzzle) => puzzle.themes))],
        invariantsPassed: audit.passed,
        failures: audit.failures
      });
    }

    // Corpus-level coverage invariants
    const allMomentKinds = gameResults.flatMap((game) => game.momentKinds);
    const allHighlightKinds = gameResults.flatMap((game) => game.highlightMomentKinds);
    const totalArrowDuel = gameResults.reduce((sum, game) => sum + game.arrowDuelCount, 0);
    const totalLine = gameResults.reduce((sum, game) => sum + game.lineCount, 0);
    const totalPuzzles = totalArrowDuel + totalLine;
    const totalHighlights = gameResults.reduce((sum, game) => sum + game.highlightCount, 0);
    const coveredTimeClasses = [...new Set(gameResults.map((game) => game.timeClass))];

    const corpusChecks = [
      {
        name: "time_classes_covered",
        passed: ["bullet", "blitz", "rapid", "classical"].every((tc) =>
          coveredTimeClasses.includes(tc)
        ),
        detail: `covered=[${coveredTimeClasses.join(", ")}]`
      },
      {
        name: "own_punished_generated",
        passed: allMomentKinds.some((kind) => OWN_PUNISHED_KINDS.has(kind)),
        detail: `count=${allMomentKinds.filter((kind) => OWN_PUNISHED_KINDS.has(kind)).length}`
      },
      {
        name: "own_escaped_generated",
        passed: allMomentKinds.some((kind) => OWN_ESCAPED_KINDS.has(kind)),
        detail: `count=${allMomentKinds.filter((kind) => OWN_ESCAPED_KINDS.has(kind)).length}`
      },
      {
        name: "opponent_missed_generated",
        passed: allMomentKinds.some((kind) => OPPONENT_MISSED_KINDS.has(kind)),
        detail: `count=${allMomentKinds.filter((kind) => OPPONENT_MISSED_KINDS.has(kind)).length}`
      },
      {
        name: "opponent_caught_highlight_only",
        passed:
          allHighlightKinds.some((kind) => OPPONENT_CAUGHT_KINDS.has(kind)) &&
          !allMomentKinds.some((kind) => OPPONENT_CAUGHT_KINDS.has(kind)),
        detail: `highlights=${allHighlightKinds.length}`
      },
      {
        name: "both_arrow_duel_and_line_generated",
        passed: totalArrowDuel > 0 && totalLine > 0,
        detail: `arrow_duel=${totalArrowDuel}, line=${totalLine}`
      }
    ];

    for (const check of corpusChecks) {
      if (!check.passed) {
        corpusFailures.push(`Corpus invariant "${check.name}" failed (${check.detail}).`);
      }
    }

    if (options.recordDeterministic && options.mode === "stockfish") {
      writeFileSync(options.corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
    }

    const nonPreEvalGames = gameResults.filter((game) => !game.preEvaluated);
    const pass1Samples = (nonPreEvalGames.length > 0 ? nonPreEvalGames : gameResults)
      .map((game) => game.pass1Ms)
      .sort((a, b) => a - b);
    const pass2Samples = gameResults
      .map((game) => game.pass2Ms)
      .sort((a, b) => a - b);

    const passedGames = gameResults.filter((game) => game.invariantsPassed).length;
    const passedCorpusChecks = corpusChecks.filter((check) => check.passed).length;

    return {
      mode: options.mode,
      corpusPath: options.corpusPath,
      corpusVersion: corpus.version ?? 1,
      gameCount: gameResults.length,
      ...(stockfishSetup
        ? {
            stockfish: {
              compileMs: stockfishSetup.compileMs,
              reusedBinary: stockfishSetup.reusedBinary,
              pass1Depth: options.pass1Depth,
              pass1Nodes: options.pass1Nodes,
              deepDepth: options.deepDepth,
              deepNodes: options.deepNodes
            }
          }
        : {}),
      summary: {
        medianPass1Ms: roundMs(median(pass1Samples)),
        maxPass1Ms: roundMs(pass1Samples.at(-1) ?? 0),
        medianPass2Ms: roundMs(median(pass2Samples)),
        maxPass2Ms: roundMs(pass2Samples.at(-1) ?? 0),
        totalPuzzles,
        yieldPerGame: round2(totalPuzzles / gameResults.length),
        arrowDuelCount: totalArrowDuel,
        lineCount: totalLine,
        arrowDuelShare: totalPuzzles > 0 ? round2(totalArrowDuel / totalPuzzles) : 0,
        lineShare: totalPuzzles > 0 ? round2(totalLine / totalPuzzles) : 0,
        totalHighlights,
        invariantsPassed: passedGames + passedCorpusChecks,
        invariantsTotal: gameResults.length + corpusChecks.length,
        invariantsFailed: corpusFailures.length,
        allPassed: corpusFailures.length === 0
      },
      corpusChecks,
      games: gameResults,
      failures: corpusFailures
    };
  } finally {
    if (arbiter) {
      arbiter.terminate();
    } else if (transport) {
      transport.terminate();
    }
    if (options.mode === "stockfish" && !options.keepBinary) {
      rmSync(STOCKFISH_BENCH_DIR, { recursive: true, force: true });
    }
  }
}

export function formatMarkdownReport(report) {
  const lines = [];
  lines.push(`# Game Review Quality & Performance Benchmark (${report.mode})`);
  lines.push("");
  lines.push(
    `| Game | Class | Plies | Pass-1 ms | Pass-2 ms | Puzzles | Duel / Line | Highlights | Status |`
  );
  lines.push(
    `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |`
  );
  for (const game of report.games) {
    lines.push(
      `| ${game.id} | ${game.timeClass} | ${game.plies} | ${game.pass1Ms.toFixed(1)} | ${game.pass2Ms.toFixed(1)} | ${game.puzzleCount} | ${game.arrowDuelCount} / ${game.lineCount} | ${game.highlightCount} | ${game.invariantsPassed ? "PASS" : "FAIL"} |`
    );
  }
  lines.push("");
  lines.push("## Summary");
  lines.push(
    `- **Pass-1 latency (non-pre-eval)**: median \`${report.summary.medianPass1Ms.toFixed(1)} ms\`, max \`${report.summary.maxPass1Ms.toFixed(1)} ms\``
  );
  lines.push(
    `- **Pass-2 latency**: median \`${report.summary.medianPass2Ms.toFixed(1)} ms\`, max \`${report.summary.maxPass2Ms.toFixed(1)} ms\``
  );
  lines.push(
    `- **Puzzle yield**: \`${report.summary.totalPuzzles}\` puzzles across \`${report.gameCount}\` games (\`${report.summary.yieldPerGame.toFixed(2)}\`/game), Arrow Duel \`${report.summary.arrowDuelCount}\` (${Math.round(report.summary.arrowDuelShare * 100)}%) vs Line \`${report.summary.lineCount}\` (${Math.round(report.summary.lineShare * 100)}%), Highlights \`${report.summary.totalHighlights}\``
  );
  lines.push(
    `- **Invariants**: \`${report.summary.invariantsPassed}/${report.summary.invariantsTotal}\` passed, \`${report.summary.invariantsFailed}\` failures`
  );
  if (report.stockfish) {
    lines.push(
      `- **Stockfish 18 NNUE**: compile \`${report.stockfish.compileMs.toFixed(1)} ms\` (reused=${report.stockfish.reusedBinary}), Pass-1 depth=${report.stockfish.pass1Depth}/nodes=${report.stockfish.pass1Nodes}, Pass-2 depth=${report.stockfish.deepDepth}/nodes=${report.stockfish.deepNodes}`
    );
  }
  if (report.failures.length > 0) {
    lines.push("");
    lines.push("## Failures");
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function median(sorted) {
  if (sorted.length === 0) {
    return 0;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);

if (isMain) {
  try {
    const options = parseBenchmarkArgs(process.argv.slice(2));
    const report = await runQualityBenchmark(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatMarkdownReport(report));
    }
    if (!report.summary.allPassed) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}
