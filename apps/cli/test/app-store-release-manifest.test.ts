import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

type ReleaseManifest = {
  schema: string;
  sourceCommit: string;
  dirty: boolean;
  releaseTagSuggestion: string;
  packageManager: string;
  app: {
    displayName: string;
    bundleIdentifier: string;
    version: string;
    build: string;
    targetedDeviceFamily: string;
    platform: string;
  };
  puzzlePack: {
    id: string;
    puzzleCount: number;
    manifestHash: string;
    sourceLicense: string;
  };
  stockfish: {
    version: string;
    upstreamTag: string;
    upstreamCommit: string;
  };
  artifacts: Array<{
    path: string;
    role: string;
    bytes: number;
    sha256: string;
  }>;
  releaseRules: string[];
};

test("App Store release manifest reports source identity and hashed release artifacts", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/app-store-release-manifest.mjs", "--allow-dirty"],
    {
      cwd: resolve("."),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(result.stdout) as ReleaseManifest;

  assert.equal(manifest.schema, "chessticize-mobile.app-store-release-manifest.v1");
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/u);
  assert.equal(manifest.releaseTagSuggestion, "ios-v1.0.0-build-1");
  assert.equal(manifest.packageManager, "pnpm@11.1.2");
  assert.deepEqual(manifest.app, {
    displayName: "Chessticize",
    bundleIdentifier: "com.chessticize.mobile",
    version: "1.0",
    build: "1",
    targetedDeviceFamily: "1",
    platform: "ios"
  });
  assert.equal(manifest.puzzlePack.id, "core");
  assert.equal(manifest.puzzlePack.puzzleCount, 3000);
  assert.equal(manifest.puzzlePack.sourceLicense, "CC0");
  assert.match(manifest.puzzlePack.manifestHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(manifest.stockfish.version, "Stockfish 18");
  assert.equal(manifest.stockfish.upstreamTag, "sf_18");
  assert.equal(manifest.stockfish.upstreamCommit, "cb3d4ee9b47d0c5aae855b12379378ea1439675c");

  const artifactsByPath = new Map(manifest.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const path of [
    "pnpm-lock.yaml",
    "apps/mobile/Gemfile.lock",
    "apps/mobile/ios/Podfile.lock",
    "THIRD_PARTY_NOTICES.md",
    "fixtures/puzzles/bundled-core-pack.json",
    "fixtures/puzzles/bundled-core-pack.manifest.json",
    "apps/mobile/ios/StockfishEngine/Copying.txt",
    "apps/mobile/ios/StockfishEngine/AUTHORS",
    "apps/mobile/ios/StockfishEngine/Resources/nn-c288c895ea92.nnue",
    "apps/mobile/ios/StockfishEngine/Resources/nn-37f18f62d772.nnue"
  ]) {
    const artifact = artifactsByPath.get(path);
    assert.ok(artifact, `missing artifact ${path}`);
    assert.ok(artifact.bytes > 0, `empty artifact ${path}`);
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/u, `invalid sha256 for ${path}`);
  }

  assert.ok(
    manifest.releaseRules.some((rule) => rule.includes("Create the public release tag from sourceCommit")),
    "release manifest must remind the releaser to tag the recorded commit"
  );
});
