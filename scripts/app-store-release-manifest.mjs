#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStockfishArtifacts } from "./lib/stockfish-artifacts.mjs";
import { loadIOSReleaseIdentity } from "./lib/ios-release-identity.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const allowDirty = process.argv.includes("--allow-dirty");

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function uniqueMatches(source, pattern) {
  return Array.from(new Set(Array.from(source.matchAll(pattern), (match) => match[1].trim())));
}

function unquoteBuildSetting(value) {
  return value.replace(/^"|"$/gu, "");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(join(repoRoot, path))).digest("hex");
}

function artifact(path, role) {
  const absolutePath = join(repoRoot, path);
  return {
    path,
    role,
    bytes: statSync(absolutePath).size,
    sha256: sha256(path)
  };
}

function puzzlePackArtifactPath(manifest) {
  if (manifest.format === "sqlite" || existsSync(join(repoRoot, "fixtures/puzzles/bundled-core-pack.sqlite"))) {
    if (!existsSync(join(repoRoot, "fixtures/puzzles/bundled-core-pack.sqlite"))) {
      console.error("Core pack artifact is missing. Run `pnpm fetch:core-pack` before generating a release manifest.");
      process.exit(1);
    }
    return "fixtures/puzzles/bundled-core-pack.sqlite";
  }
  return "fixtures/puzzles/bundled-core-pack.json";
}

const rootPackage = readJson("package.json");
const stockfishArtifacts = loadStockfishArtifacts(repoRoot);
const puzzleManifest = readJson("fixtures/puzzles/bundled-core-pack.manifest.json");
const puzzlePackPath = puzzlePackArtifactPath(puzzleManifest);
const pbxproj = readText("apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj");
const iosReleaseIdentity = loadIOSReleaseIdentity(repoRoot);
const bundleIdentifiers = uniqueMatches(pbxproj, /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g);
const deviceFamilies = uniqueMatches(pbxproj, /TARGETED_DEVICE_FAMILY = ([^;]+);/g);
const targetedDeviceFamily = deviceFamilies.length === 1 ? unquoteBuildSetting(deviceFamilies[0]) : "";
const dirtyStatus = git(["status", "--porcelain"]);

if (dirtyStatus && !allowDirty) {
  console.error("Refusing to create an App Store release manifest from a dirty working tree.");
  console.error("Commit or discard local changes, or pass --allow-dirty for local review/testing only.");
  process.exit(1);
}

if (
  !iosReleaseIdentity.valid ||
  bundleIdentifiers.length !== 1 ||
  deviceFamilies.length !== 1
) {
  console.error("Refusing to create a release manifest because iOS identity fields are inconsistent.");
  console.error(
    JSON.stringify({ iosReleaseIdentity, bundleIdentifiers, deviceFamilies }, null, 2)
  );
  process.exit(1);
}

const sourceCommit = git(["rev-parse", "HEAD"]);
const version = iosReleaseIdentity.version;
const build = iosReleaseIdentity.build;
const tagVersion = version.split(".").length === 2 ? `${version}.0` : version;
const releaseTagSuggestion = `ios-v${tagVersion}-build-${build}`;

const manifest = {
  schema: "chessticize-mobile.app-store-release-manifest.v1",
  sourceCommit,
  dirty: dirtyStatus.length > 0,
  releaseTagSuggestion,
  packageManager: rootPackage.packageManager,
  app: {
    displayName: "Chessticize",
    bundleIdentifier: bundleIdentifiers[0],
    version,
    build,
    targetedDeviceFamily,
    platform: "ios"
  },
  puzzlePack: {
    id: puzzleManifest.id,
    title: puzzleManifest.title,
    puzzleCount: puzzleManifest.puzzleCount,
    arrowDuelCount: puzzleManifest.arrowDuelCount,
    format: puzzleManifest.format ?? "json",
    packFileHash: puzzleManifest.packFileHash ?? puzzleManifest.manifestHash,
    packFileBytes: puzzleManifest.packFileBytes,
    manifestHash: puzzleManifest.manifestHash,
    rating: puzzleManifest.rating,
    source: puzzleManifest.source,
    sourceLicense: puzzleManifest.sourceLicense
  },
  stockfish: {
    version: stockfishArtifacts.metadata.engineVersion,
    upstreamTag: stockfishArtifacts.metadata.upstreamTag,
    upstreamCommit: stockfishArtifacts.metadata.upstreamCommit,
    bundledSourcePath: stockfishArtifacts.sourcePath,
    bundledLicensePath: stockfishArtifacts.licensePath,
    bundledAuthorsPath: stockfishArtifacts.authorsPath
  },
  artifacts: [
    artifact("package.json", "root package manifest"),
    artifact("pnpm-lock.yaml", "dependency lockfile"),
    artifact("apps/mobile/package.json", "mobile package manifest"),
    artifact("apps/mobile/release-version.json", "canonical mobile release version"),
    artifact("apps/mobile/Gemfile.lock", "mobile Ruby dependency lockfile"),
    artifact("apps/mobile/ios/Podfile", "iOS CocoaPods manifest"),
    artifact("apps/mobile/ios/Podfile.lock", "iOS CocoaPods lockfile"),
    artifact("apps/mobile/ios/ChessticizeMobile.xcodeproj/project.pbxproj", "iOS target identity"),
    artifact("apps/mobile/ios/Config/ReleaseVersion.xcconfig", "generated iOS release version"),
    artifact("apps/mobile/ios/ChessticizeMobile/Info.plist", "iOS app metadata"),
    artifact("apps/mobile/ios/ChessticizeMobile/PrivacyInfo.xcprivacy", "iOS privacy manifest"),
    artifact("LICENSE", "GPL license"),
    artifact("THIRD_PARTY_NOTICES.md", "third-party notices"),
    artifact("docs/RELEASE_SOURCE_POLICY.md", "release source policy"),
    artifact("docs/PRIVACY_POLICY.md", "public privacy policy"),
    artifact(puzzlePackPath, "bundled offline puzzle pack"),
    artifact("fixtures/puzzles/bundled-core-pack.manifest.json", "bundled offline puzzle manifest"),
    artifact(stockfishArtifacts.configPath, "Stockfish artifact metadata"),
    artifact(stockfishArtifacts.licensePath, "bundled Stockfish GPL text"),
    artifact(stockfishArtifacts.authorsPath, "bundled Stockfish authors"),
    artifact(stockfishArtifacts.readmePath, "bundled Stockfish source notes"),
    artifact(stockfishArtifacts.podspecPath, "Stockfish podspec"),
    ...stockfishArtifacts.nnuePaths.map((path) => artifact(path, "Stockfish NNUE network"))
  ],
  releaseRules: [
    "Create the public release tag from sourceCommit before or at App Store submission.",
    "Attach this manifest to the GitHub release or store it in the TestFlight QA evidence location.",
    "Do not use a manifest created with dirty=true for a submitted App Store binary."
  ]
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
