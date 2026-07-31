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
const APP_INPUT_DIGEST = 'a'.repeat(64);
const APP_APK_DIGEST = 'b'.repeat(64);
const TEST_APK_DIGEST = 'c'.repeat(64);

function passingEvidenceInput(overrides = {}) {
  const apiLevel = overrides.apiLevel ?? 24;
  const steps = validationStepsForApiLevel(apiLevel);
  return {
    apiLevel,
    appBuildInputsUnchanged: true,
    appArtifactSha256: APP_APK_DIGEST,
    appInputDigest: APP_INPUT_DIGEST,
    appSourceSha: EXACT_SHA,
    buildResult: 'success',
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
    testArtifactSha256: TEST_APK_DIGEST,
    testRunnerSha: EXACT_SHA,
    trackedWorktreeStatus: '',
    ...overrides,
  };
}

describe('Android validation matrix', () => {
  it('keeps emulator validation local and covers API 24 and API 36', () => {
    const validation = fs.readFileSync(
      path.resolve(__dirname, '../../../docs/ANDROID_VALIDATION.md'),
      'utf8',
    );
    const rootPackage = require('../../../package.json');

    expect(fs.existsSync(
      path.resolve(__dirname, '../../../.github/workflows/mobile-android.yml'),
    )).toBe(false);
    expect(fs.existsSync(
      path.resolve(
        __dirname,
        '../../../.github/workflows/mobile-android-test-only-rerun.yml',
      ),
    )).toBe(false);
    expect(validation).toContain('Android emulator and Detox validation runs only');
    expect(validation).toContain('pnpm mobile:e2e:build:android');
    expect(validation).toContain('pnpm mobile:validate:android:matrix -- --api-level 36');
    expect(validation).toContain('Replace `36` with `24` only');
    expect(rootPackage.scripts['mobile:validate:android:matrix']).toBe(
      'pnpm --filter ChessticizeMobile validate:android:matrix'
    );
  });

  it('keeps conditional diagnostics available through local scripts', () => {
    const validation = fs.readFileSync(
      path.resolve(__dirname, '../../../docs/ANDROID_VALIDATION.md'),
      'utf8',
    );

    for (const command of [
      'apps/mobile/scripts/android-adaptive-layout-evidence.sh',
      'apps/mobile/scripts/android-progress-backup-policy-evidence.sh',
      'ANDROID_BACKUP_API36_SOURCE_DIR',
    ]) {
      expect(validation).toContain(command);
    }
    expect(validation).toContain('conditional boundary evidence');
    expect(validation).toMatch(/not an\s+automatic release matrix/);
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

  it('can rerun one affected API 36 suite without rebuilding or running unrelated suites', () => {
    expect(validationStepsForApiLevel(36, 'android-history')).toEqual([
      { kind: 'prepare', command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh' },
      { kind: 'detox', suite: 'android-history' },
    ]);
    expect(validationStepsForApiLevel(36, 'android-review-reminders')).toEqual([
      { kind: 'prepare', command: 'apps/mobile/scripts/prepare-android-offline-e2e.sh' },
      {
        kind: 'native',
        command: 'apps/mobile/scripts/android-review-reminder-native-evidence.sh',
      },
      { kind: 'detox', suite: 'android-review-reminders' },
    ]);
  });

  it('fails closed for an unsupported API level', () => {
    expect(() => validationStepsForApiLevel(30)).toThrow(
      'Unsupported Android validation API level 30. Expected 24 or 36.'
    );
  });

  it('fails closed for a suite outside the selected API contract', () => {
    expect(() => validationStepsForApiLevel(36, 'android-api24-smoke'))
      .toThrow('Unsupported Android API 36 suite');
    expect(() => validationStepsForApiLevel(24, 'android-history'))
      .toThrow('Unsupported Android API 24 suite');
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
    expect(parseCliArgs([
      '--api-level',
      '36',
      '--suite',
      'android-history',
      '--output',
      expected.outputPath,
    ])).toEqual({
      apiLevel: 36,
      selectedSuite: 'android-history',
      outputPath: expected.outputPath,
    });
  });

  it('records App source, test runner, artifact identity, commands, and a clean worktree', () => {
    expect(createAndroidValidationEvidence(passingEvidenceInput())).toEqual({
      schemaVersion: 2,
      commitSha: EXACT_SHA,
      appSourceSha: EXACT_SHA,
      testRunnerSha: EXACT_SHA,
      appInputDigest: APP_INPUT_DIGEST,
      appBuildInputsUnchanged: true,
      artifacts: {
        appApkSha256: APP_APK_DIGEST,
        testApkSha256: TEST_APK_DIGEST,
      },
      reusedAppBuild: false,
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
    [{ appBuildInputsUnchanged: false }, 'passing App build input comparison'],
    [{ appSourceSha: '' }, 'exact 40-character App source SHA'],
    [{ testRunnerSha: '' }, 'exact 40-character test runner SHA'],
    [{ appInputDigest: '' }, 'exact App input SHA-256'],
    [{ appArtifactSha256: '' }, 'exact App APK SHA-256'],
    [{ testArtifactSha256: '' }, 'exact test APK SHA-256'],
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
      appBuildInputsUnchanged: true,
      appArtifactSha256: APP_APK_DIGEST,
      appInputDigest: APP_INPUT_DIGEST,
      appSourceSha: EXACT_SHA,
      buildResult: 'success',
      device: {
        abi: 'x86_64',
        apiLevel: 24,
        profile: 'pixel_2',
        serial: 'emulator-5554',
      },
      expectedTestRunnerSha: EXACT_SHA,
      outputPath,
      readGitHead: () => EXACT_SHA,
      readTrackedWorktreeStatus: () => '',
      runStep: (step) => {
        executed.push(step);
        return 0;
      },
      testArtifactSha256: TEST_APK_DIGEST,
    });

    expect(executed).toEqual(validationStepsForApiLevel(24));
    expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual(evidence);
    expect(JSON.parse(fs.readFileSync(progressPath, 'utf8'))).toMatchObject({
      schemaVersion: 2,
      commitSha: EXACT_SHA,
      appSourceSha: EXACT_SHA,
      testRunnerSha: EXACT_SHA,
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
      appBuildInputsUnchanged: true,
      appArtifactSha256: APP_APK_DIGEST,
      appInputDigest: APP_INPUT_DIGEST,
      appSourceSha: EXACT_SHA,
      buildResult: 'success',
      device: {
        abi: 'x86_64',
        apiLevel: 24,
        profile: 'pixel_2',
        serial: 'emulator-5554',
      },
      expectedTestRunnerSha: EXACT_SHA,
      outputPath,
      readGitHead: () => EXACT_SHA,
      readTrackedWorktreeStatus: () => '',
      runStep: (step) => {
        calls += 1;
        return step.kind === 'detox' ? 9 : 0;
      },
      testArtifactSha256: TEST_APK_DIGEST,
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
      appArtifactSha256: APP_APK_DIGEST,
      appInputDigest: APP_INPUT_DIGEST,
      appSourceSha: EXACT_SHA,
      buildResult: 'success',
      device: {
        abi: 'x86_64',
        apiLevel: 24,
        profile: 'pixel_2',
        serial: 'emulator-5554',
      },
      expectedTestRunnerSha: EXACT_SHA,
      outputPath: path.join(os.tmpdir(), 'must-not-exist.json'),
      readGitHead: () => 'ffffffffffffffffffffffffffffffffffffffff',
      readTrackedWorktreeStatus: () => '',
      runStep: () => 0,
      testArtifactSha256: TEST_APK_DIGEST,
    })).toThrow('does not match checkout');
  });

  it('marks a different test-runner SHA as an explicit reused App build', () => {
    const testRunnerSha = 'f'.repeat(40);
    expect(createAndroidValidationEvidence(passingEvidenceInput({
      testRunnerSha,
    }))).toMatchObject({
      commitSha: testRunnerSha,
      appSourceSha: EXACT_SHA,
      testRunnerSha,
      reusedAppBuild: true,
    });
  });
});
