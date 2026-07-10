import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_ARTIFACT_URL =
  "https://github.com/Chessticize/chessticize-mobile/releases/download/core-pack-v2/bundled-core-pack.sqlite";

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
const response = await fetch(artifactUrl, { redirect: "follow" });
if (!response.ok || !response.body) {
  console.error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  process.exit(1);
}

const tempPath = `${artifactPath}.download`;
await mkdir(dirname(artifactPath), { recursive: true });
const digest = createHash("sha256");
let downloadedBytes = 0;
await pipeline(
  Readable.fromWeb(response.body),
  async function* (source) {
    for await (const chunk of source) {
      digest.update(chunk);
      downloadedBytes += chunk.length;
      yield chunk;
    }
  },
  createWriteStream(tempPath)
);

const actualHash = digest.digest("hex");
if (downloadedBytes !== expectedBytes || actualHash !== expectedHash) {
  await rm(tempPath, { force: true });
  console.error(
    `Downloaded artifact mismatch: got ${downloadedBytes} bytes sha256:${actualHash}, ` +
      `expected ${expectedBytes} bytes sha256:${expectedHash}.`
  );
  process.exit(1);
}

await rename(tempPath, artifactPath);
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
