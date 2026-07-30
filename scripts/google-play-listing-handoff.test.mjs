import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createListingHandoff,
  prepareConsoleReview,
  verifyListingHandoff,
} from "./google-play-listing-handoff.mjs";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);
const metadataPath = path.join(
  repositoryRoot,
  "config/google-play-metadata-en-us-v1.json"
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "google-play-listing-handoff-")
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = {
    applicationId: "com.chessticize.mobile",
    versionName: "1.3.1",
    versionCode: 9,
    aabSha256: "a".repeat(64),
    signerCertificateSha256: "b".repeat(64),
  };
  const artifact = {
    captureMode: "public-ui-exact-artifact",
    artifactRole: "play-delivered-apk",
    fileName: "Chessticize-Android-1.3.1.apk",
    bytes: 123,
    sha256: "c".repeat(64),
    candidate,
  };
  const capture = {
    schemaVersion: 1,
    platform: "google-play",
    status: "exact-artifact-capture",
    storyId: "app-store-marketing-en-us-v1",
    locale: "en-US",
    sourceBuild: { sourceCommit: "d".repeat(40) },
    artifact,
  };
  const capturePath = path.join(root, "google-play-capture-manifest.json");
  await writeFile(capturePath, `${JSON.stringify(capture, null, 2)}\n`);
  const captureSha256 = sha256(await readFile(capturePath));
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const artifacts = [];
  for (const family of [
    "android-phone",
    "android-tablet-7",
    "android-tablet-10",
  ]) {
    for (let order = 1; order <= 6; order += 1) {
      const frame = metadata.previewAssets.screenshots.frames[order - 1];
      const file = path.join(family, `${order}-${frame.id}.png`);
      const bytes = Buffer.from(`${family}:${order}:exact-final-image`);
      await mkdir(path.join(root, family), { recursive: true });
      await writeFile(path.join(root, file), bytes);
      artifacts.push({
        deviceFamily: family,
        order,
        frameId: frame.id,
        file,
        sha256: sha256(bytes),
        altText: frame.altText,
      });
    }
  }
  const composition = {
    schemaVersion: 1,
    platform: "google-play",
    mode: "full-export",
    locale: "en-US",
    source: {
      captureManifestSha256: captureSha256,
      sourceCommit: capture.sourceBuild.sourceCommit,
      captureArtifact: artifact,
    },
    artifacts,
  };
  const compositionPath = path.join(root, "composition-manifest.json");
  await writeFile(compositionPath, `${JSON.stringify(composition, null, 2)}\n`);
  const baseOptions = {
    metadata: metadataPath,
    capture: capturePath,
    composition: compositionPath,
  };
  const consoleReview = await prepareConsoleReview(baseOptions);
  Object.assign(consoleReview, {
    status: "reviewed",
    evidenceId: "play-console-listing-review-444",
    reference:
      "https://play.google.com/console/developers/example/app-listing/review",
    reviewedAt: "2026-07-30T03:04:05.000Z",
  });
  const consoleReviewPath = path.join(root, "console-review.json");
  await writeFile(
    consoleReviewPath,
    `${JSON.stringify(consoleReview, null, 2)}\n`
  );
  return {
    ...baseOptions,
    consoleReview: consoleReviewPath,
    handoff: path.join(root, "listing-handoff.json"),
    root,
  };
}

test("creates and re-verifies one deterministic exact listing asset set", async t => {
  const options = await fixture(t);
  const first = await createListingHandoff(options);
  const second = await createListingHandoff(options);

  assert.deepEqual(second, first);
  assert.equal(first.status, "reviewed");
  assert.equal(first.metadataContract.locale, "en-US");
  assert.match(first.metadataContract.sha256, /^[0-9a-f]{64}$/u);
  assert.match(first.appIcon.sha256, /^[0-9a-f]{64}$/u);
  assert.match(first.featureGraphic.sha256, /^[0-9a-f]{64}$/u);
  assert.match(first.captureManifest.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(first.compositionManifest.artifactCount, 18);
  assert.match(first.compositionManifest.sha256, /^[0-9a-f]{64}$/u);
  assert.match(first.compositionManifest.artifactsDigest, /^[0-9a-f]{64}$/u);
  assert.match(first.assetSetDigest, /^[0-9a-f]{64}$/u);

  await writeFile(options.handoff, `${JSON.stringify(first, null, 2)}\n`);
  assert.deepEqual(await verifyListingHandoff(options), first);
});

test("fails closed when a final image changes after composition", async t => {
  const options = await fixture(t);
  await writeFile(
    path.join(options.root, "android-phone/1-build-tactical-intuition.png"),
    "tampered"
  );
  await assert.rejects(
    createListingHandoff(options),
    /composed image hash does not match/u
  );
});

test("fails closed when Console review names another composition", async t => {
  const options = await fixture(t);
  const review = JSON.parse(await readFile(options.consoleReview, "utf8"));
  review.compositionManifestSha256 = "f".repeat(64);
  await writeFile(options.consoleReview, JSON.stringify(review));

  await assert.rejects(
    createListingHandoff(options),
    /Console review must be reviewed, auditable, and bound/u
  );
});
