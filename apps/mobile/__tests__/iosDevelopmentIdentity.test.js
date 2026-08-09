const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const appRoot = process.cwd();
const repoRoot = join(appRoot, '../..');
const iosRoot = join(appRoot, 'ios');

function readText(path) {
  return readFileSync(path, 'utf8');
}

function targetBuildConfiguration(project, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `/\\* ${escapedName} \\*/ = \\{\\s*` +
      'isa = XCBuildConfiguration;\\s*' +
      'baseConfigurationReference = [^\\n]+\\s*' +
      'buildSettings = \\{([\\s\\S]*?)\\n\\s*\\};\\s*' +
      `name = ${escapedName};`,
    'u',
  );
  const match = project.match(pattern);
  if (!match) {
    throw new Error(`Missing target build configuration ${name}`);
  }
  return match[1];
}

describe('iOS development identity isolation', () => {
  it('keeps Debug device data and CloudKit separate from the production Release app', () => {
    const project = readText(
      join(iosRoot, 'ChessticizeMobile.xcodeproj', 'project.pbxproj'),
    );
    const debug = targetBuildConfiguration(project, 'Debug');
    const release = targetBuildConfiguration(project, 'Release');
    const infoPlist = readText(join(iosRoot, 'ChessticizeMobile', 'Info.plist'));
    const devEntitlements = readText(
      join(iosRoot, 'ChessticizeMobile', 'ChessticizeMobileDev.entitlements'),
    );
    const releaseEntitlements = readText(
      join(iosRoot, 'ChessticizeMobile', 'ChessticizeMobile.entitlements'),
    );
    const productionIcon = join(
      iosRoot,
      'ChessticizeMobile',
      'Images.xcassets',
      'AppIcon.appiconset',
      'AppIcon-ios-marketing-1024.png',
    );
    const devIcon = join(
      iosRoot,
      'ChessticizeMobile',
      'Images.xcassets',
      'AppIconDev.appiconset',
      'AppIcon-ios-marketing-1024.png',
    );

    expect(debug).toContain('ASSETCATALOG_COMPILER_APPICON_NAME = AppIconDev;');
    expect(debug).toContain(
      'CODE_SIGN_ENTITLEMENTS = ChessticizeMobile/ChessticizeMobileDev.entitlements;',
    );
    expect(debug).toContain('INFOPLIST_KEY_CFBundleDisplayName = "Chessticize Dev";');
    expect(debug).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.chessticize.mobile.dev;');
    expect(release).toContain(
      'CODE_SIGN_ENTITLEMENTS = ChessticizeMobile/ChessticizeMobile.entitlements;',
    );
    expect(release).toContain('ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;');
    expect(release).toContain('INFOPLIST_KEY_CFBundleDisplayName = Chessticize;');
    expect(release).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.chessticize.mobile;');
    expect(infoPlist).toContain(
      '<key>CFBundleDisplayName</key>\n\t<string>$(INFOPLIST_KEY_CFBundleDisplayName)</string>',
    );

    expect(devEntitlements).toContain(
      '<string>iCloud.com.chessticize.mobile.dev</string>',
    );
    expect(devEntitlements).toContain(
      '<key>com.apple.developer.icloud-container-environment</key>\n  <string>Development</string>',
    );
    expect(devEntitlements).not.toContain(
      '<string>iCloud.com.chessticize.mobile</string>',
    );
    expect(releaseEntitlements).toContain(
      '<string>iCloud.com.chessticize.mobile</string>',
    );
    expect(releaseEntitlements).not.toContain(
      '<string>iCloud.com.chessticize.mobile.dev</string>',
    );
    expect(
      readFileSync(devIcon).equals(readFileSync(productionIcon)),
    ).toBe(false);
  });

  it('runs Xcode interactively with Debug while reserving Release for profiling and archives', () => {
    const scheme = readText(
      join(
        iosRoot,
        'ChessticizeMobile.xcodeproj',
        'xcshareddata',
        'xcschemes',
        'ChessticizeMobile.xcscheme',
      ),
    );

    expect(scheme).toMatch(
      /<LaunchAction\s+buildConfiguration = "Debug"/u,
    );
    expect(scheme).toMatch(
      /<ProfileAction\s+buildConfiguration = "Release"/u,
    );
    expect(scheme).toMatch(
      /<ArchiveAction\s+buildConfiguration = "Release"/u,
    );
  });

  it('provides a Dev-only physical-device command and a dual-identity release simulator gate', () => {
    const rootPackage = JSON.parse(readText(join(repoRoot, 'package.json')));
    const mobilePackage = JSON.parse(readText(join(appRoot, 'package.json')));
    const deviceRunner = readText(join(appRoot, 'scripts', 'ios-run-dev-device.sh'));
    const e2eRunner = readText(
      join(
        repoRoot,
        '.codex',
        'skills',
        'chessticize-mobile-local-e2e',
        'scripts',
        'run-local-e2e.sh',
      ),
    );

    expect(rootPackage.scripts['mobile:ios:dev:device']).toBe(
      'pnpm --filter ChessticizeMobile ios:dev:device',
    );
    expect(rootPackage.scripts['mobile:validate:ios:release']).toBe(
      'CHESSTICIZE_E2E_VARIANTS=both .codex/skills/chessticize-mobile-local-e2e/scripts/run-local-e2e.sh',
    );
    expect(mobilePackage.scripts['ios:dev:device']).toBe(
      'bash scripts/ios-run-dev-device.sh',
    );
    expect(deviceRunner).toContain('--mode Debug');
    expect(deviceRunner).toContain('--device');
    expect(deviceRunner).not.toContain('--mode Release');
    expect(e2eRunner).toContain('CHESSTICIZE_E2E_VARIANTS');
    expect(e2eRunner).toContain('debug|release|both');
    expect(e2eRunner).toContain('ios.sim.debug');
    expect(e2eRunner).toContain('ios.sim.release');
  });

  it('records the dual-simulator and Dev-only-device policy in agent guidance', () => {
    const testingArchitecture = readText(
      join(repoRoot, 'docs', 'TESTING_ARCHITECTURE.md'),
    );
    const developmentDoc = readText(
      join(repoRoot, 'docs', 'IOS_DEVELOPMENT_BUILD.md'),
    );
    const devLoopSkill = readText(
      join(
        repoRoot,
        '.codex',
        'skills',
        'chessticize-mobile-dev-loop',
        'SKILL.md',
      ),
    );
    const localE2eSkill = readText(
      join(
        repoRoot,
        '.codex',
        'skills',
        'chessticize-mobile-local-e2e',
        'SKILL.md',
      ),
    );

    for (const text of [testingArchitecture, developmentDoc, devLoopSkill, localE2eSkill]) {
      expect(text).toContain('CHESSTICIZE_E2E_VARIANTS=both');
      expect(text).toContain('pnpm mobile:ios:dev:device');
    }
  });
});
