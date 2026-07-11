#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const defaultRoot = "scratch/store-assets/final";
const expectedScenes = [
  "app-store-01-practice-tab",
  "app-store-02-review-tab",
  "app-store-03-history-tab",
  "app-store-04-settings-tab",
  "app-store-05-standard-sprint",
  "app-store-06-arrow-duel"
];
const requiredGroups = [
  {
    id: "iphone-6.9",
    label: "6.9-inch iPhone",
    acceptedPortraitSizes: [
      [1260, 2736],
      [1290, 2796],
      [1320, 2868]
    ]
  },
  {
    id: "iphone-6.1",
    label: "6.1-inch iPhone",
    acceptedPortraitSizes: [
      [1170, 2532],
      [1125, 2436],
      [1080, 2340]
    ]
  },
  {
    id: "ipad-13",
    label: "13-inch iPad",
    acceptedPortraitSizes: [
      [2064, 2752],
      [2048, 2732]
    ]
  }
];

function parseArgs(argv) {
  const options = {
    json: false,
    root: defaultRoot
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a screenshot directory path");
      }
      options.root = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveRoot(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function isSupportedImage(path) {
  const ext = extname(path).toLowerCase();
  return ext === ".png" || ext === ".jpg" || ext === ".jpeg";
}

function parsePngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    format: "png"
  };
}

function parseJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < buffer.length) {
    while (buffer[offset] === 0xff) {
      offset += 1;
    }

    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        format: "jpeg"
      };
    }

    offset += segmentLength;
  }

  return null;
}

function readImageDimensions(path) {
  const buffer = readFileSync(path);
  const dimensions = parsePngDimensions(buffer) ?? parseJpegDimensions(buffer);
  if (!dimensions) {
    throw new Error(`Unsupported or invalid image file: ${path}`);
  }
  return {
    ...dimensions,
    bytes: buffer.length
  };
}

function check(checks, name, passed, detail) {
  checks.push({
    name,
    status: passed ? "pass" : "fail",
    detail
  });
}

function formatSizes(sizes) {
  return sizes.map(([width, height]) => `${width}x${height}`).join(", ");
}

function auditGroup(root, group) {
  const groupDir = join(root, group.id);
  const files = existsSync(groupDir)
    ? readdirSync(groupDir)
      .filter(isSupportedImage)
      .sort()
    : [];
  const filesByScene = new Map(files.map((file) => [basename(file, extname(file)), file]));
  const images = [];
  const missingScenes = expectedScenes.filter((scene) => !filesByScene.has(scene));
  const extraScenes = files
    .map((file) => basename(file, extname(file)))
    .filter((scene) => !expectedScenes.includes(scene));
  const wrongSizes = [];

  for (const scene of expectedScenes) {
    const file = filesByScene.get(scene);
    if (!file) {
      continue;
    }
    const path = join(groupDir, file);
    const dimensions = readImageDimensions(path);
    const accepted = group.acceptedPortraitSizes.some(
      ([width, height]) => dimensions.width === width && dimensions.height === height
    );
    images.push({
      scene,
      file: `${group.id}/${file}`,
      width: dimensions.width,
      height: dimensions.height,
      format: dimensions.format,
      bytes: dimensions.bytes
    });
    if (!accepted) {
      wrongSizes.push(`${file}: ${dimensions.width}x${dimensions.height}`);
    }
  }

  return {
    group: group.id,
    label: group.label,
    acceptedPortraitSizes: group.acceptedPortraitSizes.map(([width, height]) => `${width}x${height}`),
    missingDirectory: !existsSync(groupDir) || !statSync(groupDir).isDirectory(),
    missingScenes,
    extraScenes,
    wrongSizes,
    images
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolveRoot(options.root);
  const checks = [];
  const groupResults = [];

  check(
    checks,
    "Screenshot root exists",
    existsSync(root) && statSync(root).isDirectory(),
    `Expected screenshot root at ${root}.`
  );

  for (const group of requiredGroups) {
    const result = auditGroup(root, group);
    groupResults.push(result);
    check(
      checks,
      `${group.label} screenshot set is complete`,
      !result.missingDirectory &&
        result.missingScenes.length === 0 &&
        result.extraScenes.length === 0 &&
        result.images.length >= 1 &&
        result.images.length <= 10,
      `Missing directory=${result.missingDirectory}; missing scenes=${result.missingScenes.join(", ") || "none"}; extra scenes=${result.extraScenes.join(", ") || "none"}; image count=${result.images.length}.`
    );
    check(
      checks,
      `${group.label} screenshots use accepted portrait dimensions`,
      result.wrongSizes.length === 0,
      `Accepted portrait sizes: ${formatSizes(group.acceptedPortraitSizes)}. Wrong sizes: ${result.wrongSizes.join("; ") || "none"}.`
    );
  }

  const failed = checks.filter((entry) => entry.status === "fail");
  const result = {
    status: failed.length === 0 ? "pass" : "fail",
    root,
    expectedScenes,
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length
    },
    checks,
    groups: groupResults
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log("App Store screenshot audit");
    console.log(`Root: ${root}`);
    for (const entry of checks) {
      console.log(`${entry.status === "pass" ? "PASS" : "FAIL"} ${entry.name}`);
      if (entry.status === "fail") {
        console.log(`  ${entry.detail}`);
      }
    }
    console.log("");
    console.log(`Summary: ${result.summary.passed} passed, ${result.summary.failed} failed.`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
