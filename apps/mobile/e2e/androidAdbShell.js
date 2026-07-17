const { execFileSync: nodeExecFileSync } = require('node:child_process');
const { androidAdbPath } = require('./androidNetwork');

function runAndroidAdbShell(args, options = {}) {
  const environment = options.environment ?? process.env;
  const execFileSync = options.execFileSync ?? nodeExecFileSync;
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const shellArgs = ['-s', serial, 'shell', ...args];
  const runShell = () => String(execFileSync(adb, shellArgs, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  }) ?? '');

  try {
    return runShell();
  } catch (error) {
    if (!isAdbDeviceOffline(error)) {
      throw error;
    }
  }

  execFileSync(adb, ['-s', serial, 'wait-for-device'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  return runShell();
}

function isAdbDeviceOffline(error) {
  const failureText = [error?.stderr, error?.stdout, error?.message]
    .filter((value) => value !== undefined && value !== null)
    .map(String)
    .join('\n');
  return /(?:^|\n)(?:adb:|error:)\s*device offline\s*(?:\n|$)/i.test(failureText);
}

module.exports = {
  runAndroidAdbShell,
};
