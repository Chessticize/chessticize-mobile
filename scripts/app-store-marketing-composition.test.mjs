import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  calculateLayout,
  composeMarketingAssets,
  parseArgs,
  wrapHeadline,
} from "../.codex/skills/chessticize-app-store-marketing/scripts/compose-marketing-assets.mjs";

const FAMILY_CONTRACTS = {
  iphone: {
    dimensions: { width: 120, height: 260 },
    displayGroup: "test-phone",
    orientation: "portrait",
  },
  ipad: {
    dimensions: { width: 280, height: 210 },
    displayGroup: "test-tablet",
    orientation: "landscape",
  },
};

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

function testPreset(family) {
  const contract = FAMILY_CONTRACTS[family];
  return {
    platform: "app-store",
    deviceFamily: family,
    displayGroup: contract.displayGroup,
    orientation: contract.orientation,
    reviewLabel: family === "iphone" ? "iPhone Portrait" : "iPad Landscape",
    acceptedSourceSizes: [contract.dimensions],
    backgroundTemplates: {},
    title: {
      leftRatio: 0.075,
      topRatio: 0.03,
      maxWidthRatio: 0.85,
      fontSizeRatio: family === "iphone" ? 0.055 : 0.04,
      lineHeightRatio: 0.92,
      maxCharactersPerLine: 20,
      align: family === "iphone" ? "middle" : "start",
    },
    product: {
      topRatio: 0.2,
      maxWidthRatio: 0.78,
      maxHeightRatio: 0.75,
      framePaddingRatio: 0.012,
      cornerRadiusRatio: 0.03,
      edgeWidthRatio: 0.002,
      shadowBlurRatio: 0.01,
      shadowOffsetRatio: 0.01,
    },
  };
}

function testLayoutConfig() {
  return {
    schemaVersion: 1,
    layoutId: "test-cobalt-focus-v1",
    contractStoryId: "test-marketing-story-v1",
    locale: "en-US",
    visualDirection: {
      name: "Test Cobalt Focus",
      composition: "quiet-focus",
      background: "cobalt-spotlight",
      productProof: "immutable-native-capture",
    },
    palette: {
      headline: "#FFFFFF",
      deviceFrame: "#0F172A",
      deviceFrameEdge: "#475569",
      shadow: "#082F7A",
    },
    typography: {
      fontFamily: "sans-serif",
      fontWeight: 700,
    },
    presets: {
      iphone: testPreset("iphone"),
      ipad: testPreset("ipad"),
    },
    preview: {
      width: 600,
      background: "#0F172A",
      label: "#FFFFFF",
      mutedLabel: "#CBD5E1",
      gap: 8,
      padding: 16,
    },
  };
}

async function createFixture(root) {
  const captureRoot = path.join(root, "capture");
  await mkdir(captureRoot, { recursive: true });
  const config = testLayoutConfig();
  const configPath = path.join(root, "layout.json");
  for (const [family, contract] of Object.entries(FAMILY_CONTRACTS)) {
    for (let order = 1; order <= 6; order += 1) {
      const frameId = `frame-${order}`;
      const dimensions =
        contract.orientation === "portrait"
          ? { width: 60, height: 130 }
          : { width: 140, height: 105 };
      const file = `background-${family}-${order}.png`;
      const buffer = await sharp({
        create: {
          width: dimensions.width,
          height: dimensions.height,
          channels: 4,
          background: {
            r: 8 + order * 4,
            g: 42 + order * 5,
            b: 118 + order * 10,
            alpha: 1,
          },
        },
      })
        .png({ adaptiveFiltering: false, compressionLevel: 9 })
        .toBuffer();
      await writeFile(path.join(root, file), buffer);
      config.presets[family].backgroundTemplates[frameId] = {
        file,
        sha256: sha256(buffer),
        pixelDimensions: dimensions,
        fit: "cover",
        generatedWith: "openai-imagegen",
      };
    }
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const frames = [];
  for (let order = 1; order <= 6; order += 1) {
    const suffix = `frame-${order}`;
    const frame = {
      order,
      frameId: suffix,
      captureId: `marketing-${String(order).padStart(2, "0")}-${suffix}`,
      copyKey: suffix,
      headline:
        order === 4 ? "Make Every Mistake Count" : `Practice Frame ${order}`,
      supporting: `Supporting copy for frame ${order}.`,
      captures: {},
    };
    for (const [family, contract] of Object.entries(FAMILY_CONTRACTS)) {
      const directory = `${family}-${contract.displayGroup}-${contract.orientation}`;
      const fileName = `${frame.captureId}.png`;
      const relativeFile = path.join(directory, fileName);
      const absoluteFile = path.join(captureRoot, relativeFile);
      await mkdir(path.dirname(absoluteFile), { recursive: true });
      const buffer = await sharp({
        create: {
          width: contract.dimensions.width,
          height: contract.dimensions.height,
          channels: 4,
          background: {
            r: 22 + order * 12,
            g: family === "iphone" ? 74 : 112,
            b: 96 + order * 9,
            alpha: 1,
          },
        },
      })
        .png({ adaptiveFiltering: false, compressionLevel: 9 })
        .toBuffer();
      await writeFile(absoluteFile, buffer);
      frame.captures[family] = {
        order,
        frameId: frame.frameId,
        captureId: frame.captureId,
        copyKey: frame.copyKey,
        locale: "en-US",
        deviceFamily: family,
        displayGroup: contract.displayGroup,
        orientation: contract.orientation,
        pixelDimensions: contract.dimensions,
        sourceCommit: "1234567890123456789012345678901234567890",
        file: relativeFile,
        fileName,
        sha256: sha256(buffer),
      };
    }
    frames.push(frame);
  }

  const manifest = {
    schemaVersion: 1,
    storyId: config.contractStoryId,
    locale: "en-US",
    sourceBuild: {
      sourceCommit: "1234567890123456789012345678901234567890",
    },
    targets: Object.fromEntries(
      Object.entries(FAMILY_CONTRACTS).map(([family, contract]) => [
        family,
        {
          deviceFamily: family,
          displayGroup: contract.displayGroup,
          orientation: contract.orientation,
        },
      ]),
    ),
    frames,
  };
  const manifestPath = path.join(captureRoot, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    captureRoot,
    config,
    configPath,
    manifest,
    manifestPath,
  };
}

test("headline wrapping and layout keep the approved copy inside safe areas", () => {
  const parsed = parseArgs([
    "--",
    "--capture-root",
    "/tmp/raw",
    "--output-dir",
    "/tmp/composed",
    "--platform",
    "app-store",
    "--orientation",
    "landscape",
  ]);
  assert.equal(parsed.captureRoot, "/tmp/raw");
  assert.equal(parsed.platform, "app-store");
  assert.equal(parsed.orientation, "landscape");
  assert.deepEqual(wrapHeadline("Build Tactical Intuition", 20), [
    "Build Tactical",
    "Intuition",
  ]);
  assert.deepEqual(wrapHeadline("Make Every Mistake Count", 20), [
    "Make Every",
    "Mistake Count",
  ]);
  assert.throws(
    () => wrapHeadline("UnbreakableSupercalifragilistic", 20),
    /cannot fit two/,
  );

  for (const family of Object.keys(FAMILY_CONTRACTS)) {
    const contract = FAMILY_CONTRACTS[family];
    const layout = calculateLayout({
      canvas: contract.dimensions,
      preset: testPreset(family),
      source: contract.dimensions,
    });
    assert.ok(layout.frame.x >= 0);
    assert.ok(layout.frame.y > layout.title.top + layout.title.fontSize);
    assert.ok(layout.frame.x + layout.frame.width <= contract.dimensions.width);
    assert.ok(layout.frame.y + layout.frame.height <= contract.dimensions.height);
  }
});

test("full export is deterministic and preserves the six-frame device contracts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-marketing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);
  const firstOutput = path.join(root, "output-a");
  const secondOutput = path.join(root, "output-b");
  const baseOptions = {
    captureRoot: fixture.captureRoot,
    layoutConfig: fixture.configPath,
    locale: "en-US",
  };

  const first = await composeMarketingAssets({
    ...baseOptions,
    outputDir: firstOutput,
  });
  const second = await composeMarketingAssets({
    ...baseOptions,
    outputDir: secondOutput,
  });

  assert.equal(first.manifest.mode, "full-export");
  assert.equal(first.manifest.platform, "app-store");
  assert.equal(first.manifest.artifacts.length, 12);
  assert.equal(first.manifest.backgroundTemplates.length, 12);
  assert.equal(first.manifest.contactSheets.length, 2);
  assert.equal(
    new Set(first.manifest.backgroundTemplates.map(({ sha256 }) => sha256)).size,
    12,
  );
  assert.deepEqual(first.manifest, second.manifest);
  for (const artifact of first.manifest.artifacts) {
    const firstBytes = await readFile(path.join(firstOutput, artifact.file));
    const secondBytes = await readFile(path.join(secondOutput, artifact.file));
    assert.equal(sha256(firstBytes), artifact.sha256);
    assert.equal(sha256(secondBytes), artifact.sha256);
    assert.deepEqual(
      await sharp(firstBytes).metadata().then(({ width, height }) => ({
        width,
        height,
      })),
      artifact.dimensions,
    );
  }
});

test("font and rendered-copy contracts fail before unsafe export", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-copy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);

  const invalidFontConfig = structuredClone(fixture.config);
  invalidFontConfig.typography.fontFamily = "Missing Marketing Font";
  const invalidFontConfigPath = path.join(root, "invalid-font-layout.json");
  await writeFile(
    invalidFontConfigPath,
    `${JSON.stringify(invalidFontConfig, null, 2)}\n`,
  );
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      layoutConfig: invalidFontConfigPath,
      outputDir: path.join(root, "invalid-font-output"),
    }),
    /typography fontFamily must be sans-serif/,
  );

  const invalidMarginConfig = structuredClone(fixture.config);
  invalidMarginConfig.presets.iphone.title.leftRatio = 0.9;
  invalidMarginConfig.presets.iphone.title.maxWidthRatio = 0.2;
  const invalidMarginConfigPath = path.join(root, "invalid-margin-layout.json");
  await writeFile(
    invalidMarginConfigPath,
    `${JSON.stringify(invalidMarginConfig, null, 2)}\n`,
  );
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      layoutConfig: invalidMarginConfigPath,
      outputDir: path.join(root, "invalid-margin-output"),
    }),
    /invalid safe-area or product layout/,
  );

  const unsafeCopyConfig = structuredClone(fixture.config);
  unsafeCopyConfig.presets.iphone.title.maxWidthRatio = 0.12;
  const unsafeCopyConfigPath = path.join(root, "unsafe-copy-layout.json");
  await writeFile(
    unsafeCopyConfigPath,
    `${JSON.stringify(unsafeCopyConfig, null, 2)}\n`,
  );
  const unsafeCopyManifest = structuredClone(fixture.manifest);
  unsafeCopyManifest.frames[0].headline = "WWWW WWWW";
  const unsafeCopyManifestPath = path.join(root, "unsafe-copy-manifest.json");
  await writeFile(
    unsafeCopyManifestPath,
    `${JSON.stringify(unsafeCopyManifest, null, 2)}\n`,
  );
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      deviceFamily: "iphone",
      layoutConfig: unsafeCopyConfigPath,
      manifest: unsafeCopyManifestPath,
      outputDir: path.join(root, "unsafe-copy-output"),
    }),
    /headline exceeds the rendered safe area/,
  );
});

test("platform and orientation select config-defined presets", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-preset-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);
  const result = await composeMarketingAssets({
    captureRoot: fixture.captureRoot,
    deviceFamily: "all",
    layoutConfig: fixture.configPath,
    orientation: "landscape",
    outputDir: path.join(root, "ipad-output"),
    platform: "app-store",
  });

  assert.deepEqual(result.manifest.deviceFamilies, ["ipad"]);
  assert.equal(result.manifest.artifacts.length, 6);
  assert.equal(result.manifest.contactSheets.length, 1);
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      layoutConfig: fixture.configPath,
      orientation: "portrait",
      outputDir: path.join(root, "no-match"),
      platform: "google-play",
    }),
    /no layout preset matches platform=google-play/,
  );
});

test("preview-only mode writes contact sheets without final App Store frames", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);
  const outputDir = path.join(root, "preview");
  const result = await composeMarketingAssets({
    captureRoot: fixture.captureRoot,
    layoutConfig: fixture.configPath,
    outputDir,
    previewOnly: true,
  });

  assert.equal(result.manifest.mode, "preview-only");
  assert.deepEqual(result.manifest.artifacts, []);
  assert.equal(result.manifest.contactSheets.length, 2);
  assert.equal(
    await exists(path.join(outputDir, "preview-iphone-contact-sheet.png")),
    true,
  );
  assert.equal(
    await exists(path.join(outputDir, "iphone-test-phone-portrait")),
    false,
  );
});

test("imagegen background templates are immutable, frame-specific inputs", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-background-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);
  const config = structuredClone(fixture.config);
  config.presets.iphone.backgroundTemplates["frame-1"].sha256 = "0".repeat(64);
  const configPath = path.join(root, "tampered-layout.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      layoutConfig: configPath,
      outputDir: path.join(root, "output"),
    }),
    /background template SHA-256 does not match/,
  );

  const duplicateConfig = structuredClone(fixture.config);
  duplicateConfig.presets.iphone.backgroundTemplates["frame-2"] =
    structuredClone(
      duplicateConfig.presets.iphone.backgroundTemplates["frame-1"],
    );
  const duplicateConfigPath = path.join(root, "duplicate-layout.json");
  await writeFile(
    duplicateConfigPath,
    `${JSON.stringify(duplicateConfig, null, 2)}\n`,
  );
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      layoutConfig: duplicateConfigPath,
      outputDir: path.join(root, "duplicate-output"),
    }),
    /must use a distinct background/,
  );
});

test("source validation fails closed for tampering, wrong orientation, and path escape", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);

  const cases = [
    {
      expected: /PNG SHA-256 does not match/,
      mutate(manifest) {
        manifest.frames[0].captures.iphone.sha256 = "0".repeat(64);
      },
      name: "hash",
    },
    {
      expected: /orientation landscape does not match portrait/,
      mutate(manifest) {
        manifest.frames[0].captures.iphone.orientation = "landscape";
      },
      name: "orientation",
    },
    {
      expected: /unsupported size 121x260/,
      mutate(manifest) {
        manifest.frames[0].captures.iphone.pixelDimensions.width = 121;
      },
      name: "dimensions",
    },
    {
      expected: /capture path escapes/,
      mutate(manifest) {
        manifest.frames[0].captures.iphone.file = "../outside.png";
      },
      name: "path",
    },
  ];

  for (const testCase of cases) {
    const manifest = structuredClone(fixture.manifest);
    testCase.mutate(manifest);
    const manifestPath = path.join(root, `${testCase.name}.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(
      composeMarketingAssets({
        captureRoot: fixture.captureRoot,
        layoutConfig: fixture.configPath,
        manifest: manifestPath,
        outputDir: path.join(root, `output-${testCase.name}`),
      }),
      testCase.expected,
    );
  }
});

test("composition refuses to write inside the immutable capture root", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);

  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      layoutConfig: fixture.configPath,
      outputDir: path.join(fixture.captureRoot, "composed"),
    }),
    /outside the immutable raw capture directory/,
  );

  const linkedOutput = path.join(root, "linked-output");
  await symlink(fixture.captureRoot, linkedOutput, "dir");
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      layoutConfig: fixture.configPath,
      outputDir: linkedOutput,
    }),
    /outside the immutable raw capture directory/,
  );
});
