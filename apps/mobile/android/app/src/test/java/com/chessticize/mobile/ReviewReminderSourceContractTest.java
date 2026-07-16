package com.chessticize.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public final class ReviewReminderSourceContractTest {
    @Test
    public void manifestDeclaresOnlyInexactReminderPermissionsAndAuditedReceivers() throws Exception {
        String manifest = readProjectFile("src/main/AndroidManifest.xml");

        assertTrue(manifest.contains("android.permission.POST_NOTIFICATIONS"));
        assertTrue(manifest.contains("android.permission.RECEIVE_BOOT_COMPLETED"));
        assertFalse(manifest.contains("android.permission.SCHEDULE_EXACT_ALARM"));
        assertFalse(manifest.contains("android.permission.USE_EXACT_ALARM"));
        assertTrue(manifest.matches("(?s).*ReviewReminderAlarmReceiver.*?android:exported=\"false\".*"));
        assertTrue(manifest.matches("(?s).*ReviewReminderLifecycleReceiver.*?android:exported=\"true\".*"));
        for (String action : new String[] {
                "BOOT_COMPLETED",
                "TIME_SET",
                "TIMEZONE_CHANGED",
                "LOCALE_CHANGED",
                "MY_PACKAGE_REPLACED"
        }) {
            assertTrue("missing lifecycle action " + action, manifest.contains(action));
        }
    }

    @Test
    public void schedulerUsesOneShotInexactAlarmApisOnly() throws Exception {
        String source = readProjectFile(
                "src/main/java/com/chessticize/mobile/ReviewReminderNotificationsModule.kt");

        assertTrue(source.contains("setAndAllowWhileIdle("));
        assertFalse(source.contains("setExact("));
        assertFalse(source.contains("setExactAndAllowWhileIdle("));
        assertFalse(source.contains("setRepeating("));
        assertFalse(source.contains("setInexactRepeating("));
        assertTrue(source.contains("ALARM_REQUEST_CODE = 182"));
        assertTrue(source.contains("PendingIntent.FLAG_IMMUTABLE"));
        assertTrue(source.contains("if (BuildConfig.DEBUG)"));
        assertTrue(source.contains("reviewReminderDelayMs"));
        assertTrue(source.contains("it in 1_000L..60_000L"));
    }

    @Test
    public void permissionAndSettingsRecoveryFailClosedAcrossSupportedApis() throws Exception {
        String source = readProjectFile(
                "src/main/java/com/chessticize/mobile/ReviewReminderNotificationsModule.kt");
        String activity = readProjectFile("src/main/java/com/chessticize/mobile/MainActivity.kt");

        assertTrue(source.contains("ACTION_APPLICATION_DETAILS_SETTINGS"));
        assertTrue(source.contains("Uri.parse(\"package:"));
        assertTrue(source.contains("ACTION_APP_NOTIFICATION_SETTINGS"));
        assertTrue(source.contains("ACTION_CHANNEL_NOTIFICATION_SETTINGS"));
        assertTrue(source.contains("resolveActivity"));
        assertTrue(source.contains("settings_unavailable"));
        assertTrue(source.contains("ReviewReminderPermissionResult.DISMISSED"));
        assertFalse(source.contains("markPermissionRequested"));
        assertTrue(activity.contains("grantResults.isEmpty()"));
    }

    private static String readProjectFile(String appRelativePath) throws Exception {
        java.nio.file.Path direct = Paths.get(appRelativePath);
        java.nio.file.Path fromAndroid = Paths.get("app").resolve(appRelativePath);
        java.nio.file.Path path = Files.isRegularFile(direct) ? direct : fromAndroid;
        return new String(Files.readAllBytes(path));
    }
}
