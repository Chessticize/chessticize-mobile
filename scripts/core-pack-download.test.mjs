import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { backoffDelayMs, downloadVerified, retryOptionsFromEnv } from "./core-pack-download.mjs";

const payload = Buffer.from("core-pack-test-payload");
const expectedHash = createHash("sha256").update(payload).digest("hex");

function setup(t, responses) {
  const dir = mkdtempSync(path.join(tmpdir(), "core-pack-download-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const sleeps = [];
  const logs = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next();
  };
  const destPath = path.join(dir, "pack.sqlite");
  const run = (overrides = {}) =>
    downloadVerified({
      url: "https://example.test/pack",
      destPath,
      expectedBytes: payload.length,
      expectedHash,
      fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0.5,
      log: (line) => logs.push(line),
      attempts: 6,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      idleTimeoutMs: 0,
      ...overrides
    });
  return { run, calls, sleeps, logs, destPath };
}

const ok = (body = payload) => () => new Response(body, { status: 200 });
const status = (code) => () => new Response("nope", { status: code, statusText: "err" });

test("succeeds after transient 504 responses and logs each retry", async (t) => {
  const f = setup(t, [status(504), status(504), ok()]);
  const result = await f.run();
  assert.equal(result.attempts, 3);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.sleeps, [100, 200]);
  assert.equal(f.logs.length, 2);
  assert.match(f.logs[0], /attempt 1\/6.*HTTP 504/);
  assert.deepEqual(readFileSync(f.destPath), payload);
});

test("retries 429 and network errors", async (t) => {
  const f = setup(t, [status(429), new TypeError("fetch failed"), ok()]);
  assert.equal((await f.run()).attempts, 3);
});

test("gives up after the maximum attempts with a clear message", async (t) => {
  const f = setup(t, [status(503)]);
  await assert.rejects(f.run({ attempts: 4 }), /failed after 4 attempt\(s\): HTTP 503/);
  assert.equal(f.calls.length, 4);
  assert.equal(f.sleeps.length, 3);
  assert.equal(existsSync(f.destPath), false);
  assert.equal(existsSync(`${f.destPath}.download`), false);
});

test("does not retry a 404", async (t) => {
  const f = setup(t, [status(404), ok()]);
  await assert.rejects(f.run(), /HTTP 404/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.sleeps.length, 0);
});

test("does not retry a hash mismatch and keeps nothing on disk", async (t) => {
  const f = setup(t, [ok(Buffer.from("core-pack-test-PAYLOAD")), ok()]);
  await assert.rejects(f.run(), /Downloaded artifact mismatch/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.sleeps.length, 0);
  assert.equal(existsSync(f.destPath), false);
  assert.equal(existsSync(`${f.destPath}.download`), false);
});

test("retries when a transfer stalls past the idle timeout", async (t) => {
  let calls = 0;
  const dir = mkdtempSync(path.join(tmpdir(), "core-pack-download-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fetchImpl = (_url, { signal }) => {
    calls += 1;
    if (calls > 1) return Promise.resolve(new Response(payload, { status: 200 }));
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  };
  const result = await downloadVerified({
    url: "https://example.test/pack",
    destPath: path.join(dir, "pack.sqlite"),
    expectedBytes: payload.length,
    expectedHash,
    fetchImpl,
    sleep: async () => {},
    log: () => {},
    idleTimeoutMs: 20
  });
  assert.equal(result.attempts, 2);
});

test("backoff doubles, caps and applies jitter; env overrides parse", () => {
  const opts = { baseDelayMs: 100, maxDelayMs: 500 };
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, opts, () => 0.5)), [100, 200, 400, 500, 500]);
  assert.equal(backoffDelayMs(1, opts, () => 0), 75);
  assert.equal(backoffDelayMs(1, opts, () => 1), 125);
  const parsed = retryOptionsFromEnv({ CORE_PACK_FETCH_ATTEMPTS: "2", CORE_PACK_FETCH_BASE_DELAY_MS: "5", CORE_PACK_FETCH_MAX_DELAY_MS: "bad" });
  assert.equal(parsed.attempts, 2);
  assert.equal(parsed.baseDelayMs, 5);
  assert.equal(parsed.maxDelayMs, 80_000);
});
