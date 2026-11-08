#!/usr/bin/env node

// Build-config check: the Dev-only seeded Tactical Profile history, the
// simulation profile and the simulated player must be absent from a production (`--dev false`) JS
// bundle for each platform, and present in a development bundle as a positive
// control, so the check cannot pass by grepping for the wrong marker.

const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const APP_DIR = resolve(__dirname, '..');
const DEV_ONLY_MARKERS = Object.freeze([
  'Seeded history needs empty progress',
  'Simulated player needs an active Run',
  // The Dev simulation profile's database name lives only in its Dev-only module.
  'chessticize-mobile-simulation.sqlite',
]);

function bundle(platform, dev, outputDir) {
  const output = join(outputDir, `${platform}-${dev ? 'dev' : 'release'}.jsbundle`);
  execFileSync(
    'npx',
    [
      'react-native',
      'bundle',
      '--platform',
      platform,
      '--dev',
      String(dev),
      '--minify',
      String(!dev),
      '--entry-file',
      'index.js',
      '--bundle-output',
      output,
      '--assets-dest',
      join(outputDir, `${platform}-${dev ? 'dev' : 'release'}-assets`),
    ],
    { cwd: APP_DIR, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return readFileSync(output, 'utf8');
}

function main() {
  const outputDir = mkdtempSync(join(tmpdir(), 'chessticize-dev-history-bundle-'));
  const failures = [];
  try {
    for (const platform of ['ios', 'android']) {
      const release = bundle(platform, false, outputDir);
      const development = bundle(platform, true, outputDir);
      for (const marker of DEV_ONLY_MARKERS) {
        if (release.includes(marker)) {
          failures.push(`${platform} release bundle contains "${marker}"`);
        }
        if (!development.includes(marker)) {
          failures.push(`${platform} development bundle lacks positive-control marker "${marker}"`);
        }
      }
      console.log(`${platform}: release bundle excludes seeded Dev history`);
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
}

main();
