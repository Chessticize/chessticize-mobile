import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = path.join(
  repoRoot,
  "scratch/store-assets/marketing-hybrid-a-original-bg-v1"
);
const sourceRoot = resolveSourceRoot(process.argv.slice(2));
const outputRoot = path.join(repoRoot, "site/assets");
const screenshotOutputRoot = path.join(outputRoot, "screenshots");

const screenshotJobs = [
  ...[
    "marketing-01-standard-sprint.png",
    "marketing-02-arrow-duel.png",
    "marketing-03-custom-run.png",
    "marketing-04-review-queue.png",
    "marketing-05-rating-trend.png",
    "marketing-06-trust.png"
  ].map((source, index) => ({
    source: path.join("iphone-6.9-inch-portrait", source),
    output: path.join("screenshots", `iphone-${String(index + 1).padStart(2, "0")}.webp`),
    width: 560,
    quality: 86
  })),
  {
    source: path.join("ipad-13-inch-landscape", "marketing-01-standard-sprint.png"),
    output: path.join("screenshots", "ipad-01.webp"),
    width: 1280,
    quality: 86
  },
  {
    source: path.join("ipad-13-inch-landscape", "marketing-03-custom-run.png"),
    output: path.join("screenshots", "ipad-03.webp"),
    width: 1280,
    quality: 86
  },
  {
    source: path.join("ipad-13-inch-landscape", "marketing-06-trust.png"),
    output: path.join("screenshots", "ipad-06.webp"),
    width: 1280,
    quality: 86
  },
  {
    source: "preview-iphone-contact-sheet.png",
    output: path.join("screenshots", "contact-sheet.webp"),
    width: 1200,
    quality: 84
  }
];

await fs.mkdir(screenshotOutputRoot, { recursive: true });

const assets = [];
for (const job of screenshotJobs) {
  assets.push(await renderWebp(job));
}

const iconSource = path.join(repoRoot, "apps/mobile/store-assets/android/play-icon-512.png");
const iconOutput = path.join(outputRoot, "app-icon-192.png");
await sharp(iconSource)
  .resize(192, 192, { fit: "cover" })
  .png({ compressionLevel: 9 })
  .toFile(iconOutput);
const iconMetadata = await sharp(iconOutput).metadata();
assets.push({
  source: path.relative(repoRoot, iconSource),
  sourceSha256: await sha256(iconSource),
  output: path.relative(repoRoot, iconOutput),
  outputSha256: await sha256(iconOutput),
  width: iconMetadata.width,
  height: iconMetadata.height,
  bytes: (await fs.stat(iconOutput)).size
});

const manifest = {
  schemaVersion: 1,
  sourceCollection: "scratch/store-assets/marketing-hybrid-a-original-bg-v1",
  generator: "scripts/prepare-landing-page-assets.mjs",
  assets
};

await fs.writeFile(
  path.join(outputRoot, "marketing-assets.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(`Prepared ${assets.length} landing-page assets in ${path.relative(repoRoot, outputRoot)}.`);

async function renderWebp({ source, output, width, quality }) {
  const sourcePath = path.join(sourceRoot, source);
  const outputPath = path.join(outputRoot, output);
  await sharp(sourcePath)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  return {
    source: path.join("scratch/store-assets/marketing-hybrid-a-original-bg-v1", source),
    sourceSha256: await sha256(sourcePath),
    output: path.relative(repoRoot, outputPath),
    outputSha256: await sha256(outputPath),
    width: metadata.width,
    height: metadata.height,
    bytes: (await fs.stat(outputPath)).size
  };
}

function resolveSourceRoot(args) {
  const sourceIndex = args.indexOf("--source-root");
  if (sourceIndex === -1) {
    return defaultSourceRoot;
  }
  const value = args[sourceIndex + 1];
  if (!value) {
    throw new Error("--source-root requires a directory path");
  }
  return path.resolve(value);
}

async function sha256(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}
