const { execFileSync: nodeExecFileSync } = require('node:child_process');
const { join } = require('node:path');

async function setAndroidNetworkEnabled(enabled, options = {}) {
  const environment = options.environment ?? process.env;
  const execFileSync = options.execFileSync ?? nodeExecFileSync;
  const networkStateProbeAttempts = options.networkStateProbeAttempts ?? 15;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const adb = androidAdbPath(environment);
  const serial = environment.DETOX_ANDROID_DEVICE || 'emulator-5554';
  const prefix = ['-s', serial, 'shell'];
  const sdkLevel = Number(run(execFileSync, adb, [...prefix, 'getprop', 'ro.build.version.sdk']));
  if (!Number.isInteger(sdkLevel) || sdkLevel < 1) {
    throw new Error(`Unable to resolve Android SDK level from ${serial}`);
  }

  const airplaneModeEnabled = !enabled;
  const airplaneModeValue = airplaneModeEnabled ? '1' : '0';
  if (!enabled && !hasAndroidActiveDefaultNetwork(execFileSync, adb, prefix)) {
    throw new Error(
      'Cannot prove the Android offline transition because no active default network existed before airplane mode.'
    );
  }
  if (sdkLevel >= 30) {
    run(execFileSync, adb, [
      ...prefix,
      'cmd',
      'connectivity',
      'airplane-mode',
      airplaneModeEnabled ? 'enable' : 'disable',
    ]);
  } else {
    const adbUserId = run(execFileSync, adb, [...prefix, 'id', '-u']);
    if (adbUserId !== '0') {
      throw new Error(
        `API ${sdkLevel} offline validation requires root adbd for the protected airplane-mode broadcast; `
        + `received uid ${adbUserId || '<empty>'}`
      );
    }
    run(execFileSync, adb, [
      ...prefix,
      'settings',
      'put',
      'global',
      'airplane_mode_on',
      airplaneModeValue,
    ]);
    run(execFileSync, adb, [
      ...prefix,
      'am',
      'broadcast',
      '-a',
      'android.intent.action.AIRPLANE_MODE',
      '--ez',
      'state',
      String(airplaneModeEnabled),
    ]);
  }

  const actualValue = run(execFileSync, adb, [
    ...prefix,
    'settings',
    'get',
    'global',
    'airplane_mode_on',
  ]);
  if (actualValue !== airplaneModeValue) {
    throw new Error(
      `Android airplane mode did not become ${airplaneModeEnabled ? 'enabled' : 'disabled'}; `
      + `expected ${airplaneModeValue}, received ${actualValue || '<empty>'}`
    );
  }

  await waitForAndroidDefaultNetworkState({
    adb,
    attempts: networkStateProbeAttempts,
    enabled,
    execFileSync,
    prefix,
    retryDelayMs,
  });
}

function androidAdbPath(environment = process.env) {
  if (environment.ADB_PATH) {
    return environment.ADB_PATH;
  }
  const sdkRoot = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
  if (!sdkRoot) {
    throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT is required for Android E2E.');
  }
  return join(sdkRoot, 'platform-tools', 'adb');
}

function run(execFileSync, command, args) {
  return String(execFileSync(command, args, { encoding: 'utf8' }) ?? '').trim();
}

function hasAndroidActiveDefaultNetwork(execFileSync, adb, prefix) {
  const connectivityState = run(execFileSync, adb, [...prefix, 'dumpsys', 'connectivity']);
  const match = connectivityState.match(/^Active default network:\s*(\S+)\s*$/m);
  const value = match?.[1];
  if (value === 'none') {
    return false;
  }
  if (value && /^\d+$/.test(value)) {
    return true;
  }
  throw new Error(
    `Unable to resolve Android active default network; received ${value || '<missing>'}`
  );
}

async function waitForAndroidDefaultNetworkState({
  adb,
  attempts,
  enabled,
  execFileSync,
  prefix,
  retryDelayMs,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (hasAndroidActiveDefaultNetwork(execFileSync, adb, prefix) === enabled) {
      return;
    }
    if (attempt + 1 < attempts && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(enabled
    ? 'Android did not restore an active default network after airplane mode was disabled'
    : 'Android still had an active default network after airplane mode was enabled');
}

module.exports = {
  androidAdbPath,
  setAndroidNetworkEnabled,
};
