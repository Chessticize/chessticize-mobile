#!/usr/bin/env node

const {execFileSync} = require("node:child_process");

function availableSimulators(payload) {
  if (payload === null || typeof payload !== "object" || payload.devices === null) {
    throw new Error("simctl returned no Simulator device map");
  }

  return Object.entries(payload.devices).flatMap(([runtimeIdentifier, devices]) =>
    devices
      .filter((device) => device.isAvailable !== false)
      .map((device) => ({
        name: device.name,
        runtimeIdentifier,
        state: device.state,
        udid: device.udid
      }))
  );
}

function resolveIosSimulatorTarget(payload, {deviceName, deviceUdid}) {
  if (typeof deviceName !== "string" || deviceName.length === 0) {
    throw new Error("DETOX_IOS_DEVICE must name the target Simulator");
  }

  const simulators = availableSimulators(payload);
  if (deviceUdid !== undefined) {
    const matches = simulators.filter((device) => device.udid === deviceUdid);
    if (matches.length !== 1) {
      throw new Error(
        `Expected one available Simulator with UDID ${deviceUdid}, found ${matches.length}`
      );
    }
    if (matches[0].name !== deviceName) {
      throw new Error(
        `Simulator ${deviceUdid} belongs to ${matches[0].name}, not requested ${deviceName}`
      );
    }
    return matches[0];
  }

  const matches = simulators.filter((device) => device.name === deviceName);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one available Simulator named ${deviceName}, found ${matches.length}. `
      + "Set DETOX_IOS_DEVICE_UDID to disambiguate."
    );
  }
  return matches[0];
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (flag === "--device-name") {
      options.deviceName = value;
    } else if (flag === "--device-udid") {
      options.deviceUdid = value;
    } else {
      throw new Error(`Unknown argument ${flag}`);
    }
  }
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const simctlOutput = execFileSync(
      "/usr/bin/xcrun",
      ["simctl", "list", "devices", "available", "-j"],
      {encoding: "utf8"}
    );
    const target = resolveIosSimulatorTarget(JSON.parse(simctlOutput), options);
    process.stdout.write(`${JSON.stringify(target)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  resolveIosSimulatorTarget
};
