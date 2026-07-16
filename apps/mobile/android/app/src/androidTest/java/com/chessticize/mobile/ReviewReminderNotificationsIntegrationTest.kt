package com.chessticize.mobile

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
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

  private fun reminder(body: String): StoredReviewReminder = StoredReviewReminder(
    scheduledAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(System.currentTimeMillis() + 86_400_000L)),
    targetLocalDateTime = SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US)
      .format(Date(System.currentTimeMillis() + 86_400_000L)),
    body = body,
    dueCount = 1,
  )
}
