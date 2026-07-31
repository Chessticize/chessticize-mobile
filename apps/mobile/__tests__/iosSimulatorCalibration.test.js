const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  resolveIosSimulatorTarget
} = require("../scripts/resolve-ios-simulator-target");
const {
  assertPngOrientation,
  readPngDimensions
} = require("../scripts/assert-png-orientation");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const calibrationRunner = fs.readFileSync(
  path.join(
    repoRoot,
    ".codex/skills/chessticize-mobile-ui-calibration/scripts/capture-release-baseline.sh"
  ),
  "utf8"
);
const releaseBuildRunner = fs.readFileSync(
  path.join(appRoot, "scripts/ios-build-release-for-detox.sh"),
  "utf8"
);
const debugBuildRunner = fs.readFileSync(
  path.join(appRoot, "scripts/ios-build-for-detox.sh"),
  "utf8"
);

function simulatorPayload() {
  return {
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [
        {
          isAvailable: true,
          name: "Duplicate iPad",
          state: "Shutdown",
          udid: "00000000-0000-0000-0000-000000000026"
        }
      ],
      "com.apple.CoreSimulator.SimRuntime.iOS-27-0": [
        {
          isAvailable: true,
          name: "Duplicate iPad",
          state: "Booted",
          udid: "00000000-0000-0000-0000-000000000027"
        }
      ]
    }
  };
}

function pngHeader(width, height) {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

function loadDetoxConfig(env) {
  const configPath = path.join(appRoot, ".detoxrc.js");
  const originalName = process.env.DETOX_IOS_DEVICE;
  const originalUdid = process.env.DETOX_IOS_DEVICE_UDID;
  try {
    if (env.name === undefined) {
      delete process.env.DETOX_IOS_DEVICE;
    } else {
      process.env.DETOX_IOS_DEVICE = env.name;
    }
    if (env.udid === undefined) {
      delete process.env.DETOX_IOS_DEVICE_UDID;
    } else {
      process.env.DETOX_IOS_DEVICE_UDID = env.udid;
    }
    jest.resetModules();
    return require(configPath);
  } finally {
    if (originalName === undefined) {
      delete process.env.DETOX_IOS_DEVICE;
    } else {
      process.env.DETOX_IOS_DEVICE = originalName;
    }
    if (originalUdid === undefined) {
      delete process.env.DETOX_IOS_DEVICE_UDID;
    } else {
      process.env.DETOX_IOS_DEVICE_UDID = originalUdid;
    }
    jest.resetModules();
  }
}

describe("iOS Simulator calibration identity", () => {
  it("reserves the full portrait-landscape calibration wrapper for iPad", () => {
    expect(calibrationRunner).toContain(
      'DEVICE_NAME="${DETOX_IOS_DEVICE:-iPad Pro 11-inch (M5)}"'
    );
    expect(calibrationRunner).toContain('[[ "$DEVICE_NAME" == *iPad* ]]');
    expect(calibrationRunner).toContain(
      "run iPhone store capture in portrait only"
    );
  });

  it("requires an exact UDID when runtimes contain duplicate device names", () => {
    expect(() =>
      resolveIosSimulatorTarget(simulatorPayload(), {
        deviceName: "Duplicate iPad"
      })
    ).toThrow("found 2");

    expect(
      resolveIosSimulatorTarget(simulatorPayload(), {
        deviceName: "Duplicate iPad",
        deviceUdid: "00000000-0000-0000-0000-000000000027"
      })
    ).toEqual({
      name: "Duplicate iPad",
      runtimeIdentifier: "com.apple.CoreSimulator.SimRuntime.iOS-27-0",
      state: "Booted",
      udid: "00000000-0000-0000-0000-000000000027"
    });
  });

  it("rejects a UDID that does not belong to the requested device name", () => {
    expect(() =>
      resolveIosSimulatorTarget(simulatorPayload(), {
        deviceName: "Other iPad",
        deviceUdid: "00000000-0000-0000-0000-000000000027"
      })
    ).toThrow("belongs to Duplicate iPad");
  });

  it("makes Detox query the same exact name and UDID while preserving name-only defaults", () => {
    expect(
      loadDetoxConfig({
        name: "Duplicate iPad",
        udid: "00000000-0000-0000-0000-000000000027"
      }).devices.simulator.device
    ).toEqual({
      id: "00000000-0000-0000-0000-000000000027",
      name: "Duplicate iPad"
    });
    expect(loadDetoxConfig({name: "iPhone 17-Detox"}).devices.simulator.device).toEqual({
      name: "iPhone 17-Detox"
    });
    expect(() =>
      loadDetoxConfig({udid: "00000000-0000-0000-0000-000000000027"})
    ).toThrow("DETOX_IOS_DEVICE_UDID requires DETOX_IOS_DEVICE");
  });

  it("binds both Xcode build paths and the capture journey to the exact UDID", () => {
    for (const buildRunner of [releaseBuildRunner, debugBuildRunner]) {
      expect(buildRunner).toContain("resolve-ios-simulator-target.js");
      expect(buildRunner).toContain(
        'platform=iOS Simulator,id=${DETOX_IOS_DEVICE_UDID}'
      );
    }
    expect(calibrationRunner).toContain("resolve-ios-simulator-target.js");
    expect(calibrationRunner).toContain('export DETOX_IOS_DEVICE_UDID="$SIMULATOR_UDID"');
    expect(calibrationRunner).toContain("release-$DEVICE_SLUG-$RUNTIME_SLUG-$UDID_SLUG");
  });

  it("arms portrait restoration before attempting host landscape rotation", () => {
    const restoreIndex = calibrationRunner.indexOf("\nRESTORE_PORTRAIT=1\n");
    const rotateIndex = calibrationRunner.indexOf(
      '"$ORIENTATION_RUNNER" "$SIMULATOR_UDID" "$DEVICE_NAME" landscape'
    );

    expect(restoreIndex).toBeGreaterThan(0);
    expect(rotateIndex).toBeGreaterThan(0);
    expect(restoreIndex).toBeLessThan(rotateIndex);
  });
});

describe("captured PNG orientation", () => {
  let temporaryDirectory;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chessticize-png-orientation-"));
  });

  afterEach(() => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it("reads PNG dimensions and accepts only the claimed orientation", () => {
    const portraitPath = path.join(temporaryDirectory, "portrait.png");
    const landscapePath = path.join(temporaryDirectory, "landscape.png");
    fs.writeFileSync(portraitPath, pngHeader(834, 1153));
    fs.writeFileSync(landscapePath, pngHeader(1153, 834));

    expect(readPngDimensions(portraitPath)).toEqual({height: 1153, width: 834});
    expect(assertPngOrientation(portraitPath, "portrait")).toEqual({
      height: 1153,
      width: 834
    });
    expect(assertPngOrientation(landscapePath, "landscape")).toEqual({
      height: 834,
      width: 1153
    });
    expect(() => assertPngOrientation(portraitPath, "landscape")).toThrow(
      "expected landscape width > height"
    );
  });

  it("validates each destination PNG after it is copied", () => {
    const copyIndex = calibrationRunner.indexOf(
      'cp "$source_path" "$DESTINATION/$scene.png"'
    );
    const validationIndex = calibrationRunner.indexOf(
      '"$PNG_ORIENTATION_VALIDATOR" "$DESTINATION/$scene.png" "$orientation"'
    );

    expect(copyIndex).toBeGreaterThan(0);
    expect(validationIndex).toBeGreaterThan(copyIndex);
  });

  it("normalizes Xcode 26.6 landscape framebuffer PNGs before validation", () => {
    const copyIndex = calibrationRunner.indexOf(
      'cp "$source_path" "$DESTINATION/$scene.png"'
    );
    const landscapeGuardIndex = calibrationRunner.indexOf(
      'if [[ "$orientation" == "landscape" ]]',
      copyIndex
    );
    const rotationIndex = calibrationRunner.indexOf(
      'sips --rotate 90',
      landscapeGuardIndex
    );
    const validationIndex = calibrationRunner.indexOf(
      '"$PNG_ORIENTATION_VALIDATOR" "$DESTINATION/$scene.png" "$orientation"',
      rotationIndex
    );

    expect(landscapeGuardIndex).toBeGreaterThan(copyIndex);
    expect(rotationIndex).toBeGreaterThan(landscapeGuardIndex);
    expect(validationIndex).toBeGreaterThan(rotationIndex);
  });
});
