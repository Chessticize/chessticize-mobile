import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  DEV_BUNDLE_ID,
  buildIosDevicePlan,
  parseArguments,
  resolveIosDeviceTarget,
} = require("../apps/mobile/scripts/ios-run-dev-device.js");

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/mobile");

function device({ identifier, udid, name, platform = "iOS", reality = "physical" }) {
  return {
    identifier,
    deviceProperties: { name },
    hardwareProperties: { platform, reality, udid },
    properties: { hardware: { platform, reality, udid } },
  };
}

const payload = {
  result: {
    devices: [
      device({ identifier: "SIM-1", udid: "SIM-1", name: "iPhone 17", reality: "simulated" }),
      device({ identifier: "VISION-1", udid: "00008112-V", name: "Vision", platform: "visionOS" }),
      device({ identifier: "CORE-IPAD", udid: "00008142-IPAD", name: "Shu iPad" }),
      device({ identifier: "CORE-PHONE", udid: "00008150-PHONE", name: "shuz-iPhone" }),
    ],
  },
};

test("device resolution accepts a name, UDID or CoreDevice identifier", () => {
  assert.equal(resolveIosDeviceTarget(payload, "shuz-iPhone").udid, "00008150-PHONE");
  assert.equal(resolveIosDeviceTarget(payload, "00008142-IPAD").name, "Shu iPad");
  assert.equal(resolveIosDeviceTarget(payload, "CORE-PHONE").udid, "00008150-PHONE");
});

test("device resolution ignores Simulators and non-iOS devices", () => {
  assert.throws(() => resolveIosDeviceTarget(payload, "iPhone 17"), /found 0/u);
  assert.throws(() => resolveIosDeviceTarget(payload, "SIM-1"), /found 0/u);
  assert.throws(() => resolveIosDeviceTarget(payload, "Vision"), /found 0/u);
});

test("device resolution without a query needs exactly one physical iOS device", () => {
  assert.throws(() => resolveIosDeviceTarget(payload), /several physical.*shuz-iPhone/u);
  const single = { result: { devices: payload.result.devices.slice(0, 1).concat(payload.result.devices.slice(3)) } };
  assert.equal(resolveIosDeviceTarget(single).name, "shuz-iPhone");
  assert.throws(() => resolveIosDeviceTarget({ result: { devices: [] } }), /no physical/u);
});

test("an ambiguous name does not guess", () => {
  const twins = {
    result: {
      devices: [
        device({ identifier: "A", udid: "UDID-A", name: "Twin" }),
        device({ identifier: "B", udid: "UDID-B", name: "Twin" }),
      ],
    },
  };
  assert.throws(() => resolveIosDeviceTarget(twins, "Twin"), /found 2/u);
  assert.equal(resolveIosDeviceTarget(twins, "UDID-B").identifier, "B");
});

test("argument parsing allows a device and --dry-run but never a configuration", () => {
  assert.deepEqual(parseArguments([]), { dryRun: false, query: undefined });
  assert.deepEqual(parseArguments(["--dry-run", "My iPhone"]), { dryRun: true, query: "My iPhone" });
  assert.throws(() => parseArguments(["--mode", "Release"]), /pinned to Debug/u);
  assert.throws(() => parseArguments(["--configuration=Release"]), /pinned to Debug/u);
  assert.throws(() => parseArguments(["one", "two"]), /Usage/u);
});

test("the plan builds Debug for the device UDID, bundles JS and installs the Dev identity", () => {
  const target = resolveIosDeviceTarget(payload, "shuz-iPhone");
  const { steps, bundleId, appPath } = buildIosDevicePlan({ appDir, device: target });
  const build = steps.find((step) => step.command === "xcodebuild");
  const argAfter = (flag) => build.args[build.args.indexOf(flag) + 1];

  assert.equal(bundleId, DEV_BUNDLE_ID);
  assert.equal(argAfter("-configuration"), "Debug");
  assert.equal(argAfter("-destination"), "id=00008150-PHONE");
  assert.equal(build.env.FORCE_BUNDLING, "1");
  assert.match(appPath, /Debug-iphoneos\/Chessticize\.app$/u);
  assert.ok(steps.some((step) => step.args?.includes("scripts/fetch-core-pack.mjs")));
  assert.ok(steps.some((step) => step.verify?.bundleId === DEV_BUNDLE_ID));

  const install = steps.find((step) => step.args?.includes("install"));
  assert.deepEqual(install.args.slice(0, 3), ["devicectl", "device", "install"]);
  assert.equal(install.args[install.args.indexOf("--device") + 1], "00008150-PHONE");
  const launch = steps.find((step) => step.args?.includes("launch"));
  assert.ok(launch.args.includes("--terminate-existing"));
  assert.equal(launch.args.at(-1), DEV_BUNDLE_ID);

  assert.doesNotMatch(JSON.stringify([build.args, install.args, launch.args]), /Release|simulator|run-ios/iu);
});

test("the entry point rejects Release before touching any device", () => {
  const result = spawnSync("bash", ["scripts/ios-run-dev-device.sh", "--mode", "Release"], {
    cwd: appDir,
    encoding: "utf8",
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /pinned to Debug/u);
});

test("the shell entry point is a thin wrapper without react-native run-ios", () => {
  const script = readFileSync(path.join(appDir, "scripts/ios-run-dev-device.sh"), "utf8");
  assert.match(script, /node scripts\/ios-run-dev-device\.js/u);
  assert.doesNotMatch(script, /run-ios/u);
});
