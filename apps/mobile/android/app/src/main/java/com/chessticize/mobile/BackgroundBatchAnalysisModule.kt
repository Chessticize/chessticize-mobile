package com.chessticize.mobile

import android.Manifest
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
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
import java.lang.ref.WeakReference

internal object BatchAnalysisNotificationContract {
  const val EVENT_NAME = "BackgroundBatchAnalysisEvent"
  const val CHANNEL_PROGRESS_ID = "batch_game_analysis"
  const val CHANNEL_PROGRESS_NAME = "Game analysis progress"
  const val CHANNEL_PROGRESS_DESCRIPTION = "Shows progress while Chessticize analyzes imported games"
  const val CHANNEL_COMPLETE_ID = "batch_game_analysis_complete"
  const val CHANNEL_COMPLETE_NAME = "Game analysis complete"
  const val CHANNEL_COMPLETE_DESCRIPTION = "Notifies when background game analysis finishes"

  const val NOTIFICATION_ID_PROGRESS = 183
  const val NOTIFICATION_ID_COMPLETE = 184

  const val REQUEST_CODE_OPEN = 1183
  const val REQUEST_CODE_PAUSE = 1184
  const val REQUEST_CODE_CANCEL = 1185
  const val REQUEST_CODE_OPEN_COMPLETE = 1186

  const val ACTION_START_OR_UPDATE = "com.chessticize.mobile.action.BATCH_ANALYSIS_UPDATE"
  const val ACTION_STOP = "com.chessticize.mobile.action.BATCH_ANALYSIS_STOP"
  const val ACTION_PAUSE = "com.chessticize.mobile.action.BATCH_ANALYSIS_PAUSE"
  const val ACTION_CANCEL = "com.chessticize.mobile.action.BATCH_ANALYSIS_CANCEL"

  const val EXTRA_TITLE = "title"
  const val EXTRA_SUBTITLE = "subtitle"
  const val EXTRA_COMPLETED_UNITS = "completedUnits"
  const val EXTRA_TOTAL_UNITS = "totalUnits"
  const val EXTRA_PAUSE_LABEL = "pauseLabel"
  const val EXTRA_CANCEL_LABEL = "cancelLabel"
}

internal object BatchAnalysisEventBus {
  @Volatile
  private var reactContextRef: WeakReference<ReactApplicationContext>? = null

  fun attach(context: ReactApplicationContext) {
    reactContextRef = WeakReference(context)
  }

  fun emit(type: String) {
    val context = reactContextRef?.get() ?: return
    if (!context.hasActiveReactInstance()) {
      return
    }
    val payload = Arguments.createMap().apply {
      putString("type", type)
    }
    try {
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(BatchAnalysisNotificationContract.EVENT_NAME, payload)
    } catch (_: Throwable) {
      // Ignore if React bridge is tearing down.
    }
  }
}

internal object BatchAnalysisNotificationHelper {
  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(BatchAnalysisNotificationContract.CHANNEL_PROGRESS_ID) == null) {
      val progressChannel = NotificationChannel(
        BatchAnalysisNotificationContract.CHANNEL_PROGRESS_ID,
        BatchAnalysisNotificationContract.CHANNEL_PROGRESS_NAME,
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = BatchAnalysisNotificationContract.CHANNEL_PROGRESS_DESCRIPTION
        setShowBadge(false)
      }
      manager.createNotificationChannel(progressChannel)
    }
    if (manager.getNotificationChannel(BatchAnalysisNotificationContract.CHANNEL_COMPLETE_ID) == null) {
      val completeChannel = NotificationChannel(
        BatchAnalysisNotificationContract.CHANNEL_COMPLETE_ID,
        BatchAnalysisNotificationContract.CHANNEL_COMPLETE_NAME,
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = BatchAnalysisNotificationContract.CHANNEL_COMPLETE_DESCRIPTION
      }
      manager.createNotificationChannel(completeChannel)
    }
  }

  fun canPostNotifications(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return true
    }
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
  }

  fun isAppInForeground(context: Context): Boolean {
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      ?: return false
    val runningProcesses = activityManager.runningAppProcesses ?: return false
    val packageName = context.packageName
    return runningProcesses.any { process ->
      process.processName == packageName &&
        process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }
  }

  fun buildProgressNotification(
    context: Context,
    title: String,
    subtitle: String,
    completedUnits: Int,
    totalUnits: Int,
    pauseLabel: String,
    cancelLabel: String,
  ): Notification {
    ensureChannels(context)
    val openIntent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val openPendingIntent = PendingIntent.getActivity(
      context,
      BatchAnalysisNotificationContract.REQUEST_CODE_OPEN,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val pauseIntent = Intent(context, BatchAnalysisActionReceiver::class.java).apply {
      action = BatchAnalysisNotificationContract.ACTION_PAUSE
    }
    val pausePendingIntent = PendingIntent.getBroadcast(
      context,
      BatchAnalysisNotificationContract.REQUEST_CODE_PAUSE,
      pauseIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val cancelIntent = Intent(context, BatchAnalysisActionReceiver::class.java).apply {
      action = BatchAnalysisNotificationContract.ACTION_CANCEL
    }
    val cancelPendingIntent = PendingIntent.getBroadcast(
      context,
      BatchAnalysisNotificationContract.REQUEST_CODE_CANCEL,
      cancelIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, BatchAnalysisNotificationContract.CHANNEL_PROGRESS_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }

    val safeTotal = totalUnits.coerceAtLeast(0)
    val safeCompleted = completedUnits.coerceIn(0, safeTotal.coerceAtLeast(1))
    builder
      .setContentTitle(title.ifBlank { "Chessticize" })
      .setContentText(subtitle)
      .setSmallIcon(context.applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openPendingIntent)
      .setProgress(safeTotal, safeCompleted, safeTotal <= 0)
      .addAction(Notification.Action.Builder(null, pauseLabel.ifBlank { "Pause" }, pausePendingIntent).build())
      .addAction(Notification.Action.Builder(null, cancelLabel.ifBlank { "Cancel" }, cancelPendingIntent).build())

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }

    return builder.build()
  }

  fun postCompletionNotification(context: Context, title: String, body: String) {
    if (!canPostNotifications(context)) {
      return
    }
    ensureChannels(context)
    val openIntent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val openPendingIntent = PendingIntent.getActivity(
      context,
      BatchAnalysisNotificationContract.REQUEST_CODE_OPEN_COMPLETE,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, BatchAnalysisNotificationContract.CHANNEL_COMPLETE_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }

    val notification = builder
      .setContentTitle(title.ifBlank { "Chessticize" })
      .setContentText(body)
      .setSmallIcon(context.applicationInfo.icon)
      .setAutoCancel(true)
      .setContentIntent(openPendingIntent)
      .build()

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(BatchAnalysisNotificationContract.NOTIFICATION_ID_COMPLETE, notification)
  }
}

class BatchAnalysisForegroundService : Service() {
  private var lastPauseLabel: String = "Pause"
  private var lastCancelLabel: String = "Cancel"

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == BatchAnalysisNotificationContract.ACTION_STOP) {
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(BatchAnalysisNotificationContract.EXTRA_TITLE) ?: "Chessticize"
    val subtitle = intent?.getStringExtra(BatchAnalysisNotificationContract.EXTRA_SUBTITLE) ?: ""
    val completedUnits = intent?.getIntExtra(BatchAnalysisNotificationContract.EXTRA_COMPLETED_UNITS, 0) ?: 0
    val totalUnits = intent?.getIntExtra(BatchAnalysisNotificationContract.EXTRA_TOTAL_UNITS, 0) ?: 0
    intent?.getStringExtra(BatchAnalysisNotificationContract.EXTRA_PAUSE_LABEL)?.let {
      if (it.isNotBlank()) lastPauseLabel = it
    }
    intent?.getStringExtra(BatchAnalysisNotificationContract.EXTRA_CANCEL_LABEL)?.let {
      if (it.isNotBlank()) lastCancelLabel = it
    }

    val notification = BatchAnalysisNotificationHelper.buildProgressNotification(
      context = this,
      title = title,
      subtitle = subtitle,
      completedUnits = completedUnits,
      totalUnits = totalUnits,
      pauseLabel = lastPauseLabel,
      cancelLabel = lastCancelLabel,
    )

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          BatchAnalysisNotificationContract.NOTIFICATION_ID_PROGRESS,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
      } else {
        startForeground(BatchAnalysisNotificationContract.NOTIFICATION_ID_PROGRESS, notification)
      }
    } catch (_: Throwable) {
      BatchAnalysisEventBus.emit("expiration_warning")
      stopSelf()
      return START_NOT_STICKY
    }

    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    // Android 15+ enforces a dataSync FGS runtime cap; checkpoint cleanly and stop.
    BatchAnalysisEventBus.emit("expiration_warning")
    stopForegroundCompat()
    stopSelf()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    BatchAnalysisEventBus.emit("cancel_requested")
    stopForegroundCompat()
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    stopForegroundCompat()
    super.onDestroy()
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }
}

class BatchAnalysisActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      BatchAnalysisNotificationContract.ACTION_PAUSE -> {
        context.stopService(Intent(context, BatchAnalysisForegroundService::class.java))
        BatchAnalysisEventBus.emit("pause_requested")
      }
      BatchAnalysisNotificationContract.ACTION_CANCEL -> {
        context.stopService(Intent(context, BatchAnalysisForegroundService::class.java))
        BatchAnalysisEventBus.emit("cancel_requested")
      }
    }
  }
}

class BackgroundBatchAnalysisModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private var active = false
  private var pauseLabel = "Pause"
  private var cancelLabel = "Cancel"

  init {
    BatchAnalysisEventBus.attach(reactContext)
  }

  override fun getName(): String = "BackgroundBatchAnalysis"

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for RN NativeEventEmitter contract.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for RN NativeEventEmitter contract.
  }

  @ReactMethod
  fun start(input: ReadableMap, promise: Promise) {
    val context = reactApplicationContext
    BatchAnalysisEventBus.attach(context)

    val title = input.getString("title") ?: "Chessticize"
    val subtitle = input.getString("subtitle") ?: ""
    val totalUnits = if (input.hasKey("totalUnits")) input.getInt("totalUnits") else 0
    pauseLabel = input.getString("pauseLabel") ?: "Pause"
    cancelLabel = input.getString("cancelLabel") ?: "Cancel"

    val intent = Intent(context, BatchAnalysisForegroundService::class.java).apply {
      action = BatchAnalysisNotificationContract.ACTION_START_OR_UPDATE
      putExtra(BatchAnalysisNotificationContract.EXTRA_TITLE, title)
      putExtra(BatchAnalysisNotificationContract.EXTRA_SUBTITLE, subtitle)
      putExtra(BatchAnalysisNotificationContract.EXTRA_COMPLETED_UNITS, 0)
      putExtra(BatchAnalysisNotificationContract.EXTRA_TOTAL_UNITS, totalUnits)
      putExtra(BatchAnalysisNotificationContract.EXTRA_PAUSE_LABEL, pauseLabel)
      putExtra(BatchAnalysisNotificationContract.EXTRA_CANCEL_LABEL, cancelLabel)
    }

    try {
      ContextCompat.startForegroundService(context, intent)
      active = true
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("active", true)
          putBoolean("supportsContinuedBackground", true)
          putString("mode", "foreground_service")
        },
      )
    } catch (_: Throwable) {
      active = false
      promise.resolve(
        Arguments.createMap().apply {
          putBoolean("active", false)
          putBoolean("supportsContinuedBackground", false)
          putString("mode", "none")
        },
      )
    }
  }

  @ReactMethod
  fun updateProgress(input: ReadableMap, promise: Promise) {
    if (!active) {
      promise.resolve(null)
      return
    }
    val context = reactApplicationContext
    val title = input.getString("title") ?: "Chessticize"
    val subtitle = input.getString("subtitle") ?: ""
    val completedUnits = if (input.hasKey("completedUnits")) input.getInt("completedUnits") else 0
    val totalUnits = if (input.hasKey("totalUnits")) input.getInt("totalUnits") else 0

    try {
      val notification = BatchAnalysisNotificationHelper.buildProgressNotification(
        context = context,
        title = title,
        subtitle = subtitle,
        completedUnits = completedUnits,
        totalUnits = totalUnits,
        pauseLabel = pauseLabel,
        cancelLabel = cancelLabel,
      )
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(BatchAnalysisNotificationContract.NOTIFICATION_ID_PROGRESS, notification)
    } catch (_: Throwable) {
      // Non-fatal progress update failure.
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun finish(input: ReadableMap, promise: Promise) {
    val context = reactApplicationContext
    stopServiceInternal(context)
    val notifyIfBackgrounded =
      input.hasKey("notifyIfBackgrounded") && input.getBoolean("notifyIfBackgrounded")
    if (notifyIfBackgrounded && !BatchAnalysisNotificationHelper.isAppInForeground(context)) {
      val title = input.getString("title") ?: "Chessticize"
      val body = input.getString("body") ?: ""
      if (body.isNotBlank()) {
        BatchAnalysisNotificationHelper.postCompletionNotification(context, title, body)
      }
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    stopServiceInternal(reactApplicationContext)
    promise.resolve(null)
  }

  private fun stopServiceInternal(context: Context) {
    active = false
    try {
      context.stopService(Intent(context, BatchAnalysisForegroundService::class.java))
    } catch (_: Throwable) {
      // Ignore if service was not running.
    }
  }
}

class BackgroundBatchAnalysisPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(BackgroundBatchAnalysisModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
