const ANDROID_TAG_PATTERN = /^android-v(\d+\.\d+\.\d+)-build-(\d+)$/u;
const APK_NAME_PATTERN = /^Chessticize-Android-(\d+\.\d+(?:\.\d+)?)\.apk$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function normalizePublicVersion(value) {
  return value.split(".").length === 2 ? `${value}.0` : value;
}

function mirroredRelease(release) {
  if (release?.draft || release?.prerelease || !Array.isArray(release?.assets)) {
    return null;
  }
  const tagMatch = ANDROID_TAG_PATTERN.exec(release.tag_name ?? "");
  if (!tagMatch || release.assets.length !== 3) {
    return null;
  }
  const sourceAssets = release.assets.filter(
    (asset) => asset?.name === "android-source-manifest.json",
  );
  const apkAssets = release.assets.filter((asset) => APK_NAME_PATTERN.test(asset?.name ?? ""));
  if (sourceAssets.length !== 1 || apkAssets.length !== 1) {
    return null;
  }
  const apkAsset = apkAssets[0];
  const apkMatch = APK_NAME_PATTERN.exec(apkAsset.name);
  const checksumAssets = release.assets.filter(
    (asset) => asset?.name === `${apkAsset.name}.sha256`,
  );
  const digestMatch = /^sha256:([0-9a-f]{64})$/u.exec(apkAsset.digest ?? "");
  if (
    !apkMatch ||
    checksumAssets.length !== 1 ||
    !digestMatch ||
    normalizePublicVersion(apkMatch[1]) !== tagMatch[1] ||
    !Number.isSafeInteger(apkAsset.size) ||
    apkAsset.size < 1 ||
    typeof release.html_url !== "string" ||
    typeof sourceAssets[0].browser_download_url !== "string" ||
    typeof apkAsset.browser_download_url !== "string" ||
    typeof checksumAssets[0].browser_download_url !== "string"
  ) {
    return null;
  }
  const versionCode = Number(tagMatch[2]);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
    return null;
  }
  return {
    publicVersion: apkMatch[1],
    versionCode,
    tagName: release.tag_name,
    releaseUrl: release.html_url,
    sourceManifestUrl: sourceAssets[0].browser_download_url,
    apkName: apkAsset.name,
    apkUrl: apkAsset.browser_download_url,
    checksumUrl: checksumAssets[0].browser_download_url,
    apkSha256: digestMatch[1],
    apkSizeBytes: apkAsset.size,
    apkSizeMiB: Math.round(apkAsset.size / 1024 / 1024),
  };
}

export function parseAndroidSourceManifest(contents, release) {
  let manifest;
  try {
    manifest = JSON.parse(contents);
  } catch {
    throw new Error("The mirrored Android source manifest is not valid JSON.");
  }
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.status !== "artifact-only" ||
    !/^[0-9a-f]{40}$/u.test(manifest?.commitSha ?? "") ||
    manifest?.bundle?.applicationId !== "com.chessticize.mobile" ||
    normalizePublicVersion(manifest?.bundle?.versionName ?? "") !==
      normalizePublicVersion(release.publicVersion) ||
    manifest?.bundle?.versionCode !== release.versionCode ||
    !SHA256_PATTERN.test(manifest?.bundle?.sha256 ?? "")
  ) {
    throw new Error("The mirrored Android source manifest does not match the release.");
  }
  return manifest;
}

export function selectLatestMirroredAndroidRelease(releases) {
  const candidates = releases
    .map(mirroredRelease)
    .filter(Boolean)
    .sort((left, right) => right.versionCode - left.versionCode);
  if (candidates.length === 0) {
    throw new Error("No complete mirrored Android release was found.");
  }
  if (
    candidates.length > 1 &&
    candidates[0].versionCode === candidates[1].versionCode &&
    candidates[0].tagName !== candidates[1].tagName
  ) {
    throw new Error("More than one mirrored Android release uses the latest version code.");
  }
  return candidates[0];
}

export function parseAndroidApkChecksum(contents, apkName, expectedDigest) {
  const match = /^([0-9a-f]{64})\s{2}([^\r\n]+)\r?\n?$/u.exec(contents);
  if (
    !match ||
    !SHA256_PATTERN.test(expectedDigest) ||
    match[1] !== expectedDigest ||
    match[2] !== apkName
  ) {
    throw new Error("The mirrored APK checksum file does not match the selected APK.");
  }
  return match[1];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderAndroidDownloadPage(template, release) {
  const replacements = {
    ANDROID_PUBLIC_VERSION: release.publicVersion,
    ANDROID_VERSION_CODE: release.versionCode,
    ANDROID_APK_SIZE_MIB: release.apkSizeMiB,
    ANDROID_APK_URL: release.apkUrl,
    ANDROID_CHECKSUM_URL: release.checksumUrl,
    ANDROID_RELEASE_URL: release.releaseUrl,
    ANDROID_APK_SHA256: release.apkSha256,
  };
  let rendered = template;
  for (const [name, value] of Object.entries(replacements)) {
    const token = `{{${name}}}`;
    if (!rendered.includes(token)) {
      throw new Error(`Android download page template is missing ${token}.`);
    }
    rendered = rendered.replaceAll(token, escapeHtml(value));
  }
  if (/\{\{ANDROID_[A-Z0-9_]+\}\}/u.test(rendered)) {
    throw new Error("Android download page contains an unresolved release token.");
  }
  return rendered;
}
