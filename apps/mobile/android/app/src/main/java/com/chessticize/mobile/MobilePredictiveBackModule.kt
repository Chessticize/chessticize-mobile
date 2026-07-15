package com.chessticize.mobile

import android.app.Activity
import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager

internal interface MobilePredictiveBackEventSink {
  fun emit(phase: String, progress: Double? = null, edge: String? = null)
}

internal interface MobilePredictiveBackPlatformDelegate {
  fun register(activity: Activity?)
  fun unregister()
}

/**
 * API-34 gesture telemetry plus a boolean platform-ownership switch. Product
 * destinations, previews, cancellation, and commits remain in the typed
 * TypeScript shell.
 */
class MobilePredictiveBackModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private var enabledRequested = false
  private var api34Delegate: MobilePredictiveBackPlatformDelegate? = null
  private val eventSink = object : MobilePredictiveBackEventSink {
    override fun emit(phase: String, progress: Double?, edge: String?) {
      emitToJavaScript(phase, progress, edge)
    }
  }

  init {
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
      reactApplicationContext.runOnUiQueueThread { api34Delegate?.unregister() }
    }
  }

  override fun invalidate() {
    enabledRequested = false
    reactApplicationContext.removeLifecycleEventListener(this)
    reactApplicationContext.runOnUiQueueThread {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        api34Delegate?.unregister()
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
        getOrCreateApi34Delegate().register(activity)
      }
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      api34Delegate?.unregister()
    }
    (activity as? ReactNativeBackCallbackController)
      ?.setReactNativeBackHandlingEnabled(false)
  }

  private fun getOrCreateApi34Delegate(): MobilePredictiveBackPlatformDelegate {
    val existingDelegate = api34Delegate
    if (existingDelegate != null) {
      return existingDelegate
    }
    check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    val delegate = Class.forName(API34_DELEGATE_CLASS)
      .getDeclaredConstructor(MobilePredictiveBackEventSink::class.java)
      .newInstance(eventSink) as MobilePredictiveBackPlatformDelegate
    api34Delegate = delegate
    return delegate
  }

  private fun emitToJavaScript(phase: String, progress: Double?, edge: String?) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }
    val event = Arguments.createMap().apply {
      putString("phase", phase)
      if (progress != null) {
        putDouble("progress", progress)
      }
      if (edge != null) {
        putString("edge", edge)
      }
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("mobilePredictiveBack", event)
  }

  private companion object {
    const val API34_DELEGATE_CLASS =
      "com.chessticize.mobile.MobilePredictiveBackApi34Delegate"
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
