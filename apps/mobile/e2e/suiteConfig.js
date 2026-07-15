const ACTIVE_E2E_TEST_MATCH_BY_SUITE = {
  practice: ['<rootDir>/e2e/practice.e2e.js'],
  flows: ['<rootDir>/e2e/flows.e2e.js']
};
const ACTIVE_E2E_TEST_MATCH = Object.values(ACTIVE_E2E_TEST_MATCH_BY_SUITE).flat();

const STORE_ASSETS_TEST_MATCH = ['<rootDir>/e2e/store-assets.e2e.js'];
const ADAPTIVE_LAYOUT_TEST_MATCH = ['<rootDir>/e2e/adaptive-layout.e2e.js'];
const ANDROID_LAUNCH_TEST_MATCH = ['<rootDir>/e2e/android-launch.e2e.js'];
const ANDROID_STANDARD_PRACTICE_TEST_MATCH = ['<rootDir>/e2e/android-standard-practice.e2e.js'];
const ANDROID_MIGRATION_TEST_MATCH = ['<rootDir>/e2e/android-migration.e2e.js'];
const ANDROID_OFFLINE_PRACTICE_TEST_MATCH = [
  ...ANDROID_LAUNCH_TEST_MATCH,
  ...ANDROID_STANDARD_PRACTICE_TEST_MATCH,
  ...ANDROID_MIGRATION_TEST_MATCH,
];
const ANDROID_STOCKFISH_TEST_MATCH = ['<rootDir>/e2e/android-stockfish.e2e.js'];
const ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH = [
  '<rootDir>/e2e/android-progress-backup-restore.e2e.js'
];
// The practice suite waits on the real Stockfish bridge. Two concurrent iOS
// simulators can make that analysis exceed the E2E timeout, so parallelism is
// an explicit DETOX_MAX_WORKERS experiment rather than the default.
const DEFAULT_DETOX_MAX_WORKERS = 1;

function resolveDetoxTestMatch(environment = process.env) {
  const captureStoreAssets = environment.CHESSTICIZE_CAPTURE_STORE_ASSETS === '1';
  const captureAdaptiveLayout = environment.CHESSTICIZE_CAPTURE_ADAPTIVE_LAYOUT === '1';
  const activeSuite = environment.DETOX_ACTIVE_SUITE;

  if ([captureStoreAssets, captureAdaptiveLayout, Boolean(activeSuite)].filter(Boolean).length > 1) {
    throw new Error('Active E2E and screenshot capture suites must run separately.');
  }

  if (captureStoreAssets) {
    return STORE_ASSETS_TEST_MATCH;
  }

  if (captureAdaptiveLayout) {
    return ADAPTIVE_LAYOUT_TEST_MATCH;
  }

  if (activeSuite === 'all') {
    return ACTIVE_E2E_TEST_MATCH;
  }

  if (activeSuite === 'android-launch') {
    return ANDROID_LAUNCH_TEST_MATCH;
  }

  if (activeSuite === 'android-standard-practice') {
    return ANDROID_STANDARD_PRACTICE_TEST_MATCH;
  }

  if (activeSuite === 'android-migration') {
    return ANDROID_MIGRATION_TEST_MATCH;
  }

  if (activeSuite === 'android-offline-practice') {
    return ANDROID_OFFLINE_PRACTICE_TEST_MATCH;
  }

  if (activeSuite === 'android-stockfish') {
    return ANDROID_STOCKFISH_TEST_MATCH;
  }

  if (activeSuite === 'android-progress-backup-restore') {
    return ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH;
  }

  if (activeSuite) {
    const suiteTestMatch = ACTIVE_E2E_TEST_MATCH_BY_SUITE[activeSuite];
    if (!suiteTestMatch) {
      throw new Error(`Unknown DETOX_ACTIVE_SUITE "${activeSuite}".`);
    }
    return suiteTestMatch;
  }

  return ACTIVE_E2E_TEST_MATCH;
}

function resolveDetoxMaxWorkers(environment = process.env) {
  const configuredWorkers = environment.DETOX_MAX_WORKERS;
  if (configuredWorkers === undefined || configuredWorkers === '') {
    return DEFAULT_DETOX_MAX_WORKERS;
  }

  const workerCount = Number(configuredWorkers);
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new Error(`DETOX_MAX_WORKERS must be a positive integer, received "${configuredWorkers}".`);
  }

  return workerCount;
}

module.exports = {
  ACTIVE_E2E_TEST_MATCH_BY_SUITE,
  ACTIVE_E2E_TEST_MATCH,
  STORE_ASSETS_TEST_MATCH,
  ADAPTIVE_LAYOUT_TEST_MATCH,
  ANDROID_LAUNCH_TEST_MATCH,
  ANDROID_STANDARD_PRACTICE_TEST_MATCH,
  ANDROID_MIGRATION_TEST_MATCH,
  ANDROID_OFFLINE_PRACTICE_TEST_MATCH,
  ANDROID_STOCKFISH_TEST_MATCH,
  ANDROID_PROGRESS_BACKUP_RESTORE_TEST_MATCH,
  DEFAULT_DETOX_MAX_WORKERS,
  resolveDetoxTestMatch,
  resolveDetoxMaxWorkers
};
