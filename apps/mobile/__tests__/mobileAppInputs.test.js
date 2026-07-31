const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  classifyMobileInputPath,
  compareMobileAppInputs,
  hashArtifactPath,
  parseCliArgs,
  recordArtifactManifest,
  runCli,
  verifyArtifactReuse,
} = require('../scripts/mobile-app-inputs');

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return result.stdout.trim();
}

function write(repoRoot, relativePath, contents) {
  const targetPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
}

function commitAll(repoRoot, message) {
  runGit(repoRoot, ['add', '.']);
  runGit(repoRoot, ['commit', '-m', message]);
  return runGit(repoRoot, ['rev-parse', 'HEAD']);
}

function createRepository() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-inputs-'));
  runGit(repoRoot, ['init']);
  runGit(repoRoot, ['config', 'user.email', 'tests@chessticize.invalid']);
  runGit(repoRoot, ['config', 'user.name', 'Chessticize Tests']);
  write(repoRoot, '.gitignore', 'build/\n');
  write(repoRoot, 'apps/mobile/src/App.tsx', 'export const app = 1;\n');
  write(repoRoot, 'apps/mobile/e2e/practice.e2e.js', 'test("practice", () => {});\n');
  write(repoRoot, 'docs/TESTING.md', '# Testing\n');
  return { repoRoot, sourceSha: commitAll(repoRoot, 'Initial app') };
}

describe('mobile App input identity', () => {
  it('keeps local retained-APK reruns fail-closed and scoped to one target', () => {
    const validation = fs.readFileSync(
      path.resolve(__dirname, '../../../docs/ANDROID_VALIDATION.md'),
      'utf8',
    );

    expect(validation).toContain('mobile-app-inputs.js record-artifact');
    expect(validation).toContain('mobile-app-inputs.js verify-artifact');
    expect(validation).toContain('ANDROID_VALIDATION_APP_SOURCE_SHA="$app_source_sha"');
    expect(validation).toContain('--suite android-history');
    expect(validation).toContain('This path never');
    expect(validation).toContain('invokes Gradle');
    expect(fs.existsSync(
      path.resolve(
        __dirname,
        '../../../.github/workflows/mobile-android-test-only-rerun.yml',
      ),
    )).toBe(false);
  });

  it.each([
    ['AGENTS.md', 'record-only'],
    ['.github/pull_request_template.md', 'record-only'],
    ['docs/ANDROID_VALIDATION.md', 'record-only'],
    ['docs/ui-design/assets/mobile-navigation-flow.png', 'record-only'],
    ['docs/android-play-owner-evidence.example.json', 'record-only'],
    ['docs/release-helper.js', 'app-build'],
    ['apps/mobile/docs/ANDROID_RELEASE_PLAN.md', 'record-only'],
    ['apps/mobile/docs/release-helper.js', 'app-build'],
    ['.codex/skills/example/SKILL.md', 'record-only'],
    ['.codex/skills/example/agents/openai.yaml', 'record-only'],
    ['.codex/skills/example/scripts/validate.sh', 'app-build'],
    [
      '.codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh',
      'test-runner',
    ],
    ['apps/mobile/__tests__/screen.test.js', 'test-runner'],
    ['apps/mobile/e2e/practice.e2e.js', 'test-runner'],
    [
      'apps/mobile/native/stockfish/Bridge/tests/StockfishRunnerLifecycleTest.cpp',
      'test-runner',
    ],
    ['apps/mobile-lab/src/Practice.stories.tsx', 'test-runner'],
    ['apps/mobile/scripts/android-validation-matrix.js', 'test-runner'],
    ['apps/mobile/scripts/mobile-app-inputs.js', 'app-build'],
    ['scripts/validate-development-process.mjs', 'test-runner'],
    ['apps/mobile/src/components/Practice.tsx', 'app-build'],
    ['apps/mobile/android/app/src/androidTest/Test.kt', 'app-build'],
    ['apps/mobile/detox.config.js', 'app-build'],
    ['pnpm-lock.yaml', 'app-build'],
  ])('classifies %s as %s', (relativePath, category) => {
    expect(classifyMobileInputPath(relativePath)).toBe(category);
  });

  it('rejects malformed, duplicate, and unknown CLI options', () => {
    expect(() => parseCliArgs(['compare', '--app-source-sha', '--output', 'out.json']))
      .toThrow('Invalid mobile App input argument --app-source-sha');
    expect(() => parseCliArgs([
      'compare',
      '--output',
      'one.json',
      '--output',
      'two.json',
    ])).toThrow('Duplicate mobile App input option --output');
    expect(() => runCli([
      'compare',
      '--app-source-sha',
      'a'.repeat(40),
      '--test-runner-sha',
      'b'.repeat(40),
      '--output',
      'out.json',
      '--allow-unknown',
      '1',
    ])).toThrow('Unknown mobile App input option: --allow-unknown');
  });

  it('allows only explicit test-runner and record changes to reuse an App build', () => {
    const { repoRoot, sourceSha } = createRepository();
    write(repoRoot, 'apps/mobile/e2e/practice.e2e.js', 'test("practice retry", () => {});\n');
    write(repoRoot, 'docs/TESTING.md', '# Testing updated\n');
    const testRunnerSha = commitAll(repoRoot, 'Fix test runner');

    expect(compareMobileAppInputs({
      appSourceSha: sourceSha,
      repoRoot,
      testRunnerSha,
    })).toMatchObject({
      appSourceSha: sourceSha,
      testRunnerSha,
      appBuildInputsUnchanged: true,
      classifiedChanges: [
        { path: 'apps/mobile/e2e/practice.e2e.js', category: 'test-runner' },
        { path: 'docs/TESTING.md', category: 'record-only' },
      ],
    });
  });

  it('fails closed for runtime, native-test APK, dependency, and unknown changes', () => {
    const { repoRoot, sourceSha } = createRepository();
    write(repoRoot, 'apps/mobile/src/App.tsx', 'export const app = 2;\n');
    write(repoRoot, 'unknown-release-input.txt', 'unknown\n');
    const testRunnerSha = commitAll(repoRoot, 'Change App inputs');

    expect(() => compareMobileAppInputs({
      appSourceSha: sourceSha,
      repoRoot,
      testRunnerSha,
    })).toThrow(/Changed App build inputs: .*App\.tsx.*unknown-release-input/);
  });

  it('requires the App source to be an ancestor of the test runner', () => {
    const { repoRoot, sourceSha } = createRepository();
    runGit(repoRoot, ['checkout', '--orphan', 'unrelated']);
    runGit(repoRoot, ['rm', '-rf', '.']);
    write(repoRoot, 'docs/unrelated.md', 'unrelated\n');
    const unrelatedSha = commitAll(repoRoot, 'Unrelated');

    expect(() => compareMobileAppInputs({
      appSourceSha: sourceSha,
      repoRoot,
      testRunnerSha: unrelatedSha,
    })).toThrow('must be an ancestor');
  });

  it('records and verifies unchanged artifact bytes across a test-only commit', () => {
    const { repoRoot, sourceSha } = createRepository();
    const artifactPath = path.join(repoRoot, 'build/Chessticize.app');
    const manifestPath = path.join(repoRoot, 'build/app-manifest.json');
    const reusePath = path.join(repoRoot, 'build/reuse.json');
    write(repoRoot, 'build/Chessticize.app/main.jsbundle', 'bundled app\n');

    const manifest = recordArtifactManifest({
      appSourceSha: sourceSha,
      artifactPath,
      outputPath: manifestPath,
      repoRoot,
    });
    expect(manifest.artifactSha256).toBe(hashArtifactPath(artifactPath));

    write(repoRoot, 'apps/mobile/e2e/practice.e2e.js', 'test("retry", () => {});\n');
    const testRunnerSha = commitAll(repoRoot, 'Fix E2E');
    expect(verifyArtifactReuse({
      appSourceSha: sourceSha,
      artifactPath,
      manifestPath,
      outputPath: reusePath,
      repoRoot,
      testRunnerSha,
    })).toMatchObject({
      appSourceSha: sourceSha,
      testRunnerSha,
      appBuildInputsUnchanged: true,
      artifactBytesUnchanged: true,
    });

    write(repoRoot, 'build/Chessticize.app/main.jsbundle', 'mutated app\n');
    expect(() => verifyArtifactReuse({
      appSourceSha: sourceSha,
      artifactPath,
      manifestPath,
      outputPath: reusePath,
      repoRoot,
      testRunnerSha,
    })).toThrow('Artifact bytes differ');
  });
});
