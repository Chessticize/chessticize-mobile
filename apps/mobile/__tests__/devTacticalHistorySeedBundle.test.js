const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');

// Release bundles must not contain the seeded Dev history. Metro drops the
// module only when its sole runtime reference is a literal `__DEV__` branch;
// `pnpm mobile:verify:release-bundle:dev-history` checks the built bundles.
describe('Dev-only seeded history bundle boundary', () => {
  it('is required only behind a literal __DEV__ branch so Release bundles drop it', () => {
    const sourceRoot = resolve(__dirname, '../src');
    const appRoot = resolve(__dirname, '..');
    const files = [
      ...sourceFiles(sourceRoot),
      join(appRoot, 'App.tsx'),
      join(appRoot, 'index.js'),
    ];
    const runtimeReferences = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const runtimeImport =
        /^import\s+(?!type\b)[^;]*from\s+["'][^"']*(?:devTacticalHistorySeed|\/simulation\/)[^"']*["']/m;
      if (runtimeImport.test(source)) {
        runtimeReferences.push(`${relative(appRoot, file)}: static import`);
      }
      for (const match of source.matchAll(/require\(\s*["'][^"']*(?:devTacticalHistorySeed|\/simulation\/)[^"']*["']\s*\)/g)) {
        const preceding = source.slice(Math.max(0, (match.index ?? 0) - 400), match.index);
        const guarded = /\.\.\.\(__DEV__\s*\?\s*\{\s*seedTacticalHistory:[\s\S]*$/.test(preceding);
        if (!guarded) {
          runtimeReferences.push(`${relative(appRoot, file)}: unguarded require`);
        }
      }
    }

    expect(runtimeReferences).toEqual([]);
    const mobilePractice = readFileSync(join(sourceRoot, 'platform/mobilePractice.ts'), 'utf8');
    expect(mobilePractice).toMatch(/\.\.\.\(__DEV__\s*\?\s*\{\s*seedTacticalHistory:/);
  });
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx|js)$/.test(entry) && entry !== 'devTacticalHistorySeed.ts' ? [path] : [];
  });
}
