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
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
    'android.e2e': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/e2e/app-e2e.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk',
      build: 'cd android && ./gradlew assembleE2e assembleAndroidTest -DtestBuildType=e2e',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: process.env.DETOX_IOS_DEVICE
        ? {name: process.env.DETOX_IOS_DEVICE}
        : {type: 'iPhone 16'},
    },
    'android.attached': {
      type: 'android.attached',
      device: {
        adbName: process.env.DETOX_ANDROID_DEVICE || 'emulator-5554',
      },
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
    'android.attached.e2e': {
      device: 'android.attached',
      app: 'android.e2e',
    },
    'android.attached.debug': {
      device: 'android.attached',
      app: 'android.debug',
    },
  },
};
