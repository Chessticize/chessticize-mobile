import {
  mkdtempSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stockfishRoot = join(mobileRoot, "native", "stockfish");
const sourceRoot = join(stockfishRoot, "Stockfish", "src");
const bridgeRoot = join(stockfishRoot, "Bridge");
const testSource = join(
  bridgeRoot,
  "tests",
  "StockfishRunnerLifecycleTest.cpp"
);
const bigNetwork = join(
  stockfishRoot,
  "Resources",
  "nn-c288c895ea92.nnue"
);
const smallNetwork = join(
  stockfishRoot,
  "Resources",
  "nn-37f18f62d772.nnue"
);
const buildDirectory = mkdtempSync(
  join(tmpdir(), "chessticize-stockfish-lifecycle-")
);
const executable = join(buildDirectory, "stockfish-runner-lifecycle");

function cppSources(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name.startsWith("._")) {
        return [];
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return cppSources(path);
      }
      if (
        entry.isFile() &&
        entry.name.endsWith(".cpp") &&
        entry.name !== "main.cpp"
      ) {
        return [path];
      }
      return [];
    })
    .sort();
}

function fail(label, result) {
  const signal = result.signal ? ` signal=${result.signal}` : "";
  console.error(`${label} failed with status ${result.status}${signal}.`);
  if (result.stdout) {
    console.error(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
  process.exitCode = 1;
}

try {
  const compiler = process.env.CXX || "c++";
  const compileResult = spawnSync(
    compiler,
    [
      "-std=c++17",
      "-O3",
      "-fno-exceptions",
      "-fno-rtti",
      "-DNNUE_EMBEDDING_OFF",
      "-DUSE_PTHREADS",
      "-DIS_64BIT",
      "-DNO_PREFETCH",
      "-DNDEBUG",
      "-pthread",
      `-I${bridgeRoot}`,
      `-I${sourceRoot}`,
      testSource,
      join(bridgeRoot, "StockfishRunner.cpp"),
      ...cppSources(sourceRoot),
      "-o",
      executable
    ],
    {
      encoding: "utf8",
      timeout: 60_000
    }
  );
  if (compileResult.status !== 0) {
    fail("Stockfish lifecycle test compilation", compileResult);
  } else {
    const runResult = spawnSync(
      executable,
      [bigNetwork, smallNetwork],
      {
        encoding: "utf8",
        timeout: 60_000
      }
    );
    if (runResult.status !== 0) {
      fail("Stockfish lifecycle regression", runResult);
    } else {
      process.stdout.write(runResult.stdout);
    }
  }
} finally {
  rmSync(buildDirectory, { recursive: true, force: true });
}
