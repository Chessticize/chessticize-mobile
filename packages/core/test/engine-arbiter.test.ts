import test from "node:test";
import assert from "node:assert/strict";
import type { EngineAnalysisLine, UciEngineTransport } from "../src/engine-analysis.ts";
import { parseStockfishInfoLine } from "../src/engine-analysis.ts";
import {
  buildUciGoCommand,
  EngineSearchAbortedError,
  UciEngineArbiter
} from "../src/engine-arbiter.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const XBQI8_PARENT_FEN = "8/8/2p1p3/1p2pkp1/1PP5/P3K1P1/6P1/8 b - - 0 1";
const XBQI8_CHILD_FEN = "8/8/2p1p3/1p3kp1/1PP1p3/P3K1P1/6P1/8 w - - 0 2";
const MATE_FEN = "8/8/8/8/8/8/2Q5/k1K5 w - - 0 1";

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

class ControlledUciTransport implements UciEngineTransport {
  readonly commands: string[] = [];
  startCount = 0;
  terminateCount = 0;
  startError: Error | null = null;
  sendErrorOnCommand: ((command: string) => Error | null) | null = null;
  private readonly listeners = new Set<(line: string) => void>();
  private peakListeners = 0;

  get listenerCount(): number {
    return this.listeners.size;
  }

  get maxListenerCount(): number {
    return this.peakListeners;
  }

  async start(): Promise<void> {
    this.startCount += 1;
    if (this.startError) {
      const error = this.startError;
      this.startError = null;
      throw error;
    }
  }

  send(command: string): void {
    this.commands.push(command);
    const error = this.sendErrorOnCommand?.(command) ?? null;
    if (error) {
      throw error;
    }
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    this.peakListeners = Math.max(this.peakListeners, this.listeners.size);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(line: string): void {
    for (const listener of [...this.listeners]) {
      listener(line);
    }
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

async function completeHandshake(transport: ControlledUciTransport): Promise<void> {
  await flushMicrotasks();
  transport.emit("uciok");
  await flushMicrotasks();
  transport.emit("readyok");
  await flushMicrotasks();
}

test("parseStockfishInfoLine parses optional nodes field", () => {
  const withNodes = parseStockfishInfoLine(
    "info depth 12 seldepth 16 multipv 1 score cp 45 nodes 123456 nps 500000 pv e2e4 e7e5",
    START_FEN
  );
  assert.ok(withNodes);
  assert.equal(withNodes.nodes, 123456);
  assert.deepEqual(withNodes.pv, ["e2e4", "e7e5"]);

  const withoutNodes = parseStockfishInfoLine(
    "info depth 10 multipv 1 score cp 30 pv d2d4",
    START_FEN
  );
  assert.ok(withoutNodes);
  assert.equal("nodes" in withoutNodes, false);
});

test("buildUciGoCommand formats depth, nodes, movetime, defaults, and trailing normalized searchmoves", () => {
  assert.equal(buildUciGoCommand({}), "go depth 20");
  assert.equal(buildUciGoCommand({ depth: 12 }), "go depth 12");
  assert.equal(buildUciGoCommand({ nodes: 150000 }), "go nodes 150000");
  assert.equal(buildUciGoCommand({ movetimeMs: 250 }), "go movetime 250");
  assert.equal(
    buildUciGoCommand({
      depth: 14,
      nodes: 200000,
      movetimeMs: 500,
      searchMoves: [" E2E4 ", "d2d4", "e2e4", ""]
    }),
    "go depth 14 nodes 200000 movetime 500 searchmoves e2e4 d2d4"
  );
});

test("runs UCI handshake once across searches and re-initializes cleanly after terminate()", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);

  const first = arbiter.analyze({ fen: START_FEN, depth: 10, multiPv: 2 });
  await flushMicrotasks();
  assert.deepEqual(transport.commands, ["uci"]);
  assert.equal(transport.listenerCount, 1);

  transport.emit("uciok");
  assert.deepEqual(transport.commands, ["uci", "isready"]);

  transport.emit("readyok");
  await flushMicrotasks();
  assert.deepEqual(transport.commands, [
    "uci",
    "isready",
    "setoption name MultiPV value 2",
    `position fen ${START_FEN}`,
    "go depth 10"
  ]);

  // readyok arriving during an active search must never complete the search.
  transport.emit("readyok");
  await flushMicrotasks();
  assert.equal(arbiter.isRunning, true);

  transport.emit("info depth 10 multipv 1 score cp 35 nodes 5000 pv e2e4 e7e5");
  transport.emit("bestmove e2e4");
  const firstLines = await first;
  assert.equal(firstLines[0]?.move, "e2e4");
  assert.equal(firstLines[0]?.nodes, 5000);

  // Second search does not repeat uci/isready or MultiPV when unchanged.
  const secondOffset = transport.commands.length;
  const second = arbiter.analyze({ fen: MATE_FEN, depth: 8, multiPv: 2 });
  await flushMicrotasks();
  assert.deepEqual(transport.commands.slice(secondOffset), [
    `position fen ${MATE_FEN}`,
    "go depth 8"
  ]);
  transport.emit("info depth 8 multipv 1 score mate 1 nodes 200 pv c2b1");
  transport.emit("bestmove c2b1");
  const secondLines = await second;
  assert.equal(secondLines[0]?.move, "c2b1");

  // Terminate and verify clean re-initialization (including MultiPV reset).
  arbiter.terminate();
  assert.equal(transport.terminateCount, 1);
  assert.equal(transport.listenerCount, 0);

  const thirdOffset = transport.commands.length;
  const third = arbiter.analyze({ fen: START_FEN, depth: 6, multiPv: 2 });
  await completeHandshake(transport);
  assert.equal(transport.startCount, 2);
  assert.deepEqual(transport.commands.slice(thirdOffset), [
    "uci",
    "isready",
    "setoption name MultiPV value 2",
    `position fen ${START_FEN}`,
    "go depth 6"
  ]);
  transport.emit("info depth 6 multipv 1 score cp 20 nodes 1000 pv d2d4");
  transport.emit("bestmove d2d4");
  const thirdLines = await third;
  assert.equal(thirdLines[0]?.move, "d2d4");
});

test("rapid interactive replacements A -> B -> C wait for A bestmove, drop late A info, and only start C", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);
  const updatesA: EngineAnalysisLine[][] = [];
  const updatesB: EngineAnalysisLine[][] = [];
  const updatesC: EngineAnalysisLine[][] = [];

  const searchA = arbiter.analyze({
    fen: XBQI8_PARENT_FEN,
    depth: 20,
    multiPv: 3,
    onUpdate: (lines) => updatesA.push(lines)
  });
  await completeHandshake(transport);
  const genA = arbiter.activeGeneration;
  assert.equal(genA, 1);

  transport.emit("info depth 8 multipv 1 score cp 90 nodes 10000 pv e5e4");
  assert.equal(updatesA.length, 1);

  const commandsBeforeB = transport.commands.length;
  const searchB = arbiter.analyze({
    fen: XBQI8_CHILD_FEN,
    depth: 20,
    multiPv: 3,
    onUpdate: (lines) => updatesB.push(lines)
  });
  const searchC = arbiter.analyze({
    fen: MATE_FEN,
    depth: 12,
    multiPv: 3,
    onUpdate: (lines) => updatesC.push(lines)
  });

  // Only a single stop is sent while A is still active; neither B nor C starts yet.
  assert.deepEqual(transport.commands.slice(commandsBeforeB), ["stop"]);

  // A and B reject cleanly as superseded.
  await assert.rejects(searchA, (err: unknown) => {
    assert.ok(err instanceof EngineSearchAbortedError);
    assert.equal(err.reason, "superseded");
    return true;
  });
  await assert.rejects(searchB, (err: unknown) => {
    assert.ok(err instanceof EngineSearchAbortedError);
    assert.equal(err.reason, "superseded");
    return true;
  });

  // readyok and late A info must be ignored while waiting for A's bestmove.
  transport.emit("readyok");
  transport.emit("info depth 9 multipv 1 score cp 110 nodes 20000 pv e5e4");
  await flushMicrotasks();
  assert.equal(updatesA.length, 1);
  assert.equal(updatesB.length, 0);
  assert.equal(updatesC.length, 0);
  assert.deepEqual(transport.commands.slice(commandsBeforeB), ["stop"]);

  // Once A emits bestmove, ONLY C starts (B was superseded before starting).
  transport.emit("bestmove e5e4");
  await flushMicrotasks();
  assert.equal(arbiter.activeGeneration, 2);
  assert.deepEqual(transport.commands.slice(commandsBeforeB), [
    "stop",
    `position fen ${MATE_FEN}`,
    "go depth 12"
  ]);

  transport.emit("info depth 12 multipv 1 score mate 1 nodes 400 pv c2b1");
  transport.emit("bestmove c2b1");
  const linesC = await searchC;
  assert.equal(updatesB.length, 0);
  assert.equal(updatesC.length, 1);
  assert.equal(linesC[0]?.move, "c2b1");
  assert.equal(linesC[0]?.score.kind, "mate");
});

test("interactive request preempts active batch search and resumes batch at front after interactive completes", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);
  const batch1Updates: EngineAnalysisLine[][] = [];
  const interactiveUpdates: EngineAnalysisLine[][] = [];

  const batch1 = arbiter.analyze({
    fen: START_FEN,
    nodes: 50000,
    multiPv: 1,
    priority: "batch",
    onUpdate: (lines) => batch1Updates.push(lines)
  });
  const batch2 = arbiter.analyze({
    fen: XBQI8_PARENT_FEN,
    nodes: 50000,
    multiPv: 1,
    priority: "batch"
  });

  await completeHandshake(transport);
  assert.equal(arbiter.activeGeneration, 1);
  assert.deepEqual(transport.commands, [
    "uci",
    "isready",
    "setoption name MultiPV value 1",
    `position fen ${START_FEN}`,
    "go nodes 50000"
  ]);

  // Batch 1 emits partial info before being preempted.
  transport.emit("info depth 6 multipv 1 score cp 15 nodes 4000 pv e2e4");
  assert.equal(batch1Updates.length, 1);

  const offsetBeforePreempt = transport.commands.length;
  const interactive = arbiter.analyze({
    fen: MATE_FEN,
    depth: 10,
    multiPv: 3,
    priority: "interactive",
    onUpdate: (lines) => interactiveUpdates.push(lines)
  });

  // Preemption sends stop once and waits for batch 1's bestmove.
  assert.deepEqual(transport.commands.slice(offsetBeforePreempt), ["stop"]);

  // Late info from preempted batch 1 is dropped.
  transport.emit("info depth 7 multipv 1 score cp 20 nodes 6000 pv e2e4");
  assert.equal(batch1Updates.length, 1);
  assert.equal(interactiveUpdates.length, 0);

  // Batch 1 finishes stopping -> interactive starts with MultiPV 3.
  transport.emit("bestmove e2e4");
  await flushMicrotasks();
  assert.equal(arbiter.activeGeneration, 2);
  assert.deepEqual(transport.commands.slice(offsetBeforePreempt), [
    "stop",
    "setoption name MultiPV value 3",
    `position fen ${MATE_FEN}`,
    "go depth 10"
  ]);

  // Interactive finishes -> preempted batch 1 resumes AT THE FRONT (ahead of batch 2) with MultiPV 1.
  const offsetBeforeResume = transport.commands.length;
  transport.emit("info depth 10 multipv 1 score mate 1 nodes 300 pv c2b1");
  transport.emit("bestmove c2b1");
  const interactiveLines = await interactive;
  assert.equal(interactiveLines[0]?.move, "c2b1");

  await flushMicrotasks();
  assert.equal(arbiter.activeGeneration, 3);
  assert.deepEqual(transport.commands.slice(offsetBeforeResume), [
    "setoption name MultiPV value 1",
    `position fen ${START_FEN}`,
    "go nodes 50000"
  ]);

  // Batch 1 completes cleanly -> batch 2 runs next without re-sending MultiPV.
  const offsetBeforeBatch2 = transport.commands.length;
  transport.emit("info depth 12 multipv 1 score cp 32 nodes 50000 pv d2d4 d7d5");
  transport.emit("bestmove d2d4");
  const batch1Lines = await batch1;
  assert.equal(batch1Lines[0]?.move, "d2d4");
  assert.equal(batch1Lines[0]?.nodes, 50000);

  await flushMicrotasks();
  assert.equal(arbiter.activeGeneration, 4);
  assert.deepEqual(transport.commands.slice(offsetBeforeBatch2), [
    `position fen ${XBQI8_PARENT_FEN}`,
    "go nodes 50000"
  ]);

  transport.emit("info depth 12 multipv 1 score cp 80 nodes 50000 pv e5e4");
  transport.emit("bestmove e5e4");
  const batch2Lines = await batch2;
  assert.equal(batch2Lines[0]?.move, "e5e4");
});

test("supports searchMoves, nodes, movetimeMs, multiPv diffing, and newGame TT reuse", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);

  // First search: newGame: true, multiPv: 1, searchMoves + depth + nodes
  const p1 = arbiter.analyze({
    fen: START_FEN,
    depth: 10,
    nodes: 25000,
    multiPv: 1,
    searchMoves: ["A2A3", "h2h3"],
    newGame: true,
    priority: "batch"
  });
  await completeHandshake(transport);
  assert.deepEqual(transport.commands, [
    "uci",
    "isready",
    "setoption name MultiPV value 1",
    "ucinewgame",
    `position fen ${START_FEN}`,
    "go depth 10 nodes 25000 searchmoves a2a3 h2h3"
  ]);
  transport.emit("info depth 10 multipv 1 score cp -20 nodes 25000 pv a2a3 e7e5");
  transport.emit("bestmove a2a3");
  const lines1 = await p1;
  assert.equal(lines1[0]?.move, "a2a3");
  assert.equal(lines1[0]?.nodes, 25000);

  // Second search: newGame: false (TT reuse), same multiPv: 1 (no setoption), movetimeMs
  const offset2 = transport.commands.length;
  const p2 = arbiter.analyze({
    fen: XBQI8_CHILD_FEN,
    movetimeMs: 120,
    multiPv: 1,
    newGame: false,
    priority: "batch"
  });
  await flushMicrotasks();
  assert.deepEqual(transport.commands.slice(offset2), [
    `position fen ${XBQI8_CHILD_FEN}`,
    "go movetime 120"
  ]);
  transport.emit("info depth 14 multipv 1 score cp -150 nodes 120000 pv c4b5");
  transport.emit("bestmove c4b5");
  const lines2 = await p2;
  assert.equal(lines2[0]?.move, "c4b5");

  // Third search: multiPv changes 1 -> 3 (emits setoption), newGame omitted (no ucinewgame)
  const offset3 = transport.commands.length;
  const p3 = arbiter.analyze({
    fen: MATE_FEN,
    depth: 8,
    multiPv: 3
  });
  await flushMicrotasks();
  assert.deepEqual(transport.commands.slice(offset3), [
    "setoption name MultiPV value 3",
    `position fen ${MATE_FEN}`,
    "go depth 8"
  ]);
  transport.emit("info depth 8 multipv 1 score mate 1 nodes 500 pv c2b1");
  transport.emit("bestmove c2b1");
  await p3;
});

test("handles AbortSignal before enqueue, while queued, while active, and while preempted", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);

  // 1. Already-aborted signal rejects immediately without touching transport.
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(
    arbiter.analyze({ fen: START_FEN, depth: 8, signal: preAborted.signal }),
    (err: unknown) => err instanceof EngineSearchAbortedError && err.reason === "aborted"
  );
  assert.equal(transport.startCount, 0);

  // 2. Active batch + queued batch where queued batch aborts before starting.
  const activeBatchCtrl = new AbortController();
  const queuedBatchCtrl = new AbortController();
  const activeBatch = arbiter.analyze({
    fen: START_FEN,
    depth: 12,
    priority: "batch",
    signal: activeBatchCtrl.signal
  });
  const queuedBatch = arbiter.analyze({
    fen: XBQI8_PARENT_FEN,
    depth: 12,
    priority: "batch",
    signal: queuedBatchCtrl.signal
  });
  await completeHandshake(transport);

  queuedBatchCtrl.abort();
  await assert.rejects(
    queuedBatch,
    (err: unknown) => err instanceof EngineSearchAbortedError && err.reason === "aborted"
  );

  // 3. Preempt active batch with interactive, then abort the preempted batch before bestmove:
  //    batch must NOT re-queue when bestmove arrives!
  const interactive = arbiter.analyze({
    fen: MATE_FEN,
    depth: 8,
    priority: "interactive"
  });
  activeBatchCtrl.abort();
  await assert.rejects(
    activeBatch,
    (err: unknown) => err instanceof EngineSearchAbortedError && err.reason === "aborted"
  );

  const offset = transport.commands.length;
  transport.emit("bestmove e2e4");
  await flushMicrotasks();
  assert.deepEqual(transport.commands.slice(offset), [
    `position fen ${MATE_FEN}`,
    "go depth 8"
  ]);

  transport.emit("info depth 8 multipv 1 score mate 1 pv c2b1");
  transport.emit("bestmove c2b1");
  const interactiveLines = await interactive;
  assert.equal(interactiveLines[0]?.move, "c2b1");

  // Nothing left in queue after interactive completes.
  await flushMicrotasks();
  assert.equal(arbiter.isRunning, false);

  // 4. Aborting an active search sends stop and waits for bestmove before starting next work.
  const activeCtrl = new AbortController();
  const run1 = arbiter.analyze({ fen: START_FEN, depth: 16, signal: activeCtrl.signal });
  await flushMicrotasks();
  const offsetAbort = transport.commands.length;
  activeCtrl.abort();
  await assert.rejects(
    run1,
    (err: unknown) => err instanceof EngineSearchAbortedError && err.reason === "aborted"
  );
  assert.deepEqual(transport.commands.slice(offsetAbort), ["stop"]);

  const run2 = arbiter.analyze({ fen: MATE_FEN, depth: 6 });
  await flushMicrotasks();
  // Still waiting for run1's bestmove.
  assert.deepEqual(transport.commands.slice(offsetAbort), ["stop"]);

  transport.emit("bestmove e2e4");
  await flushMicrotasks();
  assert.deepEqual(transport.commands.slice(offsetAbort), [
    "stop",
    `position fen ${MATE_FEN}`,
    "go depth 6"
  ]);
  transport.emit("info depth 6 multipv 1 score mate 1 pv c2b1");
  transport.emit("bestmove c2b1");
  assert.equal((await run2)[0]?.move, "c2b1");
});

test("pause() stops active search, waits for bestmove, holds batch items, and resume() continues", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);

  const batch1 = arbiter.analyze({ fen: START_FEN, nodes: 40000, priority: "batch" });
  const batch2 = arbiter.analyze({ fen: MATE_FEN, nodes: 40000, priority: "batch" });
  await completeHandshake(transport);

  const offsetPause = transport.commands.length;
  let pauseResolved = false;
  const pausePromise = arbiter.pause().then(() => {
    pauseResolved = true;
  });

  assert.equal(arbiter.isPaused, true);
  assert.deepEqual(transport.commands.slice(offsetPause), ["stop"]);
  await flushMicrotasks();
  assert.equal(pauseResolved, false);

  // bestmove arrives -> pause() resolves, batch 1 is held (not restarted while paused).
  transport.emit("bestmove e2e4");
  await pausePromise;
  assert.equal(pauseResolved, true);
  await flushMicrotasks();
  assert.equal(arbiter.isRunning, false);
  assert.deepEqual(transport.commands.slice(offsetPause), ["stop"]);

  // Enqueuing more batch work while paused still holds everything.
  const batch3 = arbiter.analyze({ fen: XBQI8_PARENT_FEN, nodes: 40000, priority: "batch" });
  await flushMicrotasks();
  assert.equal(arbiter.isRunning, false);

  // resume() restarts batch 1 first (FIFO preserved with paused item at front).
  const offsetResume = transport.commands.length;
  arbiter.resume();
  await flushMicrotasks();
  assert.equal(arbiter.isPaused, false);
  assert.deepEqual(transport.commands.slice(offsetResume), [
    `position fen ${START_FEN}`,
    "go nodes 40000"
  ]);

  transport.emit("info depth 10 multipv 1 score cp 25 nodes 40000 pv e2e4");
  transport.emit("bestmove e2e4");
  assert.equal((await batch1)[0]?.move, "e2e4");

  await flushMicrotasks();
  transport.emit("info depth 10 multipv 1 score mate 1 nodes 500 pv c2b1");
  transport.emit("bestmove c2b1");
  assert.equal((await batch2)[0]?.move, "c2b1");

  await flushMicrotasks();
  transport.emit("info depth 10 multipv 1 score cp 70 nodes 40000 pv e5e4");
  transport.emit("bestmove e5e4");
  assert.equal((await batch3)[0]?.move, "e5e4");
});

test("cancelAll() rejects active and queued searches and waits for active bestmove", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);

  const b1 = arbiter.analyze({ fen: START_FEN, depth: 16, priority: "batch" });
  const b2 = arbiter.analyze({ fen: MATE_FEN, depth: 16, priority: "batch" });
  await completeHandshake(transport);

  const offset = transport.commands.length;
  let cancelDone = false;
  const cancelPromise = arbiter.cancelAll().then(() => {
    cancelDone = true;
  });

  await assert.rejects(
    b1,
    (err: unknown) => err instanceof EngineSearchAbortedError && err.reason === "cancelled"
  );
  await assert.rejects(
    b2,
    (err: unknown) => err instanceof EngineSearchAbortedError && err.reason === "cancelled"
  );
  assert.deepEqual(transport.commands.slice(offset), ["stop"]);
  assert.equal(cancelDone, false);

  transport.emit("bestmove e2e4");
  await cancelPromise;
  assert.equal(cancelDone, true);
  assert.equal(arbiter.isRunning, false);
});

test("timeoutMs stops active search, resolves with collected lines on bestmove, and advances queue", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);

  const p1 = arbiter.analyze({ fen: START_FEN, depth: 20, timeoutMs: 25, priority: "batch" });
  const p2 = arbiter.analyze({ fen: MATE_FEN, depth: 8, priority: "batch" });
  await completeHandshake(transport);

  transport.emit("info depth 9 multipv 1 score cp 44 nodes 12000 pv e2e4 e7e5");

  const offsetBeforeTimeout = transport.commands.length;
  await new Promise((resolve) => setTimeout(resolve, 45));

  // Timeout sends stop and waits for bestmove before starting p2.
  assert.deepEqual(transport.commands.slice(offsetBeforeTimeout), ["stop"]);

  // Late info after timeout stop is ignored.
  transport.emit("info depth 10 multipv 1 score cp 999 nodes 15000 pv d2d4");

  transport.emit("bestmove e2e4");
  const lines1 = await p1;
  assert.equal(lines1.length, 1);
  assert.equal(lines1[0]?.move, "e2e4");
  assert.equal(lines1[0]?.depth, 9);

  await flushMicrotasks();
  assert.deepEqual(transport.commands.slice(offsetBeforeTimeout), [
    "stop",
    `position fen ${MATE_FEN}`,
    "go depth 8"
  ]);
  transport.emit("info depth 8 multipv 1 score mate 1 pv c2b1");
  transport.emit("bestmove c2b1");
  assert.equal((await p2)[0]?.move, "c2b1");
});

test("recovers cleanly from transport.start() and transport.send() errors without wedging", async () => {
  const transport = new ControlledUciTransport();
  const arbiter = new UciEngineArbiter(transport);

  // 1. start() fails on first attempt; second analyze() retries and succeeds.
  transport.startError = new Error("native start failed");
  await assert.rejects(
    arbiter.analyze({ fen: START_FEN, depth: 8 }),
    /native start failed/
  );
  assert.equal(transport.listenerCount, 0);

  const p2 = arbiter.analyze({ fen: START_FEN, depth: 8 });
  await completeHandshake(transport);
  transport.emit("info depth 8 multipv 1 score cp 30 pv e2e4");
  transport.emit("bestmove e2e4");
  assert.equal((await p2)[0]?.move, "e2e4");

  // 2. Transient send() failure on one queued search rejects that search and continues to next.
  let failOnce = true;
  transport.sendErrorOnCommand = (cmd) => {
    if (failOnce && cmd.startsWith("go ")) {
      failOnce = false;
      return new Error("transient bridge write error");
    }
    return null;
  };

  const failing = arbiter.analyze({ fen: XBQI8_PARENT_FEN, depth: 8, priority: "batch" });
  const recovering = arbiter.analyze({ fen: MATE_FEN, depth: 8, priority: "batch" });

  await assert.rejects(failing, /transient bridge write error/);
  await flushMicrotasks();
  assert.equal(arbiter.isRunning, true);

  transport.emit("info depth 8 multipv 1 score mate 1 pv c2b1");
  transport.emit("bestmove c2b1");
  assert.equal((await recovering)[0]?.move, "c2b1");
  assert.equal(transport.maxListenerCount, 1);
});
