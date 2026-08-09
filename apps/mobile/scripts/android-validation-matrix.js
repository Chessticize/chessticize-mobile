#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  compareMobileAppInputs,
  hashArtifactPath,
} = require('./mobile-app-inputs');

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

function validationStepsForApiLevel(apiLevel, selectedSuite) {
  if (apiLevel === 24) {
    if (selectedSuite && selectedSuite !== 'android-api24-smoke') {
      throw new Error(
        `Unsupported Android API 24 suite ${selectedSuite}. Expected android-api24-smoke.`
      );
    }
    return [
      { kind: 'prepare', command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh' },
      { kind: 'install', command: 'apps/mobile/scripts/install-android-detox-apks.sh' },
      { kind: 'detox', suite: 'android-api24-smoke', reuseInstalledApp: true },
    ];
  }

  if (apiLevel === 36) {
    if (selectedSuite && !API36_SUITES.includes(selectedSuite)) {
      throw new Error(
        `Unsupported Android API 36 suite ${selectedSuite}.`
      );
    }
    if (selectedSuite) {
      return [
        { kind: 'prepare', command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh' },
        ...(selectedSuite === 'android-review-reminders'
          ? [{
            kind: 'native',
            command: 'apps/mobile/scripts/android-review-reminder-native-evidence.sh',
          }]
          : []),
        { kind: 'detox', suite: selectedSuite },
      ];
    }
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

function progressPathForEvidence(outputPath) {
  return outputPath.endsWith('.json')
    ? `${outputPath.slice(0, -'.json'.length)}.progress.json`
    : `${outputPath}.progress.json`;
}

function writeProgress({
  apiLevel,
  appSourceSha,
  currentStep,
  outputPath,
  result,
  stepResults,
  steps,
  testRunnerSha,
}) {
  const resultById = new Map(
    stepResults.map((stepResult) => [stepResult.id, stepResult])
  );
  const progress = {
    schemaVersion: 2,
    commitSha: testRunnerSha,
    appSourceSha,
    testRunnerSha,
    apiLevel,
    currentStep,
    result,
    steps: steps.map((step) => {
      const id = stepId(step);
      return {
        id,
        command: renderValidationCommand(step),
        result: resultById.get(id)?.result ?? 'pending',
        ...(resultById.get(id)?.exitCode === undefined
          ? {}
          : { exitCode: resultById.get(id).exitCode }),
      };
    }),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(progressPathForEvidence(outputPath), `${JSON.stringify(progress, null, 2)}\n`);
}

function renderValidationCommand(step) {
  if (step.kind === 'detox') {
    const reusePrefix = step.reuseInstalledApp
      ? 'CHESSTICIZE_DETOX_REUSE_INSTALLED_APP=1 '
      : '';
    return `${reusePrefix}DETOX_ACTIVE_SUITE=${step.suite} pnpm mobile:e2e:test:android:ci`;
  }
  return step.command;
}

function createAndroidValidationEvidence({
  apiLevel,
  appBuildInputsUnchanged,
  appArtifactSha256,
  appInputDigest,
  appSourceSha,
  appVariant = 'e2e',
  buildResult,
  device,
  steps,
  stepResults,
  testArtifactSha256,
  testRunnerSha,
  trackedWorktreeStatus,
}) {
  if (appBuildInputsUnchanged !== true) {
    throw new Error(
      'Android validation evidence requires a passing App build input comparison.',
    );
  }
  if (!/^[0-9a-f]{40}$/i.test(appSourceSha ?? '')) {
    throw new Error('Android validation evidence requires an exact 40-character App source SHA.');
  }
  if (!/^[0-9a-f]{40}$/i.test(testRunnerSha ?? '')) {
    throw new Error('Android validation evidence requires an exact 40-character test runner SHA.');
  }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(appVariant)) {
    throw new Error('Android validation evidence requires a valid App variant.');
  }
  for (const [label, digest] of [
    ['App input', appInputDigest],
    ['App APK', appArtifactSha256],
    ['test APK', testArtifactSha256],
  ]) {
    if (!/^[0-9a-f]{64}$/i.test(digest ?? '')) {
      throw new Error(`Android validation evidence requires an exact ${label} SHA-256.`);
    }
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
    schemaVersion: 2,
    commitSha: testRunnerSha,
    appSourceSha,
    testRunnerSha,
    appVariant,
    appInputDigest,
    appBuildInputsUnchanged,
    artifacts: {
      appApkSha256: appArtifactSha256,
      testApkSha256: testArtifactSha256,
    },
    reusedAppBuild: appSourceSha !== testRunnerSha,
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
  appBuildInputsUnchanged,
  appArtifactSha256,
  appInputDigest,
  appSourceSha,
  appVariant,
  buildResult,
  device,
  expectedTestRunnerSha,
  outputPath,
  readGitHead,
  readTrackedWorktreeStatus,
  runStep,
  selectedSuite,
  testArtifactSha256,
}) {
  const steps = validationStepsForApiLevel(apiLevel, selectedSuite);
  fs.rmSync(outputPath, { force: true });
  fs.rmSync(progressPathForEvidence(outputPath), { force: true });

  if (!/^[0-9a-f]{40}$/i.test(expectedTestRunnerSha ?? '')) {
    throw new Error('Android validation requires an explicit exact 40-character test runner SHA.');
  }
  const initialHead = readGitHead();
  if (initialHead !== expectedTestRunnerSha) {
    throw new Error(
      `Android validation requested test runner ${expectedTestRunnerSha}, which does not match checkout ${initialHead}.`
    );
  }
  const initialStatus = readTrackedWorktreeStatus();
  if (String(initialStatus ?? '').trim()) {
    throw new Error('Android validation tracked worktree must be clean before execution.');
  }

  const stepResults = [];
  writeProgress({
    apiLevel,
    appSourceSha,
    currentStep: null,
    outputPath,
    result: 'running',
    stepResults,
    steps,
    testRunnerSha: initialHead,
  });
  for (const step of steps) {
    const id = stepId(step);
    stepResults.push({ id, result: 'running' });
    writeProgress({
      apiLevel,
      appSourceSha,
      currentStep: id,
      outputPath,
      result: 'running',
      stepResults,
      steps,
      testRunnerSha: initialHead,
    });
    const exitCode = runStep(step);
    if (exitCode !== 0) {
      stepResults[stepResults.length - 1] = { id, result: 'fail', exitCode };
      writeProgress({
        apiLevel,
        appSourceSha,
        currentStep: id,
        outputPath,
        result: 'fail',
        stepResults,
        steps,
        testRunnerSha: initialHead,
      });
      throw new Error(
        `Android validation step ${id} failed with exit code ${exitCode}.`
      );
    }
    stepResults[stepResults.length - 1] = { id, result: 'pass' };
    writeProgress({
      apiLevel,
      appSourceSha,
      currentStep: null,
      outputPath,
      result: 'running',
      stepResults,
      steps,
      testRunnerSha: initialHead,
    });
  }

  const finalHead = readGitHead();
  if (finalHead !== expectedTestRunnerSha) {
    throw new Error(
      `Android validation checkout moved from ${expectedTestRunnerSha} to ${finalHead}.`
    );
  }
  const evidence = createAndroidValidationEvidence({
    apiLevel,
    appBuildInputsUnchanged,
    appArtifactSha256,
    appInputDigest,
    appSourceSha,
    appVariant,
    buildResult,
    device,
    steps,
    stepResults,
    testArtifactSha256,
    testRunnerSha: finalHead,
    trackedWorktreeStatus: readTrackedWorktreeStatus(),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  writeProgress({
    apiLevel,
    appSourceSha,
    currentStep: null,
    outputPath,
    result: 'pass',
    stepResults,
    steps,
    testRunnerSha: finalHead,
  });
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
    } else if (argument === '--suite') {
      parsed.selectedSuite = normalizedArgs[index + 1];
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
  validationStepsForApiLevel(parsed.apiLevel, parsed.selectedSuite);
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
  const { apiLevel, outputPath, selectedSuite } = parseCliArgs(args);
  const repoRoot = path.resolve(__dirname, '../../..');
  const absoluteOutputPath = path.resolve(repoRoot, outputPath);
  const expectedTestRunnerSha = requiredEnvironment(
    'ANDROID_VALIDATION_COMMIT_SHA',
    environment,
  ).toLowerCase();
  const appSourceSha = (
    environment.ANDROID_VALIDATION_APP_SOURCE_SHA || expectedTestRunnerSha
  ).toLowerCase();
  const appVariant = environment.ANDROID_VALIDATION_APP_VARIANT || 'e2e';
  const comparison = compareMobileAppInputs({
    appSourceSha,
    repoRoot,
    testRunnerSha: expectedTestRunnerSha,
  });
  const buildResult = requiredEnvironment('ANDROID_VALIDATION_BUILD_RESULT', environment);
  const appApkPath = path.resolve(
    repoRoot,
    environment.CHESSTICIZE_ANDROID_E2E_APK
      || 'apps/mobile/android/app/build/outputs/apk/e2e/app-e2e.apk',
  );
  const testApkPath = path.resolve(
    repoRoot,
    environment.CHESSTICIZE_ANDROID_E2E_TEST_APK
      || 'apps/mobile/android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk',
  );
  const device = {
    abi: requiredEnvironment('ANDROID_VALIDATION_DEVICE_ABI', environment),
    apiLevel,
    profile: requiredEnvironment('ANDROID_VALIDATION_DEVICE_PROFILE', environment),
    serial: requiredEnvironment('DETOX_ANDROID_DEVICE', environment),
  };
  const appArtifactSha256 = hashArtifactPath(appApkPath);
  return runAndroidValidationMatrix({
    apiLevel,
    appBuildInputsUnchanged: comparison.appBuildInputsUnchanged,
    appArtifactSha256,
    appInputDigest: comparison.appInputDigest,
    appSourceSha,
    appVariant,
    buildResult,
    device,
    expectedTestRunnerSha,
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
            env: {
              ...environment,
              DETOX_ACTIVE_SUITE: step.suite,
              ...(step.reuseInstalledApp
                ? { CHESSTICIZE_DETOX_REUSE_INSTALLED_APP: '1' }
                : {}),
            },
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
    selectedSuite,
    testArtifactSha256: hashArtifactPath(testApkPath),
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
  progressPathForEvidence,
  renderValidationCommand,
  runAndroidValidationMatrix,
  runCli,
  validationStepsForApiLevel,
};
