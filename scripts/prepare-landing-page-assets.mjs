import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const defaultSourceRoot = path.join(
  repoRoot,
  "scratch/site-1.7-captures/en"
);
const defaultLocalizedRoot = path.join(
  repoRoot,
  "scratch/site-1.7-captures/localized"
);
const cliArgs = process.argv.slice(2);
const sourceRoot = resolveDirectory(cliArgs, "--source-root", defaultSourceRoot);
const duoSourceRoot = resolveOptionalDirectory(cliArgs, "--duo-source-root");
const localizedRoot = resolveOptionalDirectory(
  cliArgs,
  "--localized-root",
  defaultLocalizedRoot
);
const outputRoot = path.join(repoRoot, "site/assets");
const screenshotOutputRoot = path.join(outputRoot, "screenshots");
const existingManifestPath = path.join(outputRoot, "marketing-assets.json");

const appManifest = await readJson(path.join(sourceRoot, "manifest.json"));
const existingManifest = await readOptionalJson(existingManifestPath);

const appSource = {
  collection: "mobile-1.7/app-store-raw-en",
  appSourceCommit: appManifest.sourceBuild?.sourceCommit,
};
assertCommit(appSource.appSourceCommit, "App Store capture manifest");

let duoSource;
let duoJob = null;
let preservedDuoAsset = null;

if (duoSourceRoot) {
  const duoManifest = await readJson(
    path.join(duoSourceRoot, "manifest-iphoneDuo.json")
  );
  duoSource = {
    collection: "mobile-1.7/duo-inner",
    appSourceCommit: duoManifest.captureProvenance?.appSourceCommit
      ?? duoManifest.sourceBuild?.sourceCommit,
    ...(duoManifest.captureProvenance?.testRunnerCommit
      ? { captureRunnerCommit: duoManifest.captureProvenance.testRunnerCommit }
      : {}),
  };
  assertCommit(duoSource.appSourceCommit, "Duo capture manifest app source");
  duoJob = {
    sourceRoot: duoSourceRoot,
    source: duoCapture(duoManifest, "dark-arrow-duel").file,
    output: path.join("screenshots", "duo-dark-arrow-duel.webp"),
    width: 1440,
    quality: 86,
    provenance: duoSource,
    capture: duoCapture(duoManifest, "dark-arrow-duel"),
  };
} else {
  const previousDuoSource = existingManifest?.sources?.find((entry) =>
    entry.collection?.includes("duo-inner")
  );
  const previousDuoAsset = existingManifest?.assets?.find(
    (entry) => entry.output === "site/assets/screenshots/duo-dark-arrow-duel.webp"
  );
  if (!previousDuoSource || !previousDuoAsset) {
    throw new Error(
      "Missing --duo-source-root and no existing verified Duo asset in marketing-assets.json"
    );
  }
  const duoFilePath = path.join(repoRoot, previousDuoAsset.output);
  const actualDuoSha = await sha256(duoFilePath);
  if (actualDuoSha !== previousDuoAsset.outputSha256) {
    throw new Error(
      "Existing duo-dark-arrow-duel.webp does not match recorded outputSha256"
    );
  }
  duoSource = previousDuoSource;
  preservedDuoAsset = previousDuoAsset;
}

const frameNames = [
  "practice-home",
  "dark-arrow-duel",
  "tactical-profile",
  "focused-run",
  "survival",
  "review",
];
const localizedPhoneFrames = [
  "practice-home",
  "dark-arrow-duel",
  "review",
  "tactical-profile",
  "focused-run",
];
const localizedLocales = [
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
  "es",
  "de",
  "fr",
  "pt-BR",
];

const screenshotJobs = [
  ...frameNames.map((frame) => ({
    sourceRoot,
    source: appCapture(appManifest, frame, "iphone").file,
    output: path.join("screenshots", `phone-${frame}.webp`),
    width: 660,
    quality: 86,
    provenance: appSource,
    capture: appCapture(appManifest, frame, "iphone"),
  })),
  ...frameNames.map((frame) => ({
    sourceRoot,
    source: appCapture(appManifest, frame, "ipad").file,
    output: path.join("screenshots", `ipad-${frame}.webp`),
    width: 1440,
    quality: 86,
    provenance: appSource,
    capture: appCapture(appManifest, frame, "ipad"),
  })),
  ...(duoJob ? [duoJob] : []),
];

let localizedSource = null;
const localizedJobs = [];
if (localizedRoot) {
  const iphoneLocManifest = await readJson(
    path.join(localizedRoot, "manifest-localized-iphone.json")
  );
  const ipadLocManifest = await readJson(
    path.join(localizedRoot, "manifest-localized-ipad.json")
  );
  const locCommit = iphoneLocManifest.sourceCommit;
  assertCommit(locCommit, "Localized iPhone capture manifest");
  if (ipadLocManifest.sourceCommit !== locCommit) {
    throw new Error(
      "Localized iPhone and iPad manifests must share one source commit"
    );
  }
  localizedSource = {
    collection: "mobile-1.7/localized-site-captures",
    appSourceCommit: locCommit,
  };
  for (const locale of localizedLocales) {
    for (const frameId of localizedPhoneFrames) {
      const record = localizedCapture(iphoneLocManifest, locale, frameId);
      localizedJobs.push({
        sourceRoot: localizedRoot,
        source: record.file,
        output: path.join("screenshots", locale, `phone-${frameId}.webp`),
        width: 660,
        quality: 84,
        provenance: localizedSource,
        capture: record,
        locale,
      });
    }
    const ipadRecord = localizedCapture(ipadLocManifest, locale, "dark-arrow-duel");
    localizedJobs.push({
      sourceRoot: localizedRoot,
      source: ipadRecord.file,
      output: path.join("screenshots", locale, "ipad-dark-arrow-duel.webp"),
      width: 1440,
      quality: 84,
      provenance: localizedSource,
      capture: ipadRecord,
      locale,
    });
  }
}

const obsoleteOutputs = [
  "iphone-01.webp",
  "iphone-02.webp",
  "iphone-03.webp",
  "iphone-04.webp",
  "iphone-05.webp",
  "iphone-06.webp",
  "ipad-01.webp",
  "ipad-03.webp",
  "ipad-06.webp",
];

await Promise.all([...screenshotJobs, ...localizedJobs].map(validateJobInput));
await fs.mkdir(screenshotOutputRoot, { recursive: true });
await Promise.all(
  obsoleteOutputs.map((output) =>
    fs.rm(path.join(screenshotOutputRoot, output), { force: true })
  )
);

const assets = [];
for (const job of screenshotJobs) {
  assets.push(await renderWebp(job));
}
if (preservedDuoAsset) {
  assets.push(preservedDuoAsset);
}
for (const job of localizedJobs) {
  assets.push(await renderWebp(job));
}
assets.push(await renderContactSheet());

const iconSource = path.join(
  repoRoot,
  "apps/mobile/store-assets/android/play-icon-512.png"
);
const iconOutput = path.join(outputRoot, "app-icon-192.png");
await sharp(iconSource)
  .resize(192, 192, { fit: "cover" })
  .png({ compressionLevel: 9 })
  .toFile(iconOutput);
const iconMetadata = await sharp(iconOutput).metadata();
assets.push({
  source: "apps/mobile/store-assets/android/play-icon-512.png",
  sourceSha256: await sha256(iconSource),
  output: path.relative(repoRoot, iconOutput),
  outputSha256: await sha256(iconOutput),
  width: iconMetadata.width,
  height: iconMetadata.height,
  bytes: (await fs.stat(iconOutput)).size,
});

const sources = [
  appSource,
  ...(localizedSource ? [localizedSource] : []),
  duoSource,
];
const manifest = {
  schemaVersion: 2,
  sourceCollection: "mobile-1.7-current",
  generator: "scripts/prepare-landing-page-assets.mjs",
  sources,
  assets,
};
await fs.writeFile(
  existingManifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

const totalBytes = assets.reduce((sum, item) => sum + item.bytes, 0);
console.log(
  `Prepared ${assets.length} landing-page assets (${(totalBytes / 1024 / 1024).toFixed(2)} MiB) in ${path.relative(
    repoRoot,
    outputRoot
  )}.`
);

async function renderWebp({
  sourceRoot: jobSourceRoot,
  source,
  output,
  width,
  quality,
  provenance,
  locale,
}) {
  const sourcePath = path.join(jobSourceRoot, source);
  const outputPath = path.join(outputRoot, output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(sourcePath)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  return {
    ...(locale ? { locale } : {}),
    source: path.posix.join(
      provenance.collection,
      source.split(path.sep).join("/")
    ),
    sourceCommit: provenance.appSourceCommit,
    ...(provenance.captureRunnerCommit
      ? { captureRunnerCommit: provenance.captureRunnerCommit }
      : {}),
    sourceSha256: await sha256(sourcePath),
    output: path.relative(repoRoot, outputPath),
    outputSha256: await sha256(outputPath),
    width: metadata.width,
    height: metadata.height,
    bytes: (await fs.stat(outputPath)).size,
  };
}

async function renderContactSheet() {
  const tileWidth = 220;
  const tileHeight = 478;
  const sources = frameNames.map((frame) =>
    path.join(sourceRoot, "iphone-6.9-inch-portrait", `${frame}.png`)
  );
  const composites = await Promise.all(
    sources.map(async (source, index) => ({
      input: await sharp(source)
        .resize(tileWidth, tileHeight, { fit: "fill" })
        .png()
        .toBuffer(),
      left: (index % 3) * tileWidth,
      top: Math.floor(index / 3) * tileHeight,
    }))
  );
  const output = path.join("screenshots", "contact-sheet.webp");
  const outputPath = path.join(outputRoot, output);
  await sharp({
    create: {
      width: tileWidth * 3,
      height: tileHeight * 2,
      channels: 3,
      background: "#f4f8fc",
    },
  })
    .composite(composites)
    .webp({ quality: 84, effort: 6, smartSubsample: true })
    .toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  const sourceHashes = await Promise.all(sources.map(sha256));
  return {
    source:
      "mobile-1.7/app-store-raw-en/iphone-6.9-inch-portrait/{practice-home,dark-arrow-duel,tactical-profile,focused-run,survival,review}.png",
    sourceCommit: appSource.appSourceCommit,
    sourceSha256: crypto
      .createHash("sha256")
      .update(sourceHashes.join("\n"))
      .digest("hex"),
    output: path.relative(repoRoot, outputPath),
    outputSha256: await sha256(outputPath),
    width: metadata.width,
    height: metadata.height,
    bytes: (await fs.stat(outputPath)).size,
  };
}

function resolveDirectory(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a directory path`);
  return path.resolve(value);
}

function resolveOptionalDirectory(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a directory path`);
  return path.resolve(value);
}

async function validateJobInput({
  sourceRoot: jobSourceRoot,
  source,
  capture,
  provenance,
}) {
  const sourcePath = path.join(jobSourceRoot, source);
  const expectedPath = source.split(path.sep).join("/");
  if (capture.file !== expectedPath) {
    throw new Error(`Capture manifest path mismatch for ${expectedPath}`);
  }
  if (capture.sourceCommit !== provenance.appSourceCommit) {
    throw new Error(`Capture manifest App source mismatch for ${expectedPath}`);
  }
  const actualSha256 = await sha256(sourcePath);
  if (actualSha256 !== capture.sha256) {
    throw new Error(`Capture manifest hash mismatch for ${expectedPath}`);
  }
}

function appCapture(manifest, frameId, deviceFamily) {
  const frame = manifest.frames?.find(
    (candidate) => candidate.frameId === frameId
  );
  const capture = frame?.captures?.[deviceFamily];
  if (!capture?.file || !capture?.sha256 || !capture?.sourceCommit) {
    throw new Error(`Missing ${deviceFamily} capture metadata for ${frameId}`);
  }
  return capture;
}

function localizedCapture(manifest, locale, frameId) {
  const record = manifest.records?.find(
    (candidate) => candidate.locale === locale && candidate.frameId === frameId
  );
  if (!record?.file || !record?.sha256 || !record?.sourceCommit) {
    throw new Error(`Missing localized capture metadata for ${locale}/${frameId}`);
  }
  return record;
}

function duoCapture(manifest, frameId) {
  const capture = manifest.frames?.find(
    (candidate) => candidate.frameId === frameId
  );
  if (!capture?.file || !capture?.sha256 || !capture?.sourceCommit) {
    throw new Error(`Missing Duo capture metadata for ${frameId}`);
  }
  return capture;
}

function assertCommit(commit, label) {
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error(`${label} is missing a 40-character commit`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}
