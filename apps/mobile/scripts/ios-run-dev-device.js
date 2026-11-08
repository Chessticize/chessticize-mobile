#!/usr/bin/env node

// Builds the Debug / Dev-identity app for a physical iPhone or iPad and
// installs it with devicectl. It never touches Simulators: xcodebuild gets an
// explicit `-destination id=<UDID>` so nothing looks up a fallback Simulator.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {execFileSync, spawnSync} = require("node:child_process");

const DEV_BUNDLE_ID = "com.chessticize.mobile.dev";
const CONFIGURATION = "Debug";
const SCHEME = "ChessticizeMobile";
const WORKSPACE = "ios/ChessticizeMobile.xcworkspace";
const DERIVED_DATA_PATH = "ios/build";
const APP_NAME = "Chessticize.app";
const USAGE = "Usage: pnpm mobile:ios:dev:device [--dry-run] [device-name-or-udid]";

class UsageError extends Error {}

function parseArguments(argv) {
  const options = {dryRun: false, query: undefined};
  for (const argument of argv) {
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument.startsWith("-")) {
      throw new UsageError(`Unsupported option ${argument}. The Dev device install is pinned to Debug.\n${USAGE}`);
    } else if (options.query === undefined) {
      options.query = argument;
    } else {
      throw new UsageError(USAGE);
    }
  }
  return options;
}

function describeDevice(device) {
  return `${device.name} (${device.udid})`;
}

function physicalIosDevices(payload) {
  const devices = payload?.result?.devices;
  if (!Array.isArray(devices)) {
    throw new Error("devicectl returned no device list");
  }
  return devices
    .map((device) => {
      const hardware = device.properties?.hardware ?? device.hardwareProperties ?? {};
      return {
        identifier: device.identifier,
        name: device.deviceProperties?.name ?? device.properties?.state?.name,
        platform: hardware.platform,
        reality: hardware.reality,
        udid: hardware.udid ?? device.identifier
      };
    })
    .filter((device) => device.reality === "physical" && device.platform === "iOS");
}

// Resolves a name, hardware UDID or CoreDevice identifier to exactly one
// physical iOS device. Simulators and non-iOS devices (visionOS) are ignored.
function resolveIosDeviceTarget(payload, query) {
  const devices = physicalIosDevices(payload);
  if (query === undefined) {
    if (devices.length === 1) {
      return devices[0];
    }
    const known = devices.map(describeDevice).join(", ") || "none";
    throw new Error(
      `Pass a device name or UDID when ${devices.length === 0 ? "no" : "several"} physical iPhone or iPad `
      + `devices are paired (found: ${known}).`
    );
  }

  const byId = devices.filter((device) => device.udid === query || device.identifier === query);
  const matches = byId.length > 0 ? byId : devices.filter((device) => device.name === query);
  if (matches.length !== 1) {
    const known = devices.map(describeDevice).join(", ") || "none";
    throw new Error(
      `Expected exactly one physical iPhone or iPad matching "${query}", found ${matches.length} `
      + `(paired: ${known}). Use the UDID to disambiguate.`
    );
  }
  return matches[0];
}

// The ordered command list. This is the only place the build configuration,
// app identity and bundling mode are decided; there is no Release input.
function buildIosDevicePlan({appDir, device}) {
  const repositoryRoot = path.resolve(appDir, "..", "..");
  const appPath = path.join(appDir, DERIVED_DATA_PATH, "Build", "Products", `${CONFIGURATION}-iphoneos`, APP_NAME);
  return {
    appPath,
    bundleId: DEV_BUNDLE_ID,
    steps: [
      {
        label: "Sync iOS version config",
        command: "node",
        args: ["scripts/ios-release-version.js"],
        cwd: appDir
      },
      {
        label: "Fetch the Core Pack when missing",
        command: "node",
        args: ["scripts/fetch-core-pack.mjs"],
        cwd: repositoryRoot
      },
      {
        label: "Install locked CocoaPods when missing or stale",
        command: "bash",
        args: ["scripts/ios-install-pods-locked.sh"],
        cwd: appDir,
        when: "pods-stale"
      },
      {
        label: `Build ${CONFIGURATION} for ${device.name}`,
        command: "xcodebuild",
        args: [
          "-workspace", WORKSPACE,
          "-scheme", SCHEME,
          "-configuration", CONFIGURATION,
          "-destination", `id=${device.udid}`,
          "-derivedDataPath", DERIVED_DATA_PATH
        ],
        cwd: appDir,
        env: {FORCE_BUNDLING: "1"}
      },
      {
        label: "Verify the Dev identity and embedded JS bundle",
        verify: {appPath, bundleId: DEV_BUNDLE_ID}
      },
      {
        label: `Install on ${device.name}`,
        command: "xcrun",
        args: ["devicectl", "device", "install", "app", "--device", device.udid, appPath],
        cwd: appDir
      },
      {
        label: `Launch ${DEV_BUNDLE_ID}`,
        command: "xcrun",
        args: [
          "devicectl", "device", "process", "launch",
          "--device", device.udid,
          "--terminate-existing",
          DEV_BUNDLE_ID
        ],
        cwd: appDir
      }
    ]
  };
}

function formatStep(step) {
  if (step.verify) {
    return `verify ${path.join(step.verify.appPath, "Info.plist")} CFBundleIdentifier == ${step.verify.bundleId} `
      + `and ${path.join(step.verify.appPath, "main.jsbundle")} exists`;
  }
  const env = Object.entries(step.env ?? {}).map(([key, value]) => `${key}=${value} `).join("");
  return `${env}${[step.command, ...step.args].join(" ")}`;
}

function listPhysicalDevices() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ios-dev-device-"));
  const jsonPath = path.join(directory, "devices.json");
  try {
    execFileSync("/usr/bin/xcrun", ["devicectl", "list", "devices", "--json-output", jsonPath], {
      stdio: ["ignore", "ignore", "inherit"]
    });
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } finally {
    fs.rmSync(directory, {force: true, recursive: true});
  }
}

function podsAreStale(appDir) {
  const podfileLock = path.join(appDir, "ios", "Podfile.lock");
  const manifestLock = path.join(appDir, "ios", "Pods", "Manifest.lock");
  return !fs.existsSync(manifestLock) || !fs.readFileSync(podfileLock).equals(fs.readFileSync(manifestLock));
}

function verifyBuiltApp({appPath, bundleId}) {
  const infoPlist = path.join(appPath, "Info.plist");
  const actualBundleId = execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIdentifier", infoPlist],
    {encoding: "utf8"}
  ).trim();
  if (actualBundleId !== bundleId) {
    throw new Error(`Built app has bundle ID ${actualBundleId}, expected the Dev identity ${bundleId}. Refusing to install.`);
  }
  if (!fs.existsSync(path.join(appPath, "main.jsbundle"))) {
    throw new Error(`Built app has no main.jsbundle in ${appPath}; the Debug build was not bundled for standalone use.`);
  }
}

function runStep(step, appDir) {
  if (step.verify) {
    verifyBuiltApp(step.verify);
    return;
  }
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    env: {...process.env, ...step.env},
    stdio: "inherit"
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${step.label} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const appDir = path.resolve(__dirname, "..");
    // Querying through devicectl also wakes a paired device that xctrace still
    // reports as offline.
    const device = resolveIosDeviceTarget(listPhysicalDevices(), options.query);
    const plan = buildIosDevicePlan({appDir, device});
    process.stdout.write(`Target: ${describeDevice(device)}\n`);

    for (const step of plan.steps) {
      if (step.when === "pods-stale" && !podsAreStale(appDir)) {
        continue;
      }
      process.stdout.write(`==> ${step.label}\n`);
      if (options.dryRun) {
        process.stdout.write(`    ${formatStep(step)}\n`);
        continue;
      }
      runStep(step, appDir);
    }
    process.stdout.write(
      options.dryRun
        ? "Dry run only: nothing was built or installed.\n"
        : `Installed and launched Chessticize Dev (${DEV_BUNDLE_ID}) on ${device.name}.\n`
    );
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = error instanceof UsageError ? 64 : 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEV_BUNDLE_ID,
  buildIosDevicePlan,
  parseArguments,
  resolveIosDeviceTarget
};
