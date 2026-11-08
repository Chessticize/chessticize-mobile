import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { downloadVerified, retryOptionsFromEnv } from "./core-pack-download.mjs";

const DEFAULT_ARTIFACT_URL =
  "https://github.com/Chessticize/chessticize-mobile/releases/download/core-pack-v5/bundled-core-pack.sqlite";

const manifestPath = resolve("fixtures/puzzles/bundled-core-pack.manifest.json");
const artifactPath = resolve("fixtures/puzzles/bundled-core-pack.sqlite");
const artifactUrl = process.env.CORE_PACK_URL ?? DEFAULT_ARTIFACT_URL;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expectedHash = manifest.packFileHash?.replace(/^sha256:/u, "");
const expectedBytes = manifest.packFileBytes;

if (!expectedHash || !expectedBytes) {
  console.error("Manifest is missing packFileHash/packFileBytes; regenerate the pack first.");
  process.exit(1);
}

if (existsSync(artifactPath)) {
  if (statSync(artifactPath).size === expectedBytes && (await fileSha256(artifactPath)) === expectedHash) {
    console.log(`Core pack already present and verified (${expectedBytes} bytes).`);
    process.exit(0);
  }
  console.log("Existing core pack does not match the manifest; re-downloading.");
  await rm(artifactPath);
}

console.log(`Downloading core pack (${(expectedBytes / 1024 / 1024).toFixed(0)} MB) from ${artifactUrl}`);
try {
  // Transient failures (5xx, 429, network, stalls) are retried with backoff; a hash mismatch never is.
  // Tune with CORE_PACK_FETCH_ATTEMPTS, _BASE_DELAY_MS, _MAX_DELAY_MS and _IDLE_TIMEOUT_MS.
  await downloadVerified({
    url: artifactUrl,
    destPath: artifactPath,
    expectedBytes,
    expectedHash,
    ...retryOptionsFromEnv()
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(`Core pack fetched and verified at ${artifactPath}.`);

function fileSha256(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolvePromise(hash.digest("hex")))
      .on("error", rejectPromise);
  });
}
