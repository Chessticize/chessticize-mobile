import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { composeMarketingAssets } from "../.codex/skills/chessticize-app-store-marketing/scripts/compose-marketing-assets.mjs";

const PLAY_LAYOUT_URL = new URL(
  "../.codex/skills/chessticize-app-store-marketing/assets/google-play-marketing-layout-v1.json",
  import.meta.url,
);
const PLAY_METADATA_URL = new URL(
  "../config/google-play-metadata-en-us-v1.json",
  import.meta.url,
);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createPlayFixture(root) {
  const captureRoot = path.join(root, "capture");
  const config = JSON.parse(await readFile(PLAY_LAYOUT_URL, "utf8"));
  const frames = [];
  await mkdir(captureRoot, { recursive: true });

  for (const frameContract of config.frames) {
    const frame = {
      order: frameContract.order,
      frameId: frameContract.frameId,
      captureId: frameContract.captureId,
      copyKey: frameContract.copyKey,
      headline: frameContract.headline,
      supporting: frameContract.supporting,
      captures: {},
    };
    for (const [family, preset] of Object.entries(config.presets)) {
      const dimensions = preset.acceptedSourceSizes[0];
      const relativeFile = path.join(
        `${family}-${preset.displayGroup}-${preset.orientation}`,
        frameContract.fileName,
      );
      const absoluteFile = path.join(captureRoot, relativeFile);
      await mkdir(path.dirname(absoluteFile), { recursive: true });
      const buffer = await sharp({
        create: {
          width: dimensions.width,
          height: dimensions.height,
          channels: 3,
          background: {
            r: 22 + frameContract.order * 11,
            g: 74 + frameContract.order * 7,
            b: 106 + frameContract.order * 5,
          },
        },
      })
        .png({ adaptiveFiltering: false, compressionLevel: 9 })
        .toBuffer();
      await writeFile(absoluteFile, buffer);
      frame.captures[family] = {
        order: frame.order,
        frameId: frame.frameId,
        captureId: frame.captureId,
        copyKey: frame.copyKey,
        locale: config.locale,
        deviceFamily: family,
        displayGroup: preset.displayGroup,
        orientation: preset.orientation,
        pixelDimensions: dimensions,
        sourceCommit: "1234567890123456789012345678901234567890",
        file: relativeFile,
        fileName: frameContract.fileName,
        sha256: sha256(buffer),
      };
    }
    frames.push(frame);
  }

  const manifest = {
    schemaVersion: 1,
    platform: "google-play",
    status: "preview-only",
    storyId: config.contractStoryId,
    contractIssue: 410,
    locale: config.locale,
    artifact: {
      captureMode: "deterministic-e2e",
      artifactRole: "detox-e2e-apk",
      fileName: "chessticize-marketing-preview.apk",
      bytes: 1024,
      sha256: "a".repeat(64),
    },
    sourceBuild: {
      sourceCommit: "1234567890123456789012345678901234567890",
    },
    targets: Object.fromEntries(
      Object.entries(config.presets).map(([family, preset]) => [
        family,
        {
          deviceFamily: family,
          displayGroup: preset.displayGroup,
          orientation: preset.orientation,
          rawPixelDimensions: preset.acceptedSourceSizes[0],
        },
      ]),
    ),
    frames,
  };
  const manifestPath = path.join(
    captureRoot,
    "google-play-capture-manifest.json",
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { captureRoot, config, manifestPath };
}

test("Google Play layout encodes UI-dominant phone and text-free tablet policy", async () => {
  const [layout, metadata] = await Promise.all([
    readFile(PLAY_LAYOUT_URL, "utf8").then(JSON.parse),
    readFile(PLAY_METADATA_URL, "utf8").then(JSON.parse),
  ]);

  assert.equal(layout.compositionMode, "screen-first");
  assert.equal(layout.storePolicy.outputFormat, "png-24-no-alpha");
  assert.equal(layout.storePolicy.deviceImageryAllowed, false);
  assert.equal(layout.storePolicy.tabletMarketingTextAllowed, false);
  assert.deepEqual(layout.storePolicy.generalScreenshotPixels, {
    minimum: 320,
    maximum: 3840,
    maximumAspectRatio: 2,
  });
  assert.deepEqual(layout.storePolicy.largeScreenPixels, {
    minimum: 1080,
    maximum: 7680,
  });
  assert.equal(layout.storePolicy.largeScreenMinimumScreenshotCount, 4);
  assert.equal(layout.storePolicy.screenshotsPerDeviceTypeMaximum, 8);
  assert.equal(layout.storePolicy.phoneOverlayMaximumHeightRatio, 0.2);
  assert.equal(layout.storePolicy.altTextMaximumCharacters, 140);
  assert.equal(layout.frames.length, 6);
  assert.equal(metadata.previewAssets.screenshots.frames.length, 6);
  assert.deepEqual(
    metadata.previewAssets.screenshots.deviceTypes.map(
      ({ captureCount, id }) => ({ captureCount, id }),
    ),
    [
      { id: "phone", captureCount: 6 },
      { id: "7-inch-tablet", captureCount: 6 },
      { id: "10-inch-tablet", captureCount: 6 },
    ],
  );

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(layout.presets).map(([family, preset]) => [
        family,
        {
          outputDimensions: preset.screenFirst.outputDimensions,
          headlineOverlay: preset.screenFirst.headlineOverlay,
          frameStyle: preset.screenFirst.frameStyle,
        },
      ]),
    ),
    {
      "android-phone": {
        outputDimensions: { width: 1080, height: 1920 },
        headlineOverlay: true,
        frameStyle: "frameless",
      },
      "android-tablet-7": {
        outputDimensions: { width: 1440, height: 2560 },
        headlineOverlay: false,
        frameStyle: "frameless",
      },
      "android-tablet-10": {
        outputDimensions: { width: 2560, height: 1440 },
        headlineOverlay: false,
        frameStyle: "frameless",
      },
    },
  );
  assert.ok(
    layout.presets["android-phone"].product.topRatio <=
      layout.storePolicy.phoneOverlayMaximumHeightRatio,
  );
});

test("Google Play export normalizes three device types and records canonical alt text", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "chessticize-google-play-composition-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createPlayFixture(root);
  const outputDir = path.join(root, "output");
  const result = await composeMarketingAssets({
    captureRoot: fixture.captureRoot,
    deviceFamily: "all",
    layoutConfig: PLAY_LAYOUT_URL.pathname,
    manifest: fixture.manifestPath,
    orientation: "all",
    outputDir,
    platform: "google-play",
  });
  const metadata = JSON.parse(await readFile(PLAY_METADATA_URL, "utf8"));
  const altTextByFrame = new Map(
    metadata.previewAssets.screenshots.frames.map((frame) => [
      frame.id,
      frame.altText,
    ]),
  );

  assert.equal(result.manifest.platform, "google-play");
  assert.equal(result.manifest.layoutId, "chessticize-google-play-screen-first-v1");
  assert.equal(result.manifest.artifacts.length, 18);
  assert.equal(result.manifest.contactSheets.length, 3);
  assert.deepEqual(result.manifest.backgroundTemplates, []);
  assert.equal(
    result.manifest.altTextContract.repositoryFile,
    "config/google-play-metadata-en-us-v1.json",
  );
  assert.equal(result.manifest.altTextContract.maximumCharacters, 140);
  assert.equal(result.manifest.source.captureStatus, "preview-only");
  assert.equal(
    result.manifest.source.captureArtifact.sha256,
    "a".repeat(64),
  );

  for (const [family, preset] of Object.entries(fixture.config.presets)) {
    const artifacts = result.manifest.artifacts.filter(
      (artifact) => artifact.deviceFamily === family,
    );
    assert.equal(artifacts.length, 6);
    assert.deepEqual(
      artifacts.map((artifact) => artifact.order),
      [1, 2, 3, 4, 5, 6],
    );
    for (const artifact of artifacts) {
      assert.deepEqual(
        artifact.dimensions,
        preset.screenFirst.outputDimensions,
      );
      assert.equal(artifact.presentation.frameStyle, "frameless");
      assert.equal(
        artifact.presentation.headlineRendered,
        preset.screenFirst.headlineOverlay,
      );
      assert.equal(artifact.presentation.immutableNativeCapture, true);
      assert.equal(artifact.altText, altTextByFrame.get(artifact.frameId));
      assert.ok([...artifact.altText].length <= 140);
      assert.equal(
        Object.hasOwn(artifact, "backgroundTemplateSha256"),
        false,
      );
      const outputPath = path.join(outputDir, artifact.file);
      const outputMetadata = await sharp(outputPath).metadata();
      assert.deepEqual(
        { width: outputMetadata.width, height: outputMetadata.height },
        artifact.dimensions,
      );
      assert.equal(outputMetadata.format, "png");
      assert.equal(outputMetadata.hasAlpha, false);
      assert.equal(outputMetadata.channels, 3);
      assert.equal(outputMetadata.depth, "uchar");
      assert.equal(sha256(await readFile(outputPath)), artifact.sha256);
    }
  }
});

test("Google Play layout rejects tablet text and out-of-policy output before writing", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "chessticize-google-play-policy-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createPlayFixture(root);

  const cases = [
    {
      name: "tablet-text",
      expected: /must not add marketing text/,
      mutate(config) {
        config.presets["android-tablet-7"].screenFirst.headlineOverlay = true;
      },
    },
    {
      name: "tablet-aspect",
      expected: /16:9 landscape or 9:16 portrait/,
      mutate(config) {
        config.presets["android-tablet-10"].screenFirst.outputDimensions = {
          width: 2560,
          height: 1600,
        };
      },
    },
    {
      name: "phone-overlay",
      expected: /top 20 percent/,
      mutate(config) {
        config.presets["android-phone"].product.topRatio = 0.21;
        config.presets["android-phone"].product.maxHeightRatio = 0.79;
      },
    },
    {
      name: "alt-text-drift",
      expected: /canonical alt text does not match layout frame 1/,
      mutate(config) {
        config.frames[0].headline = "A Divergent Headline";
      },
    },
  ];

  for (const testCase of cases) {
    const config = structuredClone(fixture.config);
    testCase.mutate(config);
    const layoutPath = path.join(root, `${testCase.name}.json`);
    const outputDir = path.join(root, `output-${testCase.name}`);
    await writeFile(layoutPath, `${JSON.stringify(config, null, 2)}\n`);
    await assert.rejects(
      composeMarketingAssets({
        captureRoot: fixture.captureRoot,
        layoutConfig: layoutPath,
        manifest: fixture.manifestPath,
        outputDir,
        platform: "google-play",
      }),
      testCase.expected,
    );
    assert.equal(await exists(outputDir), false);
  }
});
