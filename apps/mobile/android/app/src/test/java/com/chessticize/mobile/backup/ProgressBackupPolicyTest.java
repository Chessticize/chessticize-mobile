package com.chessticize.mobile.backup;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class ProgressBackupPolicyTest {
    private static final int ENCRYPTION = 1;
    private static final int DEVICE_TRANSFER = 2;

    @Rule public final TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void apiBeforeTransportFlagsFailsClosedForEveryMask() {
        for (int flags : new int[] {0, ENCRYPTION, DEVICE_TRANSFER, ENCRYPTION | DEVICE_TRANSFER}) {
            assertFalse(ProgressBackupPolicy.shouldBackUp(24, flags, ENCRYPTION, DEVICE_TRANSFER));
        }
    }

    @Test
    public void apiWithTransportFlagsUsesOnceOnlyOrSemantics() {
        assertFalse(ProgressBackupPolicy.shouldBackUp(28, 0, ENCRYPTION, DEVICE_TRANSFER));
        assertTrue(ProgressBackupPolicy.shouldBackUp(28, ENCRYPTION, ENCRYPTION, DEVICE_TRANSFER));
        assertTrue(ProgressBackupPolicy.shouldBackUp(
                28,
                DEVICE_TRANSFER,
                ENCRYPTION,
                DEVICE_TRANSFER));
        assertTrue(ProgressBackupPolicy.shouldBackUp(
                28,
                ENCRYPTION | DEVICE_TRANSFER,
                ENCRYPTION,
                DEVICE_TRANSFER));
    }

    @Test
    public void selectsOnlyCanonicalExistingRegularDatabaseFilesOnce() throws Exception {
        File databases = temporaryFolder.newFolder("databases");
        File main = new File(databases, ProgressBackupPolicy.MAIN_DATABASE_NAME);
        File wal = new File(databases, ProgressBackupPolicy.MAIN_DATABASE_NAME + "-wal");
        File journalDirectory = new File(
                databases,
                ProgressBackupPolicy.MAIN_DATABASE_NAME + "-journal");
        Files.write(main.toPath(), new byte[] {1});
        Files.write(wal.toPath(), new byte[] {2});
        assertTrue(journalDirectory.mkdir());

        List<File> payload = ProgressBackupPolicy.existingPayloadFiles(main);

        assertEquals(
                Arrays.asList(ProgressBackupPolicy.MAIN_DATABASE_NAME,
                        ProgressBackupPolicy.MAIN_DATABASE_NAME + "-wal"),
                payload.stream().map(File::getName).collect(Collectors.toList()));
        assertEquals(main.getCanonicalFile(), payload.get(0));
        assertEquals(wal.getCanonicalFile(), payload.get(1));
    }

    @Test
    public void returnsNoPayloadWhenMainAndSidecarsAreMissing() throws Exception {
        File databases = temporaryFolder.newFolder("empty-databases");
        File main = new File(databases, ProgressBackupPolicy.MAIN_DATABASE_NAME);

        assertTrue(ProgressBackupPolicy.existingPayloadFiles(main).isEmpty());
    }
}
