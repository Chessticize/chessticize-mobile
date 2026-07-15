package com.chessticize.mobile

import android.app.Activity
import android.os.Build
import android.util.Log
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
 * API-34 gesture telemetry plus a boolean platform-ownership switch. Product
 * destinations, previews, cancellation, and commits remain in the typed
 * TypeScript shell.
 */
class MobilePredictiveBackModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private var enabledRequested = false
  private var registeredActivity: Activity? = null
  private var registeredCallback: OnBackInvokedCallback? = null
  private var registrationGeneration = 0

  init {
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX predictive-module-init")
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = "MobilePredictiveBack"

  @ReactMethod
  fun setEnabled(enabled: Boolean) {
    enabledRequested = enabled
    reactApplicationContext.runOnUiQueueThread {
      updatePlatformBackRegistration()
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  override fun onHostResume() {
    reactApplicationContext.runOnUiQueueThread { updatePlatformBackRegistration() }
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
    reactApplicationContext.runOnUiQueueThread {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        unregister()
      }
      (reactApplicationContext.currentActivity as? ReactNativeBackCallbackController)
        ?.setReactNativeBackHandlingEnabled(true)
    }
    super.invalidate()
  }

  private fun updatePlatformBackRegistration() {
    val activity = reactApplicationContext.currentActivity
    if (enabledRequested) {
      (activity as? ReactNativeBackCallbackController)
        ?.setReactNativeBackHandlingEnabled(false)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        register(activity)
      }
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      unregister()
    }
    (activity as? ReactNativeBackCallbackController)
      ?.setReactNativeBackHandlingEnabled(false)
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
    registrationGeneration += 1
    val registrationId = registrationGeneration
    var loggedProgress = false
    val callback = object : OnBackAnimationCallback {
      override fun onBackStarted(backEvent: BackEvent) {
        Log.i(TAG, "$DEBUG_PREFIX callback-entry phase=started registration=$registrationId")
        emit("started", backEvent)
      }

      override fun onBackProgressed(backEvent: BackEvent) {
        if (!loggedProgress) {
          loggedProgress = true
          Log.i(TAG, "$DEBUG_PREFIX callback-entry phase=progressed registration=$registrationId")
        }
        emit("progressed", backEvent)
      }

      override fun onBackCancelled() {
        Log.i(TAG, "$DEBUG_PREFIX callback-entry phase=cancelled registration=$registrationId")
        emit("cancelled")
      }

      override fun onBackInvoked() {
        Log.i(TAG, "$DEBUG_PREFIX callback-entry phase=invoked registration=$registrationId")
        emit("invoked")
      }
    }
    activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
      OnBackInvokedDispatcher.PRIORITY_DEFAULT,
      callback,
    )
    registeredActivity = activity
    registeredCallback = callback
    Log.i(TAG, "$DEBUG_PREFIX registered registration=$registrationId")
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
    val active = reactApplicationContext.hasActiveReactInstance()
    Log.i(TAG, "$DEBUG_PREFIX emit-gate phase=$phase active=$active")
    if (!active) {
      return
    }
    val event = Arguments.createMap().apply {
      putString("phase", phase)
      if (backEvent != null) {
        putDouble("progress", backEvent.progress.toDouble())
        putString("edge", if (backEvent.swipeEdge == BackEvent.EDGE_RIGHT) "right" else "left")
      }
    }
    Log.i(TAG, "$DEBUG_PREFIX emitter-call phase=$phase")
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("mobilePredictiveBack", event)
  }

  private companion object {
    const val TAG = "ChessticizeMobileBack"
    const val DEBUG_PREFIX = "[DEBUG-pr201-back-native]"
    const val STARTUP_TAG = "ChessticizeStartup"
    const val STARTUP_PREFIX = "[DEBUG-pr201-api24-startup]"
  }
}

class MobilePredictiveBackPackage : ReactPackage {
  init {
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX predictive-package-init")
  }

  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> {
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX predictive-package-before-module")
    val module = MobilePredictiveBackModule(reactContext)
    Log.i(STARTUP_TAG, "$STARTUP_PREFIX predictive-package-after-module")
    return listOf(module)
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()

  private companion object {
    const val STARTUP_TAG = "ChessticizeStartup"
    const val STARTUP_PREFIX = "[DEBUG-pr201-api24-startup]"
  }
}
