# The API 36 instrumentation suite is compiled separately from the optimized
# target APK and directly calls these exact native reminder contracts. Keep
# only that test ABI stable; production release builds do not load this file.
# Detox's separately compiled instrumentation APK includes Material test UI
# classes that extend AppCompat. Keep that dependency ABI stable across APKs;
# production release builds remain free to optimize AppCompat.
-keep class androidx.appcompat.** { *; }

-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderAlarmContract { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderAlarmReceiver { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderAlarmScheduler { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderLifecycleReceiver { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.MainActivityKt { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderNotifications { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderPermissionResult { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderPermissionState { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderRouteBus { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderSettingsIntentFactory { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderSettingsLauncher { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderStore { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.ReviewReminderTapActivity { *; }
-keep,includedescriptorclasses class com.chessticize.mobile.StoredReviewReminder { *; }
