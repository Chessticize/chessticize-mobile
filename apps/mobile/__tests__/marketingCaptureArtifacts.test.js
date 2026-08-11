const {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { PNG } = require('pngjs');
const story = require('../../../config/app-store-marketing-story-v1.json');
const captureRunbook = readFileSync(
  join(__dirname, '../../../docs/marketing/APP_STORE_MARKETING_CAPTURE.md'),
  'utf8'
);
const {
  assertCaptureDimensions,
  captureMarketingScreenshot,
  resolveIosLandscapeValidationTarget,
  resolveMarketingCaptureTarget,
  sourceCommitForCapture,
  writeCombinedCaptureManifest,
  writeDeviceCaptureManifest,
} = require('../e2e/marketingCaptureArtifacts');

describe('App Store marketing capture artifacts', () => {
  it('accepts any dedicated iPad profile for screenshot-free landscape validation', () => {
    expect(resolveIosLandscapeValidationTarget({
      DETOX_IOS_DEVICE: 'iPad Pro 11-inch (M5)',
    })).toEqual({
      deviceFamily: 'ipad',
      deviceName: 'iPad Pro 11-inch (M5)',
      orientation: 'landscape',
    });
    expect(() => resolveIosLandscapeValidationTarget({
      DETOX_IOS_DEVICE: 'Chessticize Marketing iPad Pro 13-inch (M5)',
    })).not.toThrow();
    expect(() => resolveIosLandscapeValidationTarget({
      DETOX_IOS_DEVICE: 'iPhone 17 Pro Max',
    })).toThrow('requires an iPad Simulator');
  });

  it('fails closed on the wrong device family, orientation, or pixel dimensions', () => {
    const iphone = resolveMarketingCaptureTarget({
      CHESSTICIZE_MARKETING_DEVICE_FAMILY: 'iphone',
      DETOX_IOS_DEVICE: 'Chessticize Marketing iPhone 17 Pro Max',
    }, story);
    const ipad = resolveMarketingCaptureTarget({
      CHESSTICIZE_MARKETING_DEVICE_FAMILY: 'ipad',
      DETOX_IOS_DEVICE: 'Chessticize Marketing iPad Pro 13-inch (M5)',
    }, story);

    expect(() => assertCaptureDimensions(
      { width: 1320, height: 2868 },
      iphone
    )).not.toThrow();
    expect(() => assertCaptureDimensions(
      { width: 2752, height: 2064 },
      ipad
    )).not.toThrow();
    expect(() => assertCaptureDimensions(
      { width: 2064, height: 2752 },
      ipad
    )).toThrow('must be landscape');
    expect(() => assertCaptureDimensions(
      { width: 2731, height: 2048 },
      ipad
    )).toThrow('unsupported dimensions');
    expect(() => resolveMarketingCaptureTarget({
      CHESSTICIZE_MARKETING_DEVICE_FAMILY: 'ipad',
      DETOX_IOS_DEVICE: 'iPad Pro 11-inch (M5)',
    }, story)).toThrow('requires a 13-inch profile');
  });

  it('copies a full-resolution raw PNG and records deterministic provenance', () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'marketing-capture-'));
    const sourcePath = join(outputRoot, 'source.png');
    const png = new PNG({ width: 2, height: 3 });
    png.data.fill(255);
    writeFileSync(sourcePath, PNG.sync.write(png));
    const frame = story.frames[0];
    const sourceCommit = '1'.repeat(40);
    const target = {
      acceptedSizes: [{ width: 2, height: 3 }],
      deviceFamily: 'iphone',
      deviceName: 'Unit Test iPhone Pro Max',
      displayGroup: '6.9-inch',
      orientation: 'portrait',
      outputDirectoryName: 'iphone-6.9-inch-portrait',
    };

    const record = captureMarketingScreenshot({
      frame,
      outputRoot,
      screenshotPath: sourcePath,
      sourceCommit,
      story,
      target,
    });

    expect(record).toMatchObject({
      order: 1,
      captureId: frame.captureId,
      copyKey: frame.copyKey,
      deviceFamily: 'iphone',
      displayGroup: '6.9-inch',
      orientation: 'portrait',
      pixelDimensions: { width: 2, height: 3 },
      sourceCommit,
      sourceState: frame.source.screen,
    });
    expect(readFileSync(join(outputRoot, record.file))).toEqual(
      readFileSync(sourcePath)
    );
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes one ordered device manifest and requires a full source SHA', () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'marketing-manifest-'));
    const sourceCommit = 'a'.repeat(40);
    const target = {
      deviceFamily: 'iphone',
      deviceName: 'Unit Test iPhone Pro Max',
      displayGroup: '6.9-inch',
      orientation: 'portrait',
    };
    const records = story.frames.map((frame) => ({
      order: frame.order,
      captureId: frame.captureId,
      copyKey: frame.copyKey,
      sourceCommit,
    })).reverse();

    const manifestPath = writeDeviceCaptureManifest({
      outputRoot,
      records,
      sourceCommit,
      story,
      target,
    });
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    expect(manifest.frames.map((frame) => frame.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(manifest.sourceBuild.sourceCommit).toBe(sourceCommit);
    expect(manifest.target).toEqual(target);
    expect(sourceCommitForCapture('/unused', {
      CHESSTICIZE_SOURCE_COMMIT: sourceCommit,
    })).toBe(sourceCommit);
    expect(() => sourceCommitForCapture('/unused', {
      CHESSTICIZE_SOURCE_COMMIT: 'short',
    })).toThrow('full 40-character SHA');
  });

  it('finalizes two verified device sets into one composition handoff manifest', () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'marketing-combined-'));
    const sourceCommit = 'b'.repeat(40);
    const targets = {
      iphone: {
        acceptedSizes: [{ width: 2, height: 3 }],
        deviceFamily: 'iphone',
        deviceName: 'Unit Test iPhone Pro Max',
        displayGroup: '6.9-inch',
        orientation: 'portrait',
        outputDirectoryName: 'iphone-6.9-inch-portrait',
      },
      ipad: {
        acceptedSizes: [{ width: 3, height: 2 }],
        deviceFamily: 'ipad',
        deviceName: 'Unit Test iPad Pro 13-inch',
        displayGroup: '13-inch',
        orientation: 'landscape',
        outputDirectoryName: 'ipad-13-inch-landscape',
      },
    };

    for (const target of Object.values(targets)) {
      const sourcePath = join(outputRoot, `${target.deviceFamily}-source.png`);
      const accepted = target.acceptedSizes[0];
      const png = new PNG({ width: accepted.width, height: accepted.height });
      png.data.fill(255);
      writeFileSync(sourcePath, PNG.sync.write(png));
      const records = story.frames.map((frame) => captureMarketingScreenshot({
        frame,
        outputRoot,
        screenshotPath: sourcePath,
        sourceCommit,
        story,
        target,
      }));
      writeDeviceCaptureManifest({
        outputRoot,
        records,
        sourceCommit,
        story,
        target,
      });
    }

    const manifestPath = writeCombinedCaptureManifest({
      acceptedSizesByFamily: {
        iphone: targets.iphone.acceptedSizes,
        ipad: targets.ipad.acceptedSizes,
      },
      outputRoot,
      story,
    });
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    expect(manifest.sourceBuild.sourceCommit).toBe(sourceCommit);
    expect(manifest.targets.iphone.orientation).toBe('portrait');
    expect(manifest.targets.ipad.orientation).toBe('landscape');
    expect(manifest.frames).toHaveLength(6);
    expect(manifest.frames[0]).toMatchObject({
      order: 1,
      frameId: story.frames[0].id,
      headline: story.frames[0].headline,
      supporting: story.frames[0].supporting,
      captures: {
        iphone: {
          deviceFamily: 'iphone',
          pixelDimensions: { width: 2, height: 3 },
        },
        ipad: {
          deviceFamily: 'ipad',
          pixelDimensions: { width: 3, height: 2 },
        },
      },
    });

    const firstIpad = manifest.frames[0].captures.ipad;
    writeFileSync(join(outputRoot, firstIpad.file), 'tampered');
    expect(() => writeCombinedCaptureManifest({
      acceptedSizesByFamily: {
        iphone: targets.iphone.acceptedSizes,
        ipad: targets.ipad.acceptedSizes,
      },
      outputRoot,
      story,
    })).toThrow();
  });

  it('rotates the exact iPad host Simulator before capture and restores it', () => {
    const wrapper = readFileSync(
      join(__dirname, '../scripts/capture-app-store-marketing-assets.sh'),
      'utf8'
    );
    const iphoneCapture = wrapper.indexOf(
      'capture_device_family iphone "$IPHONE_DEVICE_NAME" "$IPHONE_UDID"'
    );
    const ipadOrientation = wrapper.indexOf(
      'prepare_simulator_orientation "$IPAD_UDID" "$IPAD_DEVICE_NAME" landscape'
    );
    const ipadCapture = wrapper.indexOf(
      'capture_device_family ipad "$IPAD_DEVICE_NAME" "$IPAD_UDID"'
    );

    expect(wrapper).toContain('set-simulator-orientation.sh');
    expect(wrapper).toContain('/usr/bin/open -a Simulator --args -CurrentDeviceUDID');
    expect(wrapper).toContain(
      'CHESSTICIZE_SIMULATOR_WINDOW_WAIT_ATTEMPTS:-240'
    );
    expect(wrapper).toContain(
      'attempt <= SIMULATOR_WINDOW_WAIT_ATTEMPTS'
    );
    expect(wrapper).toContain('tell application "Simulator" to quit');
    expect(wrapper).toContain('/bin/kill -TERM "$simulator_pid"');
    expect(wrapper).toContain('/Simulator.app/Contents/MacOS/Simulator');
    expect(wrapper).toContain('every window whose name starts with deviceName');
    expect(wrapper).not.toContain(
      'prepare_simulator_orientation "$IPHONE_UDID" "$IPHONE_DEVICE_NAME"'
    );
    expect(iphoneCapture).toBeGreaterThan(0);
    expect(ipadOrientation).toBeGreaterThan(iphoneCapture);
    expect(ipadCapture).toBeGreaterThan(ipadOrientation);
    expect(wrapper).toContain(
      '"$ORIENTATION_RUNNER" "$IPAD_UDID" "$IPAD_DEVICE_NAME" portrait'
    );
  });

  it('documents clean-host simulator and Accessibility setup', () => {
    expect(captureRunbook).toContain('xcrun simctl list devicetypes');
    expect(captureRunbook).toContain('xcrun simctl list runtimes');
    expect(captureRunbook).toContain('xcrun simctl create');
    expect(captureRunbook).toContain('Privacy & Security > Accessibility');
    expect(captureRunbook).toContain('Automation > System Events');
    expect(captureRunbook).toContain(
      'tell application "System Events" to UI elements enabled'
    );
  });
});
