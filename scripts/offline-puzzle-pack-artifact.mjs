import { rename, rm } from "node:fs/promises";

export async function installArtifactPair(input) {
  const fileSystem = input.fileSystem ?? { rename, rm };
  const packBackupPath =
    `${input.packPath}.${input.backupLabel}-backup-${input.token}`;
  const manifestBackupPath =
    `${input.manifestPath}.${input.backupLabel}-backup-${input.token}`;
  let packBackedUp = false;
  let manifestBackedUp = false;
  let packInstalled = false;
  let manifestInstalled = false;
  try {
    await fileSystem.rename(input.packPath, packBackupPath);
    packBackedUp = true;
    await fileSystem.rename(input.manifestPath, manifestBackupPath);
    manifestBackedUp = true;
    await fileSystem.rename(input.temporaryPackPath, input.packPath);
    packInstalled = true;
    await fileSystem.rename(
      input.temporaryManifestPath,
      input.manifestPath
    );
    manifestInstalled = true;
  } catch (error) {
    if (packInstalled) {
      await fileSystem.rm(input.packPath, { force: true });
    }
    if (manifestInstalled) {
      await fileSystem.rm(input.manifestPath, { force: true });
    }
    if (packBackedUp) {
      await fileSystem.rename(packBackupPath, input.packPath);
    }
    if (manifestBackedUp) {
      await fileSystem.rename(manifestBackupPath, input.manifestPath);
    }
    throw error;
  }
  await fileSystem.rm(packBackupPath, { force: true });
  await fileSystem.rm(manifestBackupPath, { force: true });
}
