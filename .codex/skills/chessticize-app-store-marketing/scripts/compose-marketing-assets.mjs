#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SKILL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_LAYOUT_CONFIG = path.join(
  SKILL_ROOT,
  "assets",
  "app-store-marketing-layout-v2.json",
);
const DEFAULT_PLATFORM = "app-store";
const SUPPORTED_FONT_FAMILY = "sans-serif";
const EXPECTED_FRAME_COUNT = 6;
const COMPOSITION_MODES = new Set([
  "flat-device-frame",
  "photographic-device",
]);
const FRAME_CONTRACT_KEYS = [
  "frameId",
  "captureId",
  "copyKey",
  "headline",
  "supporting",
];

function fail(message) {
  throw new Error(`[marketing-composition] ${message}`);
}

function parseOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${option} requires a value`);
  }
  return value;
}

export function parseArgs(argv) {
  const options = {
    deviceFamily: "all",
    layoutConfig: DEFAULT_LAYOUT_CONFIG,
    locale: "en-US",
    orientation: "all",
    platform: DEFAULT_PLATFORM,
    previewOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    switch (option) {
      case "--":
        break;
      case "--capture-root":
        options.captureRoot = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--manifest":
        options.manifest = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--layout-config":
        options.layoutConfig = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--locale":
        options.locale = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--platform":
        options.platform = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--device-family":
        options.deviceFamily = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--orientation":
        options.orientation = parseOptionValue(argv, index, option);
        index += 1;
        break;
      case "--preview-only":
        options.previewOnly = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        fail(`unknown option: ${option}`);
    }
  }

  if (options.help) {
    return options;
  }
  if (!options.captureRoot) {
    fail("--capture-root is required");
  }
  if (!options.outputDir) {
    fail("--output-dir is required");
  }
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(options.platform)) {
    fail("--platform must be a safe platform identifier");
  }
  if (!["all", "portrait", "landscape"].includes(options.orientation)) {
    fail("--orientation must be one of: all, portrait, landscape");
  }
  options.manifest ??= path.join(options.captureRoot, "manifest.json");
  return options;
}

function printUsage() {
  process.stdout.write(`Usage:
  pnpm app-store:compose-marketing -- \\
    --capture-root <raw-capture-directory> \\
    --output-dir <composed-output-directory> \\
    [--manifest <manifest.json>] \\
    [--layout-config <layout.json>] \\
    [--locale en-US] \\
    [--platform app-store] \\
    [--device-family all|iphone|ipad] \\
    [--orientation all|portrait|landscape] \\
    [--preview-only]

The command validates all selected raw captures before writing deterministic
App Store PNGs, per-device contact sheets, and composition-manifest.json.
`);
}

async function readJson(filePath, label) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`could not read ${label} at ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(filePath) {
  return sha256Buffer(await readFile(filePath));
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveProspectiveRealPath(candidatePath) {
  let cursor = path.resolve(candidatePath);
  const missingSegments = [];
  while (true) {
    try {
      const resolvedAncestor = await realpath(cursor);
      return path.join(resolvedAncestor, ...missingSegments.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") {
        fail(`could not resolve output directory ${candidatePath}: ${error.message}`);
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        fail(`could not resolve output directory: ${candidatePath}`);
      }
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function assertOutputSeparated(captureRoot, outputDir) {
  const resolvedCaptureRoot = path.resolve(captureRoot);
  const resolvedOutputDir = path.resolve(outputDir);
  if (
    resolvedCaptureRoot === resolvedOutputDir ||
    isPathInside(resolvedCaptureRoot, resolvedOutputDir)
  ) {
    fail("output directory must be outside the immutable raw capture directory");
  }
}

function acceptedSize(preset, dimensions) {
  return preset.acceptedSourceSizes.some(
    (size) =>
      size.width === dimensions.width && size.height === dimensions.height,
  );
}

function isFiniteRatio(value, { allowZero = false, max = 1 } = {}) {
  return (
    Number.isFinite(value) &&
    (allowZero ? value >= 0 : value > 0) &&
    value <= max
  );
}

function isHexColor(value) {
  return (
    typeof value === "string" &&
    /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/iu.test(value)
  );
}

function validateCanonicalFrames(config, compositionMode) {
  if (config.frames === undefined) {
    if (compositionMode === "photographic-device") {
      fail("photographic layout config must define its canonical frames");
    }
    return;
  }
  if (
    !Array.isArray(config.frames) ||
    config.frames.length !== EXPECTED_FRAME_COUNT
  ) {
    fail(`layout config must define exactly ${EXPECTED_FRAME_COUNT} frames`);
  }
  const seenFrameIds = new Set();
  for (let index = 0; index < config.frames.length; index += 1) {
    const frame = config.frames[index];
    const expectedOrder = index + 1;
    if (frame.order !== expectedOrder) {
      fail(`layout frame ${expectedOrder} has order ${frame.order}`);
    }
    for (const key of [...FRAME_CONTRACT_KEYS, "fileName"]) {
      if (typeof frame[key] !== "string" || frame[key].trim() === "") {
        fail(`layout frame ${expectedOrder} is missing ${key}`);
      }
    }
    if (
      frame.fileName !== path.basename(frame.fileName) ||
      frame.fileName !== `${frame.captureId}.png`
    ) {
      fail(`layout frame ${expectedOrder} has an unsafe canonical filename`);
    }
    if (seenFrameIds.has(frame.frameId)) {
      fail(`layout config has duplicate frameId: ${frame.frameId}`);
    }
    seenFrameIds.add(frame.frameId);
  }
}

function validateLayoutConfig(config) {
  if (config.schemaVersion !== 1) {
    fail(`unsupported layout schema version: ${config.schemaVersion}`);
  }
  const compositionMode = config.compositionMode ?? "flat-device-frame";
  if (!COMPOSITION_MODES.has(compositionMode)) {
    fail(`unsupported composition mode: ${compositionMode}`);
  }
  if (!config.layoutId || !config.contractStoryId || !config.locale) {
    fail("layout config must define layoutId, contractStoryId, and locale");
  }
  validateCanonicalFrames(config, compositionMode);
  for (const section of [
    "palette",
    "typography",
    "presets",
    "preview",
    "visualDirection",
  ]) {
    if (!config[section] || typeof config[section] !== "object") {
      fail(`layout config is missing its ${section} section`);
    }
  }
  if (config.typography.fontFamily !== SUPPORTED_FONT_FAMILY) {
    fail(
      `typography fontFamily must be ${SUPPORTED_FONT_FAMILY}; named fonts can silently substitute`,
    );
  }
  if (
    !Number.isFinite(config.typography.fontWeight) ||
    config.typography.fontWeight < 100 ||
    config.typography.fontWeight > 900 ||
    !Number.isInteger(config.preview.width) ||
    config.preview.width <= 0
  ) {
    fail("layout config has an invalid typography or preview contract");
  }
  if (
    !["headline", "deviceFrame", "deviceFrameEdge", "shadow"].every((key) =>
      isHexColor(config.palette[key]),
    ) ||
    !["background", "label", "mutedLabel"].every((key) =>
      isHexColor(config.preview[key]),
    ) ||
    !Number.isInteger(config.preview.gap) ||
    config.preview.gap < 0 ||
    !Number.isInteger(config.preview.padding) ||
    config.preview.padding < 0
  ) {
    fail("layout config has an invalid color or preview spacing contract");
  }
  const presets = Object.entries(config.presets ?? {});
  if (presets.length === 0) {
    fail("layout config must define at least one platform preset");
  }
  for (const [family, preset] of presets) {
    if (
      !/^[a-z0-9][a-z0-9.-]*$/u.test(family) ||
      preset.deviceFamily !== family ||
      !/^[a-z0-9][a-z0-9.-]*$/u.test(preset.platform ?? "") ||
      !preset.displayGroup ||
      !["portrait", "landscape"].includes(preset.orientation) ||
      typeof preset.reviewLabel !== "string" ||
      preset.reviewLabel.trim() === "" ||
      !preset.backgroundTemplates ||
      typeof preset.backgroundTemplates !== "object" ||
      Object.keys(preset.backgroundTemplates).length !== EXPECTED_FRAME_COUNT ||
      !preset.title ||
      !preset.product ||
      !Array.isArray(preset.acceptedSourceSizes) ||
      preset.acceptedSourceSizes.length === 0
    ) {
      fail(`${family} preset has an invalid target contract`);
    }
    if (!/^[a-z0-9][a-z0-9.-]*$/u.test(preset.displayGroup)) {
      fail(`${family} preset must use a safe display group`);
    }
    const templateFrameIds = Object.keys(preset.backgroundTemplates);
    if (
      config.frames &&
      (templateFrameIds.length !== config.frames.length ||
        config.frames.some(
          ({ frameId }) => !preset.backgroundTemplates[frameId],
        ))
    ) {
      fail(`${family} scene templates do not match the canonical frames`);
    }
    if (
      !preset.acceptedSourceSizes.every(
        ({ height, width }) =>
          Number.isInteger(width) &&
          width > 0 &&
          Number.isInteger(height) &&
          height > 0,
      )
    ) {
      fail(`${family} preset contains an invalid accepted source size`);
    }
    const title = preset.title;
    const product = preset.product;
    if (
      !isFiniteRatio(title.leftRatio, { allowZero: true }) ||
      !isFiniteRatio(title.topRatio, { allowZero: true }) ||
      !isFiniteRatio(title.maxWidthRatio) ||
      title.leftRatio + title.maxWidthRatio > 1 ||
      !isFiniteRatio(title.fontSizeRatio, { max: 0.25 }) ||
      !isFiniteRatio(title.lineHeightRatio, { max: 2 }) ||
      !Number.isInteger(title.maxCharactersPerLine) ||
      title.maxCharactersPerLine <= 0 ||
      !["start", "middle"].includes(title.align) ||
      !isFiniteRatio(product.topRatio, { allowZero: true }) ||
      !isFiniteRatio(product.maxWidthRatio) ||
      !isFiniteRatio(product.maxHeightRatio) ||
      product.topRatio + product.maxHeightRatio > 1 ||
      !isFiniteRatio(product.framePaddingRatio, { allowZero: true, max: 0.1 }) ||
      !isFiniteRatio(product.cornerRadiusRatio, { allowZero: true, max: 0.2 }) ||
      !isFiniteRatio(product.edgeWidthRatio, { max: 0.05 }) ||
      !isFiniteRatio(product.shadowBlurRatio, { allowZero: true, max: 0.2 }) ||
      !isFiniteRatio(product.shadowOffsetRatio, { allowZero: true, max: 0.2 })
    ) {
      fail(`${family} preset has an invalid safe-area or product layout`);
    }
    if (compositionMode === "photographic-device") {
      const photographicDevice = preset.photographicDevice;
      if (
        !photographicDevice ||
        !Number.isInteger(photographicDevice.darkThreshold) ||
        photographicDevice.darkThreshold <= 0 ||
        photographicDevice.darkThreshold >= 255 ||
        !Number.isInteger(photographicDevice.barrierDilation) ||
        photographicDevice.barrierDilation < 0 ||
        photographicDevice.barrierDilation > 4 ||
        !isFiniteRatio(photographicDevice.screenAspectTolerance, {
          max: 0.1,
        }) ||
        !isFiniteRatio(photographicDevice.maskAreaMinRatio) ||
        !isFiniteRatio(photographicDevice.maskAreaMaxRatio, { max: 1.5 }) ||
        photographicDevice.maskAreaMinRatio >=
          photographicDevice.maskAreaMaxRatio ||
        !isFiniteRatio(photographicDevice.deviceWidthConsistencyTolerance, {
          max: 0.1,
        }) ||
        !isFiniteRatio(photographicDevice.deviceHeightConsistencyTolerance, {
          max: 0.1,
        }) ||
        typeof photographicDevice.dynamicIsland !== "boolean"
      ) {
        fail(`${family} preset has an invalid photographic device contract`);
      }
    }
  }
}

function selectDeviceFamilies(config, options) {
  const matches = Object.entries(config.presets)
    .filter(([, preset]) => preset.platform === options.platform)
    .filter(
      ([family]) =>
        options.deviceFamily === "all" || family === options.deviceFamily,
    )
    .filter(
      ([, preset]) =>
        options.orientation === "all" ||
        preset.orientation === options.orientation,
    )
    .map(([family]) => family);
  if (matches.length === 0) {
    fail(
      `no layout preset matches platform=${options.platform}, deviceFamily=${options.deviceFamily}, orientation=${options.orientation}`,
    );
  }
  return matches;
}

function validateFrameContract(frame, expectedOrder) {
  if (frame.order !== expectedOrder) {
    fail(`frame ${expectedOrder} has order ${frame.order}`);
  }
  for (const key of FRAME_CONTRACT_KEYS) {
    if (typeof frame[key] !== "string" || frame[key].trim() === "") {
      fail(`frame ${expectedOrder} is missing ${key}`);
    }
  }
}

async function resolveCapturePath(captureRoot, relativeFile) {
  if (
    typeof relativeFile !== "string" ||
    relativeFile === "" ||
    path.isAbsolute(relativeFile)
  ) {
    fail(`capture file must be a non-empty relative path: ${relativeFile}`);
  }

  const resolvedRoot = await realpath(captureRoot);
  const candidate = path.resolve(resolvedRoot, relativeFile);
  if (!isPathInside(resolvedRoot, candidate)) {
    fail(`capture path escapes the raw capture directory: ${relativeFile}`);
  }

  let resolvedFile;
  try {
    resolvedFile = await realpath(candidate);
  } catch (error) {
    fail(`capture file is unavailable: ${relativeFile} (${error.message})`);
  }
  if (!isPathInside(resolvedRoot, resolvedFile)) {
    fail(`capture symlink escapes the raw capture directory: ${relativeFile}`);
  }
  if (path.extname(resolvedFile).toLowerCase() !== ".png") {
    fail(`capture must be a PNG: ${relativeFile}`);
  }
  return resolvedFile;
}

async function validateBackgroundTemplate(configRoot, preset, frameId) {
  const template = preset.backgroundTemplates?.[frameId];
  if (
    !template ||
    typeof template.file !== "string" ||
    template.file === "" ||
    path.isAbsolute(template.file) ||
    template.fit !== "cover" ||
    template.generatedWith !== "openai-imagegen" ||
    !/^[a-f0-9]{64}$/u.test(template.sha256 ?? "")
  ) {
    fail(
      `${preset.deviceFamily} ${frameId} has an invalid imagegen scene template contract`,
    );
  }
  const resolvedRoot = await realpath(configRoot);
  const candidate = path.resolve(resolvedRoot, template.file);
  if (!isPathInside(resolvedRoot, candidate)) {
    fail(
      `${preset.deviceFamily} background path escapes the layout assets directory`,
    );
  }
  let templatePath;
  try {
    templatePath = await realpath(candidate);
  } catch (error) {
    fail(
      `${preset.deviceFamily} scene template is unavailable: ${error.message}`,
    );
  }
  if (!isPathInside(resolvedRoot, templatePath)) {
    fail(
      `${preset.deviceFamily} background symlink escapes the layout assets directory`,
    );
  }
  const metadata = await sharp(templatePath).metadata();
  if (
    metadata.format !== "png" ||
    metadata.width !== template.pixelDimensions?.width ||
    metadata.height !== template.pixelDimensions?.height
  ) {
    fail(
      `${preset.deviceFamily} scene template does not match its PNG dimensions`,
    );
  }
  const orientationMatches =
    preset.orientation === "portrait"
      ? metadata.height > metadata.width
      : metadata.width > metadata.height;
  if (!orientationMatches) {
    fail(
      `${preset.deviceFamily} scene template has the wrong orientation`,
    );
  }
  const actualSha256 = await sha256File(templatePath);
  if (actualSha256 !== template.sha256) {
    fail(`${preset.deviceFamily} scene template SHA-256 does not match`);
  }
  return {
    deviceFamily: preset.deviceFamily,
    file: template.file,
    frameId,
    generatedWith: template.generatedWith,
    path: templatePath,
    pixelDimensions: template.pixelDimensions,
    sha256: template.sha256,
  };
}

export async function validateManifest({
  captureRoot,
  config,
  deviceFamilies,
  locale,
  manifest,
}) {
  validateLayoutConfig(config);
  if (manifest.schemaVersion !== 1) {
    fail(`unsupported capture manifest schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.storyId !== config.contractStoryId) {
    fail(
      `capture story ${manifest.storyId} does not match ${config.contractStoryId}`,
    );
  }
  if (manifest.locale !== locale || config.locale !== locale) {
    fail(
      `locale mismatch: requested ${locale}, capture ${manifest.locale}, layout ${config.locale}`,
    );
  }
  if (
    !Array.isArray(manifest.frames) ||
    manifest.frames.length !== EXPECTED_FRAME_COUNT
  ) {
    fail(`capture manifest must contain exactly ${EXPECTED_FRAME_COUNT} frames`);
  }
  const sourceCommit = manifest.sourceBuild?.sourceCommit;
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit ?? "")) {
    fail("capture manifest must identify one full source commit");
  }

  const seenFrameIds = new Set();
  const validated = [];
  for (let index = 0; index < manifest.frames.length; index += 1) {
    const frame = manifest.frames[index];
    const expectedOrder = index + 1;
    validateFrameContract(frame, expectedOrder);
    const canonicalFrame = config.frames?.[index];
    if (canonicalFrame) {
      for (const key of FRAME_CONTRACT_KEYS) {
        if (frame[key] !== canonicalFrame[key]) {
          fail(
            `frame ${expectedOrder} ${key} does not match the layout contract`,
          );
        }
      }
    }
    if (seenFrameIds.has(frame.frameId)) {
      fail(`duplicate frameId: ${frame.frameId}`);
    }
    seenFrameIds.add(frame.frameId);

    for (const family of deviceFamilies) {
      const preset = config.presets[family];
      const target = manifest.targets?.[family];
      const capture = frame.captures?.[family];
      if (!target || !capture) {
        fail(`frame ${expectedOrder} is missing its ${family} capture contract`);
      }
      for (const key of ["deviceFamily", "displayGroup", "orientation"]) {
        if (target[key] !== preset[key]) {
          fail(
            `${family} target ${key} ${target[key]} does not match ${preset[key]}`,
          );
        }
        if (capture[key] !== preset[key]) {
          fail(
            `frame ${expectedOrder} ${family} ${key} ${capture[key]} does not match ${preset[key]}`,
          );
        }
      }
      for (const key of ["order", "frameId", "captureId", "copyKey"]) {
        if (capture[key] !== frame[key]) {
          fail(
            `frame ${expectedOrder} ${family} capture has mismatched ${key}`,
          );
        }
      }
      if (capture.locale !== locale) {
        fail(`frame ${expectedOrder} ${family} locale is ${capture.locale}`);
      }
      if (
        canonicalFrame &&
        capture.fileName !== canonicalFrame.fileName
      ) {
        fail(
          `frame ${expectedOrder} ${family} fileName does not match the layout contract`,
        );
      }
      if (capture.sourceCommit !== sourceCommit) {
        fail(
          `frame ${expectedOrder} ${family} source commit does not match the manifest`,
        );
      }
      if (!acceptedSize(preset, capture.pixelDimensions ?? {})) {
        const actual = `${capture.pixelDimensions?.width}x${capture.pixelDimensions?.height}`;
        fail(`frame ${expectedOrder} ${family} has unsupported size ${actual}`);
      }
      if (!/^[a-f0-9]{64}$/u.test(capture.sha256 ?? "")) {
        fail(`frame ${expectedOrder} ${family} has an invalid SHA-256`);
      }

      const inputPath = await resolveCapturePath(captureRoot, capture.file);
      const metadata = await sharp(inputPath).metadata();
      if (metadata.format !== "png") {
        fail(`frame ${expectedOrder} ${family} source data is not a PNG`);
      }
      const actualDimensions = {
        width: metadata.width,
        height: metadata.height,
      };
      if (
        actualDimensions.width !== capture.pixelDimensions.width ||
        actualDimensions.height !== capture.pixelDimensions.height
      ) {
        fail(
          `frame ${expectedOrder} ${family} PNG dimensions do not match its manifest`,
        );
      }
      const actualSha256 = await sha256File(inputPath);
      if (actualSha256 !== capture.sha256) {
        fail(`frame ${expectedOrder} ${family} PNG SHA-256 does not match`);
      }

      validated.push({
        capture,
        family,
        frame,
        inputPath,
        preset,
      });
    }
  }
  return validated;
}

function chooseHeadlineSplit(words, maxCharactersPerLine) {
  let best;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    if (
      first.length > maxCharactersPerLine ||
      second.length > maxCharactersPerLine
    ) {
      continue;
    }
    const candidate = {
      lines: [first, second],
      score: Math.max(first.length, second.length) * 3 + Math.abs(first.length - second.length),
    };
    if (!best || candidate.score < best.score) {
      best = candidate;
    }
  }
  return best?.lines;
}

export function wrapHeadline(headline, maxCharactersPerLine) {
  const normalized = headline.trim().replace(/\s+/gu, " ");
  if (!normalized) {
    fail("headline cannot be empty");
  }
  if (normalized.length <= maxCharactersPerLine) {
    return [normalized];
  }
  const words = normalized.split(" ");
  const lines = chooseHeadlineSplit(words, maxCharactersPerLine);
  if (!lines) {
    fail(
      `headline cannot fit two ${maxCharactersPerLine}-character lines: ${headline}`,
    );
  }
  return lines;
}

export function calculateLayout({ canvas, preset, source }) {
  const framePadding = Math.round(canvas.width * preset.product.framePaddingRatio);
  const maxOuterWidth = Math.round(canvas.width * preset.product.maxWidthRatio);
  const maxOuterHeight = Math.round(canvas.height * preset.product.maxHeightRatio);
  const maxInnerWidth = maxOuterWidth - framePadding * 2;
  const maxInnerHeight = maxOuterHeight - framePadding * 2;
  const scale = Math.min(
    maxInnerWidth / source.width,
    maxInnerHeight / source.height,
  );
  const screenshot = {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  };
  const frame = {
    width: screenshot.width + framePadding * 2,
    height: screenshot.height + framePadding * 2,
    x: Math.round((canvas.width - screenshot.width - framePadding * 2) / 2),
    y: Math.round(canvas.height * preset.product.topRatio),
  };
  const title = {
    fontSize: Math.round(canvas.width * preset.title.fontSizeRatio),
    left: Math.round(canvas.width * preset.title.leftRatio),
    maxWidth: Math.round(canvas.width * preset.title.maxWidthRatio),
    top: Math.round(canvas.height * preset.title.topRatio),
  };
  const result = {
    canvas,
    frame: {
      ...frame,
      cornerRadius: Math.round(canvas.width * preset.product.cornerRadiusRatio),
      edgeWidth: Math.max(
        1,
        Math.round(canvas.width * preset.product.edgeWidthRatio),
      ),
      padding: framePadding,
    },
    screenshot: {
      ...screenshot,
      x: frame.x + framePadding,
      y: frame.y + framePadding,
    },
    title,
  };

  const frameRight = result.frame.x + result.frame.width;
  const frameBottom = result.frame.y + result.frame.height;
  if (
    result.frame.x < 0 ||
    result.frame.y < 0 ||
    frameRight > canvas.width ||
    frameBottom > canvas.height
  ) {
    fail("calculated product frame exceeds the export canvas");
  }
  const titleBottom =
    title.top + title.fontSize * preset.title.lineHeightRatio * 2;
  if (title.left < 0 || title.left + title.maxWidth > canvas.width) {
    fail("calculated headline safe area exceeds the export canvas");
  }
  if (titleBottom >= result.frame.y) {
    fail("headline safe area collides with the product frame");
  }
  return result;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function screenCornerRadius(layout) {
  return Math.max(
    1,
    layout.frame.cornerRadius - Math.round(layout.frame.padding * 0.55),
  );
}

function headlineSvg({ config, headline, layout, preset }) {
  const { canvas, title } = layout;
  const lines = wrapHeadline(headline, preset.title.maxCharactersPerLine);
  const titleX =
    preset.title.align === "middle"
      ? Math.round(canvas.width / 2)
      : title.left;
  const textAnchor = preset.title.align === "middle" ? "middle" : "start";
  const lineHeight = Math.round(title.fontSize * preset.title.lineHeightRatio);
  const text = lines
    .map(
      (line, index) =>
        `<tspan x="${titleX}" y="${title.top + title.fontSize + index * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <text fill="${config.palette.headline}" font-family="${SUPPORTED_FONT_FAMILY}" font-size="${title.fontSize}" font-weight="${config.typography.fontWeight}" letter-spacing="${Math.round(title.fontSize * -0.035)}" text-anchor="${textAnchor}">${text}</text>
</svg>`);
}

async function renderValidatedHeadline({ config, headline, layout, preset }) {
  const buffer = await sharp(
    headlineSvg({ config, headline, layout, preset }),
  )
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
  const { info } = await sharp(buffer)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const bounds = {
    bottom: -info.trimOffsetTop + info.height,
    left: -info.trimOffsetLeft,
    right: -info.trimOffsetLeft + info.width,
    top: -info.trimOffsetTop,
  };
  const safeArea = {
    bottom: layout.frame.y,
    left: layout.title.left,
    right: layout.title.left + layout.title.maxWidth,
    top: layout.title.top,
  };
  if (
    bounds.left < safeArea.left ||
    bounds.right > safeArea.right ||
    bounds.top < safeArea.top ||
    bounds.bottom >= safeArea.bottom
  ) {
    fail(
      `headline exceeds the rendered safe area for ${preset.deviceFamily}: ${headline}`,
    );
  }
  return buffer;
}

function frameSvg({ config, layout, preset }) {
  const { canvas, frame } = layout;
  const palette = config.palette;
  const shadowBlur = Math.round(canvas.width * preset.product.shadowBlurRatio);
  const shadowOffset = Math.round(canvas.width * preset.product.shadowOffsetRatio);
  const screenRadius = screenCornerRadius(layout);

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feGaussianBlur stdDeviation="${shadowBlur}"/>
    </filter>
  </defs>
  <rect x="${frame.x}" y="${frame.y + shadowOffset}" width="${frame.width}" height="${frame.height}" rx="${frame.cornerRadius}" fill="${palette.shadow}" opacity="0.46" filter="url(#shadow)"/>
  <rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${frame.cornerRadius}" fill="${palette.deviceFrameEdge}"/>
  <rect x="${frame.x + frame.edgeWidth}" y="${frame.y + frame.edgeWidth}" width="${frame.width - frame.edgeWidth * 2}" height="${frame.height - frame.edgeWidth * 2}" rx="${Math.max(1, frame.cornerRadius - frame.edgeWidth)}" fill="${palette.deviceFrame}"/>
  <rect x="${layout.screenshot.x}" y="${layout.screenshot.y}" width="${layout.screenshot.width}" height="${layout.screenshot.height}" rx="${screenRadius}" fill="${palette.deviceFrame}"/>
</svg>`);
}

async function roundedScreenshot(inputPath, layout) {
  const radius = screenCornerRadius(layout);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.screenshot.width}" height="${layout.screenshot.height}"><rect width="100%" height="100%" rx="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(inputPath)
    .resize(layout.screenshot.width, layout.screenshot.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function isDarkPixel(data, offset, threshold) {
  return (
    data[offset] < threshold &&
    data[offset + 1] < threshold &&
    data[offset + 2] < threshold
  );
}

async function largestDarkComponent(scenePath, threshold) {
  const { data, info } = await sharp(scenePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { channels, height, width } = info;
  const visited = new Uint8Array(width * height);
  let largest = null;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (
      visited[pixel] ||
      !isDarkPixel(data, pixel * channels, threshold)
    ) {
      continue;
    }
    const queue = [pixel];
    const pixels = [];
    visited[pixel] = 1;
    let cursor = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x + 1 < width) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - width);
      if (y + 1 < height) neighbors.push(current + width);
      for (const neighbor of neighbors) {
        if (
          !visited[neighbor] &&
          isDarkPixel(data, neighbor * channels, threshold)
        ) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    const component = {
      bounds: { maxX, maxY, minX, minY },
      pixels,
    };
    if (!largest || component.pixels.length > largest.pixels.length) {
      largest = component;
    }
  }

  if (!largest) {
    fail(`no dark photographic device boundary found in ${scenePath}`);
  }
  return { ...largest, height, width };
}

async function headlineDarkBounds(scenePath, threshold, bandBottomRatio) {
  const { data, info } = await sharp(scenePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { channels, height, width } = info;
  const bottom = Math.min(
    height,
    Math.max(1, Math.round(height * bandBottomRatio)),
  );
  let minX = width;
  let maxX = -1;
  let minY = bottom;
  let maxY = -1;
  for (let y = 0; y < bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isDarkPixel(data, (y * width + x) * channels, threshold)) {
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) {
    fail(`no headline pixels found in ${scenePath}`);
  }
  return {
    height: maxY - minY + 1,
    left: minX,
    top: minY,
    width: maxX - minX + 1,
  };
}

function findScreenRect(component) {
  const member = new Uint8Array(component.width * component.height);
  for (const pixel of component.pixels) {
    member[pixel] = 1;
  }
  const { maxX, maxY, minX, minY } = component.bounds;
  const innerLefts = [];
  const innerRights = [];
  const innerTops = [];
  const innerBottoms = [];

  const rowStart = Math.round(minY + (maxY - minY) * 0.32);
  const rowEnd = Math.round(minY + (maxY - minY) * 0.68);
  for (let y = rowStart; y <= rowEnd; y += 3) {
    const midpoint = (minX + maxX) / 2;
    let innerLeft = null;
    let innerRight = null;
    for (let x = minX; x <= maxX; x += 1) {
      if (!member[y * component.width + x]) {
        continue;
      }
      if (x < midpoint) {
        innerLeft = x + 1;
      } else if (innerRight === null) {
        innerRight = x - 1;
      }
    }
    if (innerLeft !== null && innerRight !== null) {
      innerLefts.push(innerLeft);
      innerRights.push(innerRight);
    }
  }

  const columnStart = Math.round(minX + (maxX - minX) * 0.32);
  const columnEnd = Math.round(minX + (maxX - minX) * 0.68);
  for (let x = columnStart; x <= columnEnd; x += 3) {
    const midpoint = (minY + maxY) / 2;
    let innerTop = null;
    let innerBottom = null;
    for (let y = minY; y <= maxY; y += 1) {
      if (!member[y * component.width + x]) {
        continue;
      }
      if (y < midpoint) {
        innerTop = y + 1;
      } else if (innerBottom === null) {
        innerBottom = y - 1;
      }
    }
    if (innerTop !== null && innerBottom !== null) {
      innerTops.push(innerTop);
      innerBottoms.push(innerBottom);
    }
  }

  if (
    innerLefts.length === 0 ||
    innerRights.length === 0 ||
    innerTops.length === 0 ||
    innerBottoms.length === 0
  ) {
    fail("could not infer the photographic device screen opening");
  }
  const left = median(innerLefts);
  const right = median(innerRights);
  const top = median(innerTops);
  const bottom = median(innerBottoms);
  return {
    height: bottom - top + 1,
    left,
    top,
    width: right - left + 1,
  };
}

function cropForAspect(source, target) {
  const sourceRatio = source.width / source.height;
  const targetRatio = target.width / target.height;
  if (sourceRatio > targetRatio) {
    const width = Math.round(source.height * targetRatio);
    return {
      height: source.height,
      left: Math.round((source.width - width) / 2),
      top: 0,
      width,
    };
  }
  const height = Math.round(source.width / targetRatio);
  return {
    height,
    left: 0,
    top: Math.round((source.height - height) / 2),
    width: source.width,
  };
}

function transformRect(rect, crop, target) {
  const scaleX = target.width / crop.width;
  const scaleY = target.height / crop.height;
  return {
    height: Math.round(rect.height * scaleY),
    left: Math.round((rect.left - crop.left) * scaleX),
    top: Math.round((rect.top - crop.top) * scaleY),
    width: Math.round(rect.width * scaleX),
  };
}

function rectInside(inner, outer) {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.left + inner.width <= outer.left + outer.width &&
    inner.top + inner.height <= outer.top + outer.height
  );
}

function validatePhotographicSafeAreas({
  component,
  crop,
  headlineBounds,
  preset,
  target,
}) {
  const outputHeadline = transformRect(headlineBounds, crop, target);
  const componentRect = {
    height: component.bounds.maxY - component.bounds.minY + 1,
    left: component.bounds.minX,
    top: component.bounds.minY,
    width: component.bounds.maxX - component.bounds.minX + 1,
  };
  const outputDevice = transformRect(componentRect, crop, target);
  const titleSafeArea = {
    height: Math.round(
      (preset.product.topRatio - preset.title.topRatio) * target.height,
    ),
    left: Math.round(preset.title.leftRatio * target.width),
    top: Math.round(preset.title.topRatio * target.height),
    width: Math.round(preset.title.maxWidthRatio * target.width),
  };
  if (
    titleSafeArea.height <= 0 ||
    !rectInside(outputHeadline, titleSafeArea)
  ) {
    fail("photographic headline pixels exceed the configured safe area");
  }
  const productTop = Math.round(preset.product.topRatio * target.height);
  if (
    outputDevice.left < 0 ||
    outputDevice.top < productTop ||
    outputDevice.left + outputDevice.width > target.width ||
    outputDevice.top + outputDevice.height > target.height ||
    outputDevice.width >
      Math.round(preset.product.maxWidthRatio * target.width) ||
    outputDevice.height >
      Math.round(preset.product.maxHeightRatio * target.height)
  ) {
    fail("photographic device exceeds the configured product safe area");
  }
  return { outputDevice, outputHeadline, titleSafeArea };
}

function normalizeScreenAspect(rect, source, tolerance) {
  const expected = source.width / source.height;
  const actual = rect.width / rect.height;
  const relativeError = Math.abs(actual - expected) / expected;
  if (relativeError > tolerance) {
    fail(
      `photographic screen aspect ${actual.toFixed(4)} differs from source aspect ${expected.toFixed(4)} by ${(relativeError * 100).toFixed(2)}%`,
    );
  }
  const width = Math.round(rect.height * expected);
  return {
    ...rect,
    left: Math.round(rect.left + (rect.width - width) / 2),
    width,
  };
}

function buildExactScreenMask(component, screenRect, contract) {
  const { height, width } = component;
  const barrier = new Uint8Array(width * height);
  for (const pixel of component.pixels) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (
      let offsetY = -contract.barrierDilation;
      offsetY <= contract.barrierDilation;
      offsetY += 1
    ) {
      for (
        let offsetX = -contract.barrierDilation;
        offsetX <= contract.barrierDilation;
        offsetX += 1
      ) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX >= 0 &&
          nextX < width &&
          nextY >= 0 &&
          nextY < height
        ) {
          barrier[nextY * width + nextX] = 1;
        }
      }
    }
  }

  const filled = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const seedX = Math.round(screenRect.left + screenRect.width / 2);
  const seedY = Math.round(screenRect.top + screenRect.height / 2);
  const seed = seedY * width + seedX;
  if (
    seedX < 0 ||
    seedX >= width ||
    seedY < 0 ||
    seedY >= height ||
    barrier[seed]
  ) {
    fail("photographic screen mask has no valid interior seed");
  }
  queue[tail] = seed;
  tail += 1;
  filled[seed] = 1;
  const { maxX, maxY, minX, minY } = component.bounds;

  while (head < tail) {
    const current = queue[head];
    head += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    const neighbors = [];
    if (x > minX) neighbors.push(current - 1);
    if (x < maxX) neighbors.push(current + 1);
    if (y > minY) neighbors.push(current - width);
    if (y < maxY) neighbors.push(current + width);
    for (const neighbor of neighbors) {
      if (!filled[neighbor] && !barrier[neighbor]) {
        filled[neighbor] = 1;
        queue[tail] = neighbor;
        tail += 1;
      }
    }
  }

  for (let index = 0; index < tail; index += 1) {
    const pixel = queue[index];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x === minX || x === maxX || y === minY || y === maxY) {
      fail("photographic device bezel is open");
    }
  }

  const expectedArea = screenRect.width * screenRect.height;
  if (
    tail < expectedArea * contract.maskAreaMinRatio ||
    tail > expectedArea * contract.maskAreaMaxRatio
  ) {
    fail(
      `photographic screen silhouette area ${tail} is incompatible with expected area ${expectedArea}`,
    );
  }

  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4 + 3] = filled[pixel] ? 255 : 0;
  }
  return {
    buffer: rgba,
    channels: 4,
    height,
    pixelCount: tail,
    width,
  };
}

async function exactScreenOverlay({
  crop,
  mask,
  outputScreen,
  sourcePath,
  target,
}) {
  const [screen, resizedMask] = await Promise.all([
    sharp(sourcePath)
      .resize(outputScreen.width, outputScreen.height, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .png({ adaptiveFiltering: false, compressionLevel: 9 })
      .toBuffer(),
    sharp(mask.buffer, {
      raw: {
        channels: mask.channels,
        height: mask.height,
        width: mask.width,
      },
    })
      .extract(crop)
      .resize(target.width, target.height, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .png({ adaptiveFiltering: false, compressionLevel: 9 })
      .toBuffer(),
  ]);
  const layer = await sharp({
    create: {
      channels: 4,
      height: target.height,
      width: target.width,
      background: { alpha: 0, b: 0, g: 0, r: 0 },
    },
  })
    .composite([
      {
        input: screen,
        left: outputScreen.left,
        top: outputScreen.top,
      },
    ])
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
  return sharp(layer)
    .composite([{ blend: "dest-in", input: resizedMask }])
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
}

function dynamicIsland(outputScreen) {
  const width = Math.round(outputScreen.width * 0.29);
  const height = Math.round(outputScreen.width * 0.078);
  const left = Math.round(
    outputScreen.left + (outputScreen.width - width) / 2,
  );
  const top = Math.round(
    outputScreen.top + outputScreen.width * 0.04,
  );
  return {
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" rx="${Math.round(height / 2)}" fill="#020202"/></svg>`,
    ),
    left,
    top,
  };
}

async function composePhotographicFrame(item, backgroundTemplate) {
  const target = item.capture.pixelDimensions;
  const contract = item.preset.photographicDevice;
  const [sceneMetadata, sourceMetadata, component, headlineBounds] =
    await Promise.all([
      sharp(backgroundTemplate.path).metadata(),
      sharp(item.inputPath).metadata(),
      largestDarkComponent(backgroundTemplate.path, contract.darkThreshold),
      headlineDarkBounds(
        backgroundTemplate.path,
        contract.darkThreshold,
        item.preset.product.topRatio,
      ),
    ]);
  const detectedScreen = findScreenRect(component);
  const normalizedScreen = normalizeScreenAspect(
    detectedScreen,
    sourceMetadata,
    contract.screenAspectTolerance,
  );
  const exactMask = buildExactScreenMask(component, detectedScreen, contract);
  const crop = cropForAspect(sceneMetadata, target);
  const safeAreas = validatePhotographicSafeAreas({
    component,
    crop,
    headlineBounds,
    preset: item.preset,
    target,
  });
  const outputScreen = transformRect(normalizedScreen, crop, target);
  const [scene, screenshot] = await Promise.all([
    sharp(backgroundTemplate.path)
      .extract(crop)
      .resize(target.width, target.height, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .png({ adaptiveFiltering: false, compressionLevel: 9 })
      .toBuffer(),
    exactScreenOverlay({
      crop,
      mask: exactMask,
      outputScreen,
      sourcePath: item.inputPath,
      target,
    }),
  ]);
  const composites = [{ input: screenshot, left: 0, top: 0 }];
  if (contract.dynamicIsland) {
    composites.push(dynamicIsland(outputScreen));
  }
  const buffer = await sharp(scene)
    .composite(composites)
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
  return {
    buffer,
    deviceGeometry: {
      componentBounds: component.bounds,
      componentDimensions: {
        height: component.bounds.maxY - component.bounds.minY + 1,
        width: component.bounds.maxX - component.bounds.minX + 1,
      },
      crop,
      detectedScreen,
      exactMaskPixelCount: exactMask.pixelCount,
      maskStrategy: "closed-bezel-flood-fill",
      normalizedScreen,
      outputDevice: safeAreas.outputDevice,
      outputHeadline: safeAreas.outputHeadline,
      outputScreen,
      titleSafeArea: safeAreas.titleSafeArea,
    },
    dimensions: target,
  };
}

async function composeFrame(item, config, backgroundTemplate) {
  if (config.compositionMode === "photographic-device") {
    return composePhotographicFrame(item, backgroundTemplate);
  }
  const canvas = item.capture.pixelDimensions;
  const layout = calculateLayout({
    canvas,
    preset: item.preset,
    source: item.capture.pixelDimensions,
  });
  const [background, frame, headline, screenshot] = await Promise.all([
    sharp(backgroundTemplate.path)
      .resize(canvas.width, canvas.height, {
        fit: "cover",
        kernel: sharp.kernel.lanczos3,
        position: "centre",
      })
      .png({ adaptiveFiltering: false, compressionLevel: 9 })
      .toBuffer(),
    Promise.resolve(frameSvg({ config, layout, preset: item.preset })),
    renderValidatedHeadline({
      config,
      headline: item.frame.headline,
      layout,
      preset: item.preset,
    }),
    roundedScreenshot(item.inputPath, layout),
  ]);
  const buffer = await sharp(background)
    .composite([
      {
        input: frame,
        left: 0,
        top: 0,
      },
      {
        input: screenshot,
        left: layout.screenshot.x,
        top: layout.screenshot.y,
      },
      {
        input: headline,
        left: 0,
        top: 0,
      },
    ])
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
  return {
    buffer,
    dimensions: canvas,
    layout,
  };
}

function outputDirectoryName(preset) {
  return `${preset.deviceFamily}-${preset.displayGroup}-${preset.orientation}`;
}

function outputFileName(item) {
  const expectedPrefix = `marketing-${String(item.frame.order).padStart(2, "0")}-`;
  if (
    typeof item.capture.fileName !== "string" ||
    item.capture.fileName !== path.basename(item.capture.fileName) ||
    !item.capture.fileName.startsWith(expectedPrefix) ||
    path.extname(item.capture.fileName).toLowerCase() !== ".png"
  ) {
    fail(
      `frame ${item.frame.order} ${item.family} has an unsafe output filename`,
    );
  }
  return item.capture.fileName;
}

function contactSheetLabelSvg({
  config,
  frame,
  height,
  muted,
  width,
}) {
  const labelSize = Math.max(18, Math.round(width * 0.052));
  const orderSize = Math.max(14, Math.round(labelSize * 0.72));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="0" y="${labelSize}" fill="${config.preview.label}" font-family="${escapeXml(config.typography.fontFamily)}" font-size="${labelSize}" font-weight="700">${escapeXml(frame.headline)}</text>
  <text x="0" y="${labelSize + orderSize + 10}" fill="${muted}" font-family="${escapeXml(config.typography.fontFamily)}" font-size="${orderSize}" font-weight="500">Frame ${frame.order} · ${escapeXml(frame.captureId)}</text>
</svg>`);
}

async function buildContactSheet(family, composedItems, config) {
  const preview = config.preview;
  const preset = config.presets[family];
  const columns = Math.min(3, composedItems.length);
  const rows = Math.ceil(composedItems.length / columns);
  const contentWidth =
    preview.width - preview.padding * 2 - preview.gap * (columns - 1);
  const cellWidth = Math.floor(contentWidth / columns);
  const sourceDimensions = composedItems[0].dimensions;
  const thumbnailHeight = Math.round(
    cellWidth * (sourceDimensions.height / sourceDimensions.width),
  );
  const labelHeight = Math.max(70, Math.round(cellWidth * 0.13));
  const cellHeight = thumbnailHeight + labelHeight;
  const titleHeight = Math.max(90, Math.round(preview.width * 0.052));
  const sheetHeight =
    preview.padding * 2 +
    titleHeight +
    rows * cellHeight +
    (rows - 1) * preview.gap;
  const titleSize = Math.round(preview.width * 0.026);
  const subtitleSize = Math.round(preview.width * 0.012);
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${preview.width}" height="${sheetHeight}">
  <rect width="100%" height="100%" fill="${preview.background}"/>
  <text x="${preview.padding}" y="${preview.padding + titleSize}" fill="${preview.label}" font-family="${escapeXml(config.typography.fontFamily)}" font-size="${titleSize}" font-weight="750">${escapeXml(preset.reviewLabel)} · ${escapeXml(config.visualDirection.name)}</text>
  <text x="${preview.padding}" y="${preview.padding + titleSize + subtitleSize + 16}" fill="${preview.mutedLabel}" font-family="${escapeXml(config.typography.fontFamily)}" font-size="${subtitleSize}" font-weight="500">Six deterministic App Store frames · native UI preserved</text>
</svg>`);
  const composites = [];

  for (let index = 0; index < composedItems.length; index += 1) {
    const item = composedItems[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = preview.padding + column * (cellWidth + preview.gap);
    const top = preview.padding + titleHeight + row * (cellHeight + preview.gap);
    const thumbnail = await sharp(item.buffer)
      .resize(cellWidth, thumbnailHeight, { fit: "fill" })
      .png({ adaptiveFiltering: false, compressionLevel: 9 })
      .toBuffer();
    composites.push({ input: thumbnail, left, top });
    composites.push({
      input: contactSheetLabelSvg({
        config,
        frame: item.frame,
        height: labelHeight,
        muted: preview.mutedLabel,
        width: cellWidth,
      }),
      left,
      top: top + thumbnailHeight + 12,
    });
  }

  const buffer = await sharp(base)
    .composite(composites)
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
  return {
    buffer,
    dimensions: {
      width: preview.width,
      height: sheetHeight,
    },
  };
}

function boundedExtract({ height, left, top, width }, image) {
  return {
    height,
    left: Math.max(0, Math.min(left, image.width - width)),
    top: Math.max(0, Math.min(top, image.height - height)),
    width,
  };
}

async function buildIphoneCornerSheet(composedItems, config) {
  const source = composedItems[0].dimensions;
  const sourceCornerSize = Math.round(source.width * 0.167);
  const tileSize = 300;
  const gap = 18;
  const labelWidth = 190;
  const rowHeight = tileSize;
  const width = labelWidth + 4 * tileSize + 6 * gap;
  const height =
    composedItems.length * rowHeight + (composedItems.length + 1) * gap;
  const composites = [];

  for (let index = 0; index < composedItems.length; index += 1) {
    const item = composedItems[index];
    const top = gap + index * (rowHeight + gap);
    const screen = item.deviceGeometry.outputScreen;
    const edgeOffset = Math.round(sourceCornerSize * 0.16);
    const corners = [
      {
        left: screen.left - edgeOffset,
        top: screen.top - edgeOffset,
      },
      {
        left:
          screen.left +
          screen.width -
          sourceCornerSize +
          edgeOffset,
        top: screen.top - edgeOffset,
      },
      {
        left: screen.left - edgeOffset,
        top:
          screen.top +
          screen.height -
          sourceCornerSize +
          edgeOffset,
      },
      {
        left:
          screen.left +
          screen.width -
          sourceCornerSize +
          edgeOffset,
        top:
          screen.top +
          screen.height -
          sourceCornerSize +
          edgeOffset,
      },
    ];
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth}" height="${rowHeight}">
        <rect width="100%" height="100%" fill="${config.preview.label}"/>
        <text x="50%" y="132" text-anchor="middle" font-family="${escapeXml(config.typography.fontFamily)}" font-size="28" font-weight="700" fill="${config.preview.background}">iPhone ${item.frame.order}</text>
        <text x="50%" y="170" text-anchor="middle" font-family="${escapeXml(config.typography.fontFamily)}" font-size="18" fill="${config.preview.mutedLabel}">exact mask</text>
      </svg>`,
    );
    composites.push({ input: label, left: gap, top });

    for (
      let cornerIndex = 0;
      cornerIndex < corners.length;
      cornerIndex += 1
    ) {
      const crop = boundedExtract(
        {
          ...corners[cornerIndex],
          height: sourceCornerSize,
          width: sourceCornerSize,
        },
        source,
      );
      const corner = await sharp(item.buffer)
        .extract(crop)
        .resize(tileSize, tileSize, {
          fit: "fill",
          kernel: sharp.kernel.nearest,
        })
        .png({ adaptiveFiltering: false, compressionLevel: 9 })
        .toBuffer();
      composites.push({
        input: corner,
        left:
          labelWidth +
          2 * gap +
          cornerIndex * (tileSize + gap),
        top,
      });
    }
  }

  const buffer = await sharp({
    create: {
      channels: 4,
      height,
      width,
      background: config.preview.background,
    },
  })
    .composite(composites)
    .png({ adaptiveFiltering: false, compressionLevel: 9 })
    .toBuffer();
  return {
    buffer,
    dimensions: { height, width },
  };
}

function photographicDeviceConsistency(deviceFamilies, composedByFamily, config) {
  if (config.compositionMode !== "photographic-device") {
    return null;
  }
  return Object.fromEntries(
    deviceFamilies.map((family) => {
      const items = composedByFamily.get(family);
      const widths = items.map(
        (item) => item.deviceGeometry.componentDimensions.width,
      );
      const heights = items.map(
        (item) => item.deviceGeometry.componentDimensions.height,
      );
      const widthMedian = median(widths);
      const heightMedian = median(heights);
      const maximumWidthDeviation = Math.max(
        ...widths.map(
          (value) => Math.abs(value - widthMedian) / widthMedian,
        ),
      );
      const maximumHeightDeviation = Math.max(
        ...heights.map(
          (value) => Math.abs(value - heightMedian) / heightMedian,
        ),
      );
      const contract = config.presets[family].photographicDevice;
      if (
        maximumWidthDeviation >
          contract.deviceWidthConsistencyTolerance ||
        maximumHeightDeviation >
          contract.deviceHeightConsistencyTolerance
      ) {
        fail(
          `${family} photographic device dimensions exceed their consistency tolerance`,
        );
      }
      return [
        family,
        {
          heightMedian,
          maximumHeightDeviation,
          maximumWidthDeviation,
          widthMedian,
        },
      ];
    }),
  );
}

export async function composeMarketingAssets(rawOptions) {
  const options = {
    deviceFamily: "all",
    layoutConfig: DEFAULT_LAYOUT_CONFIG,
    locale: "en-US",
    orientation: "all",
    platform: DEFAULT_PLATFORM,
    previewOnly: false,
    ...rawOptions,
  };
  if (!options.captureRoot || !options.outputDir) {
    fail("captureRoot and outputDir are required");
  }
  const [resolvedCaptureRoot, prospectiveOutputDir] = await Promise.all([
    realpath(path.resolve(options.captureRoot)).catch((error) => {
      fail(`could not resolve raw capture directory: ${error.message}`);
    }),
    resolveProspectiveRealPath(options.outputDir),
  ]);
  assertOutputSeparated(resolvedCaptureRoot, prospectiveOutputDir);
  const manifestPath =
    options.manifest ?? path.join(options.captureRoot, "manifest.json");
  const layoutConfigPath = path.resolve(options.layoutConfig);
  const [config, manifest, manifestSha256] = await Promise.all([
    readJson(layoutConfigPath, "layout config"),
    readJson(path.resolve(manifestPath), "capture manifest"),
    sha256File(path.resolve(manifestPath)),
  ]);
  validateLayoutConfig(config);
  const deviceFamilies = selectDeviceFamilies(config, options);
  const validated = await validateManifest({
    captureRoot: resolvedCaptureRoot,
    config,
    deviceFamilies,
    locale: options.locale,
    manifest,
  });
  const backgroundTemplates = new Map();
  for (const item of validated) {
    const key = `${item.family}:${item.frame.frameId}`;
    if (!backgroundTemplates.has(key)) {
      backgroundTemplates.set(
        key,
        await validateBackgroundTemplate(
          path.dirname(layoutConfigPath),
          item.preset,
          item.frame.frameId,
        ),
      );
    }
  }
  const backgroundHashes = new Set(
    [...backgroundTemplates.values()].map(({ sha256 }) => sha256),
  );
  if (backgroundHashes.size !== backgroundTemplates.size) {
    fail("every selected frame and device family must use a distinct background");
  }

  const artifacts = [];
  const pendingWrites = [];
  const composedByFamily = new Map(
    deviceFamilies.map((family) => [family, []]),
  );
  for (const item of validated) {
    const backgroundTemplate = backgroundTemplates.get(
      `${item.family}:${item.frame.frameId}`,
    );
    const composed = await composeFrame(item, config, backgroundTemplate);
    const relativeFile = path.join(
      outputDirectoryName(item.preset),
      outputFileName(item),
    );
    if (!options.previewOnly) {
      artifacts.push({
        deviceFamily: item.family,
        ...(composed.deviceGeometry
          ? { deviceGeometry: composed.deviceGeometry }
          : {}),
        dimensions: composed.dimensions,
        file: relativeFile,
        frameId: item.frame.frameId,
        copy: {
          headline: item.frame.headline,
          supporting: item.frame.supporting,
          supportingRendered: false,
        },
        backgroundTemplateSha256: backgroundTemplate.sha256,
        order: item.frame.order,
        sha256: sha256Buffer(composed.buffer),
        sourceFile: item.capture.file,
        sourceSha256: item.capture.sha256,
      });
      pendingWrites.push({
        buffer: composed.buffer,
        relativeFile,
      });
    }
    composedByFamily.get(item.family).push({
      ...composed,
      frame: item.frame,
    });
  }

  const deviceConsistency = photographicDeviceConsistency(
    deviceFamilies,
    composedByFamily,
    config,
  );
  const contactSheets = [];
  for (const family of deviceFamilies) {
    const contactSheet = await buildContactSheet(
      family,
      composedByFamily.get(family),
      config,
    );
    const relativeFile = `preview-${family}-contact-sheet.png`;
    contactSheets.push({
      deviceFamily: family,
      dimensions: contactSheet.dimensions,
      file: relativeFile,
      kind: "overview",
      sha256: sha256Buffer(contactSheet.buffer),
    });
    pendingWrites.push({
      buffer: contactSheet.buffer,
      relativeFile,
    });
  }
  if (
    config.compositionMode === "photographic-device" &&
    deviceFamilies.includes("iphone")
  ) {
    const cornerSheet = await buildIphoneCornerSheet(
      composedByFamily.get("iphone"),
      config,
    );
    const relativeFile = "preview-iphone-corners.png";
    contactSheets.push({
      deviceFamily: "iphone",
      dimensions: cornerSheet.dimensions,
      file: relativeFile,
      kind: "corner-audit",
      sha256: sha256Buffer(cornerSheet.buffer),
    });
    pendingWrites.push({
      buffer: cornerSheet.buffer,
      relativeFile,
    });
  }

  const outputManifest = {
    schemaVersion: 1,
    layoutId: config.layoutId,
    locale: options.locale,
    mode: options.previewOnly ? "preview-only" : "full-export",
    platform: options.platform,
    renderer: {
      fontFamily: config.typography.fontFamily,
      fontconfig: sharp.versions.fontconfig,
      freetype: sharp.versions.freetype,
      pango: sharp.versions.pango,
      rsvg: sharp.versions.rsvg,
      sharp: sharp.versions.sharp,
      vips: sharp.versions.vips,
    },
    visualDirection: config.visualDirection,
    ...(deviceConsistency ? { deviceConsistency } : {}),
    source: {
      captureManifest: path.basename(manifestPath),
      captureManifestSha256: manifestSha256,
      sourceCommit: manifest.sourceBuild?.sourceCommit,
      storyId: manifest.storyId,
    },
    deviceFamilies,
    backgroundTemplates: [...backgroundTemplates.values()].map(
      ({ deviceFamily, file, frameId, generatedWith, pixelDimensions, sha256 }) => ({
        deviceFamily,
        file,
        frameId,
        generatedWith,
        pixelDimensions,
        sha256,
      }),
    ),
    artifacts,
    contactSheets,
  };
  const outputRoot = path.resolve(options.outputDir);
  const outputManifestPath = path.join(outputRoot, "composition-manifest.json");
  await mkdir(outputRoot, { recursive: true });
  assertOutputSeparated(
    resolvedCaptureRoot,
    await realpath(outputRoot),
  );
  for (const pending of pendingWrites) {
    const outputPath = path.join(outputRoot, pending.relativeFile);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, pending.buffer);
  }
  await writeFile(outputManifestPath, stableJson(outputManifest));
  return {
    manifest: outputManifest,
    manifestPath: outputManifestPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const result = await composeMarketingAssets(options);
  process.stdout.write(
    `[marketing-composition] wrote ${result.manifest.artifacts.length} App Store assets and ${result.manifest.contactSheets.length} contact sheet(s) to ${path.dirname(result.manifestPath)}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
