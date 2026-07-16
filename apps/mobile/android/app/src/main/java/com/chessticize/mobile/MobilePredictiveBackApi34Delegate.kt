package com.chessticize.mobile

import android.app.Activity
import android.os.Build
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.annotation.Keep
import androidx.annotation.RequiresApi

@Keep
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
internal class MobilePredictiveBackApi34Delegate(
  private val eventSink: MobilePredictiveBackEventSink,
) : MobilePredictiveBackPlatformDelegate {
  private var registeredActivity: Activity? = null
  private var registeredCallback: OnBackInvokedCallback? = null

  override fun register(activity: Activity?) {
    if (activity == null) {
      return
    }
    if (registeredActivity === activity && registeredCallback != null) {
      return
    }
    unregister()
    val callback = object : OnBackAnimationCallback {
      override fun onBackStarted(backEvent: BackEvent) {
        eventSink.emit("started", backEvent.progress.toDouble(), edgeFor(backEvent))
      }

      override fun onBackProgressed(backEvent: BackEvent) {
        eventSink.emit("progressed", backEvent.progress.toDouble(), edgeFor(backEvent))
      }

      override fun onBackCancelled() {
        eventSink.emit("cancelled")
      }

      override fun onBackInvoked() {
        eventSink.emit("invoked")
      }
    }
    activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
      OnBackInvokedDispatcher.PRIORITY_DEFAULT,
      callback,
    )
    registeredActivity = activity
    registeredCallback = callback
  }

  override fun unregister() {
    val activity = registeredActivity
    val callback = registeredCallback
    if (activity != null && callback != null) {
      activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
    }
    registeredActivity = null
    registeredCallback = null
  }

  private fun edgeFor(backEvent: BackEvent): String =
    if (backEvent.swipeEdge == BackEvent.EDGE_RIGHT) "right" else "left"
}
