#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  contentVersion,
  fingerprintStylesheetLinks,
} from "./lib/site-asset-fingerprint.mjs";

// Browsers keep GitHub Pages' styles.css for up to ten minutes, so a deploy
// could pair new HTML with old CSS. Versioning the link by content avoids that.
const siteDir = process.argv[2];
if (!siteDir) {
  throw new Error("Usage: fingerprint-site-styles.mjs <site-dir>");
}

const version = contentVersion(await readFile(join(siteDir, "styles.css")));
const entries = await readdir(siteDir, { recursive: true });
let updated = 0;
for (const entry of entries.filter((name) => name.endsWith(".html"))) {
  const path = join(siteDir, entry);
  const html = await readFile(path, "utf8");
  const next = fingerprintStylesheetLinks(html, version);
  if (next !== html) {
    await writeFile(path, next);
    updated += 1;
  }
}
console.log(`Versioned styles.css as ${version} in ${updated} page(s).`);
