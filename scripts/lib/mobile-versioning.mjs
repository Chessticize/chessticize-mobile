const DEVELOPMENT_PUBLIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const RELEASE_PUBLIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/u;

function requiredPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function normalizePublicVersion(value) {
  const match = RELEASE_PUBLIC_VERSION_PATTERN.exec(value ?? "");
  if (!match) {
    throw new Error("Public version must contain two or three numeric components.");
  }
  return `${match[1]}.${match[2]}.${match[3] ?? "0"}`;
}

function comparePublicVersions(left, right) {
  const leftParts = normalizePublicVersion(left).split(".").map(Number);
  const rightParts = normalizePublicVersion(right).split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}

export function validateDevelopmentVersion(value) {
  if (
    value?.schemaVersion !== 1 ||
    typeof value?.plannedPublicVersion !== "string" ||
    !DEVELOPMENT_PUBLIC_VERSION_PATTERN.test(value.plannedPublicVersion)
  ) {
    throw new Error(
      "The development version must use schemaVersion 1 and a three-part plannedPublicVersion.",
    );
  }
  return {
    schemaVersion: 1,
    plannedPublicVersion: value.plannedPublicVersion,
  };
}

export function validateReleaseVersion(value) {
  if (
    value?.schemaVersion !== 1 ||
    typeof value?.publicVersion !== "string" ||
    typeof value?.iosPublicVersion !== "string" ||
    !RELEASE_PUBLIC_VERSION_PATTERN.test(value.publicVersion) ||
    !RELEASE_PUBLIC_VERSION_PATTERN.test(value.iosPublicVersion)
  ) {
    throw new Error("The release version has invalid public version fields.");
  }
  requiredPositiveInteger(value.androidVersionCode, "Android version code");
  requiredPositiveInteger(value.iosBuildNumber, "iOS build number");
  return {
    schemaVersion: 1,
    publicVersion: value.publicVersion,
    iosPublicVersion: value.iosPublicVersion,
    androidVersionCode: value.androidVersionCode,
    iosBuildNumber: value.iosBuildNumber,
  };
}

export function nextPatchPublicVersion(publicVersion) {
  const normalized = normalizePublicVersion(publicVersion);
  const [major, minor, patch] = normalized.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export function advanceDevelopmentVersion(developmentVersion, publicVersion) {
  const current = validateDevelopmentVersion(developmentVersion);
  const plannedPublicVersion = publicVersion ?? nextPatchPublicVersion(
    current.plannedPublicVersion,
  );
  const next = validateDevelopmentVersion({
    schemaVersion: 1,
    plannedPublicVersion,
  });
  if (comparePublicVersions(
    next.plannedPublicVersion,
    current.plannedPublicVersion,
  ) <= 0) {
    throw new Error("The next development version must advance.");
  }
  return next;
}

export function prepareReleaseVersion({
  developmentVersion,
  previousReleaseVersion,
  publicVersion,
  androidVersionCode,
  iosBuildNumber,
}) {
  const development = validateDevelopmentVersion(developmentVersion);
  const previous = validateReleaseVersion(previousReleaseVersion);
  const nextPublicVersion = publicVersion ?? development.plannedPublicVersion;
  if (!DEVELOPMENT_PUBLIC_VERSION_PATTERN.test(nextPublicVersion)) {
    throw new Error("The candidate public version must use three numeric components.");
  }
  if (comparePublicVersions(nextPublicVersion, previous.publicVersion) < 0) {
    throw new Error("The candidate public version cannot move backward.");
  }
  const nextAndroidVersionCode = androidVersionCode ??
    previous.androidVersionCode + 1;
  requiredPositiveInteger(nextAndroidVersionCode, "Android version code");
  if (nextAndroidVersionCode <= previous.androidVersionCode) {
    throw new Error("Android version code must increase for a new candidate.");
  }
  const sameIOSVersion = normalizePublicVersion(previous.iosPublicVersion) ===
    normalizePublicVersion(nextPublicVersion);
  const nextIOSBuildNumber = iosBuildNumber ??
    (sameIOSVersion ? previous.iosBuildNumber + 1 : 1);
  requiredPositiveInteger(nextIOSBuildNumber, "iOS build number");
  if (sameIOSVersion && nextIOSBuildNumber <= previous.iosBuildNumber) {
    throw new Error("iOS build number must increase for a replacement candidate.");
  }
  return {
    schemaVersion: 1,
    publicVersion: nextPublicVersion,
    iosPublicVersion: nextPublicVersion,
    androidVersionCode: nextAndroidVersionCode,
    iosBuildNumber: nextIOSBuildNumber,
  };
}
