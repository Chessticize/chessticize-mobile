#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const API36_SUITES = [
  'android-offline-practice',
  'android-arrow-duel',
  'android-custom-practice',
  'android-history',
  'android-stockfish',
  'android-system-back',
  'android-review-reminders',
  'flows',
  'practice',
];

function validationStepsForApiLevel(apiLevel) {
  if (apiLevel === 24) {
    return [
      { kind: 'prepare', command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh' },
      { kind: 'detox', suite: 'android-api24-smoke' },
    ];
  }

  if (apiLevel === 36) {
    return [
      { kind: 'prepare', command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh' },
      { kind: 'native', command: 'apps/mobile/scripts/android-review-reminder-native-evidence.sh' },
      ...API36_SUITES.map((suite) => ({ kind: 'detox', suite })),
    ];
  }

  throw new Error(
    `Unsupported Android validation API level ${apiLevel}. Expected 24 or 36.`
  );
}

function stepId(step) {
  return step.suite ?? step.command;
}

function renderValidationCommand(step) {
  if (step.kind === 'detox') {
    return `DETOX_ACTIVE_SUITE=${step.suite} pnpm mobile:e2e:test:android:ci`;
  }
  return step.command;
}

function createAndroidValidationEvidence({
  apiLevel,
  buildResult,
  commitSha,
  device,
  steps,
  stepResults,
  trackedWorktreeStatus,
}) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha ?? '')) {
    throw new Error('Android validation evidence requires an exact 40-character commit SHA.');
  }
  if (buildResult !== 'success') {
    throw new Error('Android validation build result must be success.');
  }
  if (String(trackedWorktreeStatus ?? '').trim()) {
    throw new Error('Android validation tracked worktree must be clean.');
  }
  if (!device
    || device.apiLevel !== apiLevel
    || !device.abi
    || !device.profile
    || !device.serial) {
    throw new Error('Android validation evidence requires a complete device matrix entry.');
  }

  const expectedStepIds = steps.map(stepId);
  const resultById = new Map(
    (stepResults ?? []).map((stepResult) => [stepResult.id, stepResult.result])
  );
  if (resultById.size !== expectedStepIds.length
    || expectedStepIds.some((id) => resultById.get(id) !== 'pass')) {
    throw new Error('Android validation evidence requires a passing result for every validation step.');
  }

  return {
    schemaVersion: 1,
    commitSha,
    buildResult,
    commands: steps.map(renderValidationCommand),
    deviceMatrix: [device],
    suiteResults: steps
      .filter((step) => step.kind === 'detox')
      .map((step) => ({ suite: step.suite, result: resultById.get(step.suite) })),
    worktreeClean: true,
    result: 'pass',
  };
}

function runAndroidValidationMatrix({
  apiLevel,
  buildResult,
  device,
  expectedCommitSha,
  outputPath,
  readGitHead,
  readTrackedWorktreeStatus,
  runStep,
}) {
  const steps = validationStepsForApiLevel(apiLevel);
  fs.rmSync(outputPath, { force: true });

  if (!/^[0-9a-f]{40}$/i.test(expectedCommitSha ?? '')) {
    throw new Error('Android validation requires an explicit exact 40-character commit SHA.');
  }
  const initialHead = readGitHead();
  if (initialHead !== expectedCommitSha) {
    throw new Error(
      `Android validation requested ${expectedCommitSha}, which does not match checkout ${initialHead}.`
    );
  }
  const initialStatus = readTrackedWorktreeStatus();
  if (String(initialStatus ?? '').trim()) {
    throw new Error('Android validation tracked worktree must be clean before execution.');
  }

  const stepResults = [];
  for (const step of steps) {
    const exitCode = runStep(step);
    if (exitCode !== 0) {
      throw new Error(
        `Android validation step ${stepId(step)} failed with exit code ${exitCode}.`
      );
    }
    stepResults.push({ id: stepId(step), result: 'pass' });
  }

  const finalHead = readGitHead();
  if (finalHead !== expectedCommitSha) {
    throw new Error(
      `Android validation checkout moved from ${expectedCommitSha} to ${finalHead}.`
    );
  }
  const evidence = createAndroidValidationEvidence({
    apiLevel,
    buildResult,
    commitSha: finalHead,
    device,
    steps,
    stepResults,
    trackedWorktreeStatus: readTrackedWorktreeStatus(),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function requiredEnvironment(name, environment) {
  const value = environment[name];
  if (!value) {
    throw new Error(`Set ${name} before recording Android validation evidence.`);
  }
  return value;
}

function parseCliArgs(args) {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const parsed = {};
  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index];
    if (argument === '--api-level') {
      parsed.apiLevel = Number(normalizedArgs[index + 1]);
      index += 1;
    } else if (argument === '--output') {
      parsed.outputPath = normalizedArgs[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown Android validation argument ${argument}.`);
    }
  }
  if (!parsed.outputPath) {
    throw new Error('Android validation requires --output <path>.');
  }
  validationStepsForApiLevel(parsed.apiLevel);
  return parsed;
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

function runCli(args = process.argv.slice(2), environment = process.env) {
  const { apiLevel, outputPath } = parseCliArgs(args);
  const repoRoot = path.resolve(__dirname, '../../..');
  const absoluteOutputPath = path.resolve(repoRoot, outputPath);
  const expectedCommitSha = requiredEnvironment('ANDROID_VALIDATION_COMMIT_SHA', environment);
  const buildResult = requiredEnvironment('ANDROID_VALIDATION_BUILD_RESULT', environment);
  const device = {
    abi: requiredEnvironment('ANDROID_VALIDATION_DEVICE_ABI', environment),
    apiLevel,
    profile: requiredEnvironment('ANDROID_VALIDATION_DEVICE_PROFILE', environment),
    serial: requiredEnvironment('DETOX_ANDROID_DEVICE', environment),
  };
  return runAndroidValidationMatrix({
    apiLevel,
    buildResult,
    device,
    expectedCommitSha,
    outputPath: absoluteOutputPath,
    readGitHead: () => runGit(repoRoot, ['rev-parse', 'HEAD']),
    readTrackedWorktreeStatus: () => runGit(
      repoRoot,
      ['status', '--porcelain', '--untracked-files=no']
    ),
    runStep: (step) => {
      const result = step.kind === 'detox'
        ? spawnSync(
          'pnpm',
          ['mobile:e2e:test:android:ci'],
          {
            cwd: repoRoot,
            env: { ...environment, DETOX_ACTIVE_SUITE: step.suite },
            stdio: 'inherit',
          }
        )
        : spawnSync(
          path.resolve(repoRoot, step.command),
          [],
          { cwd: repoRoot, env: environment, stdio: 'inherit' }
        );
      if (result.error) {
        throw result.error;
      }
      return result.status;
    },
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
  API36_SUITES,
  createAndroidValidationEvidence,
  parseCliArgs,
  renderValidationCommand,
  runAndroidValidationMatrix,
  runCli,
  validationStepsForApiLevel,
};
