const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Android validation documentation', () => {
  it('defines reproducible local, API 24, adaptive, and reusable native evidence commands', () => {
    const validation = read('docs/ANDROID_VALIDATION.md');

    expect(validation).toContain('pnpm mobile:doctor:android');
    expect(validation).toContain('pnpm mobile:validate:android:matrix');
    expect(validation).toContain('API 24');
    expect(validation).toContain('API 36');
    expect(validation).toContain('flows');
    expect(validation).toContain('practice');
    expect(validation).toContain('apps/mobile/scripts/android-adaptive-layout-evidence.sh');
    for (const field of [
      'App source SHA',
      'test-runner SHA',
      'App-input digest',
      'APK checksums',
      'build result',
      'commands',
      'device matrix',
      'suite results',
      'clean tracked worktree',
    ]) {
      expect(validation).toContain(field);
    }
    expect(validation).toContain('production SQLite');
    expect(validation).toContain('public UI');
    expect(validation).toContain('small deterministic fixture');
    expect(validation).toContain('retained-APK path');
    expect(validation).toContain('record-artifact');
    expect(validation).toContain('verify-artifact');
    expect(validation).toMatch(/never\s+invokes Gradle/);
    expect(validation).toContain('Do not automatically retry');
  });

  it('keeps physical ARM64 work optional and outside the release gate', () => {
    const validation = read('docs/ANDROID_VALIDATION.md');

    expect(validation).toContain('optional owner-recorded');
    expect(validation).toContain('#200');
    expect(validation).toContain('#188');
    expect(validation).toContain('not a feature-PR or release blocker');
    for (const check of [
      'Install and cold start',
      'board input',
      'Stockfish',
      'background and resume',
      'reminder',
      'backup-sensitive storage',
      'upgrade',
    ]) {
      expect(validation).toContain(check);
    }
  });

  it('routes future changes to the smallest proving Android layer', () => {
    const devLoop = read('.codex/skills/chessticize-mobile-dev-loop/SKILL.md');
    const architecture = read('docs/TESTING_ARCHITECTURE.md');

    expect(devLoop).toContain('## Android Validation');
    expect(devLoop).toContain('No Android Detox');
    expect(devLoop).toContain('Targeted Android validation');
    expect(devLoop).toContain('Full Android validation');
    expect(devLoop).toContain('pnpm mobile:validate:android:matrix');
    expect(devLoop).toContain('node apps/mobile/scripts/mobile-app-inputs.js compare');
    expect(devLoop).toContain('locally retained');
    expect(devLoop).toContain('Do not dispatch or recreate');
    expect(architecture).toContain('Android emulator and test-only rerun workflows are intentionally absent');
    expect(architecture).toContain('API 24');
    expect(architecture).toContain('bounded launch');
    expect(architecture).toContain('Validation identity and test-only reruns');
    expect(architecture).toContain('Physical-device checks are optional');
  });
});
