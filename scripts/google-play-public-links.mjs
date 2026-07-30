#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sha256Bytes } = require("./lib/google-play-listing-contract.cjs");

const LINK_FIELDS = [
  ["marketingUrl", "marketing"],
  ["androidInstallUrl", "install"],
  ["supportUrl", "support"],
  ["accessibilityUrl", "accessibility"],
  ["privacyPolicyUrl", "privacy"],
  ["sourceUrl", "source"],
];

function fail(message) {
  throw new Error(`Google Play public links: ${message}`);
}

function publicHttps(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} is not a valid URL`);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    isIP(url.hostname) !== 0 ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local")
  ) {
    fail(`${label} must be public HTTPS`);
  }
  return url;
}

export async function checkGooglePlayPublicLinks({
  fetchImpl = globalThis.fetch,
  metadataPath,
  now = () => new Date(),
  timeoutMs = 15_000,
}) {
  if (typeof fetchImpl !== "function") {
    fail("a fetch implementation is required");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    fail("timeoutMs must be a positive integer");
  }
  const metadataBytes = await readFile(path.resolve(metadataPath));
  let metadata;
  try {
    metadata = JSON.parse(metadataBytes.toString("utf8"));
  } catch {
    fail("metadata contract is not valid JSON");
  }
  if (
    metadata?.schemaVersion !== 1 ||
    metadata?.metadataId !== "google-play-en-us-v1" ||
    metadata?.locale !== "en-US"
  ) {
    fail("metadata must be the canonical en-US contract");
  }
  const links = [];
  for (const [field, kind] of LINK_FIELDS) {
    const requested = publicHttps(metadata.contact?.[field], field);
    let response;
    try {
      response = await fetchImpl(requested.href, {
        method: "GET",
        redirect: "follow",
        headers: {
          "user-agent": "Chessticize-Google-Play-Link-Check/1",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      fail(`${kind} request failed: ${error.message}`);
    }
    if (!response?.ok || !Number.isSafeInteger(response.status)) {
      fail(`${kind} returned HTTP ${response?.status ?? "unknown"}`);
    }
    const finalUrl = publicHttps(response.url, `${kind} final URL`);
    links.push({
      kind,
      requestedUrl: requested.href,
      finalUrl: finalUrl.href,
      status: response.status,
      redirected: finalUrl.href !== requested.href,
    });
  }
  const checkedAt = now().toISOString();
  return {
    schemaVersion: 1,
    status: "pass",
    checkedAt,
    metadataContract: {
      metadataId: metadata.metadataId,
      locale: metadata.locale,
      sha256: sha256Bytes(metadataBytes),
    },
    links,
  };
}

export async function writeTimestampedPublicLinkReceipt({
  outputDir,
  receipt,
}) {
  if (!Number.isFinite(Date.parse(receipt?.checkedAt))) {
    fail("receipt checkedAt must be an ISO-8601 time");
  }
  const outputDirectory = path.resolve(outputDir);
  await mkdir(outputDirectory, { recursive: true });
  const timestamp = receipt.checkedAt.replace(/[:.]/gu, "-");
  const outputPath = path.join(
    outputDirectory,
    `google-play-public-links-${timestamp}.json`
  );
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return outputPath;
}

function parseArgs(argv) {
  const options = { live: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--live") {
      options.live = true;
      continue;
    }
    if (["--metadata", "--output-dir"].includes(argument)) {
      options[argument.slice(2).replace(/-([a-z])/gu, (_, letter) =>
        letter.toUpperCase())] = argv[index + 1];
      index += 1;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }
  return options;
}

export async function runGooglePlayPublicLinksCli(
  argv,
  {
    fetchImpl,
    now,
  } = {}
) {
  const options = parseArgs(argv);
  if (!options.live) {
    fail("--live is required because this command performs network requests");
  }
  if (!options.metadata) {
    fail("--metadata is required");
  }
  const receipt = await checkGooglePlayPublicLinks({
    fetchImpl,
    metadataPath: options.metadata,
    now,
  });
  if (options.outputDir) {
    const outputPath = await writeTimestampedPublicLinkReceipt({
      outputDir: options.outputDir,
      receipt,
    });
    return { outputPath, receipt };
  }
  return { receipt };
}

async function main(argv = process.argv.slice(2)) {
  const result = await runGooglePlayPublicLinksCli(argv);
  if (result.outputPath) {
    process.stdout.write(
      `Google Play public-link receipt: ${result.outputPath}\n`
    );
    return;
  }
  process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`);
}

const isCli = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
