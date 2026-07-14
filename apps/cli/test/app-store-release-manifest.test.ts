import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
    format: "json" | "sqlite";
    manifestHash: string;
    packFileHash: string;
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

test("App Store release manifest reports source identity and hashed release artifacts", (t) => {
  const puzzleManifest = JSON.parse(readFileSync(resolve("fixtures/puzzles/bundled-core-pack.manifest.json"), "utf8")) as {
    puzzleCount: number;
    format?: "json" | "sqlite";
  };
  const stockfishArtifacts = JSON.parse(readFileSync(resolve("apps/mobile/stockfish-artifacts.json"), "utf8")) as {
    root: string;
    license: string;
    authors: string;
    nnue: string[];
  };
  const stockfishPath = (path: string) => `apps/mobile/${stockfishArtifacts.root}/${path}`;
  if (puzzleManifest.format === "sqlite" && !existsSync(resolve("fixtures/puzzles/bundled-core-pack.sqlite"))) {
    t.skip("core pack artifact not fetched; run pnpm fetch:core-pack before generating a release manifest");
    return;
  }
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
  assert.equal(manifest.releaseTagSuggestion, "ios-v1.1.0-build-2");
  assert.equal(manifest.packageManager, "pnpm@11.1.2");
  assert.deepEqual(manifest.app, {
    displayName: "Chessticize",
    bundleIdentifier: "com.chessticize.mobile",
    version: "1.1",
    build: "2",
    targetedDeviceFamily: "1,2",
    platform: "ios"
  });
  assert.equal(manifest.puzzlePack.id, "core");
  assert.equal(manifest.puzzlePack.puzzleCount, puzzleManifest.puzzleCount);
  assert.equal(manifest.puzzlePack.format, puzzleManifest.format ?? "json");
  assert.equal(manifest.puzzlePack.sourceLicense, "CC0");
  assert.match(manifest.puzzlePack.manifestHash, /^sha256:[0-9a-f]{64}$/u);
  assert.match(manifest.puzzlePack.packFileHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(manifest.stockfish.version, "Stockfish 18");
  assert.equal(manifest.stockfish.upstreamTag, "sf_18");
  assert.equal(manifest.stockfish.upstreamCommit, "cb3d4ee9b47d0c5aae855b12379378ea1439675c");

  const artifactsByPath = new Map(manifest.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const path of [
    "pnpm-lock.yaml",
    "apps/mobile/Gemfile.lock",
    "apps/mobile/ios/Podfile.lock",
    "THIRD_PARTY_NOTICES.md",
    "apps/mobile/stockfish-artifacts.json",
    puzzleManifest.format === "sqlite" ? "fixtures/puzzles/bundled-core-pack.sqlite" : "fixtures/puzzles/bundled-core-pack.json",
    "fixtures/puzzles/bundled-core-pack.manifest.json",
    stockfishPath(stockfishArtifacts.license),
    stockfishPath(stockfishArtifacts.authors),
    ...stockfishArtifacts.nnue.map(stockfishPath)
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
