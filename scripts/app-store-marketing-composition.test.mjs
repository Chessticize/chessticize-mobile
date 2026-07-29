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

const PHOTO_LAYOUT_URL = new URL(
  "../.codex/skills/chessticize-app-store-marketing/assets/app-store-marketing-layout-v2.json",
  import.meta.url,
);

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

async function rgbAt(input, x, y) {
  const pixel = await sharp(input)
    .extract({
      height: 1,
      left: Math.round(x),
      top: Math.round(y),
      width: 1,
    })
    .removeAlpha()
    .raw()
    .toBuffer();
  return [...pixel.subarray(0, 3)];
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

function testFrameContract(order) {
  const suffix = `frame-${order}`;
  const captureId = `marketing-${String(order).padStart(2, "0")}-${suffix}`;
  return {
    order,
    frameId: suffix,
    captureId,
    copyKey: suffix,
    headline:
      order === 4 ? "Make Every Mistake Count" : `Practice Frame ${order}`,
    supporting: `Supporting copy for frame ${order}.`,
    fileName: `${captureId}.png`,
  };
}

function testLayoutConfig() {
  return {
    schemaVersion: 1,
    layoutId: "test-cobalt-focus-v1",
    contractStoryId: "test-marketing-story-v1",
    locale: "en-US",
    frames: Array.from({ length: 6 }, (_, index) =>
      testFrameContract(index + 1),
    ),
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
    const contractFrame = config.frames[order - 1];
    const frame = {
      order: contractFrame.order,
      frameId: contractFrame.frameId,
      captureId: contractFrame.captureId,
      copyKey: contractFrame.copyKey,
      headline: contractFrame.headline,
      supporting: contractFrame.supporting,
      captures: {},
    };
    for (const [family, contract] of Object.entries(FAMILY_CONTRACTS)) {
      const directory = `${family}-${contract.displayGroup}-${contract.orientation}`;
      const fileName = contractFrame.fileName;
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

function photographicScene({ family, openBezel = false, order, widthDelta = 0 }) {
  const contract = FAMILY_CONTRACTS[family];
  const dimensions =
    contract.orientation === "portrait"
      ? { height: 130, width: 60 }
      : { height: 105, width: 140 };
  const baseDevice =
    family === "iphone"
      ? {
          inner: { height: 61, rx: 5, width: 28, x: 16, y: 36 },
          outer: { height: 74, rx: 7, width: 32, x: 14, y: 32 },
        }
      : {
          inner: { height: 60, rx: 4, width: 80, x: 30, y: 27 },
          outer: { height: 70, rx: 6, width: 90, x: 25, y: 22 },
        };
  const device = {
    inner: baseDevice.inner,
    outer: {
      ...baseDevice.outer,
      width: baseDevice.outer.width + widthDelta,
      x: baseDevice.outer.x - Math.floor(widthDelta / 2),
    },
  };
  const background = `rgb(${224 + order},${235 + order},${241 + order})`;
  const headlineX = family === "iphone" ? 6 : 12;
  const headlineWidth = family === "iphone" ? 28 : 42;
  const opening = openBezel
    ? `<rect x="${device.inner.x}" y="${device.outer.y}" width="${device.inner.width}" height="${device.inner.y - device.outer.y + 2}" fill="${background}"/>`
    : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}">
      <rect width="100%" height="100%" fill="${background}"/>
      <rect x="${headlineX}" y="6" width="${headlineWidth}" height="8" rx="1" fill="#081221"/>
      <rect x="${device.outer.x}" y="${device.outer.y}" width="${device.outer.width}" height="${device.outer.height}" rx="${device.outer.rx}" fill="#101214"/>
      ${opening}
      <rect x="${device.inner.x}" y="${device.inner.y}" width="${device.inner.width}" height="${device.inner.height}" rx="${device.inner.rx}" fill="#F8FAFC"/>
    </svg>`,
  );
}

async function createPhotographicFixture(root) {
  const fixture = await createFixture(root);
  const config = structuredClone(fixture.config);
  config.layoutId = "test-photo-studio-a-v2";
  config.compositionMode = "photographic-device";
  config.visualDirection = {
    name: "Test Photo Studio A",
    composition: "product-first-photographic-device",
    background: "warm-white-icy-blue-chessboard",
    productProof: "immutable-native-capture-in-exact-generated-device-silhouette",
  };

  for (const [family, contract] of Object.entries(FAMILY_CONTRACTS)) {
    config.presets[family].photographicDevice = {
      darkThreshold: 58,
      barrierDilation: 1,
      screenAspectTolerance: 0.04,
      maskAreaMinRatio: 0.6,
      maskAreaMaxRatio: 1.08,
      deviceWidthConsistencyTolerance: 0.02,
      deviceHeightConsistencyTolerance: 0.02,
      dynamicIsland: family === "iphone",
    };
    for (let order = 1; order <= 6; order += 1) {
      const frameId = `frame-${order}`;
      const template =
        config.presets[family].backgroundTemplates[frameId];
      const dimensions =
        contract.orientation === "portrait"
          ? { height: 130, width: 60 }
          : { height: 105, width: 140 };
      const buffer = await sharp(photographicScene({ family, order }))
        .png({ adaptiveFiltering: false, compressionLevel: 9 })
        .toBuffer();
      await writeFile(path.join(root, template.file), buffer);
      template.pixelDimensions = dimensions;
      template.sha256 = sha256(buffer);
    }
  }
  await writeFile(
    fixture.configPath,
    `${JSON.stringify(config, null, 2)}\n`,
  );
  return {
    ...fixture,
    config,
  };
}

async function replacePhotographicScene(
  fixture,
  { family, openBezel = false, order, widthDelta = 0 },
) {
  const frameId = `frame-${order}`;
  const template =
    fixture.config.presets[family].backgroundTemplates[frameId];
  const buffer = await sharp(
    photographicScene({ family, openBezel, order, widthDelta }),
  )
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(path.dirname(fixture.configPath), template.file), buffer);
  template.sha256 = sha256(buffer);
  await writeFile(
    fixture.configPath,
    `${JSON.stringify(fixture.config, null, 2)}\n`,
  );
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

test("default Photo Studio A scene templates are immutable and hash-bound", async () => {
  const config = JSON.parse(await readFile(PHOTO_LAYOUT_URL, "utf8"));
  assert.equal(config.layoutId, "chessticize-photo-studio-a-v2");
  assert.equal(config.compositionMode, "photographic-device");
  assert.equal(config.visualDirection.name, "Photo Studio A");
  assert.deepEqual(
    config.frames.map(({ headline }) => headline),
    [
      "Build Tactical Intuition",
      "Choose the Best Move",
      "Focus Your Practice",
      "Make Every Mistake Count",
      "See Your Progress",
      "Private. Offline. Open Source.",
    ],
  );

  const hashes = new Set();
  for (const preset of Object.values(config.presets)) {
    assert.equal(
      Object.keys(preset.backgroundTemplates).length,
      6,
    );
    for (const template of Object.values(preset.backgroundTemplates)) {
      const templateUrl = new URL(template.file, PHOTO_LAYOUT_URL);
      const buffer = await readFile(templateUrl);
      const metadata = await sharp(buffer).metadata();
      assert.equal(sha256(buffer), template.sha256);
      assert.deepEqual(
        { height: metadata.height, width: metadata.width },
        template.pixelDimensions,
      );
      hashes.add(template.sha256);
    }
  }
  assert.equal(hashes.size, 12);
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
    const metadata = await sharp(firstBytes).metadata();
    assert.deepEqual(
      { height: metadata.height, width: metadata.width },
      artifact.dimensions,
    );
    assert.equal(
      metadata.hasAlpha,
      false,
      `${artifact.file} must not contain transparency`,
    );
  }
});

test("photographic export uses exact bezel masks and enforces device consistency", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chessticize-photo-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createPhotographicFixture(root);
  const firstOutput = path.join(root, "output-a");
  const secondOutput = path.join(root, "output-b");
  const options = {
    captureRoot: fixture.captureRoot,
    layoutConfig: fixture.configPath,
  };
  const first = await composeMarketingAssets({
    ...options,
    outputDir: firstOutput,
  });
  const second = await composeMarketingAssets({
    ...options,
    outputDir: secondOutput,
  });

  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(first.manifest.layoutId, "test-photo-studio-a-v2");
  assert.equal(first.manifest.artifacts.length, 12);
  assert.equal(first.manifest.contactSheets.length, 3);
  assert.deepEqual(
    first.manifest.contactSheets.map(({ kind }) => kind),
    ["overview", "overview", "corner-audit"],
  );
  assert.ok(first.manifest.deviceConsistency);
  for (const artifact of first.manifest.artifacts) {
    assert.equal(
      artifact.deviceGeometry.maskStrategy,
      "closed-bezel-flood-fill",
    );
    assert.ok(artifact.deviceGeometry.exactMaskPixelCount > 0);
    assert.ok(artifact.deviceGeometry.outputScreen.width > 0);
    assert.ok(artifact.deviceGeometry.outputScreen.height > 0);
    const outputPath = path.join(firstOutput, artifact.file);
    assert.equal(await exists(outputPath), true);
    assert.equal(
      (await sharp(outputPath).metadata()).hasAlpha,
      false,
      `${artifact.file} must not contain transparency`,
    );
    const sourcePath = path.join(
      fixture.captureRoot,
      artifact.sourceFile,
    );
    const sourceMetadata = await sharp(sourcePath).metadata();
    const sourceColor = await rgbAt(
      sourcePath,
      sourceMetadata.width / 2,
      sourceMetadata.height / 2,
    );
    const screen = artifact.deviceGeometry.outputScreen;
    assert.deepEqual(
      await rgbAt(
        outputPath,
        screen.left + screen.width / 2,
        screen.top + screen.height / 2,
      ),
      sourceColor,
      `${artifact.deviceFamily} ${artifact.frameId} must replace the generated screen with raw capture pixels`,
    );
    assert.notDeepEqual(
      await rgbAt(outputPath, screen.left + 1, screen.top + 1),
      sourceColor,
      `${artifact.deviceFamily} ${artifact.frameId} must preserve the rounded bezel corner outside the exact mask`,
    );
  }
  assert.equal(
    await exists(path.join(firstOutput, "preview-iphone-corners.png")),
    true,
  );
});

test("photographic export rejects a screen opening with the wrong aspect", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "chessticize-photo-aspect-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createPhotographicFixture(root);
  fixture.config.presets.iphone.photographicDevice.screenAspectTolerance =
    0.001;
  await writeFile(
    fixture.configPath,
    `${JSON.stringify(fixture.config, null, 2)}\n`,
  );

  await assert.rejects(
    composeMarketingAssets({
      captureRoot: fixture.captureRoot,
      deviceFamily: "iphone",
      layoutConfig: fixture.configPath,
      outputDir: path.join(root, "output"),
    }),
    /photographic screen aspect/,
  );
});

test("photographic export enforces headline and product safe areas before writing", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "chessticize-photo-safe-area-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const headlineFixture = await createPhotographicFixture(
    path.join(root, "headline"),
  );
  headlineFixture.config.presets.iphone.title.leftRatio = 0.2;
  headlineFixture.config.presets.iphone.title.maxWidthRatio = 0.8;
  await writeFile(
    headlineFixture.configPath,
    `${JSON.stringify(headlineFixture.config, null, 2)}\n`,
  );
  const headlineOutput = path.join(root, "headline-output");
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: headlineFixture.captureRoot,
      deviceFamily: "iphone",
      layoutConfig: headlineFixture.configPath,
      outputDir: headlineOutput,
    }),
    /headline pixels exceed the configured safe area/,
  );
  assert.equal(await exists(headlineOutput), false);

  const deviceFixture = await createPhotographicFixture(
    path.join(root, "device"),
  );
  deviceFixture.config.presets.iphone.product.topRatio = 0.4;
  deviceFixture.config.presets.iphone.product.maxHeightRatio = 0.6;
  await writeFile(
    deviceFixture.configPath,
    `${JSON.stringify(deviceFixture.config, null, 2)}\n`,
  );
  const deviceOutput = path.join(root, "device-output");
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: deviceFixture.captureRoot,
      deviceFamily: "iphone",
      layoutConfig: deviceFixture.configPath,
      outputDir: deviceOutput,
    }),
    /device exceeds the configured product safe area/,
  );
  assert.equal(await exists(deviceOutput), false);
});

test("photographic validation rejects open bezels and device drift without partial outputs", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "chessticize-photo-fail-closed-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const openFixture = await createPhotographicFixture(path.join(root, "open"));
  await replacePhotographicScene(openFixture, {
    family: "iphone",
    openBezel: true,
    order: 6,
  });
  const openOutput = path.join(root, "open-output");
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: openFixture.captureRoot,
      deviceFamily: "iphone",
      layoutConfig: openFixture.configPath,
      outputDir: openOutput,
    }),
    /screen opening|bezel is open/,
  );
  assert.equal(await exists(openOutput), false);

  const driftFixture = await createPhotographicFixture(
    path.join(root, "drift"),
  );
  await replacePhotographicScene(driftFixture, {
    family: "iphone",
    order: 6,
    widthDelta: 8,
  });
  const driftOutput = path.join(root, "drift-output");
  await assert.rejects(
    composeMarketingAssets({
      captureRoot: driftFixture.captureRoot,
      deviceFamily: "iphone",
      layoutConfig: driftFixture.configPath,
      outputDir: driftOutput,
    }),
    /device dimensions exceed their consistency tolerance/,
  );
  assert.equal(await exists(driftOutput), false);
});

test("canonical frame copy, order, and filenames fail closed", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "chessticize-frame-contract-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createFixture(root);
  const cases = [
    {
      expected: /headline does not match the layout contract/,
      mutate(manifest) {
        manifest.frames[1].headline = "Train Your Blunder Radar";
      },
      name: "headline",
    },
    {
      expected: /fileName does not match the layout contract/,
      mutate(manifest) {
        manifest.frames[1].captures.iphone.fileName =
          "marketing-02-renamed.png";
      },
      name: "filename",
    },
    {
      expected: /frame 1 has order 2/,
      mutate(manifest) {
        [manifest.frames[0], manifest.frames[1]] = [
          manifest.frames[1],
          manifest.frames[0],
        ];
      },
      name: "order",
    },
  ];

  for (const testCase of cases) {
    const manifest = structuredClone(fixture.manifest);
    testCase.mutate(manifest);
    const manifestPath = path.join(root, `${testCase.name}.json`);
    const outputDir = path.join(root, `output-${testCase.name}`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(
      composeMarketingAssets({
        captureRoot: fixture.captureRoot,
        layoutConfig: fixture.configPath,
        manifest: manifestPath,
        outputDir,
      }),
      testCase.expected,
    );
    assert.equal(await exists(outputDir), false);
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
  unsafeCopyConfig.frames[0].headline = "WWWW WWWW";
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

test("imagegen scene templates are immutable, frame-specific inputs", async (t) => {
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
    /scene template SHA-256 does not match/,
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
