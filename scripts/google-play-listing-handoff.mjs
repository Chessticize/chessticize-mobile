#!/usr/bin/env node

import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  LISTING_ASSET_SET_KIND,
  LISTING_ASSET_SET_SCHEMA_VERSION,
  canonicalJson,
  listingAssetSetDigest,
  sha256Bytes,
} = require("./lib/google-play-listing-contract.cjs");

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const EXPECTED_FAMILIES = [
  "android-phone",
  "android-tablet-7",
  "android-tablet-10",
];
const EXPECTED_FRAME_COUNT = 6;
const EXPECTED_ARTIFACT_COUNT =
  EXPECTED_FAMILIES.length * EXPECTED_FRAME_COUNT;

function fail(message) {
  throw new Error(`Google Play listing handoff: ${message}`);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

async function readJsonFile(filePath, label) {
  const resolved = path.resolve(filePath);
  const bytes = await readFile(resolved);
  return { bytes, path: resolved, value: parseJson(bytes, label) };
}

async function sha256File(filePath, label) {
  const resolved = path.resolve(filePath);
  const fileStat = await stat(resolved);
  if (!fileStat.isFile()) {
    fail(`${label} is not a file`);
  }
  return sha256Bytes(await readFile(resolved));
}

function requireSha256(value, label) {
  if (!SHA256_PATTERN.test(value ?? "")) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requirePublicHttps(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be an auditable HTTPS URL`);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    fail(`${label} must be an auditable HTTPS URL`);
  }
  return url.href;
}

function candidateFromCapture(capture) {
  const artifact = capture?.artifact;
  const candidate = artifact?.candidate;
  const sourceCommit = capture?.sourceBuild?.sourceCommit;
  if (
    capture?.schemaVersion !== 1 ||
    capture?.platform !== "google-play" ||
    capture?.status !== "exact-artifact-capture" ||
    capture?.locale !== "en-US" ||
    !COMMIT_PATTERN.test(sourceCommit ?? "") ||
    artifact?.captureMode !== "public-ui-exact-artifact" ||
    artifact?.artifactRole !== "play-delivered-apk" ||
    !SHA256_PATTERN.test(artifact?.sha256 ?? "") ||
    candidate?.applicationId !== "com.chessticize.mobile" ||
    typeof candidate?.versionName !== "string" ||
    !Number.isSafeInteger(candidate?.versionCode) ||
    candidate.versionCode < 1 ||
    !SHA256_PATTERN.test(candidate?.aabSha256 ?? "") ||
    !SHA256_PATTERN.test(candidate?.signerCertificateSha256 ?? "")
  ) {
    fail("capture manifest must bind one exact Play-delivered candidate");
  }
  return {
    commitSha: sourceCommit,
    applicationId: candidate.applicationId,
    versionName: candidate.versionName,
    versionCode: candidate.versionCode,
    aabSha256: candidate.aabSha256,
    apkSha256: artifact.sha256,
    signerCertificateSha256: candidate.signerCertificateSha256,
  };
}

async function inspectComposition({
  capture,
  captureManifestSha256,
  composition,
  compositionRoot,
  metadata,
}) {
  if (
    composition?.schemaVersion !== 1 ||
    composition?.platform !== "google-play" ||
    composition?.mode !== "full-export" ||
    composition?.locale !== metadata.locale ||
    composition?.source?.captureManifestSha256 !== captureManifestSha256 ||
    composition?.source?.sourceCommit !== capture.sourceBuild.sourceCommit ||
    canonicalJson(composition?.source?.captureArtifact) !==
      canonicalJson(capture.artifact) ||
    !Array.isArray(composition?.artifacts) ||
    composition.artifacts.length !== EXPECTED_ARTIFACT_COUNT
  ) {
    fail(
      "composition manifest must be a full exact-capture Google Play export"
    );
  }
  const altTextByFrame = new Map(
    metadata.previewAssets?.screenshots?.frames?.map(frame => [
      frame.id,
      frame.altText,
    ]) ?? []
  );
  if (altTextByFrame.size !== EXPECTED_FRAME_COUNT) {
    fail("metadata contract must define six unique screenshot alt texts");
  }
  const seen = new Set();
  const artifactContract = [];
  for (const artifact of composition.artifacts) {
    const key = `${artifact.deviceFamily}:${artifact.order}`;
    if (
      !EXPECTED_FAMILIES.includes(artifact.deviceFamily) ||
      !Number.isSafeInteger(artifact.order) ||
      artifact.order < 1 ||
      artifact.order > EXPECTED_FRAME_COUNT ||
      seen.has(key) ||
      artifact.altText !== altTextByFrame.get(artifact.frameId) ||
      typeof artifact.file !== "string" ||
      artifact.file.length === 0 ||
      !SHA256_PATTERN.test(artifact.sha256 ?? "")
    ) {
      fail(
        "composition manifest must bind 18 unique final image hashes and canonical alt texts"
      );
    }
    seen.add(key);
    const artifactPath = path.resolve(compositionRoot, artifact.file);
    const relativeArtifactPath = path.relative(compositionRoot, artifactPath);
    if (
      relativeArtifactPath.startsWith("..") ||
      path.isAbsolute(relativeArtifactPath)
    ) {
      fail(`composition artifact escapes its output directory: ${artifact.file}`);
    }
    const actualSha256 = await sha256File(
      artifactPath,
      `composed image ${artifact.file}`
    );
    if (actualSha256 !== artifact.sha256) {
      fail(`composed image hash does not match ${artifact.file}`);
    }
    artifactContract.push({
      deviceFamily: artifact.deviceFamily,
      order: artifact.order,
      frameId: artifact.frameId,
      file: artifact.file,
      sha256: artifact.sha256,
      altText: artifact.altText,
    });
  }
  for (const family of EXPECTED_FAMILIES) {
    for (let order = 1; order <= EXPECTED_FRAME_COUNT; order += 1) {
      if (!seen.has(`${family}:${order}`)) {
        fail(`composition manifest is missing ${family} frame ${order}`);
      }
    }
  }
  return {
    artifactCount: artifactContract.length,
    artifactsDigest: sha256Bytes(canonicalJson(artifactContract)),
    deviceFamilies: EXPECTED_FAMILIES,
  };
}

function reviewBinding({
  candidate,
  captureManifestSha256,
  compositionManifestSha256,
  consoleReview,
  metadataContractSha256,
}) {
  let reviewedAt;
  try {
    reviewedAt = new Date(consoleReview?.reviewedAt).toISOString();
  } catch {
    reviewedAt = undefined;
  }
  const reference = requirePublicHttps(
    consoleReview?.reference,
    "Console review reference"
  );
  const referenceUrl = new URL(reference);
  if (
    consoleReview?.schemaVersion !== 1 ||
    consoleReview?.status !== "reviewed" ||
    typeof consoleReview?.evidenceId !== "string" ||
    consoleReview.evidenceId.trim().length === 0 ||
    consoleReview.evidenceId.startsWith("REPLACE_") ||
    !reviewedAt ||
    referenceUrl.hostname !== "play.google.com" ||
    !referenceUrl.pathname.startsWith("/console/") ||
    canonicalJson(consoleReview?.candidate) !== canonicalJson(candidate) ||
    consoleReview?.metadataContractSha256 !== metadataContractSha256 ||
    consoleReview?.captureManifestSha256 !== captureManifestSha256 ||
    consoleReview?.compositionManifestSha256 !== compositionManifestSha256
  ) {
    fail(
      "Console review must be reviewed, auditable, and bound to the exact asset inputs"
    );
  }
  return {
    status: "reviewed",
    evidenceId: consoleReview.evidenceId,
    reference,
    reviewedAt,
  };
}

async function inputContract(options) {
  const metadataFile = await readJsonFile(
    options.metadata,
    "metadata contract"
  );
  const captureFile = await readJsonFile(
    options.capture,
    "capture manifest"
  );
  const compositionFile = await readJsonFile(
    options.composition,
    "composition manifest"
  );
  const metadata = metadataFile.value;
  const capture = captureFile.value;
  const composition = compositionFile.value;
  if (
    metadata?.schemaVersion !== 1 ||
    metadata?.metadataId !== "google-play-en-us-v1" ||
    metadata?.locale !== "en-US"
  ) {
    fail("metadata contract must be the canonical en-US Google Play contract");
  }
  const metadataContractSha256 = sha256Bytes(metadataFile.bytes);
  const captureManifestSha256 = sha256Bytes(captureFile.bytes);
  const compositionManifestSha256 = sha256Bytes(compositionFile.bytes);
  const candidate = candidateFromCapture(capture);
  const compositionBinding = await inspectComposition({
    capture,
    captureManifestSha256,
    composition,
    compositionRoot: path.dirname(compositionFile.path),
    metadata,
  });
  const iconPath = path.resolve(path.dirname(metadataFile.path), "..",
    metadata.previewAssets?.appIcon?.path ?? "");
  const featureGraphicPath = path.resolve(
    path.dirname(metadataFile.path),
    "..",
    metadata.previewAssets?.featureGraphic?.path ?? ""
  );
  const appIconSha256 = await sha256File(iconPath, "Play app icon");
  const featureGraphicSha256 = await sha256File(
    featureGraphicPath,
    "Play feature graphic"
  );
  return {
    candidate,
    captureManifestSha256,
    compositionBinding,
    compositionManifestSha256,
    metadata,
    metadataContractSha256,
    appIconSha256,
    featureGraphicSha256,
  };
}

export async function prepareConsoleReview(options) {
  const input = await inputContract(options);
  return {
    schemaVersion: 1,
    status: "pending",
    evidenceId: "REPLACE_WITH_PLAY_CONSOLE_LISTING_REVIEW_EVIDENCE_ID",
    reference: "REPLACE_WITH_HTTPS_PLAY_CONSOLE_LISTING_REVIEW_REFERENCE",
    reviewedAt: "REPLACE_WITH_ISO_8601_REVIEW_TIME",
    candidate: input.candidate,
    metadataContractSha256: input.metadataContractSha256,
    captureManifestSha256: input.captureManifestSha256,
    compositionManifestSha256: input.compositionManifestSha256,
  };
}

export async function createListingHandoff(options) {
  const input = await inputContract(options);
  const reviewFile = await readJsonFile(
    options.consoleReview,
    "Console review receipt"
  );
  const consoleReview = reviewBinding({
    candidate: input.candidate,
    captureManifestSha256: input.captureManifestSha256,
    compositionManifestSha256: input.compositionManifestSha256,
    consoleReview: reviewFile.value,
    metadataContractSha256: input.metadataContractSha256,
  });
  const assetSet = {
    schemaVersion: LISTING_ASSET_SET_SCHEMA_VERSION,
    kind: LISTING_ASSET_SET_KIND,
    status: "reviewed",
    candidate: input.candidate,
    metadataContract: {
      metadataId: input.metadata.metadataId,
      locale: input.metadata.locale,
      repositoryFile: "config/google-play-metadata-en-us-v1.json",
      sha256: input.metadataContractSha256,
    },
    appIcon: {
      repositoryFile: input.metadata.previewAssets.appIcon.path,
      sha256: input.appIconSha256,
      altText: input.metadata.previewAssets.appIcon.altText,
    },
    featureGraphic: {
      repositoryFile: input.metadata.previewAssets.featureGraphic.path,
      sha256: input.featureGraphicSha256,
      altText: input.metadata.previewAssets.featureGraphic.altText,
    },
    captureManifest: {
      fileName: path.basename(options.capture),
      sha256: input.captureManifestSha256,
    },
    compositionManifest: {
      fileName: path.basename(options.composition),
      sha256: input.compositionManifestSha256,
      ...input.compositionBinding,
    },
    consoleReview,
  };
  return {
    ...assetSet,
    assetSetDigest: listingAssetSetDigest(assetSet),
  };
}

export async function verifyListingHandoff(options) {
  const handoffFile = await readJsonFile(options.handoff, "listing handoff");
  const expected = await createListingHandoff(options);
  if (canonicalJson(handoffFile.value) !== canonicalJson(expected)) {
    fail("handoff does not match the exact current inputs");
  }
  return expected;
}

function parseArgs(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    }
    if (
      [
        "--metadata",
        "--capture",
        "--composition",
        "--console-review",
        "--handoff",
        "--output",
      ].includes(argument)
    ) {
      options[argument.slice(2).replace(/-([a-z])/gu, (_, letter) =>
        letter.toUpperCase())] = argv[index + 1];
      index += 1;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }
  return { command, options };
}

function requireOptions(options, fields) {
  for (const field of fields) {
    if (!options[field]) {
      fail(`--${field.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)} is required`);
    }
  }
}

async function writeJsonOutput(output, value) {
  const resolved = path.resolve(output);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`);
  return resolved;
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  requireOptions(options, ["metadata", "capture", "composition"]);
  let result;
  if (command === "prepare-console-review") {
    requireOptions(options, ["output"]);
    result = await prepareConsoleReview(options);
    await writeJsonOutput(options.output, result);
  } else if (command === "create") {
    requireOptions(options, ["consoleReview", "output"]);
    result = await createListingHandoff(options);
    await writeJsonOutput(options.output, result);
  } else if (command === "verify") {
    requireOptions(options, ["consoleReview", "handoff"]);
    result = await verifyListingHandoff(options);
  } else {
    fail("command must be prepare-console-review, create, or verify");
  }
  process.stdout.write(
    `Google Play listing ${command}: ${result.assetSetDigest ?? result.status}\n`
  );
}

const isCli = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
