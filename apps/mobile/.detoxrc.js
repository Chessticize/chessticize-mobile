module.exports = {
  testRunner: {
    args: {
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Chessticize.app',
      build: 'scripts/ios-build-for-detox.sh',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build-release/Build/Products/Release-iphonesimulator/Chessticize.app',
      build: 'bash scripts/ios-build-release-for-detox.sh',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: process.env.DETOX_IOS_DEVICE
        ? {name: process.env.DETOX_IOS_DEVICE}
        : {type: 'iPhone 16'},
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
  },
};
