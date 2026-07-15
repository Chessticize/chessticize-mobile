package com.chessticize.mobile.backup;

import android.app.backup.BackupAgent;
import android.app.backup.FullBackupDataOutput;
import android.os.Build;
import android.util.Log;

import java.io.File;
import java.io.IOException;
import java.util.List;

public final class ProgressBackupAgent extends BackupAgent {
    private static final String TAG = "ChessticizeBackup";

    @Override
    public void onFullBackup(FullBackupDataOutput data) throws IOException {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            Log.i(
                    TAG,
                    "event=policy sdk=" + Build.VERSION.SDK_INT
                            + " transportFlags=unavailable encryption=false d2d=false selected=false");
            Log.i(TAG, "event=result selected=false emitted=0");
            return;
        }

        int transportFlags = data.getTransportFlags();
        boolean encryption = (transportFlags & FLAG_CLIENT_SIDE_ENCRYPTION_ENABLED) != 0;
        boolean deviceTransfer = (transportFlags & FLAG_DEVICE_TO_DEVICE_TRANSFER) != 0;
        boolean selected = ProgressBackupPolicy.shouldBackUp(
                Build.VERSION.SDK_INT,
                transportFlags,
                FLAG_CLIENT_SIDE_ENCRYPTION_ENABLED,
                FLAG_DEVICE_TO_DEVICE_TRANSFER);
        Log.i(
                TAG,
                "event=policy sdk=" + Build.VERSION.SDK_INT
                        + " transportFlags=" + transportFlags
                        + " encryption=" + encryption
                        + " d2d=" + deviceTransfer
                        + " selected=" + selected);

        if (!selected) {
            Log.i(TAG, "event=result selected=false emitted=0");
            return;
        }

        List<File> payloadFiles = ProgressBackupPolicy.existingPayloadFiles(
                getDatabasePath(ProgressBackupPolicy.MAIN_DATABASE_NAME));
        int emitted = 0;
        for (File file : payloadFiles) {
            fullBackupFile(file, data);
            emitted += 1;
            Log.i(TAG, "event=payload name=" + file.getName());
        }
        Log.i(TAG, "event=result selected=true emitted=" + emitted);
    }
}
