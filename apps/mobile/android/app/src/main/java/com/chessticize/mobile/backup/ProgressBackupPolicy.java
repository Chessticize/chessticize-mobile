package com.chessticize.mobile.backup;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class ProgressBackupPolicy {
    static final String MAIN_DATABASE_NAME = "chessticize-mobile.sqlite";

    private static final int TRANSPORT_FLAGS_API = 28;
    private static final String[] DATABASE_SUFFIXES = {"", "-journal", "-wal"};

    private ProgressBackupPolicy() {}

    static boolean shouldBackUp(
            int sdkInt,
            int transportFlags,
            int encryptionFlag,
            int deviceTransferFlag) {
        if (sdkInt < TRANSPORT_FLAGS_API) {
            return false;
        }
        return (transportFlags & (encryptionFlag | deviceTransferFlag)) != 0;
    }

    static List<File> existingPayloadFiles(File requestedMainDatabase) throws IOException {
        File requestedParent = requestedMainDatabase.getParentFile();
        if (requestedParent == null) {
            return Collections.emptyList();
        }

        File canonicalParent = requestedParent.getCanonicalFile();
        List<File> payload = new ArrayList<>(DATABASE_SUFFIXES.length);
        for (String suffix : DATABASE_SUFFIXES) {
            String expectedName = MAIN_DATABASE_NAME + suffix;
            File candidate = new File(requestedParent, expectedName).getCanonicalFile();
            if (!canonicalParent.equals(candidate.getParentFile())
                    || !expectedName.equals(candidate.getName())
                    || !candidate.isFile()) {
                continue;
            }
            payload.add(candidate);
        }
        return Collections.unmodifiableList(payload);
    }
}
