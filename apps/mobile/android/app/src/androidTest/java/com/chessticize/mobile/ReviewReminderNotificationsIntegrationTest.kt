package com.chessticize.mobile

import android.app.NotificationManager
import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.Settings
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReviewReminderNotificationsIntegrationTest {
  private lateinit var context: Context

  @Before
  fun setUp() {
    context = InstrumentationRegistry.getInstrumentation().targetContext
    ReviewReminderAlarmScheduler.replace(context, null)
    ReviewReminderStore.clearPermissionDecision(context)
    context.getSystemService(NotificationManager::class.java)
      .cancel(ReviewReminderAlarmContract.NOTIFICATION_ID)
    while (ReviewReminderRouteBus.consume() != null) {
      // Clear any cold route buffered by an earlier test.
    }
  }

  @After
  fun tearDown() {
    ReviewReminderAlarmScheduler.replace(context, null)
  }

  @Test
  fun channelIdentityIsStableAndIdempotent() {
    ReviewReminderNotifications.ensureChannel(context)
    ReviewReminderNotifications.ensureChannel(context)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(NotificationManager::class.java)
      val channel = manager.getNotificationChannel(ReviewReminderAlarmContract.CHANNEL_ID)
      assertNotNull(channel)
      assertEquals(ReviewReminderAlarmContract.CHANNEL_NAME, channel.name.toString())
      assertEquals(ReviewReminderAlarmContract.CHANNEL_DESCRIPTION, channel.description)
    }
  }

  @Test
  fun replacementLifecycleReconstructionAndDisableShareOnePendingIntentContract() {
    val first = reminder("first")
    val second = reminder("second")

    assertTrue(ReviewReminderAlarmScheduler.replace(context, first))
    assertNotNull(ReviewReminderAlarmScheduler.existingAlarmPendingIntent(context))
    assertEquals(first, ReviewReminderStore.load(context))

    assertTrue(ReviewReminderAlarmScheduler.replace(context, second))
    assertNotNull(ReviewReminderAlarmScheduler.existingAlarmPendingIntent(context))
    assertEquals(second, ReviewReminderStore.load(context))

    ReviewReminderAlarmScheduler.cancelAlarm(context)
    assertNull(ReviewReminderAlarmScheduler.existingAlarmPendingIntent(context))
    ReviewReminderLifecycleReceiver().onReceive(context, Intent(Intent.ACTION_TIMEZONE_CHANGED))
    assertNotNull(ReviewReminderAlarmScheduler.existingAlarmPendingIntent(context))
    assertEquals(second, ReviewReminderStore.load(context))

    assertFalse(ReviewReminderAlarmScheduler.replace(context, null))
    assertNull(ReviewReminderAlarmScheduler.existingAlarmPendingIntent(context))
    assertNull(ReviewReminderStore.load(context))

    ReviewReminderLifecycleReceiver().onReceive(context, Intent(Intent.ACTION_TIMEZONE_CHANGED))
    assertNull(ReviewReminderAlarmScheduler.existingAlarmPendingIntent(context))
  }

  @Test
  fun receiversIgnoreUnownedActionsAndExposeAuditedManifestBoundaries() {
    ReviewReminderAlarmScheduler.replace(context, reminder("owned"))
    ReviewReminderAlarmScheduler.cancelAlarm(context)

    ReviewReminderLifecycleReceiver().onReceive(context, Intent("example.unowned"))
    assertNull(ReviewReminderAlarmScheduler.existingAlarmPendingIntent(context))
    ReviewReminderAlarmReceiver().onReceive(context, Intent("example.unowned"))
    assertNotNull(ReviewReminderStore.load(context))

    val packageManager = context.packageManager
    val alarmInfo = packageManager.getReceiverInfo(
      ComponentName(context, ReviewReminderAlarmReceiver::class.java),
      0,
    )
    val lifecycleInfo = packageManager.getReceiverInfo(
      ComponentName(context, ReviewReminderLifecycleReceiver::class.java),
      0,
    )
    assertFalse(alarmInfo.exported)
    assertTrue(lifecycleInfo.exported)
  }

  @Test
  fun permissionResultsDistinguishDismissalDenialAndGrant() {
    assertEquals(
      ReviewReminderPermissionResult.DISMISSED,
      reviewReminderPermissionResult(intArrayOf()),
    )
    assertEquals(
      ReviewReminderPermissionResult.DENIED,
      reviewReminderPermissionResult(intArrayOf(PackageManager.PERMISSION_DENIED)),
    )
    assertEquals(
      ReviewReminderPermissionResult.GRANTED,
      reviewReminderPermissionResult(intArrayOf(PackageManager.PERMISSION_GRANTED)),
    )

    ReviewReminderStore.recordPermissionResult(context, ReviewReminderPermissionResult.DISMISSED)
    assertNull(ReviewReminderStore.permissionResult(context))
    ReviewReminderStore.recordPermissionResult(context, ReviewReminderPermissionResult.DENIED)
    assertEquals(ReviewReminderPermissionResult.DENIED, ReviewReminderStore.permissionResult(context))
    ReviewReminderStore.recordPermissionResult(context, ReviewReminderPermissionResult.GRANTED)
    assertEquals(ReviewReminderPermissionResult.GRANTED, ReviewReminderStore.permissionResult(context))

    assertEquals("not_determined", ReviewReminderPermissionState.resolve(true, false, false, true, true))
    assertEquals("denied", ReviewReminderPermissionState.resolve(true, false, true, true, true))
    assertEquals("authorized", ReviewReminderPermissionState.resolve(true, true, true, true, true))
    assertEquals("denied", ReviewReminderPermissionState.resolve(false, true, false, false, true))
    assertEquals("channel_disabled", ReviewReminderPermissionState.resolve(false, true, false, true, false))
  }

  @Test
  fun settingsRoutingUsesSupportedApiFallbacksAndRejectsMissingHandlers() {
    val legacy = ReviewReminderSettingsIntentFactory.create(context, "denied", 24)
    assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, legacy.action)
    assertEquals("package", legacy.data?.scheme)
    assertEquals(context.packageName, legacy.data?.schemeSpecificPart)

    val app = ReviewReminderSettingsIntentFactory.create(context, "denied", 26)
    assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, app.action)
    assertEquals(context.packageName, app.getStringExtra(Settings.EXTRA_APP_PACKAGE))

    val channel = ReviewReminderSettingsIntentFactory.create(context, "channel_disabled", 26)
    assertEquals(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS, channel.action)
    assertEquals(context.packageName, channel.getStringExtra(Settings.EXTRA_APP_PACKAGE))
    assertEquals(
      ReviewReminderAlarmContract.CHANNEL_ID,
      channel.getStringExtra(Settings.EXTRA_CHANNEL_ID),
    )

    assertFalse(
      ReviewReminderSettingsLauncher.open(
        context,
        Intent("com.chessticize.mobile.MISSING_SETTINGS_HANDLER"),
      ),
    )
  }

  @Test
  fun ownedDeliveryPostsOneNotificationAndConsumesTheStoredDecision() {
    grantNotificationPermission()
    assertEquals("authorized", ReviewReminderNotifications.authorizationStatus(context))
    val manager = context.getSystemService(NotificationManager::class.java)
    val stored = reminder("one review is ready")
    ReviewReminderAlarmScheduler.replace(context, stored)

    ReviewReminderAlarmReceiver().onReceive(
      context,
      Intent(context, ReviewReminderAlarmReceiver::class.java).apply {
        action = ReviewReminderAlarmContract.ACTION_DELIVER
      },
    )

    assertNull(ReviewReminderStore.load(context))
    assertEquals(
      1,
      manager.activeNotifications.count { it.id == ReviewReminderAlarmContract.NOTIFICATION_ID },
    )
    ReviewReminderAlarmReceiver().onReceive(
      context,
      Intent(context, ReviewReminderAlarmReceiver::class.java).apply {
        action = ReviewReminderAlarmContract.ACTION_DELIVER
      },
    )
    assertEquals(
      1,
      manager.activeNotifications.count { it.id == ReviewReminderAlarmContract.NOTIFICATION_ID },
    )
  }

  @Test
  fun routeBusBuffersColdTapsAndPublishesForegroundTapsOnce() {
    val coldIntent = reviewRouteIntent()
    ReviewReminderRouteBus.capture(coldIntent)
    assertEquals("review", ReviewReminderRouteBus.consume())
    assertNull(ReviewReminderRouteBus.consume())

    val routes = mutableListOf<String>()
    val sink: (String) -> Unit = { route -> routes += route }
    ReviewReminderRouteBus.subscribe(sink)
    try {
      ReviewReminderRouteBus.capture(reviewRouteIntent())
      assertEquals(listOf("review"), routes)
      assertNull(ReviewReminderRouteBus.consume())
    } finally {
      ReviewReminderRouteBus.unsubscribe(sink)
    }
  }

  private fun reminder(body: String): StoredReviewReminder = StoredReviewReminder(
    scheduledAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(System.currentTimeMillis() + 86_400_000L)),
    targetLocalDateTime = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)
      .format(Date(System.currentTimeMillis() + 86_400_000L)),
    body = body,
    dueCount = 1,
  )

  private fun reviewRouteIntent(): Intent = Intent(context, MainActivity::class.java).apply {
    action = ReviewReminderAlarmContract.ACTION_OPEN_REVIEW
    putExtra("route", "review")
  }

  private fun grantNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return
    }
    val descriptor = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(
      "pm grant ${context.packageName} ${Manifest.permission.POST_NOTIFICATIONS}",
    )
    ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { it.readBytes() }
    assertEquals(
      PackageManager.PERMISSION_GRANTED,
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS),
    )
  }
}
