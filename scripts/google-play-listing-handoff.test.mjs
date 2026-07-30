import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  createListingHandoff,
  prepareConsoleReview,
  verifyListingHandoff,
} from "./google-play-listing-handoff.mjs";

const require = createRequire(import.meta.url);
const story = require("../config/app-store-marketing-story-v1.json");
const {
  captureMarketingScreenshot,
} = require("../apps/mobile/e2e/marketingCaptureArtifacts.js");
const {
  GOOGLE_PLAY_CAPTURE_TARGETS,
  writeCombinedGooglePlayCaptureManifest,
  writeGooglePlayDeviceCaptureManifest,
} = require("../apps/mobile/e2e/googlePlayMarketingCaptureArtifacts.js");

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
    sourceManifest: {
      fileName: "android-source-manifest.json",
      sha256: "e".repeat(64),
    },
    mirrorEvidence: {
      fileName: "android-apk-mirror-evidence.json",
      sha256: "f".repeat(64),
    },
  };
  const sourceCommit = "d".repeat(40);
  const rawSourceRoot = path.join(root, "raw-source");
  await mkdir(rawSourceRoot, { recursive: true });
  for (const [family, contract] of Object.entries(
    GOOGLE_PLAY_CAPTURE_TARGETS
  )) {
    const target = {
      platform: "android",
      deviceFamily: family,
      deviceName: `Play ${family}`,
      deviceId: `play-${family}`,
      apiLevel: 36,
      densityDpi: 320,
      displayGroup: contract.displayGroup,
      orientation: contract.orientation,
      rawPixelDimensions: contract.rawPixelDimensions,
      acceptedSizes: [contract.rawPixelDimensions],
      outputDirectoryName: [
        family,
        contract.displayGroup,
        contract.orientation,
      ].join("-"),
    };
    const installedSession = {
      schemaVersion: 1,
      applicationId: candidate.applicationId,
      installerPackageName: "com.android.vending",
      initiatingPackageName: "com.android.vending",
      versionName: candidate.versionName,
      versionCode: candidate.versionCode,
      signerCertificateSha256: candidate.signerCertificateSha256,
      debuggable: false,
      testOnly: false,
      foregroundPackage: candidate.applicationId,
      deviceId: target.deviceId,
      installedBaseApk: {
        bytes: 456,
        sha256: sha256(Buffer.from(`installed:${family}`)),
      },
    };
    const records = [];
    for (const frame of story.frames) {
      const sourcePath = path.join(
        rawSourceRoot,
        `${family}-${frame.captureId}.png`
      );
      const sourceBytes = await sharp({
        create: {
          width: contract.rawPixelDimensions.width,
          height: contract.rawPixelDimensions.height,
          channels: 3,
          background: {
            r: 20 + frame.order,
            g: 60 + frame.order,
            b: 100 + frame.order,
          },
        },
      }).png().toBuffer();
      await writeFile(sourcePath, sourceBytes);
      const record = captureMarketingScreenshot({
        frame,
        outputRoot: root,
        screenshotPath: sourcePath,
        sourceCommit,
        story,
        target,
      });
      const sidecar = {
        schemaVersion: 1,
        platform: "google-play",
        captureMode: "public-ui-exact-artifact",
        order: frame.order,
        frameId: frame.id,
        captureId: frame.captureId,
        sourceCommit,
        artifact,
        target: {
          platform: target.platform,
          deviceFamily: target.deviceFamily,
          deviceName: target.deviceName,
          deviceId: target.deviceId,
          apiLevel: target.apiLevel,
          densityDpi: target.densityDpi,
          displayGroup: target.displayGroup,
          orientation: target.orientation,
          rawPixelDimensions: target.rawPixelDimensions,
        },
        installedSession,
        screenshot: {
          fileName: record.fileName,
          bytes: sourceBytes.length,
          sha256: record.sha256,
          pixelDimensions: record.pixelDimensions,
        },
      };
      const sidecarPath = path.join(
        root,
        target.outputDirectoryName,
        `${frame.captureId}.capture.json`
      );
      const sidecarBytes = Buffer.from(
        `${JSON.stringify(sidecar, null, 2)}\n`
      );
      await writeFile(sidecarPath, sidecarBytes);
      records.push({
        ...record,
        captureProvenance: {
          sidecarFileName: path.basename(sidecarPath),
          sidecarFile: path.relative(root, sidecarPath),
          sidecarSha256: sha256(sidecarBytes),
          installedSessionSha256: sha256(
            Buffer.from(JSON.stringify(installedSession))
          ),
        },
      });
    }
    writeGooglePlayDeviceCaptureManifest({
      artifact,
      installedSession,
      outputRoot: root,
      records,
      sourceCommit,
      story,
      target,
    });
  }
  const capturePath = writeCombinedGooglePlayCaptureManifest({
    outputRoot: root,
    story,
  });
  const capture = JSON.parse(await readFile(capturePath, "utf8"));
  const captureSha256 = sha256(await readFile(capturePath));
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const finalDimensions = {
    "android-phone": { width: 1080, height: 1920 },
    "android-tablet-7": { width: 1440, height: 2560 },
    "android-tablet-10": { width: 2560, height: 1440 },
  };
  const artifacts = [];
  for (const family of [
    "android-phone",
    "android-tablet-7",
    "android-tablet-10",
  ]) {
    for (let order = 1; order <= 6; order += 1) {
      const frame = metadata.previewAssets.screenshots.frames[order - 1];
      const file = path.join(family, `${order}-${frame.id}.png`);
      const dimensions = finalDimensions[family];
      const bytes = await sharp({
        create: {
          width: dimensions.width,
          height: dimensions.height,
          channels: 3,
          background: {
            r: 30 + order,
            g: 70 + order,
            b: 110 + order,
          },
        },
      }).png().toBuffer();
      await mkdir(path.join(root, family), { recursive: true });
      await writeFile(path.join(root, file), bytes);
      artifacts.push({
        deviceFamily: family,
        order,
        frameId: frame.id,
        copy: {
          headline: frame.headline,
        },
        dimensions,
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

test("fails closed when exact capture provenance is missing", async t => {
  const options = await fixture(t);
  const capture = JSON.parse(await readFile(options.capture, "utf8"));
  const sidecar = capture.frames[0]
    .captures["android-phone"]
    .captureProvenance
    .sidecarFile;
  await rm(path.join(options.root, sidecar));

  await assert.rejects(
    createListingHandoff(options),
    /exact capture provenance failed.*sidecar/isu
  );
});

test("fails closed when a family repeats a frame at another order", async t => {
  const options = await fixture(t);
  const composition = JSON.parse(
    await readFile(options.composition, "utf8")
  );
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const duplicate = composition.artifacts.find(
    artifact =>
      artifact.deviceFamily === "android-phone" &&
      artifact.order === 2
  );
  const firstFrame = metadata.previewAssets.screenshots.frames[0];
  duplicate.frameId = firstFrame.id;
  duplicate.copy.headline = firstFrame.headline;
  duplicate.altText = firstFrame.altText;
  await writeFile(
    options.composition,
    `${JSON.stringify(composition, null, 2)}\n`
  );

  await assert.rejects(
    createListingHandoff(options),
    /18 unique final image hashes and canonical alt texts/u
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
