#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Median requires at least one measurement.');
  }
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function parseStartOutput(output) {
  const value = (name) => {
    const match = String(output).match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim();
  };
  const totalTimeMs = Number(value('TotalTime'));
  const waitTimeMs = Number(value('WaitTime'));
  if (!Number.isSafeInteger(totalTimeMs) || !Number.isSafeInteger(waitTimeMs)) {
    throw new Error(
      `Could not parse Android cold-start timing output:\n${String(output).trim()}`,
    );
  }
  return {
    launchState: value('LaunchState') || 'UNKNOWN',
    totalTimeMs,
    waitTimeMs,
  };
}

function parseMemoryOutput(output) {
  const summary = {};
  const rows = [
    ['javaHeap', 'Java Heap'],
    ['nativeHeap', 'Native Heap'],
    ['code', 'Code'],
    ['stack', 'Stack'],
    ['graphics', 'Graphics'],
    ['privateOther', 'Private Other'],
    ['system', 'System'],
  ];
  for (const [key, label] of rows) {
    const match = String(output).match(
      new RegExp(`^\\s*${label.replace(/ /g, '\\s+')}\\s*:\\s*(\\d+)\\s+(\\d+)`, 'm'),
    );
    if (match) {
      summary[key] = { pssKb: Number(match[1]), rssKb: Number(match[2]) };
    }
  }
  const totalPss = String(output).match(/^\s*TOTAL PSS:\s*(\d+)/m);
  const totalRss = String(output).match(/\bTOTAL RSS:\s*(\d+)/m);
  if (!totalPss || !totalRss) {
    throw new Error('Could not parse Android memory summary.');
  }
  return {
    totalPssKb: Number(totalPss[1]),
    totalRssKb: Number(totalRss[1]),
    categories: summary,
  };
}

function parsePackageOutput(output) {
  const versionCode = String(output).match(/\bversionCode=(\d+)/)?.[1];
  const versionName = String(output).match(/\bversionName=([^\s]+)/)?.[1];
  if (!versionCode || !versionName) {
    throw new Error('Could not resolve installed Android version metadata.');
  }
  return { versionCode: Number(versionCode), versionName };
}

function runCommand(command, args, options = {}, run = spawnSync) {
  const result = run(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${String(result.stderr || result.stdout || '').trim()}`,
    );
  }
  return String(result.stdout || '');
}

function runGit(repoRoot, args, run) {
  return runCommand('git', args, { cwd: repoRoot }, run).trim();
}

function runBenchmark({
  allowDirty = false,
  apkPath,
  component,
  device,
  freshInstall = false,
  outputPath,
  packageName = 'com.chessticize.mobile',
  repoRoot,
  run = spawnSync,
  runs = 5,
  sourceSha,
  variant,
}) {
  if (!device || !component || !variant) {
    throw new Error('Android runtime benchmark requires device, component, and variant.');
  }
  if (!Number.isSafeInteger(runs) || runs < 3) {
    throw new Error('Android runtime benchmark requires at least three cold-start runs.');
  }
  if (!fs.existsSync(apkPath) || !fs.statSync(apkPath).isFile()) {
    throw new Error(`Android runtime benchmark APK does not exist: ${apkPath}`);
  }
  const checkoutSha = runGit(repoRoot, ['rev-parse', 'HEAD'], run).toLowerCase();
  const exactSourceSha = (sourceSha || checkoutSha).toLowerCase();
  if (!EXACT_SHA_PATTERN.test(exactSourceSha)) {
    throw new Error('Android runtime benchmark requires an exact 40-character source SHA.');
  }
  const trackedStatus = runGit(
    repoRoot,
    ['status', '--porcelain', '--untracked-files=no'],
    run,
  );
  if (trackedStatus && !allowDirty) {
    throw new Error('Refusing Android runtime benchmark from a dirty tracked worktree.');
  }

  const adb = (...args) => runCommand('adb', ['-s', device, ...args], {}, run);
  if (freshInstall) {
    const installedPath = adb('shell', 'pm', 'path', packageName).trim();
    if (installedPath) {
      adb('uninstall', packageName);
    }
  }
  adb('install', '-r', apkPath);
  const packageMetadata = parsePackageOutput(
    adb('shell', 'dumpsys', 'package', packageName),
  );
  adb('shell', 'cmd', 'package', 'compile', '--reset', packageName);
  const coldStarts = [];
  for (let index = 0; index < runs; index += 1) {
    coldStarts.push(parseStartOutput(
      adb('shell', 'am', 'start', '-W', '-S', '-n', component),
    ));
  }
  const memory = parseMemoryOutput(adb('shell', 'dumpsys', 'meminfo', packageName));
  const evidence = {
    schemaVersion: 1,
    sourceSha: exactSourceSha,
    checkoutSha,
    worktreeClean: !trackedStatus,
    variant,
    artifact: {
      apkBytes: fs.statSync(apkPath).size,
      apkSha256: sha256(apkPath),
    },
    device,
    packageName,
    component,
    packageMetadata,
    freshInstall,
    compilationReset: true,
    coldStart: {
      runs: coldStarts,
      medianTotalTimeMs: median(coldStarts.map((entry) => entry.totalTimeMs)),
      medianWaitTimeMs: median(coldStarts.map((entry) => entry.waitTimeMs)),
    },
    memory,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function parseArguments(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const result = {
    allowDirty: false,
    freshInstall: false,
    packageName: 'com.chessticize.mobile',
    runs: 5,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--allow-dirty') {
      result.allowDirty = true;
      continue;
    }
    if (argument === '--fresh-install') {
      result.freshInstall = true;
      continue;
    }
    const value = args[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a value.`);
    }
    const keyByArgument = {
      '--apk': 'apk',
      '--component': 'component',
      '--device': 'device',
      '--output': 'output',
      '--package': 'packageName',
      '--source-sha': 'sourceSha',
      '--variant': 'variant',
    };
    if (argument === '--runs') {
      result.runs = Number(value);
    } else if (keyByArgument[argument]) {
      result[keyByArgument[argument]] = value;
    } else {
      throw new Error(`Unknown Android runtime benchmark argument ${argument}.`);
    }
    index += 1;
  }
  for (const required of ['apk', 'component', 'device', 'output', 'variant']) {
    if (!result[required]) {
      throw new Error(`Android runtime benchmark requires --${required}.`);
    }
  }
  return result;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const repoRoot = path.resolve(__dirname, '../../..');
  return runBenchmark({
    allowDirty: options.allowDirty,
    apkPath: path.resolve(repoRoot, options.apk),
    component: options.component,
    device: options.device,
    freshInstall: options.freshInstall,
    outputPath: path.resolve(repoRoot, options.output),
    packageName: options.packageName,
    repoRoot,
    runs: options.runs,
    sourceSha: options.sourceSha,
    variant: options.variant,
  });
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  median,
  parseArguments,
  parseMemoryOutput,
  parsePackageOutput,
  parseStartOutput,
  runBenchmark,
};
