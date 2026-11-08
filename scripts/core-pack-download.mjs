import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Defaults give 6 attempts with waits of ~10s, 20s, 40s, 80s, 80s (about 4 minutes).
export const DEFAULT_RETRY_OPTIONS = {
  attempts: 6,
  baseDelayMs: 10_000,
  maxDelayMs: 80_000,
  idleTimeoutMs: 60_000
};

export class NonRetryableDownloadError extends Error {}

export function retryOptionsFromEnv(env = process.env) {
  const read = (name, fallback) => {
    const value = Number(env[name]);
    return env[name] !== undefined && env[name] !== "" && Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    attempts: Math.max(1, Math.floor(read("CORE_PACK_FETCH_ATTEMPTS", DEFAULT_RETRY_OPTIONS.attempts))),
    baseDelayMs: read("CORE_PACK_FETCH_BASE_DELAY_MS", DEFAULT_RETRY_OPTIONS.baseDelayMs),
    maxDelayMs: read("CORE_PACK_FETCH_MAX_DELAY_MS", DEFAULT_RETRY_OPTIONS.maxDelayMs),
    idleTimeoutMs: read("CORE_PACK_FETCH_IDLE_TIMEOUT_MS", DEFAULT_RETRY_OPTIONS.idleTimeoutMs)
  };
}

export function isRetryableStatus(status) {
  return status >= 500 || status === 429;
}

// Exponential backoff capped at maxDelayMs, with +/-25% jitter.
export function backoffDelayMs(attempt, { baseDelayMs, maxDelayMs }, random = Math.random) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exponential * (0.75 + random() * 0.5));
}

/**
 * Downloads `url` to `destPath`, retrying transient failures (HTTP 5xx/429,
 * network errors, stalled transfers). Other 4xx responses and any size/hash
 * mismatch of a fully received body fail immediately and are never retried.
 */
export async function downloadVerified({
  url,
  destPath,
  expectedBytes,
  expectedHash,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  log = console.log,
  ...overrides
}) {
  const options = { ...DEFAULT_RETRY_OPTIONS, ...overrides };
  const tempPath = `${destPath}.download`;
  await mkdir(dirname(destPath), { recursive: true });

  for (let attempt = 1; ; attempt += 1) {
    try {
      await downloadOnce({ url, tempPath, expectedBytes, expectedHash, fetchImpl, idleTimeoutMs: options.idleTimeoutMs });
      await rename(tempPath, destPath);
      return { attempts: attempt };
    } catch (error) {
      await rm(tempPath, { force: true });
      if (error instanceof NonRetryableDownloadError) throw error;
      if (attempt >= options.attempts) {
        throw new Error(`Core pack download failed after ${attempt} attempt(s): ${describe(error)}`, { cause: error });
      }
      const delay = backoffDelayMs(attempt, options, random);
      log(`Core pack download attempt ${attempt}/${options.attempts} failed (${describe(error)}); retrying in ${Math.round(delay / 1000)}s.`);
      await sleep(delay);
    }
  }
}

async function downloadOnce({ url, tempPath, expectedBytes, expectedHash, fetchImpl, idleTimeoutMs }) {
  const controller = new AbortController();
  let timer;
  const armIdleTimer = () => {
    clearTimeout(timer);
    if (idleTimeoutMs > 0) timer = setTimeout(() => controller.abort(new Error(`no data for ${idleTimeoutMs}ms`)), idleTimeoutMs);
  };
  armIdleTimer();
  try {
    const response = await fetchImpl(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok) {
      const message = `HTTP ${response.status} ${response.statusText ?? ""}`.trim();
      if (isRetryableStatus(response.status)) throw new Error(message);
      throw new NonRetryableDownloadError(`Download failed: ${message}`);
    }
    if (!response.body) throw new Error("response had no body");

    const digest = createHash("sha256");
    let downloadedBytes = 0;
    await pipeline(
      Readable.fromWeb(response.body),
      async function* (source) {
        for await (const chunk of source) {
          armIdleTimer();
          digest.update(chunk);
          downloadedBytes += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(tempPath),
      { signal: controller.signal }
    );

    const actualHash = digest.digest("hex");
    if (downloadedBytes !== expectedBytes || actualHash !== expectedHash) {
      throw new NonRetryableDownloadError(
        `Downloaded artifact mismatch: got ${downloadedBytes} bytes sha256:${actualHash}, ` +
          `expected ${expectedBytes} bytes sha256:${expectedHash}.`
      );
    }
  } catch (error) {
    // Surface the idle-timeout reason instead of a bare AbortError.
    if (controller.signal.aborted && controller.signal.reason instanceof Error) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function describe(error) {
  const cause = error?.cause?.message ? ` (${error.cause.message})` : "";
  return `${error?.message ?? error}${cause}`;
}
