const fs = require('node:fs');
const path = require('node:path');

const {
  DENSITIES,
  decodePng,
  expectedLauncherResources,
  imagesEqual,
} = require('../scripts/android-launcher-icons');

const repositoryRoot = path.resolve(__dirname, '../../..');
const mobileRoot = path.join(repositoryRoot, 'apps/mobile');

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('Android development identity', () => {
  it('keeps physical-device Debug installs isolated from the Play application', () => {
    const appGradle = read('apps/mobile/android/app/build.gradle');

    expect(appGradle).toContain('debuggableVariants = ["debug", "deviceDev"]');
    expect(appGradle).toMatch(/deviceDev\s*\{[\s\S]*?initWith debug[\s\S]*?applicationIdSuffix "\.dev"[\s\S]*?matchingFallbacks = \["debug"\][\s\S]*?\}/);
    expect(appGradle).toMatch(/deviceDev\s*\{[\s\S]*?manifestPlaceholders = \[usesCleartextTraffic: true\][\s\S]*?\}/);
    expect(appGradle).toContain('variant.buildType == "deviceDev"');
    expect(appGradle).toContain('applicationId "com.chessticize.mobile"');

    const devStrings = read(
      'apps/mobile/android/app/src/deviceDev/res/values/strings.xml',
    );
    const devManifest = read(
      'apps/mobile/android/app/src/deviceDev/AndroidManifest.xml',
    );
    expect(devStrings).toContain('<string name="app_name">Chessticize Dev</string>');
    expect(devManifest).toContain('android.permission.INTERNET');
    expect(devManifest).toContain('@xml/network_security_config');
  });

  it('uses the canonical Dev artwork for every launcher density', () => {
    const canonical = fs.readFileSync(path.join(
      mobileRoot,
      'ios/ChessticizeMobile/Images.xcassets/AppIconDev.appiconset/AppIcon-ios-marketing-1024.png',
    ));
    const expected = expectedLauncherResources(canonical);
    const resourceRoot = path.join(
      mobileRoot,
      'android/app/src/deviceDev/res',
    );

    expect(expected.size).toBe(DENSITIES.length * 3);
    for (const [relativePath, expectedPng] of expected) {
      const packagedPath = path.join(resourceRoot, relativePath);
      expect(fs.existsSync(packagedPath)).toBe(true);
      expect(imagesEqual(
        decodePng(fs.readFileSync(packagedPath)),
        decodePng(expectedPng),
      )).toBe(true);
    }
  });

  it('provides a reusable deploy command that never clears the Play app', () => {
    const rootPackage = JSON.parse(read('package.json'));
    const mobilePackage = JSON.parse(read('apps/mobile/package.json'));
    const deployScript = read(
      'apps/mobile/scripts/android-run-dev-device.sh',
    );

    expect(rootPackage.scripts['mobile:android:dev:device']).toBe(
      'pnpm --filter ChessticizeMobile android:dev:device',
    );
    expect(mobilePackage.scripts['android:dev:device']).toBe(
      'bash scripts/android-run-dev-device.sh',
    );
    expect(deployScript).toContain('DEV_APP_ID="com.chessticize.mobile.dev"');
    expect(deployScript).toContain(':app:installDeviceDev');
    expect(deployScript).toContain('platform-tools/adb');
    expect(deployScript).not.toMatch(/\badb\s+uninstall\b|\bpm\s+clear\b/);
  });
});
