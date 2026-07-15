package com.chessticize.mobile

import android.app.Activity
import android.os.Build
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.annotation.RequiresApi
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager

/**
 * API-34 gesture telemetry only. Product destinations, interception policy,
 * previews, cancellation, and commits remain in the typed TypeScript shell.
 */
class MobilePredictiveBackModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private var enabledRequested = false
  private var registeredActivity: Activity? = null
  private var registeredCallback: OnBackInvokedCallback? = null

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "MobilePredictiveBack"

  @ReactMethod
  fun setEnabled(enabled: Boolean) {
    enabledRequested = enabled
    reactApplicationContext.runOnUiQueueThread {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        return@runOnUiQueueThread
      }
      if (enabledRequested) {
        register(currentActivity)
      } else {
        unregister()
      }
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  override fun onHostResume() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && enabledRequested) {
      reactApplicationContext.runOnUiQueueThread { register(currentActivity) }
    }
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      reactApplicationContext.runOnUiQueueThread { unregister() }
    }
  }

  override fun invalidate() {
    enabledRequested = false
    reactApplicationContext.removeLifecycleEventListener(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      reactApplicationContext.runOnUiQueueThread { unregister() }
    }
    super.invalidate()
  }

  @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
  private fun register(activity: Activity?) {
    if (activity == null) {
      return
    }
    if (registeredActivity === activity && registeredCallback != null) {
      return
    }
    unregister()
    val callback = object : OnBackAnimationCallback {
      override fun onBackStarted(backEvent: BackEvent) {
        emit("started", backEvent)
      }

      override fun onBackProgressed(backEvent: BackEvent) {
        emit("progressed", backEvent)
      }

      override fun onBackCancelled() {
        emit("cancelled")
      }

      override fun onBackInvoked() {
        emit("invoked")
      }
    }
    activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
      OnBackInvokedDispatcher.PRIORITY_DEFAULT,
      callback,
    )
    registeredActivity = activity
    registeredCallback = callback
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun unregister() {
    val activity = registeredActivity
    val callback = registeredCallback
    if (activity != null && callback != null) {
      activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
    }
    registeredActivity = null
    registeredCallback = null
  }

  private fun emit(phase: String, backEvent: BackEvent? = null) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }
    val event = Arguments.createMap().apply {
      putString("phase", phase)
      if (backEvent != null) {
        putDouble("progress", backEvent.progress.toDouble())
        putString("edge", if (backEvent.swipeEdge == BackEvent.EDGE_RIGHT) "right" else "left")
      }
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("mobilePredictiveBack", event)
  }
}

class MobilePredictiveBackPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(MobilePredictiveBackModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
