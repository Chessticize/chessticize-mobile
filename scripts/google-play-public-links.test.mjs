import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  checkGooglePlayPublicLinks,
  runGooglePlayPublicLinksCli,
  writeTimestampedPublicLinkReceipt,
} from "./google-play-public-links.mjs";

async function metadataFixture(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "google-play-public-links-")
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const metadataPath = path.join(directory, "metadata.json");
  const metadata = {
    schemaVersion: 1,
    metadataId: "google-play-en-us-v1",
    locale: "en-US",
    contact: {
      marketingUrl: "https://example.test/marketing",
      androidInstallUrl: "https://example.test/install",
      supportUrl: "https://example.test/support",
      accessibilityUrl: "https://example.test/accessibility",
      privacyPolicyUrl: "https://example.test/privacy",
      sourceUrl: "https://example.test/source",
    },
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return metadataPath;
}

test("checks every public URL with redirects enabled and binds the metadata digest", async t => {
  const metadataPath = await metadataFixture(t);
  const requests = [];
  const receipt = await checkGooglePlayPublicLinks({
    metadataPath,
    now: () => new Date("2026-07-30T04:05:06.000Z"),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        url: url.endsWith("/install")
          ? "https://store.example.test/apps/chessticize"
          : url,
      };
    },
  });

  assert.equal(receipt.status, "pass");
  assert.equal(receipt.checkedAt, "2026-07-30T04:05:06.000Z");
  assert.equal(receipt.links.length, 6);
  assert.equal(receipt.links.find(link => link.kind === "install").redirected, true);
  assert.match(receipt.metadataContract.sha256, /^[0-9a-f]{64}$/u);
  assert.ok(requests.every(request => request.options.redirect === "follow"));
  assert.ok(requests.every(
    request => request.options.signal instanceof AbortSignal
  ));
});

test("fails on an HTTP error or a non-HTTPS redirect destination", async t => {
  const metadataPath = await metadataFixture(t);
  await assert.rejects(
    checkGooglePlayPublicLinks({
      metadataPath,
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        url: "https://example.test/unavailable",
      }),
    }),
    /returned HTTP 503/u
  );
  await assert.rejects(
    checkGooglePlayPublicLinks({
      metadataPath,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "http://example.test/downgraded",
      }),
    }),
    /final URL must be public HTTPS/u
  );
  await assert.rejects(
    checkGooglePlayPublicLinks({
      metadataPath,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://127.0.0.1/private",
      }),
    }),
    /final URL must be public HTTPS/u
  );
});

test("requires a bounded positive request timeout", async t => {
  const metadataPath = await metadataFixture(t);
  await assert.rejects(
    checkGooglePlayPublicLinks({
      metadataPath,
      timeoutMs: 0,
      fetchImpl: async () => {
        throw new Error("fetch must not run");
      },
    }),
    /timeoutMs must be a positive integer/u
  );
});

test("keeps the CLI network-gated and writes timestamped receipts explicitly", async t => {
  const metadataPath = await metadataFixture(t);
  const cli = spawnSync(
    process.execPath,
    [
      path.resolve("scripts/google-play-public-links.mjs"),
      "--metadata",
      metadataPath,
    ],
    { encoding: "utf8" }
  );
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /--live is required/u);

  const receipt = {
    schemaVersion: 1,
    status: "pass",
    checkedAt: "2026-07-30T04:05:06.000Z",
    metadataContract: {
      metadataId: "google-play-en-us-v1",
      locale: "en-US",
      sha256: "a".repeat(64),
    },
    links: [],
  };
  const outputPath = await writeTimestampedPublicLinkReceipt({
    outputDir: path.dirname(metadataPath),
    receipt,
  });
  assert.match(
    path.basename(outputPath),
    /^google-play-public-links-2026-07-30T04-05-06-000Z\.json$/u
  );
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), receipt);
});

test("maps CLI metadata and output options into a live receipt", async t => {
  const metadataPath = await metadataFixture(t);
  const outputDir = path.join(path.dirname(metadataPath), "receipts");
  const result = await runGooglePlayPublicLinksCli(
    [
      "--live",
      "--metadata",
      metadataPath,
      "--output-dir",
      outputDir,
    ],
    {
      now: () => new Date("2026-07-30T04:05:06.000Z"),
      fetchImpl: async url => ({
        ok: true,
        status: 200,
        url,
      }),
    }
  );

  assert.equal(result.receipt.links.length, 6);
  assert.equal(
    path.dirname(result.outputPath),
    path.resolve(outputDir)
  );
  assert.equal(
    JSON.parse(await readFile(result.outputPath, "utf8")).status,
    "pass"
  );
});
