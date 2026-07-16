package com.chessticize.mobile

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

private const val REVIEW_REMINDER_EVENT = "ReviewReminderNotificationRoute"
private const val REVIEW_ROUTE = "review"

internal data class StoredReviewReminder(
  val scheduledAt: String,
  val targetLocalDateTime: String,
  val body: String,
  val dueCount: Int,
)

/** One stable PendingIntent identity owns replacement, cancellation, and delivery. */
internal object ReviewReminderAlarmContract {
  const val ACTION_DELIVER = "com.chessticize.mobile.action.DELIVER_REVIEW_REMINDER"
  const val ACTION_OPEN_REVIEW = "com.chessticize.mobile.action.OPEN_REVIEW"
  const val ALARM_REQUEST_CODE = 182
  const val CONTENT_REQUEST_CODE = 1182
  const val NOTIFICATION_ID = 182
  const val CHANNEL_ID = "review_reminders"
  const val CHANNEL_NAME = "Review reminders"
  const val CHANNEL_DESCRIPTION = "Reminders for review work that is ready in Chessticize"
}

internal object ReviewReminderStore {
  private const val PREFERENCES = "review-reminder-native"
  private const val KEY_SCHEDULED_AT = "scheduled-at"
  private const val KEY_TARGET_LOCAL_DATE_TIME = "target-local-date-time"
  private const val KEY_BODY = "body"
  private const val KEY_DUE_COUNT = "due-count"
  private const val KEY_PERMISSION_REQUESTED = "permission-requested"

  fun save(context: Context, reminder: StoredReviewReminder) {
    preferences(context).edit()
      .putString(KEY_SCHEDULED_AT, reminder.scheduledAt)
      .putString(KEY_TARGET_LOCAL_DATE_TIME, reminder.targetLocalDateTime)
      .putString(KEY_BODY, reminder.body)
      .putInt(KEY_DUE_COUNT, reminder.dueCount)
      .apply()
  }

  fun load(context: Context): StoredReviewReminder? {
    val preferences = preferences(context)
    val scheduledAt = preferences.getString(KEY_SCHEDULED_AT, null) ?: return null
    val targetLocalDateTime = preferences.getString(KEY_TARGET_LOCAL_DATE_TIME, null) ?: return null
    val body = preferences.getString(KEY_BODY, null) ?: return null
    val dueCount = preferences.getInt(KEY_DUE_COUNT, 0)
    return if (body.isBlank() || dueCount <= 0) null else StoredReviewReminder(
      scheduledAt = scheduledAt,
      targetLocalDateTime = targetLocalDateTime,
      body = body,
      dueCount = dueCount,
    )
  }

  fun clearSchedule(context: Context) {
    preferences(context).edit()
      .remove(KEY_SCHEDULED_AT)
      .remove(KEY_TARGET_LOCAL_DATE_TIME)
      .remove(KEY_BODY)
      .remove(KEY_DUE_COUNT)
      .apply()
  }

  fun markPermissionRequested(context: Context) {
    preferences(context).edit().putBoolean(KEY_PERMISSION_REQUESTED, true).apply()
  }

  fun wasPermissionRequested(context: Context): Boolean =
    preferences(context).getBoolean(KEY_PERMISSION_REQUESTED, false)

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}

internal object ReviewReminderAlarmScheduler {
  private const val MINIMUM_FUTURE_DELAY_MS = 1_000L

  fun replace(context: Context, reminder: StoredReviewReminder?): Boolean {
    val applicationContext = context.applicationContext
    cancelAlarm(applicationContext)
    if (reminder == null) {
      ReviewReminderStore.clearSchedule(applicationContext)
      notificationManager(applicationContext).cancel(ReviewReminderAlarmContract.NOTIFICATION_ID)
      return false
    }

    val targetTime = parseLocalTarget(reminder.targetLocalDateTime)
      ?: throw IllegalArgumentException("targetLocalDateTime must use yyyy-MM-dd'T'HH:mm")
    ReviewReminderStore.save(applicationContext, reminder)
    scheduleAlarm(applicationContext, reminder, targetTime)
    return true
  }

  fun rebuild(context: Context): Boolean {
    val reminder = ReviewReminderStore.load(context) ?: run {
      cancelAlarm(context)
      return false
    }
    cancelAlarm(context)
    val targetTime = parseLocalTarget(reminder.targetLocalDateTime) ?: run {
      ReviewReminderStore.clearSchedule(context)
      return false
    }
    scheduleAlarm(context, reminder, targetTime)
    return true
  }

  fun cancelAlarm(context: Context) {
    val pendingIntent = existingAlarmPendingIntent(context) ?: return
    alarmManager(context).cancel(pendingIntent)
    pendingIntent.cancel()
  }

  fun existingAlarmPendingIntent(context: Context): PendingIntent? = PendingIntent.getBroadcast(
    context,
    ReviewReminderAlarmContract.ALARM_REQUEST_CODE,
    Intent(context, ReviewReminderAlarmReceiver::class.java).apply {
      action = ReviewReminderAlarmContract.ACTION_DELIVER
    },
    PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
  )

  fun alarmPendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    ReviewReminderAlarmContract.ALARM_REQUEST_CODE,
    Intent(context, ReviewReminderAlarmReceiver::class.java).apply {
      action = ReviewReminderAlarmContract.ACTION_DELIVER
    },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  private fun scheduleAlarm(context: Context, reminder: StoredReviewReminder, targetTime: Long) {
    val testDelayMs = if (BuildConfig.DEBUG) {
      ChessticizeTestLaunchArguments.current["reviewReminderDelayMs"]
        ?.toLongOrNull()
        ?.takeIf { it in 1_000L..60_000L }
    } else {
      null
    }
    val triggerAt = testDelayMs?.let { System.currentTimeMillis() + it }
      ?: max(targetTime, System.currentTimeMillis() + MINIMUM_FUTURE_DELAY_MS)
    ReviewReminderStore.save(context, reminder)
    alarmManager(context).setAndAllowWhileIdle(
      AlarmManager.RTC_WAKEUP,
      triggerAt,
      alarmPendingIntent(context),
    )
  }

  private fun parseLocalTarget(value: String): Long? = runCatching {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).apply {
      isLenient = false
    }.parse(value)?.time
  }.getOrNull()

  private fun alarmManager(context: Context): AlarmManager =
    context.getSystemService(AlarmManager::class.java)
      ?: error("AlarmManager is unavailable")
}

internal object ReviewReminderNotifications {
  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val channel = NotificationChannel(
      ReviewReminderAlarmContract.CHANNEL_ID,
      ReviewReminderAlarmContract.CHANNEL_NAME,
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = ReviewReminderAlarmContract.CHANNEL_DESCRIPTION
    }
    notificationManager(context).createNotificationChannel(channel)
  }

  fun authorizationStatus(context: Context): String {
    ensureChannel(context)
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return if (ReviewReminderStore.wasPermissionRequested(context)) "denied" else "not_determined"
    }
    val manager = notificationManager(context)
    if (!manager.areNotificationsEnabled()) {
      return "denied"
    }
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      manager.getNotificationChannel(ReviewReminderAlarmContract.CHANNEL_ID)?.importance == NotificationManager.IMPORTANCE_NONE
    ) {
      return "channel_disabled"
    }
    return "authorized"
  }

  fun post(context: Context, reminder: StoredReviewReminder) {
    ensureChannel(context)
    if (authorizationStatus(context) != "authorized") {
      return
    }
    val contentIntent = PendingIntent.getActivity(
      context,
      ReviewReminderAlarmContract.CONTENT_REQUEST_CODE,
      Intent(context, MainActivity::class.java).apply {
        action = ReviewReminderAlarmContract.ACTION_OPEN_REVIEW
        putExtra("route", REVIEW_ROUTE)
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, ReviewReminderAlarmContract.CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }
    @Suppress("DEPRECATION")
    val notification = builder
      .setSmallIcon(R.drawable.ic_review_reminder_notification)
      .setContentTitle(context.getString(R.string.app_name))
      .setContentText(reminder.body)
      .setStyle(Notification.BigTextStyle().bigText(reminder.body))
      .setCategory(Notification.CATEGORY_REMINDER)
      .setPriority(Notification.PRIORITY_DEFAULT)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .build()
    notificationManager(context).notify(ReviewReminderAlarmContract.NOTIFICATION_ID, notification)
  }
}

class ReviewReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ReviewReminderAlarmContract.ACTION_DELIVER) {
      return
    }
    val reminder = ReviewReminderStore.load(context) ?: return
    ReviewReminderStore.clearSchedule(context)
    ReviewReminderNotifications.post(context, reminder)
  }
}

class ReviewReminderLifecycleReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action !in RECONSTRUCTION_ACTIONS) {
      return
    }
    ReviewReminderAlarmScheduler.rebuild(context)
  }

  internal companion object {
    val RECONSTRUCTION_ACTIONS = setOf(
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_LOCALE_CHANGED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
    )
  }
}

internal object ReviewReminderRouteBus {
  private var pendingRoute: String? = null
  private var sink: ((String) -> Unit)? = null

  @Synchronized
  fun capture(intent: Intent?) {
    if (intent?.action != ReviewReminderAlarmContract.ACTION_OPEN_REVIEW || intent.getStringExtra("route") != REVIEW_ROUTE) {
      return
    }
    val currentSink = sink
    if (currentSink == null) {
      pendingRoute = REVIEW_ROUTE
    } else {
      currentSink(REVIEW_ROUTE)
    }
    intent.action = null
    intent.removeExtra("route")
  }

  @Synchronized
  fun subscribe(nextSink: (String) -> Unit) {
    sink = nextSink
  }

  @Synchronized
  fun unsubscribe(nextSink: (String) -> Unit) {
    if (sink === nextSink) {
      sink = null
    }
  }

  @Synchronized
  fun consume(): String? = pendingRoute.also { pendingRoute = null }

  @Synchronized
  fun defer(route: String) {
    if (route == REVIEW_ROUTE) {
      pendingRoute = route
    }
  }
}

interface ReviewReminderPermissionHost {
  fun requestReviewReminderPermission(callback: (Boolean) -> Unit): Boolean
}

class ReviewReminderNotificationsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var listenerCount = 0
  private val routeSink: (String) -> Unit = { route -> publishRoute(route) }

  init {
    ReviewReminderNotifications.ensureChannel(reactContext)
    ReviewReminderRouteBus.subscribe(routeSink)
  }

  override fun getName(): String = "ReviewReminderNotifications"

  @ReactMethod
  fun replaceNextReminder(reminder: ReadableMap?, promise: Promise) {
    try {
      val stored = reminder?.let { nativeReminder(it) }
      val scheduled = ReviewReminderAlarmScheduler.replace(reactApplicationContext, stored)
      val result = Arguments.createMap().apply {
        putBoolean("scheduled", scheduled)
        if (scheduled && stored != null) {
          putString("scheduledAt", stored.scheduledAt)
        }
      }
      promise.resolve(result)
    } catch (error: Throwable) {
      promise.reject("schedule_failed", "The next review reminder could not be scheduled.", error)
    }
  }

  @ReactMethod
  fun getAuthorizationStatus(promise: Promise) {
    promise.resolve(ReviewReminderNotifications.authorizationStatus(reactApplicationContext))
  }

  @ReactMethod
  fun requestAuthorization(promise: Promise) {
    ReviewReminderNotifications.ensureChannel(reactApplicationContext)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      promise.resolve(ReviewReminderNotifications.authorizationStatus(reactApplicationContext))
      return
    }
    if (reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
      promise.resolve(ReviewReminderNotifications.authorizationStatus(reactApplicationContext))
      return
    }
    val host = reactApplicationContext.currentActivity as? ReviewReminderPermissionHost
    if (host == null) {
      promise.resolve("unavailable")
      return
    }
    ReviewReminderStore.markPermissionRequested(reactApplicationContext)
    val started = host.requestReviewReminderPermission {
      promise.resolve(ReviewReminderNotifications.authorizationStatus(reactApplicationContext))
    }
    if (!started) {
      promise.reject("permission_in_progress", "A notification permission request is already active.")
    }
  }

  @ReactMethod
  fun openSystemSettings(promise: Promise) {
    val status = ReviewReminderNotifications.authorizationStatus(reactApplicationContext)
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && status == "channel_disabled") {
      Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
        putExtra(Settings.EXTRA_CHANNEL_ID, ReviewReminderAlarmContract.CHANNEL_ID)
      }
    } else {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
      }
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactApplicationContext.startActivity(intent)
    promise.resolve(null)
  }

  @ReactMethod
  fun consumeInitialRoute(promise: Promise) {
    promise.resolve(ReviewReminderRouteBus.consume())
  }

  @ReactMethod
  fun addListener(eventName: String) {
    if (eventName == REVIEW_REMINDER_EVENT) {
      listenerCount += 1
    }
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = max(0, listenerCount - count)
  }

  override fun invalidate() {
    ReviewReminderRouteBus.unsubscribe(routeSink)
    listenerCount = 0
    super.invalidate()
  }

  private fun publishRoute(route: String) {
    if (listenerCount <= 0 || !reactApplicationContext.hasActiveReactInstance()) {
      ReviewReminderRouteBus.defer(route)
      return
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(REVIEW_REMINDER_EVENT, route)
  }

  private fun nativeReminder(reminder: ReadableMap): StoredReviewReminder {
    val scheduledAt = reminder.getString("scheduledAt")?.takeIf { it.isNotBlank() }
      ?: throw IllegalArgumentException("scheduledAt is required")
    val targetLocalDateTime = reminder.getString("targetLocalDateTime")?.takeIf { it.isNotBlank() }
      ?: throw IllegalArgumentException("targetLocalDateTime is required")
    val body = reminder.getString("body")?.takeIf { it.isNotBlank() }
      ?: throw IllegalArgumentException("body is required")
    val route = reminder.getString("route")
    val dueCount = reminder.getInt("dueCount")
    require(route == REVIEW_ROUTE) { "route must be review" }
    require(dueCount > 0) { "dueCount must be positive" }
    return StoredReviewReminder(scheduledAt, targetLocalDateTime, body, dueCount)
  }
}

class ReviewReminderNotificationsPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(ReviewReminderNotificationsModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}

private fun notificationManager(context: Context): NotificationManager =
  context.getSystemService(NotificationManager::class.java)
    ?: error("NotificationManager is unavailable")
