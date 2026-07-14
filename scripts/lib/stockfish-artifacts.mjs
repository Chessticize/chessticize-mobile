import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STOCKFISH_ARTIFACTS_CONFIG_PATH = "apps/mobile/stockfish-artifacts.json";

export function loadStockfishArtifacts(repoRoot) {
  const metadata = JSON.parse(
    readFileSync(join(repoRoot, STOCKFISH_ARTIFACTS_CONFIG_PATH), "utf8")
  );
  const mobilePath = (path) => join("apps/mobile", path);
  const stockfishPath = (path) => mobilePath(join(metadata.root, path));
  const nnuePaths = metadata.nnue.map(stockfishPath);

  return {
    metadata,
    configPath: STOCKFISH_ARTIFACTS_CONFIG_PATH,
    podspecPath: "apps/mobile/ChessticizeStockfish.podspec",
    sourcePath: stockfishPath(metadata.source),
    sourceSentinelPath: stockfishPath(metadata.sourceSentinel),
    licensePath: stockfishPath(metadata.license),
    authorsPath: stockfishPath(metadata.authors),
    readmePath: stockfishPath(metadata.readme),
    nnuePaths
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const artifacts = loadStockfishArtifacts(repoRoot);
  if (process.argv[2] === "--nnue-paths") {
    process.stdout.write(`${artifacts.nnuePaths.join("\n")}\n`);
  } else {
    process.stderr.write("Usage: node scripts/lib/stockfish-artifacts.mjs --nnue-paths\n");
    process.exitCode = 2;
  }
}
