#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { statSync } = require('node:fs');
const { basename, join } = require('node:path');

const APP_ID = 'com.chessticize.mobile';
const PROGRESS_DATABASE_FILES = Object.freeze([
  'chessticize-mobile.sqlite',
  'chessticize-mobile.sqlite-journal',
  'chessticize-mobile.sqlite-wal',
]);
const ANDROID_AUTO_BACKUP_QUOTA_BYTES = 25 * 1024 * 1024;
const ANDROID_PROGRESS_BACKUP_MAX_BYTES = 20 * 1024 * 1024;

function assessBackupPayload(files) {
  const seenNames = new Set();
  const normalized = files.map(({ name, bytes }) => {
    if (!PROGRESS_DATABASE_FILES.includes(name)) {
      throw new Error(`Unexpected Android Progress Backup file: ${name}`);
    }
    if (seenNames.has(name)) {
      throw new Error(`Duplicate Android Progress Backup file: ${name}`);
    }
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error(`Invalid byte count for ${name}: ${bytes}`);
    }
    seenNames.add(name);
    return { name, bytes };
  });
  const totalBytes = normalized.reduce((sum, file) => sum + file.bytes, 0);
  return {
    status: totalBytes <= ANDROID_PROGRESS_BACKUP_MAX_BYTES ? 'pass' : 'fail',
    files: normalized,
    totalBytes,
    contractBytes: ANDROID_PROGRESS_BACKUP_MAX_BYTES,
    quotaBytes: ANDROID_AUTO_BACKUP_QUOTA_BYTES,
    headroomBytes: ANDROID_AUTO_BACKUP_QUOTA_BYTES - totalBytes,
  };
}

function assertBackupPayloadWithinContract(files) {
  const report = assessBackupPayload(files);
  if (report.status !== 'pass') {
    throw new Error(
      `Android Progress Backup payload ${formatMiB(report.totalBytes)} exceeds the 20 MiB release contract `
      + `and leaves only ${formatMiB(report.headroomBytes)} against Android Auto Backup's 25 MiB quota.`,
    );
  }
  return report;
}

function measureLocalFiles(paths) {
  return paths.map(input => ({
    name: typeof input === 'string' ? basename(input) : input.name,
    bytes: statSync(typeof input === 'string' ? input : input.path).size,
  }));
}

function isExplicitMissingDeviceFile(error, name) {
  if (error?.status !== 1) {
    return false;
  }
  const escapedPath = join('databases', name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stderr = String(error.stderr || '');
  return new RegExp(
    `^stat: (?:cannot stat )?['"]?${escapedPath}['"]?: No such file or directory\\r?$`,
    'm',
  ).test(stderr);
}

function describeCommandFailure(error) {
  const stderr = String(error?.stderr || '').trim();
  return stderr || error?.message || String(error);
}

function measureDeviceFiles({ adbPath, serial, run = execFileSync }) {
  return PROGRESS_DATABASE_FILES.flatMap(name => {
    let output;
    try {
      output = run(
        adbPath,
        ['-s', serial, 'shell', 'run-as', APP_ID, 'stat', '-c', '%s', join('databases', name)],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (error) {
      const isRequired = name === PROGRESS_DATABASE_FILES[0];
      if (!isRequired && isExplicitMissingDeviceFile(error, name)) {
        return [];
      }
      const fileKind = isRequired ? 'required progress database' : 'optional progress database sidecar';
      throw new Error(
        `Unable to measure ${fileKind} ${name} on ${serial}: ${describeCommandFailure(error)}`,
      );
    }
    const normalizedOutput = String(output).trim();
    if (!/^\d+$/.test(normalizedOutput)) {
      throw new Error(
        `Invalid stat byte count for ${name} on ${serial}: ${JSON.stringify(normalizedOutput)}`,
      );
    }
    const bytes = Number(normalizedOutput);
    if (!Number.isSafeInteger(bytes)) {
      throw new Error(
        `Invalid stat byte count for ${name} on ${serial}: ${JSON.stringify(normalizedOutput)}`,
      );
    }
    return [{ name, bytes }];
  });
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function parseArguments(argv) {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const args = { json: false, paths: [] };
  const namedFileFlags = new Map([
    ['--database', PROGRESS_DATABASE_FILES[0]],
    ['--journal', PROGRESS_DATABASE_FILES[1]],
    ['--wal', PROGRESS_DATABASE_FILES[2]],
  ]);
  for (let index = 0; index < normalizedArgv.length; index += 1) {
    const arg = normalizedArgv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--adb-device') {
      args.serial = normalizedArgv[index + 1];
      index += 1;
    } else if (namedFileFlags.has(arg)) {
      args.paths.push({ name: namedFileFlags.get(arg), path: normalizedArgv[index + 1] });
      index += 1;
    } else {
      args.paths.push(arg);
    }
  }
  if (args.serial && args.paths.length > 0) {
    throw new Error('Use either --adb-device or local database paths, not both.');
  }
  if (!args.serial && args.paths.length === 0) {
    throw new Error('Provide --adb-device <serial> or local database paths.');
  }
  return args;
}

function main(argv = process.argv.slice(2), environment = process.env) {
  const args = parseArguments(argv);
  const files = args.serial
    ? measureDeviceFiles({
      adbPath: environment.ADB_PATH
        || join(environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT || '', 'platform-tools', 'adb'),
      serial: args.serial,
    })
    : measureLocalFiles(args.paths);
  const report = assertBackupPayloadWithinContract(files);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `Android Progress Backup: ${formatMiB(report.totalBytes)} payload, `
      + `${formatMiB(report.headroomBytes)} headroom below the 25 MiB quota.\n`,
    );
  }
  return report;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  ANDROID_AUTO_BACKUP_QUOTA_BYTES,
  ANDROID_PROGRESS_BACKUP_MAX_BYTES,
  PROGRESS_DATABASE_FILES,
  assessBackupPayload,
  assertBackupPayloadWithinContract,
  measureDeviceFiles,
  measureLocalFiles,
  parseArguments,
};
