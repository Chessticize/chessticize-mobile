import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ALLOWED_FILES = new Set([
  "diagnostic.txt",
  "icloud-progress-snapshot.json",
  "local-progress.sqlite",
  "manifest.json"
]);
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 16;

export async function inspectICloudSupportBundle(inputPath) {
  return withICloudSupportBundle(inputPath, async ({
    cloudSnapshot,
    diagnosticText,
    localDatabasePath,
    manifest
  }) => ({
    bundleFormatVersion: manifest.bundleFormatVersion,
    kind: manifest.kind,
    createdAt: manifest.createdAt,
    app: manifest.app,
    sync: manifest.sync,
    environment: manifest.environment,
    files: manifest.files.map(({ name, bytes, sha256 }) => ({
      name,
      bytes,
      sha256
    })),
    localDatabase: inspectSQLiteSnapshot(localDatabasePath),
    cloudSnapshot: cloudSnapshot
      ? summarizeCloudSnapshot(cloudSnapshot)
      : {
          available: false,
          unavailableReason: manifest.cloudSnapshot?.unavailableReason ?? null
        },
    diagnosticBytes: Buffer.byteLength(diagnosticText, "utf8")
  }));
}

export async function withICloudSupportBundle(inputPath, visit) {
  if (typeof visit !== "function") {
    throw new TypeError("A support-bundle visitor function is required.");
  }
  const absoluteInputPath = resolve(inputPath);
  const inputStat = await stat(absoluteInputPath);
  let temporaryDirectory;
  try {
    let readEntry;
    let localDatabasePath;
    if (inputStat.isDirectory()) {
      readEntry = (name) => readFile(join(absoluteInputPath, validateEntryName(name)));
      localDatabasePath = join(absoluteInputPath, "local-progress.sqlite");
    } else if (inputStat.isFile()) {
      if (inputStat.size > MAX_ARCHIVE_BYTES) {
        throw new Error(`Support bundle exceeds the ${MAX_ARCHIVE_BYTES}-byte inspection limit.`);
      }
      const entries = readStoredZipEntries(await readFile(absoluteInputPath));
      readEntry = async (name) => {
        const entry = entries.get(validateEntryName(name));
        if (!entry) {
          throw new Error(`Support bundle is missing ${name}.`);
        }
        return entry;
      };
      temporaryDirectory = await mkdtemp(join(tmpdir(), "chessticize-support-inspect-"));
      localDatabasePath = join(temporaryDirectory, "local-progress.sqlite");
      await writeFile(
        localDatabasePath,
        await readEntry("local-progress.sqlite"),
        { mode: 0o600 }
      );
    } else {
      throw new Error("Support bundle input must be a ZIP file or extracted directory.");
    }

    const manifest = parseJson(
      await readEntry("manifest.json"),
      "manifest.json"
    );
    validateManifest(manifest);
    await verifyManifestFiles(manifest, readEntry);

    const diagnosticText = (await readEntry("diagnostic.txt")).toString("utf8");
    const cloudSnapshot = manifest.kind === "complete"
      ? validateCloudSnapshot(parseJson(
          await readEntry("icloud-progress-snapshot.json"),
          "icloud-progress-snapshot.json"
        ))
      : undefined;

    return await visit({
      cloudSnapshot,
      diagnosticText,
      localDatabasePath,
      manifest
    });
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }
}

export function readStoredZipEntries(archive) {
  if (!Buffer.isBuffer(archive)) {
    throw new TypeError("ZIP archive must be a Buffer.");
  }
  const eocdOffset = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(eocdOffset + 4);
  const centralDiskNumber = archive.readUInt16LE(eocdOffset + 6);
  const diskEntryCount = archive.readUInt16LE(eocdOffset + 8);
  const totalEntryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const commentLength = archive.readUInt16LE(eocdOffset + 20);
  if (
    diskNumber !== 0
    || centralDiskNumber !== 0
    || diskEntryCount !== totalEntryCount
    || totalEntryCount > MAX_ZIP_ENTRIES
    || eocdOffset + 22 + commentLength !== archive.length
    || centralOffset + centralSize > eocdOffset
  ) {
    throw new Error("Support bundle ZIP directory is invalid or unsupported.");
  }

  const entries = new Map();
  let centralCursor = centralOffset;
  for (let index = 0; index < totalEntryCount; index += 1) {
    requireRange(archive, centralCursor, 46);
    if (archive.readUInt32LE(centralCursor) !== 0x02014b50) {
      throw new Error("Support bundle ZIP central entry is invalid.");
    }
    const flags = archive.readUInt16LE(centralCursor + 8);
    const compressionMethod = archive.readUInt16LE(centralCursor + 10);
    const expectedCrc = archive.readUInt32LE(centralCursor + 16);
    const compressedSize = archive.readUInt32LE(centralCursor + 20);
    const uncompressedSize = archive.readUInt32LE(centralCursor + 24);
    const nameLength = archive.readUInt16LE(centralCursor + 28);
    const extraLength = archive.readUInt16LE(centralCursor + 30);
    const entryCommentLength = archive.readUInt16LE(centralCursor + 32);
    const localOffset = archive.readUInt32LE(centralCursor + 42);
    requireRange(
      archive,
      centralCursor + 46,
      nameLength + extraLength + entryCommentLength
    );
    const name = validateEntryName(
      archive.subarray(centralCursor + 46, centralCursor + 46 + nameLength)
        .toString("utf8")
    );
    if (flags !== 0 || compressionMethod !== 0 || compressedSize !== uncompressedSize) {
      throw new Error(`Support bundle entry ${name} is not an uncompressed app archive entry.`);
    }
    if (entries.has(name)) {
      throw new Error(`Support bundle contains duplicate entry ${name}.`);
    }

    requireRange(archive, localOffset, 30);
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Support bundle local entry ${name} is invalid.`);
    }
    const localFlags = archive.readUInt16LE(localOffset + 6);
    const localCompressionMethod = archive.readUInt16LE(localOffset + 8);
    const localCompressedSize = archive.readUInt32LE(localOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(localOffset + 22);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    requireRange(archive, localOffset + 30, localNameLength + localExtraLength);
    const localName = archive
      .subarray(localOffset + 30, localOffset + 30 + localNameLength)
      .toString("utf8");
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(archive, dataOffset, compressedSize);
    if (
      localName !== name
      || localFlags !== flags
      || localCompressionMethod !== compressionMethod
      || localCompressedSize !== compressedSize
      || localUncompressedSize !== uncompressedSize
    ) {
      throw new Error(`Support bundle local entry ${name} disagrees with its directory.`);
    }
    const data = Buffer.from(archive.subarray(dataOffset, dataOffset + compressedSize));
    if (crc32(data) !== expectedCrc) {
      throw new Error(`Support bundle ZIP checksum failed for ${name}.`);
    }
    entries.set(name, data);
    centralCursor += 46 + nameLength + extraLength + entryCommentLength;
  }
  if (centralCursor !== centralOffset + centralSize) {
    throw new Error("Support bundle ZIP central directory length is invalid.");
  }
  return entries;
}

function inspectSQLiteSnapshot(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    database.exec("PRAGMA query_only = ON");
    const quickCheckRows = database.prepare("PRAGMA quick_check").all();
    const quickCheckValues = quickCheckRows.flatMap((row) => Object.values(row));
    if (
      quickCheckValues.length !== 1
      || String(quickCheckValues[0]).toLowerCase() !== "ok"
    ) {
      throw new Error(
        `Local SQLite snapshot failed PRAGMA quick_check: ${quickCheckValues.join("; ")}`
      );
    }
    const userVersionRow = database.prepare("PRAGMA user_version").get();
    const userVersion = Number(Object.values(userVersionRow ?? {})[0] ?? 0);
    const tables = database.prepare(
      "SELECT name FROM sqlite_schema "
      + "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map((row) => String(row.name));
    return {
      integrityCheck: "ok",
      openedReadOnly: true,
      userVersion,
      tables
    };
  } finally {
    database.close();
  }
}

function summarizeCloudSnapshot(snapshot) {
  const data = snapshot.data;
  return {
    available: true,
    schemaVersion: snapshot.schemaVersion,
    deviceIdIncluded: snapshot.deviceId.length > 0,
    updatedAt: snapshot.updatedAt,
    counts: {
      ratings: data.ratings.length,
      attempts: data.attempts.length,
      reviewQueue: data.reviewQueue.length,
      sprintSessions: data.sprintSessions.length,
      practiceRuns: Array.isArray(data.practiceRuns) ? data.practiceRuns.length : 0
    }
  };
}

async function verifyManifestFiles(manifest, readEntry) {
  const names = new Set();
  for (const file of manifest.files) {
    if (!isPlainObject(file)) {
      throw new Error("Support bundle manifest contains an invalid file entry.");
    }
    const name = validateEntryName(file.name);
    if (
      name === "manifest.json"
      || names.has(name)
      || !Number.isSafeInteger(file.bytes)
      || file.bytes < 0
      || typeof file.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error(`Support bundle manifest metadata is invalid for ${name}.`);
    }
    names.add(name);
    const contents = await readEntry(name);
    const checksum = createHash("sha256").update(contents).digest("hex");
    if (contents.length !== file.bytes || checksum !== file.sha256) {
      throw new Error(`Support bundle manifest verification failed for ${name}.`);
    }
  }
  for (const required of ["local-progress.sqlite", "diagnostic.txt"]) {
    if (!names.has(required)) {
      throw new Error(`Support bundle manifest is missing ${required}.`);
    }
  }
  const hasCloudSnapshot = names.has("icloud-progress-snapshot.json");
  if (
    (manifest.kind === "complete" && !hasCloudSnapshot)
    || (manifest.kind === "partial" && hasCloudSnapshot)
  ) {
    throw new Error("Support bundle kind does not match its CloudKit snapshot files.");
  }
}

function validateManifest(value) {
  if (
    !isPlainObject(value)
    || value.bundleFormatVersion !== 1
    || (value.kind !== "complete" && value.kind !== "partial")
    || typeof value.createdAt !== "string"
    || !Array.isArray(value.files)
    || !isPlainObject(value.app)
    || !isPlainObject(value.sync)
    || !isPlainObject(value.environment)
    || !isPlainObject(value.cloudSnapshot)
  ) {
    throw new Error("Support bundle manifest format is invalid.");
  }
}

function validateCloudSnapshot(value) {
  if (
    !isPlainObject(value)
    || value.schemaVersion !== 1
    || typeof value.deviceId !== "string"
    || typeof value.updatedAt !== "string"
    || !isPlainObject(value.data)
    || value.data.schemaVersion !== 1
    || !isPlainObject(value.data.settings)
    || !Array.isArray(value.data.ratings)
    || !Array.isArray(value.data.attempts)
    || !Array.isArray(value.data.reviewQueue)
    || !Array.isArray(value.data.sprintSessions)
  ) {
    throw new Error("CloudKit progress snapshot format is invalid.");
  }
  return value;
}

function parseJson(contents, name) {
  try {
    return JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error(`Support bundle ${name} is not valid JSON.`);
  }
}

function validateEntryName(name) {
  if (typeof name !== "string" || !ALLOWED_FILES.has(name)) {
    throw new Error(`Support bundle contains unsupported entry ${String(name)}.`);
  }
  return name;
}

function findEndOfCentralDirectory(archive) {
  const minimumOffset = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("Support bundle ZIP end-of-directory record is missing.");
}

function requireRange(buffer, offset, length) {
  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > buffer.length
  ) {
    throw new Error("Support bundle ZIP entry exceeds the archive bounds.");
  }
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
