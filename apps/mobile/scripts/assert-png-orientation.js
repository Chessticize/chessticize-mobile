#!/usr/bin/env node

const fs = require("node:fs");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngDimensions(filePath) {
  const header = Buffer.alloc(24);
  const descriptor = fs.openSync(filePath, "r");
  let bytesRead;
  try {
    bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }

  if (
    bytesRead !== header.length
    || !header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || header.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error(`${filePath} is not a readable PNG with an IHDR header`);
  }

  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`${filePath} has invalid PNG dimensions ${width}x${height}`);
  }
  return {height, width};
}

function assertPngOrientation(filePath, orientation) {
  if (orientation !== "portrait" && orientation !== "landscape") {
    throw new Error(`Orientation must be portrait or landscape, received ${orientation}`);
  }

  const dimensions = readPngDimensions(filePath);
  const matches = orientation === "landscape"
    ? dimensions.width > dimensions.height
    : dimensions.height > dimensions.width;
  if (!matches) {
    const relation = orientation === "landscape" ? "width > height" : "height > width";
    throw new Error(
      `${filePath} is ${dimensions.width}x${dimensions.height}; `
      + `expected ${orientation} ${relation}`
    );
  }
  return dimensions;
}

function main() {
  try {
    const [filePath, orientation, ...extra] = process.argv.slice(2);
    if (filePath === undefined || orientation === undefined || extra.length > 0) {
      throw new Error("Usage: assert-png-orientation.js <png-path> <portrait|landscape>");
    }
    const dimensions = assertPngOrientation(filePath, orientation);
    process.stdout.write(
      `Validated ${orientation} PNG ${filePath} (${dimensions.width}x${dimensions.height}).\n`
    );
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  assertPngOrientation,
  readPngDimensions
};
