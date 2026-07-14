import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  truncateSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const runnerSource = resolve(
  ".codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh"
);

test("local E2E runner fails when Stockfish artifact enumeration fails", () => {
  const fixture = createRunnerFixture();

  try {
    const result = fixture.run({ STOCKFISH_HELPER_MODE: "fail" });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Stockfish artifact metadata helper failed/);
    assert.match(result.stderr, /Could not enumerate Stockfish NNUE assets from artifact metadata/);
  } finally {
    fixture.cleanup();
  }
});

test("local E2E runner rejects empty Stockfish artifact metadata", () => {
  const fixture = createRunnerFixture();

  try {
    const result = fixture.run({ STOCKFISH_HELPER_MODE: "empty" });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Stockfish artifact metadata listed no NNUE assets/);
  } finally {
    fixture.cleanup();
  }
});

test("local E2E runner rejects empty records in Stockfish artifact metadata", () => {
  const fixture = createRunnerFixture();

  try {
    const result = fixture.run({
      STOCKFISH_HELPER_MODE: "success",
      STOCKFISH_HELPER_OUTPUT: "\napps/mobile/native/stockfish/Resources/network.nnue\n"
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Stockfish artifact metadata contains an empty NNUE path/);
  } finally {
    fixture.cleanup();
  }
});

test("local E2E runner rejects malformed Stockfish artifact records", () => {
  const fixture = createRunnerFixture();
  const malformedPath = "apps/mobile/native/stockfish/Resources/not-a-network.bin";
  fixture.addAsset(malformedPath);

  try {
    const result = fixture.run({
      STOCKFISH_HELPER_MODE: "success",
      STOCKFISH_HELPER_OUTPUT: `${malformedPath}\n`
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Malformed Stockfish NNUE asset path/);
  } finally {
    fixture.cleanup();
  }
});

test("local E2E runner verifies every NNUE record returned by the helper", () => {
  const fixture = createRunnerFixture();
  const nnuePaths = [
    "apps/mobile/native/stockfish/Resources/first.nnue",
    "apps/mobile/native/stockfish/Resources/second.nnue"
  ];
  for (const nnuePath of nnuePaths) {
    fixture.addAsset(nnuePath);
  }

  try {
    const result = fixture.run({
      STOCKFISH_HELPER_MODE: "success",
      STOCKFISH_HELPER_OUTPUT: `${nnuePaths.join("\n")}\n`
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Verified 2 Stockfish NNUE assets from artifact metadata/);
  } finally {
    fixture.cleanup();
  }
});

test("local E2E runner does not skip a later NNUE record", () => {
  const fixture = createRunnerFixture();
  const firstPath = "apps/mobile/native/stockfish/Resources/first.nnue";
  const pointerPath = "apps/mobile/native/stockfish/Resources/pointer.nnue";
  fixture.addAsset(firstPath);
  fixture.addAsset(pointerPath, 132);

  try {
    const result = fixture.run({
      STOCKFISH_HELPER_MODE: "success",
      STOCKFISH_HELPER_OUTPUT: `${firstPath}\n${pointerPath}\n`
    });

    assert.notEqual(result.status, 0, result.stdout);
    assert.ok(result.stderr.includes(`${pointerPath} is a Git LFS pointer`));
    assert.doesNotMatch(result.stdout, /Verified .* Stockfish NNUE assets/);
  } finally {
    fixture.cleanup();
  }
});

function createRunnerFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), "chessticize-local-e2e-runner-"));
  const runnerPath = join(
    repoRoot,
    ".codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh"
  );
  const rubyPrefix = join(repoRoot, "fake-ruby");
  const fakeBin = join(rubyPrefix, "bin");
  const mobileBin = join(repoRoot, "apps/mobile/node_modules/.bin");

  mkdirSync(dirname(runnerPath), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(mobileBin, { recursive: true });
  copyFileSync(runnerSource, runnerPath);
  chmodSync(runnerPath, 0o755);

  writeExecutable(
    join(fakeBin, "ruby"),
    `#!/usr/bin/env bash
if [[ "$1" == "-e" ]]; then
  printf '3.3'
fi
`
  );
  writeExecutable(
    join(fakeBin, "git"),
    `#!/usr/bin/env bash
if [[ "$1" == "rev-parse" && "$2" == "HEAD" ]]; then
  printf '0123456789abcdef0123456789abcdef01234567\n'
fi
exit 0
`
  );
  writeExecutable(
    join(fakeBin, "node"),
    `#!/usr/bin/env bash
if [[ "\${STOCKFISH_HELPER_MODE:-}" == "fail" ]]; then
  printf 'Stockfish artifact metadata helper failed\n' >&2
  exit 7
fi
printf '%s' "\${STOCKFISH_HELPER_OUTPUT:-}"
`
  );
  writeExecutable(
    join(fakeBin, "pnpm"),
    `#!/usr/bin/env bash
if [[ "$1" == "mobile:e2e:build:ios" ]]; then
  mkdir -p "$TEST_REPO_ROOT/apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/Chessticize.app"
  : > "$TEST_REPO_ROOT/apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/Chessticize.app/main.jsbundle"
fi
`
  );
  writeExecutable(
    join(fakeBin, "xcrun"),
    `#!/usr/bin/env bash
if [[ "$1" == "simctl" && "$2" == "list" ]]; then
  printf '%s (00000000-0000-0000-0000-000000000000) (Shutdown)\n' "$DETOX_IOS_DEVICE"
fi
`
  );
  writeExecutable(
    join(fakeBin, "xcodebuild"),
    `#!/usr/bin/env bash
printf 'Xcode 26.5\nBuild version 17F42\n'
`
  );
  for (const command of ["applesimutils", "brew", "bundle"]) {
    writeExecutable(join(fakeBin, command), "#!/usr/bin/env bash\nexit 0\n");
  }
  writeExecutable(join(mobileBin, "detox"), "#!/usr/bin/env bash\nexit 0\n");

  return {
    addAsset(relativePath: string, size = 1_000_001) {
      const assetPath = join(repoRoot, relativePath);
      mkdirSync(dirname(assetPath), { recursive: true });
      writeFileSync(assetPath, "");
      truncateSync(assetPath, size);
    },
    run(extraEnv: NodeJS.ProcessEnv = {}) {
      return spawnSync(runnerPath, [], {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          CHESSTICIZE_E2E_SCOPE: "flows",
          CHESSTICIZE_RUBY_PREFIX: rubyPrefix,
          DETOX_IOS_DEVICE: "Test-Detox",
          TEST_REPO_ROOT: repoRoot,
          ...extraEnv
        }
      });
    },
    cleanup() {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  };
}

function writeExecutable(path: string, source: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}
