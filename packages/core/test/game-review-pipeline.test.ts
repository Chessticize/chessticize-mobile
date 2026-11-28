import assert from "node:assert/strict";
import test from "node:test";
import {
  UciEngineArbiter,
  importPgnBatch,
  runFullGameReviewPipeline,
  type UciEngineTransport
} from "../src/index.ts";

class ScriptedUciTransport implements UciEngineTransport {
  private listeners = new Set<(line: string) => void>();
  private currentFen = "";
  private readonly responder: (fen: string, goCommand: string) => string[];

  constructor(responder: (fen: string, goCommand: string) => string[]) {
    this.responder = responder;
  }

  async start(): Promise<void> {}

  send(command: string): void {
    const trimmed = command.trim();
    if (trimmed === "uci") {
      queueMicrotask(() => this.emit("uciok"));
      return;
    }
    if (trimmed === "isready") {
      queueMicrotask(() => this.emit("readyok"));
      return;
    }
    if (trimmed.startsWith("position fen ")) {
      this.currentFen = trimmed.slice("position fen ".length);
      return;
    }
    if (trimmed.startsWith("go ")) {
      const fen = this.currentFen;
      queueMicrotask(() => {
        const lines = this.responder(fen, trimmed);
        for (const line of lines) {
          this.emit(line);
        }
      });
    }
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate(): void {
    this.listeners.clear();
  }

  private emit(line: string): void {
    for (const listener of [...this.listeners]) {
      listener(line);
    }
  }
}

test("Wave 1 end-to-end pipeline: importPgnBatch -> UciEngineArbiter -> Pass-1 -> Puzzle Extraction", async () => {
  // Fool's mate variant where White blunders 2. g4?? allowing 2...Qh4#
  const pgn = [
    '[Event "Live Chess"]',
    '[Site "https://www.chess.com/game/live/123456789"]',
    '[White "HeroUser"]',
    '[Black "VillainUser"]',
    '[Result "0-1"]',
    '[TimeControl "300+0"]',
    '[ECO "A00"]',
    "",
    "1. f3 {[%clk 0:04:58]} e5 {[%clk 0:04:57]} 2. g4 {[%clk 0:04:50]} Qh4# {[%clk 0:04:48]} 0-1"
  ].join("\n");

  const imported = importPgnBatch(pgn, { preferredUsernames: ["herouser"] });
  assert.equal(imported.games.length, 1);
  const game = imported.games[0]!;
  assert.equal(game.userColor, "w");
  assert.equal(game.id, "https://www.chess.com/game/live/123456789");

  const transport = new ScriptedUciTransport((fen, goCmd) => {
    // Position before White's 2. g4?? blunder
    if (fen.startsWith("rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w")) {
      if (goCmd.includes("searchmoves g2g4")) {
        return [
          "info depth 18 multipv 1 score mate -1 nodes 10000 pv g2g4 d8h4",
          "bestmove g2g4"
        ];
      }
      return [
        "info depth 18 multipv 1 score cp 10 nodes 12000 pv e2e4 b8c6",
        "info depth 18 multipv 2 score cp -5 nodes 12000 pv d2d4 e5d4",
        "bestmove e2e4"
      ];
    }
    // Position right after 2. g4?? (Black to mate with Qh4#)
    if (fen.startsWith("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b")) {
      return [
        "info depth 18 multipv 1 score mate 1 nodes 8000 pv d8h4",
        "info depth 18 multipv 2 score cp 100 nodes 8000 pv b8c6",
        "bestmove d8h4"
      ];
    }
    // Starting / ply 1 positions: roughly equal
    return [
      "info depth 12 multipv 1 score cp 0 nodes 5000 pv e2e4 e7e5",
      "bestmove e2e4"
    ];
  });

  const arbiter = new UciEngineArbiter(transport);
  let pass1Seen = false;
  const result = await runFullGameReviewPipeline({
    gameId: game.id,
    pgn: game.pgn,
    userColor: game.userColor,
    engine: arbiter,
    onPass1Complete: (report) => {
      pass1Seen = report.isComplete;
    }
  });
  arbiter.terminate();

  assert.equal(pass1Seen, true);
  assert.equal(result.report.isComplete, true);
  assert.equal(result.report.plies.length, 4);
  assert.equal(result.report.plies[2]?.uci, "g2g4");
  assert.equal(result.report.plies[2]?.classification, "blunder");
  assert.equal(result.puzzles.length, 1);

  const puzzle = result.puzzles[0]!;
  assert.equal(puzzle.puzzleKind, "arrow_duel");
  assert.equal(puzzle.momentKind, "own_mistake_punished");
  assert.equal(puzzle.arrowDuel?.bestMove, "e2e4");
  assert.equal(puzzle.arrowDuel?.blunderMove, "g2g4");
  assert.deepEqual(puzzle.arrowDuel?.punishmentLine, ["d8h4"]);
  assert.ok(puzzle.themes.includes("mateIn1"));
});
