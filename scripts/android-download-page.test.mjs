import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAndroidApkChecksum,
  parseAndroidSourceManifest,
  renderAndroidDownloadPage,
  selectLatestMirroredAndroidRelease,
} from "./lib/android-download-page.mjs";

const digest15 = "1".repeat(64);
const digest16 = "2".repeat(64);

function release({ build, publicVersion, mirrored = true }) {
  const normalizedVersion = publicVersion.split(".").length === 2
    ? `${publicVersion}.0`
    : publicVersion;
  const tagName = `android-v${normalizedVersion}-build-${build}`;
  const releaseUrl = `https://github.com/Chessticize/chessticize-mobile/releases/tag/${tagName}`;
  const downloadBase = `https://github.com/Chessticize/chessticize-mobile/releases/download/${tagName}`;
  const apkName = `Chessticize-Android-${publicVersion}.apk`;
  const assets = [
    {
      name: "android-source-manifest.json",
      browser_download_url: `${downloadBase}/android-source-manifest.json`,
      size: 2500,
    },
  ];
  if (mirrored) {
    assets.push(
      {
        name: apkName,
        browser_download_url: `${downloadBase}/${apkName}`,
        digest: `sha256:${build === 16 ? digest16 : digest15}`,
        size: build === 16 ? 242_476_151 : 242_394_228,
      },
      {
        name: `${apkName}.sha256`,
        browser_download_url: `${downloadBase}/${apkName}.sha256`,
        size: 96,
      },
    );
  }
  return {
    draft: false,
    prerelease: false,
    tag_name: tagName,
    html_url: releaseUrl,
    assets,
  };
}

test("the page follows the highest completed APK mirror, not a source-only release", () => {
  const selected = selectLatestMirroredAndroidRelease([
    release({ build: 17, publicVersion: "1.4.2", mirrored: false }),
    release({ build: 15, publicVersion: "1.4" }),
    release({ build: 16, publicVersion: "1.4.1" }),
  ]);

  assert.equal(selected.publicVersion, "1.4.1");
  assert.equal(selected.versionCode, 16);
  assert.equal(selected.apkSha256, digest16);
  assert.equal(selected.apkSizeMiB, 231);
  assert.match(selected.apkUrl, /android-v1\.4\.1-build-16/u);
});

test("a mirrored release must have the exact source, APK, and checksum assets", () => {
  const conflicting = release({ build: 16, publicVersion: "1.4.1" });
  conflicting.assets.push({
    name: "unexpected.txt",
    browser_download_url: "https://example.invalid/unexpected.txt",
    size: 1,
  });

  assert.throws(
    () => selectLatestMirroredAndroidRelease([conflicting]),
    /complete mirrored Android release/u,
  );
});

test("the checksum file must bind the selected APK name and digest", () => {
  assert.equal(
    parseAndroidApkChecksum(
      `${digest16}  Chessticize-Android-1.4.1.apk\n`,
      "Chessticize-Android-1.4.1.apk",
      digest16,
    ),
    digest16,
  );
  assert.throws(
    () => parseAndroidApkChecksum(
      `${digest15}  Chessticize-Android-1.4.1.apk\n`,
      "Chessticize-Android-1.4.1.apk",
      digest16,
    ),
    /checksum/u,
  );
});

test("the source manifest must bind the selected package and release identity", () => {
  const selected = selectLatestMirroredAndroidRelease([
    release({ build: 16, publicVersion: "1.4.1" }),
  ]);
  const manifest = {
    schemaVersion: 1,
    status: "artifact-only",
    commitSha: "a".repeat(40),
    bundle: {
      applicationId: "com.chessticize.mobile",
      versionName: "1.4.1",
      versionCode: 16,
      sha256: "b".repeat(64),
    },
  };

  assert.deepEqual(
    parseAndroidSourceManifest(JSON.stringify(manifest), selected),
    manifest,
  );
  assert.throws(
    () => parseAndroidSourceManifest(JSON.stringify({
      ...manifest,
      bundle: { ...manifest.bundle, versionCode: 15 },
    }), selected),
    /does not match/u,
  );
});

test("the static page renderer replaces every release token", () => {
  const selected = selectLatestMirroredAndroidRelease([
    release({ build: 16, publicVersion: "1.4.1" }),
  ]);
  const template = [
    "Version {{ANDROID_PUBLIC_VERSION}}",
    "build {{ANDROID_VERSION_CODE}}",
    "{{ANDROID_APK_SIZE_MIB}} MiB",
    "{{ANDROID_APK_URL}}",
    "{{ANDROID_CHECKSUM_URL}}",
    "{{ANDROID_RELEASE_URL}}",
    "{{ANDROID_APK_SHA256}}",
  ].join("\n");

  const rendered = renderAndroidDownloadPage(template, selected);

  assert.doesNotMatch(rendered, /\{\{ANDROID_/u);
  assert.match(rendered, /Version 1\.4\.1/u);
  assert.match(rendered, /build 16/u);
  assert.match(rendered, new RegExp(digest16, "u"));
});
