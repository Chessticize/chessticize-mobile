#!/usr/bin/env node
/**
 * Fetch and SHA-256-verify offline Maia-2 Rapid INT8 models (ONNX for Android/cross-platform,
 * compiled CoreML .mlmodelc for iOS 16+) from the immutable GitHub Release.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { downloadVerified, retryOptionsFromEnv } from "./core-pack-download.mjs";

const RELEASE_BASE_URL =
  process.env.MAIA2_MODEL_BASE_URL ??
  "https://github.com/Chessticize/chessticize-mobile/releases/download/maia2-rapid-int8-v1";

const manifestPath = resolve("fixtures/models/maia2-rapid-int8.manifest.json");
const modelsDir = resolve("fixtures/models");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const requested = new Set(process.argv.slice(2));
const fetchOnnx = requested.size === 0 || requested.has("--onnx") || requested.has("--all");
const fetchCoreml = requested.size === 0 || requested.has("--coreml") || requested.has("--all");

await mkdir(modelsDir, { recursive: true });

if (fetchOnnx) {
  const spec = manifest.artifacts.onnxInt8;
  const destPath = resolve(modelsDir, spec.filename);
  const expectedHash = spec.sha256.replace(/^sha256:/u, "");
  await ensureVerifiedFile({
    label: "Maia-2 ONNX INT8",
    url: `${RELEASE_BASE_URL}/${spec.filename}`,
    destPath,
    expectedBytes: spec.bytes,
    expectedHash
  });
}

if (fetchCoreml) {
  const spec = manifest.artifacts.coremlInt8Zip;
  const zipPath = resolve(modelsDir, spec.filename);
  const bundleDir = resolve(modelsDir, spec.bundleDirName);
  const weightBinPath = resolve(bundleDir, "weights/weight.bin");
  const expectedZipHash = spec.sha256.replace(/^sha256:/u, "");
  const expectedWeightHash = spec.weightBinSha256.replace(/^sha256:/u, "");

  const alreadyExtracted =
    existsSync(weightBinPath) &&
    statSync(weightBinPath).size === spec.weightBinBytes &&
    (await fileSha256(weightBinPath)) === expectedWeightHash;

  if (alreadyExtracted) {
    console.log(`Maia-2 CoreML INT8 bundle already extracted and verified (${spec.weightBinBytes} weight bytes).`);
  } else {
    await ensureVerifiedFile({
      label: "Maia-2 CoreML INT8 zip",
      url: `${RELEASE_BASE_URL}/${spec.filename}`,
      destPath: zipPath,
      expectedBytes: spec.bytes,
      expectedHash: expectedZipHash
    });
    await rm(bundleDir, { recursive: true, force: true });
    execFileSync("unzip", ["-oq", zipPath, "-d", modelsDir], { stdio: "inherit" });
    if (
      !existsSync(weightBinPath) ||
      statSync(weightBinPath).size !== spec.weightBinBytes ||
      (await fileSha256(weightBinPath)) !== expectedWeightHash
    ) {
      throw new Error("Extracted CoreML bundle weights/weight.bin failed SHA-256 verification");
    }
    console.log(`Maia-2 CoreML INT8 bundle extracted and verified at ${bundleDir}.`);
  }
}

async function ensureVerifiedFile({ label, url, destPath, expectedBytes, expectedHash }) {
  if (existsSync(destPath)) {
    if (statSync(destPath).size === expectedBytes && (await fileSha256(destPath)) === expectedHash) {
      console.log(`${label} already present and verified (${expectedBytes} bytes).`);
      return;
    }
    console.log(`Existing ${label} does not match manifest; re-downloading.`);
    await rm(destPath, { force: true });
  }
  console.log(`Downloading ${label} (${(expectedBytes / 1024 / 1024).toFixed(1)} MB) from ${url}`);
  await downloadVerified({
    url,
    destPath,
    expectedBytes,
    expectedHash,
    ...retryOptionsFromEnv()
  });
  console.log(`${label} fetched and verified at ${destPath}.`);
}

function fileSha256(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolvePromise(hash.digest("hex")))
      .on("error", rejectPromise);
  });
}
