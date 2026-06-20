import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("CLI drives a multi-step sprint and exposes machine-readable history", async (t) => {
  const cli = await startCli(t);

  const start = await cli.command({
    command: "startSprint",
    mode: "standard",
    durationSeconds: 300,
    perPuzzleSeconds: 20,
    targetCorrect: 1,
    maxMistakes: 3,
    theme: "hangingPiece",
    now: "2026-06-20T00:00:00.000Z"
  });
  assert.equal(start.ok, true);
  assert.equal(start.state.currentPuzzle.puzzleId, "00008");
  assert.deepEqual(start.state.currentPuzzle.playedMoves, ["f2g3"]);

  let response = await cli.command({ command: "move", move: "e6e7", now: "2026-06-20T00:00:05.000Z" });
  assert.equal(response.feedback.result, "correct");
  assert.equal(response.feedback.puzzleSolved, false);
  assert.deepEqual(response.feedback.autoPlayedMoves, ["b2b1"]);
  assert.equal(response.state.status, "active");

  response = await cli.command({ command: "move", move: "b3c1", now: "2026-06-20T00:00:10.000Z" });
  assert.equal(response.feedback.result, "correct");
  assert.equal(response.state.status, "active");

  response = await cli.command({ command: "move", move: "h6c1", now: "2026-06-20T00:00:15.000Z" });
  assert.equal(response.state.status, "won");
  assert.equal(response.feedback.puzzleSolved, true);
  assert.ok(response.state.ratingAfter > 600);

  const history = await cli.command({
    command: "history",
    result: "correct",
    since: "2026-01-01T00:00:00.000Z"
  });
  assert.equal(history.history.length, 1);
  assert.equal(history.history[0].puzzleId, "00008");

  await cli.stop();
});

test("CLI supports Arrow Duel wrong-choice review arrows and review scheduling", async (t) => {
  const cli = await startCli(t);

  const start = await cli.command({
    command: "startSprint",
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    targetCorrect: 1,
    maxMistakes: 3,
    minRating: 1700,
    maxRating: 1800,
    now: "2026-06-20T00:00:00.000Z"
  });
  assert.equal(start.state.currentPuzzle.kind, "arrow_duel");
  assert.equal(start.state.currentPuzzle.puzzleId, "00008");

  const response = await cli.command({
    command: "chooseArrow",
    move: "f2g3",
    now: "2026-06-20T00:00:05.000Z"
  });
  assert.equal(response.feedback.result, "wrong");
  assert.deepEqual(response.feedback.review.punishmentLine, ["f2g3", "e6e7"]);
  assert.deepEqual(response.feedback.review.arrows, [
    { move: "b2b1", role: "correct", color: "green", selected: false },
    { move: "f2g3", role: "wrong", color: "red", selected: true }
  ]);

  const history = await cli.command({ command: "history", result: "wrong" });
  assert.equal(history.history.length, 1);
  assert.equal(history.history[0].puzzleId, "00008");

  const reviews = await cli.command({ command: "dueReviews", now: "2026-06-22T00:00:00.000Z" });
  assert.equal(reviews.dueReviews.length, 1);
  assert.equal(reviews.dueReviews[0].puzzleId, "00008");

  await cli.stop();
});

test("CLI reports command errors without recording invalid Arrow Duel attempts", async (t) => {
  const cli = await startCli(t);

  await cli.command({
    command: "startSprint",
    mode: "arrow_duel",
    durationSeconds: 300,
    perPuzzleSeconds: 30,
    targetCorrect: 1,
    maxMistakes: 3,
    minRating: 1700,
    maxRating: 1800,
    now: "2026-06-20T00:00:00.000Z"
  });

  const invalid = await cli.command({
    command: "chooseArrow",
    move: "a1a8",
    now: "2026-06-20T00:00:05.000Z"
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.type, "error");

  const history = await cli.command({ command: "history" });
  assert.equal(history.history.length, 0);

  await cli.stop();
});

async function startCli(t: { after: (fn: () => void) => void }): Promise<CliHandle> {
  const dir = await mkdtemp(join(tmpdir(), "chessticize-cli-"));
  const dbPath = join(dir, "user.sqlite");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "apps/cli/src/main.ts", "--db", dbPath],
    {
      cwd: resolve("."),
      stdio: ["pipe", "pipe", "pipe"]
    }
  );

  const handle = new CliHandle(child);
  t.after(() => {
    child.kill();
  });
  const ready = await handle.nextJson();
  assert.equal(ready.type, "ready");
  return handle;
}

class CliHandle {
  private readonly child: ReturnType<typeof spawn>;
  private readonly pending: Array<(value: unknown) => void> = [];
  private readonly lines: unknown[] = [];
  private buffer = "";
  private stderr = "";

  constructor(child: ReturnType<typeof spawn>) {
    this.child = child;
    const stdout = child.stdout;
    const stderr = child.stderr;
    const stdin = child.stdin;
    if (!stdout || !stderr || !stdin) {
      throw new Error("CLI stdio pipes were not created");
    }

    stdout.setEncoding("utf8");
    stderr.setEncoding("utf8");
    stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let newlineIndex = this.buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (line.trim().length > 0) {
          this.push(JSON.parse(line));
        }
        newlineIndex = this.buffer.indexOf("\n");
      }
    });
    stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    child.on("exit", (code) => {
      if (code && this.pending.length > 0) {
        const error = new Error(`CLI exited with ${code}: ${this.stderr}`);
        while (this.pending.length > 0) {
          const resolvePending = this.pending.shift();
          resolvePending?.(Promise.reject(error));
        }
      }
    });
  }

  async command(payload: unknown): Promise<any> {
    this.write(payload);
    return this.nextJson();
  }

  async nextJson(): Promise<any> {
    if (this.lines.length > 0) {
      return this.lines.shift();
    }
    return new Promise((resolve) => {
      this.pending.push(resolve);
    });
  }

  async stop(): Promise<void> {
    this.write({ command: "exit" });
    await this.nextJson();
    this.child.stdin?.end();
  }

  private push(value: unknown): void {
    const resolvePending = this.pending.shift();
    if (resolvePending) {
      resolvePending(value);
      return;
    }
    this.lines.push(value);
  }

  private write(payload: unknown): void {
    if (!this.child.stdin) {
      throw new Error("CLI stdin is closed");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}
