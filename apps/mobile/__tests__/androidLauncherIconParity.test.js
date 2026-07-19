const fs = require('node:fs');
const path = require('node:path');

const {
  ADAPTIVE_LAYER_DP,
  ADAPTIVE_MARGIN_DP,
  ADAPTIVE_VIEWPORT_DP,
  DENSITIES,
  LEGACY_DP,
  LOGO_SAFE_ZONE_DP,
  brandMarkSafeZone,
  decodePng,
  expectedLauncherResources,
  imagesEqual,
} = require('../scripts/android-launcher-icons');

const mobileRoot = path.resolve(__dirname, '..');
const resourceRoot = path.join(mobileRoot, 'android/app/src/main/res');
const canonicalPath = path.join(
  mobileRoot,
  'ios/ChessticizeMobile/Images.xcassets/AppIcon.appiconset/AppIcon-ios-marketing-1024.png',
);

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('Android launcher icon parity', () => {
  it('packages every legacy and adaptive density from the canonical iOS artwork', () => {
    const canonical = fs.readFileSync(canonicalPath);
    const expected = expectedLauncherResources(canonical);

    expect(expected.size).toBe(DENSITIES.length * 2);
    for (const [relativePath, expectedPng] of expected) {
      const packagedPath = path.join(resourceRoot, relativePath);
      expect(fs.existsSync(packagedPath)).toBe(true);
      expect(imagesEqual(
        decodePng(fs.readFileSync(packagedPath)),
        decodePng(expectedPng),
      )).toBe(true);
    }

    for (const density of DENSITIES) {
      const legacy = decodePng(fs.readFileSync(path.join(
        resourceRoot,
        `mipmap-${density.name}/ic_launcher.png`,
      )));
      const adaptive = decodePng(fs.readFileSync(path.join(
        resourceRoot,
        `mipmap-${density.name}/ic_launcher_foreground.png`,
      )));
      expect([legacy.width, legacy.height]).toEqual([
        Math.round(LEGACY_DP * density.scale),
        Math.round(LEGACY_DP * density.scale),
      ]);
      expect([adaptive.width, adaptive.height]).toEqual([
        Math.round(ADAPTIVE_LAYER_DP * density.scale),
        Math.round(ADAPTIVE_LAYER_DP * density.scale),
      ]);
    }
  });

  it('keeps the brand mark inside the guaranteed 66dp safe zone while edge-extending only artwork', () => {
    expect(ADAPTIVE_VIEWPORT_DP + ADAPTIVE_MARGIN_DP * 2).toBe(ADAPTIVE_LAYER_DP);
    const source = decodePng(fs.readFileSync(canonicalPath));
    const safeZone = brandMarkSafeZone(source);

    expect(safeZone.count).toBeGreaterThan(1000);
    expect(safeZone.maximumDistanceDp).toBeLessThanOrEqual(LOGO_SAFE_ZONE_DP / 2);
  });

  it('uses the adaptive artwork through the standard icon and does not force a circular-only variant', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).not.toContain('android:roundIcon=');

    for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const adaptiveIcon = read(`android/app/src/main/res/mipmap-anydpi-v26/${file}`);
      expect(adaptiveIcon).toContain('<background android:drawable="@color/launcher_background" />');
      expect(adaptiveIcon).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground" />');
      expect(adaptiveIcon).not.toContain('@drawable/ic_launcher_foreground');
    }
  });
});
