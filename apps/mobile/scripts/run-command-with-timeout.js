#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function parseTimeoutSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Timeout seconds must be a positive number, received ${value ?? '<missing>'}.`);
  }
  return seconds;
}

function runCommandWithTimeout(args = process.argv.slice(2), spawn = spawnSync) {
  const [timeoutValue, command, ...commandArgs] = args;
  const timeoutSeconds = parseTimeoutSeconds(timeoutValue);
  if (!command) {
    throw new Error('A command is required after the timeout seconds.');
  }

  const result = spawn(command, commandArgs, {
    stdio: 'inherit',
    timeout: Math.ceil(timeoutSeconds * 1000),
    killSignal: 'SIGKILL',
  });
  if (result.error?.code === 'ETIMEDOUT') {
    return 124;
  }
  if (result.error) {
    throw result.error;
  }
  if (Number.isInteger(result.status)) {
    return result.status;
  }
  return result.signal === 'SIGKILL' ? 137 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = runCommandWithTimeout();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 64;
  }
}

module.exports = {
  parseTimeoutSeconds,
  runCommandWithTimeout,
};
