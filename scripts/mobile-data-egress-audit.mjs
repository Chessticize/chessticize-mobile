#!/usr/bin/env node
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditMobileDataEgress } from "./lib/mobile-data-egress-audit.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const json = process.argv.includes("--json");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--json");

if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument: ${unknownArgs[0]}`);
}

const result = auditMobileDataEgress({ repoRoot });
if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.status === "pass") {
  process.stdout.write(
    `Mobile data-egress audit passed (${result.summary.scannedFiles} first-party runtime files; ` +
    `${result.summary.approvedRuntimeDependencies} reviewed direct runtime dependencies).\n`
  );
} else {
  process.stderr.write("Mobile data-egress audit failed:\n");
  for (const finding of result.findings) {
    process.stderr.write(`- ${finding.path}: ${finding.detail}\n`);
  }
}

if (result.status !== "pass") {
  process.exitCode = 1;
}
