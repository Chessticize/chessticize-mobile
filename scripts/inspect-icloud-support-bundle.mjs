#!/usr/bin/env node
import { inspectICloudSupportBundle } from "./lib/icloud-support-bundle.mjs";

const inputPath = process.argv[2];
if (!inputPath || process.argv.length > 3) {
  console.error("Usage: pnpm support:inspect-icloud -- <support-bundle.zip|directory>");
  process.exitCode = 1;
} else {
  try {
    const report = await inspectICloudSupportBundle(inputPath);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
