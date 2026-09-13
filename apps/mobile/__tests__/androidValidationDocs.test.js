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
    expect(validation).toContain('-gpu swiftshader');
    expect(validation).toContain('System UI isn\'t responding');
    expect(validation).toContain('Do not let the matrix retry a suite automatically');
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

});
