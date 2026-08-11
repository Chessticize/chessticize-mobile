#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  parseAndroidApkChecksum,
  parseAndroidSourceManifest,
  renderAndroidDownloadPage,
  selectLatestMirroredAndroidRelease,
} from "./lib/android-download-page.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  if (!process.argv[index + 1]) {
    throw new Error(`--${name} requires a value.`);
  }
  return process.argv[index + 1];
}

async function githubRequest(url, accept = "application/vnd.github+json") {
  const headers = {
    Accept: accept,
    "User-Agent": "chessticize-android-download-page",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed with HTTP ${response.status}: ${url}`);
  }
  return response;
}

async function loadPublicReleases(repository) {
  const releases = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await githubRequest(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
    );
    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error("GitHub releases response was not an array.");
    }
    releases.push(...batch);
    if (batch.length < 100) {
      return releases;
    }
  }
  throw new Error("GitHub release pagination exceeded the fail-closed limit.");
}

async function main() {
  const repository = option("repository", "Chessticize/chessticize-mobile");
  const templatePath = resolve(
    option("template", "site/android/index.template.html"),
  );
  const outputPath = resolve(option("output", "site/android/index.html"));
  const releases = await loadPublicReleases(repository);
  const selected = selectLatestMirroredAndroidRelease(releases);
  const [sourceManifestResponse, checksumResponse] = await Promise.all(
    [selected.sourceManifestUrl, selected.checksumUrl].map((url) =>
      githubRequest(url, "application/octet-stream"),
    ),
  );
  parseAndroidSourceManifest(await sourceManifestResponse.text(), selected);
  parseAndroidApkChecksum(
    await checksumResponse.text(),
    selected.apkName,
    selected.apkSha256,
  );
  const template = await readFile(templatePath, "utf8");
  const rendered = renderAndroidDownloadPage(template, selected);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered);
  process.stdout.write(
    `Rendered Android ${selected.publicVersion} (${selected.versionCode}) from ${selected.tagName}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
