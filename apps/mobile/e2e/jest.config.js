const {
  resolveDetoxMaxWorkers,
  resolveDetoxTestTimeout,
  resolveDetoxTestMatch
} = require('./suiteConfig');

module.exports = {
  rootDir: '..',
  testMatch: resolveDetoxTestMatch(),
  testPathIgnorePatterns: [],
  testTimeout: resolveDetoxTestTimeout(),
  forceExit: true,
  maxWorkers: resolveDetoxMaxWorkers(),
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
