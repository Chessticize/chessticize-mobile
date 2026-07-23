const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createAndroidValidationEvidence,
  parseCliArgs,
  runAndroidValidationMatrix,
  validationStepsForApiLevel,
} = require('../scripts/android-validation-matrix');

const EXACT_SHA = '0123456789abcdef0123456789abcdef01234567';

function passingEvidenceInput(overrides = {}) {
  const apiLevel = overrides.apiLevel ?? 24;
  const steps = validationStepsForApiLevel(apiLevel);
  return {
    apiLevel,
    buildResult: 'success',
    commitSha: EXACT_SHA,
    device: {
      abi: 'x86_64',
      apiLevel,
      profile: 'pixel_2',
      serial: 'emulator-5554',
    },
    steps,
    stepResults: steps.map((step) => ({
      id: step.suite ?? step.command,
      result: 'pass',
    })),
    trackedWorktreeStatus: '',
    ...overrides,
  };
}

function workflowJob(workflow, jobName) {
  const marker = `  ${jobName}:`;
  const start = workflow.indexOf(marker);
  if (start < 0) {
    throw new Error(`Workflow job ${jobName} is missing.`);
  }
  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.search(/^ {2}[a-z][a-z0-9-]*:/m);
  return nextJob < 0
    ? workflow.slice(start)
    : workflow.slice(start, start + marker.length + nextJob);
}

describe('Android validation matrix', () => {
  it('builds once and routes scheduled main to API 36 while manual exact-head runs include API 24', () => {
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../../.github/workflows/mobile-android.yml'),
      'utf8'
    );
    const rootPackage = require('../../../package.json');
    const launchJob = workflow.slice(
      workflow.indexOf('  android-launch:'),
      workflow.indexOf('  android-adaptive-layout:')
    );

    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('node-version: 22.x');
    expect(workflow).not.toContain('node-version: 26.x');
    expect(workflow.match(/^ {2}android-build:/gm)).toHaveLength(1);
    expect(launchJob).toContain('needs: android-build');
    expect(launchJob).toContain(
      "api-level: ${{ fromJSON(github.event_name == 'schedule' && '[36]' || '[24,36]') }}"
    );
    expect(launchJob).toContain(
      'pnpm mobile:validate:android:matrix -- --api-level "${{ matrix.api-level }}"'
    );
    expect(launchJob).toContain('ANDROID_VALIDATION_COMMIT_SHA: ${{ github.sha }}');
    expect(launchJob).toContain('ANDROID_VALIDATION_BUILD_RESULT: success');
    expect(launchJob).toContain('ANDROID_VALIDATION_DEVICE_ABI: x86_64');
    expect(launchJob).toContain('ANDROID_VALIDATION_DEVICE_PROFILE: pixel_2');
    expect(launchJob).toContain('apps/mobile/artifacts/android-validation/');
    expect(rootPackage.scripts['mobile:validate:android:matrix']).toBe(
      'pnpm --filter ChessticizeMobile validate:android:matrix'
    );
  });

  it('keeps release-only adaptive and backup evidence out of the nightly integration gate', () => {
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../../.github/workflows/mobile-android.yml'),
      'utf8'
    );

    for (const jobName of [
      'android-adaptive-layout',
      'android-progress-backup',
      'android-progress-backup-policy-api24',
      'android-progress-backup-policy-api36',
      'android-progress-backup-policy-api30',
    ]) {
      expect(workflowJob(workflow, jobName)).toContain(
        "if: github.event_name == 'workflow_dispatch'"
      );
    }
  });

  it('keeps API 24 bounded to launch, production storage, practice, and native-engine smoke', () => {
    expect(validationStepsForApiLevel(24)).toEqual([
      { kind: 'prepare', command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh' },
      { kind: 'install', command: 'apps/mobile/scripts/install-android-detox-apks.sh' },
      { kind: 'detox', suite: 'android-api24-smoke', reuseInstalledApp: true },
    ]);
  });

  it('runs complete shared journeys on API 36 without copying their product intent', () => {
    const steps = validationStepsForApiLevel(36);
    const suites = steps
      .filter((step) => step.kind === 'detox')
      .map((step) => step.suite);

    expect(suites).toEqual([
      'android-offline-practice',
      'android-arrow-duel',
      'android-custom-practice',
      'android-history',
      'android-stockfish',
      'android-system-back',
      'android-review-reminders',
      'flows',
      'practice',
    ]);
    expect(suites.filter((suite) => suite === 'flows')).toHaveLength(1);
    expect(suites.filter((suite) => suite === 'practice')).toHaveLength(1);
  });

  it('fails closed for an unsupported API level', () => {
    expect(() => validationStepsForApiLevel(30)).toThrow(
      'Unsupported Android validation API level 30. Expected 24 or 36.'
    );
  });

  it('accepts direct CLI arguments and one conventional leading separator only', () => {
    const expected = {
      apiLevel: 24,
      outputPath: 'apps/mobile/artifacts/android-validation/api-24.json',
    };
    const argumentsWithoutSeparator = [
      '--api-level',
      '24',
      '--output',
      expected.outputPath,
    ];

    expect(parseCliArgs(argumentsWithoutSeparator)).toEqual(expected);
    expect(parseCliArgs(['--', ...argumentsWithoutSeparator])).toEqual(expected);
    expect(() => parseCliArgs(['--', '--', ...argumentsWithoutSeparator]))
      .toThrow('Unknown Android validation argument --.');
    expect(() => parseCliArgs([...argumentsWithoutSeparator, '--']))
      .toThrow('Unknown Android validation argument --.');
  });

  it('records exact-head commands, device matrix, suite results, and a clean worktree', () => {
    expect(createAndroidValidationEvidence(passingEvidenceInput())).toEqual({
      schemaVersion: 1,
      commitSha: EXACT_SHA,
      buildResult: 'success',
      commands: [
        'apps/mobile/scripts/prepare-android-offline-e2e.sh',
        'apps/mobile/scripts/install-android-detox-apks.sh',
        'CHESSTICIZE_DETOX_REUSE_INSTALLED_APP=1 DETOX_ACTIVE_SUITE=android-api24-smoke pnpm mobile:e2e:test:android:ci',
      ],
      deviceMatrix: [{
        abi: 'x86_64',
        apiLevel: 24,
        profile: 'pixel_2',
        serial: 'emulator-5554',
      }],
      suiteResults: [{ suite: 'android-api24-smoke', result: 'pass' }],
      worktreeClean: true,
      result: 'pass',
    });
  });

  it.each([
    [{ commitSha: '' }, 'exact 40-character commit SHA'],
    [{ trackedWorktreeStatus: ' M apps/mobile/App.tsx' }, 'tracked worktree must be clean'],
    [{ stepResults: [] }, 'result for every validation step'],
    [{ buildResult: 'unknown' }, 'build result must be success'],
  ])('fails closed when required evidence is missing: %p', (overrides, message) => {
    expect(() => createAndroidValidationEvidence(passingEvidenceInput(overrides)))
      .toThrow(message);
  });

  it('executes the selected public matrix and writes auditable exact-head evidence', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'android-matrix-'));
    const outputPath = path.join(outputRoot, 'api-24.json');
    const progressPath = path.join(outputRoot, 'api-24.progress.json');
    const executed = [];

    const evidence = runAndroidValidationMatrix({
      apiLevel: 24,
      buildResult: 'success',
      device: {
        abi: 'x86_64',
        apiLevel: 24,
        profile: 'pixel_2',
        serial: 'emulator-5554',
      },
      expectedCommitSha: EXACT_SHA,
      outputPath,
      readGitHead: () => EXACT_SHA,
      readTrackedWorktreeStatus: () => '',
      runStep: (step) => {
        executed.push(step);
        return 0;
      },
    });

    expect(executed).toEqual(validationStepsForApiLevel(24));
    expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual(evidence);
    expect(JSON.parse(fs.readFileSync(progressPath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      commitSha: EXACT_SHA,
      apiLevel: 24,
      currentStep: null,
      result: 'pass',
      steps: [
        {
          id: 'apps/mobile/scripts/prepare-android-offline-e2e.sh',
          result: 'pass',
        },
        {
          id: 'apps/mobile/scripts/install-android-detox-apks.sh',
          result: 'pass',
        },
        {
          id: 'android-api24-smoke',
          result: 'pass',
        },
      ],
    });
    expect(evidence.result).toBe('pass');
  });

  it('stops at the first failed command, preserves progress diagnostics, and does not publish passing evidence', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'android-matrix-'));
    const outputPath = path.join(outputRoot, 'api-24.json');
    const progressPath = path.join(outputRoot, 'api-24.progress.json');
    let calls = 0;

    expect(() => runAndroidValidationMatrix({
      apiLevel: 24,
      buildResult: 'success',
      device: {
        abi: 'x86_64',
        apiLevel: 24,
        profile: 'pixel_2',
        serial: 'emulator-5554',
      },
      expectedCommitSha: EXACT_SHA,
      outputPath,
      readGitHead: () => EXACT_SHA,
      readTrackedWorktreeStatus: () => '',
      runStep: (step) => {
        calls += 1;
        return step.kind === 'detox' ? 9 : 0;
      },
    })).toThrow('Android validation step android-api24-smoke failed with exit code 9.');

    expect(calls).toBe(3);
    expect(fs.existsSync(outputPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(progressPath, 'utf8'))).toMatchObject({
      currentStep: 'android-api24-smoke',
      result: 'fail',
      steps: [
        expect.objectContaining({ result: 'pass' }),
        expect.objectContaining({ result: 'pass' }),
        expect.objectContaining({
          id: 'android-api24-smoke',
          result: 'fail',
          exitCode: 9,
        }),
      ],
    });
  });

  it('rejects evidence when the requested SHA does not match the checkout', () => {
    expect(() => runAndroidValidationMatrix({
      apiLevel: 24,
      buildResult: 'success',
      device: {
        abi: 'x86_64',
        apiLevel: 24,
        profile: 'pixel_2',
        serial: 'emulator-5554',
      },
      expectedCommitSha: EXACT_SHA,
      outputPath: path.join(os.tmpdir(), 'must-not-exist.json'),
      readGitHead: () => 'ffffffffffffffffffffffffffffffffffffffff',
      readTrackedWorktreeStatus: () => '',
      runStep: () => 0,
    })).toThrow('does not match checkout');
  });
});
