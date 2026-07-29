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
  "app-store-marketing-layout-v1.json",
);
const DEFAULT_PLATFORM = "app-store";
const SUPPORTED_FONT_FAMILY = "sans-serif";
const EXPECTED_FRAME_COUNT = 6;

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

function validateLayoutConfig(config) {
  if (config.schemaVersion !== 1) {
    fail(`unsupported layout schema version: ${config.schemaVersion}`);
  }
  if (!config.layoutId || !config.contractStoryId || !config.locale) {
    fail("layout config must define layoutId, contractStoryId, and locale");
  }
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
  for (const key of [
    "frameId",
    "captureId",
    "copyKey",
    "headline",
    "supporting",
  ]) {
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
      `${preset.deviceFamily} ${frameId} has an invalid imagegen background contract`,
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
      `${preset.deviceFamily} background template is unavailable: ${error.message}`,
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
      `${preset.deviceFamily} background template does not match its PNG dimensions`,
    );
  }
  const orientationMatches =
    preset.orientation === "portrait"
      ? metadata.height > metadata.width
      : metadata.width > metadata.height;
  if (!orientationMatches) {
    fail(
      `${preset.deviceFamily} background template has the wrong orientation`,
    );
  }
  const actualSha256 = await sha256File(templatePath);
  if (actualSha256 !== template.sha256) {
    fail(`${preset.deviceFamily} background template SHA-256 does not match`);
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

async function composeFrame(item, config, backgroundTemplate) {
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
  <text x="${preview.padding}" y="${preview.padding + titleSize}" fill="${preview.label}" font-family="${escapeXml(config.typography.fontFamily)}" font-size="${titleSize}" font-weight="750">${escapeXml(preset.reviewLabel)} · Cobalt Focus</text>
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

  await mkdir(path.resolve(options.outputDir), { recursive: true });
  assertOutputSeparated(
    resolvedCaptureRoot,
    await realpath(path.resolve(options.outputDir)),
  );
  const artifacts = [];
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
      const outputPath = path.join(path.resolve(options.outputDir), relativeFile);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, composed.buffer);
      artifacts.push({
        deviceFamily: item.family,
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
    }
    composedByFamily.get(item.family).push({
      ...composed,
      frame: item.frame,
    });
  }

  const contactSheets = [];
  for (const family of deviceFamilies) {
    const contactSheet = await buildContactSheet(
      family,
      composedByFamily.get(family),
      config,
    );
    const relativeFile = `preview-${family}-contact-sheet.png`;
    await writeFile(
      path.join(path.resolve(options.outputDir), relativeFile),
      contactSheet.buffer,
    );
    contactSheets.push({
      deviceFamily: family,
      dimensions: contactSheet.dimensions,
      file: relativeFile,
      sha256: sha256Buffer(contactSheet.buffer),
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
  const outputManifestPath = path.join(
    path.resolve(options.outputDir),
    "composition-manifest.json",
  );
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
